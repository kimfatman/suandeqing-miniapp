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
import { CostInputs, formatCurrency, getScopeCost } from "@/lib/costEngine";
import { calculateDirectCost, calculateUnitCost, INDUSTRY_TEMPLATES, IndustryKey, LedgerProduct, loadLedger, makeBomVersionSnapshot, makeId, Material, normalizeLedger, persistLedger, recalculateProduct, SalesRecord, summarizeLedger } from "@/lib/ledgerStore";
import { validateMaterialDraft, validateProductName } from "@/lib/validation";

type Tab = "home" | "products" | "business" | "profile";

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
  const [showQuickRecord, setShowQuickRecord] = useState(false);
  const [showSaleRecord, setShowSaleRecord] = useState(false);
  const [showBomEditor, setShowBomEditor] = useState(false);
  const [showProductNameSheet, setShowProductNameSheet] = useState(false);
  const [costEditor, setCostEditor] = useState<"hidden" | "funding" | null>(null);
  const [currentCosts, setCurrentCosts] = useState<CostInputs>(() => ({ ...initialCostInputs, ...(ledger.costs ?? {}) }));
  const [toast, setToast] = useState<string | null>(null);
  const summary = summarizeLedger(ledger);
  const selectedProduct = ledger.products.find((product) => product.id === activeProductId) ?? ledger.products[0];
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
      const next = { ...current, profile: { ...current.profile, storeName, industry, onboarded: true }, categories: template.categories };
      persistLedger(next);
      return next;
    });
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
            summary={summary}
            operatingCost={operatingCost}
            fullCost={fullCost}
            onPricing={() => setShowPricing(true)}
            onAddMaterial={() => setShowMaterialPanel(true)}
            onRecord={() => setShowQuickRecord(true)}
            onBusiness={() => navigate("business")}
          />
        )}
        {activeTab === "products" && (
          <ProductsView
            products={ledger.products}
            activeProductId={activeProductId}
            onSelect={(id) => setActiveProductId(id)}
            onPricing={() => setShowPricing(true)}
            onBom={() => setShowBomEditor(true)}
            onAdd={() => setShowProductNameSheet(true)}
          />
        )}
        {activeTab === "business" && <BusinessView summary={summary} costs={currentCosts} onPricing={() => setShowPricing(true)} onRecord={() => setShowQuickRecord(true)} onSale={() => setShowSaleRecord(true)} />}
        {activeTab === "profile" && <ProfileView storeName={ledger.profile.storeName} industry={ledger.profile.industry} onHiddenCost={() => setCostEditor("hidden")} onDebt={() => setCostEditor("funding")} />}
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
        const nextId = Math.max(...ledger.products.map((item) => item.id)) + 1;
        const nextProduct: LedgerProduct = { id: nextId, name, category: "待完善配方", price: 0, direct: 0, operating: 0, change: "先补充成本", packaging: 0, directLabor: 0, bom: [] };
        setLedger((current) => { const next = { ...current, products: [...current.products, nextProduct] }; persistLedger(next); return next; });
        setActiveProductId(nextId);
        setShowProductNameSheet(false);
        notify(`已新建“${name}”，请继续补充成本和售价`);
      }} />}
      {showMaterialPanel && <MaterialSheet onClose={() => setShowMaterialPanel(false)} onSave={(material) => { setLedger((current) => { const next = { ...current, materials: [...current.materials, material] }; persistLedger(next); return next; }); setShowMaterialPanel(false); notify("已保存原材料，后续核算会使用新成本"); }} />}
      {showQuickRecord && <QuickRecordSheet categories={ledger.categories} onClose={() => setShowQuickRecord(false)} onSave={(record) => { setLedger((current) => { const next = { ...current, records: [{ id: makeId(), ...record, date: new Date().toISOString().slice(0, 10) }, ...current.records] }; persistLedger(next); return next; }); setShowQuickRecord(false); notify(record.type === "income" ? "已记入收入，经营账已更新" : "已记入支出，成本账已更新"); }} />}
      {showSaleRecord && <SalesRecordSheet products={ledger.products} onClose={() => setShowSaleRecord(false)} onSave={(sale) => { setLedger((current) => { const product = current.products.find((entry) => entry.id === sale.productId); const amount = sale.quantity * sale.unitPrice; const salePeriod = current.costs.allocationPeriod ?? sale.date.slice(0, 7); const hiddenSnapshot = current.costs.hiddenCostSource === "ledger" ? current.records.filter((record) => record.type === "expense" && record.date.startsWith(salePeriod) && record.category === (current.costs.hiddenCostCategory ?? "交通配送")).reduce((sum, record) => sum + Math.max(record.amount, 0), 0) : current.costs.hiddenCost; const enrichedSale: SalesRecord = { ...sale, costVersionId: product?.bomVersions?.at(-1)?.id ?? `current-${sale.date}`, unitDirectCostSnapshot: product ? calculateDirectCost(product, current.materials) : 0, fixedCostSnapshot: current.costs.fixedCost, hiddenCostSnapshot: hiddenSnapshot, fundingCostSnapshot: current.costs.fundingCost, fundingSourceSnapshot: current.costs.fundingSource ?? "manual", costPeriod: salePeriod }; const next = { ...current, sales: [enrichedSale, ...(current.sales ?? [])], records: [{ id: makeId(), type: "income" as const, amount, category: "销售收入", note: `${product?.name ?? "商品"}销售`, date: sale.date }, ...current.records] }; persistLedger(next); return next; }); setShowSaleRecord(false); notify("已记录销售，商品成本已结转"); }} />}

      {showBomEditor && <BomEditorSheet product={selectedProduct} materials={ledger.materials} onClose={() => setShowBomEditor(false)} onSave={(items, settings) => { setLedger((current) => { const products = current.products.map((item) => { if (item.id !== selectedProduct.id) return item; const draftProduct = { ...item, bom: items, lossRate: settings.lossRate, batchYield: settings.batchYield, materialUnitCosts: settings.costSnapshot?.materialUnitCosts, packaging: settings.costSnapshot?.packaging ?? item.packaging, directLabor: settings.costSnapshot?.directLabor ?? item.directLabor }; const recalculated = recalculateProduct(draftProduct, current.materials, currentCosts.hiddenCost, currentCosts.fixedCost); const nextVersion = makeBomVersionSnapshot(draftProduct, current.materials, settings, new Date().toISOString().slice(0, 10)); return { ...recalculated, bomVersions: [...(item.bomVersions ?? []), nextVersion] }; }); const next = { ...current, products }; persistLedger(next); return next; }); setShowBomEditor(false); notify("已保存配方，并生成新的成本版本"); }} />}
      {costEditor && <CostSettingsSheet type={costEditor} value={costEditor === "hidden" ? currentCosts.hiddenCost : currentCosts.fundingCost} onClose={() => setCostEditor(null)} onSave={(value) => { const nextCosts = { ...currentCosts, [costEditor === "hidden" ? "hiddenCost" : "fundingCost"]: value }; setCurrentCosts(nextCosts); setLedger((current) => { const next = { ...current, costs: nextCosts, products: costEditor === "hidden" ? current.products.map((product) => recalculateProduct(product, current.materials, nextCosts.hiddenCost, nextCosts.fixedCost)) : current.products }; persistLedger(next); return next; }); setCostEditor(null); notify(costEditor === "hidden" ? "已更新隐形成本，经营成本已重新计算" : "已更新资金成本，完整成本已重新计算"); }} />}
      {toast && <div className="app-toast"><CheckBadge />{toast}</div>}
    </div>
  );
}

