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
  unit: string;
  unitCost: number;
  source: string;
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

export type LedgerData = {
  profile: {
    storeName: string;
    industry: IndustryKey;
    onboarded: boolean;
    monthlyBudget: number;
  };
  categories: string[];
  materials: Material[];
  products: LedgerProduct[];
  records: LedgerRecord[];
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

export const seedLedger = (): LedgerData => ({
  profile: { storeName: "巷口奶茶铺", industry: "catering", onboarded: false, monthlyBudget: 18000 },
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
  try {
    const data = window.localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data) as LedgerData;
  } catch {
    // 浏览器存储不可用时退回可演示的初始账本。
  }
  return seedLedger();
};

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
