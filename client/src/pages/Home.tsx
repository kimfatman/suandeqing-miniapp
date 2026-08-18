/** 商户账簿工作台：首页按“结论—待办—明细”排列，让小商家在每次打开时先知道该做什么。 */
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  BellRing,
  BookOpenCheck,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Coins,
  Home as HomeIcon,
  Info,
  LayoutGrid,
  Menu,
  PackagePlus,
  Plus,
  ReceiptText,
  Settings2,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { MetricCard } from "@/components/MetricCard";
import { PricingPanel } from "@/components/PricingPanel";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { QuickRecordSheet } from "@/components/QuickRecordSheet";
import { BomEditorSheet } from "@/components/BomEditorSheet";
import { QuickCostSheet, QuickCostSave } from "@/components/QuickCostSheet";
import { CostInputs, formatCurrency, getScopeCost } from "@/lib/costEngine";
import {   applyIndustryTemplate, applyQuickCost,
  calculateDirectCost,
  formatBusinessPeriod, getActiveCategories, calculateUnitCost, getBusinessDate, getBusinessPeriod, INDUSTRY_TEMPLATES, IndustryKey, LedgerData, initializeIndustryLedger, LedgerProduct, loadLedger, makeBomVersionSnapshot, makeId, Material, normalizeLedger, persistLedger, recalculateProduct, renameLedgerCategory, SalesRecord, summarizeLedger } from "@/lib/ledgerStore";
import { validateCategoryName, validateMaterialDraft, validateProductName, validateSaleDraft } from "@/lib/validation";

type Tab = "home" | "products" | "business" | "profile";

type ReadinessStage = "record" | "product" | "cost" | "pricing" | "sale" | "analysis";

type Readiness = {
  stage: ReadinessStage;
  label: string;
  title: string;
  description: string;
  actionLabel: string;
};

export function getReadiness(ledger: LedgerData, summary: ReturnType<typeof summarizeLedger>, costLabel: string): Readiness {
  const recordCount = summary.incomeCount + summary.expenseCount;
  const hasProduct = ledger.products.length > 0;
  const hasProductCost = ledger.products.some((product) => product.direct > 0 || product.bom.length > 0);
  const hasPricedProduct = ledger.products.some((product) => product.price > 0);

  if (!recordCount) return { stage: "record", label: "第 1 步 / 经营现金账", title: "先记第一笔采购或支出", description: "录入真实支出后，现金结余和经营趋势才会开始计算。", actionLabel: "记一笔支出" };
  if (!hasProduct) return { stage: "product", label: "第 2 步 / 商品成本", title: "现金账已开始，再建第一个商品", description: "商品是把采购、成本和售价连起来的关键。", actionLabel: "新建商品" };
  if (!hasProductCost) return { stage: "cost", label: "第 3 步 / 商品成本", title: `补齐${costLabel}，成本才有来路`, description: "先补材料、进货或制作成本，再决定售价是否合理。", actionLabel: `补齐${costLabel}` };
  if (!hasPricedProduct) return { stage: "pricing", label: "第 4 步 / 商品定价", title: "先设置售价，再记录销售", description: "成交价必须大于0，才能结转真实收入和成本。", actionLabel: "设置售价" };
  if (!summary.salesCount) return { stage: "sale", label: "第 4 步 / 利润结转", title: "成本已建立，还差第一笔销售", description: "记录销量后，商品成本才会按销量结转为真实经营结果。", actionLabel: "记录第一笔销售" };
  return { stage: "analysis", label: "经营账已就绪", title: "账已开始结转，看看本月经营结果", description: "销售、成本与现金流已形成同一套经营口径。", actionLabel: "查看经营分析" };
}

function getProductPendingLabel(costLabel: string) {
  return `待补${costLabel}`;
}

const initialCostInputs: CostInputs = {
  directCost: 5.6,
  fixedCost: 0.92,
  hiddenCost: 1.3,
  fundingCost: 0.28,
  feeRate: 3,
};