function HomeView({
  product,
  summary,
  operatingCost,
  fullCost,
  onPricing,
  onAddMaterial,
  onRecord,
  onBusiness,
}: {
  product: LedgerProduct;
  summary: ReturnType<typeof summarizeLedger>;
  operatingCost: number;
  fullCost: number;
  onPricing: () => void;
  onAddMaterial: () => void;
  onRecord: () => void;
  onBusiness: () => void;
}) {
  return (
    <div className="page-content home-content">
      <section className="period-row">
        <div><span className="eyebrow">本月经营账</span><h1>先看结果，再看明细。</h1></div>
        <button className="range-chip">8月 1日—17日 <ChevronRight size={16} /></button>
      </section>

      <section className="hero-ledger-card">
        <div className="hero-card-top"><span className="ledger-tab">08 月 · 现金结余</span><span className="ledger-stamp">已核算</span></div>
        <div className="ledger-card-heading"><span>本月经营现金结余</span><BookOpenCheck size={18} /></div>
        <strong>{formatCurrency(summary.cashBalance)}</strong>
        <p>按实际收入与全部现金流出计算；商品成本尚未按销量结转</p>
        <div className="hero-calculation-trail"><span>收入 <b>{formatCurrency(summary.income)}</b></span><i>−</i><span>现金流出 <b>{formatCurrency(summary.cashOutflow)}</b></span><i>=</i><span className="trail-result">现金结余 <b>{formatCurrency(summary.cashBalance)}</b></span></div>
        <div className="ledger-card-foot"><span>已记录 <b>{summary.incomeCount + summary.expenseCount}</b> 笔</span><button onClick={onBusiness}>翻开经营账 <ArrowRight size={16} /></button></div>
      </section>

      <section className="overview-chart-card" aria-label="本月收入与支出概览">
        <div className="chart-heading"><div><span className="eyebrow">本月走势</span><h2>收入与支出怎么走？</h2></div><span className="chart-summary-value">{formatCurrency(summary.cashBalance)} <small>结余</small></span></div>
        <MiniTrendChart series={summary.dailySeries} />
      </section>

      <section className="quick-actions" aria-label="常用操作">
        <button className="quick-action primary" onClick={onPricing}><Sparkles size={20} /><span><b>建议售价</b><small>按利润率反推</small></span></button>
        <button className="quick-action" onClick={onRecord}><ReceiptText size={20} /><span><b>记一笔</b><small>收入或支出</small></span></button>
        <button className="quick-action" onClick={onAddMaterial}><PackagePlus size={20} /><span><b>加原材料</b><small>更新商品成本</small></span></button>
      </section>

      <section className="section-heading"><div><span className="eyebrow">下一步</span><h2>先补齐成本与销售，利润才算准</h2></div><button onClick={onBusiness}>查看经营 <ChevronRight size={16} /></button></section>
      <section className="attention-list">
        <article className="attention-item amber"><div className="attention-icon"><TrendingUp size={19} /></div><div><strong>茶底采购价上涨 8%</strong><p>“招牌奶茶”每份成本增加 0.28 元</p></div><button onClick={onPricing}>去核算</button></article>
        <article className="attention-item blue"><div className="attention-icon"><WalletCards size={19} /></div><div><strong>还有一笔隐形成本未分摊</strong><p>本月配送与交通费 ¥286.00</p></div><button onClick={onBusiness}>查看</button></article>
      </section>

      <section className="section-heading compact"><div><span className="eyebrow">商品成本</span><h2>{product.name}成本构成</h2></div><span className="section-stamp">三层口径</span></section>
      <section className="cost-composition-card" aria-label="商品成本构成图">
        <CostCompositionChart product={product} operatingCost={operatingCost} fullCost={fullCost} />
      </section>
    </div>
  );
}

