import { useEffect, useRef, useState } from "react";
import { computeRectFocus, focusRectAnimated, setSelection, setUI, store, useAppState } from "../store";
import { nodeBBox, pipePolyline, polylineBBox } from "../geometry";
import { useT } from "../i18n";
import {
  addTroubleshootingStep, bindFaultSelection, bindKbGroupTargets, bindTroubleshootingStepSelection,
  clearKbGroupBindings, deleteFaultCode, deleteTroubleshootingStep, editDiagnosticProfile, importFaultCatalog,
  moveTroubleshootingStep, patchFaultCode, patchTroubleshootingStep, sampleKnowledgeBase, unbindGroup,
} from "../fault-codes/actions";
import { EMPTY_PROFILE, MAX_PROFILE_BYTES, parseDiagnosticProfile, resolveFaultTargets, resolveHighlightGroupTargets } from "../fault-codes/profile";
import {
  acknowledgeFault, advanceDiagnostics, diagnosticSession, prepareDiagnosticSimulation, resetFault, selectFaultCodes,
  selectFaultStep, selectKbPart, setBindPreviewGroupId, setDiagnosticView, setSimulationRunning, setSimulationValue,
  toggleInjectedFault, useDiagnosticSession,
} from "../fault-codes/session";
import { codeReferences, symptomLabelOf } from "../fault-codes/consult";
import { startFaultDrill, restoreFaultDrill } from "../fault-codes/drill";
import { faultWorkbenchStatus } from "../fault-codes/workbench";
import { suggestGroupTargets, unboundGroups } from "../fault-codes/binding";
import type { DiagnosticProfile, FaultCode, Observation, TroubleshootingStep } from "../fault-codes/types";
import { buildFaultReport, downloadText } from "../fault-codes/report";
import { saveJSONFile } from "../export";
import { toast } from "../toast";
import { FaultRuleEditor } from "./FaultRuleEditor";
import { FaultSignalInput } from "./FaultSignalInput";
import { KbConsultPanel } from "./KbConsultPanel";
import { BindingWizard, startBindingWizard, stopBindingWizard } from "./BindingWizard";
import { FaultWorkbench } from "./FaultWorkbench";
import { FaultDrillEditor } from "./FaultDrillEditor";
import { NewCodeWizard } from "./NewCodeWizard";
import { FaultKnowledgeEditor } from "./FaultKnowledgeEditor";

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
    <div className="fault-actions">{(["replace", "add", "remove"] as const).map((mode, actionIndex) => <button key={mode} className="btn" disabled={!canEdit || !hasSelection} onClick={() => run(() => bindTroubleshootingStepSelection(fault.id, step.id, mode))}>{t(["绑定当前选择", "追加当前选择", "移除当前选择"][actionIndex])}</button>)}</div>
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

/** 空白故障库模板（0.4-draft）：给"想自己配"的用户一个可导入的起点。 */
function buildLibraryTemplate(): DiagnosticProfile {
  const now = new Date().toISOString().slice(0, 10);
  return {
    format: "fluidpath.diagnostic-profile", version: "0.4-draft", namespace: "user.local",
    source: { kind: "userDeclared", appliesToRealMachine: false },
    signalDefinitions: [],
    highlightGroups: [{ id: "part-example", label: { zh: "示例部件", en: "Example part" }, resolution: "explicit", nodeIds: [], pipeIds: [] }],
    diagnostics: [{
      id: "fault-example", code: "E000", label: { zh: "示例故障", en: "Example fault" }, definitionStatus: "userDeclared",
      highlightBindings: [{ groupId: "part-example", meaning: "inspectionScope" }],
      presentation: { style: "outline", color: "#d97706", animation: "none" },
      troubleshooting: [], controlActions: [], rootCauseStatus: "notDetermined",
      drill: { note: { zh: "把示例部件卡关，用于试演练", en: "Stick the example part closed as a drill sample" }, actions: [{ groupId: "part-example", behavior: "stuckClosed" }] },
    }],
    kb: { kbVersion: 1, source: { zh: "自建故障库模板（FluidPath）", en: "Custom fault-library template (FluidPath)" }, updatedAt: now },
    symptoms: [{ id: "symptom-example", label: { zh: "示例症状", en: "Example symptom" }, group: { zh: "示例分组", en: "Example group" } }],
    causes: [{
      id: "cause-example", partGroupId: "part-example", symptomId: "symptom-example", pr: 2, own: "store", codes: ["E000"],
      why: { zh: "示例原因说明（替换为手册内容）", en: "Example cause (replace with handbook content)" },
      act: { zh: "示例对策（替换为手册内容）", en: "Example action (replace with handbook content)" }, ref: "unranked",
    }],
    checkGuides: [{ groupId: "part-example", text: { zh: "示例排查要点", en: "Example inspection point" } }],
  };
}

