// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());
import { BomEditorSheet } from "@/components/BomEditorSheet";
import { QuickCostSheet } from "@/components/QuickCostSheet";
import { MonthlyAllocationSheet } from "@/components/MonthlyCostSheets";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { QuickRecordSheet } from "@/components/QuickRecordSheet";
import { PricingPanel } from "@/components/PricingPanel";
import { BusinessView, CashRecordsSheet, CategorySheet, CostAnalysisView, DataManagementSheet, DeleteProductSheet, DeleteSaleSheet, getCostAnalysisLines, getCostMixData, getDashboardIssues, getHiddenCostAllocation, getHomeAttentionItems, getProductContributionData, getProductDirectCostTrend, getProfitBridgeData, getRefundableSaleQuantity, HomeView, ImportantMessageBanner, MaterialSheet, MessageInboxSheet, MiniTrendChart, ProductNameSheet, ProductsView, ProfileView, ProfitBridgeChart, QuickEntrySheet, SaleRefundSheet, SalesRecordSheet } from "@/pages/Home";
import { emptyMonthlyFixedCosts, getInventoryHealth, INDUSTRY_TEMPLATES, makeBomVersionSnapshot, seedLedger, summarizeLedger } from "./ledgerStore";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) vi.stubGlobal("ResizeObserver", TestResizeObserver);

describe("OnboardingFlow industry initialization", () => {
  it("submits a non-catering industry with the store name", () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow initialName="" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /社区零售/ }));
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fireEvent.change(screen.getByPlaceholderText("例如：巷口奶茶铺"), { target: { value: "社区便利店" } });
    fireEvent.click(screen.getByRole("button", { name: /开始建账/ }));
    expect(onComplete).toHaveBeenCalledWith({ storeName: "社区便利店", industry: "retail" });
  });
});

describe("ProfileView industry template interactions", () => {
  it("selects a different industry template", () => {
    const onIndustryChange = vi.fn();
    const onToggleCategory = vi.fn();
    render(<ProfileView storeName="测试小店" industry="catering" categories={["食材采购"]} categoryStatus={{ "食材采购": true }} user={null} authLoading={false} cloudAvailable={false} onLogin={vi.fn()} onLogout={vi.fn()} isLoggingOut={false} onDataManagement={vi.fn()} onIndustryChange={onIndustryChange} onAddCategory={vi.fn()} onEditCategory={vi.fn()} onToggleCategory={onToggleCategory} onHiddenCost={vi.fn()} onDebt={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /经营行业/ }));
    fireEvent.click(screen.getByRole("button", { name: /社区零售/ }));
    expect(onIndustryChange).toHaveBeenCalledWith("retail");
    fireEvent.click(screen.getByRole("button", { name: /成本项目/ }));
    fireEvent.click(screen.getByRole("button", { name: /停用食材采购/ }));
    expect(onToggleCategory).toHaveBeenCalledWith("食材采购");
  });
});

describe("Home conclusion attention priority", () => {
  it("puts missing cost and pricing blockers before cash pressure and caps the list", () => {
    const items = getHomeAttentionItems({ missingCostProductCount: 1, unpricedProductCount: 2, cashBalance: -30 });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.action)).toEqual(["products", "products"]);
    expect(items[0].title).toContain("待补成本");
    expect(items[1].title).toContain("未定价");
  });

  it("shows cash pressure when product setup does not block accounting", () => {
    const items = getHomeAttentionItems({ missingCostProductCount: 0, unpricedProductCount: 0, cashBalance: -1 });
    expect(items).toEqual([expect.objectContaining({ tone: "cash", action: "business" })]);
  });
});

describe("Dashboard issue priorities", () => {
  it("prioritizes a sales-snapshot loss, then setup blockers and cash pressure without inventing other issues", () => {
    const issues = getDashboardIssues({
      missingCostProductCount: 1,
      unpricedProductCount: 1,
      cashBalance: -20,
      contributions: [{ productId: 7, name: "亏损商品", revenue: 80, directCost: 92, contribution: -12, quantity: 4 }],
    });
    expect(issues).toHaveLength(3);
    expect(issues[0]).toMatchObject({ tone: "loss", action: "products" });
    expect(issues[0]?.title).toContain("亏损商品");
    expect(issues.map((issue) => issue.id)).not.toContain("cash-negative");
  });

  it("only reports cash pressure when there is no higher-priority product issue", () => {
    expect(getDashboardIssues({ missingCostProductCount: 0, unpricedProductCount: 0, cashBalance: -1, contributions: [] })).toEqual([expect.objectContaining({ id: "cash-negative", tone: "cash", action: "business" })]);
  });

  it("shows a page-level inventory reminder only when tracked stock and observed net sales prove a shortage", () => {
    const ledger = seedLedger();
    ledger.products = [{ ...ledger.products[0], stockQuantity: 1 }];
    ledger.sales = [{ id: "inventory-sale", productId: ledger.products[0]!.id, quantity: 12, unitPrice: 20, date: "2026-08-19", note: "" }];
    const inventory = getInventoryHealth(ledger, "2026-08-19");
    const issues = getDashboardIssues({ missingCostProductCount: 0, unpricedProductCount: 0, cashBalance: 0, contributions: [], inventory });

    expect(issues).toEqual([expect.objectContaining({ id: `stock-low-${ledger.products[0]!.id}`, title: expect.stringContaining("库存不足"), action: "products" })]);
  });
});

