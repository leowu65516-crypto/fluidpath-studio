import { describe, expect, it } from "vitest";
import bcmtsRaw from "../../BCMTS.json";
import { parseDiagramJSON } from "../export";
import { runValidationCase, runValidationCases } from "../validation";

describe("图纸工况验收", () => {
  it("BCMTS 图纸内置的断水停泵验收工况可直接通过", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    const results = runValidationCases(d);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "断水停泵：锅炉补水链停流", passed: true, checked: 5 });
  });

  it("BCMTS 断水停泵工况通过，且不改动原图当前状态", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    const pump = d.nodes.find((n) => n.id === "n_ms7jr4mj2wu7sw")!;
    const inletValve = d.nodes.find((n) => n.id === "n_ms7jsb6764ggp8")!;
    const stateBefore = { pumpOn: pump.pumpOn, valveState: inletValve.valveState };
    const ids = (labels: string[]) => labels.map((label) => d.pipes.find((p) => p.label === label)!.id);
    const result = runValidationCase(d, {
      id: "water-off",
      name: "断水停泵",
      state: {
        [pump.id]: { pumpOn: false },
        [inletValve.id]: { valveState: "closed" },
      },
      mustFlowPipeIds: [],
      mustStopPipeIds: ids(["管路 61", "管路 62", "管路 4", "管路 5", "管路 3"]),
    });
    expect(result.passed).toBe(true);
    expect(result.checked).toBe(5);
    expect({ pumpOn: pump.pumpOn, valveState: inletValve.valveState }).toEqual(stateBefore);
  });

  it("错误期望会指出具体管路与实际状态", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    const p = d.pipes.find((x) => x.label === "管路 3")!;
    const result = runValidationCase(d, {
      id: "wrong",
      name: "错误断言",
      state: { n_ms7jr4mj2wu7sw: { pumpOn: false } },
      mustFlowPipeIds: [p.id],
      mustStopPipeIds: [],
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatchObject({ pipeId: p.id, expected: "flow", actual: "stop" });
  });
});
