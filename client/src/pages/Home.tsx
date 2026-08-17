/** 商户账簿工作台：首页按“结论—待办—明细”排列，让小商家在每次打开时先知道该做什么。 */
import { useMemo, useState } from "react";
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
import { CostInputs, formatCurrency, getScopeCost } from "@/lib/costEngine";

type Tab = "home" | "products" | "business" | "profile";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  direct: number;
  operating: number;
  change: string;
  image?: string;
};

const initialProducts: Product[] = [
  { id: 1, name: "招牌奶茶", category: "饮品 · 500ml", price: 12, direct: 5.6, operating: 7.82, change: "成本上升 0.28 元" },
  { id: 2, name: "芝士热狗", category: "小食 · 单份", price: 10, direct: 4.2, operating: 5.51, change: "利润稳定" },
  { id: 3, name: "手冲柠檬茶", category: "饮品 · 650ml", price: 13, direct: 4.9, operating: 6.18, change: "本周销量 +16%" },
];

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
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [activeProductId, setActiveProductId] = useState(1);
  const [showMaterialPanel, setShowMaterialPanel] = useState(false);
  const [costEditor, setCostEditor] = useState<"hidden" | "funding" | null>(null);
  const [currentCosts, setCurrentCosts] = useState<CostInputs>(initialCostInputs);
  const [toast, setToast] = useState<string | null>(null);
  const selectedProduct = products.find((product) => product.id === activeProductId) ?? products[0];
  const fullCost = getScopeCost(currentCosts, "full");
  const operatingCost = getScopeCost(currentCosts, "operating");

  const currentMargin = useMemo(
    () => ((selectedProduct.price - selectedProduct.operating) / selectedProduct.price) * 100,
    [selectedProduct],
  );

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const saveSuggestedPrice = (price: number) => {
    setProducts((items) => items.map((item) => item.id === activeProductId ? { ...item, price } : item));
    setShowPricing(false);
    notify(`已将 ${formatCurrency(price)} 保存为“${selectedProduct.name}”的新售价`);
  };

  const navigate = (tab: Tab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
          <div className="brand-lockup"><BrandMark size={38} /><div><strong>算得清</strong><span>小店经营账簿</span></div></div>
          <button className="icon-button notification-button" onClick={() => notify("本周有 2 项成本需要关注") } aria-label="查看提醒">
            <BellRing size={20} /><i />
          </button>
        </header>

        {activeTab === "home" && (
          <HomeView
            operatingCost={operatingCost}
            fullCost={fullCost}
            onPricing={() => setShowPricing(true)}
            onProducts={() => navigate("products")}
            onAddMaterial={() => setShowMaterialPanel(true)}
            onBusiness={() => navigate("business")}
          />
        )}
        {activeTab === "products" && (
          <ProductsView
            products={products}
            activeProductId={activeProductId}
            onSelect={(id) => setActiveProductId(id)}
            onPricing={() => setShowPricing(true)}
            onAdd={() => {
              const nextId = Math.max(...products.map((item) => item.id)) + 1;
              setProducts((items) => [...items, { id: nextId, name: "新建商品", category: "待完善配方", price: 0, direct: 0, operating: 0, change: "先补充成本" }]);
              setActiveProductId(nextId);
              notify("已新建商品，请继续补充成本和售价");
            }}
          />
        )}
        {activeTab === "business" && <BusinessView onPricing={() => setShowPricing(true)} />}
        {activeTab === "profile" && <ProfileView onHiddenCost={() => setCostEditor("hidden")} onDebt={() => setCostEditor("funding")} />}
      </main>

      <nav className="mobile-tabbar" aria-label="底部导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeTab === id ? "tab-item active" : "tab-item"} onClick={() => navigate(id)}>
            <Icon size={21} strokeWidth={activeTab === id ? 2.7 : 2} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {showPricing && <PricingPanel costs={currentCosts} onClose={() => setShowPricing(false)} onSave={saveSuggestedPrice} />}
      {showMaterialPanel && <MaterialSheet onClose={() => setShowMaterialPanel(false)} onSave={() => { setShowMaterialPanel(false); notify("已保存原材料，后续核算会使用新成本"); }} />}
      {costEditor && <CostSettingsSheet type={costEditor} value={costEditor === "hidden" ? currentCosts.hiddenCost : currentCosts.fundingCost} onClose={() => setCostEditor(null)} onSave={(value) => { setCurrentCosts((costs) => ({ ...costs, [costEditor === "hidden" ? "hiddenCost" : "fundingCost"]: value })); setCostEditor(null); notify(costEditor === "hidden" ? "已更新隐形成本，经营成本已重新计算" : "已更新资金成本，完整成本已重新计算"); }} />}
      {toast && <div className="app-toast"><CheckBadge />{toast}</div>}
    </div>
  );
}

