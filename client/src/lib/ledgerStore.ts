/** 商户账簿工作台：以本地账本服务集中管理店铺、材料、BOM与流水，页面不散写业务数据。 */
export type IndustryKey = "catering" | "retail" | "stall" | "handmade";

export type IndustryTemplate = {
  key: IndustryKey;
  label: string;
  shortLabel: string;
  description: string;
  categories: string[];
  hiddenCostCategory: string;
  hiddenCostDescription: string;
  fundingCostDescription: string;
  productCostLabel: string;
  productCostAction: string;
  productCostEmpty: string;
  /** 快速成本录入只显示一主一辅两项，名称与单位由行业预设。 */
  quickPrimaryLabel: string;
  quickSecondaryOptions: string[];
  quickUnit: string;
};

export type Material = {
  id: string;
  name: string;
  /** 使用单位，例如克、毫升、个；unitCost 始终按使用单位计价。 */
  unit: string;
  unitCost: number;
  source: string;
  purchaseUnit?: string;
  conversionFactor?: number;
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
  outputQuantity: number;
};

export type LedgerRecord = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  date: string;
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

export const getMonthlyIndirectPlan = (ledger: LedgerData, period: string) => (ledger.costs.monthlyIndirectPlans ?? []).find((plan) => plan.period === period);

export const calculateProductIndirectAllocations = (plan: MonthlyIndirectCostPlan): Record<number, ProductIndirectAllocation> => {
  const total = calculateMonthlyIndirectTotal(plan.fixedCosts);
  const basisFor = (input: ProductAllocationInput) => {
    const weight = Math.max(Number(input.weight) || 0, 0);
    if (plan.method === "hours") return Math.max(Number(input.outputQuantity) || 0, 0) * Math.max(Number(input.unitHours) || 0, 0) * weight;
    if (plan.method === "revenue") return Math.max(Number(input.salesAmount) || 0, 0) * weight;
    return Math.max(Number(input.outputQuantity) || 0, 0) * weight;
  };
  const totalBasis = plan.products.reduce((sum, input) => sum + basisFor(input), 0);
  return Object.fromEntries(plan.products.map((input) => {
    const allocationBasis = basisFor(input);
    const outputQuantity = Math.max(Number(input.outputQuantity) || 0, 0);
    const unitIndirectCost = plan.method === "hours"
      ? (plan.totalProductionHours > 0 ? money(total / plan.totalProductionHours * Math.max(Number(input.unitHours) || 0, 0) * Math.max(Number(input.weight) || 0, 0)) : 0)
      : (totalBasis > 0 && outputQuantity > 0 ? money(total * allocationBasis / totalBasis / outputQuantity) : 0);
    const totalIndirectCost = money(unitIndirectCost * outputQuantity);
    return [input.productId, { productId: input.productId, totalIndirectCost, unitIndirectCost, allocationBasis, outputQuantity }];
  }));
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

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  { key: "catering", label: "餐饮饮品", shortLabel: "餐饮", description: "配方、损耗、包装与人工", hiddenCostCategory: "平台服务", hiddenCostDescription: "店主工时、配送、平台抽佣和设备占用", fundingCostDescription: "外卖平台服务费、短期周转利息和融资费用", productCostLabel: "商品配方", productCostAction: "编辑配方", productCostEmpty: "还没有配方材料，先添加一项食材。", quickPrimaryLabel: "食材成本", quickSecondaryOptions: ["包装费", "单件人工"], quickUnit: "份", categories: ["食材采购", "包装耗材", "平台服务", "房租水电", "人工分摊"] },
  { key: "retail", label: "社区零售", shortLabel: "零售", description: "进货、促销、配送与平台", hiddenCostCategory: "物流配送", hiddenCostDescription: "补货配送、促销让利、货架占用和平台服务", fundingCostDescription: "进货周转借款、供应商账期费用和融资费用", productCostLabel: "进货明细", productCostAction: "编辑进货明细", productCostEmpty: "还没有进货明细，先添加一项货品。", quickPrimaryLabel: "进货价", quickSecondaryOptions: ["单件配送费", "促销让利"], quickUnit: "件", categories: ["货品采购", "物流配送", "促销让利", "摊位房租", "平台服务"] },
  { key: "stall", label: "商贸摆摊", shortLabel: "摆摊", description: "进货、摊位、交通与尾货", hiddenCostCategory: "交通配送", hiddenCostDescription: "摊位、交通、尾货损耗和临时人工", fundingCostDescription: "进货周转、摊位押金借款和融资费用", productCostLabel: "货品成本", productCostAction: "编辑货品成本", productCostEmpty: "还没有货品成本明细，先添加一项进货。", quickPrimaryLabel: "拿货价", quickSecondaryOptions: ["摊位交通分摊", "尾货损耗"], quickUnit: "件", categories: ["进货成本", "摊位费用", "交通配送", "货品损耗", "尾货折价"] },
  { key: "handmade", label: "手作生产", shortLabel: "手作", description: "材料、工时、工具与试做", hiddenCostCategory: "手工工时", hiddenCostDescription: "手工工时、设备折旧、试做报废和包材", fundingCostDescription: "材料备货借款、设备分期利息和融资费用", productCostLabel: "制作成本", productCostAction: "编辑制作成本", productCostEmpty: "还没有制作成本明细，先添加一项材料。", quickPrimaryLabel: "材料成本", quickSecondaryOptions: ["直接人工", "包材费"], quickUnit: "件", categories: ["材料采购", "包材耗材", "手工工时", "设备工具", "试做报废"] },
];

export type IndustrySampleData = { materials: Material[]; products: LedgerProduct[] };

export const INDUSTRY_SAMPLE_DATA: Record<IndustryKey, IndustrySampleData> = {
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
  profile: { storeName: "巷口奶茶铺", industry: "catering", onboarded: false, monthlyBudget: 18000 },
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

export const loadLedger = (): LedgerData => {
  const fallback = seedLedger();
  try {
    const data = window.localStorage.getItem(STORAGE_KEY);
    if (data) {
      const saved = JSON.parse(data) as Partial<LedgerData>;
      return {
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
    }
  } catch {
    // 浏览器存储不可用时退回可演示的初始账本。
  }
  return fallback;
};

/** 对已有本地账本做轻量迁移：带BOM的商品始终以当前BOM重算，避免种子值与配方不一致。 */
export const normalizeLedger = (ledger: LedgerData): LedgerData => {
  const template = INDUSTRY_TEMPLATES.find((item) => item.key === ledger.profile.industry) ?? INDUSTRY_TEMPLATES[0];
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
  const template = INDUSTRY_TEMPLATES.find((item) => item.key === industry) ?? INDUSTRY_TEMPLATES[0];
  const allDefaultCategories = INDUSTRY_TEMPLATES.flatMap((item) => item.categories);
  const customCategories = ledger.categories.filter((category) => !allDefaultCategories.includes(category));
  const nextCategories = [...template.categories, ...customCategories];
  return {
    ...ledger,
    profile: { ...ledger.profile, industry: template.key },
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
