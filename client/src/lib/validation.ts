import type { BomItem, Material } from "./ledgerStore";

export type MaterialDraft = {
  name: string;
  amount: number;
  quantity: number;
  conversionFactor: number;
};

export type SaleDraft = {
  quantity: number;
  unitPrice: number;
  date: string;
  productPrice?: number;
};

export const validateCategoryName = (name: string, existing: string[] = []) => {
  const trimmed = name.trim();
  if (!trimmed) return "请填写成本项目名称。";
  if (trimmed.length > 20) return "成本项目名称不能超过20个字。";
  if (existing.includes(trimmed)) return "这个成本项目已经存在。";
  return null;
};

export const validateProductName = (name: string) => {
  if (!name.trim()) return "请填写商品名称。";
  if (name.trim().length > 40) return "商品名称不能超过40个字。";
  return null;
};

export const validateMaterialDraft = (draft: MaterialDraft) => {
  if (!draft.name.trim()) return "请填写材料名称。";
  if (![draft.amount, draft.quantity, draft.conversionFactor].every(Number.isFinite)
    || draft.amount <= 0 || draft.quantity <= 0 || draft.conversionFactor <= 0) {
    return "采购金额、采购数量和换算系数都必须大于0。";
  }
  return null;
};

export const validateSaleDraft = (draft: SaleDraft) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return "请选择业务日期。";
  if (!Number.isFinite(draft.productPrice) || (draft.productPrice ?? 0) <= 0) return "请先设置商品售价，再记录销售。";
  if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) return "销售数量必须大于0。";
  if (!Number.isFinite(draft.unitPrice) || draft.unitPrice <= 0) return "成交价必须大于0，请先设置售价或填写实际成交价。";
  return null;
};

export const validateBomItems = (items: BomItem[], materials: Material[]) => {
  if (items.some((item) => item.customName === undefined && (!Number.isFinite(item.quantity) || item.quantity <= 0))) {
    return "每项材料用量必须大于0，请检查后再保存。";
  }
  if (items.some((item) => item.customName !== undefined && (!Number.isFinite(item.quantity) || item.quantity <= 0))) {
    return "每项自定义成本数量必须大于0，请检查后再保存。";
  }
  if (items.some((item) => item.customName !== undefined && (!item.customName.trim() || !item.customUnit?.trim() || !Number.isFinite(item.customUnitCost) || (item.customUnitCost ?? 0) <= 0))) {
    return "自定义成本项目需要填写名称、单位和大于0的单价。";
  }
  if (items.some((item) => item.customName === undefined && !materials.some((material) => material.id === item.materialId))) {
    return "成本明细中有已停用或不存在的材料，请重新选择。";
  }
  return null;
};