function HomeView({
  operatingCost,
  fullCost,
  onPricing,
  onProducts,
  onAddMaterial,
  onBusiness,
}: {
  operatingCost: number;
  fullCost: number;
  onPricing: () => void;
  onProducts: () => void;
  onAddMaterial: () => void;
  onBusiness: () => void;
}) {
  return (
    <div className="page-content home-content">
      <section className="period-row">
        <div><span className="eyebrow">本月经营账</span><h1>先看结果，再看明细。</h1></div>
        <button className="range-chip">8月 1日—17日 <ChevronRight size={16} /></button>
      </section>

      <section className="hero-ledger-card">
        <div className="hero-card-top"><span className="ledger-tab">08 月 · 经营结余</span><span className="ledger-stamp">已核算</span></div>
        <div className="ledger-card-heading"><span>本月经营利润估算</span><BookOpenCheck size={18} /></div>
        <strong>{formatCurrency(4680.5)}</strong>
        <p>已计入材料、包装、人工与隐形成本</p>
        <div className="hero-calculation-trail"><span>收入 <b>¥16,880</b></span><i>−</i><span>经营成本 <b>¥11,770</b></span><i>=</i><span className="trail-result">结余 <b>¥4,680</b></span></div>
        <div className="ledger-card-foot"><span>较上月 <b>+12.5%</b></span><button onClick={onBusiness}>翻开经营账 <ArrowRight size={16} /></button></div>
      </section>

      <section className="metric-grid">
        <MetricCard label="本月收入" value={formatCurrency(16880)} note="共记录 1268 笔" tone="light" delta="8.4%" />
        <MetricCard label="经营成本" value={formatCurrency(11770.2)} note="已含隐形成本" tone="navy" delta="成本增 3.1%" positive={false} />
      </section>

      <section className="quick-actions">
        <button className="quick-action primary" onClick={onPricing}><Sparkles size={20} /><span>算商品<br /><b>建议售价</b></span></button>
        <button className="quick-action" onClick={onAddMaterial}><PackagePlus size={20} /><span>新增<br /><b>原材料</b></span></button>
        <button className="quick-action" onClick={onProducts}><ReceiptText size={20} /><span>查看<br /><b>成本明细</b></span></button>
      </section>

      <section className="section-heading"><div><span className="eyebrow">待补的账</span><h2>这两笔先处理，利润才算准</h2></div><button onClick={onBusiness}>全部 <ChevronRight size={16} /></button></section>
      <section className="attention-list">
        <article className="attention-item amber"><div className="attention-icon"><TrendingUp size={19} /></div><div><strong>茶底采购价上涨 8%</strong><p>“招牌奶茶”每份成本增加 0.28 元</p></div><button onClick={onPricing}>去核算</button></article>
        <article className="attention-item blue"><div className="attention-icon"><WalletCards size={19} /></div><div><strong>还有一笔隐形成本未分摊</strong><p>本月配送与交通费 ¥286.00</p></div><button onClick={onBusiness}>查看</button></article>
      </section>

      <section className="section-heading compact"><div><span className="eyebrow">成本口径</span><h2>一件商品，三层答案</h2></div><span className="section-stamp">账已分层</span></section>
      <section className="cost-layer-card">
        <div className="cost-layer-row"><span>直接成本</span><div><b>{formatCurrency(5.6)}</b><small>材料 · 包装 · 直接人工</small></div></div>
        <div className="cost-layer-row active"><span>经营成本</span><div><b>{formatCurrency(operatingCost)}</b><small>已加固定费用与隐形成本</small></div></div>
        <div className="cost-layer-row"><span>完整成本</span><div><b>{formatCurrency(fullCost)}</b><small>已加利息与融资费用</small></div></div>
      </section>
    </div>
  );
}

function ProductsView({ products, activeProductId, onSelect, onPricing, onAdd }: { products: Product[]; activeProductId: number; onSelect: (id: number) => void; onPricing: () => void; onAdd: () => void }) {
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
        <div className="product-numbers"><div><span>每份经营成本</span><b>{formatCurrency(selected.operating)}</b></div><div><span>当前售价</span><b>{selected.price ? formatCurrency(selected.price) : "—"}</b></div><div><span>预计利润率</span><b>{selected.price ? `${margin.toFixed(1)}%` : "—"}</b></div></div>
        <div className="detail-divider" />
        <div className="cost-rail"><span>材料 <b>{formatCurrency(selected.direct)}</b></span><i /><span>隐形成本 <b>{formatCurrency(Math.max(selected.operating - selected.direct - 0.92, 0))}</b></span><i /><span>固定分摊 <b>{formatCurrency(0.92)}</b></span></div>
        <button className="primary-action" onClick={onPricing}><Sparkles size={18} /> 按目标利润率定价</button>
      </section>
    </div>
  );
}

