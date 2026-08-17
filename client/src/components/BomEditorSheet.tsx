/** 商户账簿工作台：BOM编辑将材料来源、数量与当前成本放在一条视觉轨迹上，确保数字有来路。 */
import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { BomItem, LedgerProduct, Material } from "@/lib/ledgerStore";
import { formatCurrency } from "@/lib/costEngine";

type BomEditorSheetProps = { product: LedgerProduct; materials: Material[]; onClose: () => void; onSave: (items: BomItem[]) => void };

export function BomEditorSheet({ product, materials, onClose, onSave }: BomEditorSheetProps) {
  const [items, setItems] = useState<BomItem[]>(product.bom);
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const directCost = useMemo(() => items.reduce((sum, item) => sum + (materials.find((entry) => entry.id === item.materialId)?.unitCost ?? 0) * item.quantity, 0), [items, materials]);
  const addItem = () => { if (materialId) setItems((current) => [...current, { id: `bom-${Date.now()}`, materialId, quantity: 1 }]); };

  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet bom-sheet" role="dialog" aria-modal="true" aria-label="编辑商品配方" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">商品配方 BOM</span><h2>{product.name} · 成本有来路</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header><section className="bom-total"><span>当前材料成本</span><strong>{formatCurrency(directCost)}</strong><p>包装 {formatCurrency(product.packaging)} ＋ 直接人工 {formatCurrency(product.directLabor)} 会在保存后一起计入。</p></section><section className="bom-list">{items.length ? items.map((item) => { const material = materials.find((entry) => entry.id === item.materialId); return <article className="bom-row" key={item.id}><div className="bom-dot" /><div><b>{material?.name ?? "已停用材料"}</b><small>{material?.unitCost ? `${formatCurrency(material.unitCost)} / ${material.unit}` : "请重新选择材料"}</small></div><label><input type="number" min="0" inputMode="decimal" value={item.quantity} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.max(Number(event.target.value) || 0, 0) } : entry))} /><span>{material?.unit ?? ""}</span></label><button onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label="删除材料"><Trash2 size={16} /></button></article>; }) : <div className="bom-empty">还没有配方材料，先从下面加一项。</div>}</section><div className="bom-add"><select value={materialId} onChange={(event) => setMaterialId(event.target.value)}>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select><button onClick={addItem}><Plus size={16} /> 加入配方</button></div><details className="calculation-details"><summary>成本如何变化？ <ChevronDown size={16} /></summary><p>保存后会生成新的商品成本版本。之前的售价和历史经营记录不会被当前配方覆盖。</p></details><button className="primary-action sheet-action" onClick={() => onSave(items)}><Check size={18} /> 保存并重新核算</button></section></div>;
}
