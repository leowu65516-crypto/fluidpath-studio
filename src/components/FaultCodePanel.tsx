import { useEffect, useRef, useState } from "react";
import { useAppState, setUI } from "../store";
import { nodeBBox, pipePolyline, polylineBBox } from "../geometry";
import { useT } from "../i18n";
import { createFaultCode, patchFaultCode, deleteFaultCode, bindFaultSelection, editDiagnosticProfile, importFaultCatalog, addTroubleshootingStep, patchTroubleshootingStep, deleteTroubleshootingStep, moveTroubleshootingStep, bindTroubleshootingStepSelection } from "../fault-codes/actions";
import { EMPTY_PROFILE, MAX_PROFILE_BYTES, parseDiagnosticProfile, resolveFaultTargets, resolveHighlightGroupTargets } from "../fault-codes/profile";
import { useDiagnosticSession, selectFaultCodes, selectFaultStep, setDiagnosticView, prepareDiagnosticSimulation, setSimulationRunning, advanceDiagnostics, setSimulationValue, acknowledgeFault, resetFault, toggleInjectedFault, diagnosticSession } from "../fault-codes/session";
import type { DiagnosticProfile, FaultCode, Observation, TroubleshootingStep } from "../fault-codes/types";
import { buildFaultReport, downloadText } from "../fault-codes/report";
import { FaultRuleEditor } from "./FaultRuleEditor";
import { FaultSignalInput } from "./FaultSignalInput";

const STATUS: Record<string, string> = { notApplicable: "不适用或宽限中", normal: "正常", pending: "等待持续条件", triggered: "已触发", unknown: "无法判断", invalid: "规则无效", clear: "无活动报警", active: "活动报警", recoveredAwaitingReset: "已恢复，等待复位" };

