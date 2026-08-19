import { z } from "zod";

export const INDUSTRY_TEMPLATE_VERSION = 1 as const;

export const IndustryKeySchema = z.enum(["catering", "retail", "ecommerce", "beauty", "stall", "handmade"]);
export type IndustryKey = z.infer<typeof IndustryKeySchema>;

export const IndustryMetricKeySchema = z.enum(["cashBalance", "salesRevenue", "grossProfit", "directCost", "inventoryHealth", "lossRate", "customerValue", "laborEfficiency"]);
export type IndustryMetricKey = z.infer<typeof IndustryMetricKeySchema>;

export const IndustryCostItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  layer: z.enum(["direct", "indirect", "funding"]),
  defaultCategory: z.string().min(1),
  enabledByDefault: z.boolean(),
});
export type IndustryCostItem = z.infer<typeof IndustryCostItemSchema>;

export const IndustryCapabilitiesSchema = z.object({
  bom: z.boolean(),
  inventory: z.boolean(),
  lossTracking: z.boolean(),
  cashOperations: z.boolean(),
  purchaseTracking: z.boolean(),
  salesSnapshots: z.boolean(),
  monthlyAllocation: z.boolean(),
  appointmentTracking: z.boolean(),
  platformFees: z.boolean(),
});
export type IndustryCapabilities = z.infer<typeof IndustryCapabilitiesSchema>;

export const IndustryMetricSchema = z.object({
  key: IndustryMetricKeySchema,
  label: z.string().min(1),
  description: z.string().min(1),
});
export type IndustryMetric = z.infer<typeof IndustryMetricSchema>;

/**
 * 兼容当前UI与账本字段的行业模板定义。新增字段用于后续功能扩展；既有字段保持不变，
 * 因此不改变当前商品成本、销售结转和现金核算逻辑。
 */
export const IndustryTemplateSchema = z.object({
  version: z.literal(INDUSTRY_TEMPLATE_VERSION),
  key: IndustryKeySchema,
  name: z.string().min(1),
  label: z.string().min(1),
  shortLabel: z.string().min(1),
  description: z.string().min(1),
  businessItemName: z.string().min(1),
  categories: z.array(z.string().min(1)).min(1),
  costItems: z.array(IndustryCostItemSchema).min(1),
  capabilities: IndustryCapabilitiesSchema,
  coreMetrics: z.array(IndustryMetricSchema).min(1),
  homeMetricOrder: z.array(IndustryMetricKeySchema).min(1),
  hiddenCostCategory: z.string().min(1),
  hiddenCostDescription: z.string().min(1),
  fundingCostDescription: z.string().min(1),
  productCostLabel: z.string().min(1),
  productCostAction: z.string().min(1),
  productCostEmpty: z.string().min(1),
  quickPrimaryLabel: z.string().min(1),
  quickSecondaryOptions: z.array(z.string().min(1)).min(1),
  quickUnit: z.string().min(1),
});
export type IndustryTemplate = z.infer<typeof IndustryTemplateSchema>;

/** 用户覆盖只允许扩展或重排，不可回写官方模板。 */
export const IndustryTemplateUserOverridesSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  businessItemName: z.string().trim().min(1).max(40).optional(),
  categoryAdditions: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  costItemAdditions: z.array(IndustryCostItemSchema).max(20).optional(),
  capabilityOverrides: IndustryCapabilitiesSchema.partial().optional(),
  homeMetricOrder: z.array(IndustryMetricKeySchema).min(1).optional(),
});
export type IndustryTemplateUserOverrides = z.infer<typeof IndustryTemplateUserOverridesSchema>;

const metrics = {
  cashBalance: { key: "cashBalance", label: "现金结余", description: "本期实际收款减实际付款" },
  salesRevenue: { key: "salesRevenue", label: "销售收入", description: "已结转销售的成交收入" },
  grossProfit: { key: "grossProfit", label: "商品毛利", description: "销售收入扣除销售快照成本" },
  directCost: { key: "directCost", label: "直接成本", description: "材料、进货、包装或直接人工" },
  inventoryHealth: { key: "inventoryHealth", label: "库存情况", description: "可售库存与补货状态" },
  lossRate: { key: "lossRate", label: "损耗", description: "报损、尾货或原料出成影响" },
  customerValue: { key: "customerValue", label: "客单与复购", description: "单次服务与客户价值表现" },
  laborEfficiency: { key: "laborEfficiency", label: "工时效率", description: "人工投入与服务产出" },
} as const satisfies Record<IndustryMetricKey, IndustryMetric>;

