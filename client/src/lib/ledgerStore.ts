/** 商户账簿工作台：以本地账本服务集中管理店铺、材料、BOM与流水，页面不散写业务数据。 */
import { DEFAULT_INDUSTRY_KEY, getOfficialIndustryTemplate, INDUSTRY_TEMPLATES, INDUSTRY_TEMPLATE_VERSION, normalizeIndustryTemplateOverrides, resolveIndustryTemplate } from "./industryTemplates";
import type { IndustryKey, IndustryTemplate, IndustryTemplateUserOverrides } from "./industryTemplates";

export { DEFAULT_INDUSTRY_KEY, getOfficialIndustryTemplate, INDUSTRY_TEMPLATES, INDUSTRY_TEMPLATE_VERSION, normalizeIndustryTemplateOverrides, resolveIndustryTemplate } from "./industryTemplates";
export type { IndustryCapabilities, IndustryCostItem, IndustryKey, IndustryMetric, IndustryMetricKey, IndustryTemplate, IndustryTemplateUserOverrides } from "./industryTemplates";

export type Material = {
  id: string;
  name: string;
  /** 使用单位，例如克、毫升、个；unitCost 始终按使用单位计价。 */
  unit: string;
  unitCost: number;
  source: string;
  purchaseUnit?: string;
  conversionFactor?: number;
  /** 新版材料保留原始采购数据，便于编辑时回填；旧材料缺失时仍兼容。 */
  purchaseAmount?: number;
  purchaseQuantity?: number;
};

export type BomItem = {
  id: string;
  /** 材料行使用 materialId；自定义成本行留空并填写 customName/unitCost。 */
  materialId: string;
  quantity: number;
  customName?: string;
  customUnit?: string;
  customUnitCost?: number;
  /** 区分行业快速成本预设与用户在进阶模式自行建立的明细，旧数据保持为空。 */
  presetId?: "quick-primary" | "quick-secondary";
};

export type LedgerProduct = {
  id: number;
  name: string;
  category: string;
  /** 商品成本在经营账中的归类；未设置时沿用行业默认。 */
  costCategory?: string;
  price: number;
  direct: number;
  operating: number;
  change: string;
  packaging: number;
  directLabor: number;
  bom: BomItem[];
  lossRate?: number;
  batchYield?: number;
  bomVersions?: BomVersion[];
  materialUnitCosts?: Record<string, number>;
  /** 已发生销售的商品仅归档，保留历史销售的商品引用与成本快照。 */
  archivedAt?: string;
  /** 启用后才参与销售扣减与退款恢复；未设置代表当前账本尚未建立库存台账。 */
  stockQuantity?: number;
};

export type AllocationMethod = "output" | "hours" | "revenue";

export type EquipmentDepreciation = {
  id: string;
  name: string;
  purchasePrice: number;
  usefulLifeMonths: number;
};

export type MonthlyFixedCosts = {
  rent: number;
  fullTimeLabor: number;
  utilities: number;
  propertyInternet: number;
  softwareServer: number;
  officeMisc: number;
  other: number;
  equipment: EquipmentDepreciation[];
};

export type ProductAllocationInput = {
  productId: number;
  outputQuantity: number;
  unitHours: number;
  salesAmount: number;
  weight: number;
};

export type MonthlyIndirectCostPlan = {
  id: string;
  period: string;
  /** 费用在本月开始与结束生效的业务日期；旧计划缺失时兼容为整月。 */
  effectiveFrom?: string;
  effectiveTo?: string;
  /** 整月金额可作为预算全额使用，或按有效天数折算为本期实际计入金额。 */
  costTiming?: "fullMonth" | "prorated";
  method: AllocationMethod;
  totalProductionHours: number;
  fixedCosts: MonthlyFixedCosts;
  products: ProductAllocationInput[];
  updatedAt: string;
};

export type ProductIndirectAllocation = {
  productId: number;
  totalIndirectCost: number;
  unitIndirectCost: number;
  allocationBasis: number;
  totalBasis: number;
  allocationShare: number;
  outputQuantity: number;
  salesAmount: number;
  effectiveDays: number;
  daysInPeriod: number;
  timeFactor: number;
};

export type UnitIndirectCostDetail = {
  label: string;
  monthlyAmount: number;
  unitAmount: number;
};

export type UnitCostDetail = {
  label: string;
  unitAmount: number;
  source: string;
};

export type LedgerRecord = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  date: string;
  /** 新流水的业务来源；销售与退款必须通过对应销售记录更正，避免现金与成本快照脱节。 */
  source?: "manual" | "purchase" | "sale" | "refund";
  sourceId?: string;
};

export type SalesRecord = {
  id: string;
  productId: number;
  quantity: number;
  unitPrice: number;
  date: string;
  note: string;
  costVersionId?: string;
  unitDirectCostSnapshot?: number;
  fixedCostSnapshot?: number;
  hiddenCostSnapshot?: number;
  /** 隐形成本快照的来源和分摊规则；ledger 代表期间流水总额，仅能在期间内计入一次。 */
  hiddenCostSourceSnapshot?: "manual" | "ledger";
  hiddenCostBasisSnapshot?: "perUnit" | "perSale";
  fundingCostSnapshot?: number;
  fundingSourceSnapshot?: "manual" | "ledger";
  costPeriod?: string;
  /** 月度分摊功能启用后冻结的每件间接成本；存在时优先于旧固定/隐形成本快照。 */
  allocatedIndirectCostSnapshot?: number;
  allocationMethodSnapshot?: AllocationMethod;
  allocationPlanPeriod?: string;
  status?: "completed" | "voided";
  voidedAt?: string;
  voidedDate?: string;
  refunds?: SaleRefund[];
};

export type SaleRefund = {
  id: string;
  quantity: number;
  amount: number;
  date: string;
  note: string;
  restock?: boolean;
};

export type BomVersion = {
  id: string;
  effectiveFrom: string;
  items: BomItem[];
  lossRate: number;
  batchYield: number;
  materialUnitCosts: Record<string, number>;
  packaging: number;
  directLabor: number;
  directCost: number;
  operatingCost: number;
  /** 快速成本和进阶明细分别保留来源，便于用户恢复更细的材料版本。 */
  entryMode?: "quick" | "advanced";
};

export type LedgerCosts = {
  fixedCost: number;
  hiddenCost: number;
  /** 本期房租、水电、人工等间接费用明细；汇总后按指定件数分摊为 hiddenCost。 */
  hiddenCostItems?: HiddenCostItem[];
  hiddenCostAllocationUnits?: number;
  hiddenCostBasis?: "perUnit" | "perSale";
  hiddenCostSource?: "manual" | "ledger";
  hiddenCostCategory?: string;
  /** 模板默认分类可随行业更新；用户明确选择的分类必须在切换行业后保留。 */
  hiddenCostCategorySource?: "template" | "custom";
  allocationPeriod?: string;
  fundingCost: number;
  fundingSource?: "manual" | "ledger";
  feeRate: number;
  /** 按月份保存的间接成本与分摊输入，修改新月份不会改写已发生销售的快照。 */
  monthlyIndirectPlans?: MonthlyIndirectCostPlan[];
};

