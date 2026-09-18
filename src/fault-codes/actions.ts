import { store, updateDiagram } from "../store";
import { uid } from "../types";
import type { DiagnosticProfile, FaultCode } from "./types";
import { EMPTY_PROFILE, bindSelection, detachProfileTargets, parseDiagnosticProfile } from "./profile";

export function editDiagnosticProfile(edit: (draft: DiagnosticProfile) => void) {
  if ((store.get().ui.mode ?? "edit") !== "edit") throw new Error("Switch to Edit mode to change definitions");
  const profile = structuredClone(store.get().diagram.settings.diagnosticProfile ?? EMPTY_PROFILE);
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
    const used = new Set(p.diagnostics.flatMap(f => f.highlightBindings.map(b => b.groupId)));
    const orphaned = new Set(removed?.highlightBindings.map(b => b.groupId).filter(g => !used.has(g)));
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
    const used = new Set(p.diagnostics.flatMap(f => f.highlightBindings.map(b => b.groupId)));
    p.highlightGroups = p.highlightGroups.filter(g => !previous.has(g.id) || used.has(g.id));
  });
}

export function importFaultCatalog(raw: string) {
  const profile = detachProfileTargets(parseDiagnosticProfile(raw));
  // Replacement is explicit in the UI; caller must preview before this transaction.
  editDiagnosticProfile(p => { Object.assign(p, profile); delete p.diagramBinding; });
}
