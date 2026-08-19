import { describe, expect, it } from "vitest";
import { applyIndustryTemplate, applyIndustryTemplateOverrides, createEmptyLedger, normalizeLedger } from "./ledgerStore";
import { DEFAULT_INDUSTRY_KEY, INDUSTRY_TEMPLATE_VERSION, OFFICIAL_INDUSTRY_TEMPLATES, resolveIndustryTemplate } from "./industryTemplates";

describe("versioned industry templates", () => {
  it("registers the requested first-wave industries with a versioned schema", () => {
    expect(INDUSTRY_TEMPLATE_VERSION).toBe(1);
    expect(Object.keys(OFFICIAL_INDUSTRY_TEMPLATES)).toEqual(expect.arrayContaining(["catering", "retail", "ecommerce", "beauty", "stall"]));
    expect(OFFICIAL_INDUSTRY_TEMPLATES.ecommerce.version).toBe(1);
    expect(OFFICIAL_INDUSTRY_TEMPLATES.beauty.businessItemName).toBe("服务项目");
  });

  it("keeps the merchant template focused on purchase, margin, loss, inventory and cash without BOM", () => {
    const merchant = resolveIndustryTemplate("stall");
    expect(merchant.capabilities).toMatchObject({ bom: false, purchaseTracking: true, lossTracking: true, inventory: true, cashOperations: true, monthlyAllocation: false });
    expect(merchant.homeMetricOrder).toEqual(["grossProfit", "cashBalance", "salesRevenue", "inventoryHealth", "lossRate"]);
    expect(merchant.categories).toEqual(expect.arrayContaining(["进货成本", "货品损耗", "摊位费用"]));
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
