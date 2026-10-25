import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SMART_TEMPLATES, buildSmartTemplate } from "../smart-draw/templates";
import { diagnosisSummary } from "../diagnostics";
import { engineeringIssues } from "../smart-draw/engineering";
import type { Diagram, WorkCondition } from "../types";
import {
  pipeEffectiveDisabled,
  pipeEngineeringDisabled,
  setCachedPipes,
} from "../geometry";

function asDiagram(result: { nodes: any[]; pipes: any[]; conditions?: WorkCondition[] }): Diagram {
  return {
    id: "t", name: "t", nodes: result.nodes, pipes: result.pipes,
    settings: { showGrid: true, background: "#fff", globalAnimationPlaying: false, workConditions: result.conditions },
  };
}

function applyCondition(diagram: Diagram, condition: WorkCondition) {
  for (const n of diagram.nodes) {
    const state: any = condition.state[n.id];
    if (!state) continue;
    if (state.pumpOn !== undefined) n.pumpOn = state.pumpOn;
    if (state.valveState !== undefined) n.valveState = state.valveState;
    if (state.valvePath !== undefined) n.valvePath = state.valvePath;
  }
  setCachedPipes(diagram.pipes, diagram.nodes);
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { setCachedPipes([], []); });

describe("模板待机与工程语义", () => {
  it("所有模板待机工况没有一条流动管，泄压管按常闭工程停流", () => {
    for (const template of SMART_TEMPLATES) {
      const result = buildSmartTemplate(template, {});
      const diagram = asDiagram(result);
      const idle = result.conditions?.find((c) => /待机|idle/i.test(c.name)) ?? { name: "Idle", state: {} };
      applyCondition(diagram, idle);
      expect(diagram.pipes.every((p) => pipeEffectiveDisabled(p, diagram.nodes))).toBe(true);
      expect(diagnosisSummary(diagram).errors).toBe(0);
      const relief = diagram.pipes.filter((p) => p.teachingOverride === "stop");
      expect(relief.length).toBeGreaterThan(0);
      expect(relief.every((p) => pipeEngineeringDisabled(p, diagram.nodes))).toBe(true);
    }
  });

  it("奶路出口阀与蒸汽补水阀在待机关闭，热牛奶工况才打开", () => {
    const milk = SMART_TEMPLATES.find((t) => t.id === "milk")!;
    const result = buildSmartTemplate(milk, {});
    const diagram = asDiagram(result);
    const outletPipe = diagram.pipes.find((p) => p.label === "牛奶出口")!;
    const fillPipe = diagram.pipes.find((p) => p.label === "锅炉补水")!;
    applyCondition(diagram, result.conditions!.find((c) => /待机|idle/i.test(c.name))!);
    expect(pipeEffectiveDisabled(outletPipe, diagram.nodes)).toBe(true);
    expect(pipeEffectiveDisabled(fillPipe, diagram.nodes)).toBe(true);
    applyCondition(diagram, result.conditions!.find((c) => c.name === "热牛奶")!);
    expect(pipeEffectiveDisabled(outletPipe, diagram.nodes)).toBe(false);
    expect(pipeEffectiveDisabled(fillPipe, diagram.nodes)).toBe(false);
  });

  it("双锅炉骨架共用一套进水，并带流量计、总阀、排废总阀", () => {
    const dual = SMART_TEMPLATES.find((t) => t.id === "dual-boiler")!;
    const result = buildSmartTemplate(dual, {});
    expect(result.nodes.filter((n) => n.type === "inlet")).toHaveLength(1);
    expect(result.nodes.some((n) => n.type === "flowMeter")).toBe(true);
    expect(result.nodes.some((n) => n.label.includes("进水总阀"))).toBe(true);
    expect(result.nodes.some((n) => n.label.includes("排废总阀"))).toBe(true);
    const issues = engineeringIssues(asDiagram(result));
    expect(issues.filter((i) => i.severity === "error" || i.severity === "warning")).toHaveLength(0);
  });

  it("英文界面下所有模板都能构建，不依赖中文标签查找", () => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = "en";
    try {
      for (const template of SMART_TEMPLATES) {
        expect(() => buildSmartTemplate(template, {})).not.toThrow();
      }
    } finally {
      document.documentElement.lang = previous;
    }
  });

  it("泄压管教学覆盖流动时，只改变显示，不改变工程停流", () => {
    const water = SMART_TEMPLATES.find((t) => t.id === "water")!;
    const result = buildSmartTemplate(water, {});
    const pipe = result.pipes.find((p) => p.teachingOverride === "stop")!;
    pipe.teachingOverride = "flow";
    setCachedPipes(result.pipes, result.nodes);
    expect(pipeEffectiveDisabled(pipe, result.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(pipe, result.nodes)).toBe(true);
  });
});
