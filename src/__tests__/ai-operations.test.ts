import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { compileAiOperations, aiExample } from "../ai/operations";
import { applyAiPlan } from "../ai/actions";
import { store, loadDiagram, undo, redo, patchNode, setWorkMode } from "../store";
import { createEmptyDiagram } from "../sample";

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("TextEncoder", TextEncoder);
  setWorkMode("edit"); loadDiagram(createEmptyDiagram());
});
describe("AI operation compiler and atomic application", () => {
  it("compiles a connected circuit and fault targets without modifying the current graph", async () => {
    const before = structuredClone(store.get().diagram);
    const plan = await compileAiOperations(JSON.stringify(await aiExample(before)), before);
    expect(plan.addedNodes).toHaveLength(4); expect(plan.addedPipes).toHaveLength(3);
    expect(plan.diagram.settings.diagnosticProfile?.diagnostics[0].code).toBe("DEMO-SUPPLY");
    expect(store.get().diagram).toEqual(before);
    await applyAiPlan(plan); expect(store.get().diagram.nodes).toHaveLength(4);
    undo(); expect(store.get().diagram.nodes).toHaveLength(0);
    redo(); expect(store.get().diagram.pipes).toHaveLength(3);
    await expect(applyAiPlan(plan)).rejects.toThrow(/already/);
  });
  it("cannot apply stale preview after another edit", async () => {
    const d = store.get().diagram;
    const plan = await compileAiOperations(JSON.stringify(await aiExample(d)), d);
    const unrelated = createEmptyDiagram(); unrelated.name = "Changed"; loadDiagram(unrelated);
    await expect(applyAiPlan(plan)).rejects.toThrow(/changed/);
    expect(store.get().diagram.nodes).toHaveLength(0);
  });
  it.each(["override", "unknownType", "occupied", "badPort", "direction", "layout"])("rejects %s transaction with zero partial application", async kind => {
    const d = store.get().diagram, request = await aiExample(d);
    const operations = request.operations as unknown as Record<string, unknown>[];
    if (kind === "override") operations.push({ op: "forceFlow", pipeId: "feed" });
    if (kind === "unknownType") operations[0].type = "inventedPump";
    if (kind === "occupied") operations.push({ op: "connectPorts", tempId: "duplicate", from: { component: "supply", port: "P1" }, to: { component: "outlet", port: "P1" }, declaredMedium: "coldWater" });
    if (kind === "badPort") operations[4].from = { component: "supply", port: "P99" };
    if (kind === "direction") operations[4].to = { component: "pump", port: "P2" };
    if (kind === "layout") { operations[0].layout = { column: 1, row: 1 }; operations[1].layout = { column: 1, row: 1 }; }
    await expect(compileAiOperations(JSON.stringify(request), d)).rejects.toThrow();
    expect(store.get().diagram).toBe(d); expect(d.nodes).toHaveLength(0);
  });
  it("unknown schema cannot be treated as a legacy operation request", async () => {
    const d = store.get().diagram, request = await aiExample(d); request.targetSchemaVersion = 4;
    await expect(compileAiOperations(JSON.stringify(request), d)).rejects.toThrow(/schema/);
  });
  it("preview does not grant authority to modify in a locked work mode", async () => {
    const d = store.get().diagram, plan = await compileAiOperations(JSON.stringify(await aiExample(d)), d);
    setWorkMode("verify"); await expect(applyAiPlan(plan)).rejects.toThrow(/Edit/);
  });
  it("setting pump state preserves extra stored boiler state and unrelated properties", async () => {
    const d = store.get().diagram, plan = await compileAiOperations(JSON.stringify(await aiExample(d)), d);
    await applyAiPlan(plan);
    const pump = store.get().diagram.nodes.find(n => n.type === "pump")!;
    patchNode(pump.id, { pumpOn: true });
    const next = store.get().diagram, request = await aiExample(next);
    (request as unknown as { operations: unknown[] }).operations = [{ op: "setOperatingCondition", component: pump.id, state: { pumpOn: false } }];
    const modified = await compileAiOperations(JSON.stringify(request), next);
    expect(modified.diagram.nodes.find(n => n.id === pump.id)?.pumpOn).toBe(false);
    expect(modified.diagram.pipes).toEqual(next.pipes);
    expect(next.nodes.find(n => n.id === pump.id)?.pumpOn).toBe(true);
  });
});