function TroubleshootingStepEditor({
  diagram, profile, fault, step, index, activeIndex, lang, canEdit, selection, run, onSelect,
}: {
  diagram: ReturnType<typeof useAppState>["diagram"]; profile: DiagnosticProfile; fault: FaultCode; step: TroubleshootingStep; index: number; activeIndex: number;
  lang: "zh" | "en"; canEdit: boolean; selection: { nodes: string[]; pipes: string[] }; run: (fn: () => void) => void; onSelect: (index: number) => void;
}) {
  const { t } = useT();
  const targets = step.highlightBinding ? resolveHighlightGroupTargets(diagram, profile, step.highlightBinding.groupId) : { nodes: [], pipes: [], missing: [] };
  const label = step.label[lang] || step.label.zh || step.label.en || `${t("步骤")} ${index + 1}`;
  const patchText = (field: "label" | "instruction" | "sensorNote", value: string) => {
    const previous = step[field] ?? { zh: "", en: "" };
    run(() => patchTroubleshootingStep(fault.id, step.id, { [field]: { ...previous, [lang]: value } }));
  };
  const setSignal = (signalId: string, checked: boolean) => run(() => patchTroubleshootingStep(fault.id, step.id, {
    sensorIds: checked ? [...new Set([...step.sensorIds, signalId])] : step.sensorIds.filter(id => id !== signalId),
  }));
  const hasSelection = selection.nodes.length + selection.pipes.length > 0;
  return <section className={`fault-step${activeIndex === index ? " active" : ""}`} data-fault-step-editor={step.id}>
    <div className="fault-step-head">
      <button className="fault-step-select" onClick={() => onSelect(index)} aria-pressed={activeIndex === index}><b>{index + 1}</b><span>{label}</span></button>
      <div className="fault-step-order">
        <button className="btn ghost sq" disabled={!canEdit || index === 0} title={t("上移")} onClick={() => run(() => moveTroubleshootingStep(fault.id, step.id, -1))}>↑</button>
        <button className="btn ghost sq" disabled={!canEdit || index === (fault.troubleshooting?.length ?? 0) - 1} title={t("下移")} onClick={() => run(() => moveTroubleshootingStep(fault.id, step.id, 1))}>↓</button>
        <button className="btn ghost sq" disabled={!canEdit} title={t("删除步骤")} onClick={() => run(() => deleteTroubleshootingStep(fault.id, step.id))}>×</button>
      </div>
    </div>
    <div className="fault-form">
      <label>{t("步骤名称")}<input key={`${step.id}-label-${lang}-${step.label[lang]}`} defaultValue={step.label[lang]} disabled={!canEdit} onBlur={e => { if (e.target.value !== step.label[lang]) patchText("label", e.target.value); }} /></label>
      <label>{t("排查动作")}<textarea key={`${step.id}-instruction-${lang}-${step.instruction?.[lang] ?? ""}`} defaultValue={step.instruction?.[lang] ?? ""} disabled={!canEdit} onBlur={e => { if (e.target.value !== (step.instruction?.[lang] ?? "")) patchText("instruction", e.target.value); }} /></label>
    </div>
    <div className="fault-step-scope"><b>{t("当前步骤关联")}</b><span>{t("元件")} {targets.nodes.length} · {t("管段")} {targets.pipes.length}</span></div>
    <small>{t("画布选择")}: {selection.nodes.length} + {selection.pipes.length}</small>
    <div className="fault-actions">{(["replace", "add", "remove"] as const).map((mode, actionIndex) => <button key={mode} className="btn" disabled={!canEdit || !hasSelection} onClick={() => run(() => bindTroubleshootingStepSelection(fault.id, step.id, mode))}>{t(["替换为当前选择", "追加当前选择", "移除当前选择"][actionIndex])}</button>)}</div>
    {!targets.nodes.length && !targets.pipes.length && <p className="fault-hint">{t("此步骤可只记录传感器或文字线索；关联画布对象后会闪烁定位。")}</p>}
    {!!targets.missing.length && <div className="fault-error" role="alert">{t("关联对象被删除，请重新绑定。")}</div>}
    <div className="fault-actions">
      <label className="fault-check">{t("步骤颜色")}<input type="color" disabled={!canEdit} value={step.presentation?.color ?? fault.presentation.color} onChange={e => run(() => patchTroubleshootingStep(fault.id, step.id, { presentation: { color: e.target.value, animation: step.presentation?.animation ?? "flash" } }))} /></label>
      <label className="fault-step-animation">{t("高亮方式")}<select disabled={!canEdit} value={step.presentation?.animation ?? "flash"} onChange={e => run(() => patchTroubleshootingStep(fault.id, step.id, { presentation: { color: step.presentation?.color ?? fault.presentation.color, animation: e.target.value as "none" | "breathe" | "flash" } }))}><option value="flash">{t("闪烁")}</option><option value="breathe">{t("缓慢呼吸")}</option><option value="none">{t("静态")}</option></select></label>
    </div>
    <details className="fault-step-sensors"><summary>{t("传感器线索")} ({step.sensorIds.length})</summary>
      {profile.signalDefinitions.length ? <div className="fault-signal-list">{profile.signalDefinitions.map(signal => <label className="fault-check" key={signal.id}><input type="checkbox" disabled={!canEdit} checked={step.sensorIds.includes(signal.id)} onChange={e => setSignal(signal.id, e.target.checked)} />{signal.label[lang] || signal.label.zh || signal.label.en || signal.id}{signal.unit ? ` (${signal.unit})` : ""}</label>)}</div> : <p className="fault-hint">{t("尚未定义可采样信号；仍可记录自由线索。")}</p>}
      <label>{t("自由传感器/检查线索")}<textarea key={`${step.id}-sensor-note-${lang}-${step.sensorNote?.[lang] ?? ""}`} defaultValue={step.sensorNote?.[lang] ?? ""} disabled={!canEdit} onBlur={e => { if (e.target.value !== (step.sensorNote?.[lang] ?? "")) patchText("sensorNote", e.target.value); }} /></label>
    </details>
  </section>;
}

