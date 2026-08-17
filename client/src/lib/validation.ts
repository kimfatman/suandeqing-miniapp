import type { BomItem, Material } from "./ledgerStore";

export type MaterialDraft = {
  name: string;
  amount: number;
  quantity: number;
  conversionFactor: number;
};

export const validateMaterialDraft = (draft: MaterialDraft) => {
  if (!draft.name.trim()) return "请填写材料名称。";
  if (![draft.amount, draft.quantity, draft.conversionFactor].every(Number.isFinite)
    || draft.amount <= 0 || draft.quantity <= 0 || draft.conversionFactor <= 0) {
    return "采购金额、采购数量和换算系数都必须大于0。";
  }
  return null;
};

export const validateBomItems = (items: BomItem[], materials: Material[]) => {
  if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    return "每项材料用量必须大于0，请检查后再保存。";
  }
  if (items.some((item) => !materials.some((material) => material.id === item.materialId))) {
    return "配方中有已停用或不存在的材料，请重新选择。";
  }
  return null;
};
