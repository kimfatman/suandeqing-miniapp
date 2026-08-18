import { describe, expect, it } from "vitest";
import { applyIndustryTemplate, applyQuickCost, calculateBomVersionDirectCost, calculateDirectCost, calculateUnitCost, getActiveCategories, getIndustrySampleData, INDUSTRY_TEMPLATES, initializeIndustryLedger, makeBomVersionSnapshot, normalizeLedger, renameLedgerCategory, seedLedger, summarizeLedger, summarizeSales } from "./ledgerStore";
import { getReadiness } from "@/pages/Home";

describe("summarizeLedger", () => {
  it("aggregates income, expenses, result, counts and categories from ledger records", () => {
    const ledger = seedLedger();
    ledger.records = [
      { id: "income-1", type: "income", amount: 1000, category: "销售收入", note: "", date: "2026-08-17" },
      { id: "expense-1", type: "expense", amount: 240, category: "食材采购", note: "", date: "2026-08-17" },
      { id: "expense-2", type: "expense", amount: 60, category: "配送交通", note: "", date: "2026-08-16" },
      { id: "interest-1", type: "expense", amount: 20, category: "借款利息", note: "", date: "2026-08-17" },
      { id: "principal-1", type: "expense", amount: 100, category: "本金还款", note: "", date: "2026-08-17" },
    ];

    const summary = summarizeLedger(ledger);

    expect(summary.income).toBe(1000);
    expect(summary.expenses).toBe(320);
    expect(summary.cashOutflow).toBe(420);
    expect(summary.financingCosts).toBe(20);
    expect(summary.principalRepayment).toBe(100);
    expect(summary.result).toBe(680);
    expect(summary.operatingResult).toBe(680);
    expect(summary.cashBalance).toBe(580);
    expect(summary.incomeCount).toBe(1);
    expect(summary.expenseCount).toBe(4);
    expect(summary.categoryTotals["食材采购"]).toBe(240);
    expect(summary.categoryTotals["配送交通"]).toBe(60);
    expect(summary.categoryTotals["借款利息"]).toBe(20);
    expect(summary.categoryTotals["本金还款"]).toBe(100);
    expect(summary.dailySeries).toEqual([
      { label: "08/16", income: 0, expenses: 60 },
      { label: "08/17", income: 1000, expenses: 260 },
    ]);
  });

  it("separates cash balance from operating result when principal repayment exists", () => {
    const ledger = seedLedger();
    ledger.records = [
      { id: "income-1", type: "income", amount: 1000, category: "销售收入", note: "", date: "2026-08-17" },
      { id: "principal-1", type: "expense", amount: 100, category: "本金还款", note: "", date: "2026-08-17" },
    ];
    const summary = summarizeLedger(ledger);
    expect(summary.operatingResult).toBe(1000);
    expect(summary.cashBalance).toBe(900);
  });

  it("filters cash flow, counts, charts and sales by the same selected period", () => {
    const ledger = seedLedger();
    ledger.records = [
      { id: "july-income", type: "income", amount: 900, category: "销售收入", note: "", date: "2026-07-31" },
      { id: "aug-income", type: "income", amount: 120, category: "销售收入", note: "", date: "2026-08-02" },
      { id: "aug-expense", type: "expense", amount: 20, category: "食材采购", note: "", date: "2026-08-02" },
    ];
    ledger.sales = [
      { id: "july-sale", productId: 1, quantity: 3, unitPrice: 10, date: "2026-07-31", note: "", unitDirectCostSnapshot: 4, costPeriod: "2026-07" },
      { id: "aug-sale", productId: 1, quantity: 2, unitPrice: 10, date: "2026-08-02", note: "", unitDirectCostSnapshot: 4, costPeriod: "2026-08" },
    ];
    const august = summarizeLedger(ledger, "2026-08");
    expect(august).toMatchObject({ income: 120, expenses: 20, cashBalance: 100, incomeCount: 1, expenseCount: 1, salesCount: 1, salesRevenue: 20, costOfSales: 8 });
    expect(august.dailySeries).toEqual([{ label: "08/02", income: 120, expenses: 20 }]);
    expect(summarizeLedger(ledger, "2026-07")).toMatchObject({ income: 900, salesCount: 1, salesRevenue: 30, costOfSales: 12 });
  });
});