export function FaultCodePanel({ onClose }: { onClose: () => void }) {
  const { diagram, ui } = useAppState();
  const session = useDiagnosticSession();
  const { t, lang } = useT();
  const profile = diagram.settings.diagnosticProfile ?? EMPTY_PROFILE;
  const [activeId, setActiveId] = useState("");
  const active = profile.diagnostics.find(f => f.id === activeId);
  const [code, setCode] = useState(""), [title, setTitle] = useState(""), [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pendingImport, setPendingImport] = useState<DiagnosticProfile | null>(null);
  const [advanced, setAdvanced] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canEdit = !["present", "verify"].includes(ui.mode ?? "edit");
  const targets = active ? resolveFaultTargets(diagram, profile, active) : null;
  const result = active ? session.results[active.id] : undefined;
  const steps = active?.troubleshooting ?? [];
  const activeStepIndex = active ? Math.min(session.activeStepByFault[active.id] ?? 0, Math.max(0, steps.length - 1)) : 0;
  useEffect(() => () => { setSimulationRunning(false); }, []);
  const run = (fn: () => void) => { try { fn(); setError(""); } catch (e) { setError((e as Error).message); } };
  const label = (f: FaultCode) => f.label[lang] || f.label.zh || f.label.en || f.code;
  function select(fault: FaultCode, additive = false) {
    setActiveId(fault.id);
    selectFaultCodes(additive ? session.selectedIds.includes(fault.id) ? session.selectedIds.filter(id => id !== fault.id) : [...session.selectedIds, fault.id] : [fault.id]);
    if (!additive && fault.troubleshooting?.length) selectFaultStep(fault.id, 0);
  }
  function focusTargets() {
    if (!targets) return;
    const boxes = [
      ...diagram.nodes.filter(n => targets.nodes.includes(n.id)).map(nodeBBox),
      ...diagram.pipes.filter(p => targets.pipes.includes(p.id)).flatMap(p => { const points = pipePolyline(p, diagram.nodes); return points ? [polylineBBox(points)] : []; }),
    ];
    if (!boxes.length) return;
    const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
    const right = Math.max(...boxes.map(b => b.x + b.w)), bottom = Math.max(...boxes.map(b => b.y + b.h));
    const svg = document.querySelector(".main-canvas"), w = svg?.clientWidth || 800, h = svg?.clientHeight || 600;
    const zoom = Math.min(ui.zoom, w / (right - left + 100), h / (bottom - top + 100));
    setUI({ zoom, panX: w / 2 - (left + right) / 2 * zoom, panY: h / 2 - (top + bottom) / 2 * zoom });
  }
  const editText = (field: "label" | "description", language: "zh" | "en", value: string) => active && run(() => patchFaultCode(active.id, { [field]: { zh: "", en: "", ...active[field], [language]: value } }));
  return <aside className="fault-panel" aria-label={t("故障码与关联水路")} data-ui="1">
    <header className="fault-header"><div><strong>{t("故障代码")}</strong><span>{profile.namespace}</span></div><button className="btn ghost sq" onClick={onClose} aria-label={t("关闭故障代码")}>×</button></header>
    <div className="fault-scroll">
      <p className="fault-intro">{t("选择代码查看关联水路；高亮不改变泵阀、介质或工程流动。")}</p>
      {!canEdit && <p className="fault-hint">{t("先在编辑或故障模式配置代码；演示和验收模式可查阅、模拟。")}</p>}
      {error && <div className="fault-error" role="alert">{t("配置错误")}: {error}</div>}
      <div className="fault-actions">
        <button className="btn" disabled={!profile.diagnostics.length} onClick={() => downloadText(`${diagram.name}-fault-codes.json`, JSON.stringify(profile, null, 2), "application/json")}>{t("导出代码库")}</button>
        <button className="btn" disabled={!canEdit} onClick={() => inputRef.current?.click()}>{t("导入代码库")}</button>
      </div>
      <input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (!file) return;
        try { if (file.size > MAX_PROFILE_BYTES) throw new Error("File too large"); setPendingImport(parseDiagnosticProfile(await file.text())); setError(""); } catch (err) { setError((err as Error).message); }
      }} />
      {pendingImport && <section className="fault-card"><strong>{t("导入配置预览")} · {pendingImport.diagnostics.length}</strong><p>{t("导入会替换当前代码库。为避免同名或旧 ID 误绑，导入后所有目标需重新关联。可撤销。")}</p><div className="fault-actions"><button className="btn" disabled={!canEdit} onClick={() => run(() => { importFaultCatalog(JSON.stringify(pendingImport)); setPendingImport(null); setActiveId(""); })}>{t("替换代码库并重新绑定")}</button><button className="btn ghost" onClick={() => setPendingImport(null)}>{t("取消导入")}</button></div></section>}
      <details className="fault-card" open={!profile.diagnostics.length}><summary>{t("新建代码")}</summary><form className="fault-form" onSubmit={e => {
        e.preventDefault(); run(() => { const id = createFaultCode(code, title, lang); setActiveId(id); selectFaultCodes([id]); setCode(""); setTitle(""); });
      }}>
        <label>{t("故障码")}<input value={code} required maxLength={120} disabled={!canEdit} onChange={e => setCode(e.target.value)} placeholder="E01" /></label>
        <label>{t("故障名称")}<input value={title} maxLength={200} disabled={!canEdit} onChange={e => setTitle(e.target.value)} /></label>
        <button className="btn" type="submit" disabled={!canEdit}>{t("添加代码")}</button>
      </form></details>
      <input className="fault-search" aria-label={t("搜索代码或名称")} placeholder={t("搜索代码或名称")} value={query} onChange={e => setQuery(e.target.value)} />
      <small className="fault-hint">{t("选择多个代码可叠加查看。")}</small>
      <div className="fault-code-list">
        {profile.diagnostics.filter(f => `${f.code} ${f.label.zh} ${f.label.en}`.toLowerCase().includes(query.toLowerCase())).map(f => <div className={`fault-code-item${active?.id === f.id ? " selected" : ""}`} key={f.id}>
          <input type="checkbox" aria-label={`${t("关联水路")} ${f.code}`} checked={session.selectedIds.includes(f.id)} onChange={() => select(f, true)} />
          <button onClick={() => select(f)}><b>{f.code}</b><span>{label(f)}</span></button>
          {session.results[f.id]?.alarmState === "active" && <span className="fault-active-dot" title={t("活动报警")}>●</span>}
        </div>)}
        {!profile.diagnostics.length && <p className="fault-hint">{t("暂无故障码，先添加一个代码。")}</p>}
      </div>
      {active && <div key={active.id} className="fault-detail">
        <section className="fault-card">
          <div className="fault-section-title"><strong>{active.code}</strong><span className="fault-badge">{t(session.injectedIds.includes(active.id) ? "教学注入" : result?.alarmState !== undefined && result.alarmState !== "clear" ? "虚拟信号检测" : "查阅")}</span></div>
          <div className="fault-form">
            <label>{t("中文名称")}<input key={`${active.id}-zh-${active.label.zh}`} defaultValue={active.label.zh} disabled={!canEdit} onBlur={e => { if (e.target.value !== active.label.zh) editText("label", "zh", e.target.value); }} /></label>
            <label>{t("英文名称")}<input key={`${active.id}-en-${active.label.en}`} defaultValue={active.label.en} disabled={!canEdit} onBlur={e => { if (e.target.value !== active.label.en) editText("label", "en", e.target.value); }} /></label>
            <label>{t("排查说明")}<textarea key={`${active.id}-${lang}-${active.description?.[lang]}`} defaultValue={active.description?.[lang] ?? ""} disabled={!canEdit} onBlur={e => { if (e.target.value !== (active.description?.[lang] ?? "")) editText("description", lang, e.target.value); }} /></label>
          </div>
        </section>
        <section className="fault-card">
          <strong>{t("关联水路")}</strong><p>{t("元件")} {targets?.nodes.length} · {t("管段")} {targets?.pipes.length}</p>
          <small>{t("画布选择")}: {ui.selection.nodes.length} + {ui.selection.pipes.length}</small>
          <div className="fault-actions">{(["replace", "add", "remove"] as const).map((mode, i) => <button key={mode} className="btn" disabled={!canEdit || !ui.selection.nodes.length && !ui.selection.pipes.length} onClick={() => run(() => bindFaultSelection(active.id, mode))}>{t(["替换为当前选择", "追加当前选择", "移除当前选择"][i])}</button>)}</div>
          {!targets?.nodes.length && !targets?.pipes.length && <p className="fault-hint">{t("暂无关联，请先框选元件或管路。")}</p>}
          {!!targets?.missing.length && <div className="fault-error" role="alert">{t("关联对象被删除，请重新绑定。")}<details><summary>{t("失效引用")} ({targets.missing.length})</summary>{targets.missing.join(", ")}</details></div>}
          <details><summary>{t("当前目标列表")}</summary><ul>{targets?.nodes.map(id => <li key={id}>{diagram.nodes.find(n => n.id === id)?.label || id}</li>)}{targets?.pipes.map(id => <li key={id}>{diagram.pipes.find(p => p.id === id)?.label || id}</li>)}</ul></details>
          <div className="fault-actions"><button className="btn" onClick={focusTargets}>{t("定位关联范围")}</button><button className="btn ghost" onClick={() => selectFaultCodes([])}>{t("清除高亮")}</button></div>
          <label className="fault-check"><input type="checkbox" checked={session.revealHidden} onChange={e => setDiagnosticView({ revealHidden: e.target.checked })} />{t("临时显示隐藏对象")}</label>
          <div className="fault-actions"><label className="fault-check">{t("高亮颜色")}<input type="color" disabled={!canEdit} value={active.presentation.color} onChange={e => run(() => patchFaultCode(active.id, { presentation: { ...active.presentation, color: e.target.value } }))} /></label><label className="fault-check"><input type="checkbox" disabled={!canEdit} checked={active.presentation.animation === "breathe"} onChange={e => run(() => patchFaultCode(active.id, { presentation: { ...active.presentation, animation: e.target.checked ? "breathe" : "none" } }))} />{t("缓慢呼吸")}</label></div>
          <label className="fault-check"><input type="checkbox" checked={!session.animation} onChange={e => setDiagnosticView({ animation: !e.target.checked })} />{t("关闭高亮动画")}</label>
          <small>{t("仅表示相关排查范围，不代表已经确认故障根因。")}</small>
        </section>
        <section className="fault-card">
          <div className="fault-section-title"><strong>{t("排查步骤")}</strong><span className="fault-badge">{steps.length ? `${t("步骤")} ${activeStepIndex + 1} / ${steps.length}` : t("未配置")}</span></div>
          <p className="fault-hint">{t("每一步独立配置可疑管路、元件与传感器线索；选中步骤时，该范围会以设定颜色闪烁。")}</p>
          {steps.map((step, index) => <TroubleshootingStepEditor key={step.id} diagram={diagram} profile={profile} fault={active} step={step} index={index} activeIndex={activeStepIndex} lang={lang} canEdit={canEdit} selection={ui.selection} run={run} onSelect={nextIndex => selectFaultStep(active.id, nextIndex)} />)}
          <div className="fault-actions"><button className="btn" disabled={!canEdit} onClick={() => run(() => { const stepId = addTroubleshootingStep(active.id, lang); const next = (active.troubleshooting?.length ?? 0); selectFaultStep(active.id, next); return stepId; })}>{t("新增步骤")}</button>{steps.length > 0 && <button className="btn ghost" onClick={() => selectFaultStep(active.id, activeStepIndex)}>{t("定位当前步骤")}</button>}</div>
        </section>
        <section className="fault-card"><strong>{t("检测规则")}</strong>
          {active.detection ? <pre className="fault-rule-summary">{JSON.stringify(active.detection, null, 2)}</pre> : <p className="fault-hint">{t("仅查阅，无自动检测规则")}</p>}
          {canEdit && <details><summary>{t("配置数值规则")}</summary><FaultRuleEditor fault={active} onError={setError} /></details>}
          {active.detection && canEdit && <button className="btn ghost" onClick={() => run(() => editDiagnosticProfile(p => { delete p.diagnostics.find(f => f.id === active.id)!.detection; }))}>{t("移除检测规则")}</button>}
          <button className="btn" onClick={() => toggleInjectedFault(active.id)}>{t(session.injectedIds.includes(active.id) ? "清除教学注入" : "模拟此代码")}</button>
          <button className="btn ghost" disabled={!canEdit} onClick={() => run(() => { deleteFaultCode(active.id); setActiveId(""); })}>{t("删除此代码")}</button>
        </section>
      </div>}
      {!!profile.diagnostics.some(f => f.detection) && <section className="fault-card fault-simulator"><strong>{t("模拟检测")}</strong><p className="fault-hint">{t("输入按仿真时钟持续采样；这些是教学数值，不是实机读数。")}</p>
        <div className="fault-actions"><button className="btn" onClick={() => prepareDiagnosticSimulation(profile)}>{t(session.profile ? "复位模拟" : "初始化模拟")}</button><button className="btn" disabled={!session.profile} onClick={() => setSimulationRunning(!session.running)}>{t(session.running ? "暂停模拟" : "运行模拟")}</button><button className="btn" disabled={!session.profile || session.running} onClick={() => advanceDiagnostics(100)}>{t("单步 0.1 秒")}</button></div>
        <output aria-label={t("仿真时间")}>{(session.nowMs / 1000).toFixed(1)} s</output>
        <p className="fault-hint">{t("修改数值后按 Enter 或离开输入框，才会提交新的完整样本。")}</p>
        {session.profile?.signalDefinitions.map(signal => <div key={signal.id} className="fault-signal"><label>{signal.label[lang] || signal.label.zh || signal.label.en} {signal.unit ? `(${signal.unit})` : ""}
          {signal.dataType === "number" ? <FaultSignalInput label={signal.label[lang] || signal.id} value={session.values[signal.id]?.value ?? 0} onCommit={(value, quality) => setSimulationValue(signal.id, value, quality)} /> : <select aria-label={signal.label[lang] || signal.id} value={String(session.values[signal.id]?.value)} onChange={e => setSimulationValue(signal.id, signal.dataType === "boolean" ? e.target.value === "true" : e.target.value)}>{(signal.dataType === "boolean" ? ["false", "true"] : signal.values ?? []).map(v => <option key={v}>{v}</option>)}</select>}
        </label><label>{t("信号质量")}<select value={session.values[signal.id]?.quality ?? "missing"} onChange={e => setSimulationValue(signal.id, session.values[signal.id]?.value ?? 0, e.target.value as Observation["quality"])}>{(["good", "missing", "stale", "invalid"] as const).map((q, i) => <option value={q} key={q}>{t(["有效", "缺失", "过期", "无效"][i])}</option>)}</select></label></div>)}
        {active && result && <div className="fault-runtime" role="status"><b>{active.code}: {t(STATUS[result.detectionStatus])}</b><p>{t(STATUS[result.alarmState])}{result.acknowledged ? ` · ${t("已确认")}` : ""}</p><div className="fault-actions"><button className="btn" disabled={result.alarmState === "clear"} onClick={() => acknowledgeFault(active.id)}>{t("确认报警")}</button><button className="btn" disabled={result.alarmState !== "recoveredAwaitingReset" || result.detectionStatus !== "normal"} onClick={() => resetFault(active.id)}>{t("复位报警")}</button></div></div>}
      </section>}
      <section className="fault-card"><div className="fault-actions"><button className="btn" onClick={() => downloadText(`${diagram.name}-fault-report.md`, buildFaultReport(diagram, diagnosticSession.get(), lang), "text/markdown")}>{t("导出故障报告")}</button><button className="btn ghost" disabled={!canEdit} onClick={() => setAdvanced(JSON.stringify(profile, null, 2))}>{t("高级规则 JSON")}</button></div>
        {advanced !== null && <div className="fault-form"><p>{t("将替换现有规则与关联，请先检查配置。")}</p><textarea className="fault-json" aria-label={t("高级规则 JSON")} value={advanced} onChange={e => setAdvanced(e.target.value)} /><button className="btn" disabled={!canEdit} onClick={() => run(() => { const next = parseDiagnosticProfile(advanced); editDiagnosticProfile(p => { Object.assign(p, next); if (!next.diagramBinding) delete p.diagramBinding; }); setAdvanced(null); })}>{t("保存完整配置")}</button></div>}
        <small>{t("代码库已保存到图纸，可随 JSON 和机型包保存。")}</small>
      </section>
    </div>
  </aside>;
}
