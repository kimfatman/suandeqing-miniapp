/** 商户账簿工作台：快速记一笔把金额置于视觉中心，分类和备注作为可选补充，减少小商家录入负担。 */
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, X } from "lucide-react";

type QuickRecordSheetProps = {
  categories: string[];
  onClose: () => void;
  onSave: (record: { type: "income" | "expense"; amount: number; category: string; note: string }) => void;
};

export function QuickRecordSheet({ categories, onClose, onSave }: QuickRecordSheetProps) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("286");
  const [category, setCategory] = useState(categories[0] ?? "其他");
  const [note, setNote] = useState("");
  const amountValue = Number(amount);

  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet record-sheet" role="dialog" aria-modal="true" aria-label="快速记一笔" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">经营流水</span><h2>记一笔，账就更新。</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"> <X size={19} /> </button></header><div className="record-type-switch"><button className={type === "expense" ? "active expense" : ""} onClick={() => setType("expense")}><ArrowDownLeft size={16} /> 支出</button><button className={type === "income" ? "active income" : ""} onClick={() => setType("income")}><ArrowUpRight size={16} /> 收入</button></div><label className="record-amount"><span>{type === "expense" ? "今天花了多少？" : "今天收了多少？"}</span><div><b>¥</b><input autoFocus type="number" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /><i>元</i></div></label><div className="record-field-block"><span>归到哪一类账？</span><div className="record-categories">{(type === "income" ? ["销售收入", "其他收入"] : categories).slice(0, 6).map((item) => <button key={item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></div><label className="record-note"><span>备注（选填）</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：去批发市场取货" /></label><button className="primary-action sheet-action" disabled={!Number.isFinite(amountValue) || amountValue <= 0} onClick={() => onSave({ type, amount: amountValue, category, note })}><Check size={18} /> 保存这笔账</button></section></div>;
}
