/** 商户账簿工作台：首次引导先确立行业与账本分类，让用户从熟悉的经营语言进入核算。 */
import { useState } from "react";
import { ArrowRight, Check, ChevronLeft, Store } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { INDUSTRY_TEMPLATES, IndustryKey } from "@/lib/ledgerStore";

type OnboardingFlowProps = {
  initialName: string;
  onComplete: (payload: { storeName: string; industry: IndustryKey }) => void;
};

export function OnboardingFlow({ initialName, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [industry, setIndustry] = useState<IndustryKey>("catering");
  const [storeName, setStoreName] = useState(initialName);
  const selected = INDUSTRY_TEMPLATES.find((item) => item.key === industry) ?? INDUSTRY_TEMPLATES[0];

  return (
    <div className="onboarding-stage">
      <div className="onboarding-paper">
        <div className="onboarding-topline"><span className="onboarding-brand"><BrandMark size={25} /><b>算得清</b><em>小店成本账</em></span><span>首次开账 <b>{step} / 2</b></span></div>
        {step === 1 ? (
          <>
            <div className="onboarding-head"><span className="onboarding-index">01</span><h1>选择行业</h1></div>
            <div className="industry-grid">
              {INDUSTRY_TEMPLATES.map((item) => (
                <button key={item.key} className={industry === item.key ? "industry-card selected" : "industry-card"} onClick={() => setIndustry(item.key)}>
                  <span className="industry-symbol">{item.shortLabel.slice(0, 1)}</span><span><b>{item.label}</b><small>{item.description}</small></span>{industry === item.key && <Check size={15} />}
                </button>
              ))}
            </div>
            <button className="onboarding-primary" onClick={() => setStep(2)}>下一步 <ArrowRight size={19} /></button>
          </>
        ) : (
          <>
            <button className="onboarding-back" onClick={() => setStep(1)}><ChevronLeft size={17} /> 行业</button>
            <div className="onboarding-head compact"><span className="onboarding-index">02</span><h1>店铺名称</h1></div>
            <label className="onboarding-field"><span>店铺名称</span><div><Store size={18} /><input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="例如：巷口奶茶铺" /></div></label>
            <section className="template-preview"><span className="ledger-tab">{selected.label}</span><div>{selected.categories.map((category) => <i key={category}>{category}</i>)}</div><small className="sample-preview-note">正式账本从空白开始。</small></section>
            <button className="onboarding-primary" disabled={!storeName.trim()} onClick={() => onComplete({ storeName: storeName.trim(), industry })}>开始建账 <ArrowRight size={19} /></button>
          </>
        )}
      </div>
    </div>
  );
}
