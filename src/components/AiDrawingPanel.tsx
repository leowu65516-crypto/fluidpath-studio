import { useState } from "react";
import { useAppState } from "../store";
import { useT } from "../i18n";
import { aiCatalog, aiExample, compileAiOperations, diagramFingerprint } from "../ai/operations";
import type { AiPlan } from "../ai/operations";
import { applyAiPlan } from "../ai/actions";
import { downloadText } from "../fault-codes/report";
import { nodeBBox, pathD, pipePolyline } from "../geometry";
import { NodeSymbol } from "../symbols";

function PlanPreview({ plan }: { plan: AiPlan }) {
  const nodes = plan.diagram.nodes;
  if (!nodes.length) return null;
  const boxes = nodes.map(nodeBBox), x = Math.min(...boxes.map(b => b.x)) - 40, y = Math.min(...boxes.map(b => b.y)) - 40;
  const w = Math.max(...boxes.map(b => b.x + b.w)) - x + 40, h = Math.max(...boxes.map(b => b.y + b.h)) - y + 80;
  return <svg className="ai-plan-preview" viewBox={`${x} ${y} ${w} ${h}`} aria-label="Preview">
    {plan.diagram.pipes.map(p => { const points = pipePolyline(p, nodes); return points ? <path key={p.id} d={pathD(points)} fill="none" stroke={plan.addedPipes.includes(p.id) ? "#d97706" : "#94a3b8"} strokeWidth={6} /> : null; })}
    {nodes.map(n => <g key={n.id}><g transform={`translate(${n.x} ${n.y}) rotate(${n.rotation} ${n.width / 2} ${n.height / 2})`}><NodeSymbol node={n} /></g><text x={n.x + n.width / 2} y={n.y + n.height + 20} textAnchor="middle" fontSize={14} fill="#334155">{n.label}</text></g>)}
  </svg>;
}

export function AiDrawingPanel({ onClose }: { onClose: () => void }) {
  const { diagram, ui } = useAppState();
  const { t, lang } = useT();
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState<AiPlan | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [applied, setApplied] = useState(false);
  const canEdit = (ui.mode ?? "edit") === "edit";
  async function perform(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <aside className="fault-panel ai-drawing-panel" aria-label={t("AI 指令")} data-ui="1">
    <header className="fault-header"><div><strong>{t("AI 绘图")}</strong><span>{t("结构化指令预览与应用")}</span></div><button className="btn ghost sq" onClick={onClose} aria-label={t("关闭 AI 绘图")}>×</button></header>
    <div className="fault-scroll">
      <p className="fault-intro">{t("下载图纸上下文交给 AI，再粘贴生成的指令 JSON。校验和预览后一次应用，可撤销。")}</p>
      <p className="fault-hint">{t("此入口不连接模型服务；支持列出的操作，不代表已实现完整 v4 仿真。")}</p>
      <div className="fault-actions">
        <button className="btn" disabled={busy} onClick={() => perform(async () => {
          const sample = await aiExample(diagram);
          downloadText(`${diagram.name}-ai-context.json`, JSON.stringify({
            instruction: "Return only fluidpath.ai-operations JSON matching this example. Use only supported operations, no arbitrary properties or teaching flow overrides. Retain the base hash; temporary IDs refer to newly added components/pipes. Numeric layout cells are optional. No engineering PASS claims.",
            supportedOperations: ["addComponent", "connectPorts", "setComponentProperty (label only)", "setOperatingCondition", "defineFaultCode"],
            base: { diagramSha256: await diagramFingerprint(diagram) }, catalog: aiCatalog(), diagram, example: sample,
          }, null, 2), "application/json");
        })}>{t("下载 AI 上下文")}</button>
        <button className="btn" disabled={busy} onClick={() => perform(async () => { setInput(JSON.stringify(await aiExample(diagram), null, 2)); setPlan(null); setApplied(false); })}>{t("载入示例指令")}</button>
      </div>
      <label className="fault-form">{t("指令 JSON")}<textarea className="fault-json" aria-label={t("指令 JSON")} value={input} onChange={e => { setInput(e.target.value); setPlan(null); setApplied(false); }} spellCheck={false} /></label>
      <p className="fault-hint">{t("支持新增元件、连管、重命名、泵阀状态和故障码关联。未知操作会拒绝，不会部分应用。")}</p>
      <button className="btn" disabled={busy || !canEdit || !input.trim()} onClick={() => perform(async () => { setPlan(null); setApplied(false); setPlan(await compileAiOperations(input, diagram)); })}>{t("校验并预览")}</button>
      {error && <div role="alert" className="fault-error">{t("指令未应用")}: {error}</div>}
      {plan && <section className="fault-card"><strong>{t("变更预览")}</strong><p>{plan.addedNodes.length} {t("元件")} · {plan.addedPipes.length} {t("管段")}</p><PlanPreview plan={plan} /><ol>{plan.changes.map((change, i) => <li key={i}>{change}</li>)}</ol><button className="btn" disabled={busy || applied || !canEdit} onClick={() => perform(async () => { await applyAiPlan(plan); setApplied(true); })}>{t(applied ? "已应用，可撤销" : "应用全部变更")}</button></section>}
      {!canEdit && <p className="fault-hint">{t("切回编辑模式后应用指令。")}</p>}
      <small className="fault-hint">{lang === "zh" ? "图纸变化后旧预览失效；重复请求会被拦截。示例中的故障码仅用于演示。" : "A changed drawing invalidates old previews. Duplicate requests are rejected. The example fault code is for demonstration only."}</small>
    </div>
  </aside>;
}
