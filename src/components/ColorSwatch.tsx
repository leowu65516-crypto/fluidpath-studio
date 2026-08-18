/** 预设色块 + 自定义取色 的颜色选择器（用于液体色/管壁色可视化选择） */

interface Props {
  value: string;
  presets: string[];
  onChange: (color: string) => void;
}

export function ColorSwatch({ value, presets, onChange }: Props) {
  const normalized = (value.length === 9 ? value.slice(0, 7) : value).toLowerCase();
  return (
    <div className="color-swatch-row">
      {presets.map((c) => (
        <button
          key={c}
          type="button"
          className={`color-swatch${normalized === c.toLowerCase() ? " active" : ""}`}
          style={{ background: c }}
          title={c}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="color-swatch-custom" title="自定义颜色">
        <input
          type="color"
          value={value.length === 9 ? value.slice(0, 7) : value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span>+</span>
      </label>
    </div>
  );
}
