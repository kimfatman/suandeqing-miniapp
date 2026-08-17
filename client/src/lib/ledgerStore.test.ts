import { describe, expect, it } from "vitest";
import { calculateDirectCost, calculateUnitCost, makeBomVersionSnapshot, normalizeLedger, seedLedger, summarizeLedger, summarizeSales } from "./ledgerStore";

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
});
