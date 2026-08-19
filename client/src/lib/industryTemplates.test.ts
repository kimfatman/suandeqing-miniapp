import { describe, expect, it } from "vitest";
import { applyIndustryTemplate, applyIndustryTemplateOverrides, createEmptyLedger, normalizeLedger } from "./ledgerStore";
import { createIndustryTemplateRegistry, DEFAULT_INDUSTRY_KEY, getDefaultTemplate, getTemplate, getTemplateCapabilities, IndustryCapabilitiesSchema, IndustryTemplateSchema, INDUSTRY_TEMPLATE_VERSION, listTemplates, OFFICIAL_INDUSTRY_TEMPLATES, resolveIndustryTemplate, resolveTemplateAtVersion } from "./industryTemplates";

describe("versioned industry templates", () => {
  it("registers the requested first-wave industries with a versioned schema", () => {
    expect(INDUSTRY_TEMPLATE_VERSION).toBe(1);
    expect(Object.keys(OFFICIAL_INDUSTRY_TEMPLATES)).toEqual(expect.arrayContaining(["catering", "retail", "ecommerce", "beauty", "stall"]));
    expect(OFFICIAL_INDUSTRY_TEMPLATES.ecommerce.version).toBe(1);
    expect(OFFICIAL_INDUSTRY_TEMPLATES.beauty.businessItemName).toBe("服务项目");
  });

  it("conforms every official registration to the shared schema, stable id, status and complete capability matrix", () => {
    const registrations = listTemplates();
    expect(registrations.map((template) => template.id)).toEqual(["restaurant", "retail", "ecommerce", "beauty", "vendor", "handmade"]);
    expect(new Set(registrations.map((template) => `${template.id}@${template.version}`)).size).toBe(registrations.length);

    registrations.forEach((template) => {
      expect(template.status).toBe("active");
      expect(template.schema.safeParse(template.defaultConfig).success).toBe(true);
      expect(Object.keys(template.capabilities).sort()).toEqual(Object.keys(IndustryCapabilitiesSchema.shape).sort());
      expect(Object.values(template.capabilities).every((value) => typeof value === "boolean")).toBe(true);
    });
  });

  it("finds a template by stable id and version, lists defaults, and makes unknown templates explicit", () => {
    const restaurant = getTemplate("restaurant", 1);
    expect(restaurant?.defaultConfig.key).toBe("catering");
    expect(getDefaultTemplate("vendor")?.defaultConfig.key).toBe("stall");
    expect(getTemplateCapabilities("vendor", 1)).toMatchObject({ bom: false, monthlyAllocation: false, inventory: true, purchasing: true, sales: true, refunds: true, cash: true });
    expect(getTemplate("not-a-template")).toBeNull();
    expect(getTemplateCapabilities("not-a-template")).toBeNull();
    expect(resolveTemplateAtVersion("restaurant", 2)).toBeNull();
  });

  it("supports coexisting template versions in a registry without changing the old version", () => {
    const restaurantV1 = getTemplate("restaurant", 1)!;
    const restaurantV2 = {
      ...restaurantV1,
      version: 2,
      status: "deprecated" as const,
      defaultConfig: { ...restaurantV1.defaultConfig, version: 2, label: "餐饮饮品二版" },
      capabilities: restaurantV1.capabilities,
    };
    const registry = createIndustryTemplateRegistry([restaurantV1, restaurantV2]);

    expect(registry.getTemplate("restaurant", 1)?.defaultConfig.label).toBe("餐饮饮品");
    expect(registry.getTemplate("restaurant", 2)?.defaultConfig.label).toBe("餐饮饮品二版");
    expect(registry.getDefaultTemplate("restaurant")?.version).toBe(1);
  });

  it("keeps the merchant template focused on purchase, margin, loss, inventory and cash without BOM", () => {
    const merchant = resolveIndustryTemplate("stall");
    expect(merchant.capabilities).toMatchObject({ bom: false, purchaseTracking: true, lossTracking: true, inventory: true, cashOperations: true, monthlyAllocation: false });
    expect(merchant.homeMetricOrder).toEqual(["grossProfit", "cashBalance", "salesRevenue", "inventoryHealth", "lossRate"]);
    expect(merchant.categories).toEqual(expect.arrayContaining(["进货成本", "货品损耗", "摊位费用"]));
  });

  it("declares the PR #3 core capability expectations for all six registered industries", () => {
    expect(getTemplateCapabilities("restaurant")).toMatchObject({ bom: true, monthlyAllocation: true, inventory: true, purchasing: true, sales: true, refunds: true, cash: true });
    expect(getTemplateCapabilities("retail")).toMatchObject({ bom: false, inventory: true, purchasing: true, sales: true, refunds: true, cash: true });
    expect(getTemplateCapabilities("ecommerce")).toMatchObject({ inventory: true, sales: true, refunds: true, customers: true, cash: true });
    expect(getTemplateCapabilities("beauty")).toMatchObject({ sales: true, refunds: true, customers: true, cash: true, appointmentTracking: true });
    expect(getTemplateCapabilities("vendor")).toMatchObject({ bom: false, monthlyAllocation: false, inventory: true, purchasing: true, sales: true, refunds: true, cash: true });
    expect(getTemplateCapabilities("handmade")).toMatchObject({ bom: true, production: true, inventory: true, purchasing: true, sales: true, refunds: true, cash: true });
  });

  it("resolves personal additions on a new object and never changes the frozen official template", () => {
    const before = [...OFFICIAL_INDUSTRY_TEMPLATES.retail.categories];
    const personalized = resolveIndustryTemplate("retail", {
      name: "我的社区店",
      categoryAdditions: ["直播带货"],
      capabilityOverrides: { platformFees: false },
      homeMetricOrder: ["inventoryHealth", "grossProfit"],
    });
    personalized.categories.push("临时分类");

    expect(OFFICIAL_INDUSTRY_TEMPLATES.retail.categories).toEqual(before);
    expect(personalized.name).toBe("我的社区店");
    expect(personalized.capabilities.platformFees).toBe(false);
    expect(personalized.homeMetricOrder).toEqual(["inventoryHealth", "grossProfit"]);
    expect(personalized.categories).toEqual(expect.arrayContaining(["直播带货", "临时分类"]));
    expect(IndustryTemplateSchema.safeParse(personalized).success).toBe(true);
  });

  it("keeps resolver override behavior unified and ignores unknown override fields under the existing schema policy", () => {
    const resolved = resolveIndustryTemplate("ecommerce", { name: "我的小店", unknownFutureField: "ignored" } as unknown as Parameters<typeof resolveIndustryTemplate>[1]);
    expect(resolved.name).toBe("我的小店");
    expect(resolved).not.toHaveProperty("unknownFutureField");
    expect(resolved.capabilities).toMatchObject({ customers: true, inventory: true, sales: true, refunds: true, cash: true });
  });

  it("preserves the existing unselected-industry default and migrates old ledgers to a template version", () => {
    const empty = createEmptyLedger();
    expect(empty.profile.industry).toBe(DEFAULT_INDUSTRY_KEY);
    expect(empty.profile.industryTemplateVersion).toBe(INDUSTRY_TEMPLATE_VERSION);

    const legacy = { ...empty, profile: { storeName: "旧账本", industry: "catering" as const, onboarded: true, monthlyBudget: 0 } };
    const normalized = normalizeLedger(legacy);
    expect(normalized.profile.industry).toBe("catering");
    expect(normalized.profile.industryTemplateVersion).toBe(INDUSTRY_TEMPLATE_VERSION);
    expect(normalized.categories).toEqual(empty.categories);
  });

  it("keeps user categories when switching templates and stores user overrides separately from the official template", () => {
    const ledger = createEmptyLedger();
    const withCustomCategory = { ...ledger, categories: [...ledger.categories, "我的特殊费用"], categoryStatus: { ...ledger.categoryStatus, 我的特殊费用: true } };
    const merchant = applyIndustryTemplate(withCustomCategory, "stall");
    const personalized = applyIndustryTemplateOverrides(merchant, { categoryAdditions: ["夜市推广"], businessItemName: "我的货品" });

    expect(merchant.categories).toEqual(expect.arrayContaining(["进货成本", "我的特殊费用"]));
    expect(personalized.profile.industryTemplateOverrides).toEqual({ categoryAdditions: ["夜市推广"], businessItemName: "我的货品" });
    expect(personalized.categories).toEqual(expect.arrayContaining(["夜市推广", "我的特殊费用"]));
    expect(OFFICIAL_INDUSTRY_TEMPLATES.stall.categories).not.toContain("夜市推广");
  });
});
