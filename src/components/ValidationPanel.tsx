import { useMemo, useState } from "react";
import { deleteValidationCase, focusElement, listValidationCases, saveValidationCase, useAppState } from "../store";
import { runValidationCases, type ValidationResult } from "../validation";
import { toast } from "../toast";
import { useT } from "../i18n";

/** 图纸工况验收：用当前泵阀状态，定义并验证管路应流/应停。 */
export function ValidationPanel({ onClose }: { onClose: () => void }) {
  const { diagram, ui } = useAppState();
  const { t } = useT();
  const [name, setName] = useState("");
  const [mustFlow, setMustFlow] = useState<string[]>([]);
  const [mustStop, setMustStop] = useState<string[]>([]);
  const [results, setResults] = useState<ValidationResult[] | null>(null);
  const selectedPipeIds = ui.selection.pipes;
  const cases = listValidationCases();
  const pipeName = useMemo(() => new Map(diagram.pipes.map((p) => [p.id, p.label || p.id])), [diagram.pipes]);

  const addSelected = (expected: "flow" | "stop") => {
    if (!selectedPipeIds.length) return toast(t("先在画布上选中要验收的管路"), "error");
    const other = expected === "flow" ? mustStop : mustFlow;
    const next = [...new Set(selectedPipeIds.filter((id) => !other.includes(id)))];
    if (expected === "flow") setMustFlow((prev) => [...new Set([...prev, ...next])]);
    else setMustStop((prev) => [...new Set([...prev, ...next])]);
  };

  const remove = (expected: "flow" | "stop", id: string) => {
    if (expected === "flow") setMustFlow((prev) => prev.filter((x) => x !== id));
    else setMustStop((prev) => prev.filter((x) => x !== id));
  };

  const save = () => {
    if (!name.trim()) return toast(t("请填写验收工况名称"), "error");
    if (!mustFlow.length && !mustStop.length) return toast(t("至少指定一条必须流动或停止的管路"), "error");
    saveValidationCase(name.trim(), mustFlow, mustStop);
    toast(`已保存验收工况「${name.trim()}」：${mustFlow.length + mustStop.length} 条断言`);
    setName(""); setMustFlow([]); setMustStop([]); setResults(null);
  };

  const run = () => {
    const next = runValidationCases(diagram);
    setResults(next);
    const failed = next.filter((r) => !r.passed).length;
    toast(failed ? `${failed} 个验收工况失败，请检查红色管路` : `全部 ${next.length} 个验收工况通过`);
  };

  const chips = (expected: "flow" | "stop", ids: string[]) => (
    <div className={`validation-chips ${expected}`}>
      {ids.map((id) => <button key={id} className="validation-chip" title={t("定位管路")} onClick={() => focusElement(id)}>{pipeName.get(id) ?? id}<span onClick={(e) => { e.stopPropagation(); remove(expected, id); }}>×</span></button>)}
    </div>
  );

  return (
    <aside className="validation-panel" data-ui="1">
      <div className="validation-head"><h2>✓ {t("工况验收")}</h2><button className="advice-close" onClick={onClose}>✕</button></div>
      <p className="validation-help">{t("记录当前泵阀状态，并指定哪些管路必须流动或停流。验证在副本中运行，不会改动当前画布。")}</p>

      <div className="validation-create">
        <input value={name} placeholder={t("验收名称，例如：断水停泵")} onChange={(e) => setName(e.target.value)} />
        <div className="validation-buttons">
          <button className="btn" onClick={() => addSelected("flow")}>＋ {t("选中管设为应流")}</button>
          <button className="btn" onClick={() => addSelected("stop")}>＋ {t("选中管设为应停")}</button>
        </div>
        <div className="validation-expect"><b>{t("必须流动")}</b>{chips("flow", mustFlow)}</div>
        <div className="validation-expect"><b>{t("必须停流")}</b>{chips("stop", mustStop)}</div>
        <button className="cond-save-btn" onClick={save}>💾 {t("保存当前工况为验收")}</button>
      </div>

      <div className="validation-list-head"><b>{t("已定义验收工况")} ({cases.length})</b><button className="btn" disabled={!cases.length} onClick={run}>▶ {t("运行全部")}</button></div>
      {!cases.length && <div className="cond-empty">{t("新图纸没有验收标准。先摆好泵阀状态，选中关键管路，再建立案例。")}</div>}
      <div className="validation-list">
        {cases.map((c) => {
          const result = results?.find((r) => r.caseId === c.id);
          return <div className={`validation-case${result ? result.passed ? " pass" : " fail" : ""}`} key={c.id}>
            <div><b>{result ? result.passed ? "✓" : "✕" : "○"} {c.name}</b><small>{c.mustFlowPipeIds.length} 应流 · {c.mustStopPipeIds.length} 应停</small></div>
            <button className="btn ghost sq" title={t("删除")} onClick={() => deleteValidationCase(c.id)}>×</button>
            {result?.failures.map((f) => <button key={`${f.pipeId}-${f.expected}`} className="validation-failure" onClick={() => focusElement(f.pipeId)}>{f.label}：应{f.expected === "flow" ? "流" : "停"}，实际{f.actual === "flow" ? "流" : "停"}</button>)}
          </div>;
        })}
      </div>
    </aside>
  );
}