describe("Dynamic chart accounting boundaries", () => {
  it("keeps direct, allocated and funding costs separate in the product cost mix", () => {
    const product = { ...seedLedger().products[0], direct: 8, operating: 11 };
    expect(getCostMixData(product, 11, 12.5)).toEqual([
      expect.objectContaining({ key: "direct", amount: 8 }),
      expect.objectContaining({ key: "operating", amount: 3 }),
      expect.objectContaining({ key: "funding", amount: 1.5 }),
    ]);
  });

  it("uses only sales snapshots in the profit bridge and does not treat cash payments as profit costs", () => {
    const rows = getProfitBridgeData({ salesRevenue: 100, costOfSales: 42, allocatedIndirectCosts: 18, financingCosts: 5, operatingResult: 35 });
    expect(rows.map((row) => [row.key, row.amount])).toEqual([["revenue", 100], ["direct", 42], ["allocation", 18], ["funding", 5], ["result", 35]]);
    expect(rows.find((row) => row.key === "result")?.direction).toBe("result");
  });

  it("uses a compact date selector instead of rendering every trend date as a tab", () => {
    const series = Array.from({ length: 30 }, (_, index) => ({ label: `08/${String(index + 1).padStart(2, "0")}`, income: index === 29 ? 3455 : 0, expenses: 0 }));
    render(<MiniTrendChart series={series} rangeLabel="近 30 天" />);
    expect(screen.getByRole("combobox", { name: "选择现金收付日期" })).toBeTruthy();
    expect(screen.queryByRole("tablist", { name: "选择现金收付日期" })).toBeNull();
    expect(screen.getByText("净收付 ¥3,455.00")).toBeTruthy();
  });

  it("keeps only non-zero cost steps in the profit path while preserving the final result", () => {
    render(<ProfitBridgeChart summary={{ salesRevenue: 100, costOfSales: 42, allocatedIndirectCosts: 0, financingCosts: 0, operatingResult: 58 }} />);
    expect(screen.getByRole("button", { name: /销售收入/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /直接成本/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /间接分摊/ })).toBeNull();
    expect(screen.getByRole("button", { name: /经营结果/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /直接成本/ }));
    expect(screen.getByText("扣减 ¥42.00；数据来自已结转销售快照。")).toBeTruthy();
  });

  it("aggregates a product contribution from the sale-time direct-cost snapshot and period refunds", () => {
    const product = { ...seedLedger().products[0], id: 42, name: "快照商品", direct: 99 };
    const sales = [{ id: "sale-1", productId: 42, date: "2026-08-12", quantity: 3, unitPrice: 20, note: "", unitDirectCostSnapshot: 8, refunds: [{ id: "refund-1", date: "2026-08-13", quantity: 1, amount: 20, note: "客户退款", restock: true }] }];
    expect(getProductContributionData([product], sales, "2026-08")).toEqual([expect.objectContaining({ name: "快照商品", revenue: 40, directCost: 16, contribution: 24, quantity: 2 })]);
  });

  it("filters product contribution by the shared 7-day, 30-day and monthly business-date windows", () => {
    const [first, second] = seedLedger().products;
    const products = [{ ...first!, id: 1, name: "月初商品" }, { ...second!, id: 2, name: "月底商品" }];
    const sales = [
      { id: "sale-start", productId: 1, date: "2026-07-01", quantity: 1, unitPrice: 100, note: "", unitDirectCostSnapshot: 40, refunds: [] },
      { id: "sale-mid", productId: 1, date: "2026-07-15", quantity: 3, unitPrice: 20, note: "", unitDirectCostSnapshot: 5, refunds: [{ id: "refund-late", date: "2026-07-28", quantity: 1, amount: 20, note: "退款" }] },
      { id: "sale-late", productId: 2, date: "2026-07-30", quantity: 2, unitPrice: 15, note: "", unitDirectCostSnapshot: 2, refunds: [] },
      { id: "sale-voided", productId: 2, date: "2026-07-30", quantity: 9, unitPrice: 99, note: "", unitDirectCostSnapshot: 1, status: "voided" as const, refunds: [] },
    ];

    expect(getProductContributionData(products, sales, "2026-07", "month")).toEqual([
      expect.objectContaining({ name: "月初商品", revenue: 140, directCost: 50, contribution: 90, quantity: 3 }),
      expect.objectContaining({ name: "月底商品", revenue: 30, directCost: 4, contribution: 26, quantity: 2 }),
    ]);
    expect(getProductContributionData(products, sales, "2026-07", "30d")).toEqual([
      expect.objectContaining({ name: "月初商品", revenue: 40, directCost: 10, contribution: 30, quantity: 2 }),
      expect.objectContaining({ name: "月底商品", revenue: 30, directCost: 4, contribution: 26, quantity: 2 }),
    ]);
    expect(getProductContributionData(products, sales, "2026-07", "7d")).toEqual([
      expect.objectContaining({ name: "月底商品", revenue: 30, directCost: 4, contribution: 26, quantity: 2 }),
      expect.objectContaining({ name: "月初商品", revenue: -20, directCost: -5, contribution: -15, quantity: -1 }),
    ]);
  });
});

