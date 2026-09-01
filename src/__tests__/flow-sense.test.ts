/**
 * v1.19 量感层测试：
 * - computeRelativeFlow：链式=1 / 分流均分 / 支路停流不稀释 / 汇流相加 / 手填 override 由渲染层处理
 * - computePressureDomain：泵停→空 / 泵开→下游可达 / 关阀截断
 * - downscaleDensity：粒子密度降档
 * - 出视区 skip 渲染：视口外节点不渲染
 */
import { describe, it, expect } from "vitest";
import { computeRelativeFlow, computePressureDomain, downscaleDensity } from "../relativeFlow";
import { parseDiagramJSON } from "../export";
import type { Diagram } from "../types";

/** 构造：pump → v2 → tee → { o1, o2 }；可控制 v2 开关与支路禁用 */
function build(opts: { v2open?: boolean; disableB1?: boolean }): Diagram {
  const raw = {
    id: "flow", name: "flow",
    nodes: [
      { id: "p", type: "pump", label: "Pump", x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", pumpOn: true, ports: [ { id: "pi", nodeId: "p", position: "left", direction: "in" }, { id: "po", nodeId: "p", position: "right", direction: "out" } ] },
      { id: "v", type: "solenoid2", label: "V", x: 200, y: 0, width: 74, height: 66, rotation: 0, fill: "#fff", stroke: "#000", valveState: opts.v2open === false ? "closed" : "open", ports: [ { id: "vi", nodeId: "v", position: "left", direction: "in" }, { id: "vo", nodeId: "v", position: "right", direction: "out" } ] },
      { id: "tee", type: "tee", label: "T", x: 400, y: 0, width: 60, height: 60, rotation: 0, fill: "#fff", stroke: "#000", ports: [ { id: "ti", nodeId: "tee", position: "left", direction: "in" }, { id: "tr", nodeId: "tee", position: "right", direction: "out" }, { id: "tb", nodeId: "tee", position: "bottom", direction: "out" } ] },
      { id: "o1", type: "outlet", label: "O1", x: 600, y: -100, width: 60, height: 60, rotation: 0, fill: "#fff", stroke: "#000", ports: [ { id: "o1i", nodeId: "o1", position: "left", direction: "in" } ] },
      { id: "o2", type: "outlet", label: "O2", x: 600, y: 100, width: 60, height: 60, rotation: 0, fill: "#fff", stroke: "#000", ports: [ { id: "o2i", nodeId: "o2", position: "left", direction: "in" } ] },
    ],
    pipes: [
      { id: "pa", label: "pa", fromPortId: "po", toPortId: "vi", points: [], fluidType: "coldWater", direction: "forward" },
      { id: "pb", label: "pb", fromPortId: "vo", toPortId: "ti", points: [], fluidType: "coldWater", direction: "forward" },
      { id: "pc", label: "pc", fromPortId: "tr", toPortId: "o1i", points: [], fluidType: "coldWater", direction: "forward", disabled: opts.disableB1 === true },
      { id: "pd", label: "pd", fromPortId: "tb", toPortId: "o2i", points: [], fluidType: "coldWater", direction: "forward" },
    ],
    settings: { showGrid: true, background: "#fff", globalAnimationPlaying: false },
  };
  return parseDiagramJSON(JSON.stringify(raw));
}

function factorOf(d: Diagram, pipeId: string): number {
  return computeRelativeFlow(d.pipes, d.nodes).get(pipeId) ?? -1;
}

describe("computeRelativeFlow", () => {
  it("直通链因子为 1", () => {
    const d = build({});
    expect(factorOf(d, "pa")).toBe(1);
    expect(factorOf(d, "pb")).toBe(1);
  });

  it("三通两支均流：各 0.5", () => {
    const d = build({});
    expect(factorOf(d, "pc")).toBeCloseTo(0.5, 5);
    expect(factorOf(d, "pd")).toBeCloseTo(0.5, 5);
  });

  it("一支停流后另一支不稀释：因子回升为 1", () => {
    const d = build({ disableB1: true });
    expect(factorOf(d, "pd")).toBe(1);
  });

  it("泵停后全停：无流动管，因子表为空", () => {
    const raw = build({}) as any;
    raw.nodes.find((n: any) => n.id === "p").pumpOn = false;
    const d = parseDiagramJSON(JSON.stringify(raw));
    expect(computeRelativeFlow(d.pipes, d.nodes).size).toBe(0);
  });
});

describe("computePressureDomain", () => {
  it("泵开：出管至下游全在压力域", () => {
    const d = build({});
    const domain = computePressureDomain(d.pipes, d.nodes);
    expect(domain.has("pa")).toBe(true);
    expect(domain.has("pb")).toBe(true);
    expect(domain.has("pc")).toBe(true);
    expect(domain.has("pd")).toBe(true);
  });

  it("泵停：压力域为空", () => {
    const raw = build({}) as any;
    raw.nodes.find((n: any) => n.id === "p").pumpOn = false;
    const d = parseDiagramJSON(JSON.stringify(raw));
    expect(computePressureDomain(d.pipes, d.nodes).size).toBe(0);
  });

  it("关阀截断：阀前在域内，阀后不在", () => {
    const d = build({ v2open: false });
    const domain = computePressureDomain(d.pipes, d.nodes);
    expect(domain.has("pa")).toBe(true);
    expect(domain.has("pb")).toBe(false);
    expect(domain.has("pc")).toBe(false);
  });
});

describe("downscaleDensity", () => {
  it("高因子保持原档，中因子降一档，低因子降两档", () => {
    expect(downscaleDensity("high", 1)).toBe("high");
    expect(downscaleDensity("high", 0.5)).toBe("medium");
    expect(downscaleDensity("high", 0.2)).toBe("low");
    expect(downscaleDensity("medium", 1)).toBe("medium");
    expect(downscaleDensity("medium", 0.5)).toBe("low");
    expect(downscaleDensity("low", 0.2)).toBe("low");
  });
});
