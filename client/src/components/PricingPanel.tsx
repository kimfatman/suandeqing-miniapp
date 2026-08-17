/** 商户账簿工作台：以可解释的成本口径和目标反推建议售价，不把算法结果伪装成市场承诺。 */
import { useMemo, useState } from "react";
import { Check, ChevronDown, Info, Sparkles, X } from "lucide-react";
import {
  calculatePricing,
  CostInputs,
  CostScope,
  formatCurrency,
  PricingMode,
} from "@/lib/costEngine";

type PricingPanelProps = {
  costs: CostInputs;
  onClose: () => void;
  onSave?: (price: number) => void;
};

const scopeNames: Record<CostScope, string> = {
  direct: "直接成本",
  operating: "经营成本",
  full: "完整成本",
};

export function PricingPanel({ costs, onClose, onSave }: PricingPanelProps) {
  const [scope, setScope] = useState<CostScope>("operating");
  const [mode, setMode] = useState<PricingMode>("margin");
  const [target, setTarget] = useState(30);
  const [fixedFee, setFixedFee] = useState(0);
  const result = useMemo(
    () => calculatePricing({ inputs: costs, scope, mode, target, fixedFee }),
    [costs, fixedFee, mode, scope, target],
  );

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="pricing-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="商品定价建议"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-grabber" />
        <header className="sheet-header">
          <div>
            <span className="eyebrow">商品定价建议</span>
            <h2>给“招牌奶茶”算个更稳的价格</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭定价建议">
            <X size={20} />
          </button>
        </header>

        <div className="scope-selector" aria-label="成本口径选择">
          {(Object.keys(scopeNames) as CostScope[]).map((item) => (
            <button
              key={item}
              className={scope === item ? "selected" : ""}
              onClick={() => setScope(item)}
            >
              {scopeNames[item]}
            </button>
          ))}
        </div>
        <p className="scope-hint">
          <Info size={15} />
          {scope === "direct"
            ? "只计入材料、包装与直接人工。"
            : scope === "operating"
              ? "已加入固定费用与隐形成本，适合日常定价。"
              : "已加入利息与融资费用，用于查看完整资金压力。"}
        </p>

        <div className="target-mode">
          <button className={mode === "margin" ? "active" : ""} onClick={() => setMode("margin")}>
            目标利润率
          </button>
          <button className={mode === "profit" ? "active" : ""} onClick={() => setMode("profit")}>
            目标单份利润
          </button>
        </div>
        <label className="field-block">
          <span>{mode === "margin" ? "希望保留多少利润率" : "每卖一份希望剩余多少"}</span>
          <div className="money-input">
            <input
              type="number"
              inputMode="decimal"
              value={target}
              min="0"
              onChange={(event) => setTarget(Number(event.target.value))}
            />
            <b>{mode === "margin" ? "%" : "元"}</b>
          </div>
        </label>
        <label className="field-block compact-field">
          <span>每单固定费用</span>
          <div className="money-input">
            <input
              type="number"
              inputMode="decimal"
              value={fixedFee}
              min="0"
              onChange={(event) => setFixedFee(Number(event.target.value))}
            />
            <b>元</b>
          </div>
        </label>

        {result.isValid ? (
          <div className="suggestion-card">
            <span className="result-tag"><Sparkles size={14} /> 建议售价</span>
            <div className="suggestion-value">{formatCurrency(result.suggestedPrice)}</div>
            <div className="result-grid">
              <span>保本价 <b>{formatCurrency(result.breakEvenPrice)}</b></span>
              <span>实际利润率 <b>{(result.actualMargin * 100).toFixed(1)}%</b></span>
              <span>每份预计剩余 <b>{formatCurrency(result.actualProfit)}</b></span>
              <span>本次成本 <b>{formatCurrency(result.cost)}</b></span>
            </div>
          </div>
        ) : (
          <div className="invalid-note">目标利润率过高或费率设置无效，请调整后再计算。</div>
        )}

        <details className="calculation-details">
          <summary>为什么是这个价格？ <ChevronDown size={16} /></summary>
          <p>
            以{scopeNames[scope]} {formatCurrency(result.cost)} 为基础，计入{costs.feeRate}%平台及支付费率，
            按{mode === "margin" ? `目标利润率 ${target}%` : `目标单份利润 ${formatCurrency(target)}`}反推，
            再向上取整至0.5元。
          </p>
        </details>
        <button
          className="primary-action sheet-action"
          disabled={!result.isValid}
          onClick={() => onSave?.(result.suggestedPrice)}
        >
          <Check size={19} /> 保存为商品售价
        </button>
      </section>
    </div>
  );
}