export type HiddenCostItem = {
  id: string;
  label: string;
  amount: number;
};

export const emptyMonthlyFixedCosts = (): MonthlyFixedCosts => ({ rent: 0, fullTimeLabor: 0, utilities: 0, propertyInternet: 0, softwareServer: 0, officeMisc: 0, other: 0, equipment: [] });

export const calculateEquipmentDepreciation = (equipment: EquipmentDepreciation) => {
  const price = Math.max(Number(equipment.purchasePrice) || 0, 0);
  const life = Math.max(Number(equipment.usefulLifeMonths) || 0, 0);
  return life > 0 ? money(price / life) : 0;
};

export const calculateMonthlyIndirectTotal = (fixedCosts: MonthlyFixedCosts) => money(
  Math.max(fixedCosts.rent || 0, 0)
  + Math.max(fixedCosts.fullTimeLabor || 0, 0)
  + Math.max(fixedCosts.utilities || 0, 0)
  + Math.max(fixedCosts.propertyInternet || 0, 0)
  + Math.max(fixedCosts.softwareServer || 0, 0)
  + Math.max(fixedCosts.officeMisc || 0, 0)
  + Math.max(fixedCosts.other || 0, 0)
  + (fixedCosts.equipment ?? []).reduce((sum, item) => sum + calculateEquipmentDepreciation(item), 0),
);

const dateForPeriodDay = (period: string, day: number) => `${period}-${String(day).padStart(2, "0")}`;

export const getMonthlyIndirectPlanTiming = (plan: MonthlyIndirectCostPlan) => {
  const [year, month] = plan.period.split("-").map(Number);
  const daysInPeriod = Number.isFinite(year) && Number.isFinite(month) ? new Date(year, month, 0).getDate() : 30;
  const periodStart = dateForPeriodDay(plan.period, 1);
  const periodEnd = dateForPeriodDay(plan.period, daysInPeriod);
  const candidateFrom = plan.effectiveFrom?.startsWith(`${plan.period}-`) ? plan.effectiveFrom : periodStart;
  const candidateTo = plan.effectiveTo?.startsWith(`${plan.period}-`) ? plan.effectiveTo : periodEnd;
  const effectiveFrom = candidateFrom < periodStart ? periodStart : candidateFrom > periodEnd ? periodEnd : candidateFrom;
  const effectiveTo = candidateTo < periodStart ? periodStart : candidateTo > periodEnd ? periodEnd : candidateTo;
  const startDay = Number(effectiveFrom.slice(-2));
  const endDay = Number(effectiveTo.slice(-2));
  const effectiveDays = endDay >= startDay ? endDay - startDay + 1 : 0;
  const timeFactor = plan.costTiming === "prorated" ? effectiveDays / daysInPeriod : 1;
  return { periodStart, periodEnd, effectiveFrom, effectiveTo, daysInPeriod, effectiveDays, timeFactor };
};

export const calculateMonthlyIndirectPlanTotal = (plan: MonthlyIndirectCostPlan) => money(calculateMonthlyIndirectTotal(plan.fixedCosts) * getMonthlyIndirectPlanTiming(plan).timeFactor);

export const isMonthlyIndirectPlanActiveOn = (plan: MonthlyIndirectCostPlan, businessDate: string) => {
  const timing = getMonthlyIndirectPlanTiming(plan);
  return businessDate.startsWith(`${plan.period}-`) && businessDate >= timing.effectiveFrom && businessDate <= timing.effectiveTo;
};

export const getMonthlyIndirectPlan = (ledger: LedgerData, period: string, businessDate?: string) => {
  const plan = (ledger.costs.monthlyIndirectPlans ?? []).find((item) => item.period === period);
  return plan && (!businessDate || isMonthlyIndirectPlanActiveOn(plan, businessDate)) ? plan : undefined;
};

export const calculateProductIndirectAllocations = (plan: MonthlyIndirectCostPlan): Record<number, ProductIndirectAllocation> => {
  const timing = getMonthlyIndirectPlanTiming(plan);
  const total = calculateMonthlyIndirectPlanTotal(plan);
  const basisFor = (input: ProductAllocationInput) => {
    const weight = Math.max(Number(input.weight) || 0, 0);
    if (plan.method === "hours") return Math.max(Number(input.outputQuantity) || 0, 0) * Math.max(Number(input.unitHours) || 0, 0) * weight;
    if (plan.method === "revenue") return Math.max(Number(input.salesAmount) || 0, 0) * weight;
    return Math.max(Number(input.outputQuantity) || 0, 0) * weight;
  };
  const totalBasis = plan.products.reduce((sum, input) => sum + basisFor(input), 0);
  const roundUnitCost = (value: number) => Math.round(value * 10_000) / 10_000;
  return Object.fromEntries(plan.products.map((input) => {
    const allocationBasis = basisFor(input);
    const outputQuantity = Math.max(Number(input.outputQuantity) || 0, 0);
    const salesAmount = Math.max(Number(input.salesAmount) || 0, 0);
    const allocationShare = totalBasis > 0 ? allocationBasis / totalBasis : 0;
    const totalIndirectCost = totalBasis > 0 && outputQuantity > 0 ? money(total * allocationShare) : 0;
    const unitIndirectCost = outputQuantity > 0 ? roundUnitCost(totalIndirectCost / outputQuantity) : 0;
    return [input.productId, { productId: input.productId, totalIndirectCost, unitIndirectCost, allocationBasis, totalBasis, allocationShare, outputQuantity, salesAmount, effectiveDays: timing.effectiveDays, daysInPeriod: timing.daysInPeriod, timeFactor: timing.timeFactor }];
  }));
};

