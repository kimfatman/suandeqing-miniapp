import { describe, expect, it } from "vitest";
import { calculatePricing, CostInputs } from "./costEngine";

const inputs: CostInputs = {
  directCost: 8,
  fixedCost: 0,
  hiddenCost: 0,
  fundingCost: 0,
  feeRate: 3,
};

describe("calculatePricing", () => {
  it("反推目标利润率并在取整后重新计算实际利润率", () => {
    const result = calculatePricing({
      inputs,
      scope: "direct",
      mode: "margin",
      target: 30,
      fixedFee: 0,
    });

    expect(result.rawPrice).toBeCloseTo(11.9402985, 6);
    expect(result.suggestedPrice).toBe(12);
    expect(result.actualProfit).toBeCloseTo(3.64, 2);
    expect(result.actualMargin).toBeCloseTo(0.303333, 5);
    expect(result.isValid).toBe(true);
  });

  it("反推目标单份利润并包含按售价计提的费率", () => {
    const result = calculatePricing({
      inputs,
      scope: "direct",
      mode: "profit",
      target: 4,
      fixedFee: 0,
    });

    expect(result.rawPrice).toBeCloseTo(12.371134, 6);
    expect(result.suggestedPrice).toBe(12.5);
    expect(result.actualProfit).toBeCloseTo(4.125, 3);
  });

  it("拒绝负固定费、负目标值和超过100%的费率", () => {
    expect(calculatePricing({ inputs, scope: "direct", mode: "margin", target: 30, fixedFee: -1 }).isValid).toBe(false);
    expect(calculatePricing({ inputs, scope: "direct", mode: "margin", target: -1, fixedFee: 0 }).isValid).toBe(false);
    expect(calculatePricing({ inputs: { ...inputs, feeRate: 100 }, scope: "direct", mode: "profit", target: 4, fixedFee: 0 }).isValid).toBe(false);
  });

  it("目标利润率加费率达到100%时返回无效结果", () => {
    const result = calculatePricing({
      inputs: { ...inputs, feeRate: 20 },
      scope: "direct",
      mode: "margin",
      target: 80,
      fixedFee: 0,
    });

    expect(result.isValid).toBe(false);
    expect(Number.isNaN(result.rawPrice)).toBe(true);
  });
});
