import { store, updateDiagram } from "../store";
import { uid } from "../types";
import type { DiagnosticProfile, FaultCode, HighlightGroup, TroubleshootingStep } from "./types";
import { EMPTY_PROFILE, bindSelection, detachProfileTargets, mergeProfileBindings, parseDiagnosticProfile } from "./profile";
import { codeReferences } from "./consult";
// 静态内联：本项目的离线文件夹版要求单文件 IIFE 产物（file-protocol 测试锁定），不能代码分割。
import MILK_KB_SAMPLE from "../../MILK-KB.fluidkb.json";

export function editDiagnosticProfile(edit: (draft: DiagnosticProfile) => void) {
  const mode = store.get().ui.mode ?? "edit";
  if (mode === "present" || mode === "verify") throw new Error("Switch to Edit or Fault mode to change definitions");
  const profile = structuredClone(store.get().diagram.settings.diagnosticProfile ?? EMPTY_PROFILE);
  // v0.2 adds non-executable, ordered troubleshooting steps. Existing v0.1 files remain importable.
  if (profile.version === "0.1-draft") profile.version = "0.2-draft";
  edit(profile);
  const validated = parseDiagnosticProfile(profile);
  updateDiagram(d => { d.settings.diagnosticProfile = validated; });
}

export function createFaultCode(code: string, title: string, lang: "zh" | "en") {
  const id = uid("fault"), groupId = uid("circuit");
  editDiagnosticProfile(profile => {
    const label = { zh: "", en: "", [lang]: title.trim() || code.trim() };
    profile.highlightGroups.push({ id: groupId, label, resolution: "explicit", nodeIds: [], pipeIds: [] });
    profile.diagnostics.push({
      id, code: code.trim(), label, definitionStatus: "userDeclared", rootCauseStatus: "notDetermined", controlActions: [],
      highlightBindings: [{ groupId, meaning: "inspectionScope" }],
      presentation: { style: "outline", color: "#d97706", animation: "none" },
      troubleshooting: [],
    });
  });
  return id;
}

export function patchFaultCode(id: string, patch: Partial<FaultCode>) {
  editDiagnosticProfile(p => {
    const index = p.diagnostics.findIndex(f => f.id === id);
    if (index < 0) throw new Error("Fault code no longer exists");
    p.diagnostics[index] = { ...p.diagnostics[index], ...patch, id };
  });
}

/**
 * 删除故障码。被知识库 causes 引用时默认拒绝（parser 会拒绝悬空 code 引用），
 * UI 先展示引用清单，用户确认后用 removeReferences 级联清理 codes（可撤销）。
 */
export function deleteFaultCode(id: string, options: { removeReferences?: boolean } = {}) {
  editDiagnosticProfile(p => {
    const removed = p.diagnostics.find(f => f.id === id);
    if (!removed) throw new Error("Fault code no longer exists");
    const references = codeReferences(p, removed.code);
    if (references.length && !options.removeReferences) {
      throw new Error(`Referenced by ${references.length} knowledge-base cause(s); remove references first`);
    }
    if (references.length) {
      p.causes = (p.causes ?? []).map(cause => cause.codes.includes(removed.code)
        ? { ...cause, codes: cause.codes.filter(code => code !== removed.code) }
        : cause);
    }
    p.diagnostics = p.diagnostics.filter(f => f.id !== id);
    const used = referencedGroupIds(p);
    const orphaned = new Set([...(removed?.highlightBindings.map(b => b.groupId) ?? []), ...(removed?.troubleshooting?.flatMap(step => step.highlightBinding ? [step.highlightBinding.groupId] : []) ?? [])].filter(g => !used.has(g)));
    p.highlightGroups = p.highlightGroups.filter(g => !orphaned.has(g.id));
  });
}

