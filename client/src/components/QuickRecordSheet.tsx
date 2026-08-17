/** 商户账簿工作台：快速记一笔把金额置于视觉中心，分类和备注作为可选补充，减少小商家录入负担。 */
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, X } from "lucide-react";

type QuickRecordSheetProps = {
  categories: string[];
  onClose: () => void;
  onRecordSale?: () => void;
  onSave: (record: { type: "income" | "expense"; amount: number; category: string; note: string }) => void;
};

export function QuickRecordSheet({ categories, onClose, onRecordSale, onSave }: QuickRecordSheetProps) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "其他");
  const [note, setNote] = useState("");
  const amountValue = Number(amount);
  const expenseCategories = [...categories, "借款利息", "融资服务费", "本金还款"];
  const operatingCategories = expenseCategories.filter((item) => !["借款利息", "融资服务费", "本金还款"].includes(item));
  const financingCategories = expenseCategories.filter((item) => ["借款利息", "融资服务费", "本金还款"].includes(item));
  const categoryHint = category === "本金还款" ? "本金还款会减少手上现金，但不计入经营成本。" : ["借款利息", "融资服务费"].includes(category) ? "这笔费用会计入资金成本，同时影响现金。" : "这笔支出会计入经营现金账；后续可按商品销量分摊。";

  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="pricing-sheet record-sheet" role="dialog" aria-modal="true" aria-label="快速记一笔" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-grabber" /><header className="sheet-header"><div><span className="eyebrow">经营流水</span><h2>记一笔，账就更新。</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"> <X size={19} /> </button></header><div className="record-type-switch"><button className={type === "expense" ? "active expense" : ""} onClick={() => { setType("expense"); setCategory(categories[0] ?? "其他"); }}><ArrowDownLeft size={16} /> 支出</button><button className={type === "income" ? "active income" : ""} onClick={() => { setType("income"); setCategory("其他收入"); }}><ArrowUpRight size={16} /> 其他收入</button></div><label className="record-amount"><span>{type === "expense" ? "今天花了多少？" : "今天收了多少？"}</span><div><b>¥</b><input autoFocus type="number" inputMode="decimal" value={amount} placeholder="例如 286" onChange={(event) => setAmount(event.target.value)} /><i>元</i></div></label><div className="record-field-block"><span>归到哪一类账？</span>{type === "income" ? <><div className="record-categories"><button className="selected" onClick={() => setCategory("其他收入")}>其他收入</button></div><p className="record-category-hint">商品销售请走“销售结转”：它会同时写入收入、销量和销货成本，避免利润重复或遗漏。</p>{onRecordSale && <button type="button" className="record-sale-link" onClick={onRecordSale}>去记商品销售</button>}</> : <><small className="category-group-label">经营支出</small><div className="record-categories">{operatingCategories.map((item) => <button key={item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><small className="category-group-label">借款与还款</small><div className="record-categories financing-categories">{financingCategories.map((item) => <button key={item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><p className="record-category-hint">{categoryHint}</p></>}</div><label className="record-note"><span>备注（选填）</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：去批发市场取货" /></label><button className="primary-action sheet-action" disabled={!Number.isFinite(amountValue) || amountValue <= 0} onClick={() => onSave({ type, amount: amountValue, category, note })}><Check size={18} /> 保存这笔账</button></section></div>;
}