describe("unit cost and BOM normalization", () => {
  it("converts purchase units to usage-unit cost and rejects non-positive inputs", () => {
    expect(calculateUnitCost(120, 1, 1000)).toBe(0.12);
    expect(Number.isNaN(calculateUnitCost(120, 0, 1000))).toBe(true);
    expect(Number.isNaN(calculateUnitCost(120, 1, 0))).toBe(true);
  });

  it("recalculates seeded BOM products from materials instead of stale seed totals", () => {
    const ledger = normalizeLedger(seedLedger());
    const product = ledger.products[0];
    expect(calculateDirectCost(product, ledger.materials)).toBe(4.55);
    expect(product.direct).toBe(4.55);
    expect(product.operating).toBe(6.77);
  });

  it("applies loss rate and batch yield to direct cost", () => {
    const ledger = seedLedger();
    const product = { ...ledger.products[0], lossRate: 10, batchYield: 2 };
    expect(calculateDirectCost(product, ledger.materials)).toBe(2.99);
  });

  it("includes custom cost details in product cost and historical snapshots", () => {
    const ledger = seedLedger();
    const product = { ...ledger.products[0], bom: [{ id: "custom-1", materialId: "", quantity: 2, customName: "平台服务费", customUnit: "单", customUnitCost: 1.5 }] };
    expect(calculateDirectCost(product, ledger.materials)).toBe(4.08);
    const version = makeBomVersionSnapshot(product, ledger.materials, { lossRate: 0, batchYield: 1 }, "2026-08-18");
    ledger.materials[0].unitCost = 99;
    expect(calculateBomVersionDirectCost(version)).toBe(4.08);
  });
});

describe("home readiness", () => {
  it("guides an empty ledger to record the first real expense before showing other actions", () => {
    const ledger = initializeIndustryLedger(seedLedger(), "测试小店", "retail");
    const readiness = getReadiness(ledger, summarizeLedger(ledger), "进货明细");
    expect(readiness).toMatchObject({ stage: "record", actionLabel: "记一笔支出" });
  });

  it("moves from product cost completion to sales recording instead of treating cash as profit", () => {
    const ledger = seedLedger();
    ledger.records = [{ id: "expense-1", type: "expense", amount: 50, category: "食材采购", note: "采购", date: "2026-08-18" }];
    const readiness = getReadiness(ledger, summarizeLedger(ledger), "商品配方");
    expect(readiness).toMatchObject({ stage: "sale", actionLabel: "记录第一笔销售" });
  });

  it("requires a positive product price before guiding a merchant to sales transfer", () => {
    const ledger = seedLedger();
    ledger.products = [{ ...ledger.products[0], price: 0 }];
    ledger.records = [{ id: "expense-1", type: "expense", amount: 50, category: "食材采购", note: "采购", date: "2026-08-18" }];
    const readiness = getReadiness(ledger, summarizeLedger(ledger), "商品配方");
    expect(readiness).toMatchObject({ stage: "pricing", actionLabel: "设置售价" });
  });
});

describe("summarizeSales", () => {
  it("keeps historical sale cost stable and filters by allocation period", () => {
    const ledger = normalizeLedger(seedLedger());
    ledger.costs.allocationPeriod = "2026-08";
    ledger.sales = [{ id: "sale-1", productId: 1, quantity: 1, unitPrice: 12, date: "2026-07-31", note: "", unitDirectCostSnapshot: 4.55, costPeriod: "2026-07" }, { id: "sale-2", productId: 1, quantity: 1, unitPrice: 12, date: "2026-08-17", note: "", unitDirectCostSnapshot: 4.55, costPeriod: "2026-08" }];
    ledger.materials[0].unitCost = 9;
    const summary = summarizeSales(ledger);
    expect(summary.salesCount).toBe(1);
    expect(summary.costOfSales).toBe(4.55);
  });

  it("bridges sale quantity to cost of sales and deduplicates ledger financing cost", () => {
    const ledger = normalizeLedger(seedLedger());
    ledger.sales = [{ id: "sale-1", productId: 1, quantity: 2, unitPrice: 12, date: "2026-08-17", note: "" }];
    ledger.records = [{ id: "interest", type: "expense", amount: 20, category: "借款利息", note: "", date: "2026-08-17" }];
    ledger.costs.fundingSource = "ledger";
    const summary = summarizeSales(ledger);
    expect(summary.salesRevenue).toBe(24);
    expect(summary.costOfSales).toBe(9.1);
    expect(summary.allocatedIndirectCosts).toBe(4.44);
    expect(summary.operatingResult).toBeCloseTo(-9.54, 2);

    ledger.costs.hiddenCostBasis = "perSale";
    expect(summarizeSales(ledger).allocatedIndirectCosts).toBe(3.14);

    ledger.costs.hiddenCostSource = "ledger";
    ledger.costs.hiddenCostCategory = "交通配送";
    ledger.records.push({ id: "delivery", type: "expense", amount: 8, category: "交通配送", note: "", date: "2026-08-17" });
    expect(summarizeSales(ledger).allocatedIndirectCosts).toBe(9.84);
  });
});