describe("HomeView decision dashboard", () => {
  it("presents sales-snapshot profit separately from actual cash in the redesigned homepage", () => {
    const ledger = seedLedger();
    ledger.records = [
      { id: "home-income", type: "income", amount: 100, category: "销售收入", note: "已收", date: "2026-08-08", source: "sale", sourceId: "home-sale" },
      { id: "home-expense", type: "expense", amount: 20, category: "进货采购", note: "采购", date: "2026-08-08", source: "purchase" },
    ];
    ledger.sales = [{ id: "home-sale", productId: ledger.products[0]!.id, date: "2026-08-08", quantity: 5, unitPrice: 20, note: "", unitDirectCostSnapshot: 8, refunds: [] }];
    const summary = summarizeLedger(ledger, "2026-08");
    render(<HomeView ledger={ledger} product={ledger.products[0]!} products={ledger.products} materials={ledger.materials} sales={ledger.sales} summary={summary} period="2026-08" onPeriodChange={vi.fn()} operatingCost={ledger.products[0]!.operating} fullCost={ledger.products[0]!.operating} onPricing={vi.fn()} onAddMaterial={vi.fn()} onEditMaterial={vi.fn()} onRecord={vi.fn()} onBusiness={vi.fn()} onProducts={vi.fn()} readiness={{ stage: "analysis", label: "经营账已就绪", title: "账已开始结转", description: "销售、成本与现金流已形成同一套经营口径。", actionLabel: "查看经营分析" }} onSaveRevenueGoal={vi.fn()} onPrimaryAction={vi.fn()} />);
    expect(screen.getByLabelText("本月经营结果")).toBeTruthy();
    expect(screen.getByText("本月经营利润")).toBeTruthy();
    expect(screen.getByText("销售收入")).toBeTruthy();
    expect(screen.getByText("经营健康度")).toBeTruthy();
    expect(screen.getByText("本月收入目标")).toBeTruthy();
    expect(screen.getByText("现金结余")).toBeTruthy();
    expect(screen.getByLabelText("近7日利润趋势")).toBeTruthy();
    expect(screen.getByText("看收入、成本与现金明细")).toBeTruthy();
    expect(screen.queryByText("现金情况")).toBeNull();
    expect(screen.queryByText("收入与成本对比")).toBeNull();
    expect(screen.getByLabelText("库存健康")).toBeTruthy();
    expect(screen.getByText("还没有启用库存的商品")).toBeTruthy();
    expect(screen.getByText("快速操作")).toBeTruthy();
  });

  it("switches the homepage product contribution ranking without changing the monthly issue calculation", () => {
    const ledger = seedLedger();
    ledger.products = [{ ...ledger.products[0]!, id: 1, name: "月初商品" }, { ...ledger.products[0]!, id: 2, name: "月底商品" }];
    ledger.sales = [
      { id: "sale-start", productId: 1, date: "2026-07-01", quantity: 1, unitPrice: 100, note: "", unitDirectCostSnapshot: 40, refunds: [] },
      { id: "sale-late", productId: 2, date: "2026-07-30", quantity: 2, unitPrice: 15, note: "", unitDirectCostSnapshot: 2, refunds: [] },
    ];
    const summary = summarizeLedger(ledger, "2026-07");
    render(<HomeView ledger={ledger} product={ledger.products[0]!} products={ledger.products} materials={ledger.materials} sales={ledger.sales} summary={summary} period="2026-07" onPeriodChange={vi.fn()} operatingCost={ledger.products[0]!.operating} fullCost={ledger.products[0]!.operating} onPricing={vi.fn()} onAddMaterial={vi.fn()} onEditMaterial={vi.fn()} onRecord={vi.fn()} onBusiness={vi.fn()} onProducts={vi.fn()} readiness={{ stage: "analysis", label: "经营账已就绪", title: "账已开始结转", description: "销售、成本与现金流已形成同一套经营口径。", actionLabel: "查看经营分析" }} onSaveRevenueGoal={vi.fn()} onPrimaryAction={vi.fn()} />);

    expect(screen.getByRole("group", { name: "选择商品贡献范围" })).toBeTruthy();
    expect(screen.getByText("商品赚钱能力 · 本月 TOP 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "7天" }));
    expect(screen.getByText("商品赚钱能力 · 7天 TOP 1")).toBeTruthy();
    expect(screen.getByText("月底商品")).toBeTruthy();
    expect(screen.queryByText("月初商品")).toBeNull();
  });
});

describe("Product cost analysis dashboard", () => {
  it("merges cost lines into a complete-cost structure without creating a cost that is not in the source data", () => {
    const lines = getCostAnalysisLines([
      { label: "咖啡豆", amount: 3.2, source: "材料", layer: "direct" as const },
      { label: "房租", amount: 1.8, source: "月度分摊", layer: "operating" as const },
      { label: "咖啡豆", amount: 0.8, source: "材料", layer: "direct" as const },
    ], 5.8);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ label: "咖啡豆", amount: 4, share: expect.closeTo(4 / 5.8, 6) });
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBeCloseTo(5.8, 6);
  });

  it("uses only completed sales with a saved direct-cost snapshot for the cost trend", () => {
    const trend = getProductDirectCostTrend([
      { id: "trend-one", productId: 1, date: "2026-08-01", quantity: 2, unitPrice: 20, note: "", unitDirectCostSnapshot: 6, refunds: [] },
      { id: "trend-two", productId: 1, date: "2026-08-03", quantity: 2, unitPrice: 20, note: "", unitDirectCostSnapshot: 8, refunds: [] },
      { id: "trend-voided", productId: 1, date: "2026-08-04", quantity: 2, unitPrice: 20, note: "", unitDirectCostSnapshot: 1, status: "voided", refunds: [] },
      { id: "other-product", productId: 2, date: "2026-08-04", quantity: 2, unitPrice: 20, note: "", unitDirectCostSnapshot: 1, refunds: [] },
    ], 1, "30d");
    expect(trend).toEqual([{ date: "2026-08-01", label: "08/01", unitCost: 6 }, { date: "2026-08-03", label: "08/03", unitCost: 8 }]);
  });

  it("keeps simulation separate from product price and renders a product-bound analysis view", () => {
    const ledger = seedLedger();
    const product = { ...ledger.products[0]!, price: 20 };
    render(<CostAnalysisView product={product} products={[product]} costLines={[{ label: "材料", amount: 5, source: "材料明细", layer: "direct" }, { label: "房租", amount: 2, source: "月度分摊", layer: "operating" }]} fullCost={7} directCost={5} period="2026-08" sales={[]} plannedQuantity={10} onBack={vi.fn()} onSelectProduct={vi.fn()} onAddCost={vi.fn()} onPricing={vi.fn()} onAdjustAllocation={vi.fn()} />);
    expect(screen.getByLabelText("单位盈亏结论")).toBeTruthy();
    expect(screen.getByText("成本结构")).toBeTruthy();
    expect(screen.getByText("盈亏模拟")).toBeTruthy();
    expect(screen.getByText("保本分析")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "减少售价" }));
    expect((screen.getByLabelText("模拟售价") as HTMLInputElement).value).toBe("19");
    expect(product.price).toBe(20);
  });

  it("guides a product without cost data to add its first cost", () => {
    const onAddCost = vi.fn();
    const product = { ...seedLedger().products[0]!, price: 20, direct: 0, operating: 0, bom: [] };
    render(<CostAnalysisView product={product} products={[product]} costLines={[]} fullCost={0} directCost={0} period="2026-08" sales={[]} plannedQuantity={0} onBack={vi.fn()} onSelectProduct={vi.fn()} onAddCost={onAddCost} onPricing={vi.fn()} onAdjustAllocation={vi.fn()} />);
    expect(screen.getAllByText("还没有成本数据").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /添加成本/ })[0]!);
    expect(onAddCost).toHaveBeenCalledTimes(1);
  });
});

