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
  materialId: string;
  quantity: number;
};

export type LedgerProduct = {
  id: number;
  name: string;
  category: string;
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
  fundingCostSnapshot?: number;
  fundingSourceSnapshot?: "manual" | "ledger";
  costPeriod?: string;
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
};

export type LedgerCosts = {
  fixedCost: number;
  hiddenCost: number;
  hiddenCostBasis?: "perUnit" | "perSale";
  hiddenCostSource?: "manual" | "ledger";
  hiddenCostCategory?: string;
  allocationPeriod?: string;
  fundingCost: number;
  fundingSource?: "manual" | "ledger";
  feeRate: number;
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
  /** 没有销售记录时为流水层估算；有销售记录时由销售和成本版本计算。 */
  operatingResult: number;
  salesRevenue: number;
  salesQuantity: number;
  salesCount: number;
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
  { key: "catering", label: "餐饮饮品", shortLabel: "餐饮", description: "配方、损耗、包装与人工", hiddenCostCategory: "平台服务", hiddenCostDescription: "店主工时、配送、平台抽佣和设备占用", fundingCostDescription: "外卖平台服务费、短期周转利息和融资费用", categories: ["食材采购", "包装耗材", "平台服务", "房租水电", "人工分摊"] },
  { key: "retail", label: "社区零售", shortLabel: "零售", description: "进货、促销、配送与平台", hiddenCostCategory: "物流配送", hiddenCostDescription: "补货配送、促销让利、货架占用和平台服务", fundingCostDescription: "进货周转借款、供应商账期费用和融资费用", categories: ["货品采购", "物流配送", "促销让利", "摊位房租", "平台服务"] },
  { key: "stall", label: "商贸摆摊", shortLabel: "摆摊", description: "进货、摊位、交通与尾货", hiddenCostCategory: "交通配送", hiddenCostDescription: "摊位、交通、尾货损耗和临时人工", fundingCostDescription: "进货周转、摊位押金借款和融资费用", categories: ["进货成本", "摊位费用", "交通配送", "货品损耗", "尾货折价"] },
  { key: "handmade", label: "手作生产", shortLabel: "手作", description: "材料、工时、工具与试做", hiddenCostCategory: "手工工时", hiddenCostDescription: "手工工时、设备折旧、试做报废和包材", fundingCostDescription: "材料备货借款、设备分期利息和融资费用", categories: ["材料采购", "包材耗材", "手工工时", "设备工具", "试做报废"] },
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

export const calculateUnitCost = (purchaseAmount: number, purchaseQuantity: number, conversionFactor = 1) => {
  if (![purchaseAmount, purchaseQuantity, conversionFactor].every(Number.isFinite) || purchaseAmount <= 0 || purchaseQuantity <= 0 || conversionFactor <= 0) return NaN;
  return money(purchaseAmount / (purchaseQuantity * conversionFactor));
};

export const seedLedger = (): LedgerData => ({
  profile: { storeName: "巷口奶茶铺", industry: "catering", onboarded: false, monthlyBudget: 18000 },
  costs: { fixedCost: 0.92, hiddenCost: 1.3, hiddenCostBasis: "perUnit", hiddenCostSource: "manual", hiddenCostCategory: "交通配送", allocationPeriod: "2026-08", fundingCost: 0.28, fundingSource: "manual", feeRate: 3 },
  categories: INDUSTRY_TEMPLATES[0].categories,
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
export const normalizeLedger = (ledger: LedgerData): LedgerData => ({
  ...ledger,
  products: ledger.products.map((product) => product.bom.length
    ? recalculateProduct(product, ledger.materials, ledger.costs.hiddenCost, ledger.costs.fixedCost)
    : product),
});

export const initializeIndustryLedger = (ledger: LedgerData, storeName: string, industry: IndustryKey): LedgerData => {
  const next = applyIndustryTemplate({ ...ledger, profile: { ...ledger.profile, storeName, onboarded: true } }, industry);
  if (ledger.profile.onboarded) return next;
  const sample = getIndustrySampleData(industry);
  return {
    ...next,
    materials: sample.materials,
    products: sample.products.map((product) => recalculateProduct(product, sample.materials, next.costs.hiddenCost, next.costs.fixedCost)),
    sales: [],
  };
};

export const applyIndustryTemplate = (ledger: LedgerData, industry: IndustryKey): LedgerData => {
  const template = INDUSTRY_TEMPLATES.find((item) => item.key === industry) ?? INDUSTRY_TEMPLATES[0];
  return {
    ...ledger,
    profile: { ...ledger.profile, industry: template.key },
    categories: [...template.categories],
    costs: { ...ledger.costs, hiddenCostCategory: template.hiddenCostCategory },
  };
};

export const persistLedger = (ledger: LedgerData) => {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger)); } catch { /* 演示模式不阻断操作 */ }
};

export const makeId = uid;