const standardCapabilities: IndustryCapabilities = {
  bom: true,
  inventory: true,
  lossTracking: true,
  cashOperations: true,
  purchaseTracking: true,
  salesSnapshots: true,
  monthlyAllocation: true,
  appointmentTracking: false,
  platformFees: false,
};

const makeTemplate = (template: IndustryTemplate): IndustryTemplate => IndustryTemplateSchema.parse(template);

const officialTemplates = [
  makeTemplate({
    version: 1, key: "catering", name: "餐饮饮品", label: "餐饮饮品", shortLabel: "餐饮", description: "配方、损耗、包装与人工", businessItemName: "菜品/饮品",
    categories: ["食材采购", "包装耗材", "平台服务", "房租水电", "人工分摊"],
    costItems: [{ id: "ingredient", label: "食材成本", layer: "direct", defaultCategory: "食材采购", enabledByDefault: true }, { id: "packaging", label: "包装耗材", layer: "direct", defaultCategory: "包装耗材", enabledByDefault: true }, { id: "delivery", label: "平台与配送", layer: "indirect", defaultCategory: "平台服务", enabledByDefault: true }],
    capabilities: { ...standardCapabilities, platformFees: true },
    coreMetrics: [metrics.grossProfit, metrics.salesRevenue, metrics.directCost, metrics.lossRate, metrics.cashBalance], homeMetricOrder: ["grossProfit", "cashBalance", "salesRevenue", "directCost", "lossRate"],
    hiddenCostCategory: "平台服务", hiddenCostDescription: "店主工时、配送、平台抽佣和设备占用", fundingCostDescription: "外卖平台服务费、短期周转利息和融资费用", productCostLabel: "商品配方", productCostAction: "编辑配方", productCostEmpty: "还没有配方材料，先添加一项食材。", quickPrimaryLabel: "食材成本", quickSecondaryOptions: ["包装费", "单件人工"], quickUnit: "份",
  }),
  makeTemplate({
    version: 1, key: "retail", name: "社区零售", label: "社区零售", shortLabel: "零售", description: "进货、促销、配送与平台", businessItemName: "货品",
    categories: ["货品采购", "物流配送", "促销让利", "摊位房租", "平台服务"],
    costItems: [{ id: "purchase", label: "进货成本", layer: "direct", defaultCategory: "货品采购", enabledByDefault: true }, { id: "delivery", label: "物流配送", layer: "direct", defaultCategory: "物流配送", enabledByDefault: true }, { id: "promotion", label: "促销让利", layer: "indirect", defaultCategory: "促销让利", enabledByDefault: true }],
    capabilities: { ...standardCapabilities, bom: false, platformFees: true },
    coreMetrics: [metrics.grossProfit, metrics.salesRevenue, metrics.inventoryHealth, metrics.directCost, metrics.cashBalance], homeMetricOrder: ["grossProfit", "cashBalance", "salesRevenue", "inventoryHealth", "directCost"],
    hiddenCostCategory: "物流配送", hiddenCostDescription: "补货配送、促销让利、货架占用和平台服务", fundingCostDescription: "进货周转借款、供应商账期费用和融资费用", productCostLabel: "进货明细", productCostAction: "编辑进货明细", productCostEmpty: "还没有进货明细，先添加一项货品。", quickPrimaryLabel: "进货价", quickSecondaryOptions: ["单件配送费", "促销让利"], quickUnit: "件",
  }),
  makeTemplate({
    version: 1, key: "ecommerce", name: "电商", label: "电商经营", shortLabel: "电商", description: "货源、平台费、物流与退货", businessItemName: "商品/SPU",
    categories: ["货源采购", "快递物流", "平台服务", "推广投放", "售后退款"],
    costItems: [{ id: "supply", label: "货源成本", layer: "direct", defaultCategory: "货源采购", enabledByDefault: true }, { id: "freight", label: "单件快递", layer: "direct", defaultCategory: "快递物流", enabledByDefault: true }, { id: "platform", label: "平台服务费", layer: "indirect", defaultCategory: "平台服务", enabledByDefault: true }],
    capabilities: { ...standardCapabilities, bom: false, platformFees: true },
    coreMetrics: [metrics.grossProfit, metrics.salesRevenue, metrics.directCost, metrics.inventoryHealth, metrics.cashBalance], homeMetricOrder: ["grossProfit", "salesRevenue", "cashBalance", "directCost", "inventoryHealth"],
    hiddenCostCategory: "平台服务", hiddenCostDescription: "平台佣金、推广投放、客服与仓储占用", fundingCostDescription: "备货周转利息、平台账期费用和融资费用", productCostLabel: "商品成本", productCostAction: "编辑货源明细", productCostEmpty: "还没有货源明细，先添加一项商品成本。", quickPrimaryLabel: "货源价", quickSecondaryOptions: ["单件快递", "平台服务费"], quickUnit: "件",
  }),
  makeTemplate({
    version: 1, key: "beauty", name: "美业", label: "美业服务", shortLabel: "美业", description: "项目耗材、技师工时与预约服务", businessItemName: "服务项目",
    categories: ["服务耗材", "技师人工", "房租水电", "预约营销", "设备折旧"],
    costItems: [{ id: "consumables", label: "服务耗材", layer: "direct", defaultCategory: "服务耗材", enabledByDefault: true }, { id: "technician", label: "技师人工", layer: "direct", defaultCategory: "技师人工", enabledByDefault: true }, { id: "room", label: "场地与设备", layer: "indirect", defaultCategory: "房租水电", enabledByDefault: true }],
    capabilities: { ...standardCapabilities, bom: false, inventory: false, lossTracking: false, appointmentTracking: true },
    coreMetrics: [metrics.grossProfit, metrics.salesRevenue, metrics.customerValue, metrics.laborEfficiency, metrics.cashBalance], homeMetricOrder: ["grossProfit", "salesRevenue", "customerValue", "laborEfficiency", "cashBalance"],
    hiddenCostCategory: "技师人工", hiddenCostDescription: "技师工时、房租水电、设备折旧和预约营销", fundingCostDescription: "设备分期利息、装修周转和融资费用", productCostLabel: "项目成本", productCostAction: "编辑项目成本", productCostEmpty: "还没有项目耗材或人工，先添加一项成本。", quickPrimaryLabel: "服务耗材", quickSecondaryOptions: ["技师人工", "单次场地分摊"], quickUnit: "次",
  }),
  makeTemplate({
    version: 1, key: "stall", name: "商贩", label: "商贸摆摊", shortLabel: "商贩", description: "进货、摊位、损耗、库存与现金", businessItemName: "货品",
    categories: ["进货成本", "摊位费用", "交通配送", "货品损耗", "尾货折价"],
    costItems: [{ id: "purchase", label: "进货成本", layer: "direct", defaultCategory: "进货成本", enabledByDefault: true }, { id: "loss", label: "损耗与尾货", layer: "direct", defaultCategory: "货品损耗", enabledByDefault: true }, { id: "stall", label: "摊位与交通", layer: "indirect", defaultCategory: "摊位费用", enabledByDefault: true }],
    capabilities: { ...standardCapabilities, bom: false, monthlyAllocation: false, platformFees: false },
    coreMetrics: [metrics.grossProfit, metrics.salesRevenue, metrics.inventoryHealth, metrics.lossRate, metrics.cashBalance], homeMetricOrder: ["grossProfit", "cashBalance", "salesRevenue", "inventoryHealth", "lossRate"],
    hiddenCostCategory: "交通配送", hiddenCostDescription: "摊位、交通、尾货损耗和临时人工", fundingCostDescription: "进货周转、摊位押金借款和融资费用", productCostLabel: "货品成本", productCostAction: "编辑货品成本", productCostEmpty: "还没有货品成本明细，先添加一项进货。", quickPrimaryLabel: "拿货价", quickSecondaryOptions: ["摊位交通分摊", "尾货损耗"], quickUnit: "件",
  }),
  makeTemplate({
    version: 1, key: "handmade", name: "手作生产", label: "手作生产", shortLabel: "手作", description: "材料、工时、工具与试做", businessItemName: "手作商品",
    categories: ["材料采购", "包材耗材", "手工工时", "设备工具", "试做报废"],
    costItems: [{ id: "material", label: "材料成本", layer: "direct", defaultCategory: "材料采购", enabledByDefault: true }, { id: "labor", label: "直接人工", layer: "direct", defaultCategory: "手工工时", enabledByDefault: true }, { id: "tool", label: "工具与折旧", layer: "indirect", defaultCategory: "设备工具", enabledByDefault: true }],
    capabilities: standardCapabilities,
    coreMetrics: [metrics.grossProfit, metrics.salesRevenue, metrics.directCost, metrics.laborEfficiency, metrics.lossRate], homeMetricOrder: ["grossProfit", "salesRevenue", "directCost", "laborEfficiency", "lossRate"],
    hiddenCostCategory: "手工工时", hiddenCostDescription: "手工工时、设备折旧、试做报废和包材", fundingCostDescription: "材料备货借款、设备分期利息和融资费用", productCostLabel: "制作成本", productCostAction: "编辑制作成本", productCostEmpty: "还没有制作成本明细，先添加一项材料。", quickPrimaryLabel: "材料成本", quickSecondaryOptions: ["直接人工", "包材费"], quickUnit: "件",
  }),
] as const;

