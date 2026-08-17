/** 商户账簿工作台：BOM编辑将材料来源、数量与当前成本放在一条视觉轨迹上，确保数字有来路。 */
import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { BomItem, calculateBomVersionDirectCost, LedgerProduct, Material } from "@/lib/ledgerStore";
import { formatCurrency } from "@/lib/costEngine";
import { validateBomItems } from "@/lib/validation";

type BomEditorSheetProps = { product: LedgerProduct; materials: Material[]; onClose: () => void; onSave: (items: BomItem[], settings: { lossRate: number; batchYield: number; costSnapshot?: { materialUnitCosts: Record<string, number>; packaging: number; directLabor: number; directCost: number } }) => void };

export function BomEditorSheet({ product, materials, onClose, onSave }: BomEditorSheetProps) {
  const [items, setItems] = useState<BomItem[]>(product.bom);
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [lossRate, setLossRate] = useState(String(product.lossRate ?? 0));
  const [batchYield, setBatchYield] = useState(String(product.batchYield ?? 1));
  const [costSnapshot, setCostSnapshot] = useState<{ materialUnitCosts: Record<string, number>; packaging: number; directLabor: number; directCost: number } | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | null>(null);
  const directCost = useMemo(() => {
    if (costSnapshot) return costSnapshot.directCost;
    const bomCost = items.reduce((sum, item) => sum + (materials.find((entry) => entry.id === item.materialId)?.unitCost ?? 0) * item.quantity, 0);
    const loss = Math.max(Number(lossRate) || 0, 0) / 100;
    const yieldCount = Math.max(Number(batchYield) || 0, 0.0001);
    return (bomCost * (1 + loss)) / yieldCount;
  }, [items, materials, lossRate, batchYield, costSnapshot]);
  const addItem = () => { if (materialId) { setItems((current) => [...current, { id: `bom-${Date.now()}`, materialId, quantity: 1 }]); setCostSnapshot(undefined); setValidationError(null); } };
  const updateQuantity = (id: string, rawValue: string) => {
    const quantity = rawValue === "" ? 0 : Number(rawValue);
    setItems((current) => current.map((entry) => entry.id === id ? { ...entry, quantity: Number.isFinite(quantity) ? quantity : 0 } : entry));
    setCostSnapshot(undefined);
    setValidationError(null);
  };
  const save = () => {
    const error = validateBomItems(items, materials);
    const parsedLossRate = Number(lossRate);
    const parsedBatchYield = Number(batchYield);
    if (error) { setValidationError(error); return; }
    if (!Number.isFinite(parsedLossRate) || parsedLossRate < 0 || parsedLossRate >= 100) { setValidationError("损耗率必须在0%到100%之间。"); return; }
    if (!Number.isFinite(parsedBatchYield) || parsedBatchYield <= 0) { setValidationError("批次出成量必须大于0。"); return; }
    onSave(items, { lossRate: parsedLossRate, batchYield: parsedBatchYield, costSnapshot });
  };

  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet bom-sheet" role="dialog" aria-modal="true" aria-label="编辑商品配方" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">商品配方 BOM</span><h2>{product.name} · 成本有来路</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header><section className="bom-total"><span>当前材料成本</span><strong>{formatCurrency(directCost)}</strong><p>已按损耗 {lossRate || 0}%、本批出成 {batchYield || 0} 份折算；包装 {formatCurrency(product.packaging)} ＋ 直接人工 {formatCurrency(product.directLabor)} 会在保存后一起计入。</p></section><div className="two-fields bom-settings"><label className="field-block"><span>损耗率</span><div className="money-input"><input type="number" min="0" max="99.99" step="0.01" value={lossRate} onChange={(event) => { setLossRate(event.target.value); setCostSnapshot(undefined); setValidationError(null); }} /><b>%</b></div></label><label className="field-block"><span>本批出成量</span><div className="money-input"><input type="number" min="0.01" step="0.01" value={batchYield} onChange={(event) => { setBatchYield(event.target.value); setCostSnapshot(undefined); setValidationError(null); }} /><b>份</b></div></label></div><section className="bom-list">{items.length ? items.map((item) => { const material = materials.find((entry) => entry.id === item.materialId); return <article className="bom-row" key={item.id}><div className="bom-dot" /><div><b>{material?.name ?? "已停用材料"}</b><small>{material?.unitCost ? `${formatCurrency(material.unitCost)} / ${material.unit}` : "请重新选择材料"}</small></div><label><input type="number" min="0.01" step="0.01" inputMode="decimal" value={item.quantity || ""} aria-invalid={Boolean(validationError && item.quantity <= 0)} onChange={(event) => updateQuantity(item.id, event.target.value)} /><span>{material?.unit ?? ""}</span></label><button onClick={() => { setItems((current) => current.filter((entry) => entry.id !== item.id)); setCostSnapshot(undefined); }} aria-label="删除材料"><Trash2 size={16} /></button></article>; }) : <div className="bom-empty">还没有配方材料，先从下面加一项。</div>}</section><div className="bom-add"><select value={materialId} onChange={(event) => setMaterialId(event.target.value)}>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select><button onClick={addItem}><Plus size={16} /> 加入配方</button></div><details className="calculation-details"><summary>成本如何变化？ <ChevronDown size={16} /></summary><p>保存后会生成新的商品成本版本。之前的售价和历史经营记录不会被当前配方覆盖。</p>{product.bomVersions?.length ? <div className="bom-history">{product.bomVersions.map((version) => <button type="button" key={version.id} onClick={() => { setItems(version.items); setLossRate(String(version.lossRate)); setBatchYield(String(version.batchYield)); setCostSnapshot({ materialUnitCosts: version.materialUnitCosts, packaging: version.packaging, directLabor: version.directLabor, directCost: calculateBomVersionDirectCost(version) }); setValidationError(null); }}>恢复 {version.effectiveFrom} · 历史材料成本{formatCurrency(calculateBomVersionDirectCost(version))}</button>)}</div> : <small>当前还没有历史版本；第一次保存后会生成快照。</small>}</details>{validationError && <p className="form-error" role="alert">{validationError}</p>}<button className="primary-action sheet-action" onClick={save}><Check size={18} /> 保存并重新核算</button></section></div>;
}
