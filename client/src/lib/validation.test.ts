import { describe, expect, it } from "vitest";
import { seedLedger } from "./ledgerStore";
import { validateBomItems, validateMaterialDraft } from "./validation";

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