const freezeTemplate = (template: IndustryTemplate): IndustryTemplate => Object.freeze({
  ...template,
  categories: Object.freeze([...template.categories]) as unknown as string[],
  costItems: Object.freeze(template.costItems.map((item) => Object.freeze({ ...item }))) as unknown as IndustryCostItem[],
  capabilities: Object.freeze({ ...template.capabilities }) as IndustryCapabilities,
  coreMetrics: Object.freeze(template.coreMetrics.map((metric) => Object.freeze({ ...metric }))) as unknown as IndustryMetric[],
  homeMetricOrder: Object.freeze([...template.homeMetricOrder]) as unknown as IndustryMetricKey[],
  quickSecondaryOptions: Object.freeze([...template.quickSecondaryOptions]) as unknown as string[],
});

/** 官方模板为冻结只读配置；解析用户偏好时永远不在此对象上写入。 */
export const OFFICIAL_INDUSTRY_TEMPLATES = Object.freeze(Object.fromEntries(officialTemplates.map((template) => [template.key, freezeTemplate(template)])) as Record<IndustryKey, Readonly<IndustryTemplate>>);
export const INDUSTRY_TEMPLATES = Object.freeze(Object.values(OFFICIAL_INDUSTRY_TEMPLATES));
export const DEFAULT_INDUSTRY_KEY: IndustryKey = "catering";

