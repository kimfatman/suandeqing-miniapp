/** 商户账簿工作台：首页按“结论—待办—明细”排列，让小商家在每次打开时先知道该做什么。 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  AlertTriangle,
  Banknote,
  BarChart3,
  BellRing,
  BookOpenCheck,
  ChevronLeft,
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
import { BrandMark, BrandSignature } from "@/components/BrandMark";
import { MetricCard } from "@/components/MetricCard";
import { PricingPanel, type PricingCostLine } from "@/components/PricingPanel";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { QuickRecordSheet } from "@/components/QuickRecordSheet";
import { BomEditorSheet } from "@/components/BomEditorSheet";
import { QuickCostSheet, QuickCostSave } from "@/components/QuickCostSheet";
import { MonthlyAllocationSheet, MonthlyCostReportSheet } from "@/components/MonthlyCostSheets";
import { CostInputs, formatCurrency, getScopeCost } from "@/lib/costEngine";
import * as XLSX from "xlsx";
import {   applyIndustryTemplate, applyQuickCost,
  applyMonthlyIndirectPlan, calculateDirectCost, calculateEquipmentDepreciation, calculateMonthlyIndirectPlanTotal, getMonthlyIndirectPlanTiming, calculateProductIndirectAllocations, calculateUnitDirectCostDetails, calculateUnitIndirectCostDetails, emptyMonthlyFixedCosts,
  formatBusinessPeriod, getActiveCategories, getDashboardHealth, getInventoryHealth, getOperatingReminders, getMonthlyIndirectPlan, calculateUnitCost, getBusinessDate, getBusinessPeriod, getRevenueGoalProgress, getSalesTrendSeries, getTrendDateWindow, INDUSTRY_TEMPLATES, AllocationMethod, CashTrendRange, HiddenCostItem, IndustryKey, IndustryTemplate, LedgerData, LedgerRecord, clearLocalLedgerStorage, createEmptyLedger, deleteSaleTransaction, initializeIndustryLedger, LedgerProduct, MonthlyFixedCosts, MonthlyIndirectCostPlan, ProductAllocationInput, loadLedger, makeBomVersionSnapshot, makeId, Material, normalizeLedger, persistLedger, recalculateProduct, renameLedgerCategory, resolveIndustryTemplate, SaleRefund, SalesRecord, summarizeLedger } from "@/lib/ledgerStore";
import { validateCategoryName, validateMaterialDraft, validateProductName, validateSaleDraft } from "@/lib/validation";
import { startLogin } from "@/const";
import { useAuth } from "@/hooks/useAuth";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
  directCost: 0,
  fixedCost: 0,
  hiddenCost: 0,
  fundingCost: 0,
  feeRate: 0,
};

const navItems = [
  { id: "home" as Tab, label: "首页", icon: HomeIcon },
  { id: "products" as Tab, label: "商品", icon: LayoutGrid },
  { id: "business" as Tab, label: "经营", icon: BarChart3 },
  { id: "profile" as Tab, label: "我的", icon: Menu },
];

const getCostAnalysisRouteProductId = () => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") !== "cost-analysis") return null;
  const productId = Number(params.get("productId"));
  return Number.isFinite(productId) && productId > 0 ? productId : null;
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [costAnalysisProductId, setCostAnalysisProductId] = useState<number | null>(getCostAnalysisRouteProductId);
  const [showPricing, setShowPricing] = useState(false);
  const [ledger, setLedger] = useState(() => normalizeLedger(loadLedger()));
  const [activeProductId, setActiveProductId] = useState(() => getCostAnalysisRouteProductId() ?? 1);
  const [showMaterialPanel, setShowMaterialPanel] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [showQuickRecord, setShowQuickRecord] = useState(false);
  const [showSaleRecord, setShowSaleRecord] = useState(false);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [inventoryProductId, setInventoryProductId] = useState<number | null>(null);
  const [showBomEditor, setShowBomEditor] = useState(false);
  const [showQuickCost, setShowQuickCost] = useState(false);
  const [showProductNameSheet, setShowProductNameSheet] = useState(false);
  const [pendingProductDeletion, setPendingProductDeletion] = useState<LedgerProduct | null>(null);
  const [costEditor, setCostEditor] = useState<"hidden" | "funding" | null>(null);
  const [showMonthlyAllocation, setShowMonthlyAllocation] = useState(false);
  const [showCostReport, setShowCostReport] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [showDataManagement, setShowDataManagement] = useState(false);
  const [showCashRecords, setShowCashRecords] = useState(false);
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
  const currentTemplate = resolveIndustryTemplate(ledger.profile.industry, ledger.profile.industryTemplateOverrides);
  const [currentCosts, setCurrentCosts] = useState<CostInputs>(() => ({ ...initialCostInputs, ...(ledger.costs ?? {}) }));
  const [selectedPeriod, setSelectedPeriod] = useState(() => getBusinessPeriod());
  const [toast, setToast] = useState<string | null>(null);
  const summary = summarizeLedger(ledger, selectedPeriod);
  const operatingReminders = useMemo(() => getOperatingReminders(ledger, { inventoryEnabled: currentTemplate.capabilities.inventory }), [ledger, currentTemplate.capabilities.inventory]);
  const activeProducts = ledger.products.filter((product) => !product.archivedAt);
  const selectedProduct = activeProducts.find((product) => product.id === activeProductId) ?? activeProducts[0] ?? { id: 0, name: "还没有商品", category: "待添加", price: 0, direct: 0, operating: 0, change: "先创建商品", packaging: 0, directLabor: 0, bom: [] };
  const refundingSale = refundSaleId ? ledger.sales.find((sale) => sale.id === refundSaleId) ?? null : null;
  const refundingProduct = refundingSale ? ledger.products.find((product) => product.id === refundingSale.productId) : undefined;
  const inventoryProduct = inventoryProductId ? ledger.products.find((product) => product.id === inventoryProductId) : undefined;
  const readiness = getReadiness(ledger, summary, currentTemplate.productCostLabel);
  const operatingCost = selectedProduct.operating;
  const fullCost = operatingCost + currentCosts.fundingCost;
  const pricingPlan = getMonthlyIndirectPlan(ledger, selectedPeriod);
  const pricingAllocation = pricingPlan ? calculateProductIndirectAllocations(pricingPlan)[selectedProduct.id] : undefined;
  const pricingTiming = pricingPlan ? getMonthlyIndirectPlanTiming(pricingPlan) : undefined;
  const pricingTotalSalesAmount = pricingPlan?.products.reduce((sum, item) => sum + Math.max(Number(item.salesAmount) || 0, 0), 0) ?? 0;
  const pricingAllocationContext = pricingPlan && pricingAllocation ? {
    periodLabel: formatBusinessPeriod(pricingPlan.period),
    method: pricingPlan.method,
    monthlyIndirectTotal: calculateMonthlyIndirectPlanTotal(pricingPlan),
    productIndirectTotal: pricingAllocation.totalIndirectCost,
    unitIndirectCost: pricingAllocation.unitIndirectCost,
    allocationShare: pricingAllocation.allocationShare,
    outputQuantity: pricingAllocation.outputQuantity,
    productSalesAmount: pricingAllocation.salesAmount,
    totalSalesAmount: pricingTotalSalesAmount,
    effectiveFrom: pricingTiming!.effectiveFrom,
    effectiveTo: pricingTiming!.effectiveTo,
    effectiveDays: pricingTiming!.effectiveDays,
    daysInPeriod: pricingTiming!.daysInPeriod,
    timeFactor: pricingTiming!.timeFactor,
  } : undefined;
  const pricingDirectCost = calculateDirectCost(selectedProduct, ledger.materials);
  const pricingIndirectCost = pricingAllocation?.unitIndirectCost ?? Math.max(selectedProduct.operating - pricingDirectCost, 0);
  const pricingCosts = { ...currentCosts, directCost: pricingDirectCost, fixedCost: pricingIndirectCost, hiddenCost: pricingPlan ? 0 : currentCosts.hiddenCost };
  const methodLabel: Record<AllocationMethod, string> = { output: "按产量", hours: "按工时", revenue: "按销售额" };
  const directPricingLines: PricingCostLine[] = calculateUnitDirectCostDetails(selectedProduct, ledger.materials).map((item) => ({ label: item.label, amount: item.unitAmount, source: item.source, layer: "direct" }));
  const indirectPricingLines: PricingCostLine[] = pricingPlan
    ? calculateUnitIndirectCostDetails(pricingPlan, selectedProduct.id).map((item) => ({ label: item.label, amount: item.unitAmount, source: `${formatBusinessPeriod(pricingPlan.period)} · ${methodLabel[pricingPlan.method]}分摊`, layer: "operating" }))
    : [
      ...(currentCosts.fixedCost > 0 ? [{ label: "固定成本分摊", amount: currentCosts.fixedCost, source: "商品成本设置", layer: "operating" as const }] : []),
      ...((ledger.costs.hiddenCostItems?.length && ledger.costs.hiddenCostAllocationUnits && ledger.costs.hiddenCostAllocationUnits > 0)
        ? ledger.costs.hiddenCostItems.filter((item) => item.amount > 0).map((item) => ({ label: item.label, amount: item.amount / ledger.costs.hiddenCostAllocationUnits!, source: `按 ${ledger.costs.hiddenCostAllocationUnits} 件分摊`, layer: "operating" as const }))
        : (currentCosts.hiddenCost > 0 ? [{ label: "隐形成本分摊", amount: currentCosts.hiddenCost, source: "隐形成本设置", layer: "operating" as const }] : [])),
    ];
  if (pricingPlan && pricingAllocation && !indirectPricingLines.length && pricingAllocation.unitIndirectCost > 0) indirectPricingLines.push({ label: "月度间接成本分摊", amount: pricingAllocation.unitIndirectCost, source: `${formatBusinessPeriod(pricingPlan.period)} · ${methodLabel[pricingPlan.method]}分摊`, layer: "operating" });
  const pricingCostLines: PricingCostLine[] = [...directPricingLines, ...indirectPricingLines, ...(currentCosts.fundingCost > 0 ? [{ label: "利息及融资费用", amount: currentCosts.fundingCost, source: "资金成本设置", layer: "funding" as const }] : [])];

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

  const clearLocalLedger = () => {
    const next = normalizeLedger(createEmptyLedger());
    clearLocalLedgerStorage();
    setLedger(next);
    setCurrentCosts({ ...initialCostInputs, ...next.costs });
    setActiveProductId(0);
    setSelectedPeriod(getBusinessPeriod());
    setShowDataManagement(false);
    setActiveTab("home");
    notify("当前设备账本已全部清空，请重新选择行业并建账");
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
    const label = resolveIndustryTemplate(pendingIndustry).label;
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
    if (costAnalysisProductId !== null) {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      url.searchParams.delete("productId");
      window.history.pushState({}, "", url);
    }
    setCostAnalysisProductId(null);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openCostAnalysis = (productId: number) => {
    setActiveProductId(productId);
    setCostAnalysisProductId(productId);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "cost-analysis");
    url.searchParams.set("productId", String(productId));
    window.history.pushState({ view: "cost-analysis", productId }, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const closeCostAnalysis = () => {
    setCostAnalysisProductId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.searchParams.delete("productId");
    window.history.pushState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openQuickEntry = () => setShowQuickEntry(true);
  const chooseQuickEntry = (kind: "sale" | "record" | "purchase" | "product") => {
    setShowQuickEntry(false);
    if (kind === "sale") {
      if (!activeProducts.length) {
        setShowProductNameSheet(true);
        notify("先新建一个商品，才能记录商品销售");
      } else setShowSaleRecord(true);
      return;
    }
    if (kind === "record") { setShowQuickRecord(true); return; }
    if (kind === "purchase") { setEditingMaterialId(null); setShowMaterialPanel(true); return; }
    setShowProductNameSheet(true);
  };

  const handleMessageAction = (path?: string | null) => {
    setShowMessages(false);
    if (path?.includes("action=sale")) {
      setShowSaleRecord(true);
      return;
    }
    const tab = path?.match(/[?&]tab=(home|products|business|profile)/)?.[1] as Tab | undefined;
    navigate(tab ?? "home");
  };

  const completeOnboarding = ({ storeName, industry }: { storeName: string; industry: IndustryKey }) => {
    const template = resolveIndustryTemplate(industry);
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
    <div className="app-shell ui-contract">
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

        {costAnalysisProductId !== null ? <CostAnalysisView product={activeProducts.find((item) => item.id === costAnalysisProductId) ?? selectedProduct} products={activeProducts} costLines={pricingCostLines} fullCost={fullCost} directCost={pricingDirectCost} period={selectedPeriod} sales={ledger.sales} plannedQuantity={pricingAllocation?.outputQuantity ?? 0} onBack={closeCostAnalysis} onSelectProduct={openCostAnalysis} onAddCost={() => { closeCostAnalysis(); setShowQuickCost(true); }} onPricing={() => { closeCostAnalysis(); setShowPricing(true); }} onAdjustAllocation={() => { closeCostAnalysis(); setShowMonthlyAllocation(true); }} /> : <>
        {activeTab === "home" && (
          <HomeView
            ledger={ledger}
            product={selectedProduct}
            products={activeProducts}
            materials={ledger.materials}
            sales={ledger.sales}
            summary={summary}
            period={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            operatingCost={operatingCost}
            fullCost={fullCost}
            onPricing={() => setShowPricing(true)}
            onAddMaterial={() => { setEditingMaterialId(null); setShowMaterialPanel(true); }}
            onEditMaterial={(material) => { setEditingMaterialId(material.id); setShowMaterialPanel(true); }}
            onRecord={() => setShowQuickRecord(true)}
            onSale={() => setShowSaleRecord(true)}
            onBusiness={() => navigate("business")}
            onProducts={() => navigate("products")}
            readiness={readiness}
            onSaveRevenueGoal={(monthlyBudget) => setLedger((current) => {
              const next = { ...current, profile: { ...current.profile, monthlyBudget } };
              persistLedger(next);
              return next;
            })}
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
            fundingCost={currentCosts.fundingCost}
            sales={ledger.sales}
            period={selectedPeriod}
            onSelect={(id) => setActiveProductId(id)}
            onPricing={() => setShowPricing(true)}
            productCostAction={currentTemplate.productCostAction}
            productCostLabel={currentTemplate.productCostLabel}
            onQuickCost={() => setShowQuickCost(true)}
            onBom={() => setShowBomEditor(true)}
            onAdd={() => setShowProductNameSheet(true)}
            onDelete={(product) => setPendingProductDeletion(product)}
            onInventory={(product) => setInventoryProductId(product.id)}
            onCostAnalysis={(product) => openCostAnalysis(product.id)}
          />
        )}
        {activeTab === "business" && <BusinessView summary={summary} productCount={activeProducts.length} period={selectedPeriod} onPeriodChange={setSelectedPeriod} onPricing={() => setShowPricing(true)} onRecord={() => setShowQuickRecord(true)} onSale={() => setShowSaleRecord(true)} onCashRecords={() => setShowCashRecords(true)} sales={ledger.sales} products={ledger.products} onRefund={(saleId) => setRefundSaleId(saleId)} onDeleteSale={(saleId) => setDeletingSaleId(saleId)} />}
        {activeTab === "profile" && <ProfileView storeName={ledger.profile.storeName} industry={ledger.profile.industry} template={currentTemplate} categories={ledger.categories} categoryStatus={ledger.categoryStatus} productCount={activeProducts.length} user={user} authLoading={authLoading} backupAt={cloudLedger.data?.backedUpAt} cloudAvailable={Boolean(cloudLedger.data)} onLogin={startLogin} onLogout={async () => { await logout(); notify("已退出账号；本机账本仍保留在当前设备"); }} isLoggingOut={isLoggingOut} onDataManagement={() => setShowDataManagement(true)} onAdminMessages={() => setShowAdminMessages(true)} onIndustryChange={requestIndustryChange} onAddCategory={() => { setEditingCategory(""); }} onEditCategory={(category) => setEditingCategory(category)} onToggleCategory={(category) => { setLedger((current) => { const next = { ...current, categoryStatus: { ...current.categoryStatus, [category]: current.categoryStatus?.[category] === false } }; persistLedger(next); return next; }); notify(currentCategoryIsActive(ledger, category) ? `已停用“${category}”，新记账不会再出现` : `已启用“${category}”，可继续用于记账`); }} onHiddenCost={() => setShowMonthlyAllocation(true)} onDebt={() => setCostEditor("funding")} onMonthlyReport={() => setShowCostReport(true)} onProducts={() => navigate("products")} />}
        </>}
      </main>

      <nav className="mobile-tabbar" aria-label="主导航">
        {navItems.slice(0, 2).map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeTab === id ? "tab-item active" : "tab-item"} onClick={() => navigate(id)}>
            <Icon size={21} strokeWidth={activeTab === id ? 2.7 : 2} />
            <span>{label}</span>
          </button>
        ))}
        <button className="tab-item entry-tab" type="button" onClick={openQuickEntry} aria-label="记一笔">
          <span className="entry-tab-icon"><Plus size={22} /></span>
          <span>记一笔</span>
        </button>
        {navItems.slice(2).map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeTab === id ? "tab-item active" : "tab-item"} onClick={() => navigate(id)}>
            <Icon size={21} strokeWidth={activeTab === id ? 2.7 : 2} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {showQuickEntry && <QuickEntrySheet hasProducts={activeProducts.length > 0} onClose={() => setShowQuickEntry(false)} onChoose={chooseQuickEntry} />}
      {showPricing && <PricingPanel costs={pricingCosts} productName={selectedProduct.name} costLines={pricingCostLines} allocationContext={pricingAllocationContext} onClose={() => setShowPricing(false)} onSave={saveSuggestedPrice} onAdjustAllocation={() => { setShowPricing(false); setShowMonthlyAllocation(true); }} />}
      {showProductNameSheet && <ProductNameSheet onClose={() => setShowProductNameSheet(false)} onSave={(name) => {
        const nextId = Math.max(0, ...ledger.products.map((item) => item.id)) + 1;
        const nextProduct: LedgerProduct = { id: nextId, name, category: getProductPendingLabel(currentTemplate.productCostLabel), price: 0, direct: 0, operating: 0, change: `先补充${currentTemplate.productCostLabel}`, packaging: 0, directLabor: 0, bom: [] };
        setLedger((current) => { const next = { ...current, products: [...current.products, nextProduct] }; persistLedger(next); return next; });
        setActiveProductId(nextId);
        setShowProductNameSheet(false);
        notify(`已新建“${name}”，请继续补充成本和售价`);
      }} />}
      {editingCategory !== null && <CategorySheet initialName={editingCategory} existing={ledger.categories} onClose={() => setEditingCategory(null)} onSave={(name) => { setLedger((current) => { const oldName = editingCategory; const next = oldName ? renameLedgerCategory(current, oldName, name) : { ...current, categories: [...current.categories, name], categoryStatus: { ...current.categoryStatus, [name]: true } }; persistLedger(next); return next; }); setEditingCategory(null); notify(editingCategory ? `已将成本项目改为“${name}”` : `已新增成本项目“${name}”`); }} />}
      {showMaterialPanel && <MaterialSheet suggestion={ledger.materials[0]} editingMaterial={editingMaterialId ? ledger.materials.find((material) => material.id === editingMaterialId) : undefined} onClose={() => { setShowMaterialPanel(false); setEditingMaterialId(null); }} onSave={(material, purchase) => { setLedger((current) => { const materials = editingMaterialId ? current.materials.map((item) => item.id === editingMaterialId ? material : item) : [...current.materials, material]; const products = current.products.map((product) => product.bom.some((item) => item.materialId === material.id) ? recalculateProduct({ ...product, materialUnitCosts: undefined }, materials, current.costs.hiddenCost, current.costs.fixedCost) : product); const shouldRecordPurchase = !editingMaterialId && purchase?.recordPurchase && Number.isFinite(purchase.amount) && purchase.amount > 0; const records = shouldRecordPurchase ? [{ id: makeId(), type: "expense" as const, amount: purchase.amount, category: current.categories[0] ?? "材料采购", note: `${material.name}采购`, date: purchase.date, source: "purchase" as const }, ...current.records] : current.records; const next = { ...current, materials, products, records }; persistLedger(next); return next; }); const recordedPurchase = !editingMaterialId && purchase?.recordPurchase; setShowMaterialPanel(false); setEditingMaterialId(null); notify(editingMaterialId ? "已更新原材料，相关商品成本已重新核算；历史销售不受影响" : recordedPurchase ? "已保存原材料，并记入一笔采购现金支出" : "已保存原材料，后续核算会使用新成本"); }} />}
      {showQuickRecord && <QuickRecordSheet categories={getActiveCategories(ledger)} onClose={() => setShowQuickRecord(false)} onRecordSale={() => { setShowQuickRecord(false); setShowSaleRecord(true); }} onSave={(record) => { setLedger((current) => { const next = { ...current, records: [{ id: makeId(), ...record, source: "manual" as const }, ...current.records] }; persistLedger(next); return next; }); setShowQuickRecord(false); notify(record.type === "income" ? "已记入其他收入，经营账已更新" : "已记入支出，成本账已更新"); }} />}
      {showSaleRecord && <SalesRecordSheet products={activeProducts} onClose={() => setShowSaleRecord(false)} onSave={(sale) => { setLedger((current) => { const product = current.products.find((entry) => entry.id === sale.productId); const amount = sale.quantity * sale.unitPrice; const salePeriod = getBusinessPeriod(sale.date); const hiddenSource = current.costs.hiddenCostSource ?? "manual"; const hiddenSnapshot = hiddenSource === "ledger" ? current.records.filter((record) => record.type === "expense" && record.date.startsWith(salePeriod) && record.category === (current.costs.hiddenCostCategory ?? "交通配送")).reduce((sum, record) => sum + Math.max(record.amount, 0), 0) : current.costs.hiddenCost; const allocationPlan = getMonthlyIndirectPlan(current, salePeriod, sale.date); const allocatedIndirectCost = allocationPlan ? calculateProductIndirectAllocations(allocationPlan)[sale.productId]?.unitIndirectCost : undefined; const enrichedSale: SalesRecord = { ...sale, costVersionId: product?.bomVersions?.at(-1)?.id ?? `current-${sale.date}`, unitDirectCostSnapshot: product ? calculateDirectCost(product, current.materials) : 0, fixedCostSnapshot: current.costs.fixedCost, hiddenCostSnapshot: hiddenSnapshot, hiddenCostSourceSnapshot: hiddenSource, hiddenCostBasisSnapshot: current.costs.hiddenCostBasis ?? "perUnit", fundingCostSnapshot: current.costs.fundingCost, fundingSourceSnapshot: current.costs.fundingSource ?? "manual", costPeriod: salePeriod, allocatedIndirectCostSnapshot: allocatedIndirectCost, allocationMethodSnapshot: allocationPlan?.method, allocationPlanPeriod: allocationPlan?.period, status: "completed", refunds: [] }; const products = current.products.map((entry) => entry.id === sale.productId && entry.stockQuantity !== undefined ? { ...entry, stockQuantity: Math.max(entry.stockQuantity - sale.quantity, 0) } : entry); const next = { ...current, products, sales: [enrichedSale, ...(current.sales ?? [])], records: [{ id: makeId(), type: "income" as const, amount, category: "销售收入", note: `${product?.name ?? "商品"}销售`, date: sale.date, source: "sale" as const, sourceId: sale.id }, ...current.records] }; persistLedger(next); return next; }); setShowSaleRecord(false); setSelectedPeriod(getBusinessPeriod(sale.date)); notify("已记录销售，商品成本已结转"); }} />}
      {refundingSale && <SaleRefundSheet sale={refundingSale} product={refundingProduct} onClose={() => setRefundSaleId(null)} onConfirm={(refund) => { setLedger((current) => { const original = current.sales.find((sale) => sale.id === refundingSale.id); const fullyVoided = original ? getRefundableSaleQuantity(original) - refund.quantity <= 0.0001 : false; const sales = current.sales.map((sale) => sale.id === refundingSale.id ? { ...sale, refunds: [...(sale.refunds ?? []), refund], status: fullyVoided ? "voided" : sale.status ?? "completed", ...(fullyVoided ? { voidedAt: new Date().toISOString(), voidedDate: refund.date } : {}) } : sale); const products = current.products.map((product) => product.id === refundingSale.productId && refund.restock && product.stockQuantity !== undefined ? { ...product, stockQuantity: product.stockQuantity + refund.quantity } : product); const next = { ...current, products, sales, records: [{ id: makeId(), type: "expense" as const, amount: refund.amount, category: "销售退款", note: `${refundingProduct?.name ?? "商品"}退款`, date: refund.date, source: "refund" as const, sourceId: refundingSale.id }, ...current.records] }; persistLedger(next); return next; }); setRefundSaleId(null); setSelectedPeriod(getBusinessPeriod(refund.date)); notify(refund.quantity >= refundingSale.quantity ? "已撤销销售并冲回收入、成本和库存" : "已记录部分退款，经营利润已重新计算"); }} />}
      {deletingSaleId && <DeleteSaleSheet sale={ledger.sales.find((sale) => sale.id === deletingSaleId)} product={ledger.products.find((product) => product.id === ledger.sales.find((sale) => sale.id === deletingSaleId)?.productId)} onClose={() => setDeletingSaleId(null)} onConfirm={() => { setLedger((current) => { const next = deleteSaleTransaction(current, deletingSaleId); persistLedger(next); return next; }); setDeletingSaleId(null); notify("已删除销售记录，并移除关联收款、退款和成本结转"); }} />}
      {inventoryProduct && <InventorySheet product={inventoryProduct} onClose={() => setInventoryProductId(null)} onSave={(quantity) => { setLedger((current) => { const products = current.products.map((product) => product.id === inventoryProduct.id ? { ...product, stockQuantity: quantity } : product); const next = { ...current, products }; persistLedger(next); return next; }); setInventoryProductId(null); notify(`已设置“${inventoryProduct.name}”可售库存为 ${quantity}`); }} />}
      {showMonthlyAllocation && <MonthlyAllocationSheet period={selectedPeriod} products={activeProducts} initialPlan={getMonthlyIndirectPlan(ledger, selectedPeriod)} onClose={() => setShowMonthlyAllocation(false)} onSave={(plan) => { setLedger((current) => { const monthlyIndirectPlans = [...(current.costs.monthlyIndirectPlans ?? []).filter((item) => item.period !== plan.period), plan]; const costs = { ...current.costs, monthlyIndirectPlans, allocationPeriod: plan.period }; const products = applyMonthlyIndirectPlan(current.products, plan, current.materials); const next = { ...current, costs, products }; persistLedger(next); return next; }); setShowMonthlyAllocation(false); notify(`已保存${formatBusinessPeriod(plan.period)}分摊；未来单件完整成本已更新`); }} onDelete={() => { setLedger((current) => { const costs = { ...current.costs, monthlyIndirectPlans: (current.costs.monthlyIndirectPlans ?? []).filter((item) => item.period !== selectedPeriod) }; const products = current.products.map((product) => recalculateProduct(product, current.materials, costs.hiddenCost, costs.fixedCost)); const next = { ...current, costs, products }; persistLedger(next); return next; }); setShowMonthlyAllocation(false); notify(`已删除${formatBusinessPeriod(selectedPeriod)}分摊；历史销售快照未改动`); }} />}
      {showCashRecords && <CashRecordsSheet period={selectedPeriod} records={ledger.records} onClose={() => setShowCashRecords(false)} onDelete={(recordId) => { setLedger((current) => { const next = { ...current, records: current.records.filter((record) => record.id !== recordId) }; persistLedger(next); return next; }); notify("已删除该笔流水，现金汇总已更新"); }} />}
      {showCostReport && <MonthlyCostReportSheet period={selectedPeriod} products={activeProducts} plan={getMonthlyIndirectPlan(ledger, selectedPeriod)} onClose={() => setShowCostReport(false)} />}
      {pendingProductDeletion && <DeleteProductSheet product={pendingProductDeletion} saleCount={ledger.sales.filter((sale) => sale.productId === pendingProductDeletion.id).length} onClose={() => setPendingProductDeletion(null)} onConfirm={() => { const product = pendingProductDeletion; const hasSales = ledger.sales.some((sale) => sale.productId === product.id); setLedger((current) => { const products = hasSales ? current.products.map((item) => item.id === product.id ? { ...item, archivedAt: new Date().toISOString() } : item) : current.products.filter((item) => item.id !== product.id); const next = { ...current, products }; persistLedger(next); return next; }); const remaining = activeProducts.filter((item) => item.id !== product.id); setActiveProductId(remaining[0]?.id ?? 0); setPendingProductDeletion(null); notify(hasSales ? `已归档“${product.name}”；历史销售和成本快照已保留` : `已删除“${product.name}”`); }} />}

      {showQuickCost && <QuickCostSheet product={selectedProduct} template={currentTemplate} onClose={() => setShowQuickCost(false)} onOpenAdvanced={() => { setShowQuickCost(false); setShowBomEditor(true); }} onSave={(draft: QuickCostSave) => { setLedger((current) => { const draftedProducts = current.products.map((item) => item.id === selectedProduct.id ? applyQuickCost(item, draft, current.materials, currentCosts.hiddenCost, currentCosts.fixedCost, new Date().toISOString().slice(0, 10)) : item); const plan = getMonthlyIndirectPlan(current, selectedPeriod); const products = plan ? applyMonthlyIndirectPlan(draftedProducts, plan, current.materials) : draftedProducts; const next = { ...current, products }; persistLedger(next); return next; }); setShowQuickCost(false); notify("已保存快速成本，并生成新的成本版本"); }} />}
      {showBomEditor && <BomEditorSheet product={selectedProduct} materials={ledger.materials} categories={getActiveCategories(ledger)} costLabel={currentTemplate.productCostLabel} costAction={currentTemplate.productCostAction} costEmpty={currentTemplate.productCostEmpty} onClose={() => setShowBomEditor(false)} onSave={(items, settings) => { setLedger((current) => { const draftedProducts = current.products.map((item) => { if (item.id !== selectedProduct.id) return item; const draftProduct = { ...item, bom: items, costCategory: settings.costCategory, lossRate: settings.lossRate, batchYield: settings.batchYield, materialUnitCosts: settings.costSnapshot?.materialUnitCosts, packaging: settings.costSnapshot?.packaging ?? item.packaging, directLabor: settings.costSnapshot?.directLabor ?? item.directLabor }; const recalculated = recalculateProduct(draftProduct, current.materials, currentCosts.hiddenCost, currentCosts.fixedCost); const nextVersion = makeBomVersionSnapshot(draftProduct, current.materials, settings, new Date().toISOString().slice(0, 10)); return { ...recalculated, category: items.length || recalculated.direct > 0 ? "已补齐成本" : getProductPendingLabel(currentTemplate.productCostLabel), bomVersions: [...(item.bomVersions ?? []), nextVersion] }; }); const plan = getMonthlyIndirectPlan(current, selectedPeriod); const products = plan ? applyMonthlyIndirectPlan(draftedProducts, plan, current.materials) : draftedProducts; const next = { ...current, products }; persistLedger(next); return next; }); setShowBomEditor(false); notify(`已保存${currentTemplate.productCostLabel}，并生成新的成本版本`); }} />}
      {costEditor && <CostSettingsSheet type={costEditor} value={costEditor === "hidden" ? currentCosts.hiddenCost : currentCosts.fundingCost} hiddenItems={ledger.costs.hiddenCostItems ?? []} hiddenAllocationUnits={ledger.costs.hiddenCostAllocationUnits ?? 0} onClose={() => setCostEditor(null)} onSave={(value, hiddenDetail) => { const nextCosts = { ...currentCosts, [costEditor === "hidden" ? "hiddenCost" : "fundingCost"]: value }; setCurrentCosts(nextCosts); setLedger((current) => { const costs = costEditor === "hidden" && hiddenDetail ? { ...nextCosts, hiddenCostItems: hiddenDetail.items, hiddenCostAllocationUnits: hiddenDetail.allocationUnits } : nextCosts; const next = { ...current, costs, products: costEditor === "hidden" ? current.products.map((product) => recalculateProduct(product, current.materials, nextCosts.hiddenCost, nextCosts.fixedCost)) : current.products }; persistLedger(next); return next; }); setCostEditor(null); notify(costEditor === "hidden" ? "已更新房租、水电、人工等隐形成本；历史销售不受影响" : "已更新资金成本，完整成本已重新计算"); }} />}
      {showDataManagement && <DataManagementSheet isAuthenticated={isAuthenticated} cloudAvailable={Boolean(cloudLedger.data)} backupAt={cloudLedger.data?.backedUpAt} isBackingUp={backupLedger.isPending} onClose={() => setShowDataManagement(false)} onLogin={startLogin} onBackup={backupCurrentLedger} onRestoreCloud={() => { if (!cloudLedger.data) return; restoreLedger(cloudLedger.data.ledgerJson, "云端"); setShowDataManagement(false); }} onExport={exportLedger} onImport={(content) => { restoreLedger(content, "导入文件"); setShowDataManagement(false); }} onClearLocal={clearLocalLedger} />}
      {showMessages && <MessageInboxSheet isAuthenticated={isAuthenticated} loading={inbox.isLoading} messages={inbox.data ?? []} unreadCount={messageUnread.data?.count ?? 0} operatingReminders={operatingReminders} levelFilter={messageLevelFilter} onLevelFilterChange={setMessageLevelFilter} initialMessage={initialMessageDetail} onClose={() => { setShowMessages(false); setInitialMessageDetail(null); }} onLogin={startLogin} onMarkRead={(id) => markMessageRead.mutate({ userMessageId: id })} onMarkAll={() => markAllMessagesRead.mutate()} onAction={handleMessageAction} />}
      {showAdminMessages && user?.role === "admin" && <AdminMessageSheet onClose={() => setShowAdminMessages(false)} onNotice={notify} />}
      {pendingIndustry && <IndustryChangeSheet current={ledger.profile.industry} next={pendingIndustry} onClose={() => setPendingIndustry(null)} onConfirm={confirmIndustryChange} />}
      {toast && <div className="app-toast"><CheckBadge />{toast}</div>}
    </div>
  );
}

type DashboardAction = "products" | "business" | "record";
type DashboardIssue = { id: string; title: string; detail: string; impact: string; tone: "warning" | "loss" | "cash"; action: DashboardAction };

export function getDashboardIssues({ missingCostProductCount, unpricedProductCount, cashBalance, contributions, inventory }: { missingCostProductCount: number; unpricedProductCount: number; cashBalance: number; contributions: ReturnType<typeof getProductContributionData>; inventory?: ReturnType<typeof getInventoryHealth> }) {
  const items: DashboardIssue[] = [];
  const lossProduct = contributions.find((item) => item.contribution < -0.005);
  const lowContributionProduct = contributions.find((item) => item.revenue > 0 && item.contribution >= 0 && item.contribution / item.revenue < 0.1);
  if (lossProduct) items.push({ id: `loss-${lossProduct.productId}`, title: `${lossProduct.name} 已出现直接亏损`, detail: `销售收入 ${formatCurrency(lossProduct.revenue)}，已结转直接成本 ${formatCurrency(lossProduct.directCost)}。`, impact: `当前直接贡献 ${formatCurrency(lossProduct.contribution)}，建议检查售价或成本。`, tone: "loss", action: "products" });
  if (lowContributionProduct) items.push({ id: `margin-${lowContributionProduct.productId}`, title: `${lowContributionProduct.name} 直接贡献偏低`, detail: `已结转直接贡献率 ${(lowContributionProduct.contribution / lowContributionProduct.revenue * 100).toFixed(1)}%。`, impact: "房租、人工等分摊尚未计入该比例，完整利润可能更低。", tone: "warning", action: "products" });
  if (missingCostProductCount > 0) items.push({ id: "missing-cost", title: `${missingCostProductCount} 个商品待补成本`, detail: "未补成本的商品无法得出可信利润。", impact: "先补齐直接成本，再判断售价是否合理。", tone: "warning", action: "products" });
  if (unpricedProductCount > 0) items.push({ id: "unpriced", title: `${unpricedProductCount} 个商品未定价`, detail: "未定价商品不能进入销售结转。", impact: "设置售价后才可生成收入和利润。", tone: "warning", action: "products" });
  if (cashBalance < 0) items.push({ id: "cash-negative", title: "现金结余为负", detail: "本期实际付款超过实际收款。", impact: "请先核对现金流水，再决定是否补充资金。", tone: "cash", action: "business" });
  const lowStock = inventory?.items.find((item) => item.status === "insufficient");
  const slowStock = inventory?.items.find((item) => item.status === "slow" || item.status === "high");
  if (lowStock) items.push({ id: `stock-low-${lowStock.productId}`, title: `${lowStock.name} 库存不足`, detail: lowStock.detail, impact: "请结合实际补货周期处理；系统不自动生成采购。", tone: "warning", action: "products" });
  if (slowStock) items.push({ id: `stock-slow-${slowStock.productId}`, title: `${slowStock.name} 库存${slowStock.label}`, detail: slowStock.detail, impact: `当前成本占用 ${formatCurrency(slowStock.inventoryValue)}，可检查售价、促销或进货节奏。`, tone: "warning", action: "products" });
  return items.slice(0, 3);
}

export function getDashboardInsights({ issues, summary, readiness }: { issues: DashboardIssue[]; summary: ReturnType<typeof summarizeLedger>; readiness: Readiness }) {
  if (issues.length) return issues.map((issue) => ({ id: issue.id, title: issue.title, text: `${issue.detail} ${issue.impact}`, action: issue.action })).slice(0, 3);
  if (!summary.profitReady) return [{ id: "ready", title: readiness.title, text: readiness.description, action: "record" as const }];
  return [{ id: "stable", title: "本期经营数据已结转", text: `已按 ${summary.salesCount} 笔销售计算经营结果；继续记录销售和退款，趋势会更可靠。`, action: "business" as const }];
}

/** 保留给既有首页与组件测试的轻量提醒契约；驾驶舱会使用更完整的 getDashboardIssues。 */
export function getHomeAttentionItems({ missingCostProductCount, unpricedProductCount, cashBalance }: { missingCostProductCount: number; unpricedProductCount: number; cashBalance: number }) {
  return getDashboardIssues({ missingCostProductCount, unpricedProductCount, cashBalance, contributions: [] }).map(({ title, detail, tone, action }) => ({ title, detail, tone, action: action === "record" ? "business" : action })).slice(0, 2);
}

