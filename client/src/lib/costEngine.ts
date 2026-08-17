export type CostScope = "direct" | "operating" | "full";
export type PricingMode = "margin" | "profit";

export type CostInputs = {
  directCost: number;
  fixedCost: number;
  hiddenCost: number;
  fundingCost: number;
  feeRate: number;
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

export const getScopeCost = (inputs: CostInputs, scope: CostScope) => {
  if (scope === "direct") return inputs.directCost;
  if (scope === "operating") {
    return inputs.directCost + inputs.fixedCost + inputs.hiddenCost;
  }
  return inputs.directCost + inputs.fixedCost + inputs.hiddenCost + inputs.fundingCost;
};

export const roundPrice = (value: number, step = 0.5) =>
  Math.ceil((Number.isFinite(value) ? value : 0) / step) * step;

export const calculatePricing = ({
  inputs,
  scope,
  mode,
  target,
  fixedFee,
}: {
  inputs: CostInputs;
  scope: CostScope;
  mode: PricingMode;
  target: number;
  fixedFee: number;
}) => {
  const cost = getScopeCost(inputs, scope);
  const rate = inputs.feeRate / 100;
  const margin = mode === "margin" ? target / 100 : 0;
  const denominator = 1 - rate - margin;
  const rawPrice = mode === "margin"
    ? denominator > 0
      ? (cost + fixedFee) / denominator
      : NaN
    : rate < 1
      ? (cost + fixedFee + target) / (1 - rate)
      : NaN;
  const suggestedPrice = roundPrice(rawPrice, 0.5);
  const breakEvenPrice = roundPrice((cost + fixedFee) / (1 - rate), 0.5);
  const actualProfit = suggestedPrice * (1 - rate) - cost - fixedFee;
  const actualMargin = suggestedPrice > 0 ? actualProfit / suggestedPrice : 0;

  return {
    cost,
    rawPrice,
    suggestedPrice,
    breakEvenPrice,
    actualProfit,
    actualMargin,
    isValid: Number.isFinite(rawPrice) && rawPrice > 0,
  };
};