function MiniTrendChart({ series }: { series: ReturnType<typeof summarizeLedger>["dailySeries"] }) {
  const values = series.flatMap((item) => [item.income, item.expenses]);
  const max = Math.max(...values, 1);
  const points = (key: "income" | "expenses") => series.map((item, index) => `${(index / Math.max(series.length - 1, 1)) * 100},${92 - (item[key] / max) * 76}`).join(" ");
  const hasData = series.some((item) => item.income > 0 || item.expenses > 0);
  if (!hasData) return <div className="mini-chart-empty"><BarChart3 size={20} /><span>记入收入或支出后，趋势图会自动出现</span></div>;
  return <div className="mini-trend-wrap"><svg className="mini-trend-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="本月收入与支出趋势"><line x1="0" y1="92" x2="100" y2="92" /><polyline className="trend-income" points={points("income")} /><polyline className="trend-expense" points={points("expenses")} />{series.map((item, index) => { const x = (index / Math.max(series.length - 1, 1)) * 100; return <g key={item.label}><circle className="trend-income-dot" cx={x} cy={92 - (item.income / max) * 76} r="1.8" /><circle className="trend-expense-dot" cx={x} cy={92 - (item.expenses / max) * 76} r="1.8" /></g>; })}</svg><div className="mini-chart-labels"><span>{series[0]?.label ?? ""}</span><span>{series.at(-1)?.label ?? ""}</span></div><div className="mini-chart-legend"><span><i className="income-dot" />收入</span><span><i className="expense-dot" />支出</span></div></div>;
}