export function HomeView({
  ledger,
  product,
  products,
  materials,
  sales,
  summary,
  period,
  onPeriodChange,
  operatingCost,
  fullCost,
  onPricing,
  onAddMaterial,
  onEditMaterial,
  onRecord,
  onSale,
  onBusiness,
  onProducts,
  readiness,
  onSaveRevenueGoal,
  onPrimaryAction,
}: {
  ledger: LedgerData;
  product: LedgerProduct;
  products: LedgerProduct[];
  materials: Material[];
  sales: SalesRecord[];
  summary: ReturnType<typeof summarizeLedger>;
  period: string;
  onPeriodChange: (period: string) => void;
  operatingCost: number;
  fullCost: number;
  onPricing: () => void;
  onAddMaterial: () => void;
  onEditMaterial: (material: Material) => void;
  onRecord: () => void;
  onSale: () => void;
  onBusiness: () => void;
  onProducts: () => void;
  readiness: Readiness;
  onSaveRevenueGoal: (monthlyBudget: number) => void;
  onPrimaryAction: () => void;
}) {
  const [contributionRange, setContributionRange] = useState<CashTrendRange>("month");
  const hasSalesResult = summary.profitReady;
  const operatingResult = summary.operatingResult;
  const operatingExpenses = summary.allocatedIndirectCosts + summary.financingCosts;
  const operatingMargin = hasSalesResult && summary.salesRevenue > 0 ? operatingResult / summary.salesRevenue * 100 : null;
  const missingCostProductCount = products.filter((item) => item.direct <= 0 && item.bom.length === 0).length;
  const unpricedProductCount = products.filter((item) => item.price <= 0).length;
  const monthlyContributions = useMemo(() => getProductContributionData(products, sales, period), [products, sales, period]);
  const contributions = useMemo(() => getProductContributionData(products, sales, period, contributionRange), [products, sales, period, contributionRange]);
  const currentTemplate = useMemo(() => resolveIndustryTemplate(ledger.profile.industry, ledger.profile.industryTemplateOverrides), [ledger.profile.industry, ledger.profile.industryTemplateOverrides]);
  const inventory = useMemo(() => getInventoryHealth(ledger), [ledger]);
  const dashboardIssues = getDashboardIssues({ missingCostProductCount, unpricedProductCount, cashBalance: summary.cashBalance, contributions: monthlyContributions, inventory: currentTemplate.capabilities.inventory ? inventory : undefined });
  const dashboardInsights = getDashboardInsights({ issues: dashboardIssues, summary, readiness });
  const topContributions = contributions.slice(0, 5);
  const maxContributionRevenue = Math.max(...topContributions.map((item) => Math.abs(item.revenue)), 1);
  const grossMargin = summary.salesRevenue > 0 ? summary.grossProfit / summary.salesRevenue * 100 : null;
  const profitRingProgress = operatingMargin === null ? 0 : Math.min(Math.max(operatingMargin, 0), 100);
  const primaryInsight = dashboardInsights[0];
  const performDashboardAction = (action: DashboardAction) => {
    if (action === "products") onProducts();
    else if (action === "business") onBusiness();
    else onPrimaryAction();
  };
  const primaryIcon = readiness.stage === "record" ? <ReceiptText size={19} /> : readiness.stage === "product" ? <Plus size={19} /> : readiness.stage === "cost" ? <PackagePlus size={19} /> : readiness.stage === "pricing" ? <Sparkles size={19} /> : readiness.stage === "sale" ? <ShoppingBag size={19} /> : <BarChart3 size={19} />;
  return (
    <div className="page-content home-content">
      <section className="period-row dashboard-page-heading">
        <div><h1>首页</h1><small>让生意账目更清晰，经营更轻松</small></div>
        <PeriodPicker period={period} onChange={onPeriodChange} />
      </section>

      <section className={`dashboard-formula-card ${hasSalesResult ? operatingResult < 0 ? "loss" : "ready" : "pending"}`} aria-label="本月经营结果">
        <div className="dashboard-formula-heading"><span>今天经营得怎么样？</span><span className={hasSalesResult ? "result-status" : "result-status pending"}>{hasSalesResult ? "已结转" : "待结转"}</span></div>
        <div className="dashboard-formula-layout">
          <div className="dashboard-formula-inputs" aria-label="销售收入减商品成本减经营费用">
            <span className="formula-metric revenue"><small>销售收入</small><i><TrendingUp size={18} /></i><b>{formatCurrency(summary.salesRevenue)}</b></span>
            <em>−</em>
            <span className="formula-metric cost"><small>商品成本</small><i><ShoppingBag size={18} /></i><b>{formatCurrency(summary.costOfSales)}</b></span>
            <em>−</em>
            <span className="formula-metric expense"><small>经营费用</small><i><WalletCards size={18} /></i><b>{formatCurrency(operatingExpenses)}</b></span>
          </div>
          <em className="formula-equals">=</em>
          <div className="dashboard-profit-result">
            <small>本期经营利润</small>
            <strong>{hasSalesResult ? formatCurrency(operatingResult) : "—"}</strong>
            <span>利润率 {operatingMargin === null ? "待结转" : `${operatingMargin.toFixed(1)}%`}</span>
            <div className="dashboard-profit-ring" role="img" aria-label={operatingMargin === null ? "经营利润率待结转" : `经营利润率 ${operatingMargin.toFixed(1)}%`} style={{ background: `conic-gradient(#ffffff 0 ${profitRingProgress}%, rgb(255 255 255 / .24) ${profitRingProgress}% 100%)` }}>
              <div><b>{operatingMargin === null ? "—" : `${operatingMargin.toFixed(1)}%`}</b><small>利润率</small></div>
            </div>
          </div>
        </div>
        <div className="dashboard-formula-caption"><span>收入</span><i>−</i><span>成本</span><i>−</i><span>费用</span><i>=</i><b>利润</b></div>
        <p>{hasSalesResult ? `已按 ${summary.salesCount} 笔销售快照结转；现金结余不等于利润。` : "记录商品销售后，系统才会按当时成本快照计算利润。"}</p>
      </section>

      <section className="home-overview-card" aria-label="本期经营概览">
        <div className="home-section-heading"><h2>本期概览</h2><button onClick={onBusiness}>查看更多 <ChevronRight size={15} /></button></div>
        <div className="home-overview-grid">
          <span><i className="blue"><TrendingUp size={18} /></i><small>销售收入</small><b>{formatCurrency(summary.salesRevenue)}</b><em>已结转销售</em></span>
          <span><i className="green"><ShoppingBag size={18} /></i><small>商品成本</small><b>{formatCurrency(summary.costOfSales)}</b><em>销售快照成本</em></span>
          <span><i className="orange"><WalletCards size={18} /></i><small>经营费用</small><b>{formatCurrency(operatingExpenses)}</b><em>分摊与资金成本</em></span>
          <span className={hasSalesResult && operatingResult < 0 ? "loss" : ""}><i className="blue"><CircleDollarSign size={18} /></i><small>经营利润</small><b>{hasSalesResult ? formatCurrency(operatingResult) : "待结转"}</b><em>{hasSalesResult ? "已结转销售" : "记录销售后生成"}</em></span>
        </div>
      </section>

      <section className="dashboard-products-card home-products-card" aria-label="商品表现"><div className="home-section-heading"><h2>商品表现 <span>TOP {Math.min(topContributions.length || 3, 3)}</span></h2><button onClick={onProducts}>查看更多 <ChevronRight size={15} /></button></div><ContributionRangeSwitch range={contributionRange} onChange={setContributionRange} />{topContributions.length ? <><div className="dashboard-product-head"><span>商品</span><span>销售额</span><span>直接贡献</span><span>贡献率</span></div><div className="dashboard-product-list">{topContributions.slice(0, 3).map((item, index) => { const rate = item.revenue ? item.contribution / item.revenue * 100 : 0; const risk = item.contribution < 0 || rate < 10; return <button key={item.productId} className={risk ? "risk" : ""} onClick={onProducts}><em>{index + 1}</em><span><b>{item.name}</b><i><strong style={{ width: `${Math.max(Math.abs(item.revenue) / maxContributionRevenue * 100, 5)}%` }} /></i></span><strong>{formatCurrency(item.revenue)}</strong><small className={risk ? "risk" : ""}>{formatCurrency(item.contribution)}</small><small className={risk ? "risk" : ""}>{risk ? "需关注" : `${rate.toFixed(1)}%`}</small></button>; })}</div><p className="dashboard-data-note">按业务日期汇总销售快照与退款；直接贡献不含房租、人工等分摊。</p></> : <div className="dashboard-empty"><ShoppingBag size={18} /><b>{getContributionRangeLabel(contributionRange)}没有已结转的商品销售</b><small>记录销售后，可按商品查看销售额与直接贡献。</small><button onClick={onSale}>记录销售 <ArrowRight size={14} /></button></div>}</section>

      {currentTemplate.capabilities.inventory && <section className="dashboard-inventory-card" aria-label="库存健康"><div className="section-heading compact"><div><span className="eyebrow">库存经营</span><h2>库存健康</h2></div><button onClick={onProducts}>库存设置 <ChevronRight size={14} /></button></div>{inventory.trackedProductCount ? <><div className="inventory-summary"><span><small>资金占用</small><b>{formatCurrency(inventory.totalInventoryValue)}</b></span><span><small>已启用库存</small><b>{inventory.trackedProductCount} 个</b></span><span className={inventory.insufficientCount ? "warning" : ""}><small>需补货</small><b>{inventory.insufficientCount} 个</b></span></div><div className="inventory-health-list">{inventory.items.slice(0, 3).map((item) => <button key={item.productId} className={item.status} onClick={onProducts}><span><b>{item.name}</b><small>{item.detail}</small></span><strong>{formatCurrency(item.inventoryValue)}</strong><em>{item.label}</em></button>)}</div><p className="dashboard-data-note">资金占用按当前完整成本估算；可售天数只参考近30日净销量，不是补货预测。</p>{inventory.untrackedProductCount > 0 && <p className="inventory-untracked-note">还有 {inventory.untrackedProductCount} 个商品未启用库存，不参与本卡分析。</p>}</> : <div className="dashboard-empty"><ShoppingBag size={18} /><b>还没有启用库存的商品</b><small>在商品“更多操作”中设置可售库存后，系统才会计算资金占用和可售天数。</small><button onClick={onProducts}>去设置库存 <ArrowRight size={14} /></button></div>}</section>}

      <section className="dashboard-issues-card" aria-label="经营异常"><div className="section-heading compact"><div><span className="eyebrow">经营异常{dashboardIssues.length ? ` ${dashboardIssues.length}` : ""}</span><h2>{dashboardIssues.length ? "需要处理的事项" : "当前没有经营异常"}</h2></div>{dashboardIssues.length ? <AlertTriangle size={18} /> : <BrandSignature tone="blue" compact />}</div>{dashboardIssues.length ? <div className="dashboard-issue-list">{dashboardIssues.map((issue) => <button className={issue.tone} key={issue.id} onClick={() => performDashboardAction(issue.action)}><AlertTriangle size={17} /><span><b>{issue.title}</b><small>{issue.detail}</small><em>{issue.impact}</em></span><ChevronRight size={16} /></button>)}</div> : <div className="dashboard-no-issues"><span>╰</span><div><b>当前经营正常</b><small>继续记录销售、退款和成本，系统会自动提示需要关注的变化。</small></div></div>}</section>

      <section className="dashboard-quick-actions home-quick-actions" aria-label="快捷记账"><div className="home-section-heading"><h2>快捷记账</h2></div><div><button className="sale" onClick={onSale}><span className="quick-action-icon blue"><Plus size={21} /></span><span><b>记销售</b><small>记录一笔商品销售</small></span><ChevronRight size={18} /></button><button className="expense" onClick={onRecord}><span className="quick-action-icon mint"><Plus size={21} /></span><span><b>记收支</b><small>记录一笔收入或支出</small></span><ChevronRight size={18} /></button></div></section>

      <section className="dashboard-focus-card home-focus-card" aria-label="下一步行动"><div><span className="eyebrow">今天值得关注</span><b>{primaryInsight?.title ?? readiness.title}</b><small>{primaryInsight?.text ?? readiness.description}</small></div><button onClick={() => performDashboardAction(primaryInsight?.action ?? "record")}>{primaryInsight?.action === "business" ? <BarChart3 size={18} /> : primaryIcon}{primaryInsight?.action === "business" ? "查看经营" : readiness.actionLabel}</button></section>

      <BrandInsightCarousel onPricing={onPricing} onBusiness={onBusiness} />
    </div>
  );
}

