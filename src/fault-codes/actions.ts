import { store, updateDiagram } from "../store";
import { uid } from "../types";
import type { DiagnosticProfile, FaultCode, HighlightGroup, TroubleshootingStep } from "./types";
import { EMPTY_PROFILE, bindSelection, detachProfileTargets, parseDiagnosticProfile } from "./profile";

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

export function deleteFaultCode(id: string) {
  editDiagnosticProfile(p => {
    const removed = p.diagnostics.find(f => f.id === id);
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
  return new Set(profile.diagnostics.flatMap(f => [
    ...f.highlightBindings.map(binding => binding.groupId),
    ...(f.troubleshooting ?? []).flatMap(step => step.highlightBinding ? [step.highlightBinding.groupId] : []),
  ]));
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

export function importFaultCatalog(raw: string) {
  const profile = detachProfileTargets(parseDiagnosticProfile(raw));
  // Replacement is explicit in the UI; caller must preview before this transaction.
  editDiagnosticProfile(p => { Object.assign(p, profile); delete p.diagramBinding; });
}