function CostCompositionChart({ product, operatingCost, fullCost }: { product: LedgerProduct; operatingCost: number; fullCost: number }) {
  const direct = Math.max(product.direct, 0);
  const operatingAdd = Math.max(operatingCost - direct, 0);
  const fundingAdd = Math.max(fullCost - operatingCost, 0);
  const total = Math.max(fullCost, direct, 0);
  if (total <= 0) return <div className="cost-composition-empty"><BarChart3 size={20} /><strong>还没有可视化成本</strong><span>先补充材料或配方，三层成本会在这里展开。</span></div>;
  return <div className="cost-composition-chart"><div className="composition-tip"><Info size={13} />横条从左到右表示直接成本、经营分摊和资金成本。</div><div className="composition-track" role="img" aria-label={`直接成本${formatCurrency(direct)}，经营分摊${formatCurrency(operatingAdd)}，资金成本${formatCurrency(fundingAdd)}`}><span className="composition-direct" style={{ width: `${direct / total * 100}%` }} /><span className="composition-operating" style={{ width: `${operatingAdd / total * 100}%` }} /><span className="composition-funding" style={{ width: `${fundingAdd / total * 100}%` }} /></div><div className="composition-legend"><span><i className="composition-direct-dot" />直接成本 <b>{formatCurrency(direct)}</b></span><span><i className="composition-operating-dot" />经营分摊 <b>{formatCurrency(operatingAdd)}</b></span><span><i className="composition-funding-dot" />资金成本 <b>{formatCurrency(fundingAdd)}</b></span></div></div>;
}

function CashFlowChart({ series, onRecord }: { series: ReturnType<typeof summarizeLedger>["dailySeries"]; onRecord: () => void }) {
  const max = Math.max(...series.flatMap((item) => [item.income, item.expenses]), 1);
  const hasData = series.some((item) => item.income > 0 || item.expenses > 0);
  if (!hasData) return <section className="cash-flow-chart chart-card"><div className="chart-heading"><div><span className="eyebrow">现金流走势</span><h2>本期还没有现金流</h2></div></div><div className="chart-empty" role="status"><BarChart3 size={22} /><span>记一笔收入或支出后，这里会显示每日现金流。</span><button type="button" onClick={onRecord}>去记一笔 <ArrowRight size={14} /></button></div></section>;
  return <section className="cash-flow-chart chart-card" aria-label="现金流走势"><div className="chart-heading"><div><span className="eyebrow">现金流走势</span><h2>每天进出的钱</h2></div><span className="legend"><i />收入 <i className="green" />流出</span></div><div className="cash-flow-bars">{series.map((item) => <div className="cash-flow-day" key={item.label}><div className="cash-flow-columns"><span className="cash-income-bar" style={{ height: `${Math.max(item.income / max * 100, item.income ? 7 : 0)}%` }} title={`收入 ${formatCurrency(item.income)}`} /><span className="cash-expense-bar" style={{ height: `${Math.max(item.expenses / max * 100, item.expenses ? 7 : 0)}%` }} title={`流出 ${formatCurrency(item.expenses)}`} /></div><small>{item.label}</small></div>)}</div></section>;
}

