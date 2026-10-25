import { describe, it, expect } from "vitest";
import { SMART_TEMPLATES, buildSmartTemplate } from "../smart-draw/templates";
import { engineeringIssues, engineeringSummary } from "../smart-draw/engineering";
import { SMART_BLOCKS } from "../smart-draw/blocks";
import type { Diagram } from "../types";

function asDiagram(result: ReturnType<typeof buildSmartTemplate>): Diagram {
  return {
    id: "t", name: "t", nodes: result.nodes, pipes: result.pipes,
    settings: { showGrid: true, background: "#fff", globalAnimationPlaying: false, workConditions: result.conditions },
  };
}

describe("智能绘图工程检查", () => {
  it("五个模板默认是待机状态，并带推荐工况", () => {
    for (const template of SMART_TEMPLATES) {
      const result = buildSmartTemplate(template, {});
      const pumps = result.nodes.filter((n) => n.type === "pump" || n.type === "milkPump" || n.type === "airPump");
      expect(pumps.every((p) => p.pumpOn === false)).toBe(true);
      const valves = result.nodes.filter((n) => n.type === "solenoid2" || n.type === "solenoid3");
      expect(valves.every((v) => v.type === "solenoid3" ? v.valvePath === "off" : v.valveState === "closed")).toBe(true);
      expect(result.conditions?.some((c) => /待机|idle/i.test(c.name))).toBe(true);
      expect(engineeringIssues(asDiagram(result))).toEqual([]);
    }
  });

  it("蒸汽锅炉缺安全阀会报 error", () => {
    const steam = buildSmartTemplate(SMART_TEMPLATES.find((t) => t.id === "steam")!, {});
    const safety = steam.nodes.find((n) => n.type === "safetyValve")!;
    const portIds = new Set(safety.ports.map((p) => p.id));
    const result = {
      nodes: steam.nodes.filter((n) => n.id !== safety.id),
      pipes: steam.pipes.filter((p) => !portIds.has(p.fromPortId!) && !portIds.has(p.toPortId!)),
      conditions: steam.conditions,
    };
    const issues = engineeringIssues(asDiagram(result));
    expect(issues.some((i) => i.severity === "error" && i.titleZh.includes("安全阀"))).toBe(true);
  });

  it("功能块默认也是待机状态", () => {
    for (const block of SMART_BLOCKS) {
      const result = block.build();
      expect(result.nodes.filter((n) => n.type === "solenoid2").every((n) => n.valveState === "closed")).toBe(true);
      expect(result.nodes.filter((n) => n.type === "milkPump").every((n) => n.pumpOn === false)).toBe(true);
    }
  });

  it("模板工程检查为 0 项", () => {
    for (const template of SMART_TEMPLATES) {
      const result = buildSmartTemplate(template, {});
      expect(engineeringSummary(asDiagram(result)).errors + engineeringSummary(asDiagram(result)).warnings).toBe(0);
    }
  });
});