describe("industry templates", () => {
  it("uses industry-specific product cost language", () => {
    expect(INDUSTRY_TEMPLATES.find((item) => item.key === "catering")?.productCostAction).toBe("编辑配方");
    expect(INDUSTRY_TEMPLATES.find((item) => item.key === "retail")?.productCostAction).toBe("编辑进货明细");
    expect(INDUSTRY_TEMPLATES.find((item) => item.key === "stall")?.productCostAction).toBe("编辑货品成本");
    expect(INDUSTRY_TEMPLATES.find((item) => item.key === "handmade")?.productCostAction).toBe("编辑制作成本");
    expect(INDUSTRY_TEMPLATES.some((item) => item.productCostAction.includes("BOM"))).toBe(false);
  });

  it("provides products and materials for every industry", () => {
    (["catering", "retail", "stall", "handmade"] as const).forEach((industry) => {
      const sample = getIndustrySampleData(industry);
      expect(sample.materials.length).toBeGreaterThanOrEqual(3);
      expect(sample.products.length).toBeGreaterThanOrEqual(2);
      expect(sample.products.every((product) => product.name && product.bom.every((item) => sample.materials.some((material) => material.id === item.materialId)))).toBe(true);
    });
  });

  it("keeps sample data in preview and starts formal onboarding empty", () => {
    const preview = getIndustrySampleData("retail");
    expect(preview.materials.map((material) => material.name)).toContain("瓶装饮用水");
    expect(preview.products.map((product) => product.name)).toContain("矿泉水");
    const firstLedger = initializeIndustryLedger(seedLedger(), "社区便利店", "retail");
    expect(firstLedger.materials).toEqual([]);
    expect(firstLedger.products).toEqual([]);
    expect(firstLedger.records).toEqual([]);
    expect(firstLedger.sales).toEqual([]);

    const base = seedLedger();
    const existing = { ...base, profile: { ...base.profile, onboarded: true }, materials: [{ id: "custom-mat", name: "我的材料", unit: "个", unitCost: 2, source: "我的供应商" }], products: [{ ...base.products[0], name: "我的商品" }], records: [{ id: "custom-record", type: "expense" as const, amount: 88, category: "我的分类", note: "我的流水", date: "2026-08-17" }] };
    const switched = initializeIndustryLedger(existing, "我的小店", "retail");
    expect(switched.materials[0].name).toBe("我的材料");
    expect(switched.products[0].name).toBe("我的商品");
    expect(switched.records).toEqual(existing.records);
  });

  it("initializes a retail ledger after onboarding", () => {
    const next = initializeIndustryLedger(seedLedger(), "社区便利店", "retail");
    expect(next.profile).toMatchObject({ storeName: "社区便利店", industry: "retail", onboarded: true });
    expect(next.categories[0]).toBe("货品采购");
    expect(next.costs.hiddenCostCategory).toBe("物流配送");
  });

  it("keeps custom category status while switching industries and excludes disabled categories from new entry choices", () => {
    const ledger = seedLedger();
    ledger.categories = [...ledger.categories, "设备折旧"];
    ledger.categoryStatus = { ...ledger.categoryStatus, "设备折旧": false };
    const next = applyIndustryTemplate(ledger, "retail");
    expect(next.categories).toContain("设备折旧");
    expect(next.categoryStatus?.["设备折旧"]).toBe(false);
    expect(getActiveCategories(next)).not.toContain("设备折旧");
    next.records = [{ id: "history", type: "expense", amount: 50, category: "设备折旧", note: "历史折旧", date: "2026-08-17" }];
    expect(summarizeLedger(next).categoryTotals["设备折旧"]).toBe(50);
  });

  it("renames custom categories without losing historical linkage", () => {
    const ledger = seedLedger();
    ledger.categories = [...ledger.categories, "设备折旧"];
    ledger.categoryStatus = { ...ledger.categoryStatus, "设备折旧": false };
    ledger.costs.hiddenCostCategory = "设备折旧";
    ledger.records = [{ id: "history", type: "expense", amount: 50, category: "设备折旧", note: "历史折旧", date: "2026-08-17" }];
    const renamed = renameLedgerCategory(ledger, "设备折旧", "设备折旧与维护");
    expect(renamed.categories).toContain("设备折旧与维护");
    expect(renamed.categoryStatus?.["设备折旧与维护"]).toBe(false);
    expect(renamed.records[0].category).toBe("设备折旧与维护");
    expect(renamed.costs.hiddenCostCategory).toBe("设备折旧与维护");
  });

  it("switches categories without deleting existing business records", () => {
    const ledger = seedLedger();
    const next = applyIndustryTemplate(ledger, "retail");
    expect(next.profile.industry).toBe("retail");
    expect(next.categories).toEqual(["货品采购", "物流配送", "促销让利", "摊位房租", "平台服务"]);
    expect(next.costs.hiddenCostCategory).toBe("物流配送");
    expect(INDUSTRY_TEMPLATES.find((item) => item.key === "retail")?.hiddenCostDescription).toContain("补货配送");
    expect(INDUSTRY_TEMPLATES.find((item) => item.key === "retail")?.fundingCostDescription).toContain("进货周转");
    expect(next.records).toHaveLength(ledger.records.length);
    expect(next.products).toHaveLength(ledger.products.length);
  });
});