function ProductsView({ products, activeProductId, onSelect, onPricing, onBom, onAdd }: { products: LedgerProduct[]; activeProductId: number; onSelect: (id: number) => void; onPricing: () => void; onBom: () => void; onAdd: () => void }) {
  const selected = products.find((product) => product.id === activeProductId) ?? products[0];
  const margin = selected.price > 0 ? ((selected.price - selected.operating) / selected.price) * 100 : 0;
  return (
    <div className="page-content product-content">
      <section className="period-row"><div><span className="eyebrow">商品账本</span><h1>每件商品都该有一笔清楚的账。</h1></div><button className="round-plus" onClick={onAdd} aria-label="新增商品"><Plus size={21} /></button></section>
      <div className="filter-row"><button className="filter-chip active">全部商品</button><button className="filter-chip">利润偏低</button><button className="filter-chip">成本变化</button></div>
      <section className="product-list">
        {products.map((product) => (
          <button key={product.id} className={activeProductId === product.id ? "product-row selected" : "product-row"} onClick={() => onSelect(product.id)}>
            <div className="product-symbol"><ShoppingBag size={21} /></div>
            <div className="product-main"><strong>{product.name}</strong><span>{product.category}</span></div>
            <div className="product-data"><b>{product.price ? formatCurrency(product.price) : "未定价"}</b><span>{product.price ? `经营利润率 ${((product.price - product.operating) / product.price * 100).toFixed(0)}%` : product.change}</span></div>
            <ChevronRight size={17} />
          </button>
        ))}
      </section>
      <section className="product-detail-card">
        <div className="detail-card-title"><div><span className="eyebrow">当前商品</span><h2>{selected.name}</h2></div><span className="status-pill">已核算</span></div>
        <div className="product-chart-summary"><span>经营成本 <b>{formatCurrency(selected.operating)}</b></span><span>预计利润率 <b>{selected.price ? `${margin.toFixed(1)}%` : "—"}</b></span></div>
        <CostCompositionChart product={selected} operatingCost={selected.operating} fullCost={selected.operating + 0.28} />
        <div className="product-action-pair"><button className="secondary-card-action" onClick={onBom}><ClipboardList size={17} /> 编辑配方</button><button className="primary-action" onClick={onPricing}><Sparkles size={18} /> 定价建议</button></div>
      </section>
    </div>
  );
}

