/** 商户账簿工作台：首页按“结论—待办—明细”排列，让小商家在每次打开时先知道该做什么。 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  BellRing,
  BookOpenCheck,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  ClipboardList,
  Coins,
  Home as HomeIcon,
  Info,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  PackagePlus,
  Plus,
  ReceiptText,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  TrendingUp,
  WalletCards,
  Download,
  FileText,
  Send,
  Upload,
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
  formatBusinessPeriod, getActiveCategories, calculateUnitCost, getBusinessDate, getBusinessPeriod, INDUSTRY_TEMPLATES, HiddenCostItem, IndustryKey, LedgerData, initializeIndustryLedger, LedgerProduct, loadLedger, makeBomVersionSnapshot, makeId, Material, normalizeLedger, persistLedger, recalculateProduct, renameLedgerCategory, SaleRefund, SalesRecord, summarizeLedger } from "@/lib/ledgerStore";
import { validateCategoryName, validateMaterialDraft, validateProductName, validateSaleDraft } from "@/lib/validation";
import { startLogin } from "@/const";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getMessageLevelLabel, isMessageExpired, type MessageLevel } from "@shared/messagePolicy";

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
  const activeProducts = ledger.products.filter((product) => !product.archivedAt);
  const hasProduct = activeProducts.length > 0;
  const hasProductCost = activeProducts.some((product) => product.direct > 0 || product.bom.length > 0);
  const hasPricedProduct = activeProducts.some((product) => product.price > 0);

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
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  const [inventoryProductId, setInventoryProductId] = useState<number | null>(null);
  const [showBomEditor, setShowBomEditor] = useState(false);
  const [showQuickCost, setShowQuickCost] = useState(false);
  const [showProductNameSheet, setShowProductNameSheet] = useState(false);
  const [pendingProductDeletion, setPendingProductDeletion] = useState<LedgerProduct | null>(null);
  const [costEditor, setCostEditor] = useState<"hidden" | "funding" | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [showDataManagement, setShowDataManagement] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showAdminMessages, setShowAdminMessages] = useState(false);
  const [messageLevelFilter, setMessageLevelFilter] = useState<MessageLevel | "all">("all");
  const [dismissedBannerId, setDismissedBannerId] = useState<number | null>(null);
  const [initialMessageDetail, setInitialMessageDetail] = useState<InboxMessage | null>(null);
  const displayedBannerRef = useRef<number | null>(null);
  const [pendingIndustry, setPendingIndustry] = useState<IndustryKey | null>(null);
  const { user, loading: authLoading, isAuthenticated, logout, isLoggingOut } = useAuth();
  const cloudLedger = trpc.ledger.get.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const backupLedger = trpc.ledger.backup.useMutation();
  const messageUnread = trpc.messages.unreadCount.useQuery(undefined, { enabled: isAuthenticated, retry: false, refetchOnWindowFocus: true });
  const importantBanner = trpc.messages.importantBanner.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const inboxInput = useMemo(() => messageLevelFilter === "all" ? { limit: 30 } : { limit: 30, level: messageLevelFilter }, [messageLevelFilter]);
  const inbox = trpc.messages.list.useQuery(inboxInput, { enabled: isAuthenticated && showMessages, retry: false });
  const trpcUtils = trpc.useUtils();
  const markMessageRead = trpc.messages.markRead.useMutation({ onSuccess: async () => { await Promise.all([trpcUtils.messages.unreadCount.invalidate(), trpcUtils.messages.list.invalidate(), trpcUtils.messages.importantBanner.invalidate()]); } });
  const markMessageDisplayed = trpc.messages.markDisplayed.useMutation({ onSuccess: async () => { await trpcUtils.messages.importantBanner.invalidate(); } });
  const markAllMessagesRead = trpc.messages.markAllRead.useMutation({ onSuccess: async () => { await Promise.all([trpcUtils.messages.unreadCount.invalidate(), trpcUtils.messages.list.invalidate()]); } });
  const unreadCount = messageUnread.data?.count ?? 0;
  const visibleImportantBanner = importantBanner.data && importantBanner.data.id !== dismissedBannerId ? importantBanner.data : null;

  useEffect(() => {
    if (!visibleImportantBanner || displayedBannerRef.current === visibleImportantBanner.id) return;
    displayedBannerRef.current = visibleImportantBanner.id;
    markMessageDisplayed.mutate({ userMessageId: visibleImportantBanner.id });
  }, [visibleImportantBanner?.id]);
  const currentTemplate = INDUSTRY_TEMPLATES.find((item) => item.key === ledger.profile.industry) ?? INDUSTRY_TEMPLATES[0];
  const [currentCosts, setCurrentCosts] = useState<CostInputs>(() => ({ ...initialCostInputs, ...(ledger.costs ?? {}) }));
  const [selectedPeriod, setSelectedPeriod] = useState(() => getBusinessPeriod());
  const [toast, setToast] = useState<string | null>(null);
  const summary = summarizeLedger(ledger, selectedPeriod);
  const activeProducts = ledger.products.filter((product) => !product.archivedAt);
  const selectedProduct = activeProducts.find((product) => product.id === activeProductId) ?? activeProducts[0] ?? { id: 0, name: "还没有商品", category: "待添加", price: 0, direct: 0, operating: 0, change: "先创建商品", packaging: 0, directLabor: 0, bom: [] };
  const refundingSale = refundSaleId ? ledger.sales.find((sale) => sale.id === refundSaleId) ?? null : null;
  const refundingProduct = refundingSale ? ledger.products.find((product) => product.id === refundingSale.productId) : undefined;
  const inventoryProduct = inventoryProductId ? ledger.products.find((product) => product.id === inventoryProductId) : undefined;
  const readiness = getReadiness(ledger, summary, currentTemplate.productCostLabel);
  const operatingCost = selectedProduct.operating;
  const fullCost = operatingCost + currentCosts.fundingCost;
  const pricingCosts = { ...currentCosts, directCost: selectedProduct.direct };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const restoreLedger = (ledgerJson: string, source: "云端" | "导入文件") => {
    const parsed = JSON.parse(ledgerJson) as LedgerData;
    if (!parsed?.profile || !Array.isArray(parsed.products) || !Array.isArray(parsed.records) || !Array.isArray(parsed.sales)) throw new Error("账本文件格式不完整，未恢复任何数据。");
    const next = normalizeLedger(parsed);
    persistLedger(next);
    setLedger(next);
    setCurrentCosts({ ...initialCostInputs, ...(next.costs ?? {}) });
    setSelectedPeriod(getBusinessPeriod());
    notify(`已恢复${source}账本；历史销售成本快照保持不变`);
  };

  const exportLedger = () => {
    const blob = new Blob([JSON.stringify(ledger, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `算得清-${ledger.profile.storeName || "账本"}-${getBusinessDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify("已导出本机账本文件");
  };

  const backupCurrentLedger = async () => {
    await backupLedger.mutateAsync({ ledgerJson: JSON.stringify(ledger), schemaVersion: 1 });
    await cloudLedger.refetch();
    notify("已创建云端备份；本机账本继续作为当前编辑版本");
  };

  const requestIndustryChange = (industry: IndustryKey) => {
    if (industry !== ledger.profile.industry) setPendingIndustry(industry);
  };

  const confirmIndustryChange = () => {
    if (!pendingIndustry) return;
    const label = INDUSTRY_TEMPLATES.find((item) => item.key === pendingIndustry)?.label ?? "新行业";
    setLedger((current) => {
      const next = applyIndustryTemplate(current, pendingIndustry);
      persistLedger(next);
      return next;
    });
    setPendingIndustry(null);
    notify(`已切换为${label}；历史账本和自定义口径未改动`);
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

  const handleMessageAction = (path?: string | null) => {
    setShowMessages(false);
    const tab = path?.match(/[?&]tab=(home|products|business|profile)/)?.[1] as Tab | undefined;
    navigate(tab ?? "home");
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
          <button className="icon-button notification-button" onClick={() => setShowMessages(true)} aria-label={unreadCount ? `查看提醒，${unreadCount} 条未读` : "查看提醒"}>
            <BellRing size={20} />{Boolean(unreadCount) && <i>{unreadCount > 99 ? "99+" : unreadCount}</i>}
          </button>
        </header>

        {visibleImportantBanner && <ImportantMessageBanner message={visibleImportantBanner} onDismiss={() => setDismissedBannerId(visibleImportantBanner.id)} onOpen={() => { if (!visibleImportantBanner.readAt) markMessageRead.mutate({ userMessageId: visibleImportantBanner.id }); setInitialMessageDetail({ ...visibleImportantBanner, readAt: visibleImportantBanner.readAt ?? new Date() }); setDismissedBannerId(visibleImportantBanner.id); setShowMessages(true); }} />}

        {activeTab === "home" && (
          <HomeView
            product={selectedProduct}
            products={activeProducts}
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
            onProducts={() => navigate("products")}
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
            products={activeProducts}
            activeProductId={activeProductId}
            onSelect={(id) => setActiveProductId(id)}
            onPricing={() => setShowPricing(true)}
            productCostAction={currentTemplate.productCostAction}
            productCostLabel={currentTemplate.productCostLabel}
            onQuickCost={() => setShowQuickCost(true)}
            onBom={() => setShowBomEditor(true)}
            onAdd={() => setShowProductNameSheet(true)}
            onDelete={(product) => setPendingProductDeletion(product)}
            onInventory={(product) => setInventoryProductId(product.id)}
          />
        )}
        {activeTab === "business" && <BusinessView summary={summary} costs={currentCosts} productCount={activeProducts.length} period={selectedPeriod} onPeriodChange={setSelectedPeriod} onPricing={() => setShowPricing(true)} onRecord={() => setShowQuickRecord(true)} onSale={() => setShowSaleRecord(true)} sales={ledger.sales} products={ledger.products} onRefund={(saleId) => setRefundSaleId(saleId)} />}
        {activeTab === "profile" && <ProfileView storeName={ledger.profile.storeName} industry={ledger.profile.industry} categories={ledger.categories} categoryStatus={ledger.categoryStatus} user={user} authLoading={authLoading} backupAt={cloudLedger.data?.backedUpAt} cloudAvailable={Boolean(cloudLedger.data)} onLogin={startLogin} onLogout={async () => { await logout(); notify("已退出账号；本机账本仍保留在当前设备"); }} isLoggingOut={isLoggingOut} onDataManagement={() => setShowDataManagement(true)} onAdminMessages={() => setShowAdminMessages(true)} onIndustryChange={requestIndustryChange} onAddCategory={() => { setEditingCategory(""); }} onEditCategory={(category) => setEditingCategory(category)} onToggleCategory={(category) => { setLedger((current) => { const next = { ...current, categoryStatus: { ...current.categoryStatus, [category]: current.categoryStatus?.[category] === false } }; persistLedger(next); return next; }); notify(currentCategoryIsActive(ledger, category) ? `已停用“${category}”，新记账不会再出现` : `已启用“${category}”，可继续用于记账`); }} onHiddenCost={() => setCostEditor("hidden")} onDebt={() => setCostEditor("funding")} />}
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
      {showSaleRecord && <SalesRecordSheet products={activeProducts} onClose={() => setShowSaleRecord(false)} onSave={(sale) => { setLedger((current) => { const product = current.products.find((entry) => entry.id === sale.productId); const amount = sale.quantity * sale.unitPrice; const salePeriod = getBusinessPeriod(sale.date); const hiddenSource = current.costs.hiddenCostSource ?? "manual"; const hiddenSnapshot = hiddenSource === "ledger" ? current.records.filter((record) => record.type === "expense" && record.date.startsWith(salePeriod) && record.category === (current.costs.hiddenCostCategory ?? "交通配送")).reduce((sum, record) => sum + Math.max(record.amount, 0), 0) : current.costs.hiddenCost; const enrichedSale: SalesRecord = { ...sale, costVersionId: product?.bomVersions?.at(-1)?.id ?? `current-${sale.date}`, unitDirectCostSnapshot: product ? calculateDirectCost(product, current.materials) : 0, fixedCostSnapshot: current.costs.fixedCost, hiddenCostSnapshot: hiddenSnapshot, hiddenCostSourceSnapshot: hiddenSource, hiddenCostBasisSnapshot: current.costs.hiddenCostBasis ?? "perUnit", fundingCostSnapshot: current.costs.fundingCost, fundingSourceSnapshot: current.costs.fundingSource ?? "manual", costPeriod: salePeriod, status: "completed", refunds: [] }; const products = current.products.map((entry) => entry.id === sale.productId && entry.stockQuantity !== undefined ? { ...entry, stockQuantity: Math.max(entry.stockQuantity - sale.quantity, 0) } : entry); const next = { ...current, products, sales: [enrichedSale, ...(current.sales ?? [])], records: [{ id: makeId(), type: "income" as const, amount, category: "销售收入", note: `${product?.name ?? "商品"}销售`, date: sale.date }, ...current.records] }; persistLedger(next); return next; }); setShowSaleRecord(false); setSelectedPeriod(getBusinessPeriod(sale.date)); notify("已记录销售，商品成本已结转"); }} />}
      {refundingSale && <SaleRefundSheet sale={refundingSale} product={refundingProduct} onClose={() => setRefundSaleId(null)} onConfirm={(refund) => { setLedger((current) => { const original = current.sales.find((sale) => sale.id === refundingSale.id); const fullyVoided = original ? getRefundableSaleQuantity(original) - refund.quantity <= 0.0001 : false; const sales = current.sales.map((sale) => sale.id === refundingSale.id ? { ...sale, refunds: [...(sale.refunds ?? []), refund], status: fullyVoided ? "voided" : sale.status ?? "completed", ...(fullyVoided ? { voidedAt: new Date().toISOString(), voidedDate: refund.date } : {}) } : sale); const products = current.products.map((product) => product.id === refundingSale.productId && refund.restock && product.stockQuantity !== undefined ? { ...product, stockQuantity: product.stockQuantity + refund.quantity } : product); const next = { ...current, products, sales, records: [{ id: makeId(), type: "expense" as const, amount: refund.amount, category: "销售退款", note: `${refundingProduct?.name ?? "商品"}退款`, date: refund.date }, ...current.records] }; persistLedger(next); return next; }); setRefundSaleId(null); setSelectedPeriod(getBusinessPeriod(refund.date)); notify(refund.quantity >= refundingSale.quantity ? "已撤销销售并冲回收入、成本和库存" : "已记录部分退款，经营利润已重新计算"); }} />}
      {inventoryProduct && <InventorySheet product={inventoryProduct} onClose={() => setInventoryProductId(null)} onSave={(quantity) => { setLedger((current) => { const products = current.products.map((product) => product.id === inventoryProduct.id ? { ...product, stockQuantity: quantity } : product); const next = { ...current, products }; persistLedger(next); return next; }); setInventoryProductId(null); notify(`已设置“${inventoryProduct.name}”可售库存为 ${quantity}`); }} />}
      {pendingProductDeletion && <DeleteProductSheet product={pendingProductDeletion} saleCount={ledger.sales.filter((sale) => sale.productId === pendingProductDeletion.id).length} onClose={() => setPendingProductDeletion(null)} onConfirm={() => { const product = pendingProductDeletion; const hasSales = ledger.sales.some((sale) => sale.productId === product.id); setLedger((current) => { const products = hasSales ? current.products.map((item) => item.id === product.id ? { ...item, archivedAt: new Date().toISOString() } : item) : current.products.filter((item) => item.id !== product.id); const next = { ...current, products }; persistLedger(next); return next; }); const remaining = activeProducts.filter((item) => item.id !== product.id); setActiveProductId(remaining[0]?.id ?? 0); setPendingProductDeletion(null); notify(hasSales ? `已归档“${product.name}”；历史销售和成本快照已保留` : `已删除“${product.name}”`); }} />}

      {showQuickCost && <QuickCostSheet product={selectedProduct} template={currentTemplate} onClose={() => setShowQuickCost(false)} onOpenAdvanced={() => { setShowQuickCost(false); setShowBomEditor(true); }} onSave={(draft: QuickCostSave) => { setLedger((current) => { const products = current.products.map((item) => item.id === selectedProduct.id ? applyQuickCost(item, draft, current.materials, currentCosts.hiddenCost, currentCosts.fixedCost, new Date().toISOString().slice(0, 10)) : item); const next = { ...current, products }; persistLedger(next); return next; }); setShowQuickCost(false); notify("已保存快速成本，并生成新的成本版本"); }} />}
      {showBomEditor && <BomEditorSheet product={selectedProduct} materials={ledger.materials} categories={getActiveCategories(ledger)} costLabel={currentTemplate.productCostLabel} costAction={currentTemplate.productCostAction} costEmpty={currentTemplate.productCostEmpty} onClose={() => setShowBomEditor(false)} onSave={(items, settings) => { setLedger((current) => { const products = current.products.map((item) => { if (item.id !== selectedProduct.id) return item; const draftProduct = { ...item, bom: items, costCategory: settings.costCategory, lossRate: settings.lossRate, batchYield: settings.batchYield, materialUnitCosts: settings.costSnapshot?.materialUnitCosts, packaging: settings.costSnapshot?.packaging ?? item.packaging, directLabor: settings.costSnapshot?.directLabor ?? item.directLabor }; const recalculated = recalculateProduct(draftProduct, current.materials, currentCosts.hiddenCost, currentCosts.fixedCost); const nextVersion = makeBomVersionSnapshot(draftProduct, current.materials, settings, new Date().toISOString().slice(0, 10)); return { ...recalculated, category: items.length || recalculated.direct > 0 ? "已补齐成本" : getProductPendingLabel(currentTemplate.productCostLabel), bomVersions: [...(item.bomVersions ?? []), nextVersion] }; }); const next = { ...current, products }; persistLedger(next); return next; }); setShowBomEditor(false); notify(`已保存${currentTemplate.productCostLabel}，并生成新的成本版本`); }} />}
      {costEditor && <CostSettingsSheet type={costEditor} value={costEditor === "hidden" ? currentCosts.hiddenCost : currentCosts.fundingCost} hiddenItems={ledger.costs.hiddenCostItems ?? []} hiddenAllocationUnits={ledger.costs.hiddenCostAllocationUnits ?? 0} onClose={() => setCostEditor(null)} onSave={(value, hiddenDetail) => { const nextCosts = { ...currentCosts, [costEditor === "hidden" ? "hiddenCost" : "fundingCost"]: value }; setCurrentCosts(nextCosts); setLedger((current) => { const costs = costEditor === "hidden" && hiddenDetail ? { ...nextCosts, hiddenCostItems: hiddenDetail.items, hiddenCostAllocationUnits: hiddenDetail.allocationUnits } : nextCosts; const next = { ...current, costs, products: costEditor === "hidden" ? current.products.map((product) => recalculateProduct(product, current.materials, nextCosts.hiddenCost, nextCosts.fixedCost)) : current.products }; persistLedger(next); return next; }); setCostEditor(null); notify(costEditor === "hidden" ? "已更新房租、水电、人工等隐形成本；历史销售不受影响" : "已更新资金成本，完整成本已重新计算"); }} />}
      {showDataManagement && <DataManagementSheet isAuthenticated={isAuthenticated} cloudAvailable={Boolean(cloudLedger.data)} backupAt={cloudLedger.data?.backedUpAt} isBackingUp={backupLedger.isPending} onClose={() => setShowDataManagement(false)} onLogin={startLogin} onBackup={backupCurrentLedger} onRestoreCloud={() => { if (!cloudLedger.data) return; restoreLedger(cloudLedger.data.ledgerJson, "云端"); setShowDataManagement(false); }} onExport={exportLedger} onImport={(content) => { restoreLedger(content, "导入文件"); setShowDataManagement(false); }} />}
      {showMessages && <MessageInboxSheet isAuthenticated={isAuthenticated} loading={inbox.isLoading} messages={inbox.data ?? []} unreadCount={messageUnread.data?.count ?? 0} levelFilter={messageLevelFilter} onLevelFilterChange={setMessageLevelFilter} initialMessage={initialMessageDetail} onClose={() => { setShowMessages(false); setInitialMessageDetail(null); }} onLogin={startLogin} onMarkRead={(id) => markMessageRead.mutate({ userMessageId: id })} onMarkAll={() => markAllMessagesRead.mutate()} onAction={handleMessageAction} />}
      {showAdminMessages && user?.role === "admin" && <AdminMessageSheet onClose={() => setShowAdminMessages(false)} onNotice={notify} />}
      {pendingIndustry && <IndustryChangeSheet current={ledger.profile.industry} next={pendingIndustry} onClose={() => setPendingIndustry(null)} onConfirm={confirmIndustryChange} />}
      {toast && <div className="app-toast"><CheckBadge />{toast}</div>}
    </div>
  );
}

export function getHomeAttentionItems({ missingCostProductCount, unpricedProductCount, cashBalance }: { missingCostProductCount: number; unpricedProductCount: number; cashBalance: number }) {
  const items: { title: string; detail: string; tone: "warning" | "cash"; action: "products" | "business" }[] = [];
  if (missingCostProductCount > 0) items.push({ title: `${missingCostProductCount} 个商品待补成本`, detail: "未补成本的商品无法得出可信利润。", tone: "warning", action: "products" });
  if (unpricedProductCount > 0) items.push({ title: `${unpricedProductCount} 个商品未定价`, detail: "先设置售价，才能记录销售和结转利润。", tone: "warning", action: "products" });
  if (cashBalance < 0) items.push({ title: "现金结余为负", detail: "请查看本月现金流出，确认是否需要补充资金。", tone: "cash", action: "business" });
  return items.slice(0, 2);
}

function HomeView({
  product,
  products,
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
  onProducts,
  readiness,
  onPrimaryAction,
}: {
  product: LedgerProduct;
  products: LedgerProduct[];
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
  onProducts: () => void;
  readiness: Readiness;
  onPrimaryAction: () => void;
}) {
  const hasSalesResult = summary.salesCount > 0;
  const hasProduct = product.id !== 0;
  const operatingResult = summary.operatingResult;
  const resultTitle = !hasSalesResult ? "本月利润暂无法判断" : operatingResult > 0 ? "本月经营有盈利" : operatingResult < 0 ? "本月经营亏损" : "本月经营持平";
  const resultDetail = !hasSalesResult ? "补一笔销售后，才能按真实商品成本结转利润。" : `已按 ${summary.salesCount} 笔销售结转，不将现金结余当作利润。`;
  const resultCost = Math.max(summary.salesRevenue - operatingResult, 0);
  const missingCostProductCount = products.filter((item) => item.direct <= 0 && item.bom.length === 0).length;
  const unpricedProductCount = products.filter((item) => item.price <= 0).length;
  const attentionItems = getHomeAttentionItems({ missingCostProductCount, unpricedProductCount, cashBalance: summary.cashBalance });
  const unitCost = Math.max(fullCost, operatingCost, product.direct, 0);
  const unitProfit = product.price > 0 ? product.price - unitCost : null;
  const unitMargin = product.price > 0 ? unitProfit! / product.price * 100 : null;
  const purchaseTotals = Object.entries(summary.categoryTotals).filter(([category]) => /采购|进货|材料/.test(category));
  const purchaseAmount = purchaseTotals.reduce((total, [, amount]) => total + amount, 0);
  const linkedMaterialIds = new Set(products.flatMap((item) => item.bom.map((part) => part.materialId)));
  const unlinkedMaterialCount = materials.filter((material) => !linkedMaterialIds.has(material.id)).length;
  const hasTrendData = summary.dailySeries.some((item) => item.income > 0 || item.expenses > 0);
  const primaryIcon = readiness.stage === "record" ? <ReceiptText size={19} /> : readiness.stage === "product" ? <Plus size={19} /> : readiness.stage === "cost" ? <PackagePlus size={19} /> : readiness.stage === "pricing" ? <Sparkles size={19} /> : readiness.stage === "sale" ? <ShoppingBag size={19} /> : <BarChart3 size={19} />;
  return (
    <div className="page-content home-content">
      <section className="period-row">
        <div><span className="eyebrow">{formatBusinessPeriod(period)}</span><h1>经营总览</h1></div>
        <PeriodPicker period={period} onChange={onPeriodChange} />
      </section>

      <section className="hero-ledger-card">
        <div className="hero-card-top"><span className="ledger-tab">{formatBusinessPeriod(period)} · 本月经营结论</span><span className={hasSalesResult ? "ledger-stamp" : "ledger-stamp pending"}>{hasSalesResult ? "已结转" : "待结转"}</span></div>
        <div className="ledger-card-heading"><span>{resultTitle}</span><BookOpenCheck size={18} /></div>
        <strong>{hasSalesResult ? formatCurrency(operatingResult) : "暂无法判断"}</strong>
        <p><b>{resultDetail}</b></p>
        {hasSalesResult ? <div className="hero-calculation-trail"><span>销售收入<b>{formatCurrency(summary.salesRevenue)}</b></span><i>−</i><span>已结转成本<b>{formatCurrency(resultCost)}</b></span><i>=</i><span className="trail-result">经营结果<b>{formatCurrency(operatingResult)}</b></span></div> : <div className="hero-calculation-trail incomplete"><span>本月收入<b>{formatCurrency(summary.income)}</b></span><i>−</i><span>本月支出<b>{formatCurrency(summary.expenses)}</b></span><i>=</i><span className="trail-result">利润<b>待销售结转</b></span></div>}
        <div className="ledger-card-foot"><span>现金结余 <b>{formatCurrency(summary.cashBalance)}</b></span><button onClick={onBusiness}>查看经营 <ArrowRight size={16} /></button></div>
      </section>

      <section className="readiness-card" aria-label="经营账下一步">
        <div className="readiness-copy"><span className="eyebrow">现在最该做</span><h2>{readiness.title}</h2><p>{readiness.description}</p></div>
        <button className="primary-action readiness-action" onClick={onPrimaryAction}>{primaryIcon}{readiness.actionLabel}<ArrowRight size={16} /></button>
      </section>

      {attentionItems.length > 0 && <section className="home-attention-card" aria-label="需要关注"><div className="section-heading compact"><div><span className="eyebrow">需要关注</span><h2>先处理这 {attentionItems.length} 件事</h2></div></div><div className="home-attention-list">{attentionItems.map((item) => <button className={`home-attention-row ${item.tone}`} key={item.title} onClick={item.action === "products" ? onProducts : onBusiness}><Info size={17} /><span><b>{item.title}</b><small>{item.detail}</small></span><ChevronRight size={16} /></button>)}</div></section>}

      {hasTrendData && <section className="overview-chart-card" aria-label="选定月份收入与支出概览">
        <div className="chart-heading"><div><span className="eyebrow">经营走势</span><h2>收支变化</h2></div><span className="chart-summary-value">{formatCurrency(summary.cashBalance)} <small>现金结余</small></span></div>
        <MiniTrendChart series={summary.dailySeries} />
      </section>}

      {hasProduct && <section className="unit-economics-card" aria-label={`${product.name}单件成本与利润`}>
        <div className="section-heading compact"><div><span className="eyebrow">商品单件账</span><h2>{product.name}</h2></div><button onClick={onProducts}>管理商品 <ChevronRight size={14} /></button></div>
        <div className="unit-economics-metrics"><span><small>售价</small><b>{product.price > 0 ? formatCurrency(product.price) : "未定价"}</b></span><i>−</i><span><small>单件成本</small><b>{formatCurrency(unitCost)}</b></span><i>=</i><span className={unitProfit === null ? "unit-profit pending" : unitProfit >= 0 ? "unit-profit" : "unit-profit loss"}><small>预计单件利润</small><b>{unitProfit === null ? "—" : formatCurrency(unitProfit)}</b></span></div>
        <div className="unit-economics-note">{unitProfit === null ? "先设置售价，才能比较每件商品的成本和利润。" : unitProfit < 0 ? `每卖 1 件预计亏损 ${formatCurrency(Math.abs(unitProfit))}，建议调整售价或成本。` : `预计利润率 ${unitMargin?.toFixed(1)}%，成本包含直接、经营和资金口径。`}</div>
        <details className="cost-breakdown"><summary>查看单件成本构成</summary><CostCompositionChart product={product} operatingCost={operatingCost} fullCost={fullCost} /></details>
      </section>}

      {(purchaseAmount > 0 || unlinkedMaterialCount > 0 || (!materials.length && readiness.stage === "cost")) && <section className="material-pulse-card" aria-label="材料采购提示">
        {purchaseAmount > 0 ? <><span className="material-pulse-icon"><ReceiptText size={17} /></span><div><span className="eyebrow">材料采购</span><b>本月采购 {formatCurrency(purchaseAmount)}</b><small>{purchaseTotals.length} 类采购已计入现金流，不展示材料单价明细。</small></div><button onClick={onBusiness}>查看 <ChevronRight size={15} /></button></> : unlinkedMaterialCount > 0 ? <><span className="material-pulse-icon"><PackagePlus size={17} /></span><div><span className="eyebrow">材料提醒</span><b>{unlinkedMaterialCount} 项材料尚未用于商品成本</b><small>补齐关联后，单件成本会更可信。</small></div><button onClick={onProducts}>补成本 <ChevronRight size={15} /></button></> : <><span className="material-pulse-icon"><PackagePlus size={17} /></span><div><span className="eyebrow">材料</span><b>还没有材料采购记录</b><small>添加材料后可用于商品成本核算。</small></div><button onClick={onAddMaterial}>添加 <Plus size={15} /></button></>}
      </section>}
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

export function ProductsView({ products, activeProductId, onSelect, onPricing, productCostAction, productCostLabel, onQuickCost, onBom, onAdd, onDelete, onInventory }: { products: LedgerProduct[]; activeProductId: number; onSelect: (id: number) => void; onPricing: () => void; productCostAction: string; productCostLabel: string; onQuickCost: () => void; onBom: () => void; onAdd: () => void; onDelete?: (product: LedgerProduct) => void; onInventory?: (product: LedgerProduct) => void }) {
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
        <div className="product-chart-summary"><span>成本 <b>{formatCurrency(selected.operating)}</b></span><span>利润率 <b>{selected.price ? `${margin.toFixed(1)}%` : "—"}</b></span><span>库存 <b>{selected.stockQuantity === undefined ? "未启用" : selected.stockQuantity}</b></span></div>
        <CostCompositionChart product={selected} operatingCost={selected.operating} fullCost={selected.operating + 0.28} />
        <div className="product-action-pair"><button className="primary-action quick-cost-entry" onClick={onQuickCost}><Coins size={18} /><span>{needsCost ? "录入成本" : "更新成本"}<small>最多两项</small></span></button><button className="secondary-card-action" onClick={onBom}><ClipboardList size={17} /> {productCostAction}</button><button className={!needsCost && needsPricing ? "primary-action" : "secondary-card-action"} onClick={onPricing}><Sparkles size={18} /> {needsPricing ? "设置售价" : "定价建议"}</button>{onInventory && <button className="secondary-card-action" onClick={() => onInventory(selected)}>库存设置</button>}{onDelete && <button className="product-delete-action" onClick={() => onDelete(selected)}><Trash2 size={16} /> 删除商品</button>}</div>
      </section>
    </div>
  );
}

export function getRefundableSaleQuantity(sale: SalesRecord) { return Math.max(sale.quantity - (sale.refunds ?? []).reduce((sum, refund) => sum + Math.max(refund.quantity, 0), 0), 0); }

function BusinessView({ summary, costs, productCount, period, onPeriodChange, onPricing, onRecord, onSale, sales, products, onRefund }: { summary: ReturnType<typeof summarizeLedger>; costs: CostInputs; productCount: number; period: string; onPeriodChange: (period: string) => void; onPricing: () => void; onRecord: () => void; onSale: () => void; sales: SalesRecord[]; products: LedgerProduct[]; onRefund: (saleId: string) => void }) {
  const [activeLabel, setActiveLabel] = useState(summary.dailySeries.at(-1)?.label ?? "");
  const [showCashDetails, setShowCashDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const chartKey = summary.dailySeries.map((item) => `${item.label}:${item.income}:${item.expenses}`).join("|");
  const maxValue = Math.max(...summary.dailySeries.flatMap((item) => [item.income, item.expenses]), 1);
  const activeItem = summary.dailySeries.find((item) => item.label === activeLabel) ?? summary.dailySeries.at(-1);
  const hasTrendData = summary.dailySeries.some((item) => item.income > 0 || item.expenses > 0);
  const materialTotal = Object.entries(summary.categoryTotals).filter(([category]) => /采购|进货|材料|货品/.test(category)).reduce((total, [, value]) => total + value, 0);
  const hiddenTotal = Math.max(summary.expenses - materialTotal, 0);
  const periodSales = sales.filter((sale) => sale.date.startsWith(period) || (sale.refunds ?? []).some((refund) => refund.date.startsWith(period))).slice(0, 6);

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
      {periodSales.length > 0 && <section className="sales-history-card"><div className="section-heading compact"><div><span className="eyebrow">销售记录</span><h2>撤销或退款</h2></div></div><div className="sales-history-list">{periodSales.map((sale) => { const product = products.find((item) => item.id === sale.productId); const remaining = getRefundableSaleQuantity(sale); const refunded = (sale.refunds ?? []).reduce((sum, refund) => sum + refund.amount, 0); return <article className="sales-history-row" key={sale.id}><div><b>{product?.name ?? "已归档商品"}</b><small>{sale.date} · {sale.quantity} 件 · {formatCurrency(sale.quantity * sale.unitPrice)}{refunded > 0 ? ` · 已退 ${formatCurrency(refunded)}` : ""}</small></div>{remaining > 0 ? <button onClick={() => onRefund(sale.id)}>退款/撤销 <ChevronRight size={14} /></button> : <span className="sale-voided">已撤销</span>}</article>; })}</div></section>}
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

export function ProfileView({ storeName, industry, categories, categoryStatus, user, authLoading, backupAt, cloudAvailable, onLogin, onLogout, isLoggingOut, onDataManagement, onAdminMessages, onIndustryChange, onAddCategory, onEditCategory, onToggleCategory, onHiddenCost, onDebt }: { storeName: string; industry: IndustryKey; categories: string[]; categoryStatus?: Record<string, boolean>; user: { name: string | null; role: "admin" | "user" } | null; authLoading: boolean; backupAt?: Date; cloudAvailable: boolean; onLogin: () => void; onLogout: () => Promise<unknown>; isLoggingOut: boolean; onDataManagement: () => void; onAdminMessages?: () => void; onIndustryChange: (industry: IndustryKey) => void; onAddCategory: () => void; onEditCategory: (category: string) => void; onToggleCategory: (category: string) => void; onHiddenCost: () => void; onDebt: () => void }) {
  const template = INDUSTRY_TEMPLATES.find((item) => item.key === industry) ?? INDUSTRY_TEMPLATES[0];
  const industryName = template.label;
  return (
    <div className="page-content profile-content">
      <section className="profile-hero"><div className="profile-mark"><BrandMark size={54} /></div><div><span>{industryName}</span><h1>{storeName}</h1></div></section>
      <section className="account-status-card" aria-label="账户与数据">
        <div className="account-status-icon">{user ? <ShieldCheck size={21} /> : <Cloud size={21} />}</div><div className="account-status-copy"><b>{authLoading ? "检查账户状态" : user ? (user.name || "已登录账号") : "本机账本"}</b><small>{authLoading ? "请稍候" : user ? (cloudAvailable && backupAt ? `最近备份：${new Date(backupAt).toLocaleDateString("zh-CN")}` : "尚未创建云端备份") : "登录后可备份并在新设备恢复"}</small></div>
        {user ? <button className="text-action" onClick={onDataManagement}>数据管理<ChevronRight size={15} /></button> : <button className="account-login" onClick={onLogin}><LogIn size={15} />登录并备份</button>}
      </section>
      {user && <button className="account-logout" onClick={() => void onLogout()} disabled={isLoggingOut}><LogOut size={15} />{isLoggingOut ? "正在退出" : "退出账号"}</button>}
      <section className="setting-group"><div className="setting-group-heading"><span className="group-label">经营资料</span><span className="setting-summary">新录入按行业适配</span></div><div className="industry-switcher" role="list" aria-label="选择行业模板">{INDUSTRY_TEMPLATES.map((template) => <button key={template.key} className={template.key === industry ? "industry-switch-card active" : "industry-switch-card"} onClick={() => onIndustryChange(template.key)}><span className="industry-switch-symbol">{template.shortLabel.slice(0, 1)}</span><span><b>{template.label}</b><small>{template.description}</small></span>{template.key === industry && <CheckBadge />}</button>)}</div></section>
      <section className="setting-group"><div className="setting-group-heading"><span className="group-label">成本项目</span><button className="text-action" onClick={onAddCategory}><Plus size={14} />新增</button></div><div className="custom-category-list">{categories.map((category) => { const active = categoryStatus?.[category] !== false; return <div className={active ? "custom-category-row" : "custom-category-row disabled"} key={category}><button className="category-name-button" onClick={() => onEditCategory(category)}><span>{category}</span><small>{active ? "启用" : "停用"}</small></button><button className="category-toggle" aria-label={`${active ? "停用" : "启用"}${category}`} onClick={() => onToggleCategory(category)}>{active ? "停用" : "启用"}</button><ChevronRight size={16} /></div>; })}</div></section><section className="setting-group"><span className="group-label">经营口径</span><SettingItem icon={<ClipboardList size={19} />} label="隐形成本" note={template.hiddenCostCategory} onClick={onHiddenCost} /><SettingItem icon={<WalletCards size={19} />} label="资金成本" note="仅利息和融资费" onClick={onDebt} /><SettingItem icon={<ReceiptText size={19} />} label="默认分摊" note="按销量" onClick={() => undefined} /></section>
      <section className="setting-group"><span className="group-label">数据与安全</span><SettingItem icon={<BookOpenCheck size={19} />} label="成本口径" note="直接 · 经营 · 完整" onClick={() => undefined} /><SettingItem icon={<Settings2 size={19} />} label="数据管理" note={user ? "备份、恢复与导出" : "导出与导入恢复"} onClick={onDataManagement} />{user?.role === "admin" && <SettingItem icon={<Send size={19} />} label="商户消息" note="创建、发布与撤回" onClick={() => onAdminMessages?.()} />}</section>
    </div>
  );
}

function DataManagementSheet({ isAuthenticated, cloudAvailable, backupAt, isBackingUp, onClose, onLogin, onBackup, onRestoreCloud, onExport, onImport }: { isAuthenticated: boolean; cloudAvailable: boolean; backupAt?: Date; isBackingUp: boolean; onClose: () => void; onLogin: () => void; onBackup: () => Promise<void>; onRestoreCloud: () => void; onExport: () => void; onImport: (content: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"backup" | "restore" | "import" | null>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const importFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const content = String(reader.result ?? ""); try { JSON.parse(content); setPendingImport(content); setConfirmAction("import"); } catch { setError("导入失败，请选择算得清导出的JSON文件。"); } };
    reader.readAsText(file);
  };
  const confirm = async () => {
    if (confirmAction === "backup") await onBackup();
    if (confirmAction === "restore") onRestoreCloud();
    if (confirmAction === "import" && pendingImport) onImport(pendingImport);
    setConfirmAction(null);
  };
  const title = confirmAction === "backup" ? "用本机账本替换云端备份？" : confirmAction === "restore" ? "用云端账本覆盖本机？" : "用导入账本覆盖本机？";
  const detail = confirmAction === "backup" ? "云端旧备份将被替换，但当前设备账本不变。" : "当前设备账本将被替换；两份账本不会自动合并。";
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet data-management-sheet" role="dialog" aria-modal="true" aria-label="数据管理" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">数据与安全</span><h2>账本备份与恢复</h2></div><button className="icon-button" onClick={onClose}>×</button></header>{isAuthenticated ? <><div className="data-state"><Cloud size={18} /><span><b>{cloudAvailable ? "云端备份可恢复" : "尚未备份"}</b><small>{cloudAvailable && backupAt ? `最近备份：${new Date(backupAt).toLocaleString("zh-CN")}` : "先备份当前设备账本"}</small></span></div><button className="primary-action sheet-action" disabled={isBackingUp} onClick={() => cloudAvailable ? setConfirmAction("backup") : void onBackup()}><Cloud size={16} />{isBackingUp ? "正在备份" : "备份当前账本"}</button>{cloudAvailable && <button className="secondary-action sheet-action" onClick={() => setConfirmAction("restore")}><Download size={16} />用云端账本覆盖本机</button>}</> : <><div className="data-state"><ShieldCheck size={18} /><span><b>当前为本机账本</b><small>登录后才可创建云端备份；不会自动上传。</small></span></div><button className="primary-action sheet-action" onClick={onLogin}><LogIn size={16} />登录并备份</button></>}<div className="data-divider" /><button className="secondary-action sheet-action" onClick={onExport}><Download size={16} />导出本机账本 JSON</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => importFile(event.target.files?.[0])} /><button className="secondary-action sheet-action" onClick={() => fileRef.current?.click()}><Upload size={16} />导入并覆盖本机账本</button><p className="data-warning">恢复或导入会覆盖当前设备账本；云端与本机不会自动合并。</p>{confirmAction && <div className="data-confirmation"><b>{title}</b><p>{detail}</p><div><button className="secondary-action" onClick={() => setConfirmAction(null)}>取消</button><button className="primary-action" onClick={() => void confirm()}>确认继续</button></div></div>}{error && <p className="form-error" role="alert">{error}</p>}</section></div>;
}

function IndustryChangeSheet({ current, next, onClose, onConfirm }: { current: IndustryKey; next: IndustryKey; onClose: () => void; onConfirm: () => void }) {
  const currentTemplate = INDUSTRY_TEMPLATES.find((item) => item.key === current) ?? INDUSTRY_TEMPLATES[0];
  const nextTemplate = INDUSTRY_TEMPLATES.find((item) => item.key === next) ?? INDUSTRY_TEMPLATES[0];
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet industry-change-sheet" role="dialog" aria-modal="true" aria-label="确认切换行业" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">经营资料</span><h2>切换为{nextTemplate.label}</h2></div><button className="icon-button" onClick={onClose}>×</button></header><p className="industry-change-lead">从{currentTemplate.label}切换后，只影响之后的新录入。</p><div className="impact-list"><p><b>将改变</b> 默认成本分类、商品成本名称、快速成本预设和模板隐形成本分类。</p><p><b>不会改变</b> 已有商品、材料、流水、销售、成本版本和自定义成本口径。</p></div><button className="primary-action sheet-action" onClick={onConfirm}><CheckBadge />确认切换行业</button></section></div>;
}

type InboxMessage = { id: number; title: string; summary: string; body: string | null; level: MessageLevel; actionLabel: string | null; actionPath: string | null; publishedAt: Date | null; expiresAt?: Date | null; readAt: Date | null; createdAt: Date };

const messageLevelFilters: { value: MessageLevel | "all"; label: string }[] = [{ value: "all", label: "全部" }, { value: "safety", label: "账本安全" }, { value: "important", label: "重要公告" }, { value: "update", label: "产品更新" }, { value: "info", label: "服务消息" }];

export function ImportantMessageBanner({ message, onDismiss, onOpen }: { message: InboxMessage; onDismiss: () => void; onOpen: () => void }) {
  return <aside className="important-message-banner" aria-label="重要公告"><span className="message-level important">重要公告</span><div><b>{message.title}</b><p>{message.summary}</p></div><button onClick={onOpen}>查看</button><button className="banner-dismiss" aria-label="关闭重要公告" onClick={onDismiss}>×</button></aside>;
}

export function MessageInboxSheet({ isAuthenticated, loading, messages, unreadCount, levelFilter, onLevelFilterChange, initialMessage, onClose, onLogin, onMarkRead, onMarkAll, onAction }: { isAuthenticated: boolean; loading: boolean; messages: InboxMessage[]; unreadCount: number; levelFilter?: MessageLevel | "all"; onLevelFilterChange?: (level: MessageLevel | "all") => void; initialMessage?: InboxMessage | null; onClose: () => void; onLogin: () => void; onMarkRead: (id: number) => void; onMarkAll: () => void; onAction: (path?: string | null) => void }) {
  const [activeMessage, setActiveMessage] = useState<InboxMessage | null>(initialMessage ?? null);
  useEffect(() => { if (initialMessage) setActiveMessage(initialMessage); }, [initialMessage?.id]);
  const openMessage = (message: InboxMessage) => {
    if (!message.readAt) onMarkRead(message.id);
    setActiveMessage({ ...message, readAt: message.readAt ?? new Date() });
  };
  const content = !isAuthenticated ? <div className="message-empty"><BellRing size={22} /><b>登录后查看服务消息</b><small>运营通知只会展示给对应的已登录商户。</small><button className="primary-action" onClick={onLogin}><LogIn size={16} />登录查看</button></div> : activeMessage ? <article className="message-detail"><button className="message-back" onClick={() => setActiveMessage(null)}>‹ 返回消息列表</button><span className={`message-level ${activeMessage.level}`}>{getMessageLevelLabel(activeMessage.level)}</span><h3>{activeMessage.title}</h3><time>{new Date(activeMessage.publishedAt ?? activeMessage.createdAt).toLocaleString("zh-CN")}</time><p className="message-detail-summary">{activeMessage.summary}</p><div className="message-detail-body">{activeMessage.body?.trim() || "暂无更多说明。"}</div>{activeMessage.actionLabel && <button className="primary-action message-detail-action" onClick={() => onAction(activeMessage.actionPath)}>{activeMessage.actionLabel}<ChevronRight size={16} /></button>}</article> : loading ? <div className="message-empty"><span className="loading-sweep" />正在加载消息</div> : <><div className="message-inbox-meta"><span>{unreadCount ? `${unreadCount} 条未读` : "已全部读完"}</span>{unreadCount > 0 && <button onClick={onMarkAll}>全部已读</button>}</div><div className="message-filter-row" role="group" aria-label="按重要等级筛选消息">{messageLevelFilters.map((filter) => <button className={(levelFilter ?? "all") === filter.value ? "selected" : ""} key={filter.value} onClick={() => onLevelFilterChange?.(filter.value)}>{filter.label}</button>)}</div>{!messages.length ? <div className="message-empty"><BellRing size={22} /><b>这个等级暂无有效消息</b><small>过期或已撤回的消息不会在这里显示。</small></div> : <div className="message-list">{messages.map((message) => <article className={message.readAt ? "message-card" : "message-card unread"} key={message.id}><button className="message-copy" onClick={() => openMessage(message)}><span className={`message-level ${message.level}`}>{getMessageLevelLabel(message.level)}</span><b>{message.title}</b><p>{message.summary}</p><small>{new Date(message.publishedAt ?? message.createdAt).toLocaleString("zh-CN")}</small></button><button className="message-action" onClick={() => openMessage(message)}>详情<ChevronRight size={14} /></button></article>)}</div>}</>;
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet message-inbox-sheet" role="dialog" aria-modal="true" aria-label="消息中心" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">服务与提醒</span><h2>消息中心</h2></div><button className="icon-button" onClick={onClose}>×</button></header>{content}</section></div>;
}

const messageActionOptions = [
  { value: "", label: "不设置跳转" },
  { value: "/?tab=home", label: "查看首页" },
  { value: "/?tab=products", label: "查看商品" },
  { value: "/?tab=business", label: "查看经营" },
  { value: "/?tab=profile", label: "打开我的" },
] as const;

function AdminMessageSheet({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState<MessageLevel>("info");
  const [targetType, setTargetType] = useState<"all" | "user">("all");
  const [targetUserId, setTargetUserId] = useState("");
  const [actionPath, setActionPath] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const targets = trpc.admin.messages.targetUsers.useQuery();
  const previewInput = useMemo(() => ({ targetType, targetUserId: targetType === "user" && targetUserId ? Number(targetUserId) : undefined }), [targetType, targetUserId]);
  const preview = trpc.admin.messages.preview.useQuery(previewInput, { enabled: targetType === "all" || Boolean(targetUserId) });
  const campaigns = trpc.admin.messages.list.useQuery();
  const createDraft = trpc.admin.messages.createDraft.useMutation();
  const publish = trpc.admin.messages.publish.useMutation({ onSuccess: async () => { await Promise.all([utils.admin.messages.list.invalidate(), utils.admin.messages.preview.invalidate()]); onNotice("消息已发布，收件人已写入站内收件箱"); } });
  const recall = trpc.admin.messages.recall.useMutation({ onSuccess: async () => { await utils.admin.messages.list.invalidate(); onNotice("消息已撤回，用户将不再看到该消息"); } });
  const selectedAction = messageActionOptions.find((item) => item.value === actionPath);
  const saveDraft = async () => {
    setError(null);
    try {
      const draft = await createDraft.mutateAsync({ title, summary, body: body.trim() || null, level, targetType, targetUserId: targetType === "user" && targetUserId ? Number(targetUserId) : null, actionPath: selectedAction?.value || null, actionLabel: selectedAction?.value ? selectedAction.label : null, expiresAt: expiresOn ? new Date(`${expiresOn}T23:59:59`) : null });
      await utils.admin.messages.list.invalidate();
      onNotice(`已保存草稿，可发布给 ${preview.data?.recipientCount ?? 0} 位商户`);
      setTitle(""); setSummary(""); setBody(""); setActionPath(""); setExpiresOn("");
      if (!draft.id) setError("草稿已保存，但未返回可发布编号。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存草稿失败，请稍后重试。"); }
  };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet admin-message-sheet" role="dialog" aria-modal="true" aria-label="商户消息后台" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">管理员后台</span><h2>发布商户消息</h2></div><button className="icon-button" onClick={onClose}>×</button></header><p className="admin-message-note">消息只会投递至站内收件箱。发布后会固化收件人范围，正文不支持外部链接。</p><label className="admin-message-field"><span>消息类型</span><select value={level} onChange={(event) => setLevel(event.target.value as MessageLevel)}>{(["safety", "important", "update", "info"] as MessageLevel[]).map((item) => <option value={item} key={item}>{getMessageLevelLabel(item)}</option>)}</select></label><label className="admin-message-field"><span>标题</span><input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="例如：请及时备份账本" /></label><label className="admin-message-field"><span>摘要</span><input value={summary} maxLength={180} onChange={(event) => setSummary(event.target.value)} placeholder="最多两行，说明发生了什么和下一步动作" /></label><label className="admin-message-field"><span>详细说明（可选）</span><textarea value={body} maxLength={10000} onChange={(event) => setBody(event.target.value)} placeholder="仅填写与商户服务相关的说明" /></label><label className="admin-message-field"><span>有效期（可选）</span><input aria-label="消息有效期" type="date" min={new Date().toISOString().slice(0, 10)} value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /><small>留空则长期有效；到期后不会再展示或计入未读。</small></label><div className="admin-target"><span>投递范围</span><div><button className={targetType === "all" ? "selected" : ""} onClick={() => setTargetType("all")}>全部已登录商户</button><button className={targetType === "user" ? "selected" : ""} onClick={() => setTargetType("user")}>指定商户</button></div>{targetType === "user" && <select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}><option value="">选择商户</option>{targets.data?.map((target) => <option value={target.id} key={target.id}>{target.name || target.email || `商户 #${target.id}`}</option>)}</select>}<small>{preview.isLoading ? "正在计算收件人…" : `预计投递：${preview.data?.recipientCount ?? 0} 位商户`}</small></div><label className="admin-message-field"><span>点击动作</span><select value={actionPath} onChange={(event) => setActionPath(event.target.value)}>{messageActionOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action sheet-action" disabled={createDraft.isPending || !title.trim() || !summary.trim() || (targetType === "user" && !targetUserId)} onClick={() => void saveDraft()}><FileText size={16} />{createDraft.isPending ? "正在保存" : "保存为草稿"}</button><div className="campaign-list"><div className="campaign-list-head"><b>近期消息</b><small>发布后可撤回，不会删除投递审计</small></div>{campaigns.isLoading ? <div className="campaign-empty">正在读取消息记录…</div> : !campaigns.data?.length ? <div className="campaign-empty">还没有创建消息。</div> : campaigns.data.map((campaign) => <div className="campaign-row" key={campaign.id}><span className={`message-level ${campaign.level}`}>{getMessageLevelLabel(campaign.level)}</span><div><b>{campaign.title}</b><small>{campaign.status === "draft" ? "草稿" : campaign.status === "published" ? `${isMessageExpired(campaign.expiresAt) ? "已过期" : `已发布 · ${campaign.recipientCount} 人`}${campaign.expiresAt ? ` · 有效至 ${new Date(campaign.expiresAt).toLocaleDateString("zh-CN")}` : " · 长期有效"}` : "已撤回"}</small></div>{campaign.status === "draft" && <button onClick={() => publish.mutate({ campaignId: campaign.id })} disabled={publish.isPending}><Send size={14} />发布</button>}{campaign.status === "published" && <button className="recall" onClick={() => recall.mutate({ campaignId: campaign.id })} disabled={recall.isPending}>撤回</button>}</div>)}</div></section></div>;
}

export function DeleteProductSheet({ product, saleCount, onClose, onConfirm }: { product: LedgerProduct; saleCount: number; onClose: () => void; onConfirm: () => void }) {
  const hasSales = saleCount > 0;
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet delete-product-sheet" role="dialog" aria-modal="true" aria-label="删除商品" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">商品管理</span><h2>{hasSales ? "归档商品" : "删除商品"}</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="delete-product-warning"><Trash2 size={19} /><span><b>{product.name}</b><p>{hasSales ? `该商品已有 ${saleCount} 笔销售，无法直接移除。确认后将从日常商品和销售选择中隐藏，但历史销售、收入与成本快照会保留。` : "该商品还没有销售记录。确认后将从当前账本移除，商品成本明细也会一并删除。"}</p></span></div><div className="delete-product-actions"><button className="secondary-action" onClick={onClose}>取消</button><button className="danger-action" onClick={onConfirm}>{hasSales ? "确认归档" : "确认删除"}</button></div></section></div>;
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
    if (selected.stockQuantity !== undefined && parsedQuantity > selected.stockQuantity) {
      setError(`可售库存仅剩 ${selected.stockQuantity}，请调整数量或先补充库存。`);
      return;
    }
    onSave({ id: makeId(), productId: selected.id, quantity: parsedQuantity, unitPrice: parsedPrice, date, note: "" });
  };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">销售</span><h2>记录销售</h2></div><button className="icon-button" onClick={onClose}>×</button></header><label className="field-block"><span>商品</span><select value={productId} onChange={(event) => { const nextId = Number(event.target.value); setProductId(nextId); const next = products.find((product) => product.id === nextId); setUnitPrice(String(next?.price ?? 0)); setError(null); }}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>{selected?.stockQuantity !== undefined && <p className="record-category-hint">当前可售库存：{selected.stockQuantity}</p>}<div className="two-fields"><label className="field-block"><span>数量</span><div className="money-input"><input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(null); }} /><b>份</b></div></label><label className="field-block"><span>成交价</span><div className="money-input"><input aria-label="销售成交价" type="number" min="0.01" step="0.01" value={unitPrice} onChange={(event) => { setUnitPrice(event.target.value); setError(null); }} /><b>元</b></div></label></div><label className="field-block business-date-field"><span>业务日期</span><input aria-label="销售业务日期" type="date" value={date} onChange={(event) => { setDate(event.target.value); setError(null); }} /></label>{selected?.price <= 0 && <p className="record-category-hint">该商品尚未定价，请先设置售价后再结转。</p>}<div className="material-preview"><span>销售收入</span><strong>{formatCurrency((Number(quantity) || 0) * (Number(unitPrice) || 0))}</strong><p>同时结转收入和商品成本。</p></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action sheet-action" onClick={save}><CheckBadge /> 保存并结转</button></section></div>;
}

export function SaleRefundSheet({ sale, product, onClose, onConfirm }: { sale: SalesRecord; product?: LedgerProduct; onClose: () => void; onConfirm: (refund: SaleRefund) => void }) {
  const remainingQuantity = getRefundableSaleQuantity(sale);
  const refundedAmount = (sale.refunds ?? []).reduce((sum, refund) => sum + refund.amount, 0);
  const remainingAmount = Math.max(sale.quantity * sale.unitPrice - refundedAmount, 0);
  const [quantity, setQuantity] = useState(String(remainingQuantity));
  const [amount, setAmount] = useState(String(remainingAmount));
  const [date, setDate] = useState(getBusinessDate);
  const [restock, setRestock] = useState(product?.stockQuantity !== undefined);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const parsedQuantity = Number(quantity);
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > remainingQuantity) { setError(`退款数量应大于 0 且不超过剩余 ${remainingQuantity} 件。`); return; }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > remainingAmount) { setError(`退款金额应大于 0 且不超过剩余 ${formatCurrency(remainingAmount)}。`); return; }
    onConfirm({ id: makeId(), quantity: parsedQuantity, amount: parsedAmount, date, note: "销售退款", restock });
  };
  const isFullVoid = Number(quantity) === remainingQuantity && Number(amount) === remainingAmount;
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet sale-refund-sheet" role="dialog" aria-modal="true" aria-label="销售退款或撤销" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">销售纠错</span><h2>退款或撤销销售</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="sale-refund-origin"><b>{product?.name ?? "已归档商品"}</b><small>原销售：{sale.date} · {sale.quantity} 件 · {formatCurrency(sale.quantity * sale.unitPrice)}</small><small>还可退款：{remainingQuantity} 件 · {formatCurrency(remainingAmount)}</small></div><div className="two-fields"><label className="field-block"><span>退款数量</span><div className="money-input"><input aria-label="退款数量" type="number" min="0.01" max={remainingQuantity} step="0.01" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(null); }} /><b>件</b></div></label><label className="field-block"><span>退款金额</span><div className="money-input"><input aria-label="退款金额" type="number" min="0.01" max={remainingAmount} step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setError(null); }} /><b>元</b></div></label></div><label className="field-block business-date-field"><span>退款日期</span><input aria-label="退款业务日期" type="date" value={date} onChange={(event) => { setDate(event.target.value); setError(null); }} /></label>{product?.stockQuantity !== undefined ? <label className="material-cash-toggle"><input type="checkbox" checked={restock} onChange={(event) => setRestock(event.target.checked)} /><span><b>商品已退回可售库存</b><small>{restock ? `确认后将恢复 ${quantity || 0} 件库存。` : "仅退款，不恢复库存。"}</small></span></label> : <p className="record-category-hint">该商品尚未启用库存台账；本次仅回滚收入和成本，不虚构库存数量。</p>}<div className="refund-impact"><span>退款后将</span><p>冲减本次销售收入与对应成本，并按退款日期重新计算经营利润。原销售与当时成本快照会保留。</p></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="danger-action sheet-action" onClick={save}>{isFullVoid ? "确认全额撤销" : "确认退款"}</button></section></div>;
}

export function InventorySheet({ product, onClose, onSave }: { product: LedgerProduct; onClose: () => void; onSave: (quantity: number) => void }) {
  const [quantity, setQuantity] = useState(String(product.stockQuantity ?? 0));
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed < 0) { setError("库存必须是大于或等于 0 的数字。"); return; }
    onSave(parsed);
  };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet inventory-sheet" role="dialog" aria-modal="true" aria-label="库存设置" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">商品库存</span><h2>设置可售库存</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="cost-setting-note"><Info size={17} /><p>启用后，销售会扣减库存；退款时可选择将商品退回库存。此前未启用库存的历史销售不会倒算库存。</p></div><label className="field-block"><span>{product.name} 当前可售数量</span><div className="money-input"><input aria-label="可售库存数量" type="number" min="0" step="0.01" inputMode="decimal" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(null); }} /><b>件</b></div></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action sheet-action" onClick={save}><CheckBadge />保存库存</button></section></div>;
}

export function getHiddenCostAllocation(items: HiddenCostItem[], allocationUnits: number, fallbackPerUnit: number) {
  const total = items.reduce((sum, item) => sum + Math.max(Number(item.amount) || 0, 0), 0);
  if (total > 0 && allocationUnits > 0) return Math.round(total / allocationUnits * 10_000) / 10_000;
  return Math.max(fallbackPerUnit || 0, 0);
}

function CostSettingsSheet({ type, value, hiddenItems, hiddenAllocationUnits, onClose, onSave }: { type: "hidden" | "funding"; value: number; hiddenItems: HiddenCostItem[]; hiddenAllocationUnits: number; onClose: () => void; onSave: (value: number, hiddenDetail?: { items: HiddenCostItem[]; allocationUnits: number }) => void }) {
  const [amount, setAmount] = useState(value);
  const [items, setItems] = useState<HiddenCostItem[]>(() => type === "hidden" ? (hiddenItems.length ? hiddenItems : ["房租", "水电", "人工"].map((label) => ({ id: makeId(), label, amount: 0 }))) : []);
  const [allocationUnits, setAllocationUnits] = useState(hiddenAllocationUnits ? String(hiddenAllocationUnits) : "");
  const [error, setError] = useState<string | null>(null);
  const title = type === "hidden" ? "隐形成本" : "资金成本";
  const detailTotal = items.reduce((sum, item) => sum + Math.max(Number(item.amount) || 0, 0), 0);
  const parsedUnits = Number(allocationUnits);
  const hasDetailAmount = detailTotal > 0;
  const perUnit = type === "hidden" ? getHiddenCostAllocation(items, parsedUnits, amount) : Math.max(amount || 0, 0);
  const save = () => {
    if (type === "hidden" && hasDetailAmount && (!Number.isFinite(parsedUnits) || parsedUnits <= 0)) { setError("请填写本期预计分摊件数，才能把费用分到每件商品。 "); return; }
    onSave(perUnit, type === "hidden" ? { items: items.map((item) => ({ ...item, label: item.label.trim(), amount: Math.max(Number(item.amount) || 0, 0) })).filter((item) => item.label), allocationUnits: hasDetailAmount ? parsedUnits : 0 } : undefined);
  };
  if (type === "funding") return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">经营成本</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="cost-setting-note"><Info size={17} /><p>只填利息和融资费；本金只影响现金。</p></div><label className="field-block"><span>每份金额</span><div className="money-input"><input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /><b>元</b></div></label><button className="primary-action sheet-action" onClick={save}><CheckBadge /> 保存</button></section></div>;
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet hidden-cost-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">经营成本</span><h2>隐形成本明细</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="cost-setting-note"><Info size={17} /><p>填写本期房租、水电、人工等费用，再按预计销量或件数均摊。保存只更新未来成本；已结转销售的成本快照不变。</p></div><div className="hidden-cost-items">{items.map((item) => <div className="hidden-cost-row" key={item.id}><input aria-label={`${item.label}名称`} value={item.label} maxLength={16} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, label: event.target.value } : entry))} /><div className="money-input"><input aria-label={`${item.label}金额`} type="number" min="0" step="0.01" inputMode="decimal" value={item.amount || ""} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, amount: Number(event.target.value) } : entry))} /><b>元</b></div><button aria-label={`删除${item.label || "费用"}`} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>×</button></div>)}</div><button className="hidden-cost-add" onClick={() => setItems((current) => [...current, { id: makeId(), label: "其他费用", amount: 0 }])}><Plus size={15} />新增费用项</button><div className="hidden-cost-allocation"><label className="field-block"><span>本期预计分摊件数</span><div className="money-input"><input aria-label="本期预计分摊件数" type="number" min="1" step="1" inputMode="numeric" value={allocationUnits} onChange={(event) => { setAllocationUnits(event.target.value); setError(null); }} placeholder="例如 300" /><b>件</b></div></label><div className="hidden-cost-preview"><span>本期费用合计 <b>{formatCurrency(detailTotal)}</b></span><strong>每件分摊 {formatCurrency(perUnit)}</strong></div></div>{!hasDetailAmount && <label className="field-block"><span>没有拆分时，沿用每件金额</span><div className="money-input"><input aria-label="每件隐形成本" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /><b>元</b></div></label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action sheet-action" onClick={save}><CheckBadge /> 保存并更新未来成本</button></section></div>;
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