export const getOfficialIndustryTemplate = (key?: IndustryKey | string | null) => OFFICIAL_INDUSTRY_TEMPLATES[IndustryKeySchema.safeParse(key).success ? key as IndustryKey : DEFAULT_INDUSTRY_KEY];

const unique = <T>(items: readonly T[]) => Array.from(new Set(items));

/** 返回可供页面和账本读取的解析配置；所有数组和对象均为新副本。 */
export const resolveIndustryTemplate = (key?: IndustryKey | string | null, rawOverrides?: IndustryTemplateUserOverrides | null): IndustryTemplate => {
  const official = getOfficialIndustryTemplate(key);
  const overrides = IndustryTemplateUserOverridesSchema.safeParse(rawOverrides).success ? rawOverrides : undefined;
  const requestedOrder = overrides?.homeMetricOrder ?? official.homeMetricOrder;
  const supportedMetricKeys = new Set(official.coreMetrics.map((metric) => metric.key));
  const homeMetricOrder = unique(requestedOrder.filter((metric) => supportedMetricKeys.has(metric)));
  const categoryAdditions = unique((overrides?.categoryAdditions ?? []).map((item) => item.trim()).filter(Boolean));
  const costItemAdditions = (overrides?.costItemAdditions ?? []).map((item) => ({ ...item }));
  return {
    ...official,
    name: overrides?.name ?? official.name,
    label: overrides?.name ?? official.label,
    businessItemName: overrides?.businessItemName ?? official.businessItemName,
    categories: unique([...official.categories, ...categoryAdditions]),
    costItems: [...official.costItems.map((item) => ({ ...item })), ...costItemAdditions],
    capabilities: { ...official.capabilities, ...(overrides?.capabilityOverrides ?? {}) },
    coreMetrics: official.coreMetrics.map((metric) => ({ ...metric })),
    homeMetricOrder: homeMetricOrder.length ? homeMetricOrder : [...official.homeMetricOrder],
    quickSecondaryOptions: [...official.quickSecondaryOptions],
  };
};

/** 为持久化前的用户偏好生成经schema校验的新对象，避免调用方保留可变引用。 */
export const normalizeIndustryTemplateOverrides = (overrides?: IndustryTemplateUserOverrides | null) => {
  const parsed = IndustryTemplateUserOverridesSchema.safeParse(overrides);
  if (!parsed.success) return undefined;
  return JSON.parse(JSON.stringify(parsed.data)) as IndustryTemplateUserOverrides;
};