function BusinessView({ summary, costs, onPricing, onRecord, onSale }: { summary: ReturnType<typeof summarizeLedger>; costs: CostInputs; onPricing: () => void; onRecord: () => void; onSale: () => void }) {
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
      <section className="period-row"><div><span className="eyebrow">经营总览</span><h1>收入进来后，真正还剩多少？</h1><p className="page-subtitle">现金流、趋势和成本构成集中在这里。</p></div><button className="range-chip">本月 <ChevronRight size={16} /></button></section>
      <section className={`cash-flow-card ${isRefreshing ? "is-refreshing" : ""}`}>
        <div className="cash-flow-copy"><span>现金流压力 <button className="micro-info" aria-label="查看现金流压力说明" aria-expanded={showCashDetails} onClick={() => setShowCashDetails((current) => !current)}><Info size={13} /></button></span><h2>{formatCurrency(summary.cashOutflow)}</h2>{summary.cashOutflow > 0 ? <p>本金还款 {formatCurrency(summary.principalRepayment)} · 利息与融资费 {formatCurrency(summary.financingCosts)}</p> : <p className="cash-flow-empty">先记一笔支出或还款，这里会显示现金流压力。</p>}{showCashDetails && <div className="cash-flow-detail" role="status">现金流压力包含本期全部实际流出；本金影响现金，不计入经营利润；利息和融资费用计入资金成本。</div>}</div><div className="cash-orbit" aria-hidden="true"><CircleDollarSign size={32} /><span>{isRefreshing ? "更新中" : "本期"}</span></div>
      </section>
      <CashFlowChart series={summary.dailySeries} onRecord={onRecord} />
      {summary.salesCount > 0 && <section className="sales-result-card"><div><span className="eyebrow">销售结转</span><h2>{summary.salesCount} 笔销售 · {summary.salesQuantity} 份</h2></div><div className="sales-result-grid"><span>销售收入 <b>{formatCurrency(summary.salesRevenue)}</b></span><span>销货成本 <b>{formatCurrency(summary.costOfSales)}</b></span><span>商品毛利 <b>{formatCurrency(summary.grossProfit)}</b></span><span>经营结果 <b>{formatCurrency(summary.operatingResult)}</b></span></div></section>}
      <section className={`chart-card ${isRefreshing ? "is-refreshing" : ""}`} aria-label="经营趋势图表"><div className="chart-heading"><div><span className="eyebrow">经营趋势</span><h2>收入与经营成本</h2></div><span className="legend"><i />收入 <i className="green" />成本</span></div>{isRefreshing && <div className="chart-loading" role="status" aria-live="polite"><span className="loading-sweep" />正在更新经营趋势</div>}{hasTrendData ? <><div className="bar-chart" role="list" aria-label="按日期查看收入和经营成本">{summary.dailySeries.map((item) => <button type="button" className={`bar-pair ${activeItem?.label === item.label ? "is-active" : ""}`} key={item.label} onMouseEnter={() => setActiveLabel(item.label)} onFocus={() => setActiveLabel(item.label)} onClick={() => setActiveLabel(item.label)} aria-label={`${item.label}，收入${formatCurrency(item.income)}，经营成本${formatCurrency(item.expenses)}`} role="listitem"><span className="income-bar" aria-hidden="true" style={{ height: `${Math.max((item.income / maxValue) * 100, item.income ? 8 : 0)}%` }} /><span className="expense-bar" aria-hidden="true" style={{ height: `${Math.max((item.expenses / maxValue) * 100, item.expenses ? 8 : 0)}%` }} /></button>)}</div><div className="chart-labels">{summary.dailySeries.map((item) => <button type="button" className={activeItem?.label === item.label ? "is-active" : ""} onClick={() => setActiveLabel(item.label)} key={item.label}>{item.label}</button>)}</div>{activeItem && <div className="chart-tooltip" role="status"><b>{activeItem.label}</b><span><i className="income-dot" />收入 {formatCurrency(activeItem.income)}</span><span><i className="expense-dot" />成本 {formatCurrency(activeItem.expenses)}</span></div>}</> : <div className="chart-empty" role="status"><BarChart3 size={22} /><strong>还没有经营趋势</strong><span>先记一笔收入或支出，趋势会出现在这里。</span><button type="button" onClick={onRecord}>去记一笔 <ArrowRight size={14} /></button></div>}</section>
      <section className="section-heading compact"><div><span className="eyebrow">成本构成</span><h2>不只看材料钱</h2></div><span className="section-stamp">本月</span></section>
      <section className="ledger-lines">
        <LineItem icon={<Coins size={18} />} label="已记录支出" value={formatCurrency(summary.expenses)} width={`${summary.expenses ? Math.min(summary.expenses / Math.max(summary.income, summary.expenses) * 100, 100) : 0}%`} color="blue" />
        <LineItem icon={<ClipboardList size={18} />} label="非采购支出" value={formatCurrency(hiddenTotal)} width={`${summary.expenses ? Math.min(hiddenTotal / summary.expenses * 100, 100) : 0}%`} color="green" />
        <LineItem icon={<Banknote size={18} />} label="固定费用分摊" value={formatCurrency(costs.fixedCost)} width={`${Math.min(costs.fixedCost / Math.max(summary.expenses, 1) * 100, 100)}%`} color="navy" />
        <LineItem icon={<WalletCards size={18} />} label="资金成本" value={formatCurrency(summary.financingCosts)} width={`${Math.min(summary.financingCosts / Math.max(summary.expenses, 1) * 100, 100)}%`} color="amber" />
      </section>
      <div className="business-actions"><button className="secondary-action" onClick={onSale}><ReceiptText size={18} /> 记销售并结转成本</button><button className="secondary-action" onClick={onPricing}><Sparkles size={18} /> 看看商品是否需要调价</button></div>
    </div>
  );
}