type BrandInsightSlide = {
  id: "brand" | "cost" | "pricing" | "profit" | "warning";
  tag: string;
  title: string;
  description: string;
  footer: string;
  cta?: string;
  action?: "pricing" | "business";
};

const brandInsightSlides: BrandInsightSlide[] = [
  { id: "brand", tag: "BRAND", title: "算得清，生意才算得明白", description: "从成本核算，到定价、利润与经营分析，让每一笔生意都有数可算", footer: "数据 + 分析 = 经营决策" },
  { id: "cost", tag: "COST", title: "别只算进货价，要算真实成本", description: "进货、包材、人工、平台与损耗，缺一项都可能高估利润", footer: "算得清，才能知道到底赚不赚钱" },
  { id: "pricing", tag: "PRICING", title: "卖多少钱，才是真的赚钱？", description: "不凭感觉定价，用数据定价格", footer: "成本 × 利润目标 = 建议售价", cta: "去算一个价格", action: "pricing" },
  { id: "profit", tag: "PROFIT", title: "营业额高，不代表真的赚钱", description: "看清利润，才能看清生意", footer: "收入 − 成本 − 费用 = 净利润", cta: "查看经营分析", action: "business" },
  { id: "warning", tag: "BUSINESS", title: "提前发现问题，比事后算亏损更重要", description: "成本、毛利与损耗的变化，会先在经营数据里出现", footer: "查看经营分析", cta: "查看经营分析", action: "business" },
];

