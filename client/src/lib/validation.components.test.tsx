// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());
import { BomEditorSheet } from "@/components/BomEditorSheet";
import { QuickCostSheet } from "@/components/QuickCostSheet";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { QuickRecordSheet } from "@/components/QuickRecordSheet";
import { CategorySheet, DeleteProductSheet, getHiddenCostAllocation, getHomeAttentionItems, getRefundableSaleQuantity, ImportantMessageBanner, MaterialSheet, MessageInboxSheet, ProductNameSheet, ProductsView, ProfileView, SaleRefundSheet, SalesRecordSheet } from "@/pages/Home";
import { INDUSTRY_TEMPLATES, makeBomVersionSnapshot, seedLedger } from "./ledgerStore";

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
    fireEvent.click(screen.getByRole("button", { name: /社区零售/ }));
    expect(onIndustryChange).toHaveBeenCalledWith("retail");
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

describe("Sale refund and inventory interactions", () => {
  it("confirms a full refund with inventory restoration enabled when the product tracks stock", () => {
    const onConfirm = vi.fn();
    const product = { ...seedLedger().products[0], stockQuantity: 3 };
    render(<SaleRefundSheet product={product} sale={{ id: "sale", productId: product.id, quantity: 2, unitPrice: 10, date: "2026-08-18", note: "" }} onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "确认全额撤销" }));
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
    const quantityInput = screen.getAllByRole("spinbutton")[1];
    fireEvent.change(quantityInput, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /保存材料/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("采购金额、采购数量和换算系数都必须大于0");
  });

  it("records a new purchase as a cash outflow by default while allowing price-only entry", () => {
    const onSave = vi.fn();
    render(<MaterialSheet suggestion={seedLedger().materials[0]} onClose={vi.fn()} onSave={onSave} />);
    const recordPurchase = screen.getByRole("checkbox") as HTMLInputElement;
    expect(recordPurchase.checked).toBe(true);
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
    render(<ProductsView products={ledger.products} activeProductId={ledger.products[0].id} onSelect={vi.fn()} onPricing={vi.fn()} productCostAction="编辑配方" productCostLabel="商品配方" onQuickCost={onQuickCost} onBom={onBom} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /更新成本|录入成本/ }));
    expect(onQuickCost).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /编辑配方/ }));
    expect(onBom).toHaveBeenCalled();
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