function ProfileView({ storeName, industry, onHiddenCost, onDebt }: { storeName: string; industry: IndustryKey; onHiddenCost: () => void; onDebt: () => void }) {
  const industryName = INDUSTRY_TEMPLATES.find((item) => item.key === industry)?.label ?? "小店经营";
  return (
    <div className="page-content profile-content">
      <section className="profile-hero"><div className="profile-mark"><BrandMark size={54} /></div><div><span>我在经营</span><h1>{storeName}</h1><p>{industryName} · 本地账本已开启</p></div><button className="icon-button"><Settings2 size={20} /></button></section>
      <section className="profile-banner"><img src="/manus-storage/suandeqing-onboarding-ledger_eee908b4.png" alt="成本账簿插画" /><div><span className="eyebrow">把账补完整</span><strong>再补 2 项成本，利润会更接近真实。</strong><button onClick={onHiddenCost}>去补成本 <ArrowRight size={15} /></button></div></section>
      <section className="setting-group"><span className="group-label">经营设置</span><SettingItem icon={<ClipboardList size={19} />} label="隐形成本" note="店主人工、配送、设备与平台费" onClick={onHiddenCost} /><SettingItem icon={<WalletCards size={19} />} label="资金成本" note="利息与融资费用，不含借款本金" onClick={onDebt} /><SettingItem icon={<ReceiptText size={19} />} label="默认分摊方式" note="按商品销量分摊" onClick={() => undefined} /></section>
      <section className="setting-group"><span className="group-label">数据与账户</span><SettingItem icon={<BookOpenCheck size={19} />} label="成本口径说明" note="直接、经营与完整成本" onClick={() => undefined} /><SettingItem icon={<Settings2 size={19} />} label="数据管理" note="导出与隐私设置" onClick={() => undefined} /></section>
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
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet product-name-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">新增商品</span><h2>先给商品起个名字</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></header><label className="field-block"><span>商品名称</span><div className="money-input"><input autoFocus value={name} maxLength={40} placeholder="例如：招牌冰咖啡" onChange={(event) => { setName(event.target.value); setValidationError(null); }} onKeyDown={(event) => { if (event.key === "Enter") save(); }} /><b>{name.length}/40</b></div></label>{validationError && <p className="field-error" role="alert">{validationError}</p>}<p className="sheet-hint">名称保存后还可以继续补充配方、售价和成本。</p><button className="primary-action sheet-save-button" onClick={save}>创建商品 <ArrowRight size={16} /></button></section></div>;
}

export function MaterialSheet({ onClose, onSave }: { onClose: () => void; onSave: (material: Material) => void }) {
  const [name, setName] = useState("鲜牛奶");
  const [amount, setAmount] = useState("36");
  const [quantity, setQuantity] = useState("24");
  const [purchaseUnit, setPurchaseUnit] = useState("盒");
  const [usageUnit, setUsageUnit] = useState("个");
  const [conversionFactor, setConversionFactor] = useState("1");
  const [validationError, setValidationError] = useState<string | null>(null);
  const purchaseAmount = Number(amount);
  const purchaseQuantity = Number(quantity);
  const factor = Number(conversionFactor);
  const validNumbers = Number.isFinite(purchaseAmount) && purchaseAmount > 0 && Number.isFinite(purchaseQuantity) && purchaseQuantity > 0 && Number.isFinite(factor) && factor > 0;
  const unitCost = validNumbers ? calculateUnitCost(purchaseAmount, purchaseQuantity, factor) : 0;
  const save = () => {
    const error = validateMaterialDraft({ name, amount: purchaseAmount, quantity: purchaseQuantity, conversionFactor: factor });
    if (error) { setValidationError(error); return; }
    onSave({ id: makeId(), name: name.trim(), unit: usageUnit, unitCost, source: `采购${purchaseQuantity}${purchaseUnit}，每${purchaseUnit}折算${factor}${usageUnit}`, purchaseUnit, conversionFactor: factor });
  };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">新增原材料</span><h2>先记一笔进货价</h2></div><button className="icon-button" onClick={onClose}>×</button></header><label className="field-block"><span>材料名称</span><div className="money-input"><input value={name} onChange={(event) => { setName(event.target.value); setValidationError(null); }} /><b>名称</b></div></label><div className="two-fields"><label className="field-block"><span>采购金额</span><div className="money-input"><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setValidationError(null); }} /><b>元</b></div></label><label className="field-block"><span>采购数量</span><div className="money-input"><input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => { setQuantity(event.target.value); setValidationError(null); }} /><b>{purchaseUnit}</b></div></label></div><div className="two-fields"><label className="field-block"><span>采购单位</span><select value={purchaseUnit} onChange={(event) => setPurchaseUnit(event.target.value)}><option value="盒">盒</option><option value="箱">箱</option><option value="袋">袋</option><option value="瓶">瓶</option></select></label><label className="field-block"><span>使用单位</span><select value={usageUnit} onChange={(event) => setUsageUnit(event.target.value)}><option value="个">个</option><option value="克">克</option><option value="毫升">毫升</option><option value="套">套</option></select></label></div><label className="field-block"><span>每{purchaseUnit}折算多少{usageUnit}</span><div className="money-input"><input type="number" min="0.0001" step="0.0001" value={conversionFactor} onChange={(event) => { setConversionFactor(event.target.value); setValidationError(null); }} /><b>{usageUnit}</b></div></label><div className="material-preview"><span>当前估算使用单位成本</span><strong>{formatCurrency(unitCost)} / {usageUnit}</strong><p>公式：采购金额 ÷（采购数量 × 换算系数）；商品配方会按使用单位核算。</p></div>{validationError && <p className="form-error" role="alert">{validationError}</p>}<button className="primary-action sheet-action" onClick={save}><CheckBadge /> 保存原材料</button></section></div>;
}

function SalesRecordSheet({ products, onClose, onSave }: { products: LedgerProduct[]; onClose: () => void; onSave: (sale: SalesRecord) => void }) {
  const [productId, setProductId] = useState(products[0]?.id ?? 0);
  const selected = products.find((product) => product.id === productId) ?? products[0];
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(String(selected?.price ?? 0));
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(unitPrice);
    if (!selected || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError("销售数量必须大于0，成交价不能为负数。");
      return;
    }
    onSave({ id: makeId(), productId: selected.id, quantity: parsedQuantity, unitPrice: parsedPrice, date: new Date().toISOString().slice(0, 10), note: "" });
  };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">销售结转</span><h2>记一笔商品销售</h2></div><button className="icon-button" onClick={onClose}>×</button></header><label className="field-block"><span>销售商品</span><select value={productId} onChange={(event) => { const nextId = Number(event.target.value); setProductId(nextId); const next = products.find((product) => product.id === nextId); setUnitPrice(String(next?.price ?? 0)); setError(null); }}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><div className="two-fields"><label className="field-block"><span>销售数量</span><div className="money-input"><input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(null); }} /><b>份</b></div></label><label className="field-block"><span>成交单价</span><div className="money-input"><input type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => { setUnitPrice(event.target.value); setError(null); }} /><b>元</b></div></label></div><div className="material-preview"><span>本次销售收入</span><strong>{formatCurrency((Number(quantity) || 0) * (Number(unitPrice) || 0))}</strong><p>保存后会同时写入销售记录、收入流水，并按当前商品成本结转销货成本。</p></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action sheet-action" onClick={save}><CheckBadge /> 保存销售并结转</button></section></div>;
}

