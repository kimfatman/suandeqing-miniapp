import { describe, expect, it } from "vitest";
import { seedLedger } from "./ledgerStore";
import { validateBomItems, validateMaterialDraft, validateSaleDraft } from "./validation";

describe("validateMaterialDraft", () => {
  it.each([
    ["", 36, 24, 1],
    ["鲜奶", 36, 0, 1],
    ["鲜奶", 36, -1, 1],
    ["鲜奶", 36, 24, 0],
    ["鲜奶", -1, 24, 1],
  ])("rejects invalid material draft %s/%s/%s/%s", (name, amount, quantity, conversionFactor) => {
    expect(validateMaterialDraft({ name, amount, quantity, conversionFactor })).toBeTruthy();
  });

  it("accepts a positive converted purchase", () => {
    expect(validateMaterialDraft({ name: "鲜奶", amount: 36, quantity: 2, conversionFactor: 1000 })).toBeNull();
  });

  it("accepts a same-unit purchase without requiring a separately entered conversion factor", () => {
    expect(validateMaterialDraft({ name: "矿泉水", amount: 24, quantity: 12, conversionFactor: Number.NaN, requiresConversion: false })).toBeNull();
  });
});

describe("validateBomItems", () => {
  const ledger = seedLedger();

  it("rejects empty, zero and negative quantities before save", () => {
    const base = { id: "bom-test", materialId: ledger.materials[0].id, quantity: 1 };
    expect(validateBomItems([{ ...base, quantity: 0 }], ledger.materials)).toBeTruthy();
    expect(validateBomItems([{ ...base, quantity: -1 }], ledger.materials)).toBeTruthy();
    expect(validateBomItems([{ ...base, quantity: Number.NaN }], ledger.materials)).toBeTruthy();
  });

  it("rejects a missing material reference and accepts a valid item", () => {
    const valid = { id: "bom-test", materialId: ledger.materials[0].id, quantity: 1 };
    expect(validateBomItems([{ ...valid, materialId: "missing" }], ledger.materials)).toBeTruthy();
    expect(validateBomItems([valid], ledger.materials)).toBeNull();
  });
});

describe("validateSaleDraft", () => {
  it("rejects missing dates, zero prices and non-positive quantities before cost transfer", () => {
    expect(validateSaleDraft({ date: "", quantity: 1, unitPrice: 12, productPrice: 12 })).toBe("请选择业务日期。");
    expect(validateSaleDraft({ date: "2026-08-18", quantity: 0, unitPrice: 12, productPrice: 12 })).toBe("销售数量必须大于0。");
    expect(validateSaleDraft({ date: "2026-08-18", quantity: 1, unitPrice: 0, productPrice: 12 })).toContain("成交价必须大于0");
    expect(validateSaleDraft({ date: "2026-08-18", quantity: 1, unitPrice: -1, productPrice: 12 })).toContain("成交价必须大于0");
  });

  it("rejects an unpriced product even when a user manually enters a positive transaction price", () => {
    expect(validateSaleDraft({ date: "2026-08-18", quantity: 1, unitPrice: 12, productPrice: 0 })).toBe("请先设置商品售价，再记录销售。");
  });

  it("accepts a positive dated sale for a priced product", () => {
    expect(validateSaleDraft({ date: "2026-08-18", quantity: 1, unitPrice: 12, productPrice: 12 })).toBeNull();
  });
});
