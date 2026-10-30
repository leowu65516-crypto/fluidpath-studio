import { useEffect, useRef, useState } from "react";
import { useAppState, computeRectFocus, focusRectAnimated } from "../store";
import { nodeBBox, pipePolyline, polylineBBox } from "../geometry";
import { useT } from "../i18n";
import { createFaultCode, patchFaultCode, deleteFaultCode, bindFaultSelection, editDiagnosticProfile, importFaultCatalog, sampleKnowledgeBase, addTroubleshootingStep, patchTroubleshootingStep, deleteTroubleshootingStep, moveTroubleshootingStep, bindTroubleshootingStepSelection } from "../fault-codes/actions";
import { EMPTY_PROFILE, MAX_PROFILE_BYTES, parseDiagnosticProfile, resolveFaultTargets, resolveHighlightGroupTargets } from "../fault-codes/profile";
import { useDiagnosticSession, selectFaultCodes, selectFaultStep, setDiagnosticView, prepareDiagnosticSimulation, setSimulationRunning, advanceDiagnostics, setSimulationValue, acknowledgeFault, resetFault, toggleInjectedFault, diagnosticSession, selectKbSymptom, selectKbPart } from "../fault-codes/session";
import { codeReferences, symptomLabelOf, strongestCauseForCode } from "../fault-codes/consult";
import type { DiagnosticProfile, FaultCode, Observation, TroubleshootingStep } from "../fault-codes/types";
import { buildFaultReport, downloadText } from "../fault-codes/report";
import { FaultRuleEditor } from "./FaultRuleEditor";
import { FaultSignalInput } from "./FaultSignalInput";
import { KbConsultPanel } from "./KbConsultPanel";
import { BindingWizard, startBindingWizard } from "./BindingWizard";
import { FaultWorkbench } from "./FaultWorkbench";
import { FaultDrillEditor } from "./FaultDrillEditor";
import { startFaultDrill } from "../fault-codes/drill";
import { toast } from "../toast";

const STATUS: Record<string, string> = { notApplicable: "不适用或宽限中", normal: "正常", pending: "等待持续条件", triggered: "已触发", unknown: "无法判断", invalid: "规则无效", clear: "无活动报警", active: "活动报警", recoveredAwaitingReset: "已恢复，等待复位" };

/** 关联范围适配：允许放大小目标，限制极端放大，并沿用画布 20%–400% 的缩放边界（纯函数，单测直接覆盖）。 */
export const focusTargetViewport = computeRectFocus;

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

