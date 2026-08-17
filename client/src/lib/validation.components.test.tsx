// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());
import { BomEditorSheet } from "@/components/BomEditorSheet";
import { MaterialSheet } from "@/pages/Home";
import { makeBomVersionSnapshot, seedLedger } from "./ledgerStore";

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
