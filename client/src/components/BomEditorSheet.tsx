import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { BomItem, calculateBomVersionDirectCost, LedgerProduct, Material } from "@/lib/ledgerStore";
import { formatCurrency } from "@/lib/costEngine";
import { validateBomItems } from "@/lib/validation";

type CostSnapshot = { materialUnitCosts: Record<string, number>; packaging: number; directLabor: number; directCost: number };
const customItemError = (item: BomItem) => {
  if (item.customName === undefined) return null;
  if (!item.customName.trim()) return "请填写项目名称";
  if (!item.customUnit?.trim()) return "请填写单位";
  if (!Number.isFinite(item.customUnitCost) || (item.customUnitCost ?? 0) <= 0) return "单价必须大于0";
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) return "数量必须大于0";
  return null;
};
type BomEditorSheetProps = {
  product: LedgerProduct;
  materials: Material[];
  categories?: string[];
  costLabel?: string;
  costAction?: string;
  costEmpty?: string;
  onClose: () => void;
  onSave: (items: BomItem[], settings: { lossRate: number; batchYield: number; costCategory?: string; costSnapshot?: CostSnapshot }) => void;
};

export function BomEditorSheet({ product, materials, categories = [], costLabel = "商品配方 BOM", costAction = "加入配方", costEmpty = "还没有配方材料，先从下面加一项。", onClose, onSave }: BomEditorSheetProps) {
  const [items, setItems] = useState<BomItem[]>(product.bom);
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [addMode, setAddMode] = useState<"material" | "custom">("material");
  const [lossRate, setLossRate] = useState(String(product.lossRate ?? 0));
  const [batchYield, setBatchYield] = useState(String(product.batchYield ?? 1));
  const [costCategory, setCostCategory] = useState(product.costCategory ?? categories[0] ?? "");
  const [costSnapshot, setCostSnapshot] = useState<CostSnapshot | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | null>(null);
  const customErrors = new Map(items.filter((item) => item.customName !== undefined).map((item) => [item.id, customItemError(item)]));
  const canAddCurrentMode = addMode === "custom" || materials.length > 0;
  const directCost = useMemo(() => {
    if (costSnapshot) return costSnapshot.directCost;
    const bomCost = items.reduce((sum, item) => {
      if (item.customName) return sum + Math.max(item.customUnitCost ?? 0, 0) * item.quantity;
      const material = materials.find((entry) => entry.id === item.materialId);
      return sum + (material?.unitCost ?? 0) * item.quantity;
    }, 0);
    const loss = Math.max(Number(lossRate) || 0, 0) / 100;
    const yieldCount = Math.max(Number(batchYield) || 0, 0.0001);
    return (bomCost * (1 + loss)) / yieldCount + product.packaging + product.directLabor;
  }, [items, materials, lossRate, batchYield, costSnapshot]);
  const addItem = () => {
    if (addMode === "material" && materialId) {
      setItems((current) => [...current, { id: `bom-${Date.now()}`, materialId, quantity: 1 }]);
    } else if (addMode === "custom") {
      const id = `custom-${Date.now()}`;
      setItems((current) => [...current, { id, materialId: "", quantity: 1, customName: "", customUnit: "项", customUnitCost: 0 }]);
      window.requestAnimationFrame(() => document.getElementById(`custom-name-${id}`)?.focus());
    }
    setCostSnapshot(undefined);
    setValidationError(null);
  };
  const updateQuantity = (id: string, rawValue: string) => {
    const quantity = rawValue === "" ? 0 : Number(rawValue);
    setItems((current) => current.map((entry) => entry.id === id ? { ...entry, quantity: Number.isFinite(quantity) ? quantity : 0 } : entry));
    setCostSnapshot(undefined);
    setValidationError(null);
  };
  const updateCustom = (id: string, patch: Partial<BomItem>) => {
    setItems((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
    setCostSnapshot(undefined);
    setValidationError(null);
  };
  const save = () => {
    const cleanedItems = items.map((item) => item.customName === undefined ? item : { ...item, customName: item.customName.trim(), customUnit: item.customUnit?.trim() ?? "" });
    const error = validateBomItems(cleanedItems, materials);
    const parsedLossRate = Number(lossRate);
    const parsedBatchYield = Number(batchYield);
    if (error) { setValidationError(error); return; }
    if (!Number.isFinite(parsedLossRate) || parsedLossRate < 0 || parsedLossRate >= 100) { setValidationError("损耗率必须在0%到100%之间。"); return; }
    if (!Number.isFinite(parsedBatchYield) || parsedBatchYield <= 0) { setValidationError("批次出成量必须大于0。"); return; }
    onSave(cleanedItems, { lossRate: parsedLossRate, batchYield: parsedBatchYield, costCategory: costCategory || undefined, costSnapshot });
  };

  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="pricing-sheet bom-sheet" role="dialog" aria-modal="true" aria-label={`编辑${costLabel}`} onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-grabber" />
      <header className="sheet-header"><div><span className="eyebrow">{costLabel}</span><h2>{product.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header>
      <section className="bom-total"><span>直接成本</span><strong>{formatCurrency(directCost)}</strong><p>损耗 {lossRate || 0}% · 出成 {batchYield || 0} 份</p></section>
      <div className="two-fields bom-settings"><label className="field-block"><span>损耗率</span><div className="money-input"><input type="number" min="0" max="99.99" step="0.01" value={lossRate} onChange={(event) => { setLossRate(event.target.value); setCostSnapshot(undefined); setValidationError(null); }} /><b>%</b></div></label><label className="field-block"><span>本批出成量</span><div className="money-input"><input type="number" min="0.01" step="0.01" value={batchYield} onChange={(event) => { setBatchYield(event.target.value); setCostSnapshot(undefined); setValidationError(null); }} /><b>份</b></div></label></div>
      {categories.length > 0 && <label className="field-block bom-category-field"><span>成本归类</span><select value={costCategory} onChange={(event) => setCostCategory(event.target.value)}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>}
      <section className="bom-list">{items.length ? items.map((item) => {
        const material = materials.find((entry) => entry.id === item.materialId);
        if (item.customName !== undefined) { const itemError = customErrors.get(item.id); const rowCost = Math.max(item.customUnitCost ?? 0, 0) * Math.max(item.quantity, 0); return <article className={itemError && validationError ? "bom-row custom-bom-row has-error" : "bom-row custom-bom-row"} key={item.id}><div className="bom-dot custom" /><div className="custom-cost-fields"><label><span>项目名称 <em>*</em></span><input id={`custom-name-${item.id}`} aria-label="自定义成本名称" aria-invalid={Boolean(itemError && validationError)} value={item.customName} placeholder="例如：平台服务费" onChange={(event) => updateCustom(item.id, { customName: event.target.value })} /></label><div className="custom-cost-inline"><label><span>单位 <em>*</em></span><input aria-label="自定义成本单位" aria-invalid={Boolean(itemError && validationError)} value={item.customUnit ?? ""} placeholder="例如：单" onChange={(event) => updateCustom(item.id, { customUnit: event.target.value })} /></label><label><span>单价 <em>*</em></span><input aria-label="自定义成本单价" aria-invalid={Boolean(itemError && validationError)} type="number" min="0.01" step="0.01" value={item.customUnitCost || ""} onChange={(event) => updateCustom(item.id, { customUnitCost: event.target.value === "" ? 0 : Number(event.target.value) })} /></label></div><div className="custom-cost-feedback"><span>数量 {item.quantity || 0} {item.customUnit || "项"}</span><b>本行成本 {formatCurrency(rowCost)}</b></div>{itemError && validationError && <small className="custom-item-error">{itemError}</small>}</div><label className="custom-quantity"><span>数量 <em>*</em></span><input aria-label="自定义成本数量" aria-invalid={Boolean(itemError && validationError)} type="number" min="0.01" step="0.01" value={item.quantity || ""} onChange={(event) => updateQuantity(item.id, event.target.value)} /></label><button onClick={() => { setItems((current) => current.filter((entry) => entry.id !== item.id)); setCostSnapshot(undefined); setValidationError(null); }} aria-label="删除自定义成本"><Trash2 size={16} /></button></article>; }
        return <article className="bom-row" key={item.id}><div className="bom-dot" /><div><b>{material?.name ?? "已停用材料"}</b><small>{material?.unitCost ? `${formatCurrency(material.unitCost)} / ${material.unit}` : "请重新选择材料"}</small></div><label><input type="number" min="0.01" step="0.01" inputMode="decimal" value={item.quantity || ""} aria-invalid={Boolean(validationError && item.quantity <= 0)} onChange={(event) => updateQuantity(item.id, event.target.value)} /><span>{material?.unit ?? ""}</span></label><button onClick={() => { setItems((current) => current.filter((entry) => entry.id !== item.id)); setCostSnapshot(undefined); }} aria-label="删除材料"><Trash2 size={16} /></button></article>;
      }) : <div className="bom-empty">{costEmpty}</div>}</section>
      <div className="bom-add"><select aria-label="新增成本明细类型" value={addMode} onChange={(event) => { setAddMode(event.target.value as "material" | "custom"); setValidationError(null); }}><option value="material">已有材料</option><option value="custom">自定义成本项目</option></select>{addMode === "material" && <select aria-label="选择材料" value={materialId} onChange={(event) => setMaterialId(event.target.value)} disabled={!materials.length}>{materials.length ? materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>) : <option value="">暂无已录入材料</option>}</select>}<button onClick={addItem} disabled={!canAddCurrentMode}><Plus size={16} /> {addMode === "custom" ? "新增自定义项目" : costAction}</button>{addMode === "material" && !materials.length && <small className="bom-add-hint">暂无材料，请改选自定义项目。</small>}</div>
      <details className="calculation-details"><summary>版本记录 <ChevronDown size={16} /></summary><p>保存会生成新版本，历史销售不变。</p>{product.bomVersions?.length ? <div className="bom-history">{product.bomVersions.map((version) => <button type="button" key={version.id} onClick={() => { setItems(version.items); setLossRate(String(version.lossRate)); setBatchYield(String(version.batchYield)); setCostSnapshot({ materialUnitCosts: version.materialUnitCosts, packaging: version.packaging, directLabor: version.directLabor, directCost: calculateBomVersionDirectCost(version) }); setValidationError(null); }}>恢复 {version.entryMode === "quick" ? "快速成本" : "进阶明细"} · {version.effectiveFrom} · {formatCurrency(calculateBomVersionDirectCost(version))}</button>)}</div> : <small>保存后生成首个版本。</small>}</details>
      {validationError && <p className="form-error" role="alert">{validationError}</p>}
      <button className="primary-action sheet-action" onClick={save}><Check size={18} /> 保存并重新核算</button>
    </section>
  </div>;
}
