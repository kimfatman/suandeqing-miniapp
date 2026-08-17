import { describe, expect, it } from "vitest";
import { initializeIndustryLedger, normalizeLedger, seedLedger, summarizeSales } from "./ledgerStore";

describe("accounting boundary safeguards", () => {
  it("starts a formal ledger without demo fixed, hidden, or funding costs", () => {
    const ledger = initializeIndustryLedger(seedLedger(), "社区便利店", "retail");
    expect(ledger.costs).toMatchObject({ fixedCost: 0, hiddenCost: 0, fundingCost: 0, hiddenCostSource: "manual", fundingSource: "manual" });
  });

  it("allocates ledger-sourced hidden cost and financing cost once per period, not once per sale", () => {
    const ledger = normalizeLedger(seedLedger());
    ledger.costs.hiddenCostSource = "ledger";
    ledger.costs.hiddenCostCategory = "交通配送";
    ledger.costs.fundingSource = "ledger";
    ledger.costs.fixedCost = 0;
    ledger.records = [
      { id: "delivery", type: "expense", amount: 100, category: "交通配送", note: "整月配送", date: "2026-08-17" },
      { id: "interest", type: "expense", amount: 20, category: "借款利息", note: "整月利息", date: "2026-08-17" },
    ];
    ledger.sales = [
      { id: "sale-1", productId: 1, quantity: 1, unitPrice: 12, date: "2026-08-17", note: "", hiddenCostSourceSnapshot: "ledger", fundingSourceSnapshot: "ledger" },
      { id: "sale-2", productId: 1, quantity: 1, unitPrice: 12, date: "2026-08-18", note: "", hiddenCostSourceSnapshot: "ledger", fundingSourceSnapshot: "ledger" },
    ];
    const summary = summarizeSales(ledger);
    expect(summary.allocatedIndirectCosts).toBe(100);
    expect(summary.financingCosts).toBe(20);
    expect(summary.operatingResult).toBeCloseTo(24 - 9.1 - 100 - 20, 2);
  });

  it("does not add ledger interest when a sale explicitly snapshots manual funding cost", () => {
    const ledger = normalizeLedger(seedLedger());
    ledger.costs.fundingSource = "ledger";
    ledger.records = [{ id: "interest", type: "expense", amount: 20, category: "借款利息", note: "", date: "2026-08-17" }];
    ledger.sales = [{ id: "sale-1", productId: 1, quantity: 2, unitPrice: 12, date: "2026-08-17", note: "", fundingCostSnapshot: 1, fundingSourceSnapshot: "manual" }];
    const summary = summarizeSales(ledger);
    expect(summary.financingCosts).toBe(2);
    expect(summary.operatingResult).toBeCloseTo(24 - 9.1 - 4.44 - 2, 2);
  });

  it("migrates legacy sale snapshots as manual sources so current settings cannot rewrite them", () => {
    const ledger = seedLedger();
    ledger.sales = [{ id: "legacy-sale", productId: 1, quantity: 1, unitPrice: 12, date: "2026-08-17", note: "", hiddenCostSnapshot: 1.3, fundingCostSnapshot: 0.28 }];
    const normalized = normalizeLedger(ledger);
    expect(normalized.sales[0]).toMatchObject({ hiddenCostSourceSnapshot: "manual", hiddenCostBasisSnapshot: "perUnit", fundingSourceSnapshot: "manual" });
  });
});
