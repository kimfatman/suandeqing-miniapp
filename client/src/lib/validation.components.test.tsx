// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());
import { BomEditorSheet } from "@/components/BomEditorSheet";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { QuickRecordSheet } from "@/components/QuickRecordSheet";
import { CategorySheet, MaterialSheet, ProductNameSheet, ProfileView } from "@/pages/Home";
import { makeBomVersionSnapshot, seedLedger } from "./ledgerStore";

describe("OnboardingFlow industry initialization", () => {
  it("submits a non-catering industry with the store name", () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow initialName="" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /社区零售/ }));
    fireEvent.click(screen.getByRole("button", { name: /按这个行业准备成本账/ }));
    fireEvent.change(screen.getByPlaceholderText("例如：巷口奶茶铺"), { target: { value: "社区便利店" } });
    fireEvent.click(screen.getByRole("button", { name: /开始算第一笔账/ }));
    expect(onComplete).toHaveBeenCalledWith({ storeName: "社区便利店", industry: "retail" });
  });
});

describe("ProfileView industry template interactions", () => {
  it("selects a different industry template", () => {
    const onIndustryChange = vi.fn();
    const onToggleCategory = vi.fn();
    render(<ProfileView storeName="测试小店" industry="catering" categories={["食材采购"]} categoryStatus={{ "食材采购": true }} onIndustryChange={onIndustryChange} onAddCategory={vi.fn()} onEditCategory={vi.fn()} onToggleCategory={onToggleCategory} onHiddenCost={vi.fn()} onDebt={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /社区零售/ }));
    expect(onIndustryChange).toHaveBeenCalledWith("retail");
    fireEvent.click(screen.getByRole("button", { name: /停用食材采购/ }));
    expect(onToggleCategory).toHaveBeenCalledWith("食材采购");
  });
});

describe("CategorySheet interactions", () => {
  it("rejects an empty or duplicate category and accepts a custom cost item", () => {
    const onSave = vi.fn();
    render(<CategorySheet initialName={null} existing={["食材采购"]} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /添加成本项目/ }));
    expect(screen.getByRole("alert").textContent).toContain("请填写成本项目名称");
    fireEvent.change(screen.getByPlaceholderText("例如：平台佣金、工具折旧"), { target: { value: "食材采购" } });
    fireEvent.click(screen.getByRole("button", { name: /添加成本项目/ }));
    expect(screen.getByRole("alert").textContent).toContain("这个成本项目已经存在");
    fireEvent.change(screen.getByPlaceholderText("例如：平台佣金、工具折旧"), { target: { value: "设备折旧" } });
    fireEvent.click(screen.getByRole("button", { name: /添加成本项目/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /保存材料修改/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: material.id, name: "改名后的材料" }));
    expect(onSave.mock.calls[0][0].unitCost).toBeGreaterThan(0);
  });

  it("shows an error and does not call onSave for zero purchase quantity", () => {
    const onSave = vi.fn();
    render(<MaterialSheet suggestion={seedLedger().materials[0]} onClose={vi.fn()} onSave={onSave} />);
    const quantityInput = screen.getAllByRole("spinbutton")[1];
    fireEvent.change(quantityInput, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /保存原材料/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("采购金额、采购数量和换算系数都必须大于0");
  });

  it("records a new purchase as a cash outflow by default while allowing price-only entry", () => {
    const onSave = vi.fn();
    render(<MaterialSheet suggestion={seedLedger().materials[0]} onClose={vi.fn()} onSave={onSave} />);
    const recordPurchase = screen.getByRole("checkbox") as HTMLInputElement;
    expect(recordPurchase.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /保存原材料/ }));
    expect(onSave).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ recordPurchase: true }));
  });
});

describe("QuickRecordSheet interactions", () => {
  it("starts with an empty amount and separates financing categories with an explanatory hint", () => {
    const onSave = vi.fn();
    render(<QuickRecordSheet categories={["货品采购", "物流配送"]} onClose={vi.fn()} onSave={onSave} />);
    const amount = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(amount.value).toBe("");
    expect((screen.getByRole("button", { name: /保存这笔账/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("经营支出")).toBeTruthy();
    expect(screen.getByText("借款与还款")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "本金还款" }));
    expect(screen.getByText("本金还款会减少手上现金，但不计入经营成本。")).toBeTruthy();
  });
});

describe("BomEditorSheet interactions", () => {
  it("restores a historical cost snapshot after material price changes", () => {
    const ledger = seedLedger();
    const version = makeBomVersionSnapshot(ledger.products[0], ledger.materials, { lossRate: 10, batchYield: 2 }, "2026-08-17");
    ledger.materials[0].unitCost = 9;
    const onSave = vi.fn();
    render(<BomEditorSheet product={{ ...ledger.products[0], bomVersions: [version] }} materials={ledger.materials} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByText("成本如何变化？"));
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
