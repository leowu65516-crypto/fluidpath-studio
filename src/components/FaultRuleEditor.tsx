import { useState } from "react";
import { useT } from "../i18n";
import type { FaultCode } from "../fault-codes/types";
import { editDiagnosticProfile } from "../fault-codes/actions";
import { SIGNAL_UNITS } from "../fault-codes/profile";

export function FaultRuleEditor({ fault, onError }: { fault: FaultCode; onError: (message: string) => void }) {
  const { t, lang } = useT();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("mL/s");
  const [op, setOp] = useState<"lt" | "gt">("lt");
  const [threshold, setThreshold] = useState("");
  const [recovery, setRecovery] = useState("");
  const [hold, setHold] = useState("0"), [grace, setGrace] = useState("0"), [recoveryHold, setRecoveryHold] = useState("0");
  const [manual, setManual] = useState(true);
  const numeric = (label: string, value: string, change: (v: string) => void, min?: number) => <label>{t(label)}<input type="number" required step="any" min={min} value={value} onChange={e => change(e.target.value)} /></label>;
  return <form className="fault-form" onSubmit={e => {
    e.preventDefault();
    try {
      const value = Number(threshold), clear = Number(recovery);
      if ((op === "lt" && clear < value) || (op === "gt" && clear > value)) throw new Error("Recovery threshold must be outside the trigger region");
      editDiagnosticProfile(profile => {
        const target = profile.diagnostics.find(f => f.id === fault.id)!;
        const id = `manual.${fault.id}`;
        profile.signalDefinitions = profile.signalDefinitions.filter(s => s.id !== id);
        profile.signalDefinitions.push({ id, label: { zh: "", en: "", [lang]: name || fault.code }, dataType: "number", unit, origin: "manualScenario", maxAgeMs: 500 });
        target.detection = {
          clock: "simulation", graceMs: Number(grace) * 1000,
          trigger: { condition: { signal: id, op, value, unit }, continuousMs: Number(hold) * 1000 },
          recovery: { condition: { signal: id, op: op === "lt" ? "gte" : "lte", value: clear, unit }, continuousMs: Number(recoveryHold) * 1000 },
          onUnknown: "breakContinuityAndRetainActiveAlarm", latching: manual,
          resetPolicy: manual ? "manualAfterRecovery" : "automaticAfterRecovery",
        };
      });
      onError("");
    } catch (error) { onError((error as Error).message); }
  }}>
    <p className="fault-hint">{t("数值规则使用一个虚拟信号；复杂检测前提可通过高级配置定义。")}</p>
    <label>{t("信号名称")}<input value={name} onChange={e => setName(e.target.value)} /></label>
    <div className="fault-columns">
      <label>{t("信号单位")}<select value={unit} onChange={e => setUnit(e.target.value)}>{SIGNAL_UNITS.map(u => <option key={u}>{u}</option>)}</select></label>
      <label>{t("触发比较")}<select value={op} onChange={e => setOp(e.target.value as "lt" | "gt")}><option value="lt">&lt;</option><option value="gt">&gt;</option></select></label>
      {numeric("触发阈值", threshold, setThreshold)}{numeric("恢复阈值", recovery, setRecovery)}
      {numeric("持续秒数", hold, setHold, 0)}{numeric("恢复持续秒数", recoveryHold, setRecoveryHold, 0)}
      {numeric("宽限秒数", grace, setGrace, 0)}
      <label>{t("复位方式")}<select value={manual ? "manual" : "auto"} onChange={e => setManual(e.target.value === "manual")}><option value="manual">{t("手动复位")}</option><option value="auto">{t("自动恢复")}</option></select></label>
    </div>
    <small>{t("所有阈值由使用者定义，不代表厂家参数。")}</small>
    <button className="btn" type="submit">{t("保存检测规则")}</button>
  </form>;
}
