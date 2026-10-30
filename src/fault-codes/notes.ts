/** 故障模式专用的画布备注/高亮（只在故障模式下显示，随图纸保存，不影响工程判定）。 */
import { store, updateDiagram } from "../store";
import { uid } from "../types";
import type { FaultNote } from "../types";

export function faultNotes(diagram: { settings: { faultNotes?: FaultNote[] } }): FaultNote[] {
  return diagram.settings.faultNotes ?? [];
}

/** 用当前画布选择创建一条备注；没有选择时返回 null。 */
export function addFaultNote(text: string, color = "#b45309"): string | null {
  const selection = store.get().ui.selection;
  if (!selection.nodes.length && !selection.pipes.length) return null;
  const id = uid("fnote");
  updateDiagram(diagram => {
    diagram.settings.faultNotes = [...(diagram.settings.faultNotes ?? []), {
      id, text: text.trim(), color,
      nodeIds: [...selection.nodes], pipeIds: [...selection.pipes],
    }];
  });
  return id;
}

export function removeFaultNote(id: string): void {
  updateDiagram(diagram => {
    diagram.settings.faultNotes = (diagram.settings.faultNotes ?? []).filter(note => note.id !== id);
  });
}

export function clearFaultNotes(): void {
  updateDiagram(diagram => { diagram.settings.faultNotes = []; });
}
