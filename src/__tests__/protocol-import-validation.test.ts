import { describe, expect, it } from "vitest";
import { parseDiagramJSON, migrateDiagramToCurrent } from "../export";
import { runValidationCase } from "../validation";
import { pipeEngineeringDisabled, setCachedPipes } from "../geometry";
import { createEmptyDiagram } from "../sample";
import type { ValidationCase } from "../types";
import raw from "../../BCMTS.json";

describe("protocol import and meaningful acceptance results", () => {
  it("unknown future schemas are rejected without mutating version", () => {
    const d = { ...createEmptyDiagram(), _version: 99 };
    expect(() => parseDiagramJSON(JSON.stringify(d))).toThrow(/version/);
    expect(() => migrateDiagramToCurrent(d)).toThrow(); expect(d._version).toBe(99);
  });
  it("old nested coordinates are migrated before new shape validation", () => {
    const d = { ...createEmptyDiagram(), _version: 1, nodes: [{ id: "old", kind: "pump", position: { x: 12, y: 34 }, size: { width: 80, height: 80 }, ports: [] }] };
    const migrated = parseDiagramJSON(JSON.stringify(d));
    expect(migrated.nodes[0]).toMatchObject({ id: "old", type: "pump", x: 12, y: 34 });
  });
  it("bad diagnostic modules fail with field paths instead of entering the store", () => {
    const d = { ...createEmptyDiagram(), settings: { diagnosticProfile: { version: 999 } } };
    expect(() => parseDiagramJSON(JSON.stringify(d))).toThrow();
  });
  it("missing pipes are INVALID, never fabricated actual stop", () => {
    const d = parseDiagramJSON(JSON.stringify(raw));
    const r = runValidationCase(d, { id: "stale", name: "stale", state: {}, mustFlowPipeIds: [], mustStopPipeIds: ["deleted"] });
    expect(r.status).toBe("INVALID"); expect(r.passed).toBe(false);
    expect(r.failures[0].actual).toBe("missing"); expect(r.issues).toContain("INVALID_REFERENCE: deleted");
  });
  it("zero assertions, conflicting assertions and missing state references are invalid", () => {
    const d = parseDiagramJSON(JSON.stringify(raw)), pipe = d.pipes[0].id;
    const cases: Array<Pick<ValidationCase, "state" | "mustFlowPipeIds" | "mustStopPipeIds">> = [
      { state: {}, mustFlowPipeIds: [], mustStopPipeIds: [] },
      { state: {}, mustFlowPipeIds: [pipe], mustStopPipeIds: [pipe] },
      { state: { absent: { pumpOn: true } }, mustFlowPipeIds: [], mustStopPipeIds: [pipe] },
    ];
    for (const c of cases) expect(runValidationCase(d, { id: "bad", name: "bad", ...c }).status).toBe("INVALID");
  });
  it("acceptance returns the global engine cache to the original drawing", () => {
    const d = parseDiagramJSON(JSON.stringify(raw));
    setCachedPipes(d.pipes, d.nodes); const before = d.pipes.map(p => pipeEngineeringDisabled(p, d.nodes));
    runValidationCase(d, { id: "off", name: "off", state: { n_ms7jr4mj2wu7sw: { pumpOn: false } }, mustFlowPipeIds: [], mustStopPipeIds: ["pipe_ms7k87u8l8re4p"] });
    expect(d.pipes.map(p => pipeEngineeringDisabled(p, d.nodes))).toEqual(before);
  });
});