export function FaultCodePanel({ onClose, onOpenJson, onOpenSmart, onLoadDemo }: {
  onClose: () => void;
  onOpenJson: () => void;
  onOpenSmart: () => void;
  onLoadDemo: () => void;
}) {
  const { diagram, ui } = useAppState();
  const session = useDiagnosticSession();
  const { t, lang } = useT();
  const profile = diagram.settings.diagnosticProfile ?? EMPTY_PROFILE;
  const [activeId, setActiveId] = useState("");
  const active = profile.diagnostics.find(f => f.id === activeId);
  const [code, setCode] = useState(""), [title, setTitle] = useState(""), [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pendingImport, setPendingImport] = useState<DiagnosticProfile | null>(null);
  const [importConflicts, setImportConflicts] = useState<{ id: string; label: string }[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; code: string; refs: { label: string; count: number }[]; total: number } | null>(null);
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
  const labelOfGroup = (group?: { id: string; label: { zh?: string; en?: string } }) =>
    group ? group.label[lang] || group.label.zh || group.label.en || group.id : t("未知部件组");
  function select(fault: FaultCode, additive = false) {
    setActiveId(fault.id);
    selectFaultCodes(additive ? session.selectedIds.includes(fault.id) ? session.selectedIds.filter(id => id !== fault.id) : [...session.selectedIds, fault.id] : [fault.id]);
    if (!additive && fault.troubleshooting?.length) selectFaultStep(fault.id, 0);
    // 0.3 知识库反查：点故障码 → 定位到最高概率的部件与对应症状（与咨询台三向联动）。
    if (!additive && profile.symptoms?.length) {
      const strongest = strongestCauseForCode(profile, fault.code);
      if (strongest) {
        selectKbSymptom(strongest.symptomId);
        selectKbPart(strongest.groupId);
      }
    }
  }
  function requestDelete() {
    if (!active) return;
    const references = codeReferences(profile, active.code);
    if (!references.length) {
      run(() => { deleteFaultCode(active.id); setActiveId(""); });
      return;
    }
    const bySymptom = new Map<string, number>();
    for (const cause of references) bySymptom.set(cause.symptomId, (bySymptom.get(cause.symptomId) ?? 0) + 1);
    setPendingDelete({
      id: active.id,
      code: active.code,
      refs: [...bySymptom.entries()].map(([symptomId, count]) => ({ label: symptomLabelOf(profile, symptomId, lang), count })),
      total: references.length,
    });
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
    focusRectAnimated(left, top, right, bottom, [...targets.nodes, ...targets.pipes]);
  }
  function startBinding() {
    if (!startBindingWizard()) toast(t("没有未绑定的部件组"));
  }
  function launchDrill(faultId: string) {
    const result = startFaultDrill(faultId);
    if (!result.ok) {
      if (result.reason === "no-drill") setError(t("该故障码还没有演练配置：请在下方「故障演练」里添加注入动作后重试。"));
      return;
    }
    if (result.missingCondition) toast(t("演练引用的基线工况不存在，已按当前状态注入"));
    if (result.missingGroups?.length) toast(`${t("部分部件组未绑定，演练可能不完整")}：${result.missingGroups.length}`);
    toast(t("已开始演练：画布显示新增停流/恢复流动差异；点顶部「还原演练」恢复"));
  }
  const editText = (field: "label" | "description", language: "zh" | "en", value: string) => active && run(() => patchFaultCode(active.id, { [field]: { zh: "", en: "", ...active[field], [language]: value } }));
  return <aside className="fault-panel" aria-label={t("故障码与关联水路")} data-ui="1">
    <header className="fault-header"><div><strong>{t("故障代码")}</strong><span>{profile.namespace}</span></div><button className="btn ghost sq" onClick={onClose} aria-label={t("关闭故障代码")}>×</button></header>
    <div className="fault-scroll">
      <BindingWizard onError={setError} />
      <FaultWorkbench
        onOpenJson={onOpenJson}
        onOpenSmart={onOpenSmart}
        onLoadDemo={onLoadDemo}
        onLoadSample={() => run(() => setPendingImport(sampleKnowledgeBase()))}
        onImport={() => inputRef.current?.click()}
        onStartBinding={startBinding}
        onStartDrill={() => { const id = session.selectedIds[0]; if (id) launchDrill(id); }}
      />
      <p className="fault-intro">{t("选择代码查看排查范围；高亮和演练不改变已保存图纸的工程状态（演练可一键还原）。")}</p>
      <KbConsultPanel profile={profile} canEdit={canEdit} onError={setError}
        onImport={() => inputRef.current?.click()}
        onLoadSample={() => run(() => setPendingImport(sampleKnowledgeBase()))} />
      {!canEdit && <p className="fault-hint">{t("先在编辑或故障模式配置代码；演示和验收模式可查阅、模拟。")}</p>}
      {error && <div className="fault-error" role="alert">{t("配置错误")}: {error}</div>}
      {importConflicts.length > 0 && <section className="fault-card kb-conflicts" role="status">
        <strong>{t("以下已绑定部件组在新知识库中不存在，绑定已解除：")}</strong>
        <ul>{importConflicts.map(item => <li key={item.id}>{item.label}</li>)}</ul>
        <button className="btn ghost" onClick={() => setImportConflicts([])}>{t("知道了")}</button>
      </section>}
      <div className="fault-actions">
        <button className="btn" disabled={!profile.diagnostics.length} onClick={() => downloadText(`${diagram.name}-fault-codes.json`, JSON.stringify(profile, null, 2), "application/json")}>{t("导出知识库")}</button>
        <button className="btn" disabled={!canEdit} onClick={() => inputRef.current?.click()}>{t("导入知识库")}</button>
      </div>
      <input ref={inputRef} type="file" accept=".json,application/json,.fluidkb.json" hidden onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (!file) return;
        try { if (file.size > MAX_PROFILE_BYTES) throw new Error("File too large"); setPendingImport(parseDiagnosticProfile(await file.text())); setError(""); } catch (err) { setError((err as Error).message); }
      }} />
      {pendingImport && (() => {
        const symptomCount = pendingImport.symptoms?.length ?? 0;
        const causeCount = pendingImport.causes?.length ?? 0;
        const guideCount = pendingImport.checkGuides?.length ?? 0;
        const groupCount = pendingImport.highlightGroups.length;
        const boundNow = profile.highlightGroups.filter(g => g.nodeIds.length + g.pipeIds.length > 0).length;
        return <section className="fault-card kb-import-preview" data-testid="kb-import-preview">
          <strong>{t("导入预览")}</strong>
          <ul className="kb-import-summary">
            <li>{t("故障码")} {pendingImport.diagnostics.length}</li>
            {symptomCount > 0 && <li>{t("症状")} {symptomCount}</li>}
            {causeCount > 0 && <li>{t("原因")} {causeCount}</li>}
            <li>{t("部件组")} {groupCount}</li>
            {guideCount > 0 && <li>{t("排查要点")} {guideCount}</li>}
          </ul>
          {symptomCount > 0
            ? <p>{t("导入会替换当前故障库与知识库定义；同名部件组的画布绑定会保留，其余部件组需重新绑定。可撤销。")}</p>
            : <p>{t("导入会替换当前代码库。为避免同名或旧 ID 误绑，导入后所有目标需重新关联。可撤销。")}</p>}
          {boundNow > 0 && <p className="fault-hint">{t("当前图纸已绑定")} {boundNow} / {groupCount}</p>}
          <div className="fault-actions">
            <button className="btn" disabled={!canEdit} onClick={() => run(() => {
              const before = new Map(profile.highlightGroups.map(group => [group.id, group]));
              const result = importFaultCatalog(JSON.stringify(pendingImport));
              setImportConflicts(result.conflicts.map(id => ({ id, label: labelOfGroup(before.get(id)) })));
              setPendingImport(null); setActiveId("");
            })}>{t("导入并应用")}</button>
            <button className="btn ghost" onClick={() => setPendingImport(null)}>{t("取消导入")}</button>
          </div>
        </section>;
      })()}
      <details className="fault-card" open={!profile.diagnostics.length}><summary>{t("新建代码")}</summary><form className="fault-form" onSubmit={e => {
        e.preventDefault(); run(() => { const id = createFaultCode(code, title, lang); setActiveId(id); selectFaultCodes([id]); setCode(""); setTitle(""); });
      }}>
        <label>{t("故障码")}<input value={code} required maxLength={120} disabled={!canEdit} onChange={e => setCode(e.target.value)} placeholder="E01" /></label>
        <label>{t("故障名称")}<input value={title} maxLength={200} disabled={!canEdit} onChange={e => setTitle(e.target.value)} /></label>
        <button className="btn" type="submit" disabled={!canEdit}>{t("添加代码")}</button>
      </form></details>
      <input className="fault-search" aria-label={t("搜索代码或名称")} placeholder={t("搜索代码或名称")} value={query} onChange={e => setQuery(e.target.value)} />
      <small className="fault-hint">{t("可同时勾选多个代码叠加显示各自排查范围（仅对照，不做共同原因分析）。")}</small>
      <div className="fault-code-list">
        {profile.diagnostics.filter(f => `${f.code} ${f.label.zh} ${f.label.en}`.toLowerCase().includes(query.toLowerCase())).map(f => {
          const faultTargets = resolveFaultTargets(diagram, profile, f);
          const scopeMissing = faultTargets.nodes.length + faultTargets.pipes.length === 0;
          return <div className={`fault-code-item${active?.id === f.id ? " selected" : ""}${scopeMissing ? " scope-missing" : ""}`} key={f.id}>
            <input type="checkbox" aria-label={`${t("排查范围")} ${f.code}`} checked={session.selectedIds.includes(f.id)} onChange={() => select(f, true)} />
            <button onClick={() => select(f)}><b>{f.code}</b><span>{label(f)}</span></button>
            {scopeMissing && <span className="fault-scope-warn" title={t("该代码的排查范围还没有绑定到画布，选中时不会高亮；点开详情绑定。")}>⚠</span>}
            {session.results[f.id]?.alarmState === "active" && <span className="fault-active-dot" title={t("活动报警")}>●</span>}
          </div>;
        })}
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
          <strong>{t("排查范围")}</strong><p>{t("元件")} {targets?.nodes.length} · {t("管段")} {targets?.pipes.length}</p>
          <small>{t("画布选择")}: {ui.selection.nodes.length} + {ui.selection.pipes.length}</small>
          {!targets?.nodes.length && !targets?.pipes.length && <div className="fault-scope-empty" role="status">
            <b>{t("该代码还没有画布落点，选中时不会高亮。")}</b>
            <span>{t("在画布上框选元件/管路后点「绑定当前选择」；也可以在咨询台的绑定工作台里成组绑定。")}</span>
          </div>}
          <div className="fault-actions">{(["replace", "add", "remove"] as const).map((mode, i) => <button key={mode} className="btn" disabled={!canEdit || !ui.selection.nodes.length && !ui.selection.pipes.length} onClick={() => run(() => bindFaultSelection(active.id, mode))}>{t(["绑定当前选择", "追加当前选择", "移除当前选择"][i])}</button>)}</div>
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
        <FaultDrillEditor fault={active} profile={profile} canEdit={canEdit} run={run} />
        <section className="fault-card"><strong>{t("检测规则")}</strong>
          {active.detection ? <pre className="fault-rule-summary">{JSON.stringify(active.detection, null, 2)}</pre> : <p className="fault-hint">{t("仅查阅，无自动检测规则")}</p>}
          {canEdit && <details><summary>{t("配置数值规则")}</summary><FaultRuleEditor fault={active} onError={setError} /></details>}
          {active.detection && canEdit && <button className="btn ghost" onClick={() => run(() => editDiagnosticProfile(p => { delete p.diagnostics.find(f => f.id === active.id)!.detection; }))}>{t("移除检测规则")}</button>}
          <div className="fault-actions">
            <button className="btn ghost" onClick={() => toggleInjectedFault(active.id)}>{t(session.injectedIds.includes(active.id) ? "清除范围高亮" : "只看排查范围")}</button>
            <button className="btn" onClick={() => launchDrill(active.id)}
              title={active.drill && ((active.drill.actions?.length ?? 0) > 0 || active.drill.conditionName) ? t("注入故障状态并在画布显示差异；可一键还原") : t("先在下方「故障演练」里配置基线/注入动作")}>{t("演练故障")}</button>
          </div>
          <button className="btn ghost" disabled={!canEdit} onClick={requestDelete}>{t("删除此代码")}</button>
          {pendingDelete?.id === active.id && <div className="kb-delete-confirm" role="alert">
            <b>{t("该代码被知识库原因引用，不能直接删除：")}</b>
            <ul>{pendingDelete.refs.map(ref => <li key={ref.label}>{ref.label} · {ref.count}</li>)}</ul>
            <p className="fault-hint">{t("删除代码会同时从这些原因中移除该报警码，可用一次撤销恢复。")}</p>
            <div className="fault-actions">
              <button className="btn" onClick={() => { const id = pendingDelete.id; run(() => { deleteFaultCode(id, { removeReferences: true }); setActiveId(""); setPendingDelete(null); }); }}>{t("删除并清理引用")}</button>
              <button className="btn ghost" onClick={() => setPendingDelete(null)}>{t("取消")}</button>
            </div>
          </div>}
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