/** 将已算出的单品月度分摊，按固定费用项目拆分为每件成本，拆分合计严格等于该商品的单位间接成本。 */
export const calculateUnitIndirectCostDetails = (plan: MonthlyIndirectCostPlan, productId: number): UnitIndirectCostDetail[] => {
  const allocation = calculateProductIndirectAllocations(plan)[productId];
  const total = calculateMonthlyIndirectPlanTotal(plan);
  const timing = getMonthlyIndirectPlanTiming(plan);
  if (!allocation || allocation.outputQuantity <= 0 || total <= 0 || allocation.unitIndirectCost <= 0) return [];
  const monthlyItems: Array<{ label: string; amount: number }> = [
    { label: "房租", amount: plan.fixedCosts.rent },
    { label: "全职人工及社保", amount: plan.fixedCosts.fullTimeLabor },
    { label: "水电", amount: plan.fixedCosts.utilities },
    { label: "物业宽带", amount: plan.fixedCosts.propertyInternet },
    { label: "软件服务器", amount: plan.fixedCosts.softwareServer },
    { label: "办公杂费", amount: plan.fixedCosts.officeMisc },
    { label: "其他固定费用", amount: plan.fixedCosts.other },
    ...(plan.fixedCosts.equipment ?? []).map((item) => ({ label: `${item.name || "设备"}月折旧`, amount: calculateEquipmentDepreciation(item) })),
  ].map((item) => ({ ...item, amount: money(Math.max(Number(item.amount) || 0, 0) * timing.timeFactor) })).filter((item) => item.amount > 0);
  const share = allocation.totalIndirectCost / total;
  const roundUnitDetail = (value: number) => Math.round(value * 10_000) / 10_000;
  const details = monthlyItems.map((item) => ({ label: item.label, monthlyAmount: money(item.amount), unitAmount: roundUnitDetail(item.amount * share / allocation.outputQuantity) }));
  const detailsTotal = details.reduce((sum, item) => sum + item.unitAmount, 0);
  const roundingDifference = roundUnitDetail(allocation.unitIndirectCost - detailsTotal);
  if (details.length && Math.abs(roundingDifference) >= 0.0001) details[details.length - 1].unitAmount = roundUnitDetail(details[details.length - 1].unitAmount + roundingDifference);
  return details;
};

/** 将材料、包装、直接人工、损耗及出成量拆为与直接成本完全对账的单件项目。 */
export const calculateUnitDirectCostDetails = (product: LedgerProduct, materials: Material[]): UnitCostDetail[] => {
  const rawItems: UnitCostDetail[] = product.bom.map((item) => {
    if (item.customName !== undefined) return { label: item.customName || "自定义成本", unitAmount: money(Math.max(item.customUnitCost ?? 0, 0) * item.quantity), source: item.customUnit || "自定义明细" };
    const material = materials.find((entry) => entry.id === item.materialId);
    const unitCost = material ? (product.materialUnitCosts?.[material.id] ?? material.unitCost) : 0;
    return { label: material?.name ?? "已删除材料", unitAmount: money(Math.max(unitCost, 0) * item.quantity), source: material?.source || "材料明细" };
  }).filter((item) => item.unitAmount > 0);
  if (product.packaging > 0) rawItems.push({ label: "包装", unitAmount: money(product.packaging), source: "商品成本" });
  if (product.directLabor > 0) rawItems.push({ label: "直接人工", unitAmount: money(product.directLabor), source: "商品成本" });
  const directCost = calculateDirectCost(product, materials);
  if (!rawItems.length && directCost > 0) return [{ label: "主成本", unitAmount: directCost, source: "商品成本" }];
  const rawTotal = rawItems.reduce((sum, item) => sum + item.unitAmount, 0);
  const adjustment = money(directCost - rawTotal);
  if (Math.abs(adjustment) >= 0.01) rawItems.push({ label: adjustment > 0 ? "损耗与出成调整" : "成本调整", unitAmount: adjustment, source: "损耗率/出成量" });
  return rawItems;
};

export const applyMonthlyIndirectPlan = (products: LedgerProduct[], plan: MonthlyIndirectCostPlan, materials: Material[]) => {
  const allocations = calculateProductIndirectAllocations(plan);
  return products.map((product) => {
    const direct = calculateDirectCost(product, materials);
    const allocation = allocations[product.id];
    return { ...product, direct, operating: money(direct + (allocation?.unitIndirectCost ?? 0)) };
  });
};

export type LedgerData = {
  profile: {
    storeName: string;
    industry: IndustryKey;
    /** 官方模板版本用于未来结构演进；旧账本缺失时按当前官方版本兼容。 */
    industryTemplateVersion?: number;
    /** 用户个性化仅作为账本上的覆盖层，不会修改官方模板。 */
    industryTemplateOverrides?: IndustryTemplateUserOverrides;
    onboarded: boolean;
    monthlyBudget: number;
  };
  costs: LedgerCosts;
  categories: string[];
  /** 自定义/行业成本项目是否允许新流水继续录入；历史流水不会被删除。 */
  categoryStatus?: Record<string, boolean>;
  materials: Material[];
  products: LedgerProduct[];
  records: LedgerRecord[];
  sales: SalesRecord[];
};

export type LedgerSummary = {
  income: number;
  expenses: number;
  /** 实际收付款口径，包含本金还款。 */
  cashOutflow: number;
  cashBalance: number;
  /** 仅在本期存在有效销售结转时才可用；未结转时固定为0，页面应展示待结转状态。 */
  operatingResult: number;
  /** 是否已有至少一笔有效销售可用于结转商品成本并计算利润。 */
  profitReady: boolean;
  salesRevenue: number;
  salesQuantity: number;
  salesCount: number;
  refundCount: number;
  refundAmount: number;
  costOfSales: number;
  grossProfit: number;
  allocatedIndirectCosts: number;
  financingCosts: number;
  principalRepayment: number;
  result: number;
  incomeCount: number;
  expenseCount: number;
  categoryTotals: Record<string, number>;
  dailySeries: Array<{ label: string; income: number; expenses: number }>;
};

export type IndustrySampleData = { materials: Material[]; products: LedgerProduct[] };

