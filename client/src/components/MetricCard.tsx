/** 商户账簿工作台：用有口径说明的账页卡片呈现经营数字，先结论后来源。 */
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";

type MetricCardProps = {
  label: string;
  value: string;
  note: string;
  tone?: "blue" | "navy" | "light";
  delta?: string;
  positive?: boolean;
};

export function MetricCard({
  label,
  value,
  note,
  tone = "light",
  delta,
  positive = true,
}: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__topline">
        <span>{label}</span>
        <Info size={15} aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      <div className="metric-card__foot">
        {delta && (
          <span className={positive ? "positive-delta" : "warning-delta"}>
            {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {delta}
          </span>
        )}
        <span>{note}</span>
      </div>
    </article>
  );
}