function CostSettingsSheet({ type, value, onClose, onSave }: { type: "hidden" | "funding"; value: number; onClose: () => void; onSave: (value: number) => void }) {
  const [amount, setAmount] = useState(value);
  const title = type === "hidden" ? "隐形成本" : "资金成本";
  const description = type === "hidden" ? "店主人工、配送、平台费和设备占用等，会让经营利润更接近真实。" : "只记录利息与融资费用；借款本金只影响现金流，不计入商品成本。";
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">经营设置</span><h2>补上这笔{title}</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="cost-setting-note"><Info size={17} /><p>{description}</p></div><label className="field-block"><span>{type === "hidden" ? "每份分摊金额" : "每份资金成本"}</span><div className="money-input"><input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /><b>元</b></div></label><div className="cost-setting-stamp"><span>{type === "hidden" ? "经营口径" : "完整口径"}</span><b>{type === "hidden" ? "会影响经营利润与建议售价" : "会影响完整成本与现金流判断"}</b></div><button className="primary-action sheet-action" onClick={() => onSave(Math.max(amount || 0, 0))}><CheckBadge /> 保存这笔成本</button></section></div>;
}

function SettingItem({ icon, label, note, onClick }: { icon: React.ReactNode; label: string; note: string; onClick: () => void }) {
  return <button className="setting-item" onClick={onClick}><span className="setting-icon">{icon}</span><span><b>{label}</b><small>{note}</small></span><ChevronRight size={18} /></button>;
}

function LineItem({ icon, label, value, width, color }: { icon: React.ReactNode; label: string; value: string; width: string; color: string }) {
  return <article className="line-item"><div className={`line-icon ${color}`}>{icon}</div><div className="line-body"><span>{label}</span><div className="line-track"><i className={color} style={{ width }} /></div></div><b>{value}</b></article>;
}

function CheckBadge() { return <span className="check-badge">✓</span>; }