export function bindFaultSelection(id: string, mode: "replace" | "add" | "remove") {
  const selection = store.get().ui.selection;
  if (!selection.nodes.length && !selection.pipes.length) throw new Error("Select components or pipes on the canvas first");
  editDiagnosticProfile(p => {
    const fault = p.diagnostics.find(f => f.id === id);
    if (!fault) throw new Error("Fault code no longer exists");
    // Editing a code's targets never silently changes a shared named group.
    const groupId = uid("circuit");
    const merged = { id: groupId, label: fault.label, resolution: "explicit" as const, nodeIds: [] as string[], pipeIds: [] as string[] };
    for (const b of fault.highlightBindings) {
      const g = p.highlightGroups.find(x => x.id === b.groupId);
      if (g) { merged.nodeIds.push(...g.nodeIds); merged.pipeIds.push(...g.pipeIds); }
    }
    p.highlightGroups.push(bindSelection(merged, selection, mode));
    const previous = new Set(fault.highlightBindings.map(b => b.groupId));
    fault.highlightBindings = [{ groupId, meaning: "inspectionScope" }];
    const used = referencedGroupIds(p);
    p.highlightGroups = p.highlightGroups.filter(g => !previous.has(g.id) || used.has(g.id));
  });
}

function referencedGroupIds(profile: DiagnosticProfile) {
  return new Set([
    ...profile.diagnostics.flatMap(f => [
      ...f.highlightBindings.map(binding => binding.groupId),
      ...(f.troubleshooting ?? []).flatMap(step => step.highlightBinding ? [step.highlightBinding.groupId] : []),
    ]),
    // 0.3：知识库的部件组被 causes/checkGuides 引用，不得当作孤儿清理
    ...(profile.causes ?? []).map(c => c.partGroupId),
    ...(profile.checkGuides ?? []).map(g => g.groupId),
  ]);
}

/** 0.3 知识库：把当前画布选择绑定到部件组（节点/管路身份即该部件在本图中的落点）。 */
export function bindKbGroupSelection(groupId: string, mode: "replace" | "add" | "remove") {
  const selection = store.get().ui.selection;
  if (!selection.nodes.length && !selection.pipes.length) throw new Error("Select components or pipes on the canvas first");
  editDiagnosticProfile(p => {
    const group = p.highlightGroups.find(g => g.id === groupId);
    if (!group) throw new Error("Part group no longer exists");
    const next = bindSelection(group, selection, mode);
    group.nodeIds = next.nodeIds;
    group.pipeIds = next.pipeIds;
  });
}

/** 0.3 知识库：用显式给定的落点绑定（仅供用户确认名称建议后调用，绝不静默执行）。 */
export function bindKbGroupTargets(groupId: string, targets: { nodes: string[]; pipes: string[] }, mode: "replace" | "add" = "replace") {
  editDiagnosticProfile(p => {
    const group = p.highlightGroups.find(g => g.id === groupId);
    if (!group) throw new Error("Part group no longer exists");
    group.nodeIds = mode === "replace" ? [...new Set(targets.nodes)] : [...new Set([...group.nodeIds, ...targets.nodes])];
    group.pipeIds = mode === "replace" ? [...new Set(targets.pipes)] : [...new Set([...group.pipeIds, ...targets.pipes])];
  });
}

/** 清空所有部件组的画布落点（可撤销；代码范围组也会一起清空）。 */
export function clearKbGroupBindings() {
  editDiagnosticProfile(p => {
    for (const group of p.highlightGroups) {
      group.nodeIds = [];
      group.pipeIds = [];
    }
  });
}

export function addTroubleshootingStep(faultId: string, lang: "zh" | "en") {
  const stepId = uid("faultStep");
  editDiagnosticProfile(profile => {
    const fault = profile.diagnostics.find(f => f.id === faultId);
    if (!fault) throw new Error("Fault code no longer exists");
    const stepNumber = (fault.troubleshooting?.length ?? 0) + 1;
    const step: TroubleshootingStep = {
      id: stepId,
      label: { zh: lang === "zh" ? `排查步骤 ${stepNumber}` : "", en: lang === "en" ? `Check ${stepNumber}` : "" },
      sensorIds: [],
      presentation: { color: "#c84a2f", animation: "flash" },
    };
    fault.troubleshooting = [...(fault.troubleshooting ?? []), step];
  });
  return stepId;
}

