/** 商品快速成本录入：只输入一个主成本与一个可选行业附加成本，复杂材料明细留给进阶模式。 */
import { useMemo, useState } from "react";
import { ArrowRight, Check, ClipboardList, Info, X } from "lucide-react";
import { formatCurrency } from "@/lib/costEngine";
import type { BomItem, IndustryTemplate, LedgerProduct } from "@/lib/ledgerStore";

export type QuickCostSave = {
  items: BomItem[];
  costCategory: string;
  lossRate: number;
  batchYield: number;
};

type QuickCostSheetProps = {
  product: LedgerProduct;
  template: IndustryTemplate;
  onClose: () => void;
  onOpenAdvanced: () => void;
  onSave: (draft: QuickCostSave) => void;
};

const getPresetCost = (product: LedgerProduct, presetId: BomItem["presetId"]) =>
  product.bom.find((item) => item.presetId === presetId);

export function QuickCostSheet({ product, template, onClose, onOpenAdvanced, onSave }: QuickCostSheetProps) {
  const existingPrimary = useMemo(() => getPresetCost(product, "quick-primary"), [product]);
  const existingSecondary = useMemo(() => getPresetCost(product, "quick-secondary"), [product]);
  const [primaryCost, setPrimaryCost] = useState(existingPrimary?.customUnitCost ? String(existingPrimary.customUnitCost) : "");
  const [secondaryCost, setSecondaryCost] = useState(existingSecondary?.customUnitCost ? String(existingSecondary.customUnitCost) : "");
  const [secondaryLabel, setSecondaryLabel] = useState(() => template.quickSecondaryOptions.includes(existingSecondary?.customName ?? "") ? existingSecondary?.customName ?? template.quickSecondaryOptions[0] : template.quickSecondaryOptions[0]);
  const [submitted, setSubmitted] = useState(false);
  const primaryValue = Number(primaryCost);
  const secondaryValue = Number(secondaryCost);
  const hasValidPrimary = Number.isFinite(primaryValue) && primaryValue > 0;
  const hasValidSecondary = secondaryCost === "" || (Number.isFinite(secondaryValue) && secondaryValue > 0);
  const directCost = (hasValidPrimary ? primaryValue : 0) + (hasValidSecondary && secondaryValue > 0 ? secondaryValue : 0);
  const hasAdvancedDetails = product.bom.some((item) => !item.presetId);

  const save = () => {
    setSubmitted(true);
    if (!hasValidPrimary || !hasValidSecondary) return;
    const stamp = Date.now();
    const items: BomItem[] = [
      { id: `quick-primary-${stamp}`, materialId: "", quantity: 1, customName: template.quickPrimaryLabel, customUnit: template.quickUnit, customUnitCost: primaryValue, presetId: "quick-primary" },
      ...(secondaryValue > 0 ? [{ id: `quick-secondary-${stamp}`, materialId: "", quantity: 1, customName: secondaryLabel, customUnit: template.quickUnit, customUnitCost: secondaryValue, presetId: "quick-secondary" as const }] : []),
    ];
    onSave({ items, costCategory: template.categories[0] ?? "商品成本", lossRate: 0, batchYield: 1 });
  };

  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="pricing-sheet quick-cost-sheet" role="dialog" aria-modal="true" aria-label="录入商品成本" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-grabber" />
      <header className="sheet-header"><div><span className="eyebrow">快速成本 · 约 30 秒</span><h2>{product.name} · 先填两项</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header>
      <p className="quick-cost-intro">先算清每件至少花多少钱；材料、损耗和批量制作可以稍后补充。</p>
      <section className="quick-cost-card primary">
        <div className="quick-cost-card-head"><span>必填 · 主要成本</span><b>{template.quickPrimaryLabel}</b></div>
        <label className="field-block"><span>这件商品的{template.quickPrimaryLabel}是多少？</span><div className="money-input"><i>¥</i><input aria-label="主成本金额" autoFocus type="number" min="0.01" step="0.01" inputMode="decimal" value={primaryCost} placeholder="例如 6.50" onChange={(event) => { setPrimaryCost(event.target.value); setSubmitted(false); }} /><b>/ {template.quickUnit}</b></div></label>
        {submitted && !hasValidPrimary && <small className="quick-cost-error" role="alert">主成本必须大于 0。</small>}
      </section>
      <section className="quick-cost-card">
        <div className="quick-cost-card-head"><span>选填 · 单件附加成本</span><b>不填按 ¥0 计入</b></div>
        <div className="quick-cost-options" aria-label="附加成本类型">{template.quickSecondaryOptions.map((option) => <button type="button" className={secondaryLabel === option ? "selected" : ""} onClick={() => setSecondaryLabel(option)} key={option}>{option}</button>)}</div>
        <label className="field-block"><span>每卖一件多花多少？</span><div className="money-input"><i>¥</i><input aria-label="附加成本金额" type="number" min="0.01" step="0.01" inputMode="decimal" value={secondaryCost} placeholder="选填" onChange={(event) => { setSecondaryCost(event.target.value); setSubmitted(false); }} /><b>/ {template.quickUnit}</b></div></label>
        {submitted && !hasValidSecondary && <small className="quick-cost-error" role="alert">附加成本留空或填写大于 0 的金额。</small>}
      </section>
      <section className="quick-cost-preview"><span>当前直接成本预览</span><strong>{formatCurrency(directCost)} / {template.quickUnit}</strong><p>只包含这两项单件成本；房租、利息等期间成本仍在经营账中分摊。</p></section>
      {hasAdvancedDetails && <div className="quick-cost-boundary"><Info size={15} /><span>保存会生成新的快速成本版本；当前材料明细会保留在历史版本中。</span></div>}
      <button type="button" className="quick-cost-advanced" onClick={onOpenAdvanced}><ClipboardList size={16} /> 我有材料、损耗或批量制作，要录进阶明细 <ArrowRight size={15} /></button>
      <button className="primary-action sheet-action" onClick={save}><Check size={18} /> 保存并生成成本版本</button>
    </section>
  </div>;
}