export const INDUSTRY_SAMPLE_DATA: Partial<Record<IndustryKey, IndustrySampleData>> = {
  catering: {
    materials: [
      { id: "catering-milk", name: "鲜牛奶", unit: "毫升", unitCost: 0.009, source: "社区批发" },
      { id: "catering-tea", name: "茉莉茶底", unit: "克", unitCost: 0.036, source: "茶叶供应商" },
      { id: "catering-cup", name: "500ml杯和杯盖", unit: "套", unitCost: 0.48, source: "包装耗材" },
    ],
    products: [
      { id: 1, name: "招牌奶茶", category: "饮品", price: 12, direct: 0, operating: 0, change: "新建示例", packaging: 0.48, directLabor: 0.6, bom: [{ id: "catering-bom-1", materialId: "catering-milk", quantity: 280 }, { id: "catering-bom-2", materialId: "catering-tea", quantity: 18 }] },
      { id: 2, name: "芝士热狗", category: "小食", price: 10, direct: 0, operating: 0, change: "新建示例", packaging: 0.32, directLabor: 0.45, bom: [] },
    ],
  },
  retail: {
    materials: [
      { id: "retail-water", name: "瓶装饮用水", unit: "瓶", unitCost: 1.2, source: "批发市场" },
      { id: "retail-snack", name: "袋装零食", unit: "袋", unitCost: 2.8, source: "食品批发商" },
      { id: "retail-bag", name: "购物袋", unit: "个", unitCost: 0.12, source: "包装耗材" },
    ],
    products: [
      { id: 1, name: "矿泉水", category: "饮料", price: 2.5, direct: 0, operating: 0, change: "新建示例", packaging: 0.12, directLabor: 0.05, bom: [{ id: "retail-bom-1", materialId: "retail-water", quantity: 1 }] },
      { id: 2, name: "休闲零食组合", category: "零食", price: 8.9, direct: 0, operating: 0, change: "新建示例", packaging: 0.12, directLabor: 0.1, bom: [{ id: "retail-bom-2", materialId: "retail-snack", quantity: 1 }] },
    ],
  },
  stall: {
    materials: [
      { id: "stall-tshirt", name: "基础T恤", unit: "件", unitCost: 18, source: "服装批发城" },
      { id: "stall-sock", name: "棉袜", unit: "双", unitCost: 3.5, source: "日用百货批发" },
      { id: "stall-bag", name: "打包袋", unit: "个", unitCost: 0.18, source: "包装耗材" },
    ],
    products: [
      { id: 1, name: "基础T恤", category: "服装", price: 39, direct: 0, operating: 0, change: "新建示例", packaging: 0.18, directLabor: 0.35, bom: [{ id: "stall-bom-1", materialId: "stall-tshirt", quantity: 1 }] },
      { id: 2, name: "棉袜两双装", category: "日用百货", price: 12, direct: 0, operating: 0, change: "新建示例", packaging: 0.18, directLabor: 0.2, bom: [{ id: "stall-bom-2", materialId: "stall-sock", quantity: 2 }] },
    ],
  },
  handmade: {
    materials: [
      { id: "handmade-clay", name: "手作黏土", unit: "克", unitCost: 0.032, source: "手作材料店" },
      { id: "handmade-beads", name: "装饰珠", unit: "颗", unitCost: 0.18, source: "饰品材料商" },
      { id: "handmade-box", name: "礼盒包装", unit: "个", unitCost: 1.8, source: "包装耗材" },
    ],
    products: [
      { id: 1, name: "黏土小摆件", category: "家居手作", price: 39, direct: 0, operating: 0, change: "新建示例", packaging: 1.8, directLabor: 8, bom: [{ id: "handmade-bom-1", materialId: "handmade-clay", quantity: 80 }, { id: "handmade-bom-2", materialId: "handmade-beads", quantity: 4 }] },
      { id: 2, name: "手作挂饰", category: "饰品", price: 29, direct: 0, operating: 0, change: "新建示例", packaging: 1.2, directLabor: 5, bom: [{ id: "handmade-bom-3", materialId: "handmade-beads", quantity: 6 }] },
    ],
  },
};

export const getIndustrySampleData = (industry: IndustryKey): IndustrySampleData => {
  const source = INDUSTRY_SAMPLE_DATA[industry] ?? INDUSTRY_SAMPLE_DATA.catering;
  if (!source) return { materials: [], products: [] };
  return { materials: source.materials.map((material) => ({ ...material })), products: source.products.map((product) => ({ ...product, bom: product.bom.map((item) => ({ ...item })) })) };
};

const STORAGE_KEY = "suandeqing-ledger-v1";
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const money = (value: number) => Math.round(value * 100) / 100;

/** 使用浏览器本地日历日，避免 UTC 零点把中国商户的业务归到错误日期。 */
export const getBusinessDate = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

export const getBusinessPeriod = (date = getBusinessDate()) => date.slice(0, 7);

export const formatBusinessPeriod = (period: string) => {
  const [year, month] = period.split("-");
  return year && month ? `${year}年${Number(month)}月` : "选择月份";
};

export const calculateUnitCost = (purchaseAmount: number, purchaseQuantity: number, conversionFactor = 1) => {
  if (![purchaseAmount, purchaseQuantity, conversionFactor].every(Number.isFinite) || purchaseAmount <= 0 || purchaseQuantity <= 0 || conversionFactor <= 0) return NaN;
  return money(purchaseAmount / (purchaseQuantity * conversionFactor));
};

export const seedLedger = (): LedgerData => ({
  profile: { storeName: "巷口奶茶铺", industry: DEFAULT_INDUSTRY_KEY, industryTemplateVersion: INDUSTRY_TEMPLATE_VERSION, onboarded: false, monthlyBudget: 18000 },
  costs: { fixedCost: 0.92, hiddenCost: 1.3, hiddenCostBasis: "perUnit", hiddenCostSource: "manual", hiddenCostCategory: "交通配送", allocationPeriod: getBusinessPeriod(), fundingCost: 0.28, fundingSource: "manual", feeRate: 3 },
  categories: INDUSTRY_TEMPLATES[0].categories,
  categoryStatus: Object.fromEntries(INDUSTRY_TEMPLATES[0].categories.map((category) => [category, true])),
  materials: [
    { id: "mat-tea", name: "茉莉茶底", unit: "克", unitCost: 0.036, source: "茶叶供应商" },
    { id: "mat-milk", name: "鲜牛奶", unit: "毫升", unitCost: 0.009, source: "社区批发" },
    { id: "mat-sugar", name: "冰糖浆", unit: "毫升", unitCost: 0.012, source: "调味料采购" },
    { id: "mat-cup", name: "500ml杯和杯盖", unit: "套", unitCost: 0.48, source: "包装耗材" },
  ],
  products: [
    { id: 1, name: "招牌奶茶", category: "饮品 · 500ml", price: 12, direct: 5.6, operating: 7.82, change: "成本上升 0.28 元", packaging: 0.48, directLabor: 0.6, bom: [{ id: "bom-1", materialId: "mat-tea", quantity: 18 }, { id: "bom-2", materialId: "mat-milk", quantity: 280 }, { id: "bom-3", materialId: "mat-sugar", quantity: 25 }] },
    { id: 2, name: "芝士热狗", category: "小食 · 单份", price: 10, direct: 4.2, operating: 5.51, change: "利润稳定", packaging: 0.32, directLabor: 0.45, bom: [] },
    { id: 3, name: "手冲柠檬茶", category: "饮品 · 650ml", price: 13, direct: 4.9, operating: 6.18, change: "本周销量 +16%", packaging: 0.5, directLabor: 0.5, bom: [] },
  ],
    records: [
    { id: "rec-1", type: "expense", amount: 286, category: "交通配送", note: "本月配送与取货", date: "2026-08-17" },
    { id: "rec-2", type: "income", amount: 860, category: "销售收入", note: "今日小程序汇总", date: "2026-08-17" },
  ],
  sales: [],
});

/** 首次打开只展示行业选择，正式账本不会自动带入任何商品、流水或成本金额。 */
export const createEmptyLedger = (): LedgerData => ({
  profile: { storeName: "", industry: DEFAULT_INDUSTRY_KEY, industryTemplateVersion: INDUSTRY_TEMPLATE_VERSION, onboarded: false, monthlyBudget: 0 },
  costs: { fixedCost: 0, hiddenCost: 0, hiddenCostBasis: "perUnit", hiddenCostSource: "manual", hiddenCostCategory: INDUSTRY_TEMPLATES[0].hiddenCostCategory, hiddenCostCategorySource: "template", allocationPeriod: getBusinessPeriod(), fundingCost: 0, fundingSource: "manual", feeRate: 0, monthlyIndirectPlans: [] },
  categories: INDUSTRY_TEMPLATES[0].categories,
  categoryStatus: Object.fromEntries(INDUSTRY_TEMPLATES[0].categories.map((category) => [category, true])),
  materials: [],
  products: [],
  records: [],
  sales: [],
});