function BrandInsightCarousel({ onPricing, onBusiness }: { onPricing: () => void; onBusiness: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const activeSlide = brandInsightSlides[activeIndex]!;
  const setSlide = (index: number) => setActiveIndex((index + brandInsightSlides.length) % brandInsightSlides.length);

  useEffect(() => {
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => setSlide(activeIndex + 1), 4800);
    return () => window.clearTimeout(timer);
  }, [activeIndex]);

  const handleAction = () => {
    if (activeSlide.action === "pricing") onPricing();
    if (activeSlide.action === "business") onBusiness();
  };

  const renderVisual = () => {
    if (activeSlide.id === "brand") return <div className="brand-banner-brand-visual" aria-hidden="true"><span className="brand-node n1">+</span><span className="brand-node n2">−</span><span className="brand-node n3">×</span><i /><b>=</b></div>;
    if (activeSlide.id === "cost") return <div className="brand-banner-equation cost" aria-label="进货18元，加包材、人工、平台和损耗，等于真实成本26.8元"><span>进货<br /><b>¥18</b></span><i>+</i><span>包材<br /><b>人工</b></span><i>+</i><span>平台<br /><b>损耗</b></span><strong>=<small>真实成本</small><b>¥26.8</b></strong></div>;
    if (activeSlide.id === "pricing") return <div className="brand-banner-equation pricing" aria-label="成本26.8元，加目标利润30%，等于建议售价38.3元"><span>成本<br /><b>¥26.8</b></span><i>+</i><span>目标利润<br /><b>30%</b></span><strong>=<small>建议售价</small><b>¥38.3</b></strong></div>;
    if (activeSlide.id === "profit") return <div className="brand-banner-profit" aria-label="营业额10万元减成本6.2万元减费用2.1万元等于真实利润1.7万元，利润率17%"><span>营业额 <b>¥100,000</b></span><span>− 成本 <b>¥62,000</b></span><span>− 费用 <b>¥21,000</b></span><strong>¥17,000 <small>利润率 17%</small></strong></div>;
    return <div className="brand-banner-warning" aria-label="成本率上升68%，毛利率下降32%，损耗率上升8.6%，成本正在上涨"><span>成本率 <b>↑68%</b></span><span>毛利率 <b>↓32%</b></span><span>损耗率 <b>↑8.6%</b></span><small><AlertTriangle size={13} /> 成本正在上涨</small></div>;
  };

  return <section className={`brand-insight-carousel slide-${activeSlide.id}`} aria-label="算得清产品能力轮播" onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const startX = touchStartX.current; const endX = event.changedTouches[0]?.clientX; touchStartX.current = null; if (startX !== null && endX !== undefined && Math.abs(endX - startX) > 32) setSlide(endX < startX ? activeIndex + 1 : activeIndex - 1); }}>
    <div className="brand-symbol-texture" aria-hidden="true">+ − × ÷ = + − × ÷ =</div>
    <div className="brand-banner-copy" role="group" aria-roledescription="slide" aria-label={`${String(activeIndex + 1).padStart(2, "0")} / 05 ${activeSlide.tag}`}>
      <span className="brand-banner-tag">{activeSlide.tag}</span>
      <h2 key={`${activeSlide.id}-title`}>{activeSlide.title}</h2>
      <p>{activeSlide.description}</p>
      <div className="brand-banner-footer"><span>{activeSlide.footer}</span>{activeSlide.cta && <button onClick={handleAction}>{activeSlide.cta} <ArrowRight size={14} /></button>}</div>
    </div>
    <div className="brand-banner-visual" key={`${activeSlide.id}-visual`}>{renderVisual()}</div>
    <div className="brand-carousel-progress" role="tablist" aria-label="选择品牌信息页"><span>{String(activeIndex + 1).padStart(2, "0")}</span><div>{brandInsightSlides.map((slide, index) => <button key={slide.id} role="tab" aria-selected={index === activeIndex} aria-label={`查看 ${String(index + 1).padStart(2, "0")} ${slide.tag}`} onClick={() => setSlide(index)}><i /></button>)}</div><span>05</span></div>
  </section>;
}

function PeriodPicker({ period, onChange }: { period: string; onChange: (period: string) => void }) {
  return <label className="range-chip period-picker"><input aria-label="选择经营月份" type="month" value={period} onChange={(event) => onChange(event.target.value)} /></label>;
}

const cashChartConfig = {
  income: { label: "收款", color: "var(--chart-income)" },
  expenses: { label: "付款", color: "var(--chart-cost)" },
} satisfies ChartConfig;

export function getCostMixData(product: LedgerProduct, operatingCost: number, fullCost: number) {
  const direct = Math.max(product.direct, 0);
  const operating = Math.max(operatingCost - direct, 0);
  const funding = Math.max(fullCost - operatingCost, 0);
  return [
    { key: "direct", label: "直接成本", amount: direct, tone: "blue" },
    { key: "operating", label: "经营分摊", amount: operating, tone: "mint" },
    { key: "funding", label: "资金成本", amount: funding, tone: "amber" },
  ].filter((item) => item.amount > 0);
}

export function getProfitBridgeData(summary: Pick<ReturnType<typeof summarizeLedger>, "salesRevenue" | "costOfSales" | "allocatedIndirectCosts" | "financingCosts" | "operatingResult">) {
  return [
    { key: "revenue", label: "销售收入", amount: Math.max(summary.salesRevenue, 0), direction: "plus" as const },
    { key: "direct", label: "直接成本", amount: Math.max(summary.costOfSales, 0), direction: "minus" as const },
    { key: "allocation", label: "间接分摊", amount: Math.max(summary.allocatedIndirectCosts, 0), direction: "minus" as const },
    { key: "funding", label: "资金成本", amount: Math.max(summary.financingCosts, 0), direction: "minus" as const },
    { key: "result", label: "经营结果", amount: summary.operatingResult, direction: "result" as const },
  ];
}

export function getProductContributionData(products: LedgerProduct[], sales: SalesRecord[], period: string, range: CashTrendRange = "month") {
  const { start, end } = getTrendDateWindow(period, range);
  const inRange = (date: string) => date >= start && date <= end;
  return products.map((product) => {
    let revenue = 0;
    let directCost = 0;
    let quantity = 0;
    sales.filter((sale) => sale.productId === product.id && sale.status !== "voided").forEach((sale) => {
      const saleInPeriod = inRange(sale.date);
      const refunds = (sale.refunds ?? []).filter((refund) => inRange(refund.date));
      const refundedQuantity = Math.min(refunds.reduce((sum, refund) => sum + Math.max(Number(refund.quantity) || 0, 0), 0), sale.quantity);
      const refundedAmount = Math.min(refunds.reduce((sum, refund) => sum + Math.max(Number(refund.amount) || 0, 0), 0), sale.quantity * sale.unitPrice);
      if (!saleInPeriod && refundedQuantity <= 0 && refundedAmount <= 0) return;
      const netQuantity = saleInPeriod ? sale.quantity - refundedQuantity : -refundedQuantity;
      const netRevenue = saleInPeriod ? sale.quantity * sale.unitPrice - refundedAmount : -refundedAmount;
      const unitDirectCost = sale.unitDirectCostSnapshot ?? product.direct;
      revenue += netRevenue;
      directCost += unitDirectCost * netQuantity;
      quantity += netQuantity;
    });
    return { productId: product.id, name: product.name, revenue, directCost, contribution: revenue - directCost, quantity };
  }).filter((item) => item.revenue !== 0 || item.directCost !== 0).sort((a, b) => b.revenue - a.revenue);
}

const contributionRangeOptions: Array<{ value: CashTrendRange; label: string }> = [{ value: "7d", label: "7天" }, { value: "30d", label: "30天" }, { value: "month", label: "本月" }];

export const getContributionRangeLabel = (range: CashTrendRange) => contributionRangeOptions.find((item) => item.value === range)?.label ?? "本月";