export const calculateDirectCost = (product: LedgerProduct, materials: Material[]) => {
  const bomCost = product.bom.reduce((sum, item) => {
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
  };
};

export const calculateBomVersionDirectCost = (version: BomVersion) => {
  const materialsCost = version.items.reduce((sum, item) => sum + (version.materialUnitCosts[item.materialId] ?? 0) * item.quantity, 0);
  return money((materialsCost * (1 + Math.max(version.lossRate, 0) / 100)) / Math.max(version.batchYield, 0.0001) + version.packaging + version.directLabor);
};

export const summarizeSales = (ledger: LedgerData) => {
  const period = ledger.costs.allocationPeriod;
  const ledgerHiddenCost = ledger.records.filter((record) => (!period || record.date.startsWith(period)) && record.type === "expense" && record.category === (ledger.costs.hiddenCostCategory ?? "交通配送")).reduce((sum, record) => sum + Math.max(record.amount, 0), 0);
  const configuredHiddenCost = ledger.costs.hiddenCostSource === "ledger" ? ledgerHiddenCost : Math.max(ledger.costs.hiddenCost, 0);
  const salesForPeriod = (ledger.sales ?? []).filter((sale) => !period || sale.date.startsWith(period));
  let salesRevenue = 0;
  let salesQuantity = 0;
  let costOfSales = 0;
  let allocatedIndirectCosts = 0;
  salesForPeriod.forEach((sale) => {
    const product = ledger.products.find((entry) => entry.id === sale.productId);
    const quantity = Number.isFinite(sale.quantity) && sale.quantity > 0 ? sale.quantity : 0;
    const unitPrice = Number.isFinite(sale.unitPrice) && sale.unitPrice >= 0 ? sale.unitPrice : 0;
    if (!product || quantity <= 0) return;
    const direct = sale.unitDirectCostSnapshot ?? calculateDirectCost(product, ledger.materials);
    const fixedCost = sale.fixedCostSnapshot ?? ledger.costs.fixedCost;
    const hiddenCost = sale.hiddenCostSnapshot ?? configuredHiddenCost;
    salesRevenue += quantity * unitPrice;
    salesQuantity += quantity;
    costOfSales += direct * quantity;
    const hiddenAllocation = (sale.hiddenCostSnapshot !== undefined || ledger.costs.hiddenCostBasis !== "perSale") ? hiddenCost * quantity : hiddenCost;
    allocatedIndirectCosts += fixedCost * quantity + hiddenAllocation;
  });
  const ledgerFinancingCosts = summarizeLedgerRecords(ledger.records, period).financingCosts;
  const snapshotFunding = salesForPeriod.reduce((sum, sale) => sum + (sale.fundingCostSnapshot ?? 0) * (Number.isFinite(sale.quantity) && sale.quantity > 0 ? sale.quantity : 0), 0);
  const fundingPerSale = ledger.costs.fundingSource === "ledger" ? 0 : Math.max(ledger.costs.fundingCost, 0);
  const financingCosts = salesForPeriod.some((sale) => sale.fundingCostSnapshot !== undefined) ? ledgerFinancingCosts + snapshotFunding : ledgerFinancingCosts + fundingPerSale * salesQuantity;
  return {
    salesRevenue: money(salesRevenue),
    salesQuantity: money(salesQuantity),
    salesCount: salesForPeriod.length,
    costOfSales: money(costOfSales),
    allocatedIndirectCosts: money(allocatedIndirectCosts),
    grossProfit: money(salesRevenue - costOfSales),
    operatingResult: money(salesRevenue - costOfSales - allocatedIndirectCosts - financingCosts),
  };
};

const summarizeLedgerRecords = (records: LedgerRecord[], period?: string) => records.reduce((result, record) => {
  if ((!period || record.date.startsWith(period)) && record.type === "expense" && (record.category === "借款利息" || record.category === "融资服务费")) result.financingCosts += Number.isFinite(record.amount) ? record.amount : 0;
  return result;
}, { financingCosts: 0 });

export const summarizeLedger = (ledger: LedgerData): LedgerSummary => {
  const categoryTotals: Record<string, number> = {};
  const byDate: Record<string, { income: number; expenses: number }> = {};
  let income = 0;
  let expenses = 0;
  let cashOutflow = 0;
  let financingCosts = 0;
  let principalRepayment = 0;

  ledger.records.forEach((record) => {
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
  const sales = summarizeSales(ledger);
  const hasSales = sales.salesCount > 0;
  const operatingResult = hasSales ? sales.operatingResult : money(normalizedIncome - normalizedExpenses);
  return {
    income: normalizedIncome,
    expenses: normalizedExpenses,
    cashOutflow: normalizedCashOutflow,
    cashBalance: money(normalizedIncome - normalizedCashOutflow),
    operatingResult,
    salesRevenue: sales.salesRevenue,
    salesQuantity: sales.salesQuantity,
    salesCount: sales.salesCount,
    costOfSales: sales.costOfSales,
    grossProfit: sales.grossProfit,
    allocatedIndirectCosts: sales.allocatedIndirectCosts,
    financingCosts: money(financingCosts),
    principalRepayment: money(principalRepayment),
    result: operatingResult,
    incomeCount: ledger.records.filter((record) => record.type === "income").length,
    expenseCount: ledger.records.filter((record) => record.type === "expense").length,
    categoryTotals,
    dailySeries,
  };
};