const legacySeedRecordIds = new Set(["rec-1", "rec-2"]);
const legacySeedMaterialIds = new Set(["mat-tea", "mat-milk", "mat-sugar", "mat-cup"]);
const legacySeedProducts = new Map([[1, "招牌奶茶"], [2, "芝士热狗"], [3, "手冲柠檬茶"]]);

/**
 * 早期版本曾使用演示账本作为启动回退。仅移除带固定演示 ID 的数据，
 * 不触碰用户后来录入的流水，也不删除已有销售快照引用的商品。
 */
export const removeLegacyDemoData = (ledger: LedgerData): LedgerData => {
  const hasLegacySeedRecord = ledger.records.some((record) => legacySeedRecordIds.has(record.id));
  const hasLegacySeedMaterial = ledger.materials.some((material) => legacySeedMaterialIds.has(material.id));
  const hasLegacySeedProduct = ledger.products.some((product) => legacySeedProducts.get(product.id) === product.name);
  const hasOnlyLegacyManualCosts = ledger.costs.fixedCost === 0.92
    && ledger.costs.hiddenCost === 1.3
    && ledger.costs.fundingCost === 0.28
    && !(ledger.costs.hiddenCostItems?.length)
    && !(ledger.costs.monthlyIndirectPlans?.length);
  if (!hasLegacySeedRecord && !hasLegacySeedMaterial && !hasLegacySeedProduct && !hasOnlyLegacyManualCosts) return ledger;

  const salesProductIds = new Set((ledger.sales ?? []).map((sale) => sale.productId));
  return {
    ...ledger,
    records: ledger.records.filter((record) => !legacySeedRecordIds.has(record.id)),
    materials: ledger.materials.filter((material) => !legacySeedMaterialIds.has(material.id)),
    products: ledger.products.filter((product) => salesProductIds.has(product.id) || legacySeedProducts.get(product.id) !== product.name),
    costs: hasOnlyLegacyManualCosts
      ? { ...ledger.costs, fixedCost: 0, hiddenCost: 0, fundingCost: 0, hiddenCostItems: [], hiddenCostAllocationUnits: 0 }
      : ledger.costs,
  };
};

export const loadLedger = (): LedgerData => {
  const fallback = createEmptyLedger();
  try {
    const data = window.localStorage.getItem(STORAGE_KEY);
    if (data) {
      const saved = JSON.parse(data) as Partial<LedgerData>;
      const merged = {
        ...fallback,
        ...saved,
        profile: { ...fallback.profile, ...(saved.profile ?? {}) },
        costs: { ...fallback.costs, ...(saved.costs ?? {}) },
        categories: saved.categories?.length ? saved.categories : fallback.categories,
        categoryStatus: Object.fromEntries((saved.categories?.length ? saved.categories : fallback.categories).map((category) => [category, saved.categoryStatus?.[category] !== false])),
        materials: saved.materials ?? fallback.materials,
        products: saved.products ?? fallback.products,
        records: saved.records ?? fallback.records,
        sales: saved.sales ?? fallback.sales,
      };
      const cleaned = removeLegacyDemoData(merged);
      if (JSON.stringify(cleaned) !== JSON.stringify(merged)) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      return cleaned;
    }
  } catch {
    // 浏览器存储不可用时保持空白开账，不虚构经营数据。
  }
  return fallback;
};

/** 对已有本地账本做轻量迁移：带BOM的商品始终以当前BOM重算，避免种子值与配方不一致。 */
export const normalizeLedger = (ledger: LedgerData): LedgerData => {
  const template = resolveIndustryTemplate(ledger.profile.industry, ledger.profile.industryTemplateOverrides);
  const categorySource = ledger.costs.hiddenCostCategorySource
    ?? (ledger.costs.hiddenCostCategory && ledger.costs.hiddenCostCategory !== template.hiddenCostCategory ? "custom" : "template");
  const monthlyIndirectPlans = (ledger.costs.monthlyIndirectPlans ?? []).map((plan) => ({
    ...plan,
    totalProductionHours: Math.max(Number(plan.totalProductionHours) || 0, 0),
    fixedCosts: { ...emptyMonthlyFixedCosts(), ...(plan.fixedCosts ?? {}), equipment: (plan.fixedCosts?.equipment ?? []).map((item) => ({ ...item, purchasePrice: Math.max(Number(item.purchasePrice) || 0, 0), usefulLifeMonths: Math.max(Number(item.usefulLifeMonths) || 0, 0) })) },
    products: (plan.products ?? []).map((item) => ({ ...item, outputQuantity: Math.max(Number(item.outputQuantity) || 0, 0), unitHours: Math.max(Number(item.unitHours) || 0, 0), salesAmount: Math.max(Number(item.salesAmount) || 0, 0), weight: Math.max(Number(item.weight) || 0, 0) })),
  }));
  const activePlan = monthlyIndirectPlans.find((plan) => plan.period === (ledger.costs.allocationPeriod ?? getBusinessPeriod()));
  return {
    ...ledger,
    profile: { ...ledger.profile, industry: template.key, industryTemplateVersion: ledger.profile.industryTemplateVersion ?? template.version, industryTemplateOverrides: normalizeIndustryTemplateOverrides(ledger.profile.industryTemplateOverrides) },
    costs: {
      ...ledger.costs,
      hiddenCost: Math.max(Number(ledger.costs.hiddenCost) || 0, 0),
      hiddenCostItems: (ledger.costs.hiddenCostItems ?? []).map((item) => ({ ...item, label: item.label.trim(), amount: Math.max(Number(item.amount) || 0, 0) })).filter((item) => item.label),
      hiddenCostAllocationUnits: Math.max(Number(ledger.costs.hiddenCostAllocationUnits) || 0, 0),
      hiddenCostCategorySource: categorySource,
      monthlyIndirectPlans,
    },
    products: activePlan ? applyMonthlyIndirectPlan(ledger.products, activePlan, ledger.materials) : ledger.products.map((product) => product.bom.length
      ? recalculateProduct(product, ledger.materials, ledger.costs.hiddenCost, ledger.costs.fixedCost)
      : product),
    sales: (ledger.sales ?? []).map((sale) => ({
      ...sale,
      hiddenCostSourceSnapshot: sale.hiddenCostSourceSnapshot ?? (sale.hiddenCostSnapshot !== undefined ? "manual" : undefined),
      hiddenCostBasisSnapshot: sale.hiddenCostBasisSnapshot ?? (sale.hiddenCostSnapshot !== undefined ? "perUnit" : undefined),
      fundingSourceSnapshot: sale.fundingSourceSnapshot ?? (sale.fundingCostSnapshot !== undefined ? "manual" : undefined),
    })),
  };
};