function BusinessView({ onPricing }: { onPricing: () => void }) {
  return (
    <div className="page-content business-content">
      <section className="period-row"><div><span className="eyebrow">经营账</span><h1>收入进来后，真正还剩多少？</h1></div><button className="range-chip">本月 <ChevronRight size={16} /></button></section>
      <section className="cash-flow-card">
        <div><span>现金流压力</span><h2>{formatCurrency(1630)}</h2><p>含本金还款 ¥1,000 与利息 ¥230</p></div><div className="cash-orbit"><CircleDollarSign size={32} /><span>本期</span></div>
      </section>
      <section className="chart-card"><div className="chart-heading"><div><span className="eyebrow">经营趋势</span><h2>收入与经营成本</h2></div><span className="legend"><i />收入 <i className="green" />成本</span></div><div className="bar-chart"><span style={{ height: "44%" }} /><span style={{ height: "61%" }} /><span style={{ height: "52%" }} /><span style={{ height: "78%" }} /><span style={{ height: "90%" }} /><span className="accent" style={{ height: "68%" }} /></div><div className="chart-labels"><span>12日</span><span>13日</span><span>14日</span><span>15日</span><span>16日</span><span>17日</span></div></section>
      <section className="section-heading compact"><div><span className="eyebrow">本月成本构成</span><h2>不只看材料钱</h2></div></section>
      <section className="ledger-lines">
        <LineItem icon={<Coins size={18} />} label="材料与包装" value="¥8,226.00" width="72%" color="blue" />
        <LineItem icon={<ClipboardList size={18} />} label="隐形成本" value="¥1,742.00" width="42%" color="green" />
        <LineItem icon={<Banknote size={18} />} label="固定费用分摊" value="¥1,802.20" width="47%" color="navy" />
        <LineItem icon={<WalletCards size={18} />} label="资金成本" value="¥230.00" width="14%" color="amber" />
      </section>
      <button className="secondary-action" onClick={onPricing}><Sparkles size={18} /> 看看商品是否需要调价</button>
    </div>
  );
}

function ProfileView({ onHiddenCost, onDebt }: { onHiddenCost: () => void; onDebt: () => void }) {
  return (
    <div className="page-content profile-content">
      <section className="profile-hero"><div className="profile-mark"><BrandMark size={54} /></div><div><span>我在经营</span><h1>巷口奶茶铺</h1><p>饮品 · 经营第 286 天</p></div><button className="icon-button"><Settings2 size={20} /></button></section>
      <section className="profile-banner"><img src="/manus-storage/suandeqing-onboarding-ledger_eee908b4.png" alt="成本账簿插画" /><div><span className="eyebrow">把账补完整</span><strong>再补 2 项成本，利润会更接近真实。</strong><button onClick={onHiddenCost}>去补成本 <ArrowRight size={15} /></button></div></section>
      <section className="setting-group"><span className="group-label">经营设置</span><SettingItem icon={<ClipboardList size={19} />} label="隐形成本" note="店主人工、配送、设备与平台费" onClick={onHiddenCost} /><SettingItem icon={<WalletCards size={19} />} label="资金成本" note="利息与融资费用，不含借款本金" onClick={onDebt} /><SettingItem icon={<ReceiptText size={19} />} label="默认分摊方式" note="按商品销量分摊" onClick={() => undefined} /></section>
      <section className="setting-group"><span className="group-label">数据与账户</span><SettingItem icon={<BookOpenCheck size={19} />} label="成本口径说明" note="直接、经营与完整成本" onClick={() => undefined} /><SettingItem icon={<Settings2 size={19} />} label="数据管理" note="导出与隐私设置" onClick={() => undefined} /></section>
    </div>
  );
}

function MaterialSheet({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState("鲜牛奶");
  const [amount, setAmount] = useState("36");
  const [quantity, setQuantity] = useState("24");
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">新增原材料</span><h2>先记一笔进货价</h2></div><button className="icon-button" onClick={onClose}>×</button></header><label className="field-block"><span>材料名称</span><div className="money-input"><input value={name} onChange={(event) => setName(event.target.value)} /><b>名称</b></div></label><div className="two-fields"><label className="field-block"><span>采购金额</span><div className="money-input"><input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /><b>元</b></div></label><label className="field-block"><span>采购数量</span><div className="money-input"><input type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><b>盒</b></div></label></div><div className="material-preview"><span>当前估算单位成本</span><strong>{formatCurrency(Number(amount || 0) / Math.max(Number(quantity || 0), 1))}</strong><p>后续商品核算会自动使用该价格，可随时更新。</p></div><button className="primary-action sheet-action" onClick={onSave}><CheckBadge /> 保存原材料</button></section></div>;
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
