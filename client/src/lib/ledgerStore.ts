/** 商户账簿工作台：以本地账本服务集中管理店铺、材料、BOM与流水，页面不散写业务数据。 */
export type IndustryKey = "catering" | "retail" | "stall" | "handmade";

export type IndustryTemplate = {
  key: IndustryKey;
  label: string;
  shortLabel: string;
  description: string;
  categories: string[];
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
};

export type LedgerRecord = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  date: string;
};

export type LedgerCosts = {
  fixedCost: number;
  hiddenCost: number;
  fundingCost: number;
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
};

export type LedgerSummary = {
  income: number;
  expenses: number;
  /** 实际收付款口径，包含本金还款。 */
  cashOutflow: number;
  cashBalance: number;
  /** 当前仍是流水层估算，尚未按销售数量结转商品成本。 */
  operatingResult: number;
  financingCosts: number;
  principalRepayment: number;
  result: number;
  incomeCount: number;
  expenseCount: number;
  categoryTotals: Record<string, number>;
  dailySeries: Array<{ label: string; income: number; expenses: number }>;
};

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  { key: "catering", label: "餐饮饮品", shortLabel: "餐饮", description: "配方、损耗、包装与人工", categories: ["食材采购", "包装耗材", "平台服务", "房租水电", "人工分摊"] },
  { key: "retail", label: "社区零售", shortLabel: "零售", description: "进货、促销、配送与平台", categories: ["货品采购", "物流配送", "促销让利", "摊位房租", "平台服务"] },
  { key: "stall", label: "商贸摆摊", shortLabel: "摆摊", description: "进货、摊位、交通与尾货", categories: ["进货成本", "摊位费用", "交通配送", "货品损耗", "尾货折价"] },
  { key: "handmade", label: "手作生产", shortLabel: "手作", description: "材料、工时、工具与试做", categories: ["材料采购", "包材耗材", "手工工时", "设备工具", "试做报废"] },
];

const STORAGE_KEY = "suandeqing-ledger-v1";
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const money = (value: number) => Math.round(value * 100) / 100;

export const calculateUnitCost = (purchaseAmount: number, purchaseQuantity: number, conversionFactor = 1) => {
  if (![purchaseAmount, purchaseQuantity, conversionFactor].every(Number.isFinite) || purchaseAmount <= 0 || purchaseQuantity <= 0 || conversionFactor <= 0) return NaN;
  return money(purchaseAmount / (purchaseQuantity * conversionFactor));
};

export const seedLedger = (): LedgerData => ({
  profile: { storeName: "巷口奶茶铺", industry: "catering", onboarded: false, monthlyBudget: 18000 },
  costs: { fixedCost: 0.92, hiddenCost: 1.3, fundingCost: 0.28, feeRate: 3 },
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

export const persistLedger = (ledger: LedgerData) => {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger)); } catch { /* 演示模式不阻断操作 */ }
};

export const makeId = uid;

export const calculateDirectCost = (product: LedgerProduct, materials: Material[]) => {
  const bomCost = product.bom.reduce((sum, item) => {
    const material = materials.find((entry) => entry.id === item.materialId);
    return sum + (material ? material.unitCost * item.quantity : 0);
  }, 0);
  return money(bomCost + product.packaging + product.directLabor);
};

export const recalculateProduct = (product: LedgerProduct, materials: Material[], hiddenCost: number, fixedCost: number) => {
  const direct = calculateDirectCost(product, materials);
  return { ...product, direct, operating: money(direct + hiddenCost + fixedCost) };
};

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
  return {
    income: normalizedIncome,
    expenses: normalizedExpenses,
    cashOutflow: normalizedCashOutflow,
    cashBalance: money(normalizedIncome - normalizedCashOutflow),
    operatingResult: money(normalizedIncome - normalizedExpenses),
    financingCosts: money(financingCosts),
    principalRepayment: money(principalRepayment),
    result: money(normalizedIncome - normalizedExpenses),
    incomeCount: ledger.records.filter((record) => record.type === "income").length,
    expenseCount: ledger.records.filter((record) => record.type === "expense").length,
    categoryTotals,
    dailySeries,
  };
};