export const initializeIndustryLedger = (ledger: LedgerData, storeName: string, industry: IndustryKey): LedgerData => {
  const next = applyIndustryTemplate({ ...ledger, profile: { ...ledger.profile, storeName, onboarded: true } }, industry);
  if (ledger.profile.onboarded) return next;
  return {
    ...next,
    costs: { ...next.costs, fixedCost: 0, hiddenCost: 0, fundingCost: 0, hiddenCostSource: "manual", fundingSource: "manual", allocationPeriod: getBusinessPeriod() },
    categoryStatus: Object.fromEntries(next.categories.map((category) => [category, true])),
    materials: [],
    products: [],
    records: [],
    sales: [],
  };
};

export const applyIndustryTemplate = (ledger: LedgerData, industry: IndustryKey): LedgerData => {
  const userOverrides = ledger.profile.industry === industry ? normalizeIndustryTemplateOverrides(ledger.profile.industryTemplateOverrides) : undefined;
  const template = resolveIndustryTemplate(industry, userOverrides);
  /** 只以旧版已发布模板识别默认分类，避免新增行业的同名分类误删除用户历史自定义项。 */
  const legacyDefaultCategories = INDUSTRY_TEMPLATES.filter((item) => ["catering", "retail", "stall", "handmade"].includes(item.key)).flatMap((item) => item.categories);
  const customCategories = ledger.categories.filter((category) => !legacyDefaultCategories.includes(category));
  const nextCategories = [...template.categories, ...customCategories];
  return {
    ...ledger,
    profile: { ...ledger.profile, industry: template.key, industryTemplateVersion: template.version, industryTemplateOverrides: userOverrides },
    categories: nextCategories,
    categoryStatus: Object.fromEntries(nextCategories.map((category) => [category, ledger.categoryStatus?.[category] !== false])),
    costs: {
      ...ledger.costs,
      hiddenCostCategory: ledger.costs.hiddenCostCategorySource === "custom"
        ? ledger.costs.hiddenCostCategory
        : template.hiddenCostCategory,
      hiddenCostCategorySource: ledger.costs.hiddenCostCategorySource ?? "template",
    },
  };
};

/** 保存用户个性化覆盖的唯一入口；官方模板始终保持只读。 */
export const applyIndustryTemplateOverrides = (ledger: LedgerData, overrides?: IndustryTemplateUserOverrides): LedgerData => {
  const userOverrides = normalizeIndustryTemplateOverrides(overrides);
  const template = resolveIndustryTemplate(ledger.profile.industry, userOverrides);
  const officialCategories = INDUSTRY_TEMPLATES.flatMap((item) => item.categories);
  const preservedCategories = ledger.categories.filter((category) => !officialCategories.includes(category));
  const nextCategories = [...template.categories, ...preservedCategories.filter((category) => !template.categories.includes(category))];
  return {
    ...ledger,
    profile: { ...ledger.profile, industryTemplateVersion: template.version, industryTemplateOverrides: userOverrides },
    categories: nextCategories,
    categoryStatus: Object.fromEntries(nextCategories.map((category) => [category, ledger.categoryStatus?.[category] !== false])),
  };
};

export const getActiveCategories = (ledger: LedgerData) => ledger.categories.filter((category) => ledger.categoryStatus?.[category] !== false);

export const renameLedgerCategory = (ledger: LedgerData, oldName: string, newName: string): LedgerData => ({
  ...ledger,
  categories: ledger.categories.map((category) => category === oldName ? newName : category),
  categoryStatus: Object.fromEntries(Object.entries(ledger.categoryStatus ?? {}).map(([category, active]) => [category === oldName ? newName : category, active])),
  records: ledger.records.map((record) => record.category === oldName ? { ...record, category: newName } : record),
  costs: ledger.costs.hiddenCostCategory === oldName ? { ...ledger.costs, hiddenCostCategory: newName } : ledger.costs,
});

export const persistLedger = (ledger: LedgerData) => {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger)); } catch { /* 演示模式不阻断操作 */ }
};

/** 仅清除当前浏览器的本机账本，不影响已登录账户的云端备份。 */
export const clearLocalLedgerStorage = () => {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* 存储不可用时由内存状态继续回退为空账本 */ }
};

/**
 * 删除一笔错误销售及其关联收款/退款流水。新流水按 sourceId 精确匹配；
 * 旧版本无来源字段时只按同日、同金额、同备注的销售流水作兼容清理。
 */
export const deleteSaleTransaction = (ledger: LedgerData, saleId: string): LedgerData => {
  const sale = ledger.sales.find((item) => item.id === saleId);
  if (!sale) return ledger;
  const product = ledger.products.find((item) => item.id === sale.productId);
  const productName = product?.name ?? "商品";
  const grossAmount = sale.quantity * sale.unitPrice;
  const refundRestocked = (sale.refunds ?? []).filter((refund) => refund.restock).reduce((total, refund) => total + Math.max(refund.quantity, 0), 0);
  const records = ledger.records.filter((record) => {
    if (record.sourceId === sale.id && (record.source === "sale" || record.source === "refund")) return false;
    const legacySale = record.source === undefined && record.type === "income" && record.category === "销售收入" && record.date === sale.date && record.amount === grossAmount && record.note === `${productName}销售`;
    const legacyRefund = record.source === undefined && record.type === "expense" && record.category === "销售退款" && (sale.refunds ?? []).some((refund) => record.date === refund.date && record.amount === refund.amount && record.note === `${productName}退款`);
    return !legacySale && !legacyRefund;
  });
  const products = ledger.products.map((item) => item.id === sale.productId && item.stockQuantity !== undefined
    ? { ...item, stockQuantity: item.stockQuantity + sale.quantity - refundRestocked }
    : item);
  return { ...ledger, products, sales: ledger.sales.filter((item) => item.id !== sale.id), records };
};

export const makeId = uid;

export const calculateDirectCost = (product: LedgerProduct, materials: Material[]) => {
  if (!product.bom.length && product.packaging <= 0 && product.directLabor <= 0 && product.direct > 0) return money(product.direct);
  const bomCost = product.bom.reduce((sum, item) => {
    if (item.customName !== undefined) return sum + Math.max(item.customUnitCost ?? 0, 0) * item.quantity;
    const material = materials.find((entry) => entry.id === item.materialId);
    return sum + (material ? (product.materialUnitCosts?.[material.id] ?? material.unitCost) * item.quantity : 0);
  }, 0);
  const lossRate = Math.max(product.lossRate ?? 0, 0) / 100;
  const batchYield = Math.max(product.batchYield ?? 1, 0.0001);
  return money((bomCost * (1 + lossRate)) / batchYield + product.packaging + product.directLabor);
};

