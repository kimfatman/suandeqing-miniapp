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

export type PricingCostLine = {
  label: string;
  amount: number;
  source: string;
  layer: "direct" | "operating" | "funding";
};

export type PricingAllocationContext = {
  periodLabel: string;
  method: "output" | "hours" | "revenue";
  monthlyIndirectTotal: number;
  productIndirectTotal: number;
  unitIndirectCost: number;
  allocationShare: number;
  outputQuantity: number;
  productSalesAmount: number;
  totalSalesAmount: number;
  effectiveFrom: string;
  effectiveTo: string;
  effectiveDays: number;
  daysInPeriod: number;
  timeFactor: number;
};

type PricingPanelProps = {
  costs: CostInputs;
  productName?: string;
  costLines?: PricingCostLine[];
  allocationContext?: PricingAllocationContext;
  onClose: () => void;
  onSave?: (price: number) => void;
  onAdjustAllocation?: () => void;
};

const scopeNames: Record<CostScope, string> = {
  direct: "直接成本",
  operating: "经营成本",
  full: "完整成本",
};

export function PricingPanel({ costs, productName = "当前商品", costLines = [], allocationContext, onClose, onSave, onAdjustAllocation }: PricingPanelProps) {
  const [scope, setScope] = useState<CostScope>("operating");
  const [mode, setMode] = useState<PricingMode>("margin");
  const [targetText, setTargetText] = useState("30");
  const [fixedFeeText, setFixedFeeText] = useState("");
  const target = targetText.trim() === "" ? Number.NaN : Number(targetText);
  const fixedFee = fixedFeeText.trim() === "" ? 0 : Number(fixedFeeText);
  const result = useMemo(
    () => calculatePricing({ inputs: costs, scope, mode, target, fixedFee }),
    [costs, fixedFee, mode, scope, target],
  );
  const visibleCostLines = costLines.filter((line) => scope === "direct" ? line.layer === "direct" : scope === "operating" ? line.layer !== "funding" : true);
  const visibleCostTotal = visibleCostLines.reduce((total, line) => total + line.amount, 0);
  const scopeDifference = result.cost - visibleCostTotal;
  const formulaDenominator = mode === "margin" ? 1 - costs.feeRate / 100 - target / 100 : 1 - costs.feeRate / 100;
  const targetError = !Number.isFinite(target)
    ? mode === "margin" ? "请填写目标利润率。" : "请填写目标单份利润。"
    : target < 0
      ? "目标值不能小于 0。"
      : !Number.isFinite(fixedFee) || fixedFee < 0
        ? "每单固定费用不能小于 0。"
        : costs.feeRate >= 100
          ? "平台费率必须小于 100%。"
          : mode === "margin" && target + costs.feeRate >= 100
            ? `目标利润率与平台费率合计必须小于 100%（当前 ${(target + costs.feeRate).toFixed(1)}%）。`
            : "目标值暂时无法计算，请检查输入。";
  const methodName = allocationContext?.method === "revenue" ? "按销售额" : allocationContext?.method === "hours" ? "按工时" : "按产量";
  const fullShare = Boolean(allocationContext && allocationContext.allocationShare >= 0.999);
  const lowOutput = Boolean(allocationContext && allocationContext.outputQuantity > 0 && allocationContext.outputQuantity <= 1);

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
            <h2>给“{productName}”算个更稳的价格</h2>
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
              value={targetText}
              min="0"
              aria-label={mode === "margin" ? "目标利润率" : "目标单份利润"}
              placeholder={mode === "margin" ? "例如 30" : "例如 8"}
              onChange={(event) => setTargetText(event.target.value)}
            />
            <b>{mode === "margin" ? "%" : "元"}</b>
          </div>
        </label>
        {mode === "margin" && <div className="pricing-rate-guide"><Info size={15} /><p><b>这里使用“利润率”</b>：利润 ÷ 售价。它不同于“加价率”（利润 ÷ 成本）；例如希望利润率 30%，并不等于在成本上加 30%。平台费会一并从售价中反推。</p></div>}
        <label className="field-block compact-field">
          <span>每单固定费用</span>
          <div className="money-input">
            <input
              type="number"
              inputMode="decimal"
              value={fixedFeeText}
              min="0"
              aria-label="每单固定费用"
              placeholder="没有则留空"
              onChange={(event) => setFixedFeeText(event.target.value)}
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
          <div className="invalid-note">{targetError}</div>
        )}

        <details className="pricing-cost-details" open>
          <summary>成本与分摊明细 <ChevronDown size={16} /></summary>
          {allocationContext && scope !== "direct" && (
            <section className="allocation-evidence" aria-label="本月分摊依据">
              <div className="allocation-evidence-heading"><b>本月分摊依据</b><span>{allocationContext.periodLabel} · {methodName}（预计口径）</span></div>
              <div className="allocation-evidence-grid">
                <span><small>成本生效日期</small><b>{allocationContext.effectiveFrom.slice(5)} ～ {allocationContext.effectiveTo.slice(5)}</b></span>
                <span><small>有效天数</small><b>{allocationContext.effectiveDays} / {allocationContext.daysInPeriod} 天</b></span>
                {allocationContext.method === "revenue" && <><span><small>本商品预计销售额</small><b>{formatCurrency(allocationContext.productSalesAmount)}</b></span><span><small>全部商品预计销售额</small><b>{formatCurrency(allocationContext.totalSalesAmount)}</b></span><span><small>销售额占比</small><b>{(allocationContext.allocationShare * 100).toFixed(1)}%</b></span></>}
                {allocationContext.method !== "revenue" && <span><small>加权分摊占比</small><b>{(allocationContext.allocationShare * 100).toFixed(1)}%</b></span>}
                <span><small>预计产量</small><b>{allocationContext.outputQuantity} 件</b></span>
                <span><small>本商品月度分摊</small><b>{formatCurrency(allocationContext.productIndirectTotal)}</b></span>
              </div>
              {allocationContext.timeFactor < 0.999 && <p className="allocation-time-note">本月费用按有效天数计入：{allocationContext.effectiveDays} ÷ {allocationContext.daysInPeriod} = {(allocationContext.timeFactor * 100).toFixed(1)}%</p>}
              <p className="allocation-evidence-formula">单件分摊 = {formatCurrency(allocationContext.monthlyIndirectTotal)} × {(allocationContext.allocationShare * 100).toFixed(1)}% ÷ {allocationContext.outputQuantity || 0} 件 = {formatCurrency(allocationContext.unitIndirectCost)}/件</p>
              {(fullShare || lowOutput) && <div className="allocation-evidence-warning"><Info size={15} /><div><b>{fullShare ? "当前商品承担了本月全部间接费用" : "当前预计产量仅为 1 件"}</b><p>{fullShare && lowOutput ? "全部间接费用会集中到这一件商品。若本月不止卖这一件或不止这一款商品，请补齐预计销售额和产量后再参考建议价。" : fullShare ? "若本月不止这一款商品，请补齐其他商品的预计销售额或分摊数据。" : "本月间接费用会集中到这一件；请确认预计产量是否符合实际。"}</p>{onAdjustAllocation && <button type="button" onClick={onAdjustAllocation}>检查并调整本月分摊</button>}</div></div>}
            </section>
          )}
          <div className="pricing-cost-list">
            {visibleCostLines.length ? visibleCostLines.map((line, index) => <div className="pricing-cost-line" key={`${line.label}-${index}`}><div><b>{line.label}</b><small>{line.source}</small></div><strong>{formatCurrency(line.amount)}</strong></div>) : <p className="pricing-cost-empty">当前口径还没有可分拆的成本项目。</p>}
            {Math.abs(scopeDifference) >= 0.005 && <div className="pricing-cost-line adjustment"><div><b>分摊与取整调整</b><small>保证与本次成本一致</small></div><strong>{formatCurrency(scopeDifference)}</strong></div>}
            <div className="pricing-cost-total"><span>{scopeNames[scope]}合计</span><b>{formatCurrency(result.cost)}</b></div>
          </div>
        </details>

        <details className="calculation-details">
          <summary>价格怎么推出来？ <ChevronDown size={16} /></summary>
          <div className="pricing-formula">
            <span><b>本次成本</b><em>{formatCurrency(result.cost)}</em></span>
            <span><b>每单固定费用</b><em>+ {formatCurrency(fixedFee)}</em></span>
            {mode === "profit" && <span><b>目标单份利润</b><em>+ {formatCurrency(target)}</em></span>}
            <span><b>反推分母</b><em>÷ (1 − {costs.feeRate}%{mode === "margin" ? ` − ${Number.isFinite(target) ? target : "—"}%` : ""}) = {Number.isFinite(formulaDenominator) ? formulaDenominator.toFixed(3) : "—"}</em></span>
            <span><b>未取整价格</b><em>{formatCurrency(result.rawPrice)}</em></span>
            <span><b>建议售价</b><em>向上取整至 0.5 元：{formatCurrency(result.suggestedPrice)}</em></span>
          </div>
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