export function patchTroubleshootingStep(faultId: string, stepId: string, patch: Partial<TroubleshootingStep>) {
  editDiagnosticProfile(profile => {
    const fault = profile.diagnostics.find(f => f.id === faultId);
    const index = fault?.troubleshooting?.findIndex(step => step.id === stepId) ?? -1;
    if (!fault || index < 0) throw new Error("Troubleshooting step no longer exists");
    fault.troubleshooting![index] = { ...fault.troubleshooting![index], ...patch, id: stepId };
  });
}

export function deleteTroubleshootingStep(faultId: string, stepId: string) {
  editDiagnosticProfile(profile => {
    const fault = profile.diagnostics.find(f => f.id === faultId);
    if (!fault) throw new Error("Fault code no longer exists");
    const removed = fault.troubleshooting?.find(step => step.id === stepId);
    fault.troubleshooting = (fault.troubleshooting ?? []).filter(step => step.id !== stepId);
    const groupId = removed?.highlightBinding?.groupId;
    if (groupId && !referencedGroupIds(profile).has(groupId)) profile.highlightGroups = profile.highlightGroups.filter(group => group.id !== groupId);
  });
}

export function moveTroubleshootingStep(faultId: string, stepId: string, direction: -1 | 1) {
  editDiagnosticProfile(profile => {
    const fault = profile.diagnostics.find(f => f.id === faultId);
    const index = fault?.troubleshooting?.findIndex(step => step.id === stepId) ?? -1;
    if (!fault || index < 0) throw new Error("Troubleshooting step no longer exists");
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fault.troubleshooting!.length) return;
    [fault.troubleshooting![index], fault.troubleshooting![nextIndex]] = [fault.troubleshooting![nextIndex], fault.troubleshooting![index]];
  });
}

export function bindTroubleshootingStepSelection(faultId: string, stepId: string, mode: "replace" | "add" | "remove") {
  const selection = store.get().ui.selection;
  if (!selection.nodes.length && !selection.pipes.length) throw new Error("Select components or pipes on the canvas first");
  editDiagnosticProfile(profile => {
    const fault = profile.diagnostics.find(f => f.id === faultId);
    const step = fault?.troubleshooting?.find(item => item.id === stepId);
    if (!fault || !step) throw new Error("Troubleshooting step no longer exists");
    const oldGroup = step.highlightBinding ? profile.highlightGroups.find(group => group.id === step.highlightBinding!.groupId) : undefined;
    const groupId = uid("stepCircuit");
    const base: HighlightGroup = {
      id: groupId,
      label: step.label,
      resolution: "explicit",
      nodeIds: oldGroup?.nodeIds ?? [],
      pipeIds: oldGroup?.pipeIds ?? [],
    };
    profile.highlightGroups.push(bindSelection(base, selection, mode));
    const previous = step.highlightBinding?.groupId;
    step.highlightBinding = { groupId };
    if (previous && !referencedGroupIds(profile).has(previous)) profile.highlightGroups = profile.highlightGroups.filter(group => group.id !== previous);
  });
}

/**
 * 导入知识库 / 故障码库。
 * - 同 namespace 且带 KB 元数据的升级导入：按协议 §18.5 保留同名部件组的画布绑定，返回冲突清单；
 * - 跨机型 / 无 KB 元数据：仍走 detachProfileTargets，避免旧 ID 误绑（可撤销）。
 */
export function importFaultCatalog(raw: string): { conflicts: string[]; preservedBindings: boolean } {
  const next = parseDiagnosticProfile(raw);
  let conflicts: string[] = [];
  let preservedBindings = false;
  editDiagnosticProfile(p => {
    const sameNamespace = p.namespace === next.namespace;
    const hasKb = !!(p.kb || next.kb);
    if (sameNamespace && hasKb) {
      const merged = mergeProfileBindings(next, p);
      conflicts = merged.conflicts;
      preservedBindings = true;
      Object.assign(p, merged.profile);
    } else {
      Object.assign(p, detachProfileTargets(next));
    }
    delete p.diagramBinding;
  });
  return { conflicts, preservedBindings };
}

/** 内置黄金样例（奶泵模组 V7，0.3-draft）——先经导入预览确认，再写入图纸。 */
export function sampleKnowledgeBase(): DiagnosticProfile {
  return parseDiagnosticProfile(MILK_KB_SAMPLE);
}