export const recalculateProduct = (product: LedgerProduct, materials: Material[], hiddenCost: number, fixedCost: number) => {
  const direct = calculateDirectCost(product, materials);
  return { ...product, direct, operating: money(direct + hiddenCost + fixedCost) };
};

export const makeBomVersionSnapshot = (product: LedgerProduct, materials: Material[], settings: { lossRate: number; batchYield: number }, effectiveFrom: string): BomVersion => {
  const snapshotProduct = { ...product, lossRate: settings.lossRate, batchYield: settings.batchYield };
  const recalculated = recalculateProduct(snapshotProduct, materials, 0, 0);
  return {
    id: uid(), effectiveFrom, items: product.bom, lossRate: settings.lossRate, batchYield: settings.batchYield,
    materialUnitCosts: product.materialUnitCosts ?? Object.fromEntries(materials.map((material) => [material.id, material.unitCost])),
    packaging: product.packaging, directLabor: product.directLabor, directCost: recalculated.direct, operatingCost: recalculated.operating,
    entryMode: product.bom.some((item) => !item.presetId) ? "advanced" : "quick",
  };
};

/**
 * 快速成本只更新当前商品成本；若当前使用的是进阶材料明细，先将其快照备份，便于用户随时恢复。
 * 该函数不接触 sales，因此已结转销售永远保持当时的成本快照。
 */
export const applyQuickCost = (
  product: LedgerProduct,
  draft: { items: BomItem[]; costCategory: string; lossRate: number; batchYield: number },
  materials: Material[],
  hiddenCost: number,
  fixedCost: number,
  effectiveFrom: string,
) => {
  const hasAdvancedDetails = product.bom.some((item) => !item.presetId);
  const latestVersion = product.bomVersions?.at(-1);
  const needsAdvancedBackup = hasAdvancedDetails && latestVersion?.entryMode !== "advanced";
  const advancedBackup = needsAdvancedBackup
    ? makeBomVersionSnapshot(product, materials, { lossRate: product.lossRate ?? 0, batchYield: product.batchYield ?? 1 }, effectiveFrom)
    : null;
  const draftProduct: LedgerProduct = { ...product, bom: draft.items, costCategory: draft.costCategory, lossRate: draft.lossRate, batchYield: draft.batchYield, materialUnitCosts: undefined, packaging: 0, directLabor: 0 };
  const recalculated = recalculateProduct(draftProduct, materials, hiddenCost, fixedCost);
  const quickVersion = makeBomVersionSnapshot(draftProduct, materials, draft, effectiveFrom);
  return {
    ...recalculated,
    category: "已补齐成本",
    bomVersions: [...(product.bomVersions ?? []), ...(advancedBackup ? [advancedBackup] : []), quickVersion],
  };
};

export const calculateBomVersionDirectCost = (version: BomVersion) => {
  const materialsCost = version.items.reduce((sum, item) => item.customName !== undefined ? sum + Math.max(item.customUnitCost ?? 0, 0) * item.quantity : sum + (version.materialUnitCosts[item.materialId] ?? 0) * item.quantity, 0);
  return money((materialsCost * (1 + Math.max(version.lossRate, 0) / 100)) / Math.max(version.batchYield, 0.0001) + version.packaging + version.directLabor);
};

export const summarizeSales = (ledger: LedgerData, selectedPeriod = ledger.costs.allocationPeriod ?? getBusinessPeriod()) => {
  const period = selectedPeriod;
  const ledgerHiddenCost = ledger.records.filter((record) => (!period || record.date.startsWith(period)) && record.type === "expense" && record.category === (ledger.costs.hiddenCostCategory ?? "交通配送")).reduce((sum, record) => sum + Math.max(record.amount, 0), 0);
  const configuredHiddenCost = ledger.costs.hiddenCostSource === "ledger" ? ledgerHiddenCost : Math.max(ledger.costs.hiddenCost, 0);
  const salesForPeriod = (ledger.sales ?? []).filter((sale) => !period || sale.date.startsWith(period) || (sale.refunds ?? []).some((refund) => refund.date.startsWith(period)));
  let salesRevenue = 0;
  let salesQuantity = 0;
  let effectiveSalesCount = 0;
  let refundCount = 0;
  let refundAmount = 0;
  let costOfSales = 0;
  let allocatedIndirectCosts = 0;
  let manualFundingCosts = 0;
  let needsLedgerFunding = false;
  let needsLedgerHiddenCost = false;
  salesForPeriod.forEach((sale) => {
    const product = ledger.products.find((entry) => entry.id === sale.productId);
    const quantity = Number.isFinite(sale.quantity) && sale.quantity > 0 ? sale.quantity : 0;
    const unitPrice = Number.isFinite(sale.unitPrice) && sale.unitPrice >= 0 ? sale.unitPrice : 0;
    if (!product || quantity <= 0) return;
    const saleInPeriod = !period || sale.date.startsWith(period);
    const refundsInPeriod = (sale.refunds ?? []).filter((refund) => !period || refund.date.startsWith(period));
    const refundedQuantity = Math.min(refundsInPeriod.reduce((sum, refund) => sum + Math.max(Number(refund.quantity) || 0, 0), 0), quantity);
    const refundedAmount = Math.min(refundsInPeriod.reduce((sum, refund) => sum + Math.max(Number(refund.amount) || 0, 0), 0), quantity * unitPrice);
    const netQuantity = saleInPeriod ? quantity - refundedQuantity : -refundedQuantity;
    const netRevenue = saleInPeriod ? quantity * unitPrice - refundedAmount : -refundedAmount;
    if (!saleInPeriod && refundedQuantity <= 0 && refundedAmount <= 0) return;
    refundCount += refundsInPeriod.length;
    refundAmount += refundedAmount;
    const direct = sale.unitDirectCostSnapshot ?? calculateDirectCost(product, ledger.materials);
    const fixedCost = sale.fixedCostSnapshot ?? ledger.costs.fixedCost;
    const hiddenCost = sale.hiddenCostSnapshot ?? configuredHiddenCost;
    const monthlyIndirectCost = sale.allocatedIndirectCostSnapshot;
    const hiddenSource = sale.hiddenCostSourceSnapshot ?? ledger.costs.hiddenCostSource ?? "manual";
    const hiddenBasis = sale.hiddenCostBasisSnapshot ?? ledger.costs.hiddenCostBasis ?? "perUnit";
    const fundingSource = sale.fundingSourceSnapshot ?? ledger.costs.fundingSource ?? "manual";
    salesRevenue += netRevenue;
    salesQuantity += netQuantity;
    if (saleInPeriod && netQuantity > 0) effectiveSalesCount += 1;
    costOfSales += direct * netQuantity;
    if (monthlyIndirectCost !== undefined) {
      allocatedIndirectCosts += monthlyIndirectCost * netQuantity;
    } else {
      allocatedIndirectCosts += fixedCost * netQuantity;
      if (hiddenSource === "ledger") {
        if (saleInPeriod && netQuantity > 0) needsLedgerHiddenCost = true;
      } else {
        allocatedIndirectCosts += hiddenBasis === "perSale" ? hiddenCost * (netQuantity / quantity) : hiddenCost * netQuantity;
      }
    }
    if (fundingSource === "ledger") {
      if (saleInPeriod && netQuantity > 0) needsLedgerFunding = true;
    } else {
      manualFundingCosts += Math.max(sale.fundingCostSnapshot ?? ledger.costs.fundingCost, 0) * netQuantity;
    }
  });
  const ledgerFinancingCosts = summarizeLedgerRecords(ledger.records, period).financingCosts;
  if (needsLedgerHiddenCost) allocatedIndirectCosts += ledgerHiddenCost;
  const financingCosts = manualFundingCosts + (needsLedgerFunding ? ledgerFinancingCosts : 0);
  return {
    salesRevenue: money(salesRevenue),
    salesQuantity: money(salesQuantity),
    salesCount: effectiveSalesCount,
    refundCount,
    refundAmount: money(refundAmount),
    costOfSales: money(costOfSales),
    allocatedIndirectCosts: money(allocatedIndirectCosts),
    financingCosts: money(financingCosts),
    grossProfit: money(salesRevenue - costOfSales),
    operatingResult: money(salesRevenue - costOfSales - allocatedIndirectCosts - financingCosts),
  };
};