describe("makeBomVersionSnapshot", () => {
  it("stores material prices and complete direct cost inputs", () => {
    const ledger = seedLedger();
    const version = makeBomVersionSnapshot(ledger.products[0], ledger.materials, { lossRate: 10, batchYield: 2 }, "2026-08-17");
    expect(version.materialUnitCosts["mat-tea"]).toBe(0.036);
    expect(version.packaging).toBe(0.48);
    expect(version.directLabor).toBe(0.6);
    expect(version.directCost).toBe(2.99);
    ledger.materials[0].unitCost = 9;
    const restoredProduct = { ...ledger.products[0], bom: version.items, lossRate: version.lossRate, batchYield: version.batchYield, materialUnitCosts: version.materialUnitCosts, packaging: version.packaging, directLabor: version.directLabor };
    expect(calculateDirectCost(restoredProduct, ledger.materials)).toBe(version.directCost);
  });

  it("keeps quick primary and secondary costs as a single traceable direct-cost version", () => {
    const ledger = seedLedger();
    const product = { ...ledger.products[0], packaging: 0, directLabor: 0, bom: [
      { id: "quick-primary", materialId: "", quantity: 1, customName: "进货价", customUnit: "件", customUnitCost: 6.5, presetId: "quick-primary" as const },
      { id: "quick-secondary", materialId: "", quantity: 1, customName: "单件配送费", customUnit: "件", customUnitCost: 0.8, presetId: "quick-secondary" as const },
    ] };
    const version = makeBomVersionSnapshot(product, ledger.materials, { lossRate: 0, batchYield: 1 }, "2026-08-18");
    expect(calculateDirectCost(product, ledger.materials)).toBe(7.3);
    expect(version.directCost).toBe(7.3);
    expect(calculateBomVersionDirectCost(version)).toBe(7.3);
    expect(version.items.map((item) => item.presetId)).toEqual(["quick-primary", "quick-secondary"]);
  });

  it("backs up advanced details before a quick-cost update without changing prior sales snapshots", () => {
    const ledger = seedLedger();
    const advancedProduct = { ...ledger.products[0], bomVersions: [] };
    ledger.products = [advancedProduct];
    ledger.sales = [{ id: "sale-before-quick", productId: advancedProduct.id, quantity: 2, unitPrice: 12, date: "2026-08-17", note: "", costVersionId: "advanced-sale-version", unitDirectCostSnapshot: 2.99, fixedCostSnapshot: 0, hiddenCostSnapshot: 0, fundingCostSnapshot: 0 }];
    const before = summarizeSales(ledger);
    const updated = applyQuickCost(advancedProduct, { items: [
      { id: "quick-primary", materialId: "", quantity: 1, customName: "食材成本", customUnit: "份", customUnitCost: 6.5, presetId: "quick-primary" },
    ], costCategory: "食材采购", lossRate: 0, batchYield: 1 }, ledger.materials, 0, 0, "2026-08-18");
    expect(updated.bomVersions).toHaveLength(2);
    expect(updated.bomVersions?.[0]).toMatchObject({ entryMode: "advanced", items: advancedProduct.bom, packaging: advancedProduct.packaging, directLabor: advancedProduct.directLabor });
    expect(updated.bomVersions?.[1].entryMode).toBe("quick");
    ledger.products = [updated];
    expect(ledger.sales[0]).toMatchObject({ costVersionId: "advanced-sale-version", unitDirectCostSnapshot: 2.99 });
    expect(summarizeSales(ledger).costOfSales).toBe(before.costOfSales);
  });
});
