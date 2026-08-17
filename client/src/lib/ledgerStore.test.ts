import { describe, expect, it } from "vitest";
import { seedLedger, summarizeLedger } from "./ledgerStore";

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
});
