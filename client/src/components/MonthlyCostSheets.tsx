import { useMemo, useState } from "react";
import { Check, Download, Info, Plus, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import {
  AllocationMethod,
  calculateEquipmentDepreciation,
  calculateMonthlyIndirectPlanTotal,
  calculateMonthlyIndirectTotal,
  calculateProductIndirectAllocations,
  emptyMonthlyFixedCosts,
  getMonthlyIndirectPlanTiming,
  LedgerProduct,
  MonthlyFixedCosts,
  MonthlyIndirectCostPlan,
  ProductAllocationInput,
} from "@/lib/ledgerStore";
import { formatCurrency } from "@/lib/costEngine";

const fixedFields: Array<{ key: Exclude<keyof MonthlyFixedCosts, "equipment">; label: string; hint: string }> = [
  { key: "rent", label: "房租", hint: "本月店铺、摊位或仓库租金" },
  { key: "fullTimeLabor", label: "全职人工及社保", hint: "全职人员薪资、社保和公积金" },
  { key: "utilities", label: "水电费用", hint: "本月水费、电费、燃气等" },
  { key: "propertyInternet", label: "物业宽带", hint: "物业、宽带和公共服务费用" },
  { key: "softwareServer", label: "软件服务器", hint: "收银、订阅、服务器和工具月费" },
  { key: "officeMisc", label: "办公杂费", hint: "办公、清洁、耗材等非单品费用" },
  { key: "other", label: "其他固定费用", hint: "无法归入以上项目的本月固定费用" },
];

const methodOptions: Array<{ key: AllocationMethod; label: string; note: string }> = [
  { key: "output", label: "按产量", note: "适合标准化、单件差异较小的商品" },
  { key: "hours", label: "按工时", note: "适合手作、定制或制作耗时差异大的商品" },
  { key: "revenue", label: "按销售额", note: "适合以营业额驱动资源占用的零售商品" },
];

function getPeriodRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${period}-01`, end: `${period}-${String(lastDay).padStart(2, "0")}` };
}

function NumberInput({ value, onChange, ariaLabel, suffix = "元", min = 0, step = 0.01 }: { value: number; onChange: (value: number) => void; ariaLabel: string; suffix?: string; min?: number; step?: number }) {
  return <div className="money-input"><input aria-label={ariaLabel} type="number" min={min} step={step} inputMode="decimal" value={value || ""} onChange={(event) => onChange(Math.max(Number(event.target.value) || 0, min))} /><b>{suffix}</b></div>;
}

export function MonthlyAllocationSheet({ period, products, initialPlan, onClose, onSave, onDelete }: { period: string; products: LedgerProduct[]; initialPlan?: MonthlyIndirectCostPlan; onClose: () => void; onSave: (plan: MonthlyIndirectCostPlan) => void; onDelete?: () => void }) {
  const range = getPeriodRange(period);
  const initialTiming = initialPlan ? getMonthlyIndirectPlanTiming(initialPlan) : { effectiveFrom: range.start, effectiveTo: range.end };
  const [method, setMethod] = useState<AllocationMethod>(initialPlan?.method ?? "output");
  const [totalProductionHours, setTotalProductionHours] = useState(initialPlan?.totalProductionHours ?? 0);
  const [fixedCosts, setFixedCosts] = useState<MonthlyFixedCosts>(() => ({ ...emptyMonthlyFixedCosts(), ...(initialPlan?.fixedCosts ?? {}), equipment: initialPlan?.fixedCosts.equipment ?? [] }));
  const [inputs, setInputs] = useState<ProductAllocationInput[]>(() => products.map((product) => initialPlan?.products.find((item) => item.productId === product.id) ?? { productId: product.id, outputQuantity: 0, unitHours: 0, salesAmount: 0, weight: 1 }));
  const [effectiveFrom, setEffectiveFrom] = useState(initialTiming.effectiveFrom);
  const [effectiveTo, setEffectiveTo] = useState(initialTiming.effectiveTo);
  const [costTiming, setCostTiming] = useState<"fullMonth" | "prorated">(initialPlan?.costTiming ?? "fullMonth");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const plan = useMemo<MonthlyIndirectCostPlan>(() => ({ id: initialPlan?.id ?? `plan-${period}`, period, effectiveFrom, effectiveTo, costTiming, method, totalProductionHours, fixedCosts, products: inputs, updatedAt: new Date().toISOString() }), [period, effectiveFrom, effectiveTo, costTiming, method, totalProductionHours, fixedCosts, inputs, initialPlan?.id]);
  const timing = getMonthlyIndirectPlanTiming(plan);
  const fullMonthTotal = calculateMonthlyIndirectTotal(fixedCosts);
  const total = calculateMonthlyIndirectPlanTotal(plan);
  const allocations = calculateProductIndirectAllocations(plan);
  const allocatedTotal = Object.values(allocations).reduce((sum, allocation) => sum + allocation.totalIndirectCost, 0);
  const setInput = (productId: number, key: keyof ProductAllocationInput, value: number) => setInputs((current) => current.map((item) => item.productId === productId ? { ...item, [key]: value } : item));
  const addEquipment = () => setFixedCosts((current) => ({ ...current, equipment: [...current.equipment, { id: `equipment-${Date.now()}`, name: "设备", purchasePrice: 0, usefulLifeMonths: 36 }] }));
  const save = () => {
    if (effectiveFrom < range.start || effectiveTo > range.end || effectiveFrom > effectiveTo) { setError("生效日期必须在当前月份内，且结束日期不能早于开始日期。"); return; }
    if (fullMonthTotal <= 0 || total <= 0) { setError("请至少填写一项本月固定或间接费用，并确认有效日期。"); return; }
    if (method === "hours" && totalProductionHours <= 0) { setError("按工时分摊时，请填写本期总生产工时。"); return; }
    const hasBasis = inputs.some((item) => method === "hours" ? item.outputQuantity > 0 && item.unitHours > 0 : method === "revenue" ? item.salesAmount > 0 && item.outputQuantity > 0 : item.outputQuantity > 0);
    if (!hasBasis) { setError(method === "hours" ? "请至少填写一个商品的产量和单件工时。" : method === "revenue" ? "请至少填写一个商品的预计销售额和产量。" : "请至少填写一个商品的本期产量。"); return; }
    onSave(plan);
  };

  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet monthly-allocation-sheet" role="dialog" aria-modal="true" aria-label="月度成本分摊" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">{period}</span><h2>月度成本分摊</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="cost-setting-note"><Info size={17} /><p>费用只在生效日期内参与销售结转；已发生销售继续使用当时冻结的成本快照。</p></div>
    <section className="monthly-section"><div className="monthly-section-heading"><b>本期生效时间</b><span>按业务日期匹配</span></div><div className="allocation-timing-grid"><label className="field-block"><span>开始日期</span><input aria-label="分摊开始日期" type="date" min={range.start} max={range.end} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label><label className="field-block"><span>结束日期</span><input aria-label="分摊结束日期" type="date" min={range.start} max={range.end} value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} /></label></div><div className="timing-mode"><button className={costTiming === "fullMonth" ? "selected" : ""} onClick={() => setCostTiming("fullMonth")}><b>本期实际费用</b><small>填入金额直接计入，不再按天折算</small></button><button className={costTiming === "prorated" ? "selected" : ""} onClick={() => setCostTiming("prorated")}><b>整月预算按天折算</b><small>按有效 {timing.effectiveDays} / {timing.daysInPeriod} 天计入</small></button></div></section>
    <section className="monthly-section"><div className="monthly-section-heading"><b>本月固定与间接费用</b><span>设备自动折旧</span></div><div className="monthly-fixed-grid">{fixedFields.map((field) => <label className="field-block" key={field.key}><span>{field.label}<small>{field.hint}</small></span><NumberInput ariaLabel={`${field.label}月费`} value={fixedCosts[field.key]} onChange={(value) => setFixedCosts((current) => ({ ...current, [field.key]: value }))} /></label>)}</div><div className="equipment-list"><div className="monthly-section-heading"><b>设备折旧</b><button type="button" onClick={addEquipment}><Plus size={14} />新增设备</button></div>{fixedCosts.equipment.map((equipment) => <div className="equipment-row" key={equipment.id}><input aria-label="设备名称" value={equipment.name} onChange={(event) => setFixedCosts((current) => ({ ...current, equipment: current.equipment.map((item) => item.id === equipment.id ? { ...item, name: event.target.value } : item) }))} /><NumberInput ariaLabel={`${equipment.name}采购价`} value={equipment.purchasePrice} onChange={(value) => setFixedCosts((current) => ({ ...current, equipment: current.equipment.map((item) => item.id === equipment.id ? { ...item, purchasePrice: value } : item) }))} /><NumberInput ariaLabel={`${equipment.name}使用月数`} suffix="月" min={1} step={1} value={equipment.usefulLifeMonths} onChange={(value) => setFixedCosts((current) => ({ ...current, equipment: current.equipment.map((item) => item.id === equipment.id ? { ...item, usefulLifeMonths: value } : item) }))} /><b>{formatCurrency(calculateEquipmentDepreciation(equipment))}/月</b><button aria-label={`删除${equipment.name}`} onClick={() => setFixedCosts((current) => ({ ...current, equipment: current.equipment.filter((item) => item.id !== equipment.id) }))}><Trash2 size={15} /></button></div>)}</div><div className="monthly-total"><span>{costTiming === "prorated" ? `本期计入（${timing.effectiveDays}/${timing.daysInPeriod} 天）` : "本期计入间接成本"}</span><strong>{formatCurrency(total)}</strong>{costTiming === "prorated" && <small>整月预算 {formatCurrency(fullMonthTotal)}</small>}</div></section>
    <section className="monthly-section"><div className="monthly-section-heading"><b>选择分摊规则</b><span>可按月切换</span></div><div className="allocation-methods">{methodOptions.map((option) => <button className={method === option.key ? "selected" : ""} key={option.key} onClick={() => setMethod(option.key)}><b>{option.label}</b><small>{option.note}</small></button>)}</div>{method === "hours" && <label className="field-block monthly-hours"><span>本期总生产工时<small>生效日期内所有商品制作工时合计</small></span><NumberInput ariaLabel="本期总生产工时" suffix="小时" min={0.01} value={totalProductionHours} onChange={setTotalProductionHours} /></label>}</section>
    <section className="monthly-section"><div className="monthly-section-heading"><b>商品分摊输入</b><span>权重 1 为普通商品</span></div><div className="allocation-product-list">{products.map((product) => { const input = inputs.find((item) => item.productId === product.id)!; const allocation = allocations[product.id]; return <article className="allocation-product-row" key={product.id}><div className="allocation-product-name"><b>{product.name}</b><small>直接成本 {formatCurrency(product.direct)}</small></div><div className="allocation-inputs"><label><span>本期产量</span><NumberInput ariaLabel={`${product.name}本期产量`} suffix="件" min={0} value={input.outputQuantity} onChange={(value) => setInput(product.id, "outputQuantity", value)} /></label>{method === "hours" && <label><span>单件工时</span><NumberInput ariaLabel={`${product.name}单件工时`} suffix="小时" min={0} value={input.unitHours} onChange={(value) => setInput(product.id, "unitHours", value)} /></label>}{method === "revenue" && <label><span>本期销售额</span><NumberInput ariaLabel={`${product.name}本期销售额`} value={input.salesAmount} onChange={(value) => setInput(product.id, "salesAmount", value)} /></label>}<label><span>权重</span><NumberInput ariaLabel={`${product.name}分摊权重`} suffix="倍" min={0.1} step={0.1} value={input.weight} onChange={(value) => setInput(product.id, "weight", value)} /></label></div><div className="allocation-product-result"><span>每件分摊</span><b>{formatCurrency(allocation?.unitIndirectCost ?? 0)}</b><small>完整成本 {formatCurrency(product.direct + (allocation?.unitIndirectCost ?? 0))}</small></div></article>; })}</div><div className="allocation-check"><span>已分配 {formatCurrency(allocatedTotal)} / {formatCurrency(total)}</span>{method === "hours" && Math.abs(allocatedTotal - total) > 0.01 && <small>工时法未分配部分代表尚未录入的本期生产工时。</small>}</div></section>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action sheet-action" onClick={save}><Check size={16} />保存本期分摊并更新未来成本</button>{initialPlan && onDelete && (confirmDelete ? <div className="data-confirmation"><b>删除本月分摊？</b><p>本月房租、人工、折旧等设置将移除；已发生销售继续使用原成本快照。</p><div><button className="secondary-action" onClick={() => setConfirmDelete(false)}>取消</button><button className="danger-action" onClick={onDelete}>确认删除</button></div></div> : <button className="danger-action sheet-action" onClick={() => setConfirmDelete(true)}>删除本月分摊</button>)}</section></div>;
}

export function MonthlyCostReportSheet({ period, products, plan, onClose }: { period: string; products: LedgerProduct[]; plan?: MonthlyIndirectCostPlan; onClose: () => void }) {
  const total = plan ? calculateMonthlyIndirectPlanTotal(plan) : 0;
  const timing = plan ? getMonthlyIndirectPlanTiming(plan) : undefined;
  const allocations = plan ? calculateProductIndirectAllocations(plan) : {};
  const rows = products.map((product) => { const allocation = allocations[product.id]; const completeCost = product.direct + (allocation?.unitIndirectCost ?? Math.max(product.operating - product.direct, 0)); const gross = product.price - completeCost; return { 商品: product.name, 直接成本: product.direct, 分摊间接成本: allocation?.unitIndirectCost ?? Math.max(product.operating - product.direct, 0), 单件完整成本: completeCost, 当前售价: product.price, 单件预计利润: gross, 预计利润率: product.price > 0 ? gross / product.price : 0, 本期产量: allocation?.outputQuantity ?? 0, 本期分摊总额: allocation?.totalIndirectCost ?? 0 }; });
  const exportExcel = () => { const workbook = XLSX.utils.book_new(); const overview = XLSX.utils.aoa_to_sheet([["算得清月度成本报表"], ["期间", period], ["费用有效日期", timing ? `${timing.effectiveFrom} 至 ${timing.effectiveTo}` : "尚未设置"], ["有效天数", timing ? `${timing.effectiveDays}/${timing.daysInPeriod}` : "—"], ["本期计入间接成本", total], ["分摊规则", plan ? methodOptions.find((item) => item.key === plan.method)?.label : "尚未设置"], [], ["说明", "单件完整成本 = 直接成本 + 有效期间内的本期分摊间接成本；建议价请在商品定价中按目标利润率测算。"]]); const productSheet = XLSX.utils.json_to_sheet(rows); const fixedRows = plan ? [...fixedFields.map((field) => ({ 项目: field.label, 本期计入金额: (plan.fixedCosts[field.key] ?? 0) * (timing?.timeFactor ?? 1) })), ...plan.fixedCosts.equipment.map((item) => ({ 项目: `${item.name}本期折旧`, 本期计入金额: calculateEquipmentDepreciation(item) * (timing?.timeFactor ?? 1) }))] : []; XLSX.utils.book_append_sheet(workbook, overview, "总览"); XLSX.utils.book_append_sheet(workbook, productSheet, "商品成本台账"); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fixedRows), "间接成本明细"); XLSX.writeFile(workbook, `算得清-${period}-成本报表.xlsx`); };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet monthly-report-sheet" role="dialog" aria-modal="true" aria-label="月度成本报表" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">{period}</span><h2>成本与利润报表</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="report-kpis"><span><small>本期间接成本</small><b>{formatCurrency(total)}</b></span><span><small>商品数</small><b>{products.length}</b></span><span><small>有效日期</small><b>{timing ? `${timing.effectiveDays}/${timing.daysInPeriod}天` : "未设置"}</b></span></div>{timing && <p className="report-period-note">费用生效：{timing.effectiveFrom} 至 {timing.effectiveTo}{timing.timeFactor < 1 ? ` · 已按 ${(timing.timeFactor * 100).toFixed(1)}% 时间比例计入` : ""}</p>}<div className="report-list">{rows.map((row) => <article key={row.商品}><div><b>{row.商品}</b><small>直接 {formatCurrency(row.直接成本)} + 分摊 {formatCurrency(row.分摊间接成本)}</small></div><div><strong>{formatCurrency(row.单件完整成本)}</strong><small>售价 {formatCurrency(row.当前售价)} · 利润 {formatCurrency(row.单件预计利润)}</small></div></article>)}</div>{!plan && <p className="record-category-hint">先在“月度成本分摊”中保存费用、有效日期和规则，报表才会显示完整分摊结果。</p>}<button className="secondary-action sheet-action" onClick={exportExcel}><Download size={16} />导出 Excel 成本报表</button></section></div>;
}