const navItems = [
  { id: "home" as Tab, label: "首页", icon: HomeIcon },
  { id: "products" as Tab, label: "商品", icon: LayoutGrid },
  { id: "business" as Tab, label: "经营", icon: BarChart3 },
  { id: "profile" as Tab, label: "我的", icon: Menu },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [showPricing, setShowPricing] = useState(false);
  const [ledger, setLedger] = useState(() => normalizeLedger(loadLedger()));
  const [activeProductId, setActiveProductId] = useState(1);
  const [showMaterialPanel, setShowMaterialPanel] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [showQuickRecord, setShowQuickRecord] = useState(false);
  const [showSaleRecord, setShowSaleRecord] = useState(false);
  const [showBomEditor, setShowBomEditor] = useState(false);
  const [showQuickCost, setShowQuickCost] = useState(false);
  const [showProductNameSheet, setShowProductNameSheet] = useState(false);
  const [costEditor, setCostEditor] = useState<"hidden" | "funding" | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const currentTemplate = INDUSTRY_TEMPLATES.find((item) => item.key === ledger.profile.industry) ?? INDUSTRY_TEMPLATES[0];
  const [currentCosts, setCurrentCosts] = useState<CostInputs>(() => ({ ...initialCostInputs, ...(ledger.costs ?? {}) }));
  const [selectedPeriod, setSelectedPeriod] = useState(() => getBusinessPeriod());
  const [toast, setToast] = useState<string | null>(null);
  const summary = summarizeLedger(ledger, selectedPeriod);
  const selectedProduct = ledger.products.find((product) => product.id === activeProductId) ?? ledger.products[0] ?? { id: 0, name: "还没有商品", category: "待添加", price: 0, direct: 0, operating: 0, change: "先创建商品", packaging: 0, directLabor: 0, bom: [] };
  const readiness = getReadiness(ledger, summary, currentTemplate.productCostLabel);
  const operatingCost = selectedProduct.operating;
  const fullCost = operatingCost + currentCosts.fundingCost;
  const pricingCosts = { ...currentCosts, directCost: selectedProduct.direct };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const saveSuggestedPrice = (price: number) => {
    setLedger((current) => {
      const next = { ...current, products: current.products.map((item) => item.id === activeProductId ? { ...item, price } : item) };
      persistLedger(next);
      return next;
    });
    setShowPricing(false);
    notify(`已将 ${formatCurrency(price)} 保存为“${selectedProduct.name}”的新售价`);
  };

  const navigate = (tab: Tab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const completeOnboarding = ({ storeName, industry }: { storeName: string; industry: IndustryKey }) => {
    const template = INDUSTRY_TEMPLATES.find((item) => item.key === industry) ?? INDUSTRY_TEMPLATES[0];
    setLedger((current) => {
      const next = initializeIndustryLedger(current, storeName, industry);
      persistLedger(next);
      return next;
    });
    setSelectedPeriod(getBusinessPeriod());
    notify(`已为${storeName}准备好${template.label}成本账本`);
  };

  if (!ledger.profile.onboarded) return <OnboardingFlow initialName={ledger.profile.storeName} onComplete={completeOnboarding} />;

  return (
    <div className="app-shell">
      <aside className="desktop-rail" aria-label="主导航">
        <div className="rail-brand"><BrandMark size={42} /><span>算得清</span></div>
        <div className="rail-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button className={activeTab === id ? "rail-item active" : "rail-item"} onClick={() => navigate(id)} key={id}>
              <Icon size={20} /><span>{label}</span>
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          <span className="demo-pill">演示账本</span>
          <small>数据仅保存在本次预览</small>
        </div>
      </aside>

      <main className="mobile-page">
        <header className="mobile-header">
          <div className="brand-lockup"><BrandMark size={38} /><div><strong>算得清</strong><span>{ledger.profile.storeName} · 小店账簿</span></div></div>
          <button className="icon-button notification-button" onClick={() => notify("本周有 2 项成本需要关注") } aria-label="查看提醒">
            <BellRing size={20} /><i />
          </button>
        </header>

        {activeTab === "home" && (
          <HomeView
            product={selectedProduct}
            materials={ledger.materials}
            summary={summary}
            period={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            operatingCost={operatingCost}
            fullCost={fullCost}
            onPricing={() => setShowPricing(true)}
            onAddMaterial={() => { setEditingMaterialId(null); setShowMaterialPanel(true); }}
            onEditMaterial={(material) => { setEditingMaterialId(material.id); setShowMaterialPanel(true); }}
            onRecord={() => setShowQuickRecord(true)}
            onBusiness={() => navigate("business")}
            readiness={readiness}
            onPrimaryAction={() => {
              if (readiness.stage === "record") setShowQuickRecord(true);
              if (readiness.stage === "product") setShowProductNameSheet(true);
              if (readiness.stage === "cost") { setActiveTab("products"); setShowQuickCost(true); }
              if (readiness.stage === "pricing") setShowPricing(true);
              if (readiness.stage === "sale") setShowSaleRecord(true);
              if (readiness.stage === "analysis") navigate("business");
            }}
          />
        )}
        {activeTab === "products" && (
          <ProductsView
            products={ledger.products}
            activeProductId={activeProductId}
            onSelect={(id) => setActiveProductId(id)}
            onPricing={() => setShowPricing(true)}
            productCostAction={currentTemplate.productCostAction}
            productCostLabel={currentTemplate.productCostLabel}
            onQuickCost={() => setShowQuickCost(true)}
            onBom={() => setShowBomEditor(true)}
            onAdd={() => setShowProductNameSheet(true)}
          />
        )}
        {activeTab === "business" && <BusinessView summary={summary} costs={currentCosts} productCount={ledger.products.length} period={selectedPeriod} onPeriodChange={setSelectedPeriod} onPricing={() => setShowPricing(true)} onRecord={() => setShowQuickRecord(true)} onSale={() => setShowSaleRecord(true)} />}
        {activeTab === "profile" && <ProfileView storeName={ledger.profile.storeName} industry={ledger.profile.industry} categories={ledger.categories} categoryStatus={ledger.categoryStatus} onIndustryChange={(industry) => { setLedger((current) => { const next = applyIndustryTemplate(current, industry); persistLedger(next); return next; }); notify(`已切换为${INDUSTRY_TEMPLATES.find((item) => item.key === industry)?.label ?? "新行业"}模板`); }} onAddCategory={() => { setEditingCategory(""); }} onEditCategory={(category) => setEditingCategory(category)} onToggleCategory={(category) => { setLedger((current) => { const next = { ...current, categoryStatus: { ...current.categoryStatus, [category]: current.categoryStatus?.[category] === false } }; persistLedger(next); return next; }); notify(currentCategoryIsActive(ledger, category) ? `已停用“${category}”，新记账不会再出现` : `已启用“${category}”，可继续用于记账`); }} onHiddenCost={() => setCostEditor("hidden")} onDebt={() => setCostEditor("funding")} />}
      </main>

      <nav className="mobile-tabbar" aria-label="底部导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeTab === id ? "tab-item active" : "tab-item"} onClick={() => navigate(id)}>
            <Icon size={21} strokeWidth={activeTab === id ? 2.7 : 2} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {showPricing && <PricingPanel costs={pricingCosts} onClose={() => setShowPricing(false)} onSave={saveSuggestedPrice} />}
      {showProductNameSheet && <ProductNameSheet onClose={() => setShowProductNameSheet(false)} onSave={(name) => {
        const nextId = Math.max(0, ...ledger.products.map((item) => item.id)) + 1;
        const nextProduct: LedgerProduct = { id: nextId, name, category: getProductPendingLabel(currentTemplate.productCostLabel), price: 0, direct: 0, operating: 0, change: `先补充${currentTemplate.productCostLabel}`, packaging: 0, directLabor: 0, bom: [] };
        setLedger((current) => { const next = { ...current, products: [...current.products, nextProduct] }; persistLedger(next); return next; });
        setActiveProductId(nextId);
        setShowProductNameSheet(false);
        notify(`已新建“${name}”，请继续补充成本和售价`);
      }} />}
      {editingCategory !== null && <CategorySheet initialName={editingCategory} existing={ledger.categories} onClose={() => setEditingCategory(null)} onSave={(name) => { setLedger((current) => { const oldName = editingCategory; const next = oldName ? renameLedgerCategory(current, oldName, name) : { ...current, categories: [...current.categories, name], categoryStatus: { ...current.categoryStatus, [name]: true } }; persistLedger(next); return next; }); setEditingCategory(null); notify(editingCategory ? `已将成本项目改为“${name}”` : `已新增成本项目“${name}”`); }} />}
      {showMaterialPanel && <MaterialSheet suggestion={ledger.materials[0]} editingMaterial={editingMaterialId ? ledger.materials.find((material) => material.id === editingMaterialId) : undefined} onClose={() => { setShowMaterialPanel(false); setEditingMaterialId(null); }} onSave={(material, purchase) => { setLedger((current) => { const materials = editingMaterialId ? current.materials.map((item) => item.id === editingMaterialId ? material : item) : [...current.materials, material]; const products = current.products.map((product) => product.bom.some((item) => item.materialId === material.id) ? recalculateProduct({ ...product, materialUnitCosts: undefined }, materials, current.costs.hiddenCost, current.costs.fixedCost) : product); const shouldRecordPurchase = !editingMaterialId && purchase?.recordPurchase && Number.isFinite(purchase.amount) && purchase.amount > 0; const records = shouldRecordPurchase ? [{ id: makeId(), type: "expense" as const, amount: purchase.amount, category: current.categories[0] ?? "材料采购", note: `${material.name}采购`, date: purchase.date }, ...current.records] : current.records; const next = { ...current, materials, products, records }; persistLedger(next); return next; }); const recordedPurchase = !editingMaterialId && purchase?.recordPurchase; setShowMaterialPanel(false); setEditingMaterialId(null); notify(editingMaterialId ? "已更新原材料，相关商品成本已重新核算；历史销售不受影响" : recordedPurchase ? "已保存原材料，并记入一笔采购现金支出" : "已保存原材料，后续核算会使用新成本"); }} />}
      {showQuickRecord && <QuickRecordSheet categories={getActiveCategories(ledger)} onClose={() => setShowQuickRecord(false)} onRecordSale={() => { setShowQuickRecord(false); setShowSaleRecord(true); }} onSave={(record) => { setLedger((current) => { const next = { ...current, records: [{ id: makeId(), ...record }, ...current.records] }; persistLedger(next); return next; }); setShowQuickRecord(false); notify(record.type === "income" ? "已记入其他收入，经营账已更新" : "已记入支出，成本账已更新"); }} />}
      {showSaleRecord && <SalesRecordSheet products={ledger.products} onClose={() => setShowSaleRecord(false)} onSave={(sale) => { setLedger((current) => { const product = current.products.find((entry) => entry.id === sale.productId); const amount = sale.quantity * sale.unitPrice; const salePeriod = getBusinessPeriod(sale.date); const hiddenSource = current.costs.hiddenCostSource ?? "manual"; const hiddenSnapshot = hiddenSource === "ledger" ? current.records.filter((record) => record.type === "expense" && record.date.startsWith(salePeriod) && record.category === (current.costs.hiddenCostCategory ?? "交通配送")).reduce((sum, record) => sum + Math.max(record.amount, 0), 0) : current.costs.hiddenCost; const enrichedSale: SalesRecord = { ...sale, costVersionId: product?.bomVersions?.at(-1)?.id ?? `current-${sale.date}`, unitDirectCostSnapshot: product ? calculateDirectCost(product, current.materials) : 0, fixedCostSnapshot: current.costs.fixedCost, hiddenCostSnapshot: hiddenSnapshot, hiddenCostSourceSnapshot: hiddenSource, hiddenCostBasisSnapshot: current.costs.hiddenCostBasis ?? "perUnit", fundingCostSnapshot: current.costs.fundingCost, fundingSourceSnapshot: current.costs.fundingSource ?? "manual", costPeriod: salePeriod }; const next = { ...current, sales: [enrichedSale, ...(current.sales ?? [])], records: [{ id: makeId(), type: "income" as const, amount, category: "销售收入", note: `${product?.name ?? "商品"}销售`, date: sale.date }, ...current.records] }; persistLedger(next); return next; }); setShowSaleRecord(false); setSelectedPeriod(getBusinessPeriod(sale.date)); notify("已记录销售，商品成本已结转"); }} />}

      {showQuickCost && <QuickCostSheet product={selectedProduct} template={currentTemplate} onClose={() => setShowQuickCost(false)} onOpenAdvanced={() => { setShowQuickCost(false); setShowBomEditor(true); }} onSave={(draft: QuickCostSave) => { setLedger((current) => { const products = current.products.map((item) => item.id === selectedProduct.id ? applyQuickCost(item, draft, current.materials, currentCosts.hiddenCost, currentCosts.fixedCost, new Date().toISOString().slice(0, 10)) : item); const next = { ...current, products }; persistLedger(next); return next; }); setShowQuickCost(false); notify("已保存快速成本，并生成新的成本版本"); }} />}
      {showBomEditor && <BomEditorSheet product={selectedProduct} materials={ledger.materials} categories={getActiveCategories(ledger)} costLabel={currentTemplate.productCostLabel} costAction={currentTemplate.productCostAction} costEmpty={currentTemplate.productCostEmpty} onClose={() => setShowBomEditor(false)} onSave={(items, settings) => { setLedger((current) => { const products = current.products.map((item) => { if (item.id !== selectedProduct.id) return item; const draftProduct = { ...item, bom: items, costCategory: settings.costCategory, lossRate: settings.lossRate, batchYield: settings.batchYield, materialUnitCosts: settings.costSnapshot?.materialUnitCosts, packaging: settings.costSnapshot?.packaging ?? item.packaging, directLabor: settings.costSnapshot?.directLabor ?? item.directLabor }; const recalculated = recalculateProduct(draftProduct, current.materials, currentCosts.hiddenCost, currentCosts.fixedCost); const nextVersion = makeBomVersionSnapshot(draftProduct, current.materials, settings, new Date().toISOString().slice(0, 10)); return { ...recalculated, category: items.length || recalculated.direct > 0 ? "已补齐成本" : getProductPendingLabel(currentTemplate.productCostLabel), bomVersions: [...(item.bomVersions ?? []), nextVersion] }; }); const next = { ...current, products }; persistLedger(next); return next; }); setShowBomEditor(false); notify(`已保存${currentTemplate.productCostLabel}，并生成新的成本版本`); }} />}
      {costEditor && <CostSettingsSheet type={costEditor} value={costEditor === "hidden" ? currentCosts.hiddenCost : currentCosts.fundingCost} onClose={() => setCostEditor(null)} onSave={(value) => { const nextCosts = { ...currentCosts, [costEditor === "hidden" ? "hiddenCost" : "fundingCost"]: value }; setCurrentCosts(nextCosts); setLedger((current) => { const next = { ...current, costs: nextCosts, products: costEditor === "hidden" ? current.products.map((product) => recalculateProduct(product, current.materials, nextCosts.hiddenCost, nextCosts.fixedCost)) : current.products }; persistLedger(next); return next; }); setCostEditor(null); notify(costEditor === "hidden" ? "已更新隐形成本，经营成本已重新计算" : "已更新资金成本，完整成本已重新计算"); }} />}
      {toast && <div className="app-toast"><CheckBadge />{toast}</div>}
    </div>
  );
}

function HomeView({
  product,
  materials,
  summary,
  period,
  onPeriodChange,
  operatingCost,
  fullCost,
  onPricing,
  onAddMaterial,
  onEditMaterial,
  onRecord,
  onBusiness,
  readiness,
  onPrimaryAction,
}: {
  product: LedgerProduct;
  materials: Material[];
  summary: ReturnType<typeof summarizeLedger>;
  period: string;
  onPeriodChange: (period: string) => void;
  operatingCost: number;
  fullCost: number;
  onPricing: () => void;
  onAddMaterial: () => void;
  onEditMaterial: (material: Material) => void;
  onRecord: () => void;
  onBusiness: () => void;
  readiness: Readiness;
  onPrimaryAction: () => void;
}) {
  const hasSalesResult = summary.salesCount > 0;
  const profitStatus = hasSalesResult ? `已按 ${summary.salesCount} 笔销售结转` : "利润待补：还差销售记录";
  const primaryIcon = readiness.stage === "record" ? <ReceiptText size={19} /> : readiness.stage === "product" ? <Plus size={19} /> : readiness.stage === "cost" ? <PackagePlus size={19} /> : readiness.stage === "pricing" ? <Sparkles size={19} /> : readiness.stage === "sale" ? <ShoppingBag size={19} /> : <BarChart3 size={19} />;
  return (
    <div className="page-content home-content">
      <section className="period-row">
        <div><span className="eyebrow">{formatBusinessPeriod(period)}</span><h1>经营总览</h1></div>
        <PeriodPicker period={period} onChange={onPeriodChange} />
      </section>

      <section className="hero-ledger-card">
        <div className="hero-card-top"><span className="ledger-tab">{formatBusinessPeriod(period)} · 手上现金</span><span className={hasSalesResult ? "ledger-stamp" : "ledger-stamp pending"}>{hasSalesResult ? "利润已结转" : "利润待补"}</span></div>
        <div className="ledger-card-heading"><span>现金结余</span><BookOpenCheck size={18} /></div>
        <strong>{formatCurrency(summary.cashBalance)}</strong>
        <p><b>{profitStatus}</b></p>
        <div className="ledger-card-foot"><span><b>{summary.incomeCount + summary.expenseCount}</b> 笔流水</span><button onClick={onBusiness}>经营账 <ArrowRight size={16} /></button></div>
      </section>

      <section className="overview-chart-card" aria-label="选定月份收入与支出概览">
        <div className="chart-heading"><div><span className="eyebrow">{formatBusinessPeriod(period)}</span><h2>收支走势</h2></div><span className="chart-summary-value">{formatCurrency(summary.cashBalance)} <small>结余</small></span></div>
        <MiniTrendChart series={summary.dailySeries} />
      </section>

      <section className="readiness-card" aria-label="经营账下一步">
        <div className="readiness-copy"><span className="eyebrow">下一步</span><h2>{readiness.title}</h2></div>
        <button className="primary-action readiness-action" onClick={onPrimaryAction}>{primaryIcon}{readiness.actionLabel}<ArrowRight size={16} /></button>
      </section>

      <section className="section-heading compact"><div><span className="eyebrow">商品成本</span><h2>{product.name}</h2></div></section>
      <section className="cost-composition-card" aria-label="商品成本构成图">
        <CostCompositionChart product={product} operatingCost={operatingCost} fullCost={fullCost} />
      </section>
      <section className="sample-materials-card" aria-label="行业示例材料">
        <div className="section-heading compact"><div><span className="eyebrow">材料</span><h2>采购成本</h2></div><button onClick={onAddMaterial}>新增 <Plus size={14} /></button></div>
        {materials.length ? <div className="sample-material-list">{materials.slice(0, 4).map((material) => <button key={material.id} className="sample-material-row" onClick={() => onEditMaterial(material)}><span><strong>{material.name}</strong><small>{material.source} · {material.unit}</small></span><b>{formatCurrency(material.unitCost)} / {material.unit}</b><ChevronRight size={15} /></button>)}</div> : <div className="sample-material-empty"><PackagePlus size={20} /><span>还没有材料</span><button onClick={onAddMaterial}>添加材料 <ArrowRight size={14} /></button></div>}
      </section>
    </div>
  );
}

function PeriodPicker({ period, onChange }: { period: string; onChange: (period: string) => void }) {
  return <label className="range-chip period-picker"><input aria-label="选择经营月份" type="month" value={period} onChange={(event) => onChange(event.target.value)} /></label>;
}

function MiniTrendChart({ series }: { series: ReturnType<typeof summarizeLedger>["dailySeries"] }) {
  const values = series.flatMap((item) => [item.income, item.expenses]);
  const max = Math.max(...values, 1);
  const points = (key: "income" | "expenses") => series.map((item, index) => `${(index / Math.max(series.length - 1, 1)) * 100},${92 - (item[key] / max) * 76}`).join(" ");
  const hasData = series.some((item) => item.income > 0 || item.expenses > 0);
  if (!hasData) return <div className="mini-chart-empty"><BarChart3 size={20} /><span>暂无收支</span></div>;
  return <div className="mini-trend-wrap"><svg className="mini-trend-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="本月收入与支出趋势"><line x1="0" y1="92" x2="100" y2="92" /><polyline className="trend-income" points={points("income")} /><polyline className="trend-expense" points={points("expenses")} />{series.map((item, index) => { const x = (index / Math.max(series.length - 1, 1)) * 100; return <g key={item.label}><circle className="trend-income-dot" cx={x} cy={92 - (item.income / max) * 76} r="1.8" /><circle className="trend-expense-dot" cx={x} cy={92 - (item.expenses / max) * 76} r="1.8" /></g>; })}</svg><div className="mini-chart-labels"><span>{series[0]?.label ?? ""}</span><span>{series.at(-1)?.label ?? ""}</span></div><div className="mini-chart-legend"><span><i className="income-dot" />收入</span><span><i className="expense-dot" />支出</span></div></div>;
}

function CostCompositionChart({ product, operatingCost, fullCost }: { product: LedgerProduct; operatingCost: number; fullCost: number }) {
  const direct = Math.max(product.direct, 0);
  const operatingAdd = Math.max(operatingCost - direct, 0);
  const fundingAdd = Math.max(fullCost - operatingCost, 0);
  const total = Math.max(fullCost, direct, 0);
  if (total <= 0) return <div className="cost-composition-empty"><BarChart3 size={20} /><strong>还没有成本</strong></div>;
  return <div className="cost-composition-chart"><div className="composition-track" role="img" aria-label={`直接成本${formatCurrency(direct)}，经营分摊${formatCurrency(operatingAdd)}，资金成本${formatCurrency(fundingAdd)}`}><span className="composition-direct" style={{ width: `${direct / total * 100}%` }} /><span className="composition-operating" style={{ width: `${operatingAdd / total * 100}%` }} /><span className="composition-funding" style={{ width: `${fundingAdd / total * 100}%` }} /></div><div className="composition-legend"><span><i className="composition-direct-dot" />直接 <b>{formatCurrency(direct)}</b></span><span><i className="composition-operating-dot" />经营 <b>{formatCurrency(operatingAdd)}</b></span><span><i className="composition-funding-dot" />资金 <b>{formatCurrency(fundingAdd)}</b></span></div></div>;
}

function CashFlowChart({ series, onRecord }: { series: ReturnType<typeof summarizeLedger>["dailySeries"]; onRecord: () => void }) {
  const max = Math.max(...series.flatMap((item) => [item.income, item.expenses]), 1);
  const hasData = series.some((item) => item.income > 0 || item.expenses > 0);
  if (!hasData) return <section className="cash-flow-chart chart-card"><div className="chart-heading"><div><span className="eyebrow">现金流</span><h2>暂无记录</h2></div></div><div className="chart-empty" role="status"><button type="button" onClick={onRecord}>记一笔 <ArrowRight size={14} /></button></div></section>;
  return <section className="cash-flow-chart chart-card" aria-label="现金流走势"><div className="chart-heading"><div><span className="eyebrow">现金流</span><h2>收支</h2></div><span className="legend"><i />收入 <i className="green" />流出</span></div><div className="cash-flow-bars">{series.map((item) => <div className="cash-flow-day" key={item.label}><div className="cash-flow-columns"><span className="cash-income-bar" style={{ height: `${Math.max(item.income / max * 100, item.income ? 7 : 0)}%` }} title={`收入 ${formatCurrency(item.income)}`} /><span className="cash-expense-bar" style={{ height: `${Math.max(item.expenses / max * 100, item.expenses ? 7 : 0)}%` }} title={`流出 ${formatCurrency(item.expenses)}`} /></div><small>{item.label}</small></div>)}</div></section>;
}

export function ProductsView({ products, activeProductId, onSelect, onPricing, productCostAction, productCostLabel, onQuickCost, onBom, onAdd }: { products: LedgerProduct[]; activeProductId: number; onSelect: (id: number) => void; onPricing: () => void; productCostAction: string; productCostLabel: string; onQuickCost: () => void; onBom: () => void; onAdd: () => void }) {
  if (!products.length) return <div className="page-content product-content empty-product-page"><section className="empty-state-card"><span className="eyebrow">商品</span><h1>还没有商品</h1><button className="primary-action" onClick={onAdd}><Plus size={18} /> 新建商品</button></section></div>;
  const selected = products.find((product) => product.id === activeProductId) ?? products[0];
  const margin = selected.price > 0 ? ((selected.price - selected.operating) / selected.price) * 100 : 0;
  const needsCost = selected.direct <= 0 && selected.bom.length === 0;
  const needsPricing = selected.price <= 0;
  return (
    <div className="page-content product-content">
      <section className="period-row"><div><span className="eyebrow">商品</span><h1>商品成本</h1></div><button className="round-plus" onClick={onAdd} aria-label="新增商品"><Plus size={21} /></button></section>
      <section className="product-list">
        {products.map((product) => {
          const productStatus = product.category === "待完善配方" ? getProductPendingLabel(productCostLabel) : product.category;
          return <button key={product.id} className={activeProductId === product.id ? "product-row selected" : "product-row"} onClick={() => onSelect(product.id)}>
            <div className="product-symbol"><ShoppingBag size={21} /></div>
            <div className="product-main"><strong>{product.name}</strong><span>{productStatus}{product.costCategory ? ` · ${product.costCategory}` : ""}</span></div>
            <div className="product-data"><b>{product.price ? formatCurrency(product.price) : "未定价"}</b><span>{product.price ? `经营利润率 ${((product.price - product.operating) / product.price * 100).toFixed(0)}%` : product.change}</span></div>
            <ChevronRight size={17} />
          </button>;
        })}
      </section>
      <section className="product-detail-card">
        <div className="detail-card-title"><div><h2>{selected.name}</h2></div><span className={needsCost ? "status-pill warning" : "status-pill"}>{needsCost ? `待补${productCostLabel}` : needsPricing ? "待定价" : "已核算"}</span></div>
        <div className="product-chart-summary"><span>成本 <b>{formatCurrency(selected.operating)}</b></span><span>利润率 <b>{selected.price ? `${margin.toFixed(1)}%` : "—"}</b></span></div>
        <CostCompositionChart product={selected} operatingCost={selected.operating} fullCost={selected.operating + 0.28} />
        <div className="product-action-pair"><button className="primary-action quick-cost-entry" onClick={onQuickCost}><Coins size={18} /><span>{needsCost ? "录入成本" : "更新成本"}<small>最多两项</small></span></button><button className="secondary-card-action" onClick={onBom}><ClipboardList size={17} /> {productCostAction}</button><button className={!needsCost && needsPricing ? "primary-action" : "secondary-card-action"} onClick={onPricing}><Sparkles size={18} /> {needsPricing ? "设置售价" : "定价建议"}</button></div>
      </section>
    </div>
  );
}

function BusinessView({ summary, costs, productCount, period, onPeriodChange, onPricing, onRecord, onSale }: { summary: ReturnType<typeof summarizeLedger>; costs: CostInputs; productCount: number; period: string; onPeriodChange: (period: string) => void; onPricing: () => void; onRecord: () => void; onSale: () => void }) {
  const [activeLabel, setActiveLabel] = useState(summary.dailySeries.at(-1)?.label ?? "");
  const [showCashDetails, setShowCashDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const chartKey = summary.dailySeries.map((item) => `${item.label}:${item.income}:${item.expenses}`).join("|");
  const maxValue = Math.max(...summary.dailySeries.flatMap((item) => [item.income, item.expenses]), 1);
  const activeItem = summary.dailySeries.find((item) => item.label === activeLabel) ?? summary.dailySeries.at(-1);
  const hasTrendData = summary.dailySeries.some((item) => item.income > 0 || item.expenses > 0);
  const materialTotal = Object.entries(summary.categoryTotals).filter(([category]) => /采购|进货|材料|货品/.test(category)).reduce((total, [, value]) => total + value, 0);
  const hiddenTotal = Math.max(summary.expenses - materialTotal, 0);

  useEffect(() => {
    setActiveLabel(summary.dailySeries.at(-1)?.label ?? "");
    setIsRefreshing(true);
    const timer = window.setTimeout(() => setIsRefreshing(false), 420);
    return () => window.clearTimeout(timer);
  }, [chartKey]);

  return (
    <div className="page-content business-content">
      <section className="period-row"><div><span className="eyebrow">{formatBusinessPeriod(period)}</span><h1>经营</h1></div><PeriodPicker period={period} onChange={onPeriodChange} /></section>
      <section className={`cash-flow-card ${isRefreshing ? "is-refreshing" : ""}`}>
        <div className="cash-flow-copy"><span>现金流出 <button className="micro-info" aria-label="查看现金流压力说明" aria-expanded={showCashDetails} onClick={() => setShowCashDetails((current) => !current)}><Info size={13} /></button></span><h2>{formatCurrency(summary.cashOutflow)}</h2>{summary.cashOutflow > 0 ? <p>本金 {formatCurrency(summary.principalRepayment)} · 利息 {formatCurrency(summary.financingCosts)}</p> : <p className="cash-flow-empty">暂无支出</p>}{showCashDetails && <div className="cash-flow-detail" role="status">本金只影响现金；利息计入成本。</div>}</div><div className="cash-orbit" aria-hidden="true"><CircleDollarSign size={32} /><span>{isRefreshing ? "更新中" : "本期"}</span></div>
      </section>
      {!hasTrendData && !summary.salesCount ? <section className="analysis-readiness chart-card"><span className="eyebrow">准备度</span><h2>完成三步再看分析</h2><div className="analysis-steps"><span className={summary.incomeCount + summary.expenseCount ? "done" : ""}>1. 流水</span><span className={productCount ? "done" : ""}>2. 商品</span><span className={summary.salesCount ? "done" : ""}>3. 销售</span></div><button type="button" className="primary-action" onClick={summary.incomeCount + summary.expenseCount ? (productCount ? onSale : onRecord) : onRecord}>{summary.incomeCount + summary.expenseCount ? (productCount ? "记录第一笔销售" : "新建商品") : "记一笔"}<ArrowRight size={15} /></button></section> : <CashFlowChart series={summary.dailySeries} onRecord={onRecord} />}
      {summary.salesCount > 0 && <section className="sales-result-card"><div><span className="eyebrow">销售结转</span><h2>{summary.salesCount} 笔销售 · {summary.salesQuantity} 份</h2></div><div className="sales-result-grid"><span>销售收入 <b>{formatCurrency(summary.salesRevenue)}</b></span><span>销货成本 <b>{formatCurrency(summary.costOfSales)}</b></span><span>商品毛利 <b>{formatCurrency(summary.grossProfit)}</b></span><span>经营结果 <b>{formatCurrency(summary.operatingResult)}</b></span></div></section>}
      {(hasTrendData || summary.salesCount > 0) && <section className={`chart-card ${isRefreshing ? "is-refreshing" : ""}`} aria-label="经营趋势图表"><div className="chart-heading"><div><span className="eyebrow">趋势</span><h2>收入与成本</h2></div><span className="legend"><i />收入 <i className="green" />成本</span></div>{isRefreshing && <div className="chart-loading" role="status" aria-live="polite"><span className="loading-sweep" />更新中</div>}{hasTrendData ? <><div className="bar-chart" role="list" aria-label="按日期查看收入和经营成本">{summary.dailySeries.map((item) => <button type="button" className={`bar-pair ${activeItem?.label === item.label ? "is-active" : ""}`} key={item.label} onMouseEnter={() => setActiveLabel(item.label)} onFocus={() => setActiveLabel(item.label)} onClick={() => setActiveLabel(item.label)} aria-label={`${item.label}，收入${formatCurrency(item.income)}，经营成本${formatCurrency(item.expenses)}`} role="listitem"><span className="income-bar" aria-hidden="true" style={{ height: `${Math.max((item.income / maxValue) * 100, item.income ? 8 : 0)}%` }} /><span className="expense-bar" aria-hidden="true" style={{ height: `${Math.max((item.expenses / maxValue) * 100, item.expenses ? 8 : 0)}%` }} /></button>)}</div><div className="chart-labels">{summary.dailySeries.map((item) => <button type="button" className={activeItem?.label === item.label ? "is-active" : ""} onClick={() => setActiveLabel(item.label)} key={item.label}>{item.label}</button>)}</div>{activeItem && <div className="chart-tooltip" role="status"><b>{activeItem.label}</b><span><i className="income-dot" />收入 {formatCurrency(activeItem.income)}</span><span><i className="expense-dot" />成本 {formatCurrency(activeItem.expenses)}</span></div>}</> : null}</section>}
      <section className="section-heading compact"><div><span className="eyebrow">成本</span><h2>{formatBusinessPeriod(period)}构成</h2></div></section>
      <section className="ledger-lines">
        <LineItem icon={<Coins size={18} />} label="已记录支出" value={formatCurrency(summary.expenses)} width={`${summary.expenses ? Math.min(summary.expenses / Math.max(summary.income, summary.expenses) * 100, 100) : 0}%`} color="blue" />
        {hiddenTotal > 0 && <LineItem icon={<ClipboardList size={18} />} label="非采购支出" value={formatCurrency(hiddenTotal)} width={`${summary.expenses ? Math.min(hiddenTotal / summary.expenses * 100, 100) : 0}%`} color="green" />}
        {costs.fixedCost > 0 && <LineItem icon={<Banknote size={18} />} label="固定分摊" value={formatCurrency(costs.fixedCost)} width={`${Math.min(costs.fixedCost / Math.max(summary.expenses, 1) * 100, 100)}%`} color="navy" />}
        {summary.financingCosts > 0 && <LineItem icon={<WalletCards size={18} />} label="资金成本" value={formatCurrency(summary.financingCosts)} width={`${Math.min(summary.financingCosts / Math.max(summary.expenses, 1) * 100, 100)}%`} color="amber" />}
      </section>
      <div className="business-actions"><button className="secondary-action" onClick={onSale}><ReceiptText size={18} /> 记销售并结转成本</button><button className="secondary-action" onClick={onPricing}><Sparkles size={18} /> 看看商品是否需要调价</button></div>
    </div>
  );
}

export function ProfileView({ storeName, industry, categories, categoryStatus, onIndustryChange, onAddCategory, onEditCategory, onToggleCategory, onHiddenCost, onDebt }: { storeName: string; industry: IndustryKey; categories: string[]; categoryStatus?: Record<string, boolean>; onIndustryChange: (industry: IndustryKey) => void; onAddCategory: () => void; onEditCategory: (category: string) => void; onToggleCategory: (category: string) => void; onHiddenCost: () => void; onDebt: () => void }) {
  const template = INDUSTRY_TEMPLATES.find((item) => item.key === industry) ?? INDUSTRY_TEMPLATES[0];
  const industryName = template.label;
  return (
    <div className="page-content profile-content">
      <section className="profile-hero"><div className="profile-mark"><BrandMark size={54} /></div><div><span>{industryName}</span><h1>{storeName}</h1></div><button className="icon-button"><Settings2 size={20} /></button></section>
      <section className="profile-data-boundary" role="status"><BookOpenCheck size={16} /><span><b>仅保存在当前设备</b><small>切换行业不会删除已有账本。</small></span></section>
      <section className="setting-group"><span className="group-label">行业</span><div className="industry-switcher" role="list" aria-label="选择行业模板">{INDUSTRY_TEMPLATES.map((template) => <button key={template.key} className={template.key === industry ? "industry-switch-card active" : "industry-switch-card"} onClick={() => onIndustryChange(template.key)}><span className="industry-switch-symbol">{template.shortLabel.slice(0, 1)}</span><span><b>{template.label}</b></span>{template.key === industry && <CheckBadge />}</button>)}</div></section>
      <section className="setting-group"><div className="setting-group-heading"><span className="group-label">成本项目</span><button className="text-action" onClick={onAddCategory}><Plus size={14} />新增</button></div><div className="custom-category-list">{categories.map((category) => { const active = categoryStatus?.[category] !== false; return <div className={active ? "custom-category-row" : "custom-category-row disabled"} key={category}><button className="category-name-button" onClick={() => onEditCategory(category)}><span>{category}</span><small>{active ? "启用" : "停用"}</small></button><button className="category-toggle" aria-label={`${active ? "停用" : "启用"}${category}`} onClick={() => onToggleCategory(category)}>{active ? "停用" : "启用"}</button><ChevronRight size={16} /></div>; })}</div></section><section className="setting-group"><span className="group-label">经营口径</span><SettingItem icon={<ClipboardList size={19} />} label="隐形成本" note={template.hiddenCostCategory} onClick={onHiddenCost} /><SettingItem icon={<WalletCards size={19} />} label="资金成本" note="仅利息和融资费" onClick={onDebt} /><SettingItem icon={<ReceiptText size={19} />} label="默认分摊" note="按销量" onClick={() => undefined} /></section>
      <section className="setting-group"><span className="group-label">数据</span><SettingItem icon={<BookOpenCheck size={19} />} label="成本口径" note="直接 · 经营 · 完整" onClick={() => undefined} /><SettingItem icon={<Settings2 size={19} />} label="数据管理" note="导出与隐私" onClick={() => undefined} /></section>
    </div>
  );
}

export function ProductNameSheet({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const save = () => {
    const trimmed = name.trim();
    const error = validateProductName(trimmed);
    if (error) { setValidationError(error); return; }
    onSave(trimmed);
  };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet product-name-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">商品</span><h2>新建商品</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></header><label className="field-block"><span>商品名称</span><div className="money-input"><input autoFocus value={name} maxLength={40} placeholder="例如：招牌冰咖啡" onChange={(event) => { setName(event.target.value); setValidationError(null); }} onKeyDown={(event) => { if (event.key === "Enter") save(); }} /><b>{name.length}/40</b></div></label>{validationError && <p className="field-error" role="alert">{validationError}</p>}<button className="primary-action sheet-save-button" onClick={save}>创建商品 <ArrowRight size={16} /></button></section></div>;
}

export function MaterialSheet({ suggestion, editingMaterial, onClose, onSave }: { suggestion?: Material; editingMaterial?: Material; onClose: () => void; onSave: (material: Material, purchase?: { amount: number; recordPurchase: boolean; date: string }) => void }) {
  const [name, setName] = useState(editingMaterial?.name ?? suggestion?.name ?? "示例材料");
  const [amount, setAmount] = useState(String(Math.max((editingMaterial?.unitCost ?? 1) * 24, 0.01)));
  const [quantity, setQuantity] = useState("24");
  const [purchaseUnit, setPurchaseUnit] = useState(editingMaterial?.purchaseUnit ?? "盒");
  const [usageUnit, setUsageUnit] = useState(editingMaterial?.unit ?? "个");
  const [conversionFactor, setConversionFactor] = useState(String(editingMaterial?.conversionFactor ?? 1));
  const [recordPurchase, setRecordPurchase] = useState(!editingMaterial);
  const [businessDate, setBusinessDate] = useState(getBusinessDate);
  const [validationError, setValidationError] = useState<string | null>(null);
  const purchaseAmount = Number(amount);
  const purchaseQuantity = Number(quantity);
  const factor = Number(conversionFactor);
  const validNumbers = Number.isFinite(purchaseAmount) && purchaseAmount > 0 && Number.isFinite(purchaseQuantity) && purchaseQuantity > 0 && Number.isFinite(factor) && factor > 0;
  const unitCost = validNumbers ? calculateUnitCost(purchaseAmount, purchaseQuantity, factor) : 0;
  const save = () => {
    const error = validateMaterialDraft({ name, amount: purchaseAmount, quantity: purchaseQuantity, conversionFactor: factor });
    if (error) { setValidationError(error); return; }
    const material = { id: editingMaterial?.id ?? makeId(), name: name.trim(), unit: usageUnit, unitCost, source: `采购${purchaseQuantity}${purchaseUnit}，每${purchaseUnit}折算${factor}${usageUnit}`, purchaseUnit, conversionFactor: factor };
    if (editingMaterial) onSave(material);
    else onSave(material, { amount: purchaseAmount, recordPurchase, date: businessDate });
  };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">材料</span><h2>{editingMaterial ? "编辑材料" : "新增材料"}</h2></div><button className="icon-button" onClick={onClose}>×</button></header><label className="field-block"><span>材料名称</span><div className="money-input"><input value={name} placeholder={suggestion ? `例如：${suggestion.name}` : "例如：瓶装饮用水"} onChange={(event) => { setName(event.target.value); setValidationError(null); }} /><b>名称</b></div></label><div className="two-fields"><label className="field-block"><span>采购金额</span><div className="money-input"><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setValidationError(null); }} /><b>元</b></div></label><label className="field-block"><span>采购数量</span><div className="money-input"><input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => { setQuantity(event.target.value); setValidationError(null); }} /><b>{purchaseUnit}</b></div></label></div><div className="two-fields"><label className="field-block"><span>采购单位</span><select value={purchaseUnit} onChange={(event) => setPurchaseUnit(event.target.value)}><option value="盒">盒</option><option value="箱">箱</option><option value="袋">袋</option><option value="瓶">瓶</option></select></label><label className="field-block"><span>使用单位</span><select value={usageUnit} onChange={(event) => setUsageUnit(event.target.value)}><option value="个">个</option><option value="瓶">瓶</option><option value="克">克</option><option value="毫升">毫升</option><option value="套">套</option></select></label></div><label className="field-block"><span>每{purchaseUnit}折算</span><div className="money-input"><input type="number" min="0.0001" step="0.0001" value={conversionFactor} onChange={(event) => { setConversionFactor(event.target.value); setValidationError(null); }} /><b>{usageUnit}</b></div></label>{!editingMaterial && <label className="field-block business-date-field"><span>业务日期</span><input aria-label="采购业务日期" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></label>}<div className="material-preview"><span>单位成本</span><strong>{formatCurrency(unitCost)} / {usageUnit}</strong><p>金额 ÷ 数量 ÷ 换算</p></div>{!editingMaterial && <label className="material-cash-toggle"><input type="checkbox" checked={recordPurchase} onChange={(event) => setRecordPurchase(event.target.checked)} /><span><b>同时记采购支出</b><small>影响选定月份现金；取消则只更新成本。</small></span></label>}{validationError && <p className="form-error" role="alert">{validationError}</p>}<button className="primary-action sheet-action" onClick={save}><CheckBadge /> {editingMaterial ? "保存修改" : "保存材料"}</button></section></div>;
}

export function SalesRecordSheet({ products, onClose, onSave }: { products: LedgerProduct[]; onClose: () => void; onSave: (sale: SalesRecord) => void }) {
  const [productId, setProductId] = useState(products[0]?.id ?? 0);
  const selected = products.find((product) => product.id === productId) ?? products[0];
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(String(selected?.price ?? 0));
  const [date, setDate] = useState(getBusinessDate);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(unitPrice);
    const validationError = validateSaleDraft({ quantity: parsedQuantity, unitPrice: parsedPrice, date, productPrice: selected?.price });
    if (!selected || validationError) {
      setError(validationError ?? "请选择商品后再保存。 ");
      return;
    }
    onSave({ id: makeId(), productId: selected.id, quantity: parsedQuantity, unitPrice: parsedPrice, date, note: "" });
  };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">销售</span><h2>记录销售</h2></div><button className="icon-button" onClick={onClose}>×</button></header><label className="field-block"><span>商品</span><select value={productId} onChange={(event) => { const nextId = Number(event.target.value); setProductId(nextId); const next = products.find((product) => product.id === nextId); setUnitPrice(String(next?.price ?? 0)); setError(null); }}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><div className="two-fields"><label className="field-block"><span>数量</span><div className="money-input"><input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(null); }} /><b>份</b></div></label><label className="field-block"><span>成交价</span><div className="money-input"><input aria-label="销售成交价" type="number" min="0.01" step="0.01" value={unitPrice} onChange={(event) => { setUnitPrice(event.target.value); setError(null); }} /><b>元</b></div></label></div><label className="field-block business-date-field"><span>业务日期</span><input aria-label="销售业务日期" type="date" value={date} onChange={(event) => { setDate(event.target.value); setError(null); }} /></label>{selected?.price <= 0 && <p className="record-category-hint">该商品尚未定价，请先设置售价后再结转。</p>}<div className="material-preview"><span>销售收入</span><strong>{formatCurrency((Number(quantity) || 0) * (Number(unitPrice) || 0))}</strong><p>同时结转收入和商品成本。</p></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action sheet-action" onClick={save}><CheckBadge /> 保存并结转</button></section></div>;
}

function CostSettingsSheet({ type, value, onClose, onSave }: { type: "hidden" | "funding"; value: number; onClose: () => void; onSave: (value: number) => void }) {
  const [amount, setAmount] = useState(value);
  const title = type === "hidden" ? "隐形成本" : "资金成本";
  const description = type === "hidden" ? "人工、配送等经营成本。" : "只填利息和融资费；本金只影响现金。";
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">经营成本</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="cost-setting-note"><Info size={17} /><p>{description}</p></div><label className="field-block"><span>每份金额</span><div className="money-input"><input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /><b>元</b></div></label><button className="primary-action sheet-action" onClick={() => onSave(Math.max(amount || 0, 0))}><CheckBadge /> 保存</button></section></div>;
}

function currentCategoryIsActive(ledger: LedgerData, category: string) { return ledger.categoryStatus?.[category] !== false; }

export function CategorySheet({ initialName, existing, onClose, onSave }: { initialName: string | null; existing: string[]; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = () => { const errorMessage = validateCategoryName(name, existing.filter((item) => item !== initialName)); if (errorMessage) { setError(errorMessage); return; } onSave(name.trim()); };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet product-name-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">成本项目</span><h2>{initialName ? "编辑项目" : "新增项目"}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></header><label className="field-block"><span>项目名称</span><div className="money-input"><input autoFocus maxLength={20} value={name} placeholder="例如：平台佣金、工具折旧" onChange={(event) => { setName(event.target.value); setError(null); }} /><b>{name.length}/20</b></div></label>{error && <p className="field-error" role="alert">{error}</p>}<button className="primary-action sheet-save-button" onClick={save}>{initialName ? "保存修改" : "添加项目"} <ArrowRight size={16} /></button></section></div>;
}

function SettingItem({ icon, label, note, onClick }: { icon: React.ReactNode; label: string; note: string; onClick: () => void }) {
  return <button className="setting-item" onClick={onClick}><span className="setting-icon">{icon}</span><span><b>{label}</b><small>{note}</small></span><ChevronRight size={18} /></button>;
}

function LineItem({ icon, label, value, width, color }: { icon: React.ReactNode; label: string; value: string; width: string; color: string }) {
  return <article className="line-item"><div className={`line-icon ${color}`}>{icon}</div><div className="line-body"><span>{label}</span><div className="line-track"><i className={color} style={{ width }} /></div></div><b>{value}</b></article>;
}

function CheckBadge() { return <span className="check-badge">✓</span>; }
