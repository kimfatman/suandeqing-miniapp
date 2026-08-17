// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());
import { BomEditorSheet } from "@/components/BomEditorSheet";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { MaterialSheet, ProductNameSheet, ProfileView } from "@/pages/Home";
import { makeBomVersionSnapshot, seedLedger } from "./ledgerStore";

describe("OnboardingFlow industry initialization", () => {
  it("submits a non-catering industry with the store name", () => {
    const onComplete = vi.fn();
    render(<OnboardingFlow initialName="" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /社区零售/ }));
    fireEvent.click(screen.getByRole("button", { name: /按这个行业建账/ }));
    fireEvent.change(screen.getByPlaceholderText("例如：巷口奶茶铺"), { target: { value: "社区便利店" } });
    fireEvent.click(screen.getByRole("button", { name: /开始算第一笔账/ }));
    expect(onComplete).toHaveBeenCalledWith({ storeName: "社区便利店", industry: "retail" });
  });
});

describe("ProfileView industry template interactions", () => {
  it("selects a different industry template", () => {
    const onIndustryChange = vi.fn();
    render(<ProfileView storeName="测试小店" industry="catering" onIndustryChange={onIndustryChange} onHiddenCost={vi.fn()} onDebt={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /社区零售/ }));
    expect(onIndustryChange).toHaveBeenCalledWith("retail");
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
  it("shows an error and does not call onSave for zero purchase quantity", () => {
    const onSave = vi.fn();
    render(<MaterialSheet onClose={vi.fn()} onSave={onSave} />);
    const quantityInput = screen.getAllByRole("spinbutton")[1];
    fireEvent.change(quantityInput, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /保存原材料/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("采购金额、采购数量和换算系数都必须大于0");
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
