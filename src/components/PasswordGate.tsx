import { useState } from "react";
import { dailyPassword } from "../gate";
import { useT } from "../i18n";

/** 网页版固定密码门：输对密码才进入应用（会话内一次即可） */
export function PasswordGate({ onPass }: { onPass: () => void }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState(false);
  const { t, lang, setLang } = useT();

  function submit() {
    if (value === dailyPassword()) {
      onPass();
    } else {
      setErr(true);
      setValue("");
    }
  }

  return (
    <div className="gate-overlay">
      <button
        className="gate-lang"
        onClick={() => setLang(lang === "zh" ? "en" : "zh")}
        title="中 / EN"
        style={{ position: "absolute", top: 18, right: 22, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-dim)", borderRadius: 6, fontSize: 12, padding: "3px 10px", cursor: "pointer" }}
      >{lang === "zh" ? "EN" : "中"}</button>
      <div className="gate-card" style={{ position: "relative" }}>
        <div className="gate-logo">☕</div>
        <h1>FluidPath Studio</h1>
        <p className="gate-sub">{t("液路动态示意图 · 教学工作台（内部测试版）")}</p>
        <input
          type="password"
          placeholder={t("请输入访问密码")}
          value={value}
          autoFocus
          onChange={(e) => { setValue(e.target.value); setErr(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        {err && <div className="gate-err">{t("密码错误，请重试")}</div>}
        <button className="btn gate-btn" onClick={submit}>{t("进入工作台 →")}</button>
      </div>
    </div>
  );
}