/** 把解析器的原始英文错误翻译成用户看得懂的下一步。 */
function describeImportError(message: string): string {
  if (/JSON|Unexpected token/i.test(message)) return "文件不是有效的 JSON：请确认选择的是 FluidPath 故障库/图纸文件";
  if (/unsupported field|requires diagnostic profile/i.test(message)) return "文件版本与当前应用不兼容（可能过新或过旧）：请用当前版本导出的知识库，或升级文件版本";
  if (/unknown fault code/i.test(message)) return "知识库的原因条目引用了不存在的报警码：请检查 causes[].codes 与故障码列表是否一致";
  if (/unknown highlight group/i.test(message)) return "知识库引用了不存在的部件组：请检查部件组 ID 是否被删除";
  if (/双|textPair|label|zh|en/i.test(message)) return "知识库缺少中英双语字段：label/why/act 等必须同时提供中文与英文";
  if (/too large/i.test(message)) return "文件过大（上限 1 MB）：请精简后再导入";
  return message;
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
  const active = profile.diagnostics.find(f => f.id === activeId) ?? profile.diagnostics.find(f => session.selectedIds.includes(f.id));
  const [error, setError] = useState("");
  const [pendingImport, setPendingImport] = useState<DiagnosticProfile | null>(null);
  const [importConflicts, setImportConflicts] = useState<{ id: string; label: string }[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; code: string; refs: { label: string; count: number }[] } | null>(null);
  const [advanced, setAdvanced] = useState<string | null>(null);
  const [showNewCode, setShowNewCode] = useState(false);
  const [showKbEditor, setShowKbEditor] = useState(false);
  const [pendingImportName, setPendingImportName] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [confirmClearBindings, setConfirmClearBindings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canEdit = !["present", "verify"].includes(ui.mode ?? "edit");
  const label = (fault: FaultCode) => fault.label[lang] || fault.label.zh || fault.label.en || fault.code;
  const labelOfGroup = (group?: { id: string; label: { zh?: string; en?: string } }) =>
    group ? group.label[lang] || group.label.zh || group.label.en || group.id : t("未知部件组");
  const status = faultWorkbenchStatus(diagram, profile);
  const step = ui.faultStep ?? (status.stage === "no-diagram" ? 1 : status.stage === "no-library" ? 2 : status.stage === "unbound" ? 3 : 4);
  const targets = active ? resolveFaultTargets(diagram, profile, active) : null;
  const result = active ? session.results[active.id] : undefined;
  const steps = active?.troubleshooting ?? [];
  const activeStepIndex = active ? Math.min(session.activeStepByFault[active.id] ?? 0, Math.max(0, steps.length - 1)) : 0;
  const unbound = unboundGroups(profile);
  const selectedGroup = session.kbPartGroupId ? profile.highlightGroups.find(group => group.id === session.kbPartGroupId) : undefined;
  const selectedGroupUnbound = !!selectedGroup && selectedGroup.nodeIds.length + selectedGroup.pipeIds.length === 0;
  const selectedGroupSuggestions = selectedGroup && selectedGroupUnbound ? suggestGroupTargets(diagram, selectedGroup) : null;
  const suggestionCount = selectedGroupSuggestions ? selectedGroupSuggestions.nodes.length + selectedGroupSuggestions.pipes.length : 0;
  const suggestibleGroups = profile.highlightGroups.filter(group => group.nodeIds.length + group.pipeIds.length === 0 && (() => { const suggestions = suggestGroupTargets(diagram, group); return suggestions.nodes.length + suggestions.pipes.length > 0; })()).length;
  const groupFilterText = groupFilter.trim().toLowerCase();
  const filteredGroups = profile.highlightGroups.filter(group => !groupFilterText || labelOfGroup(group).toLowerCase().includes(groupFilterText));
  const suggestedNames = selectedGroupSuggestions
    ? [...selectedGroupSuggestions.nodes.map(id => diagram.nodes.find(node => node.id === id)?.label ?? id), ...selectedGroupSuggestions.pipes.map(id => diagram.pipes.find(pipe => pipe.id === id)?.label ?? id)]
    : [];

  // 切换步骤时把工作区滚回顶部，避免上一组操作的滚动位置遮住当前步骤标题。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: 0 });
    else el.scrollTop = 0;
  }, [step]);
  useEffect(() => () => { setSimulationRunning(false); }, []);
  const run = (fn: () => void) => { try { fn(); setError(""); } catch (e) { setError((e as Error).message); } };
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
  function startBinding(onlyGroupIds?: string[]) {
    if (!startBindingWizard(onlyGroupIds)) toast(t("没有未绑定的部件组"));
    setUI({ faultStep: 3 });
  }
  function launchDrill(faultId: string) {
    const result = startFaultDrill(faultId);
    if (!result.ok) {
      if (result.reason === "no-drill") setError(t("该故障码还没有演练配置：请在下方「故障演练配置」里添加注入动作后重试。"));
      return;
    }
    if (result.missingCondition) toast(t("演练引用的基线工况不存在，已按当前状态注入"));
    if (result.missingGroups?.length) toast(`${t("部分部件组未绑定，演练可能不完整")}：${result.missingGroups.length}`);
    toast(t("已开始演练：画布显示新增停流/恢复流动差异；点顶部「还原演练」恢复"));
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
      id: active.id, code: active.code,
      refs: [...bySymptom.entries()].map(([symptomId, count]) => ({ label: symptomLabelOf(profile, symptomId, lang), count })),
    });
  }
  async function saveDiagram() {
    try {
      const result = await saveJSONFile(store.get().diagram);
      toast(result.picker ? t("已保存到本地") : t("已下载 JSON 文件"));
    } catch (error) { setError((error as Error).message); }
  }

  function focusObjects(nodeIds: string[], pipeIds: string[]) {
    const boxes = [
      ...diagram.nodes.filter(node => nodeIds.includes(node.id)).map(nodeBBox),
      ...diagram.pipes.filter(pipe => pipeIds.includes(pipe.id)).flatMap(pipe => {
        const points = pipePolyline(pipe, diagram.nodes);
        return points ? [polylineBBox(points)] : [];
      }),
    ];
    if (!boxes.length) return;
    const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.w)), bottom = Math.max(...boxes.map(box => box.y + box.h));
    focusRectAnimated(left, top, right, bottom, [...nodeIds, ...pipeIds]);
  }
  function applySuggestionToGroup(groupId: string) {
    const group = profile.highlightGroups.find(item => item.id === groupId);
    if (!group) return;
    const suggestions = suggestGroupTargets(diagram, group);
    if (!suggestions.nodes.length && !suggestions.pipes.length) { toast(t("该部件组没有可用的名称建议，请在画布点选对象")); return; }
    run(() => bindKbGroupTargets(groupId, suggestions));
    toast(`${t("已按名称建议绑定")}：${labelOfGroup(group)}`);
  }
  function autoSuggestAll() {
    const candidates = profile.highlightGroups
      .filter(group => group.nodeIds.length + group.pipeIds.length === 0)
      .map(group => ({ group, suggestions: suggestGroupTargets(diagram, group) }))
      .filter(item => item.suggestions.nodes.length + item.suggestions.pipes.length > 0);
    if (!candidates.length) { toast(t("没有可自动建议的部件组：请手动在画布点选")); return; }
    run(() => { for (const item of candidates) bindKbGroupTargets(item.group.id, item.suggestions); });
    toast(`${t("已自动绑定")} ${candidates.length} ${t("个部件组（基于名称建议）")}`);
  }
  function applyImport(goBind: boolean) {
    run(() => {
      const before = new Map(profile.highlightGroups.map(group => [group.id, group]));
      const result = importFaultCatalog(JSON.stringify(pendingImport));
      setImportConflicts(result.conflicts.map(id => ({ id, label: labelOfGroup(before.get(id)) })));
      setPendingImport(null); setPendingImportName(""); setActiveId("");
      const nextProfile = store.get().diagram.settings.diagnosticProfile;
      const remaining = nextProfile ? unboundGroups(nextProfile).length : 0;
      if (goBind && remaining > 0) stopBindingWizard();
      setUI({ faultStep: goBind && remaining > 0 ? 3 : remaining > 0 ? 3 : 4 });
      if (goBind && remaining > 0) startBindingWizard();
    });
  }

  const importInput = <input ref={inputRef} type="file" accept=".json,application/json,.fluidkb.json" hidden onChange={async e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try {
      if (file.size > MAX_PROFILE_BYTES) throw new Error("File too large");
      setPendingImport(parseDiagnosticProfile(await file.text()));
      setPendingImportName(file.name);
      setError("");
    } catch (err) { setError(t(describeImportError((err as Error).message))); }
  }} />;

  const importPreview = pendingImport && (() => {
    const symptomCount = pendingImport.symptoms?.length ?? 0;
    const causeCount = pendingImport.causes?.length ?? 0;
    const guideCount = pendingImport.checkGuides?.length ?? 0;
    const groupCount = pendingImport.highlightGroups.length;
    const newGroups = pendingImport.highlightGroups.filter(group => !profile.highlightGroups.some(old => old.id === group.id)).length;
    return <section className="fault-card kb-import-preview" data-testid="kb-import-preview">
      <div className="fault-section-title"><strong>{t("导入预览")}</strong><span className="fault-badge">{pendingImport.version}</span></div>
      {pendingImportName && <p className="fault-hint">📄 {pendingImportName} · namespace {pendingImport.namespace}</p>}
      <ul className="kb-import-summary">
        <li>{t("故障码")} {pendingImport.diagnostics.length}</li>
        {symptomCount > 0 && <li>{t("症状")} {symptomCount}</li>}
        {causeCount > 0 && <li>{t("原因")} {causeCount}</li>}
        <li>{t("部件组")} {groupCount}{newGroups > 0 ? `（${t("新")} ${newGroups}）` : ""}</li>
        {guideCount > 0 && <li>{t("排查要点")} {guideCount}</li>}
      </ul>
      {symptomCount > 0
        ? <p>{t("导入会替换当前故障库与知识库定义；同名部件组的画布绑定会保留，其余部件组需重新绑定。可撤销。")}</p>
        : <p>{t("导入会替换当前代码库。为避免同名或旧 ID 误绑，导入后所有目标需重新关联。可撤销。")}</p>}
      <p className="fault-hint">{t("导入后：可定位的代码取决于部件组是否已绑定；建议直接去绑定向导。")}</p>
      <div className="fault-actions">
        <button className="btn" disabled={!canEdit} onClick={() => applyImport(true)}>{t("导入并去绑定")}</button>
        <button className="btn ghost" disabled={!canEdit} onClick={() => applyImport(false)}>{t("仅导入")}</button>
        <button className="btn ghost" onClick={() => { setPendingImport(null); setPendingImportName(""); }}>{t("取消导入")}</button>
      </div>
    </section>;
  })();

  return <aside className="fault-panel" aria-label={t("故障工作台")} data-ui="1">
    <header className="fault-header"><div><strong>{t("故障工作台")}</strong><span>{profile.namespace}</span></div><button className="btn ghost sq" onClick={onClose} aria-label={t("关闭故障代码")}>×</button></header>
    <div className="fault-scroll" ref={scrollRef}>
      <FaultWorkbench />
      <BindingWizard onError={setError} />
      {showNewCode && canEdit && <NewCodeWizard canEdit={canEdit} onError={setError}
        onStartBinding={groupId => startBinding([groupId])}
        onSave={saveDiagram}
        onExport={() => downloadText(`${diagram.name}-fault-library.fluidkb.json`, JSON.stringify(profile, null, 2), "application/json")}
        onDone={() => { setShowNewCode(false); stopBindingWizard(); }} />}
      {error && <div className="fault-error" role="alert">{t("配置错误")}: {error}</div>}
      {importConflicts.length > 0 && <section className="fault-card kb-conflicts" role="status">
        <strong>{t("以下已绑定部件组在新知识库中不存在，绑定已解除：")}</strong>
        <ul>{importConflicts.map(item => <li key={item.id}>{item.label}</li>)}</ul>
        <button className="btn ghost" onClick={() => setImportConflicts([])}>{t("知道了")}</button>
      </section>}
      {importInput}

      {step === 1 && <section className="fault-card" data-testid="fault-step-diagram">
        <div className="fault-section-title"><strong>{t("① 图纸")}</strong><span className="fault-badge">{status.hasDiagram ? `${diagram.nodes.length} / ${diagram.pipes.length}` : t("未准备")}</span></div>
        {!status.hasDiagram
          ? <><p className="fault-hint">{t("故障模式需要一张图纸，才能把故障定位到具体水路。")}</p>
            <div className="fault-actions">
              <button className="btn" onClick={onOpenJson}>📂 {t("打开图纸")}</button>
              <button className="btn" onClick={onOpenSmart}>✨ {t("智能绘图生成")}</button>
              <button className="btn ghost" onClick={onLoadDemo}>{t("载入示例（图纸+知识库）")}</button>
            </div></>
          : <><p className="fault-hint">{t("当前图纸")}：<b>{diagram.name}</b> · {t("元件")} {diagram.nodes.length} · {t("管段")} {diagram.pipes.length}</p>
            <div className="fault-actions">
              <button className="btn" onClick={() => setUI({ faultStep: 2 })}>{t("下一步：故障库")} →</button>
              <button className="btn ghost" onClick={onOpenJson}>{t("打开其他图纸")}</button>
              <button className="btn ghost" onClick={onLoadDemo}>{t("载入示例")}</button>
            </div></>}
      </section>}

      {step === 2 && <section className="fault-card" data-testid="fault-step-library">
        <div className="fault-section-title"><strong>{t("② 故障库")}</strong><span className="fault-badge">{status.codeCount} {t("故障码")} · {status.symptomCount} {t("症状")}</span></div>
        <div className="step-question">
          <b>{t("有现成的故障库文件吗？")}</b>
          <p className="fault-hint">{t("支持 .fluidkb.json 知识库或 .json 故障码库；导入会替换当前故障库，可撤销。")}</p>
          <div className="fault-actions">
            <button className="btn" disabled={!canEdit} onClick={() => inputRef.current?.click()}>{t("导入知识库")}</button>
            <button className="btn ghost" disabled={!canEdit} onClick={() => run(() => setPendingImport(sampleKnowledgeBase()))}>{t("加载示例知识库")}</button>
            <button className="btn ghost" onClick={() => downloadText("fault-library-template.fluidkb.json", JSON.stringify(buildLibraryTemplate(), null, 2), "application/json")}>{t("下载空白模板")}</button>
          </div>
        </div>
        <div className="step-question">
          <b>{t("没有现成库，想自己配？")}</b>
          <p className="fault-hint">{t("新建故障码分 3 步：填写编码与名称 → 在画布绑定排查范围 → 保存文件或导出知识库。")}</p>
          <div className="fault-actions">
            <button className="btn" disabled={!canEdit} onClick={() => setShowNewCode(value => !value)}>{showNewCode ? t("收起新建向导") : t("新建故障码（3 步）")}</button>
          </div>
        </div>
        <div className="step-question">
          <b>{t("想自己配知识库内容？")}</b>
          <p className="fault-hint">{t("可以表单化添加症状、原因（概率/处置归属/关联报警码/机理与对策）和排查要点；也可以先只建故障码。")}</p>
          <div className="fault-actions">
            <button className="btn" disabled={!canEdit} onClick={() => setShowKbEditor(value => !value)}>{showKbEditor ? t("收起知识库编辑器") : t("编辑知识库内容")}</button>
            <button className="btn ghost" disabled={!canEdit} onClick={() => downloadText("fault-library-template.fluidkb.json", JSON.stringify(buildLibraryTemplate(), null, 2), "application/json")}>{t("下载模板参考")}</button>
          </div>
          {showKbEditor && <FaultKnowledgeEditor profile={profile} canEdit={canEdit} onError={setError} />}
        </div>
        <div className="step-question">
          <b>{t("要备份或交给别人？")}</b>
          <p className="fault-hint">{t("导出知识库会把故障码、症状、原因、排查要点与演练配置一起存成 .fluidkb.json。")}</p>
          <div className="fault-actions">
            <button className="btn ghost" disabled={!profile.diagnostics.length} onClick={() => downloadText(`${diagram.name}-fault-library.fluidkb.json`, JSON.stringify(profile, null, 2), "application/json")}>{t("导出知识库")}</button>
          </div>
        </div>
        {importPreview}
        <div className="fault-actions"><button className="btn" onClick={() => setUI({ faultStep: 3 })}>{t("下一步：画布落点")} →</button></div>
      </section>}

      {step === 3 && <section className="fault-card" data-testid="fault-step-binding">
        <div className="fault-section-title"><strong>{t("③ 画布落点")}</strong><span className="fault-badge">{t("已绑定")} {status.boundGroupCount}/{status.groupCount}</span></div>
        <p className="fault-hint">{t("把知识库里的部件组落到本图元件/管路上，故障码才能在画布高亮和演练。推荐用绑定向导：画布点选 → Enter 确认 → 自动下一组。")}</p>
        <div className="fault-actions">
          <button className="btn" onClick={() => startBinding()} disabled={!canEdit || unbound.length === 0}>{unbound.length ? t("开始/继续绑定向导") : t("全部已绑定")}</button>
          <button className="btn ghost" onClick={autoSuggestAll} disabled={!canEdit || suggestibleGroups === 0}>{t("一键采用全部名称建议")} ({suggestibleGroups})</button>
          <button className="btn ghost" onClick={() => inputRef.current?.click()} disabled={!canEdit}>{t("重新导入故障库")}</button>
          <button className="btn ghost" onClick={onOpenJson}>{t("重新打开图纸")}</button>
        </div>
        <div className="fault-actions">
          {confirmClearBindings
            ? <span className="inline-confirm">
              <b>{t("确认清空全部落点？可用一次撤销恢复。")}</b>
              <button className="btn" onClick={() => { run(() => clearKbGroupBindings()); setConfirmClearBindings(false); toast(t("已清空全部画布落点（可撤销）")); }}>{t("确认清空")}</button>
              <button className="btn ghost" onClick={() => setConfirmClearBindings(false)}>{t("取消")}</button>
            </span>
            : <button className="btn ghost" onClick={() => setConfirmClearBindings(true)} disabled={!canEdit || status.boundGroupCount === 0}>{t("清空全部落点")}</button>}
          {session.drill && <button className="btn ghost" onClick={() => restoreFaultDrill()}>{t("还原演练状态")}</button>}
        </div>
        <div className="fault-scope-summary">
          <span>{t("可定位的故障码")} {status.readyCodes}/{status.codeCount}</span>
          <span>{t("未绑定部件组")} {unbound.length}</span>
          <span>{t("有名称建议")} {suggestibleGroups}</span>
        </div>
        <input className="fl-search" aria-label={t("筛选部件组")} placeholder={t("筛选部件组…")} value={groupFilter} onChange={event => setGroupFilter(event.target.value)} />
        {selectedGroup && <div className="bind-group-card" data-testid="bind-group-card">
          <div className="fault-section-title"><strong>{labelOfGroup(selectedGroup)}</strong><span className="fault-badge">{selectedGroupUnbound ? t("未绑定") : `${t("已绑定")} ${selectedGroup.nodeIds.length}+${selectedGroup.pipeIds.length}`}</span></div>
          {selectedGroupUnbound
            ? <p className="fault-hint">{suggestionCount
              ? `${t("名称建议")}${lang === "zh" ? "（" : " ("}${suggestionCount}${lang === "zh" ? "）：" : "): "}${suggestedNames.slice(0, 6).join(lang === "zh" ? "、" : ", ")}${suggestedNames.length > 6 ? "…" : ""}`
              : t("没有名称建议：请在画布点选对象后手动绑定。")}</p>
            : <p className="fault-hint">{t("该组已绑定；可定位查看，或解绑后重新绑定。")}</p>}
          <div className="fault-actions">
            {selectedGroupUnbound
              ? <>
                <button className="btn" disabled={!canEdit || suggestionCount === 0} onClick={() => applySuggestionToGroup(selectedGroup.id)}>{t("采用名称建议")} ({suggestionCount})</button>
                <button className="btn ghost" disabled={suggestionCount === 0} onClick={() => { const suggestions = selectedGroupSuggestions; if (suggestions) { setSelection({ nodes: suggestions.nodes, pipes: suggestions.pipes }); focusObjects(suggestions.nodes, suggestions.pipes); } }}>{t("选中建议对象")}</button>
              </>
              : <>
                <button className="btn ghost" onClick={() => focusObjects(selectedGroup.nodeIds, selectedGroup.pipeIds)}>{t("定位已绑定对象")}</button>
                <button className="btn ghost" disabled={!canEdit} onClick={() => run(() => unbindGroup(selectedGroup.id))}>{t("解绑此组")}</button>
              </>}
            <button className="btn ghost" onClick={() => { selectKbPart(null); setBindPreviewGroupId(null); }}>{t("取消选中")}</button>
          </div>
        </div>}
        <div className="bind-group-list">
          {filteredGroups.map(group => {
            const suggestions = suggestGroupTargets(diagram, group);
            const count = suggestions.nodes.length + suggestions.pipes.length;
            const bound = group.nodeIds.length + group.pipeIds.length > 0;
            return <div className={`bind-group-row${session.kbPartGroupId === group.id ? " on" : ""}${bound ? " bound" : ""}`} key={group.id}>
              <button className="bind-group-name" onClick={() => { selectKbPart(group.id); setBindPreviewGroupId(group.id); }} title={labelOfGroup(group)}>
                <i>{bound ? "✓" : count ? "◌" : "○"}</i>{labelOfGroup(group)}
                <em>{bound ? `${group.nodeIds.length + group.pipeIds.length}` : count ? `${t("建议")} ${count}` : t("手动")}</em>
              </button>
              <div className="bind-group-actions">
                {bound
                  ? <>
                    <button className="btn ghost mini" onClick={() => focusObjects(group.nodeIds, group.pipeIds)}>{t("定位")}</button>
                    <button className="btn ghost mini" disabled={!canEdit} onClick={() => run(() => unbindGroup(group.id))}>{t("解绑")}</button>
                  </>
                  : <>
                    {count > 0
                      ? <button className="btn ghost mini" disabled={!canEdit} onClick={() => applySuggestionToGroup(group.id)}>{t("采用建议")} ({count})</button>
                      : <span className="bind-manual">{t("请在画布手动点选")}</span>}
                    <button className="btn ghost mini" onClick={() => { selectKbPart(group.id); setBindPreviewGroupId(group.id); }}>{t("选中")}</button>
                  </>}
              </div>
            </div>;
          })}
          {!filteredGroups.length && <p className="fault-hint">{t("没有匹配的部件组。")}</p>}
        </div>
        <div className="fault-actions"><button className="btn" onClick={() => setUI({ faultStep: 4 })}>{t("下一步：演练")} →</button></div>
      </section>}

      {step === 4 && <div data-testid="fault-step-drill">
        {!active && <section className="fault-card">
          <div className="fault-section-title"><strong>{t("④ 演练")}</strong><span className="fault-badge">{t("未选中代码")}</span></div>
          <p className="fault-hint">{t("从左侧故障码列表选一个代码；没有代码就去「故障库」导入或新建。")}</p>
          <div className="fault-actions">
            <button className="btn" onClick={() => setUI({ faultStep: 2 })}>{t("去故障库")}</button>
            <button className="btn ghost" onClick={() => setUI({ faultStep: 3 })}>{t("去画布落点")}</button>
          </div>
        </section>}
        {active && <>
          <section className="fault-card">
            <div className="fault-section-title"><strong>{t("④ 演练")} · {active.code}</strong><span className="fault-badge">{label(active)}</span></div>
            <p className="fault-hint">{t("什么时候用：机器出现该报警时，先看排查范围，再演练故障看水路会怎样变化；演练可一键还原。")}</p>
            <div className="fault-actions">
              <button className="btn ghost" onClick={() => toggleInjectedFault(active.id)}>{t(session.injectedIds.includes(active.id) ? "清除范围高亮" : "只看排查范围")}</button>
              <button className="btn" onClick={() => launchDrill(active.id)}
                title={active.drill?.actions?.length ? t("注入故障状态并在画布显示差异；可一键还原") : t("先在下方「故障演练配置」里添加注入动作")}>{t("演练故障")}</button>
              {session.drill && <button className="btn ghost" onClick={() => restoreFaultDrill()}>{t("还原演练")}</button>}
            </div>
            {!targets?.nodes.length && !targets?.pipes.length && <div className="fault-scope-empty" role="status">
              <b>{t("该代码还没有画布落点，选中时不会高亮。")}</b>
              <span>{t("去「画布落点」绑定对应部件组；或先执行「只看排查范围」。")}</span>
            </div>}
            {session.drill && <div className="fw-drill-live">
              <b>⚠ {t("演练进行中")} · {session.drill.faultCode}</b>
              <span>{t("新增停流")} {session.drill.changes.stoppedPipes.length} · {t("恢复流动")} {session.drill.changes.flowingPipes.length} · {t("注入元件")} {session.drill.injected.length}</span>
            </div>}
            <div className="fault-actions">
              <button className="btn ghost mini" onClick={focusTargets} disabled={!targets || targets.nodes.length + targets.pipes.length === 0}>{t("定位排查范围")}</button>
              <button className="btn ghost mini" onClick={() => selectFaultCodes([])}>{t("清除高亮")}</button>
            </div>
          </section>

          <details className="fault-card">
            <summary>{t("故障演练配置")} · {active.drill?.actions?.length || active.drill?.conditionName ? t("已配置") : t("未配置")}</summary>
            <FaultDrillEditor fault={active} profile={profile} canEdit={canEdit} run={run} />
          </details>

          <details className="fault-card">
            <summary>{t("诊断咨询（按症状查手册）")}</summary>
            <p className="fault-hint">{t("不知道是哪个代码时用这里：选症状 → 看嫌疑部件与概率 → 点部件看对策；点关联码可切换代码。")}</p>
            <KbConsultPanel profile={profile} canEdit={canEdit} onError={setError}
              onImport={() => inputRef.current?.click()}
              onLoadSample={() => run(() => setPendingImport(sampleKnowledgeBase()))} />
          </details>

          <details className="fault-card">
            <summary>{t("排查范围与步骤")}</summary>
            <p className="fault-hint">{t("范围绑定与步骤编辑属于进阶配置；只想演示可以跳过。")}</p>
            <div className="fault-form">
              <label>{t("中文名称")}<input key={`${active.id}-zh-${active.label.zh}`} defaultValue={active.label.zh} disabled={!canEdit} onBlur={e => { if (e.target.value !== active.label.zh) run(() => patchFaultCode(active.id, { label: { ...active.label, zh: e.target.value } })); }} /></label>
              <label>{t("英文名称")}<input key={`${active.id}-en-${active.label.en}`} defaultValue={active.label.en} disabled={!canEdit} onBlur={e => { if (e.target.value !== active.label.en) run(() => patchFaultCode(active.id, { label: { ...active.label, en: e.target.value } })); }} /></label>
              <label>{t("排查说明")}<textarea key={`${active.id}-${lang}-${active.description?.[lang] ?? ""}`} defaultValue={active.description?.[lang] ?? ""} disabled={!canEdit} onBlur={e => { if (e.target.value !== (active.description?.[lang] ?? "")) run(() => patchFaultCode(active.id, { description: { zh: "", en: "", ...active.description, [lang]: e.target.value } })); }} /></label>
            </div>
            <div className="fault-actions">{(["replace", "add", "remove"] as const).map((mode, i) => <button key={mode} className="btn" disabled={!canEdit || (!ui.selection.nodes.length && !ui.selection.pipes.length)} onClick={() => run(() => bindFaultSelection(active.id, mode))}>{t(["绑定当前选择", "追加当前选择", "移除当前选择"][i])}</button>)}</div>
            {!!targets?.missing.length && <div className="fault-error" role="alert">{t("关联对象被删除，请重新绑定。")}</div>}
            <details><summary>{t("当前目标列表")}</summary><ul>{targets?.nodes.map(id => <li key={id}>{diagram.nodes.find(n => n.id === id)?.label || id}</li>)}{targets?.pipes.map(id => <li key={id}>{diagram.pipes.find(p => p.id === id)?.label || id}</li>)}</ul></details>
            <div className="fault-actions"><label className="fault-check">{t("高亮颜色")}<input type="color" disabled={!canEdit} value={active.presentation.color} onChange={e => run(() => patchFaultCode(active.id, { presentation: { ...active.presentation, color: e.target.value } }))} /></label><label className="fault-check"><input type="checkbox" checked={session.revealHidden} onChange={e => setDiagnosticView({ revealHidden: e.target.checked })} />{t("临时显示隐藏对象")}</label><label className="fault-check"><input type="checkbox" checked={!session.animation} onChange={e => setDiagnosticView({ animation: !e.target.checked })} />{t("关闭高亮动画")}</label></div>
            <div className="fault-section-title"><strong>{t("排查步骤")}</strong><span className="fault-badge">{steps.length ? `${t("步骤")} ${activeStepIndex + 1} / ${steps.length}` : t("未配置")}</span></div>
            {steps.map((troubleStep, index) => <TroubleshootingStepEditor key={troubleStep.id} diagram={diagram} profile={profile} fault={active} step={troubleStep} index={index} activeIndex={activeStepIndex} lang={lang} canEdit={canEdit} selection={ui.selection} run={run} onSelect={nextIndex => selectFaultStep(active.id, nextIndex)} />)}
            <div className="fault-actions"><button className="btn" disabled={!canEdit} onClick={() => run(() => { addTroubleshootingStep(active.id, lang); selectFaultStep(active.id, active.troubleshooting?.length ?? 0); })}>{t("新增步骤")}</button></div>
          </details>

          <details className="fault-card">
            <summary>{t("检测规则与模拟")}</summary>
            {active.detection ? <pre className="fault-rule-summary">{JSON.stringify(active.detection, null, 2)}</pre> : <p className="fault-hint">{t("仅查阅，无自动检测规则")}</p>}
            {canEdit && <details><summary>{t("配置数值规则")}</summary><FaultRuleEditor fault={active} onError={setError} /></details>}
            {active.detection && canEdit && <button className="btn ghost" onClick={() => run(() => editDiagnosticProfile(p => { delete p.diagnostics.find(f => f.id === active.id)!.detection; }))}>{t("移除检测规则")}</button>}
            {!!profile.diagnostics.some(f => f.detection) && <div className="fault-simulator">
              <div className="fault-actions"><button className="btn" onClick={() => prepareDiagnosticSimulation(profile)}>{t(session.profile ? "复位模拟" : "初始化模拟")}</button><button className="btn" disabled={!session.profile} onClick={() => setSimulationRunning(!session.running)}>{t(session.running ? "暂停模拟" : "运行模拟")}</button><button className="btn" disabled={!session.profile || session.running} onClick={() => advanceDiagnostics(100)}>{t("单步 0.1 秒")}</button></div>
              <output aria-label={t("仿真时间")}>{(session.nowMs / 1000).toFixed(1)} s</output>
              {session.profile?.signalDefinitions.map(signal => <div className="fault-signal" key={signal.id}><label>{signal.label[lang] || signal.label.zh || signal.label.en} {signal.unit ? `(${signal.unit})` : ""}
                {signal.dataType === "number" ? <FaultSignalInput label={signal.label[lang] || signal.id} value={session.values[signal.id]?.value ?? 0} onCommit={(value, quality) => setSimulationValue(signal.id, value, quality)} /> : <select aria-label={signal.label[lang] || signal.id} value={String(session.values[signal.id]?.value)} onChange={e => setSimulationValue(signal.id, signal.dataType === "boolean" ? e.target.value === "true" : e.target.value)}>{(signal.dataType === "boolean" ? ["false", "true"] : signal.values ?? []).map(v => <option key={v}>{v}</option>)}</select>}
              </label><label>{t("信号质量")}<select value={session.values[signal.id]?.quality ?? "missing"} onChange={e => setSimulationValue(signal.id, session.values[signal.id]?.value ?? 0, e.target.value as Observation["quality"])}>{(["good", "missing", "stale", "invalid"] as const).map((q, i) => <option value={q} key={q}>{t(["有效", "缺失", "过期", "无效"][i])}</option>)}</select></label></div>)}
              {active && result && <div className="fault-runtime" role="status"><b>{active.code}: {t(STATUS[result.detectionStatus])}</b><p>{t(STATUS[result.alarmState])}{result.acknowledged ? ` · ${t("已确认")}` : ""}</p><div className="fault-actions"><button className="btn" disabled={result.alarmState === "clear"} onClick={() => acknowledgeFault(active.id)}>{t("确认报警")}</button><button className="btn" disabled={result.alarmState !== "recoveredAwaitingReset" || result.detectionStatus !== "normal"} onClick={() => resetFault(active.id)}>{t("复位报警")}</button></div></div>}
            </div>}
          </details>

          <details className="fault-card">
            <summary>{t("更多：报告、高级 JSON 与删除")}</summary>
            <div className="fault-actions">
              <button className="btn" onClick={() => downloadText(`${diagram.name}-fault-report.md`, buildFaultReport(diagram, diagnosticSession.get(), lang), "text/markdown")}>{t("导出故障报告")}</button>
              <button className="btn ghost" disabled={!canEdit} onClick={() => setAdvanced(JSON.stringify(profile, null, 2))}>{t("高级规则 JSON")}</button>
            </div>
            {advanced !== null && <div className="fault-form"><p>{t("将替换现有规则与关联，请先检查配置。")}</p><textarea className="fault-json" aria-label={t("高级规则 JSON")} value={advanced} onChange={e => setAdvanced(e.target.value)} /><button className="btn" disabled={!canEdit} onClick={() => run(() => { const next = parseDiagnosticProfile(advanced); editDiagnosticProfile(p => { Object.assign(p, next); if (!next.diagramBinding) delete p.diagramBinding; }); setAdvanced(null); })}>{t("保存完整配置")}</button></div>}
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
            <small>{t("代码库已保存到图纸，可随 JSON 和机型包保存。")}</small>
          </details>
        </>}
      </div>}
    </div>
  </aside>;
}