function ContributionRangeSwitch({ range, onChange }: { range: CashTrendRange; onChange: (range: CashTrendRange) => void }) {
  return <div className="trend-range-switch" role="group" aria-label="选择商品贡献范围">{contributionRangeOptions.map((item) => <button type="button" key={item.value} className={range === item.value ? "selected" : ""} aria-pressed={range === item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

export function MiniTrendChart({ series, rangeLabel }: { series: Array<{ label: string; income: number; expenses: number }>; rangeLabel: string }) {
  const [selectedIndex, setSelectedIndex] = useState(Math.max(series.length - 1, 0));
  useEffect(() => setSelectedIndex(Math.max(series.length - 1, 0)), [series.length, series.at(-1)?.label]);
  const values = series.flatMap((item) => [item.income, item.expenses]);
  const max = Math.max(...values, 1);
  const points = (key: "income" | "expenses") => series.map((item, index) => `${(index / Math.max(series.length - 1, 1)) * 100},${92 - (item[key] / max) * 76}`).join(" ");
  const hasData = series.some((item) => item.income > 0 || item.expenses > 0);
  const axisIndexes = Array.from(new Set([0, 1, 2, 3, 4].map((step) => Math.round((Math.max(series.length - 1, 0) * step) / 4))));
  if (!hasData) return <div className="mini-chart-empty"><BarChart3 size={20} /><span>{rangeLabel}暂无现金收付</span></div>;
  const selected = series[selectedIndex] ?? series.at(-1)!;
  return <div className="mini-trend-wrap"><svg className="mini-trend-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${rangeLabel}现金收款与付款趋势`}><line x1="0" y1="92" x2="100" y2="92" /><polyline className="trend-income" points={points("income")} /><polyline className="trend-expense" points={points("expenses")} />{series.map((item, index) => { const x = (index / Math.max(series.length - 1, 1)) * 100; const selectedPoint = index === selectedIndex; return <g className={selectedPoint ? "is-selected" : ""} key={item.label}><circle className="trend-income-dot" cx={x} cy={92 - (item.income / max) * 76} r={selectedPoint ? "2.5" : "1.35"} /><circle className="trend-expense-dot" cx={x} cy={92 - (item.expenses / max) * 76} r={selectedPoint ? "2.5" : "1.35"} /></g>; })}</svg><div className="mini-chart-axis" aria-hidden="true">{axisIndexes.map((index) => <span className={index === 0 ? "first" : index === series.length - 1 ? "last" : ""} style={{ left: `${(index / Math.max(series.length - 1, 1)) * 100}%` }} key={series[index]?.label}>{series[index]?.label}</span>)}</div><div className="chart-tooltip mini-trend-tooltip"><div><b>{selected.label}</b><small>当天实际收付</small></div><span><i className="income-dot" />收款 {formatCurrency(selected.income)}</span><span><i className="expense-dot" />付款 {formatCurrency(selected.expenses)}</span><strong>净收付 {formatCurrency(selected.income - selected.expenses)}</strong></div><div className="trend-date-select"><button type="button" aria-label="查看前一天现金收付" disabled={selectedIndex <= 0} onClick={() => setSelectedIndex((index) => Math.max(index - 1, 0))}><ChevronLeft size={16} /></button><label><span>查看日期</span><select aria-label="选择现金收付日期" value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.currentTarget.value))}>{series.map((item, index) => <option value={index} key={item.label}>{item.label}</option>)}</select></label><button type="button" aria-label="查看后一天现金收付" disabled={selectedIndex >= series.length - 1} onClick={() => setSelectedIndex((index) => Math.min(index + 1, series.length - 1))}><ChevronRight size={16} /></button></div><div className="mini-chart-legend"><span><i className="income-dot" />收款</span><span><i className="expense-dot" />付款</span></div></div>;
}

type SalesTrendMode = "profit" | "revenueCost";

function SalesTrendChart({ series, mode, title, description, compact = false }: { series: ReturnType<typeof getSalesTrendSeries>; mode: SalesTrendMode; title: string; description: string; compact?: boolean }) {
  const [selectedIndex, setSelectedIndex] = useState(Math.max(series.length - 1, 0));
  useEffect(() => setSelectedIndex(Math.max(series.length - 1, 0)), [series.length, series.at(-1)?.label]);
  const keys = mode === "profit" ? ["profit"] as const : ["revenue", "cost"] as const;
  const hasData = series.some((item) => item.salesCount > 0 || item.revenue !== 0 || item.cost !== 0);
  const values = series.flatMap((item) => keys.map((key) => item[key]));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = Math.max(max - min, 1);
  const toY = (value: number) => 92 - ((value - min) / span) * 76;
  const points = (key: typeof keys[number]) => series.map((item, index) => `${(index / Math.max(series.length - 1, 1)) * 100},${toY(item[key])}`).join(" ");
  const selected = series[selectedIndex] ?? series.at(-1);
  const axisSteps = compact ? [0, 1, 2] : [0, 1, 2, 3, 4];
  const axisIndexes = Array.from(new Set(axisSteps.map((step) => Math.round((Math.max(series.length - 1, 0) * step) / Math.max(axisSteps.length - 1, 1)))));
  const legend = mode === "profit" ? [{ key: "profit", label: "经营利润", tone: "profit" }] : [{ key: "revenue", label: "销售收入", tone: "income" }, { key: "cost", label: "已结转成本", tone: "cost" }];
  if (!hasData) return <section className={`analytics-trend-card analytics-empty ${compact ? "compact" : ""}`} aria-label={title}><div className="chart-heading"><div>{!compact && <span className="eyebrow">销售快照</span>}<h2>{title}</h2></div></div><div className="mini-chart-empty"><BarChart3 size={20} /><span>记录销售后显示利润走势</span></div>{!compact && <p>{description}</p>}</section>;
  return <section className={`analytics-trend-card ${compact ? "compact" : ""}`} aria-label={title}><div className="chart-heading"><div>{!compact && <span className="eyebrow">销售快照 · 近7天</span>}<h2>{title}</h2></div>{mode === "profit" && <span className={`chart-summary-value ${selected && selected.profit < 0 ? "loss" : ""}`}>{formatCurrency(selected?.profit ?? 0)} <small>{compact ? selected?.label : "选中日期"}</small></span>}</div><svg className="analytics-trend-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={title}><line className="analytics-zero-line" x1="0" y1={toY(0)} x2="100" y2={toY(0)} /><polyline className={mode === "profit" ? "analytics-profit-line" : "analytics-income-line"} points={points(mode === "profit" ? "profit" : "revenue")} />{mode === "revenueCost" && <polyline className="analytics-cost-line" points={points("cost")} />}{series.map((item, index) => { const x = (index / Math.max(series.length - 1, 1)) * 100; const isSelected = index === selectedIndex; return <g key={item.date} className={isSelected ? "is-selected" : ""}><circle className={mode === "profit" ? "analytics-profit-dot" : "analytics-income-dot"} cx={x} cy={toY(mode === "profit" ? item.profit : item.revenue)} r={isSelected ? "2.5" : "1.3"} onClick={() => setSelectedIndex(index)} />{mode === "revenueCost" && <circle className="analytics-cost-dot" cx={x} cy={toY(item.cost)} r={isSelected ? "2.5" : "1.3"} onClick={() => setSelectedIndex(index)} />}</g>; })}</svg><div className="mini-chart-axis" aria-hidden="true">{axisIndexes.map((index) => <span className={index === 0 ? "first" : index === series.length - 1 ? "last" : ""} style={{ left: `${(index / Math.max(series.length - 1, 1)) * 100}%` }} key={series[index]?.label}>{series[index]?.label}</span>)}</div><div className="chart-tooltip analytics-trend-tooltip"><div><b>{selected?.label}</b><small>{compact ? "销售快照" : "按业务日期归属"}</small></div>{mode === "profit" ? <><span><i className="profit-dot" />利润 {formatCurrency(selected?.profit ?? 0)}</span><small>收入 {formatCurrency(selected?.revenue ?? 0)} · 成本 {formatCurrency(selected?.cost ?? 0)}</small></> : <><span><i className="income-dot" />销售收入 {formatCurrency(selected?.revenue ?? 0)}</span><span><i className="cost-dot" />已结转成本 {formatCurrency(selected?.cost ?? 0)}</span><strong>经营利润 {formatCurrency(selected?.profit ?? 0)}</strong></>}</div>{!compact && <div className="trend-date-select"><button type="button" aria-label={`查看前一天${title}`} disabled={selectedIndex <= 0} onClick={() => setSelectedIndex((index) => Math.max(index - 1, 0))}><ChevronLeft size={16} /></button><label><span>查看日期</span><select aria-label={`选择${title}日期`} value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.currentTarget.value))}>{series.map((item, index) => <option value={index} key={item.date}>{item.label}</option>)}</select></label><button type="button" aria-label={`查看后一天${title}`} disabled={selectedIndex >= series.length - 1} onClick={() => setSelectedIndex((index) => Math.min(index + 1, series.length - 1))}><ChevronRight size={16} /></button></div>} {!compact && <><div className="mini-chart-legend">{legend.map((item) => <span key={item.key}><i className={`${item.tone}-dot`} />{item.label}</span>)}</div><p>{description}</p></>}</section>;
}

export function CostCompositionChart({ product, operatingCost, fullCost }: { product: LedgerProduct; operatingCost: number; fullCost: number }) {
  const layers = getCostMixData(product, operatingCost, fullCost);
  const total = layers.reduce((sum, item) => sum + item.amount, 0);
  const [selectedKey, setSelectedKey] = useState(layers[0]?.key ?? "direct");
  const selected = layers.find((item) => item.key === selectedKey) ?? layers[0];
  if (total <= 0) return <div className="cost-composition-empty"><BarChart3 size={20} /><strong>还没有成本</strong></div>;
  return <div className="cost-composition-chart"><div className="composition-track" role="img" aria-label="点按成本层查看金额"><div className="composition-segments">{layers.map((layer) => <button key={layer.key} aria-label={`查看${layer.label}`} className={`composition-${layer.tone} ${selected?.key === layer.key ? "selected" : ""}`} style={{ width: `${layer.amount / total * 100}%` }} onClick={() => setSelectedKey(layer.key)} />)}</div></div><div className="chart-tooltip cost-mix-tooltip"><b>{selected?.label}</b><span>{formatCurrency(selected?.amount ?? 0)} · {(((selected?.amount ?? 0) / total) * 100).toFixed(1)}%</span></div><div className="composition-legend">{layers.map((layer) => <button className={selected?.key === layer.key ? "selected" : ""} key={layer.key} onClick={() => setSelectedKey(layer.key)}><i className={`composition-${layer.tone}-dot`} />{layer.label} <b>{formatCurrency(layer.amount)}</b></button>)}</div></div>;
}

function CashFlowChart({ series, onRecord }: { series: ReturnType<typeof summarizeLedger>["dailySeries"]; onRecord: () => void }) {
  const [selectedIndex, setSelectedIndex] = useState(Math.max(series.length - 1, 0));
  const hasData = series.some((item) => item.income > 0 || item.expenses > 0);
  if (!hasData) return <section className="cash-flow-chart chart-card"><div className="chart-heading"><div><span className="eyebrow">现金流</span><h2>暂无记录</h2></div></div><div className="chart-empty" role="status"><button type="button" onClick={onRecord}>记一笔 <ArrowRight size={14} /></button></div></section>;
  const selected = series[selectedIndex] ?? series.at(-1)!;
  return <section className="cash-flow-chart chart-card" aria-label="现金流走势"><div className="chart-heading"><div><span className="eyebrow">现金流</span><h2>收支走势</h2></div><span className="legend"><i />收款 <i className="green" />付款</span></div><ChartContainer config={cashChartConfig} className="cash-flow-dynamic-chart"><BarChart data={series} margin={{ left: -18, right: 3, top: 12, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} /><YAxis hide /><ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => `${value} 现金收付`} formatter={(value, name) => <span>{name} {formatCurrency(Number(value))}</span>} />} /><Bar dataKey="income" fill="var(--color-income)" radius={[6, 6, 2, 2]} onClick={(_, index) => setSelectedIndex(index)} /><Bar dataKey="expenses" fill="var(--color-expenses)" radius={[6, 6, 2, 2]} onClick={(_, index) => setSelectedIndex(index)} /></BarChart></ChartContainer><div className="chart-tooltip cash-flow-selection"><b>{selected.label}</b><span><i className="income-dot" />收款 {formatCurrency(selected.income)}</span><span><i className="expense-dot" />付款 {formatCurrency(selected.expenses)}</span><strong>当日净额 {formatCurrency(selected.income - selected.expenses)}</strong></div><div className="chart-point-tabs" role="tablist" aria-label="选择现金收付日期">{series.map((item, index) => <button role="tab" aria-selected={index === selectedIndex} className={index === selectedIndex ? "selected" : ""} key={item.label} onClick={() => setSelectedIndex(index)}>{item.label}</button>)}</div></section>;
}

export function ProfitBridgeChart({ summary }: { summary: Pick<ReturnType<typeof summarizeLedger>, "salesRevenue" | "costOfSales" | "allocatedIndirectCosts" | "financingCosts" | "operatingResult"> }) {
  const rows = getProfitBridgeData(summary);
  const visibleRows = rows.filter((row) => row.key === "revenue" || row.key === "result" || row.amount !== 0);
  const [selectedKey, setSelectedKey] = useState("revenue");
  const selected = visibleRows.find((row) => row.key === selectedKey) ?? visibleRows[0];
  const max = Math.max(...visibleRows.map((row) => Math.abs(row.amount)), 1);
  const costCount = visibleRows.filter((row) => row.direction === "minus").length;
  return <section className="profit-bridge-card" aria-label="销售结转利润路径"><div className="chart-heading"><div><span className="eyebrow">利润路径</span><h2>收入扣除成本，得出经营结果</h2></div></div><p className="profit-bridge-intro">{costCount ? `本期已从销售收入中扣除 ${costCount} 项成本。` : "本期尚无需要扣除的销售成本。"}</p><div className="profit-bridge-bars">{visibleRows.map((row) => <button className={`${row.direction} ${selected?.key === row.key ? "selected" : ""}`} key={row.key} onClick={() => setSelectedKey(row.key)}><span className="profit-bridge-symbol">{row.direction === "plus" ? "+" : row.direction === "minus" ? "−" : "="}</span><span className="profit-bridge-label"><b>{row.label}</b><i><em style={{ width: `${Math.max(Math.abs(row.amount) / max * 100, row.amount ? 8 : 2)}%` }} /></i></span><strong>{formatCurrency(row.amount)}</strong></button>)}</div><div className="chart-tooltip profit-bridge-tooltip"><b>{selected?.label}</b><span>{selected?.direction === "plus" ? "增加" : selected?.direction === "minus" ? "扣减" : "最终结果"} {formatCurrency(selected?.amount ?? 0)}；数据来自已结转销售快照。</span></div></section>;
}

function ProductContributionChart({ products, sales, period }: { products: LedgerProduct[]; sales: SalesRecord[]; period: string }) {
  const [range, setRange] = useState<CashTrendRange>("month");
  const rows = useMemo(() => getProductContributionData(products, sales, period, range), [products, sales, period, range]);
  const [selectedId, setSelectedId] = useState(rows[0]?.productId ?? 0);
  const selected = rows.find((item) => item.productId === selectedId) ?? rows[0];
  const max = Math.max(...rows.map((item) => Math.abs(item.revenue)), 1);
  return <section className="product-contribution-chart" aria-label="商品销售贡献图"><div className="section-heading compact"><div><span className="eyebrow">商品经营 · {getContributionRangeLabel(range)}</span><h2>销售贡献</h2></div><small>仅含已结转直接成本</small></div><ContributionRangeSwitch range={range} onChange={setRange} />{rows.length ? <><div className="contribution-bars">{rows.map((item) => <button key={item.productId} className={selected?.productId === item.productId ? "selected" : ""} onClick={() => setSelectedId(item.productId)}><span>{item.name}</span><i><b style={{ width: `${Math.max(Math.abs(item.revenue) / max * 100, 5)}%` }} /></i><strong>{formatCurrency(item.revenue)}</strong></button>)}</div><div className="chart-tooltip product-contribution-tooltip"><b>{selected?.name}</b><span>销售收入 {formatCurrency(selected?.revenue ?? 0)} · 已结转直接成本 {formatCurrency(selected?.directCost ?? 0)}</span><strong>直接贡献 {formatCurrency(selected?.contribution ?? 0)}</strong><small>{selected?.quantity ?? 0} 件净销量；房租、人工等分摊请在“成本分析”查看。</small></div></> : <div className="chart-empty"><BarChart3 size={20} /><strong>{getContributionRangeLabel(range)}暂无商品销售贡献</strong><span>可切换范围查看其他已结转销售。</span></div>}</section>;
}

export function ProductsView({ products, activeProductId, fundingCost, sales, period, onSelect, onPricing, productCostAction, productCostLabel, onQuickCost, onBom, onAdd, onDelete, onInventory, onCostAnalysis }: { products: LedgerProduct[]; activeProductId: number; fundingCost: number; sales: SalesRecord[]; period: string; onSelect: (id: number) => void; onPricing: () => void; productCostAction: string; productCostLabel: string; onQuickCost: () => void; onBom: () => void; onAdd: () => void; onDelete?: (product: LedgerProduct) => void; onInventory?: (product: LedgerProduct) => void; onCostAnalysis?: (product: LedgerProduct) => void }) {
  const [showMoreActions, setShowMoreActions] = useState(false);
  if (!products.length) return <div className="page-content product-content empty-product-page"><section className="core-page-heading"><div><h1>商品</h1><p className="core-subtitle">管理商品成本，掌握每一份利润</p></div><button className="core-add-action" onClick={onAdd}><Plus size={16} />新增商品</button></section><section className="empty-state-card"><span className="core-brand-equation">+</span><h2>还没有商品</h2><p>新建商品后，补充成本和售价即可看到每件利润。</p><button className="primary-action" onClick={onAdd}><Plus size={18} /> 新建商品</button></section></div>;
  const selected = products.find((product) => product.id === activeProductId) ?? products[0];
  const margin = selected.price > 0 ? ((selected.price - selected.operating) / selected.price) * 100 : 0;
  const needsCost = selected.direct <= 0 && selected.bom.length === 0;
  const needsPricing = selected.price <= 0;
  return (
    <div className="page-content product-content">
      <section className="core-page-heading product-page-heading"><div><h1>商品</h1><p className="core-subtitle">管理商品成本，掌握每一份利润</p></div><button className="core-add-action" onClick={onAdd} aria-label="新增商品"><Plus size={16} />新增商品</button></section>
      <div className="core-section-heading product-list-heading"><h2>商品列表 <small>({products.length})</small></h2><span>售价、成本与利润</span></div>
      <section className="product-list">
        {products.map((product) => {
          const productStatus = product.category === "待完善配方" ? getProductPendingLabel(productCostLabel) : product.category;
          const productMargin = product.price > 0 ? (product.price - product.operating) / product.price * 100 : null;
          const unitProfit = product.price > 0 ? product.price - product.operating : null;
          return <button key={product.id} className={activeProductId === product.id ? "product-row selected" : "product-row"} onClick={() => onSelect(product.id)}>
            <div className="product-symbol"><ShoppingBag size={21} /></div>
            <div className="product-main"><div><strong>{product.name}</strong><em>{product.price > 0 && product.operating > 0 ? "已核算" : "待完善"}</em></div><span>{productStatus}{product.costCategory ? ` · ${product.costCategory}` : ""}</span><div className="product-row-metrics"><span><small>售价</small><b>{product.price ? formatCurrency(product.price) : "未定价"}</b></span><span><small>成本</small><b>{product.operating > 0 ? formatCurrency(product.operating) : "待补"}</b></span><span className={unitProfit !== null && unitProfit < 0 ? "loss" : "profit"}><small>利润</small><b>{unitProfit === null ? "—" : formatCurrency(unitProfit)}</b></span><span className={productMargin !== null && productMargin < 0 ? "loss" : "brand"}><small>毛利率</small><b>{productMargin === null ? "—" : `${productMargin.toFixed(1)}%`}</b></span></div></div>
            <ChevronRight size={17} />
          </button>;
        })}
      </section>
      <section className="product-detail-card" aria-label={`${selected.name}单件利润`}>
        <div className="detail-card-title"><div><span className="eyebrow">商品明细</span><h2>{selected.name}</h2></div><span className={needsCost ? "status-pill warning" : "status-pill"}>{needsCost ? `待补${productCostLabel}` : needsPricing ? "待定价" : "已核算"}</span></div>
        <div className="core-kpi-grid product-kpi-grid"><span className="brand"><small>售价</small><b>{selected.price ? formatCurrency(selected.price) : "未定价"}</b></span><span><small>单件成本</small><b>{selected.operating > 0 ? formatCurrency(selected.operating) : "待补"}</b></span><span className={selected.price - selected.operating < 0 ? "risk" : "positive"}><small>单件利润</small><b>{selected.price ? formatCurrency(selected.price - selected.operating) : "—"}</b></span><span className={margin < 0 ? "risk" : "brand"}><small>毛利率</small><b>{selected.price ? `${margin.toFixed(1)}%` : "—"}</b></span></div>
        <CostCompositionChart product={selected} operatingCost={selected.operating} fullCost={selected.operating + fundingCost} />
        <div className="product-action-pair"><button className="secondary-card-action cost-analysis-entry" onClick={() => onCostAnalysis?.(selected)} disabled={!onCostAnalysis}><BarChart3 size={17} />成本分析</button><button className="secondary-card-action" aria-label="打开直接成本录入" onClick={onQuickCost}><Coins size={17} />{needsCost ? "录入成本" : "直接成本"}</button><button className="secondary-card-action" onClick={onPricing}><Sparkles size={17} />{needsPricing ? "设置售价" : "调整定价"}</button><button className="secondary-card-action" aria-expanded={showMoreActions} onClick={() => setShowMoreActions((current) => !current)}>更多<ChevronRight size={16} /></button>{showMoreActions && <div className="product-more-actions"><button onClick={onBom}><ClipboardList size={16} /> {productCostAction}</button>{onInventory && <button onClick={() => onInventory(selected)}><ShoppingBag size={16} />库存设置</button>}{onDelete && <button className="danger" onClick={() => onDelete(selected)}><Trash2 size={16} />删除商品</button>}</div>}</div>
      </section>
      <ProductContributionChart products={products} sales={sales} period={period} />
    </div>
  );
}

type CostAnalysisLine = PricingCostLine & { share: number; tone: string };

export function getCostAnalysisLines(costLines: PricingCostLine[], fallbackCost: number): CostAnalysisLine[] {
  const merged = new Map<string, PricingCostLine>();
  costLines.filter((line) => line.amount > 0).forEach((line) => {
    const current = merged.get(line.label);
    merged.set(line.label, current ? { ...current, amount: current.amount + line.amount } : line);
  });
  const items = Array.from(merged.values());
  const total = items.reduce((sum, item) => sum + item.amount, 0) || Math.max(fallbackCost, 0);
  const palette = ["var(--chart-income)", "var(--chart-cost)", "var(--chart-warning)", "#7567df", "var(--chart-risk)", "#7084a2"];
  if (!items.length && total > 0) return [{ label: "完整成本", amount: total, source: "商品成本设置", layer: "operating", share: 1, tone: palette[0] }];
  return items.sort((a, b) => b.amount - a.amount).map((item, index) => ({ ...item, share: total ? item.amount / total : 0, tone: palette[index % palette.length] }));
}

export function getProductDirectCostTrend(sales: SalesRecord[], productId: number, range: "7d" | "30d" | "90d") {
  const activeSales = sales.filter((sale) => sale.productId === productId && sale.status !== "voided" && sale.unitDirectCostSnapshot !== undefined).sort((a, b) => a.date.localeCompare(b.date));
  if (!activeSales.length) return [];
  const latest = new Date(`${activeSales.at(-1)!.date}T00:00:00`);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const start = new Date(latest);
  start.setDate(start.getDate() - (days - 1));
  const byDate = new Map<string, { amount: number; quantity: number }>();
  activeSales.filter((sale) => new Date(`${sale.date}T00:00:00`) >= start).forEach((sale) => {
    const refunded = (sale.refunds ?? []).reduce((sum, refund) => sum + Math.max(refund.quantity, 0), 0);
    const quantity = Math.max(sale.quantity - refunded, 0);
    if (quantity <= 0) return;
    const current = byDate.get(sale.date) ?? { amount: 0, quantity: 0 };
    byDate.set(sale.date, { amount: current.amount + (sale.unitDirectCostSnapshot ?? 0) * quantity, quantity: current.quantity + quantity });
  });
  return Array.from(byDate.entries()).map(([date, value]) => ({ date, label: date.slice(5).replace("-", "/"), unitCost: value.quantity ? value.amount / value.quantity : 0 })).sort((a, b) => a.date.localeCompare(b.date));
}

export function CostAnalysisView({ product, products, costLines, fullCost, directCost, period, sales, plannedQuantity, onBack, onSelectProduct, onAddCost, onPricing, onAdjustAllocation }: { product: LedgerProduct; products: LedgerProduct[]; costLines: PricingCostLine[]; fullCost: number; directCost: number; period: string; sales: SalesRecord[]; plannedQuantity: number; onBack: () => void; onSelectProduct: (productId: number) => void; onAddCost: () => void; onPricing: () => void; onAdjustAllocation: () => void }) {
  const unitCost = Math.max(costLines.reduce((sum, line) => sum + Math.max(line.amount, 0), 0), fullCost, 0);
  const lines = getCostAnalysisLines(costLines, unitCost);
  const hasCost = unitCost > 0;
  const unitProfit = product.price > 0 && hasCost ? product.price - unitCost : null;
  const margin = unitProfit !== null && product.price > 0 ? unitProfit / product.price * 100 : null;
  const [trendRange, setTrendRange] = useState<"7d" | "30d" | "90d">("30d");
  const trend = useMemo(() => getProductDirectCostTrend(sales, product.id, trendRange), [sales, product.id, trendRange]);
  const [selectedTrendIndex, setSelectedTrendIndex] = useState(0);
  const suggestedQuantity = plannedQuantity > 0 ? Math.round(plannedQuantity) : Math.max(1, sales.filter((sale) => sale.productId === product.id && sale.date.startsWith(period) && sale.status !== "voided").reduce((sum, sale) => sum + Math.max(sale.quantity - (sale.refunds ?? []).reduce((refunds, refund) => refunds + Math.max(refund.quantity, 0), 0), 0), 0));
  const [simulation, setSimulation] = useState(() => ({ price: product.price || 0, cost: unitCost, quantity: suggestedQuantity }));
  useEffect(() => { setSimulation({ price: product.price || 0, cost: unitCost, quantity: suggestedQuantity }); setSelectedTrendIndex(Math.max(trend.length - 1, 0)); }, [product.id, product.price, unitCost, suggestedQuantity, trend.length]);
  const selectedTrend = trend[selectedTrendIndex] ?? trend.at(-1);
  const chartMax = Math.max(...trend.map((item) => item.unitCost), 1);
  const chartMin = Math.min(...trend.map((item) => item.unitCost), 0);
  const chartSpan = Math.max(chartMax - chartMin, 0.01);
  const points = trend.map((item, index) => `${trend.length === 1 ? 150 : 18 + index / (trend.length - 1) * 264},${94 - (item.unitCost - chartMin) / chartSpan * 66}`).join(" ");
  const simulatedUnitProfit = simulation.price - simulation.cost;
  const simulatedMargin = simulation.price > 0 ? simulatedUnitProfit / simulation.price * 100 : null;
  const simulatedMonthlyProfit = simulatedUnitProfit * simulation.quantity;
  const largestLine = lines[0];
  const indirectCost = lines.filter((line) => line.layer === "operating").reduce((sum, line) => sum + line.amount, 0);
  const anomalies = [
    !hasCost ? { tone: "warning", title: "还没有成本数据", text: "添加第一项成本后，才能判断每件是否赚钱。", action: onAddCost, label: "添加成本" } : null,
    product.price <= 0 ? { tone: "warning", title: "商品还没有售价", text: "设置售价后，才能计算单位毛利、毛利率和保本空间。", action: onPricing, label: "设置售价" } : null,
    unitProfit !== null && unitProfit < 0 ? { tone: "loss", title: "当前售价低于单位完整成本", text: `每卖 1 件预计亏损 ${formatCurrency(Math.abs(unitProfit))}。`, action: onPricing, label: "调整售价" } : null,
    largestLine && largestLine.share >= .6 ? { tone: "warning", title: `${largestLine.label}成本集中`, text: `占单位完整成本 ${(largestLine.share * 100).toFixed(1)}%，建议核对该项单价、数量或损耗。`, action: onAddCost, label: "核对成本" } : null,
    indirectCost > directCost && indirectCost > 0 ? { tone: "cash", title: "经营分摊高于直接成本", text: "房租、人工等分摊占比较高，可检查本期分摊依据与预计产量。", action: onAdjustAllocation, label: "查看分摊" } : null,
  ].filter(Boolean) as Array<{ tone: string; title: string; text: string; action: () => void; label: string }>;
  const suggestions = [
    unitProfit !== null && unitProfit >= 0 ? { id: "margin", title: "当前售价高于完整成本", text: `每件预计留出 ${formatCurrency(unitProfit)} 毛利空间；模拟调整不会改变已结转销售。`, action: onPricing, label: "调整定价" } : null,
    largestLine ? { id: "largest", title: `优先关注 ${largestLine.label}`, text: `该项占单位完整成本 ${(largestLine.share * 100).toFixed(1)}%，是当前最主要的成本来源。`, action: onAddCost, label: "查看成本" } : null,
    indirectCost > 0 ? { id: "allocation", title: "分摊成本已计入完整成本", text: "本页成本结构使用当前期间预计分摊；已发生利润仍以销售时冻结快照为准。", action: onAdjustAllocation, label: "调整分摊" } : null,
  ].filter(Boolean) as Array<{ id: string; title: string; text: string; action: () => void; label: string }>;
  const gradient = lines.length ? `conic-gradient(${lines.map((line, index) => `${line.tone} ${lines.slice(0, index).reduce((sum, item) => sum + item.share * 100, 0)}% ${lines.slice(0, index + 1).reduce((sum, item) => sum + item.share * 100, 0)}%`).join(",")})` : "conic-gradient(#e8eef5 0 100%)";
  const changeSimulation = (key: "price" | "cost" | "quantity", delta: number) => setSimulation((current) => ({ ...current, [key]: Math.max(0, Math.round((current[key] + delta) * 100) / 100) }));
  return <div className="page-content cost-analysis-page">
    <section className="cost-analysis-header"><button className="icon-button" onClick={onBack} aria-label="返回商品"><ChevronLeft size={21} /></button><div><span className="eyebrow">商品成本</span><h1>成本分析</h1></div><select aria-label="切换成本分析商品" value={product.id} onChange={(event) => onSelectProduct(Number(event.target.value))}>{products.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></section>
    <section className="cost-analysis-product"><span>当前商品</span><b>{product.name}</b><small>{formatBusinessPeriod(period)} · 当前成本与定价口径</small></section>
    <section className={`cost-profit-card ${unitProfit !== null && unitProfit < 0 ? "loss" : !hasCost || product.price <= 0 ? "pending" : ""}`} aria-label="单位盈亏结论"><div><span>现在赚多少？</span><BrandSignature tone="inverse" compact /></div>{hasCost && product.price > 0 ? <><div className="cost-profit-formula"><span><small>售价</small><b>{formatCurrency(product.price)}</b></span><i>−</i><span><small>单位完整成本</small><b>{formatCurrency(unitCost)}</b></span><i>=</i><span className="result"><small>单位毛利</small><b>{formatCurrency(unitProfit ?? 0)}</b></span></div><div className="cost-profit-foot"><span>毛利率 <b>{margin?.toFixed(1)}%</b></span><small>预计口径：当前成本与售价</small></div></> : <div className="cost-profit-empty"><b>{!hasCost ? "先补齐一项成本" : "先设置商品售价"}</b><small>{!hasCost ? "添加材料、进货或制作成本后，系统会计算完整成本。" : "售价设置完成后，可计算单位毛利与保本空间。"}</small><button onClick={!hasCost ? onAddCost : onPricing}>{!hasCost ? "添加成本" : "设置售价"}<ArrowRight size={15} /></button></div>}</section>
    <section className="cost-analysis-card cost-structure-card"><div className="section-heading compact"><div><span className="eyebrow">钱都花在哪里</span><h2>成本结构</h2></div><small>单位完整成本</small></div>{hasCost ? <div className="cost-structure-main"><div className="cost-donut" style={{ background: gradient }}><div><small>单位成本</small><b>{formatCurrency(unitCost)}</b></div></div><div className="cost-structure-list">{lines.map((line) => <div key={`${line.layer}-${line.label}`}><i style={{ background: line.tone }} /><span><b>{line.label}</b><small>{line.source}</small></span><strong>{formatCurrency(line.amount)}<small>{(line.share * 100).toFixed(1)}%</small></strong></div>)}</div></div> : <div className="cost-analysis-empty"><Coins size={22} /><b>还没有成本数据</b><small>添加第一项成本，开始算清利润。</small><button onClick={onAddCost}>添加成本 <ArrowRight size={14} /></button></div>}</section>
    <section className="cost-analysis-card cost-anomaly-card"><div className="section-heading compact"><div><span className="eyebrow">成本异常</span><h2>{anomalies.length ? "需要关注" : "当前成本正常"}</h2></div>{anomalies.length ? <AlertTriangle size={18} /> : <BrandSignature tone="blue" compact />}</div>{anomalies.length ? <div className="cost-anomaly-list">{anomalies.map((item) => <article className={item.tone} key={item.title}><span>{item.tone === "loss" ? "−" : "!"}</span><div><b>{item.title}</b><small>{item.text}</small></div><button onClick={item.action}>{item.label}<ChevronRight size={14} /></button></article>)}</div> : <div className="cost-normal-state"><span>⌣</span><div><b>成本结构没有发现集中或亏损风险</b><small>后续材料价格、分摊或售价变化会自动重新计算。</small></div></div>}</section>
    <section className="cost-analysis-card cost-trend-card"><div className="section-heading compact"><div><span className="eyebrow">成本变化</span><h2>已结转单位直接成本</h2></div><span>{selectedTrend ? formatCurrency(selectedTrend.unitCost) : "暂无快照"}</span></div><div className="cost-range-picker" role="tablist" aria-label="选择成本变化范围">{(["7d", "30d", "90d"] as const).map((range) => <button key={range} role="tab" aria-selected={range === trendRange} onClick={() => setTrendRange(range)}>{range === "7d" ? "7天" : range === "30d" ? "30天" : "90天"}</button>)}</div>{trend.length ? <><svg className="cost-trend-graph" viewBox="0 0 300 110" role="img" aria-label="已结转单位直接成本变化"><line x1="18" y1="94" x2="282" y2="94" /><line x1="18" y1="60" x2="282" y2="60" /><polyline points={points} fill="none" stroke="var(--chart-income)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{trend.map((item, index) => { const x = trend.length === 1 ? 150 : 18 + index / (trend.length - 1) * 264; const y = 94 - (item.unitCost - chartMin) / chartSpan * 66; return <circle key={item.date} cx={x} cy={y} r={index === selectedTrendIndex ? 5 : 3} onClick={() => setSelectedTrendIndex(index)} />; })}</svg><div className="cost-trend-selected"><b>{selectedTrend?.label}</b><span>销售时冻结的单位直接成本 <strong>{formatCurrency(selectedTrend?.unitCost ?? 0)}</strong></span></div><div className="cost-trend-tabs">{trend.map((item, index) => <button className={index === selectedTrendIndex ? "active" : ""} key={item.date} onClick={() => setSelectedTrendIndex(index)}>{item.label}</button>)}</div></> : <div className="cost-trend-empty"><b>还没有可用的销售成本快照</b><small>记录商品销售后，这里会按销售当时冻结的单位直接成本显示变化；不会把当前成本倒灌到历史。</small></div>}</section>
    <section className="cost-analysis-card cost-simulator-card"><div className="section-heading compact"><div><span className="eyebrow">如果……会怎样</span><h2>盈亏模拟</h2></div><small>预计测算</small></div><p>调整不会修改账本、售价或已结转销售，只用于比较经营结果。</p><div className="cost-simulation-controls"><SimulationControl label="售价" value={simulation.price} unit="元" step={1} onChange={(value) => setSimulation((current) => ({ ...current, price: value }))} onAdjust={(delta) => changeSimulation("price", delta)} /><SimulationControl label="单位成本" value={simulation.cost} unit="元" step={.1} onChange={(value) => setSimulation((current) => ({ ...current, cost: value }))} onAdjust={(delta) => changeSimulation("cost", delta)} /><SimulationControl label="月销量" value={simulation.quantity} unit="件" step={1} onChange={(value) => setSimulation((current) => ({ ...current, quantity: value }))} onAdjust={(delta) => changeSimulation("quantity", delta)} /></div><div className={`cost-simulation-result ${simulatedMonthlyProfit < 0 ? "loss" : ""}`}><span><small>预计月利润</small><b>{formatCurrency(simulatedMonthlyProfit)}</b></span><span><small>单位毛利</small><b>{formatCurrency(simulatedUnitProfit)}</b></span><span><small>毛利率</small><b>{simulatedMargin === null ? "—" : `${simulatedMargin.toFixed(1)}%`}</b></span></div></section>
    <section className={`cost-analysis-card break-even-card ${unitProfit !== null && unitProfit < 0 ? "loss" : ""}`}><div className="section-heading compact"><div><span className="eyebrow">你的保本线</span><h2>保本分析</h2></div></div>{hasCost && product.price > 0 ? <><div className="break-even-values"><span><small>保本售价</small><b>{formatCurrency(unitCost)}</b></span><span><small>当前售价</small><b>{formatCurrency(product.price)}</b></span><span><small>安全空间</small><b>{formatCurrency(product.price - unitCost)}</b></span></div><div className="break-even-scale"><i /><b style={{ left: `${Math.min(Math.max(unitCost / Math.max(product.price, unitCost) * 100, 10), 100)}%` }} /><span>保本线</span><strong>当前售价</strong></div><p>{product.price >= unitCost ? `当前售价高于保本价 ${formatCurrency(product.price - unitCost)}。` : `当前售价低于保本价 ${formatCurrency(unitCost - product.price)}，每卖一件都会亏损。`}</p></> : <div className="cost-trend-empty"><b>补齐成本与售价后显示保本线</b><small>保本价等于当前商品的单位完整成本，不包含未保存的模拟调整。</small></div>}</section>
    <section className="cost-analysis-card cost-suggestion-card"><div className="section-heading compact"><div><span className="eyebrow">算得清建议</span><h2>下一步怎么做</h2></div><Sparkles size={18} /></div><div>{suggestions.length ? suggestions.map((item, index) => <article key={item.id}><em>{String(index + 1).padStart(2, "0")}</em><span><b>{item.title}</b><small>{item.text}</small></span><button onClick={item.action}>{item.label}<ArrowRight size={14} /></button></article>) : <div className="cost-analysis-empty"><b>完成成本和售价后，系统会给出下一步建议。</b></div>}</div></section>
    <section className="cost-analysis-actions"><button className="secondary-action" onClick={onPricing}><Sparkles size={17} /> 调整售价</button><button className="primary-action" onClick={onAddCost}><Plus size={18} /> 添加成本</button></section>
  </div>;
}

function SimulationControl({ label, value, unit, step, onChange, onAdjust }: { label: string; value: number; unit: string; step: number; onChange: (value: number) => void; onAdjust: (delta: number) => void }) {
  return <label><span>{label}</span><div><button type="button" aria-label={`减少${label}`} onClick={() => onAdjust(-step)}>−</button><input aria-label={`模拟${label}`} type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ""} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} /><small>{unit}</small><button type="button" aria-label={`增加${label}`} onClick={() => onAdjust(step)}>＋</button></div></label>;
}

export function QuickEntrySheet({ hasProducts, onClose, onChoose }: { hasProducts: boolean; onClose: () => void; onChoose: (kind: "sale" | "record" | "purchase" | "product") => void }) {
  const entries = [
    { kind: "sale" as const, icon: <ShoppingBag size={21} />, title: "卖商品", detail: hasProducts ? "记录销量，自动结转收入和成本" : "先新建商品，再记录销售", tone: "sale" },
    { kind: "record" as const, icon: <ReceiptText size={21} />, title: "记收支", detail: "房租、日常支出或其他收入", tone: "record" },
    { kind: "purchase" as const, icon: <PackagePlus size={21} />, title: "采购材料", detail: "更新材料成本，可同时记采购付款", tone: "purchase" },
    { kind: "product" as const, icon: <Plus size={21} />, title: "新建商品", detail: "先建商品，再补成本和设置售价", tone: "product" },
  ];
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet quick-entry-sheet" role="dialog" aria-modal="true" aria-label="记一笔" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">今天发生了什么</span><div className="sheet-title-lockup"><h2>记一笔</h2><BrandSignature tone="blue" compact /></div></div><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></header><p className="quick-entry-intro">选择最接近的一项，系统会带你进入对应表单，并保留收入、成本、库存和日期的核算规则。</p><div className="quick-entry-grid">{entries.map((entry) => <button className={`quick-entry-option ${entry.tone}`} type="button" key={entry.kind} onClick={() => onChoose(entry.kind)}><span className="quick-entry-icon">{entry.icon}</span><span><b>{entry.title}</b><small>{entry.detail}</small></span><ChevronRight size={17} /></button>)}</div></section></div>;
}

export function getRefundableSaleQuantity(sale: SalesRecord) { return Math.max(sale.quantity - (sale.refunds ?? []).reduce((sum, refund) => sum + Math.max(refund.quantity, 0), 0), 0); }

export function DeleteSaleSheet({ sale, product, onClose, onConfirm }: { sale?: SalesRecord; product?: LedgerProduct; onClose: () => void; onConfirm: () => void }) {
  if (!sale) return null;
  const refundAmount = (sale.refunds ?? []).reduce((total, refund) => total + Math.max(refund.amount, 0), 0);
  const restockedQuantity = (sale.refunds ?? []).filter((refund) => refund.restock).reduce((total, refund) => total + Math.max(refund.quantity, 0), 0);
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet sale-delete-sheet" role="dialog" aria-modal="true" aria-label="删除录入错误销售" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">录错删除</span><h2>删除这笔录入错误？</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="sale-refund-origin"><b>{product?.name ?? "已归档商品"}</b><small>{sale.date} · {sale.quantity} 件 · {formatCurrency(sale.quantity * sale.unitPrice)}</small>{refundAmount > 0 && <small>已退款 {formatCurrency(refundAmount)}，将一并删除退款记录。</small>}</div><div className="refund-impact"><span>仅用于录入错误</span><p>这会移除该笔销售及关联收款、退款和成本结转；若真实发生了客户退款，请返回销售记录选择“客户退款”，以保留业务事实。已启用库存时会恢复未通过退款恢复的库存 {Math.max(sale.quantity - restockedQuantity, 0)} 件。</p></div><button className="danger-action sheet-action" onClick={onConfirm}>确认删除录错</button></section></div>;
}

export function CashRecordsSheet({ period, records, onClose, onDelete }: { period: string; records: LedgerRecord[]; onClose: () => void; onDelete: (recordId: string) => void }) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const periodRecords = records.filter((record) => record.date.startsWith(period));
  const recordSource = (record: LedgerRecord) => record.source === "sale" || record.source === "refund" || record.category === "销售收入" || record.category === "销售退款";
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet cash-records-sheet" role="dialog" aria-modal="true" aria-label="本期现金流水明细" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">{formatBusinessPeriod(period)}</span><h2>现金流水明细</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="cost-setting-note"><Info size={17} /><p>每笔金额都来自已保存的流水。手工和采购流水可删除；销售和退款流水请在“销售记录”中退款或撤销，确保收入、成本和库存同步更正。</p></div>{periodRecords.length ? <div className="cash-record-list">{periodRecords.map((record) => { const linkedToSale = recordSource(record); const pending = pendingDeleteId === record.id; return <article className="cash-record-row" key={record.id}><div><span className={record.type === "income" ? "record-type income" : "record-type expense"}>{record.type === "income" ? "收款" : "付款"}</span><b>{record.category}</b><small>{record.date}{record.note ? ` · ${record.note}` : ""}{linkedToSale ? " · 由销售记录生成" : record.source === "purchase" ? " · 材料采购时记录" : " · 手工录入"}</small></div><div className="cash-record-action"><strong>{record.type === "income" ? "+" : "−"}{formatCurrency(record.amount)}</strong>{linkedToSale ? <small>请在销售记录中更正</small> : pending ? <span><button className="secondary-action" onClick={() => setPendingDeleteId(null)}>取消</button><button className="danger-action" onClick={() => onDelete(record.id)}>删除</button></span> : <button className="text-action" aria-label={`删除${record.category}流水`} onClick={() => setPendingDeleteId(record.id)}>删除</button>}</div></article>; })}</div> : <div className="message-empty"><ReceiptText size={22} /><b>本期暂无现金流水</b><small>从“记一笔”或材料采购开始记录。</small></div>}</section></div>;
}

export function BusinessView({ summary, productCount, period, onPeriodChange, onPricing, onRecord, onSale, onCashRecords, sales, products, onRefund, onDeleteSale }: { summary: ReturnType<typeof summarizeLedger>; productCount: number; period: string; onPeriodChange: (period: string) => void; onPricing: () => void; onRecord: () => void; onSale: () => void; onCashRecords: () => void; sales: SalesRecord[]; products: LedgerProduct[]; onRefund: (saleId: string) => void; onDeleteSale: (saleId: string) => void }) {
  const [showCashDetails, setShowCashDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [view, setView] = useState<"cash" | "analysis">("cash");
  const chartKey = summary.dailySeries.map((item) => `${item.label}:${item.income}:${item.expenses}`).join("|");
  const hasTrendData = summary.dailySeries.some((item) => item.income > 0 || item.expenses > 0);
  const materialTotal = Object.entries(summary.categoryTotals).filter(([category]) => /采购|进货|材料|货品/.test(category)).reduce((total, [, value]) => total + value, 0);
  const hiddenTotal = Math.max(summary.expenses - materialTotal, 0);
  const periodSales = sales.filter((sale) => sale.date.startsWith(period) || (sale.refunds ?? []).some((refund) => refund.date.startsWith(period))).slice(0, 6);
  const operatingExpenses = summary.allocatedIndirectCosts + summary.financingCosts;
  const operatingMargin = summary.profitReady && summary.salesRevenue > 0 ? summary.operatingResult / summary.salesRevenue * 100 : null;

  useEffect(() => {
    setIsRefreshing(true);
    const timer = window.setTimeout(() => setIsRefreshing(false), 420);
    return () => window.clearTimeout(timer);
  }, [chartKey]);

  return (
    <div className="page-content business-content">
      <section className="core-page-heading business-page-heading"><div><h1>经营</h1><p className="core-subtitle">看清利润、现金流和经营问题</p></div><PeriodPicker period={period} onChange={onPeriodChange} /></section>
      <section className={`business-profit-card ${summary.profitReady && summary.operatingResult < 0 ? "loss" : ""}`} aria-label="本期经营利润"><div className="business-profit-heading"><span>本期经营利润</span><span className="business-profit-rate">{operatingMargin === null ? "待结转" : `${operatingMargin.toFixed(1)}%`}<small>利润率</small></span></div><strong>{summary.profitReady ? formatCurrency(summary.operatingResult) : "—"}</strong><small className="business-profit-period">{formatBusinessPeriod(period)} · {summary.profitReady ? "来自已结转销售快照" : "记录商品销售后生成"}</small><div className="business-profit-breakdown"><span><small>销售收入</small><b>{formatCurrency(summary.salesRevenue)}</b></span><span><small>商品成本</small><b>{formatCurrency(summary.costOfSales)}</b></span><span><small>经营费用</small><b>{formatCurrency(operatingExpenses)}</b></span><i>=</i><span className="result"><small>经营利润</small><b>{summary.profitReady ? formatCurrency(summary.operatingResult) : "—"}</b></span></div></section>
      <div className="core-segmented business-view-switch" role="tablist" aria-label="经营查看口径"><button role="tab" aria-selected={view === "cash"} onClick={() => setView("cash")}>现金流</button><button role="tab" aria-selected={view === "analysis"} onClick={() => setView("analysis")}>利润分析</button></div>
      {view === "cash" && <>
      <section className={`cash-flow-card business-cash-summary ${isRefreshing ? "is-refreshing" : ""}`}>
        <div className="cash-flow-copy"><span>本期现金结余 <button className="micro-info" aria-label="查看现金口径说明" aria-expanded={showCashDetails} onClick={() => setShowCashDetails((current) => !current)}><Info size={13} /></button></span><h2>{formatCurrency(summary.cashBalance)}</h2><p>已收 {formatCurrency(summary.income)} · 已付 {formatCurrency(summary.cashOutflow)}</p>{showCashDetails && <div className="cash-flow-detail" role="status">这里仅统计实际收款和付款；本金影响现金，利息同时属于成本。</div>}<button className="text-action cash-records-link" onClick={onCashRecords}>查看流水明细<ChevronRight size={14} /></button></div><div className="cash-orbit" aria-hidden="true"><CircleDollarSign size={32} /><span>{isRefreshing ? "更新中" : "本期"}</span></div>
      </section>
      {!hasTrendData && !summary.salesCount ? <section className="analysis-readiness chart-card"><span className="eyebrow">准备度</span><h2>完成三步再看分析</h2><div className="analysis-steps"><span className={summary.incomeCount + summary.expenseCount ? "done" : ""}>1. 流水</span><span className={productCount ? "done" : ""}>2. 商品</span><span className={summary.salesCount ? "done" : ""}>3. 销售</span></div><button type="button" className="primary-action" onClick={summary.incomeCount + summary.expenseCount ? (productCount ? onSale : onRecord) : onRecord}>{summary.incomeCount + summary.expenseCount ? (productCount ? "记录第一笔销售" : "新建商品") : "记一笔"}<ArrowRight size={15} /></button></section> : <CashFlowChart series={summary.dailySeries} onRecord={onRecord} />}
      <section className="core-section-heading"><div><h2>现金明细</h2><small>本期已发生收付</small></div><button onClick={onCashRecords}>查看全部<ChevronRight size={14} /></button></section>
      <section className="ledger-lines" aria-label="本期已发生现金明细"><LineItem icon={<TrendingUp size={18} />} label="本期收款" value={formatCurrency(summary.income)} width={`${Math.min(summary.income / Math.max(summary.income, summary.cashOutflow, 1) * 100, 100)}%`} color="green" /><LineItem icon={<Coins size={18} />} label="本期付款" value={formatCurrency(summary.cashOutflow)} width={`${Math.min(summary.cashOutflow / Math.max(summary.income, summary.cashOutflow, 1) * 100, 100)}%`} color="blue" />{summary.principalRepayment > 0 && <LineItem icon={<WalletCards size={18} />} label="其中本金还款" value={formatCurrency(summary.principalRepayment)} width={`${Math.min(summary.principalRepayment / Math.max(summary.cashOutflow, 1) * 100, 100)}%`} color="amber" />}</section>
      <div className="business-actions"><button className="primary-action" onClick={onRecord}><Plus size={18} /> 记一笔收入</button><button className="secondary-action" onClick={onRecord}><ReceiptText size={18} /> 记一笔支出</button></div>
      </>}
      {view === "analysis" && <>
      <section className="cost-analysis-intro"><Info size={18} /><div><b>{summary.profitReady ? "销售收入 − 商品成本 − 经营费用 = 经营利润" : "本期还没有销售结转利润"}</b><p>{summary.profitReady ? "所有成本均按销售当时冻结的快照计算；实际现金收付请在“现金流”查看。" : "房租、人工等月度分摊可用于定价预估，但不是本期已付现金；记录销售后才会结转利润。"}</p></div></section>
      {summary.profitReady ? <><section className="sales-result-card"><div><span className="eyebrow">销售结转</span><h2>{summary.salesCount} 笔销售 · {summary.salesQuantity} 份</h2></div><div className="sales-result-grid"><span>销售收入 <b>{formatCurrency(summary.salesRevenue)}</b></span><span>销货成本 <b>{formatCurrency(summary.costOfSales)}</b></span><span>商品毛利 <b>{formatCurrency(summary.grossProfit)}</b></span><span>经营结果 <b>{formatCurrency(summary.operatingResult)}</b></span></div></section><ProfitBridgeChart summary={summary} /></> : <section className="analysis-readiness chart-card"><span className="eyebrow">利润准备度</span><h2>先记录一笔商品销售</h2><p>销售会将收入和当时的商品成本一起结转，之后这里才会显示利润。</p><button type="button" className="primary-action" onClick={productCount ? onSale : onRecord}>{productCount ? "记录第一笔销售" : "先新建商品"}<ArrowRight size={15} /></button></section>}
      {periodSales.length > 0 && <section className="sales-history-card"><div className="section-heading compact"><div><span className="eyebrow">销售记录</span><h2>客户退款或录错删除</h2></div></div><div className="sales-history-list">{periodSales.map((sale) => { const product = products.find((item) => item.id === sale.productId); const remaining = getRefundableSaleQuantity(sale); const refunded = (sale.refunds ?? []).reduce((sum, refund) => sum + refund.amount, 0); return <article className="sales-history-row" key={sale.id}><div><b>{product?.name ?? "已归档商品"}</b><small>{sale.date} · {sale.quantity} 件 · {formatCurrency(sale.quantity * sale.unitPrice)}{refunded > 0 ? ` · 已退 ${formatCurrency(refunded)}` : ""}</small></div><div className="sales-history-actions">{remaining > 0 ? <button onClick={() => onRefund(sale.id)}>客户退款 <ChevronRight size={14} /></button> : <span className="sale-voided">已撤销</span>}<button className="sale-delete-action" aria-label={`删除${product?.name ?? "销售"}录入`} onClick={() => onDeleteSale(sale.id)}><Trash2 size={14} />录错删除</button></div></article>; })}</div></section>}
      <section className="section-heading compact"><div><span className="eyebrow">成本</span><h2>{formatBusinessPeriod(period)}销售快照成本</h2></div></section>
      <section className="ledger-lines">
        <LineItem icon={<Coins size={18} />} label="已结转直接成本" value={formatCurrency(summary.costOfSales)} width={`${Math.min(summary.costOfSales / Math.max(summary.salesRevenue, summary.costOfSales, 1) * 100, 100)}%`} color="blue" />
        {summary.allocatedIndirectCosts > 0 && <LineItem icon={<Banknote size={18} />} label="已结转间接分摊" value={formatCurrency(summary.allocatedIndirectCosts)} width={`${Math.min(summary.allocatedIndirectCosts / Math.max(summary.salesRevenue, 1) * 100, 100)}%`} color="navy" />}
        {summary.financingCosts > 0 && <LineItem icon={<WalletCards size={18} />} label="已结转资金成本" value={formatCurrency(summary.financingCosts)} width={`${Math.min(summary.financingCosts / Math.max(summary.salesRevenue, 1) * 100, 100)}%`} color="amber" />}
      </section>
      <div className="business-actions"><button className="secondary-action" onClick={onSale}><ReceiptText size={18} /> 记销售并结转成本</button><button className="secondary-action" onClick={onPricing}><Sparkles size={18} /> 看看商品是否需要调价</button></div>
      </>}
    </div>
  );
}

export function ProfileView({ storeName, industry, template = resolveIndustryTemplate(industry), categories, categoryStatus, productCount = 0, user, authLoading, backupAt, cloudAvailable, onLogin, onLogout, isLoggingOut, onDataManagement, onAdminMessages, onIndustryChange, onAddCategory, onEditCategory, onToggleCategory, onHiddenCost, onDebt, onMonthlyReport, onProducts }: { storeName: string; industry: IndustryKey; template?: IndustryTemplate; categories: string[]; categoryStatus?: Record<string, boolean>; productCount?: number; user: { name: string | null; role: "admin" | "user" } | null; authLoading: boolean; backupAt?: Date; cloudAvailable: boolean; onLogin: () => void; onLogout: () => Promise<unknown>; isLoggingOut: boolean; onDataManagement: () => void; onAdminMessages?: () => void; onIndustryChange: (industry: IndustryKey) => void; onAddCategory: () => void; onEditCategory: (category: string) => void; onToggleCategory: (category: string) => void; onHiddenCost: () => void; onDebt: () => void; onMonthlyReport?: () => void; onProducts?: () => void }) {
  const industryName = template.label;
  const [expandedPanel, setExpandedPanel] = useState<"industry" | "categories" | null>(null);
  const activeCategoryCount = categories.filter((category) => categoryStatus?.[category] !== false).length;
  return (
    <div className="page-content profile-content">
      <section className="profile-store-card" aria-label="店铺资料"><div className="profile-mark"><BrandMark size={54} /></div><div><div className="profile-store-title"><h1>{storeName}</h1><span>{industryName}</span></div><small>店铺账本 · {user ? "已登录" : "本机使用"}</small></div><button className="profile-store-arrow" onClick={onDataManagement} aria-label="查看店铺资料"><ChevronRight size={20} /></button></section>
      <section className="account-status-card" aria-label="账户与数据"><div className="account-status-icon">{user ? <ShieldCheck size={21} /> : <Cloud size={21} />}</div><div className="account-status-copy"><b>{authLoading ? "检查账户状态" : user ? (user.name || "已登录账号") : "本机账本"}</b><small>{authLoading ? "请稍候" : user ? (cloudAvailable && backupAt ? `最近备份：${new Date(backupAt).toLocaleDateString("zh-CN")}` : "尚未创建云端备份") : "登录后可备份并在新设备恢复"}</small></div>{user ? <button className="text-action" onClick={onDataManagement}>账户与安全<ChevronRight size={15} /></button> : <button className="account-login" onClick={onLogin}><LogIn size={15} />登录并备份</button>}</section>
      {user && <button className="account-logout" onClick={() => void onLogout()} disabled={isLoggingOut}><LogOut size={15} />{isLoggingOut ? "正在退出" : "退出账号"}</button>}
      <section className="profile-section"><div className="core-section-heading"><h2>经营管理</h2><span>影响后续录入</span></div><div className="profile-management-grid"><button className={expandedPanel === "industry" ? "active" : ""} onClick={() => setExpandedPanel((current) => current === "industry" ? null : "industry")}><span className="profile-grid-icon industry"><ShoppingBag size={19} /></span><b>经营行业</b><small>{industryName}</small></button><button className={expandedPanel === "categories" ? "active" : ""} onClick={() => setExpandedPanel((current) => current === "categories" ? null : "categories")}><span className="profile-grid-icon category"><ClipboardList size={19} /></span><b>成本项目</b><small>{activeCategoryCount} 个启用</small></button><button onClick={onHiddenCost}><span className="profile-grid-icon allocation"><ReceiptText size={19} /></span><b>分摊规则</b><small>工时、销售额或产量</small></button><button onClick={onDebt}><span className="profile-grid-icon funding"><WalletCards size={19} /></span><b>资金成本</b><small>利息和融资费</small></button></div>{expandedPanel === "industry" && <div className="profile-expand-panel"><div className="profile-expand-heading"><b>选择经营行业</b><small>只影响以后新录入，不改变历史账本。</small></div><div className="industry-switcher" role="list" aria-label="选择行业模板">{INDUSTRY_TEMPLATES.map((item) => <button key={item.key} className={item.key === industry ? "industry-switch-card active" : "industry-switch-card"} onClick={() => onIndustryChange(item.key)}><span className="industry-switch-symbol">{item.shortLabel.slice(0, 1)}</span><span><b>{item.label}</b><small>{item.description}</small></span>{item.key === industry && <CheckBadge />}</button>)}</div></div>}{expandedPanel === "categories" && <div className="profile-expand-panel"><div className="profile-expand-heading"><b>成本项目</b><button className="text-action" onClick={onAddCategory}><Plus size={14} />新增</button></div><div className="custom-category-list">{categories.map((category) => { const active = categoryStatus?.[category] !== false; return <div className={active ? "custom-category-row" : "custom-category-row disabled"} key={category}><button className="category-name-button" onClick={() => onEditCategory(category)}><span>{category}</span><small>{active ? "启用" : "停用"}</small></button><button className="category-toggle" aria-label={`${active ? "停用" : "启用"}${category}`} onClick={() => onToggleCategory(category)}>{active ? "停用" : "启用"}</button><ChevronRight size={16} /></div>; })}</div></div>}</section>
      <section className="profile-section"><div className="core-section-heading"><h2>数据管理</h2><span>导出、备份与分析</span></div><div className="profile-data-grid"><button onClick={() => onMonthlyReport?.()}><span className="profile-grid-icon report"><BookOpenCheck size={20} /></span><b>成本报表</b><small>完整成本分析</small></button>{onProducts && <button onClick={onProducts}><span className="profile-grid-icon products"><LayoutGrid size={20} /></span><b>商品管理</b><small>{productCount} 个商品</small></button>}<button onClick={onDataManagement}><span className="profile-grid-icon backup"><Cloud size={20} /></span><b>数据备份</b><small>{cloudAvailable ? "云端可恢复" : "数据安全"}</small></button><button onClick={onDataManagement}><span className="profile-grid-icon export"><Download size={20} /></span><b>导出数据</b><small>JSON 与报表</small></button></div></section>
      <section className="profile-section profile-system-section"><div className="core-section-heading"><h2>系统设置</h2><span>账户与账本</span></div><SettingItem icon={<Settings2 size={19} />} label="账本设置" note="备份、恢复与本机数据" onClick={onDataManagement} /><SettingItem icon={user ? <ShieldCheck size={19} /> : <LogIn size={19} />} label="账号与安全" note={user ? "登录状态与数据保护" : "登录后可备份和恢复"} onClick={user ? onDataManagement : onLogin} />{user?.role === "admin" && <SettingItem icon={<Send size={19} />} label="商户消息" note="创建、发布与撤回" onClick={() => onAdminMessages?.()} />}<p className="profile-version">算得清成本核算助手 · 当前版本以本机账本为准</p></section>
    </div>
  );
}


export function DataManagementSheet({ isAuthenticated, cloudAvailable, backupAt, isBackingUp, onClose, onLogin, onBackup, onRestoreCloud, onExport, onImport, onClearLocal }: { isAuthenticated: boolean; cloudAvailable: boolean; backupAt?: Date; isBackingUp: boolean; onClose: () => void; onLogin: () => void; onBackup: () => Promise<void>; onRestoreCloud: () => void; onExport: () => void; onImport: (content: string) => void; onClearLocal: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"backup" | "restore" | "import" | "clear" | null>(null);
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
    if (confirmAction === "clear") onClearLocal();
    setConfirmAction(null);
  };
  const title = confirmAction === "backup" ? "用本机账本替换云端备份？" : confirmAction === "restore" ? "用云端账本覆盖本机？" : confirmAction === "clear" ? "清空当前设备的全部账本数据？" : "用导入账本覆盖本机？";
  const detail = confirmAction === "backup" ? "云端旧备份将被替换，但当前设备账本不变。" : confirmAction === "clear" ? "商品、材料、流水、销售、退款、各项成本与月度分摊都会删除，并回到首次建账页。已存在的云端备份不会自动删除。" : "当前设备账本将被替换；两份账本不会自动合并。";
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet data-management-sheet" role="dialog" aria-modal="true" aria-label="数据管理" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">数据与安全</span><h2>账本备份与恢复</h2></div><button className="icon-button" onClick={onClose}>×</button></header><section className="data-management-section"><div className="data-management-heading"><b>日常备份与恢复</b><small>优先使用这两项保护账本</small></div>{isAuthenticated ? <><div className="data-state"><Cloud size={18} /><span><b>{cloudAvailable ? "云端备份可恢复" : "尚未备份"}</b><small>{cloudAvailable && backupAt ? `最近备份：${new Date(backupAt).toLocaleString("zh-CN")}` : "先备份当前设备账本"}</small></span></div><button className="primary-action sheet-action" disabled={isBackingUp} onClick={() => cloudAvailable ? setConfirmAction("backup") : void onBackup()}><Cloud size={16} />{isBackingUp ? "正在备份" : "备份当前账本"}</button>{cloudAvailable && <button className="secondary-action sheet-action" onClick={() => setConfirmAction("restore")}><Download size={16} />用云端账本覆盖本机</button>}</> : <><div className="data-state"><ShieldCheck size={18} /><span><b>当前为本机账本</b><small>登录后才可创建云端备份；不会自动上传。</small></span></div><button className="primary-action sheet-action" onClick={onLogin}><LogIn size={16} />登录并备份</button></>}</section><section className="data-management-section advanced"><div className="data-management-heading"><b>高级数据操作</b><small>导入和清空会覆盖或删除当前设备数据</small></div><button className="secondary-action sheet-action" onClick={onExport}><Download size={16} />导出本机账本 JSON</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => importFile(event.target.files?.[0])} /><button className="secondary-action sheet-action" onClick={() => fileRef.current?.click()}><Upload size={16} />导入并覆盖本机账本</button><button className="danger-action sheet-action" onClick={() => setConfirmAction("clear")}>清空当前设备账本</button><p className="data-warning">清空只作用于当前设备；已存在的云端备份不会自动删除。</p></section>{confirmAction && <div className="data-confirmation"><b>{title}</b><p>{detail}</p><div><button className="secondary-action" onClick={() => setConfirmAction(null)}>取消</button><button className={confirmAction === "clear" ? "danger-action" : "primary-action"} onClick={() => void confirm()}>{confirmAction === "clear" ? "确认清空" : "确认继续"}</button></div></div>}{error && <p className="form-error" role="alert">{error}</p>}</section></div>;
}

function IndustryChangeSheet({ current, next, onClose, onConfirm }: { current: IndustryKey; next: IndustryKey; onClose: () => void; onConfirm: () => void }) {
  const currentTemplate = resolveIndustryTemplate(current);
  const nextTemplate = resolveIndustryTemplate(next);
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet industry-change-sheet" role="dialog" aria-modal="true" aria-label="确认切换行业" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">经营资料</span><h2>切换为{nextTemplate.label}</h2></div><button className="icon-button" onClick={onClose}>×</button></header><p className="industry-change-lead">从{currentTemplate.label}切换后，只影响之后的新录入。</p><div className="impact-list"><p><b>将改变</b> 默认成本分类、商品成本名称、快速成本预设和模板隐形成本分类。</p><p><b>不会改变</b> 已有商品、材料、流水、销售、成本版本和自定义成本口径。</p></div><button className="primary-action sheet-action" onClick={onConfirm}><CheckBadge />确认切换行业</button></section></div>;
}

type InboxMessage = { id: number; title: string; summary: string; body: string | null; level: MessageLevel; actionLabel: string | null; actionPath: string | null; publishedAt: Date | null; expiresAt?: Date | null; readAt: Date | null; createdAt: Date };

const messageLevelFilters: { value: MessageLevel | "all"; label: string }[] = [{ value: "all", label: "全部" }, { value: "safety", label: "账本安全" }, { value: "important", label: "重要公告" }, { value: "update", label: "产品更新" }, { value: "info", label: "服务消息" }];

export function ImportantMessageBanner({ message, onDismiss, onOpen }: { message: InboxMessage; onDismiss: () => void; onOpen: () => void }) {
  return <aside className="important-message-banner" aria-label="重要公告"><span className="message-level important">重要公告</span><div><b>{message.title}</b><p>{message.summary}</p></div><button onClick={onOpen}>查看</button><button className="banner-dismiss" aria-label="关闭重要公告" onClick={onDismiss}>×</button></aside>;
}

export function MessageInboxSheet({ isAuthenticated, loading, messages, unreadCount, operatingReminders = [], levelFilter, onLevelFilterChange, initialMessage, onClose, onLogin, onMarkRead, onMarkAll, onAction }: { isAuthenticated: boolean; loading: boolean; messages: InboxMessage[]; unreadCount: number; operatingReminders?: ReturnType<typeof getOperatingReminders>; levelFilter?: MessageLevel | "all"; onLevelFilterChange?: (level: MessageLevel | "all") => void; initialMessage?: InboxMessage | null; onClose: () => void; onLogin: () => void; onMarkRead: (id: number) => void; onMarkAll: () => void; onAction: (path?: string | null) => void }) {
  const [activeMessage, setActiveMessage] = useState<InboxMessage | null>(initialMessage ?? null);
  useEffect(() => { if (initialMessage) setActiveMessage(initialMessage); }, [initialMessage?.id]);
  const openMessage = (message: InboxMessage) => {
    if (!message.readAt) onMarkRead(message.id);
    setActiveMessage({ ...message, readAt: message.readAt ?? new Date() });
  };
  const operatingSection = operatingReminders.length ? <section className="operating-reminder-list" aria-label="经营提醒"><div><span className="eyebrow">根据本机账本</span><h3>经营提醒</h3><small>不计入未读，不会发送给他人。</small></div>{operatingReminders.map((reminder) => <article className={reminder.severity} key={reminder.id}><AlertTriangle size={16} /><span><b>{reminder.title}</b><small>{reminder.summary}</small></span><button onClick={() => onAction(reminder.action === "products" ? "/?tab=products" : reminder.action === "business" ? "/?tab=business" : "/?action=sale")}>{reminder.actionLabel}<ChevronRight size={14} /></button></article>)}</section> : null;
  const serverContent = !isAuthenticated ? <div className="message-empty"><BellRing size={22} /><b>登录后查看服务消息</b><small>运营通知只会展示给对应的已登录商户。</small><button className="primary-action" onClick={onLogin}><LogIn size={16} />登录查看</button></div> : activeMessage ? <article className="message-detail"><button className="message-back" onClick={() => setActiveMessage(null)}>‹ 返回消息列表</button><span className={`message-level ${activeMessage.level}`}>{getMessageLevelLabel(activeMessage.level)}</span><h3>{activeMessage.title}</h3><time>{new Date(activeMessage.publishedAt ?? activeMessage.createdAt).toLocaleString("zh-CN")}</time><p className="message-detail-summary">{activeMessage.summary}</p><div className="message-detail-body">{activeMessage.body?.trim() || "暂无更多说明。"}</div>{activeMessage.actionLabel && <button className="primary-action message-detail-action" onClick={() => onAction(activeMessage.actionPath)}>{activeMessage.actionLabel}<ChevronRight size={16} /></button>}</article> : loading ? <div className="message-empty"><span className="loading-sweep" />正在加载消息</div> : <><div className="message-inbox-meta"><span>{unreadCount ? `${unreadCount} 条未读` : "已全部读完"}</span>{unreadCount > 0 && <button onClick={onMarkAll}>全部已读</button>}</div><div className="message-filter-row" role="group" aria-label="按重要等级筛选消息">{messageLevelFilters.map((filter) => <button className={(levelFilter ?? "all") === filter.value ? "selected" : ""} key={filter.value} onClick={() => onLevelFilterChange?.(filter.value)}>{filter.label}</button>)}</div>{!messages.length ? <div className="message-empty"><BellRing size={22} /><b>这个等级暂无有效消息</b><small>过期或已撤回的消息不会在这里显示。</small></div> : <div className="message-list">{messages.map((message) => <article className={message.readAt ? "message-card" : "message-card unread"} key={message.id}><button className="message-copy" onClick={() => openMessage(message)}><span className={`message-level ${message.level}`}>{getMessageLevelLabel(message.level)}</span><b>{message.title}</b><p>{message.summary}</p><small>{new Date(message.publishedAt ?? message.createdAt).toLocaleString("zh-CN")}</small></button><button className="message-action" onClick={() => openMessage(message)}>详情<ChevronRight size={14} /></button></article>)}</div>}</>;
  const content = activeMessage ? serverContent : <>{operatingSection}{serverContent}</>;
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
  const editingConversion = editingMaterial?.conversionFactor ?? 1;
  const editingQuantity = editingMaterial?.purchaseQuantity ?? (editingMaterial ? 1 : undefined);
  const editingAmount = editingMaterial?.purchaseAmount ?? (editingMaterial ? editingMaterial.unitCost * editingConversion * (editingQuantity ?? 1) : undefined);
  const derivedEditFallback = Boolean(editingMaterial && editingMaterial.purchaseAmount === undefined);
  const [name, setName] = useState(editingMaterial?.name ?? "");
  const [amount, setAmount] = useState(editingAmount !== undefined ? String(editingAmount) : "");
  const [quantity, setQuantity] = useState(editingQuantity !== undefined ? String(editingQuantity) : "");
  const [purchaseUnit, setPurchaseUnit] = useState(editingMaterial?.purchaseUnit ?? editingMaterial?.unit ?? "");
  const [usageUnit, setUsageUnit] = useState(editingMaterial?.unit ?? "");
  const [conversionFactor, setConversionFactor] = useState(editingMaterial ? String(editingConversion) : "");
  const [recordPurchase, setRecordPurchase] = useState(!editingMaterial);
  const [businessDate, setBusinessDate] = useState(getBusinessDate);
  const [validationError, setValidationError] = useState<string | null>(null);
  const purchaseAmount = Number(amount);
  const purchaseQuantity = Number(quantity);
  const sameUnit = Boolean(purchaseUnit && usageUnit && purchaseUnit === usageUnit);
  const requiresConversion = Boolean(purchaseUnit && usageUnit && !sameUnit);
  const factor = sameUnit ? 1 : Number(conversionFactor);
  const validNumbers = Number.isFinite(purchaseAmount) && purchaseAmount > 0 && Number.isFinite(purchaseQuantity) && purchaseQuantity > 0 && Number.isFinite(factor) && factor > 0;
  const unitCost = validNumbers ? calculateUnitCost(purchaseAmount, purchaseQuantity, factor) : 0;
  const save = () => {
    if (!purchaseUnit || !usageUnit) { setValidationError("请选择采购单位和使用单位。 "); return; }
    const error = validateMaterialDraft({ name, amount: purchaseAmount, quantity: purchaseQuantity, conversionFactor: factor, requiresConversion });
    if (error) { setValidationError(error); return; }
    const source = sameUnit ? `采购${purchaseQuantity}${purchaseUnit}，采购与使用单位相同，按1:1换算` : `采购${purchaseQuantity}${purchaseUnit}，每${purchaseUnit}折算${factor}${usageUnit}`;
    const material = { id: editingMaterial?.id ?? makeId(), name: name.trim(), unit: usageUnit, unitCost, source, purchaseUnit, conversionFactor: factor, purchaseAmount, purchaseQuantity };
    if (editingMaterial) onSave(material);
    else onSave(material, { amount: purchaseAmount, recordPurchase, date: businessDate });
  };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">材料</span><h2>{editingMaterial ? "编辑材料" : "新增材料"}</h2></div><button className="icon-button" onClick={onClose}>×</button></header>{derivedEditFallback && <div className="cost-setting-note"><Info size={16} /><p>这项旧材料未保存原采购明细，已按当前单位成本换算为等价数据；修改后会保存真实采购字段。</p></div>}<label className="field-block"><span>材料名称</span><div className="money-input"><input value={name} placeholder={suggestion ? `例如：${suggestion.name}` : "例如：瓶装饮用水"} onChange={(event) => { setName(event.target.value); setValidationError(null); }} /><b>名称</b></div></label><div className="two-fields"><label className="field-block"><span>采购金额</span><div className="money-input"><input aria-label="材料采购金额" type="number" min="0.01" step="0.01" value={amount} placeholder="例如 120" onChange={(event) => { setAmount(event.target.value); setValidationError(null); }} /><b>元</b></div></label><label className="field-block"><span>采购数量</span><div className="money-input"><input aria-label="材料采购数量" type="number" min="0.01" step="0.01" value={quantity} placeholder="例如 24" onChange={(event) => { setQuantity(event.target.value); setValidationError(null); }} /><b>{purchaseUnit || "单位"}</b></div></label></div><div className="two-fields"><label className="field-block"><span>采购单位</span><select aria-label="材料采购单位" value={purchaseUnit} onChange={(event) => { setPurchaseUnit(event.target.value); setValidationError(null); }}><option value="">请选择</option><option value="盒">盒</option><option value="箱">箱</option><option value="袋">袋</option><option value="瓶">瓶</option></select></label><label className="field-block"><span>使用单位</span><select aria-label="材料使用单位" value={usageUnit} onChange={(event) => { setUsageUnit(event.target.value); setValidationError(null); }}><option value="">请选择</option><option value="个">个</option><option value="瓶">瓶</option><option value="克">克</option><option value="毫升">毫升</option><option value="套">套</option></select></label></div>{requiresConversion && <label className="field-block"><span>每{purchaseUnit}折算</span><div className="money-input"><input aria-label="材料换算系数" type="number" min="0.0001" step="0.0001" value={conversionFactor} placeholder="例如 24" onChange={(event) => { setConversionFactor(event.target.value); setValidationError(null); }} /><b>{usageUnit}</b></div></label>}{!editingMaterial && <label className="field-block business-date-field"><span>业务日期</span><input aria-label="采购业务日期" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></label>}<div className="material-preview"><span>单位成本</span><strong>{validNumbers && usageUnit ? `${formatCurrency(unitCost)} / ${usageUnit}` : "填写后自动计算"}</strong><p>{sameUnit ? "金额 ÷ 数量（同单位按1:1换算）" : "金额 ÷ 数量 ÷ 换算"}</p></div>{!editingMaterial && <label className="material-cash-toggle"><input type="checkbox" checked={recordPurchase} onChange={(event) => setRecordPurchase(event.target.checked)} /><span><b>同时记采购支出</b><small>影响选定月份现金；取消则只更新成本。</small></span></label>}{validationError && <p className="form-error" role="alert">{validationError}</p>}<button className="primary-action sheet-action" onClick={save}><CheckBadge /> {editingMaterial ? "保存修改" : "保存材料"}</button></section></div>;
}

export function SalesRecordSheet({ products, onClose, onSave }: { products: LedgerProduct[]; onClose: () => void; onSave: (sale: SalesRecord) => void }) {
  const [productId, setProductId] = useState(products[0]?.id ?? 0);
  const selected = products.find((product) => product.id === productId) ?? products[0];
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(String(selected?.price ?? 0));
  const [date, setDate] = useState(getBusinessDate);
  const [error, setError] = useState<string | null>(null);
  const previewQuantity = Math.max(Number(quantity) || 0, 0);
  const previewPrice = Math.max(Number(unitPrice) || 0, 0);
  const previewRevenue = previewQuantity * previewPrice;
  const previewUnitCost = Math.max(selected?.operating ?? 0, selected?.direct ?? 0, 0);
  const previewCost = previewQuantity * previewUnitCost;
  const previewProfit = previewRevenue - previewCost;
  const previewMargin = previewRevenue > 0 ? previewProfit / previewRevenue * 100 : null;
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
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet material-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">销售</span><h2>记录销售</h2></div><button className="icon-button" onClick={onClose}>×</button></header><label className="field-block"><span>商品</span><select value={productId} onChange={(event) => { const nextId = Number(event.target.value); setProductId(nextId); const next = products.find((product) => product.id === nextId); setUnitPrice(String(next?.price ?? 0)); setError(null); }}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>{selected?.stockQuantity !== undefined && <p className="record-category-hint">当前可售库存：{selected.stockQuantity}</p>}<div className="two-fields"><label className="field-block"><span>数量</span><div className="money-input"><input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(null); }} /><b>份</b></div></label><label className="field-block"><span>成交价</span><div className="money-input"><input aria-label="销售成交价" type="number" min="0.01" step="0.01" value={unitPrice} onChange={(event) => { setUnitPrice(event.target.value); setError(null); }} /><b>元</b></div></label></div><label className="field-block business-date-field"><span>业务日期</span><input aria-label="销售业务日期" type="date" value={date} onChange={(event) => { setDate(event.target.value); setError(null); }} /></label>{selected?.price <= 0 && <p className="record-category-hint">该商品尚未定价，请先设置售价后再结转。</p>}<section className="sale-profit-preview" aria-label="本次销售预计经营反馈"><div><span>预计收入</span><b>{formatCurrency(previewRevenue)}</b></div><div><span>预计完整成本</span><b>{formatCurrency(previewCost)}</b></div><div className={previewProfit < 0 ? "loss" : "profit"}><span>预计经营贡献</span><b>{formatCurrency(previewProfit)}</b></div><div><span>预计毛利率</span><b>{previewMargin === null ? "—" : `${previewMargin.toFixed(1)}%`}</b></div><p>按当前单件经营成本估算；保存后会冻结当时成本快照，实际利润以已结转销售为准。</p></section>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action sheet-action" onClick={save}><CheckBadge /> 保存并结转</button></section></div>;
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
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet sale-refund-sheet" role="dialog" aria-modal="true" aria-label="客户退款" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">客户退款</span><h2>记录客户退款</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="sale-refund-origin"><b>{product?.name ?? "已归档商品"}</b><small>原销售：{sale.date} · {sale.quantity} 件 · {formatCurrency(sale.quantity * sale.unitPrice)}</small><small>还可退款：{remainingQuantity} 件 · {formatCurrency(remainingAmount)}</small></div><div className="two-fields"><label className="field-block"><span>退款数量</span><div className="money-input"><input aria-label="退款数量" type="number" min="0.01" max={remainingQuantity} step="0.01" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(null); }} /><b>件</b></div></label><label className="field-block"><span>退款金额</span><div className="money-input"><input aria-label="退款金额" type="number" min="0.01" max={remainingAmount} step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setError(null); }} /><b>元</b></div></label></div><label className="field-block business-date-field"><span>退款日期</span><input aria-label="退款业务日期" type="date" value={date} onChange={(event) => { setDate(event.target.value); setError(null); }} /></label>{product?.stockQuantity !== undefined ? <label className="material-cash-toggle"><input type="checkbox" checked={restock} onChange={(event) => setRestock(event.target.checked)} /><span><b>商品已退回可售库存</b><small>{restock ? `确认后将恢复 ${quantity || 0} 件库存。` : "仅退款，不恢复库存。"}</small></span></label> : <p className="record-category-hint">该商品尚未启用库存台账；本次仅回滚收入和成本，不虚构库存数量。</p>}<div className="refund-impact"><span>退款后将</span><p>冲减本次销售收入与对应成本，并按退款日期重新计算经营利润。原销售与当时成本快照会保留；若全额退款，系统会自动标为“已撤销”。</p></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="danger-action sheet-action" onClick={save}>{isFullVoid ? "确认全额退款并标为撤销" : "确认客户退款"}</button></section></div>;
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
