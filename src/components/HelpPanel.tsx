import { useState } from "react";
import { GUIDE, GUIDE_EN } from "../guide";
import { useT } from "../i18n";

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const { lang } = useT();
  const [active, setActive] = useState(GUIDE[0].id);
  const section = GUIDE.find((s) => s.id === active) ?? GUIDE[0];
  const localized = lang === "en" ? (GUIDE_EN[section.id] ?? section) : section;

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-panel" onClick={(e) => e.stopPropagation()}>
        <div className="help-sidebar">
          <div className="help-logo">
            <span className="help-logo-mark">💧</span>
            <div>
              <div className="help-logo-title">FluidPath Studio</div>
              <div className="help-logo-sub">液路教学工作台</div>
            </div>
          </div>
          <div className="help-nav">
            {GUIDE.map((s) => (
              <button
                key={s.id}
                className={`help-nav-item${active === s.id ? " active" : ""}`}
                onClick={() => setActive(s.id)}
              >
                <span className="help-nav-icon">{s.icon}</span>
                <span>{lang === "en" ? (GUIDE_EN[s.id]?.title ?? s.title) : s.title}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="help-content">
          <div className="help-content-head">
            <h2>{localized.icon} {localized.title}</h2>
            <button className="help-close" onClick={onClose} aria-label={lang === "en" ? "Close" : "关闭"}>✕</button>
          </div>
          <div className="help-scroll">
            {localized.blocks.map((b, i) => {
              if (b.type === "list") {
                return <ul key={i}>{b.items?.map((it, j) => <li key={j}>{it}</li>)}</ul>;
              }
              if (b.type === "tip") {
                return <div key={i} className="help-tip">💡 {b.text}</div>;
              }
              return <p key={i}>{b.text}</p>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