describe("QuickEntrySheet unified record entry", () => {
  it("offers sales, general records, material purchases and product creation from one entry", () => {
    const onChoose = vi.fn();
    render(<QuickEntrySheet hasProducts onClose={vi.fn()} onChoose={onChoose} />);
    expect(screen.getByText("卖商品")).toBeTruthy();
    expect(screen.getByText("记收支")).toBeTruthy();
    expect(screen.getByText("采购材料")).toBeTruthy();
    expect(screen.getByText("新建商品")).toBeTruthy();
    fireEvent.click(screen.getByText("采购材料"));
    expect(onChoose).toHaveBeenCalledWith("purchase");
  });

  it("explains that sales start by creating a product when none exists", () => {
    render(<QuickEntrySheet hasProducts={false} onClose={vi.fn()} onChoose={vi.fn()} />);
    expect(screen.getByText("先新建商品，再记录销售")).toBeTruthy();
  });
});

describe("Product archive and hidden-cost allocation", () => {
  it("explains that sold products are archived and requires an explicit confirmation", () => {
    const onConfirm = vi.fn();
    render(<DeleteProductSheet product={seedLedger().products[0]} saleCount={2} onClose={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText(/历史销售、收入与成本快照会保留/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认归档" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("allocates rent, utilities and labor across the entered period quantity", () => {
    expect(getHiddenCostAllocation([{ id: "rent", label: "房租", amount: 900 }, { id: "water", label: "水电", amount: 90 }, { id: "labor", label: "人工", amount: 210 }], 300, 0)).toBe(4);
    expect(getHiddenCostAllocation([], 0, 1.2)).toBe(1.2);
  });
});

describe("PricingPanel cost traceability", () => {
  it("lists direct costs, indirect allocations and funding costs with their sources", () => {
    render(<PricingPanel productName="手作挂饰" costs={{ directCost: 8, fixedCost: 2, hiddenCost: 0, fundingCost: 0.5, feeRate: 3 }} costLines={[{ label: "材料", amount: 6, source: "材料明细", layer: "direct" }, { label: "包装", amount: 2, source: "商品成本", layer: "direct" }, { label: "房租", amount: 2, source: "2026年8月 · 按产量分摊", layer: "operating" }, { label: "利息及融资费用", amount: 0.5, source: "资金成本设置", layer: "funding" }]} onClose={vi.fn()} />);
    expect(screen.getByText("成本与分摊明细")).toBeTruthy();
    expect(screen.getByText("材料明细")).toBeTruthy();
    expect(screen.getByText("2026年8月 · 按产量分摊")).toBeTruthy();
    fireEvent.click(screen.getByText("价格怎么推出来？"));
    expect(screen.getByText("反推分母")).toBeTruthy();
  });

  it("shows revenue-share evidence and warns when one unit bears the entire monthly allocation", () => {
    const onAdjustAllocation = vi.fn();
    render(<PricingPanel productName="手作挂饰" costs={{ directCost: 8.5, fixedCost: 470, hiddenCost: 0, fundingCost: 0, feeRate: 0 }} costLines={[{ label: "拿货价", amount: 8.5, source: "商品成本", layer: "direct" }, { label: "房租", amount: 150, source: "2026年8月 · 按销售额分摊", layer: "operating" }, { label: "人工", amount: 300, source: "2026年8月 · 按销售额分摊", layer: "operating" }, { label: "水电", amount: 20, source: "2026年8月 · 按销售额分摊", layer: "operating" }]} allocationContext={{ periodLabel: "2026年8月", method: "revenue", monthlyIndirectTotal: 470, productIndirectTotal: 470, unitIndirectCost: 470, allocationShare: 1, outputQuantity: 1, productSalesAmount: 1000, totalSalesAmount: 1000, effectiveFrom: "2026-08-01", effectiveTo: "2026-08-31", effectiveDays: 31, daysInPeriod: 31, timeFactor: 1 }} onClose={vi.fn()} onAdjustAllocation={onAdjustAllocation} />);
    expect(screen.getByText("本月分摊依据")).toBeTruthy();
    expect(screen.getByText("销售额占比")).toBeTruthy();
    expect(screen.getByText("100.0%")).toBeTruthy();
    expect(screen.getByText("当前商品承担了本月全部间接费用")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "检查并调整本月分摊" }));
    expect(onAdjustAllocation).toHaveBeenCalledOnce();
  });

  it("keeps zero-value fees visually empty and lets a target margin be cleared and re-entered", () => {
    render(<PricingPanel costs={{ directCost: 6, fixedCost: 0, hiddenCost: 0, fundingCost: 0, feeRate: 3 }} onClose={vi.fn()} />);
    expect(screen.getByText(/这里使用“利润率”/)).toBeTruthy();
    expect(screen.getByText(/不同于“加价率”/)).toBeTruthy();
    const target = screen.getByRole("spinbutton", { name: "目标利润率" });
    const fixedFee = screen.getByRole("spinbutton", { name: "每单固定费用" });
    expect((fixedFee as HTMLInputElement).value).toBe("");
    fireEvent.change(target, { target: { value: "" } });
    expect((target as HTMLInputElement).value).toBe("");
    expect(screen.getByText("请填写目标利润率。")).toBeTruthy();
    fireEvent.change(target, { target: { value: "80" } });
    expect((target as HTMLInputElement).value).toBe("80");
    expect(screen.queryByText("请填写目标利润率。")).toBeNull();
    fireEvent.change(target, { target: { value: "98" } });
    expect(screen.getByText(/目标利润率与平台费率合计必须小于 100%/)).toBeTruthy();
  });
});

describe("Sale refund and inventory interactions", () => {
  it("confirms a full refund with inventory restoration enabled when the product tracks stock", () => {
    const onConfirm = vi.fn();
    const product = { ...seedLedger().products[0], stockQuantity: 3 };
    render(<SaleRefundSheet product={product} sale={{ id: "sale", productId: product.id, quantity: 2, unitPrice: 10, date: "2026-08-18", note: "" }} onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "确认全额退款并标为撤销" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2, amount: 20, restock: true }));
  });

  it("limits refundable quantity to the original quantity less prior refunds", () => {
    expect(getRefundableSaleQuantity({ id: "sale", productId: 1, quantity: 5, unitPrice: 10, date: "2026-08-18", note: "", refunds: [{ id: "r1", quantity: 2, amount: 20, date: "2026-08-18", note: "" }] })).toBe(3);
  });

  it("blocks a sale that exceeds enabled stock", () => {
    const onSave = vi.fn();
    const product = { ...seedLedger().products[0], price: 12, stockQuantity: 1 };
    render(<SalesRecordSheet products={[product]} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /保存并结转/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("可售库存仅剩");
  });
});