const summarizeLedgerRecords = (records: LedgerRecord[], period?: string) => records.reduce((result, record) => {
  if ((!period || record.date.startsWith(period)) && record.type === "expense" && (record.category === "借款利息" || record.category === "融资服务费")) result.financingCosts += Number.isFinite(record.amount) ? record.amount : 0;
  return result;
}, { financingCosts: 0 });

export type CashTrendRange = "7d" | "30d" | "month";
export type CashTrendPoint = { date: string; label: string; income: number; expenses: number };

const formatTrendDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * 经营驾驶舱的现金趋势只读取真实收付款流水。范围以所选业务月为锚点：当月截至业务日，历史月截至月末；
 * 本金还款属于实际付款，虽不属于利润成本，仍必须显示在现金趋势中。
 */
export const getCashTrendSeries = (ledger: LedgerData, selectedPeriod: string, range: CashTrendRange): CashTrendPoint[] => {
  const [year, month] = selectedPeriod.split("-").map(Number);
  const today = getBusinessDate();
  const isCurrentPeriod = selectedPeriod === today.slice(0, 7);
  const monthEnd = new Date(year, month, 0);
  const periodEnd = isCurrentPeriod ? new Date(`${today}T12:00:00`) : monthEnd;
  const periodStart = new Date(year, month - 1, 1);
  const requestedDays = range === "7d" ? 7 : range === "30d" ? 30 : periodEnd.getDate();
  const candidateStart = new Date(periodEnd);
  candidateStart.setDate(periodEnd.getDate() - requestedDays + 1);
  const start = range === "month" || candidateStart < periodStart ? periodStart : candidateStart;
  const buckets = new Map<string, { income: number; expenses: number }>();
  const cursor = new Date(start);
  while (cursor <= periodEnd) {
    buckets.set(formatTrendDate(cursor), { income: 0, expenses: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  ledger.records.forEach((record) => {
    const bucket = buckets.get(record.date);
    if (!bucket) return;
    const amount = Number.isFinite(record.amount) ? record.amount : 0;
    if (record.type === "income") bucket.income += amount;
    else bucket.expenses += amount;
  });
  return Array.from(buckets.entries()).map(([date, values]) => ({ date, label: `${date.slice(5, 7)}/${date.slice(8, 10)}`, income: money(values.income), expenses: money(values.expenses) }));
};

export const summarizeLedger = (ledger: LedgerData, selectedPeriod = ledger.costs.allocationPeriod ?? getBusinessPeriod()): LedgerSummary => {
  const categoryTotals: Record<string, number> = {};
  const byDate: Record<string, { income: number; expenses: number }> = {};
  let income = 0;
  let expenses = 0;
  let cashOutflow = 0;
  let financingCosts = 0;
  let principalRepayment = 0;

  const recordsForPeriod = ledger.records.filter((record) => record.date.startsWith(selectedPeriod));
  recordsForPeriod.forEach((record) => {
    const amount = Number.isFinite(record.amount) ? record.amount : 0;
    const bucket = byDate[record.date] ?? { income: 0, expenses: 0 };
    if (record.type === "income") {
      income += amount;
      bucket.income += amount;
    } else {
      cashOutflow += amount;
      if (record.category !== "本金还款") bucket.expenses += amount;
      categoryTotals[record.category] = (categoryTotals[record.category] ?? 0) + amount;
      if (record.category === "本金还款") {
        principalRepayment += amount;
      } else {
        expenses += amount;
      }
      if (record.category === "借款利息" || record.category === "融资服务费") {
        financingCosts += amount;
      }
    }
    byDate[record.date] = bucket;
  });

  const dates = Object.keys(byDate).sort().slice(-6);
  const dailySeries = (dates.length ? dates : ["—"]).map((date) => ({
    label: date === "—" ? "—" : `${date.slice(5, 7)}/${date.slice(8, 10)}`,
    income: byDate[date]?.income ?? 0,
    expenses: byDate[date]?.expenses ?? 0,
  }));

  const normalizedIncome = money(income);
  const normalizedExpenses = money(expenses);
  const normalizedCashOutflow = money(cashOutflow);
  const sales = summarizeSales(ledger, selectedPeriod);
  const hasSales = sales.salesCount > 0;
  const operatingResult = hasSales ? sales.operatingResult : 0;
  return {
    income: normalizedIncome,
    expenses: normalizedExpenses,
    cashOutflow: normalizedCashOutflow,
    cashBalance: money(normalizedIncome - normalizedCashOutflow),
    operatingResult,
    profitReady: hasSales,
    salesRevenue: sales.salesRevenue,
    salesQuantity: sales.salesQuantity,
    salesCount: sales.salesCount,
    refundCount: sales.refundCount,
    refundAmount: sales.refundAmount,
    costOfSales: sales.costOfSales,
    grossProfit: sales.grossProfit,
    allocatedIndirectCosts: sales.allocatedIndirectCosts,
    financingCosts: hasSales ? sales.financingCosts : money(financingCosts),
    principalRepayment: money(principalRepayment),
    result: operatingResult,
    incomeCount: recordsForPeriod.filter((record) => record.type === "income").length,
    expenseCount: recordsForPeriod.filter((record) => record.type === "expense").length,
    categoryTotals,
    dailySeries,
  };
};
