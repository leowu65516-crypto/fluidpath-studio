import type { AiPlan } from "./operations";
import { diagramFingerprint } from "./operations";
import { store, updateDiagram, setSelection } from "../store";

export async function applyAiPlan(plan: AiPlan) {
  if ((store.get().ui.mode ?? "edit") !== "edit") throw new Error("Switch to Edit mode first");
  const snapshot = store.get().diagram;
  if (snapshot.settings.aiAppliedRequestIds?.includes(plan.requestId)) throw new Error("This request was already applied");
  if (await diagramFingerprint(snapshot) !== plan.baseHash || store.get().diagram !== snapshot) throw new Error("Drawing changed since preview. Rebuild the request");
  // Re-check mode after the async fingerprint, then atomically commit with one undo entry.
  if ((store.get().ui.mode ?? "edit") !== "edit") throw new Error("Mode changed since preview");
  updateDiagram(d => Object.assign(d, structuredClone(plan.diagram)));
  setSelection({ nodes: plan.addedNodes, pipes: plan.addedPipes });
}
