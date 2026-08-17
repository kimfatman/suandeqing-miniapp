/** 商户账簿工作台：保持加号、等号、微笑曲线的简洁品牌符号，服务于小尺寸与高频操作场景。 */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/manus-storage/suandeqing-app-icon_96fa81b0.png"
      width={size}
      height={size}
      alt="算得清"
      className="brand-mark"
      style={{ width: size, height: size }}
    />
  );
}