describe("Monthly indirect-cost allocation", () => {
  it("saves output-based rent and equipment depreciation inputs as a monthly plan", () => {
    const onSave = vi.fn();
    const product = { ...seedLedger().products[0], bom: [] };
    render(<MonthlyAllocationSheet period="2026-08" products={[product]} onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getAllByText("本期费用").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(`${product.name}本期产量`)).toBeNull();
    fireEvent.change(screen.getByLabelText("房租月费"), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: "设备折旧、时间比例和其他费用" }));
    fireEvent.click(screen.getByRole("button", { name: /新增设备/ }));
    fireEvent.change(screen.getByLabelText("设备采购价"), { target: { value: "3600" } });
    fireEvent.change(screen.getByLabelText("设备使用月数"), { target: { value: "36" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getAllByText("怎么分").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getAllByText("确认商品").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(`${product.name}本期产量`), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /保存本期分摊/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ period: "2026-08", method: "output", fixedCosts: expect.objectContaining({ rent: 900 }), products: [expect.objectContaining({ outputQuantity: 100 })] }));
  });

  it("saves an effective date range and prorated-month setting with the allocation plan", () => {
    const onSave = vi.fn();
    const product = { ...seedLedger().products[0], bom: [] };
    render(<MonthlyAllocationSheet period="2026-08" products={[product]} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "设备折旧、时间比例和其他费用" }));
    fireEvent.change(screen.getByLabelText("分摊开始日期"), { target: { value: "2026-08-17" } });
    fireEvent.change(screen.getByLabelText("分摊结束日期"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: /整月预算按天折算/ }));
    fireEvent.change(screen.getByLabelText("房租月费"), { target: { value: "310" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText(`${product.name}本期产量`), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /保存本期分摊/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ effectiveFrom: "2026-08-17", effectiveTo: "2026-08-31", costTiming: "prorated" }));
  });

  it("requires confirmation before deleting a saved monthly allocation plan", () => {
    const onDelete = vi.fn();
    const product = { ...seedLedger().products[0], bom: [] };
    const plan = { id: "plan-2026-08", period: "2026-08", method: "output" as const, totalProductionHours: 0, fixedCosts: { ...emptyMonthlyFixedCosts(), rent: 100 }, products: [{ productId: product.id, outputQuantity: 10, unitHours: 0, salesAmount: 0, weight: 1 }], updatedAt: "2026-08-18T00:00:00.000Z" };
    render(<MonthlyAllocationSheet period="2026-08" products={[product]} initialPlan={plan} onClose={vi.fn()} onSave={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "删除本月分摊" }));
    expect(screen.getByText("删除本月分摊？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

describe("CashRecordsSheet corrections", () => {
  it("deletes manual cash records after confirmation and keeps sale-generated records on the sales correction path", () => {
    const onDelete = vi.fn();
    render(<CashRecordsSheet period="2026-08" records={[
      { id: "manual", type: "expense", amount: 88, category: "物流配送", note: "手工补录", date: "2026-08-18", source: "manual" },
      { id: "sale", type: "income", amount: 120, category: "销售收入", note: "商品销售", date: "2026-08-18", source: "sale", sourceId: "sale-1" },
    ]} onClose={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "删除物流配送流水" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(onDelete).toHaveBeenCalledWith("manual");
    expect(screen.getByText("请在销售记录中更正")).toBeTruthy();
  });
});

describe("DataManagementSheet local reset", () => {
  it("requires explicit confirmation before clearing the current device ledger", () => {
    const onClearLocal = vi.fn();
    render(<DataManagementSheet isAuthenticated={false} cloudAvailable={false} isBackingUp={false} onClose={vi.fn()} onLogin={vi.fn()} onBackup={vi.fn()} onRestoreCloud={vi.fn()} onExport={vi.fn()} onImport={vi.fn()} onClearLocal={onClearLocal} />);
    expect(screen.getByText("日常备份与恢复")).toBeTruthy();
    expect(screen.getByText("高级数据操作")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清空当前设备账本" }));
    expect(screen.getByText("清空当前设备的全部账本数据？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认清空" }));
    expect(onClearLocal).toHaveBeenCalledOnce();
  });
});

describe("MessageInboxSheet interactions", () => {
  it("opens complete content, marks an unread message as read and uses its app action", () => {
    const onMarkRead = vi.fn();
    const onAction = vi.fn();
    render(<MessageInboxSheet isAuthenticated loading={false} unreadCount={1} onClose={vi.fn()} onLogin={vi.fn()} onMarkRead={onMarkRead} onMarkAll={vi.fn()} onAction={onAction} messages={[{ id: 9, title: "请及时备份账本", summary: "换设备前先创建一份云端备份。", body: "完整说明：恢复前确认账本来源。", level: "safety", actionLabel: "打开我的", actionPath: "/?tab=profile", publishedAt: new Date("2026-08-18T01:00:00.000Z"), readAt: null, createdAt: new Date("2026-08-18T01:00:00.000Z") }]} />);
    fireEvent.click(screen.getByRole("button", { name: /请及时备份账本/ }));
    expect(onMarkRead).toHaveBeenCalledWith(9);
    expect(screen.getByText("完整说明：恢复前确认账本来源。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /打开我的/ }));
    expect(onAction).toHaveBeenCalledWith("/?tab=profile");
  });

  it("lets a user close the one-time important announcement prompt", () => {
    const onDismiss = vi.fn();
    render(<ImportantMessageBanner message={{ id: 10, title: "服务规则更新", summary: "请在本月内查看说明。", body: null, level: "important", actionLabel: null, actionPath: null, publishedAt: new Date(), readAt: null, createdAt: new Date() }} onDismiss={onDismiss} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭重要公告" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("requests a server-backed importance-level filter", () => {
    const onLevelFilterChange = vi.fn();
    render(<MessageInboxSheet isAuthenticated loading={false} unreadCount={0} levelFilter="all" onLevelFilterChange={onLevelFilterChange} onClose={vi.fn()} onLogin={vi.fn()} onMarkRead={vi.fn()} onMarkAll={vi.fn()} onAction={vi.fn()} messages={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "账本安全" }));
    expect(onLevelFilterChange).toHaveBeenCalledWith("safety");
  });

  it("shows derived operating reminders separately from server unread messages and routes their action", () => {
    const onAction = vi.fn();
    render(<MessageInboxSheet isAuthenticated={false} loading={false} unreadCount={0} onClose={vi.fn()} onLogin={vi.fn()} onMarkRead={vi.fn()} onMarkAll={vi.fn()} onAction={onAction} messages={[]} operatingReminders={[{ id: "sales-stale", severity: "info", title: "已连续 7 天未记录销售", summary: "最近一笔销售已超过7天。", action: "record", actionLabel: "记录销售" }]} />);
    expect(screen.getByLabelText("经营提醒")).toBeTruthy();
    expect(screen.getByText("不计入未读，不会发送给他人。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /记录销售/ }));
    expect(onAction).toHaveBeenCalledWith("/?action=sale");
  });
});

describe("CategorySheet interactions", () => {
  it("rejects an empty or duplicate category and accepts a custom cost item", () => {
    const onSave = vi.fn();
    render(<CategorySheet initialName={null} existing={["食材采购"]} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /添加项目/ }));
    expect(screen.getByRole("alert").textContent).toContain("请填写成本项目名称");
    fireEvent.change(screen.getByPlaceholderText("例如：平台佣金、工具折旧"), { target: { value: "食材采购" } });
    fireEvent.click(screen.getByRole("button", { name: /添加项目/ }));
    expect(screen.getByRole("alert").textContent).toContain("这个成本项目已经存在");
    fireEvent.change(screen.getByPlaceholderText("例如：平台佣金、工具折旧"), { target: { value: "设备折旧" } });
    fireEvent.click(screen.getByRole("button", { name: /添加项目/ }));
    expect(onSave).toHaveBeenCalledWith("设备折旧");
  });
});

describe("ProductNameSheet interactions", () => {
  it("rejects an empty name and accepts a custom name", () => {
    const onSave = vi.fn();
    render(<ProductNameSheet onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /创建商品/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("请填写商品名称");
    fireEvent.change(screen.getByPlaceholderText("例如：招牌冰咖啡"), { target: { value: "冰柠檬茶" } });
    fireEvent.click(screen.getByRole("button", { name: /创建商品/ }));
    expect(onSave).toHaveBeenCalledWith("冰柠檬茶");
  });
});

describe("MaterialSheet interactions", () => {
  it("starts a new material purchase with blank values instead of fake defaults", () => {
    render(<MaterialSheet suggestion={seedLedger().materials[0]} onClose={vi.fn()} onSave={vi.fn()} />);
    expect((screen.getByLabelText("材料采购金额") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("材料采购数量") as HTMLInputElement).value).toBe("");
    expect(screen.queryByLabelText("材料换算系数")).toBeNull();
    expect((screen.getByLabelText("材料采购单位") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("材料使用单位") as HTMLSelectElement).value).toBe("");
  });

  it("hides conversion for the same purchase and usage unit, then saves at a 1:1 factor", () => {
    const onSave = vi.fn();
    render(<MaterialSheet suggestion={seedLedger().materials[0]} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText(/例如：/), { target: { value: "矿泉水" } });
    fireEvent.change(screen.getByLabelText("材料采购金额"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("材料采购数量"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("材料采购单位"), { target: { value: "瓶" } });
    fireEvent.change(screen.getByLabelText("材料使用单位"), { target: { value: "瓶" } });
    expect(screen.queryByLabelText("材料换算系数")).toBeNull();
    expect(screen.getByText("金额 ÷ 数量（同单位按1:1换算）")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /保存材料/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ conversionFactor: 1, unitCost: 2 }), expect.any(Object));
  });

  it("shows and requires conversion when purchase and usage units differ", () => {
    const onSave = vi.fn();
    render(<MaterialSheet suggestion={seedLedger().materials[0]} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText(/例如：/), { target: { value: "纸杯" } });
    fireEvent.change(screen.getByLabelText("材料采购金额"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("材料采购数量"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("材料采购单位"), { target: { value: "盒" } });
    fireEvent.change(screen.getByLabelText("材料使用单位"), { target: { value: "个" } });
    expect(screen.getByLabelText("材料换算系数")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /保存材料/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("采购金额、采购数量和换算系数都必须大于0");
    fireEvent.change(screen.getByLabelText("材料换算系数"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: /保存材料/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ conversionFactor: 24, unitCost: 1 }), expect.any(Object));
  });

  it("edits an existing material while preserving its id", () => {
    const onSave = vi.fn();
    const material = seedLedger().materials[0];
    render(<MaterialSheet editingMaterial={material} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByDisplayValue(material.name), { target: { value: "改名后的材料" } });
    fireEvent.click(screen.getByRole("button", { name: /保存修改/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: material.id, name: "改名后的材料" }));
    expect(onSave.mock.calls[0][0].unitCost).toBeGreaterThan(0);
  });

  it("shows an error and does not call onSave for zero purchase quantity", () => {
    const onSave = vi.fn();
    render(<MaterialSheet suggestion={seedLedger().materials[0]} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText(/例如：/), { target: { value: "纸杯" } });
    fireEvent.change(screen.getByLabelText("材料采购金额"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("材料采购数量"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("材料采购单位"), { target: { value: "盒" } });
    fireEvent.change(screen.getByLabelText("材料使用单位"), { target: { value: "个" } });
    fireEvent.change(screen.getByLabelText("材料换算系数"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /保存材料/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("采购金额、采购数量和换算系数都必须大于0");
  });

  it("records a new purchase as a cash outflow by default while allowing price-only entry", () => {
    const onSave = vi.fn();
    render(<MaterialSheet suggestion={seedLedger().materials[0]} onClose={vi.fn()} onSave={onSave} />);
    const recordPurchase = screen.getByRole("checkbox") as HTMLInputElement;
    expect(recordPurchase.checked).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/例如：/), { target: { value: "纸杯" } });
    fireEvent.change(screen.getByLabelText("材料采购金额"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("材料采购数量"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("材料采购单位"), { target: { value: "盒" } });
    fireEvent.change(screen.getByLabelText("材料使用单位"), { target: { value: "个" } });
    fireEvent.change(screen.getByLabelText("材料换算系数"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("采购业务日期"), { target: { value: "2026-07-20" } });
    fireEvent.click(screen.getByRole("button", { name: /保存材料/ }));
    expect(onSave).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ recordPurchase: true, date: "2026-07-20" }));
  });
});

describe("QuickRecordSheet interactions", () => {
  it("starts with an empty amount and separates financing categories with an explanatory hint", () => {
    const onSave = vi.fn();
    render(<QuickRecordSheet categories={["货品采购", "物流配送"]} onClose={vi.fn()} onSave={onSave} />);
    const amount = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(amount.value).toBe("");
    expect((screen.getByRole("button", { name: /^保存$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("经营")).toBeTruthy();
    expect(screen.getByText("借款")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "本金还款" }));
    expect(screen.getByText("本金还款会减少手上现金，但不计入经营成本。")).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "88" } });
    fireEvent.change(screen.getByLabelText("流水业务日期"), { target: { value: "2026-07-20" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: 88, date: "2026-07-20", category: "本金还款" }));
  });
});

describe("SalesRecordSheet interactions", () => {
  it("blocks an unpriced product, clears the error after switching, accepts a priced sale, and still blocks a zero transaction price", () => {
    const ledger = seedLedger();
    const unpriced = { ...ledger.products[0], id: 91, name: "未定价商品", price: 0 };
    const priced = { ...ledger.products[1], id: 92, name: "已定价商品", price: 12 };
    const onSave = vi.fn();
    render(<SalesRecordSheet products={[unpriced, priced]} onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByLabelText("本次销售预计经营反馈")).toBeTruthy();
    expect(screen.getByText("预计经营贡献")).toBeTruthy();
    expect(screen.getByText("预计毛利率")).toBeTruthy();
    expect(screen.getByText("按当前单件经营成本估算；保存后会冻结当时成本快照，实际利润以已结转销售为准。")).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton", { name: "销售成交价" }), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: /保存并结转/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("请先设置商品售价");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: String(priced.id) } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /保存并结转/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ productId: priced.id, unitPrice: 12, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));

    fireEvent.change(screen.getByRole("spinbutton", { name: "销售成交价" }), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /保存并结转/ }));
    expect(screen.getByRole("alert").textContent).toContain("成交价必须大于0");
  });
});

describe("QuickCostSheet interactions", () => {
  it("requires only a primary amount and saves the two industry-preset cost items", () => {
    const ledger = seedLedger();
    const onSave = vi.fn();
    const template = INDUSTRY_TEMPLATES.find((item) => item.key === "retail")!;
    render(<QuickCostSheet product={{ ...ledger.products[0], bom: [] }} template={template} onClose={vi.fn()} onOpenAdvanced={vi.fn()} onSave={onSave} />);
    expect(screen.getByText("进货价")).toBeTruthy();
    expect(screen.getByText("单件配送费")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /保存并生成成本版本/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("主成本必须大于 0");
    fireEvent.change(screen.getByRole("spinbutton", { name: "主成本金额" }), { target: { value: "6.5" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "附加成本金额" }), { target: { value: "0.8" } });
    fireEvent.click(screen.getByRole("button", { name: /保存并生成成本版本/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ customName: "进货价", customUnit: "件", customUnitCost: 6.5, presetId: "quick-primary" }), expect.objectContaining({ customName: "单件配送费", customUnitCost: 0.8, presetId: "quick-secondary" })], lossRate: 0, batchYield: 1 }));
  });

  it("keeps the material editor as an explicit secondary route from the product detail", () => {
    const ledger = seedLedger();
    const onQuickCost = vi.fn();
    const onBom = vi.fn();
    render(<ProductsView products={ledger.products} activeProductId={ledger.products[0].id} fundingCost={0} sales={ledger.sales} period="2026-08" onSelect={vi.fn()} onPricing={vi.fn()} productCostAction="编辑配方" productCostLabel="商品配方" onQuickCost={onQuickCost} onBom={onBom} onAdd={vi.fn()} />);
    expect(screen.getAllByText("单件利润").length).toBeGreaterThan(0);
    expect(screen.getAllByText("毛利率").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "打开直接成本录入" }));
    expect(onQuickCost).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    fireEvent.click(screen.getByRole("button", { name: /编辑配方/ }));
    expect(onBom).toHaveBeenCalled();
  });

  it("keeps list and selected-detail unit price, cost, profit and margin on the same product calculation", () => {
    const ledger = seedLedger();
    const product = { ...ledger.products[0], price: 100, operating: 40, direct: 40, bom: [] };
    render(<ProductsView products={[product]} activeProductId={product.id} fundingCost={0} sales={[]} period="2026-08" onSelect={vi.fn()} onPricing={vi.fn()} productCostAction="编辑配方" productCostLabel="商品配方" onQuickCost={vi.fn()} onBom={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getAllByText("¥100.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("¥40.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("¥60.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("60.0%").length).toBeGreaterThanOrEqual(2);
  });
});

describe("DeleteSaleSheet interactions", () => {
  it("requires an explicit confirmation to delete a sale and explains that refunds will be removed with it", () => {
    const onConfirm = vi.fn();
    const product = { ...seedLedger().products[0], stockQuantity: 3 };
    const sale = { id: "sale", productId: product.id, quantity: 2, unitPrice: 12, date: "2026-08-18", note: "", refunds: [{ id: "refund", quantity: 1, amount: 12, date: "2026-08-18", note: "退款", restock: true }] };
    render(<DeleteSaleSheet sale={sale} product={product} onClose={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText("已退款 ¥12.00，将一并删除退款记录。")).toBeTruthy();
    expect(screen.getByText("仅用于录入错误")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认删除录错" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("BusinessView cash and cost-analysis layers", () => {
  it("defaults to actual cash and separately reveals sales-snapshot profit analysis", () => {
    const ledger = { ...seedLedger(), records: [{ id: "cash-1", type: "expense" as const, amount: 88, category: "房租", note: "8月房租", date: "2026-08-18", source: "manual" as const }], sales: [] };
    const summary = summarizeLedger(ledger, "2026-08");
    render(<BusinessView summary={summary} productCount={ledger.products.length} period="2026-08" onPeriodChange={vi.fn()} onPricing={vi.fn()} onRecord={vi.fn()} onSale={vi.fn()} onCashRecords={vi.fn()} sales={ledger.sales} products={ledger.products} onRefund={vi.fn()} onDeleteSale={vi.fn()} />);
    expect(screen.getByLabelText("本期经营利润")).toBeTruthy();
    expect(screen.getByText("本期现金结余")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /销售快照成本/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /利润分析/ }));
    expect(screen.getByText("本期还没有销售结转利润")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /销售快照成本/ })).toBeTruthy();
  });
});

describe("BomEditorSheet interactions", () => {
  it("restores a historical cost snapshot after material price changes", () => {
    const ledger = seedLedger();
    const version = makeBomVersionSnapshot(ledger.products[0], ledger.materials, { lossRate: 10, batchYield: 2 }, "2026-08-17");
    ledger.materials[0].unitCost = 9;
    const onSave = vi.fn();
    render(<BomEditorSheet product={{ ...ledger.products[0], bomVersions: [version] }} materials={ledger.materials} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByText("版本记录"));
    fireEvent.click(screen.getByRole("button", { name: /恢复/ }));
    fireEvent.click(screen.getByRole("button", { name: /保存并重新核算/ }));
    expect(onSave).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ costSnapshot: expect.objectContaining({ directCost: version.directCost, materialUnitCosts: version.materialUnitCosts, packaging: version.packaging, directLabor: version.directLabor }) }));
  });

  it("saves the selected active custom cost category with the product cost", () => {
    const ledger = seedLedger();
    const onSave = vi.fn();
    render(<BomEditorSheet product={ledger.products[0]} materials={ledger.materials} categories={["食材采购", "设备折旧"]} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "设备折旧" } });
    fireEvent.click(screen.getByRole("button", { name: /保存并重新核算/ }));
    expect(onSave).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ costCategory: "设备折旧" }));
  });

  it("adds and saves a custom cost detail with its own name and unit", () => {
    const ledger = seedLedger();
    const onSave = vi.fn();
    render(<BomEditorSheet product={{ ...ledger.products[0], bom: [] }} materials={ledger.materials} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByRole("combobox", { name: "新增成本明细类型" }), { target: { value: "custom" } });
    fireEvent.click(screen.getByRole("button", { name: /新增自定义项目/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "自定义成本名称" }), { target: { value: "平台服务费" } });
    fireEvent.change(screen.getByRole("textbox", { name: "自定义成本单位" }), { target: { value: "单" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "自定义成本单价" }), { target: { value: "1.5" } });
    expect(screen.getByText("¥2.58")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /保存并重新核算/ }));
    expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ customName: "平台服务费", customUnit: "单", customUnitCost: 1.5, quantity: 1 })], expect.any(Object));
  });

  it("trims custom detail text fields and persists a user-entered quantity", () => {
    const ledger = seedLedger();
    const onSave = vi.fn();
    render(<BomEditorSheet product={{ ...ledger.products[0], bom: [] }} materials={ledger.materials} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByRole("combobox", { name: "新增成本明细类型" }), { target: { value: "custom" } });
    fireEvent.click(screen.getByRole("button", { name: /新增自定义项目/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "自定义成本名称" }), { target: { value: "  平台服务费  " } });
    fireEvent.change(screen.getByRole("textbox", { name: "自定义成本单位" }), { target: { value: " 单 " } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "自定义成本单价" }), { target: { value: "1.5" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "自定义成本数量" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /保存并重新核算/ }));
    expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ customName: "平台服务费", customUnit: "单", customUnitCost: 1.5, quantity: 2 })], expect.any(Object));
  });

  it("blocks saving a custom cost detail without a name", () => {
    const ledger = seedLedger();
    const onSave = vi.fn();
    render(<BomEditorSheet product={{ ...ledger.products[0], bom: [] }} materials={ledger.materials} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByRole("combobox", { name: "新增成本明细类型" }), { target: { value: "custom" } });
    fireEvent.click(screen.getByRole("button", { name: /新增自定义项目/ }));
    fireEvent.click(screen.getByRole("button", { name: /保存并重新核算/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("自定义成本项目需要填写名称");
    expect(screen.getByText("请填写项目名称")).toBeTruthy();
  });

  it("shows an error and does not call onSave for zero BOM quantity", () => {
    const ledger = seedLedger();
    const onSave = vi.fn();
    render(<BomEditorSheet product={ledger.products[0]} materials={ledger.materials} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByDisplayValue("18"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /保存并重新核算/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("每项材料用量必须大于0");
  });
});
