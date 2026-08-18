import { describe, it, expect } from "vitest";
import { KNOWLEDGE, knowledgeOf } from "../knowledge";
import { diagnoseDiagram } from "../diagnostics";
import { checkDiagramFluid } from "../fluidRules";
import { createSemiAutoMachineDiagram, createFullAutoMachineDiagram } from "../sample";
import { pipePolyline } from "../geometry";
import type { Diagram } from "../types";

function baseDiagram(nodes: any[], pipes: any[]): Diagram {
  return { id: "t", name: "t", nodes, pipes, settings: { showGrid: true, background: "#fff", globalAnimationPlaying: false, crossoverHops: true, layers: [{ id: "l", name: "默认层", visible: true }] } };
}

describe("设备教学知识库", () => {
  it("关键咖啡机设备都有教学说明", () => {
    for (const t of ["hotWaterBoiler", "steamBoiler", "pump", "milkPump", "opv", "groupHead", "coffeeOutlet", "steamWand", "flowMeter", "solenoid3"]) {
      expect(knowledgeOf(t), `${t} 缺少知识说明`).toBeTruthy();
    }
  });

  it("知识库覆盖全部元件类型", () => {
    // 抽样检查覆盖度：至少 20 个元件有说明
    expect(Object.keys(KNOWLEDGE).length).toBeGreaterThan(20);
  });
});

describe("回路诊断", () => {
  it("检测孤立元件", () => {
    const d = baseDiagram(
      [{ id: "n", type: "pump", label: "泵", x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "p", nodeId: "n", position: "right" }] }],
      []
    );
    const diags = diagnoseDiagram(d);
    expect(diags.some((x) => x.kind === "isolated")).toBe(true);
  });

  it("检测端口多连", () => {
    const d = baseDiagram(
      [
        { id: "a", type: "tank", label: "罐A", x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "pa", nodeId: "a", position: "right" }] },
        { id: "b", type: "tank", label: "罐B", x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "pb", nodeId: "b", position: "left" }] },
        { id: "c", type: "tank", label: "罐C", x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "pc", nodeId: "c", position: "left" }] },
      ],
      [
        { id: "p1", label: "管1", fromPortId: "pa", toPortId: "pb", points: [], fluidType: "coldWater", fluidColor: "#2f7fd6", nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, material: "custom", wallOpacity: 1 },
        { id: "p2", label: "管2", fromPortId: "pa", toPortId: "pc", points: [], fluidType: "coldWater", fluidColor: "#2f7fd6", nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, material: "custom", wallOpacity: 1 },
      ]
    );
    const diags = diagnoseDiagram(d);
    expect(diags.some((x) => x.kind === "port-conflict")).toBe(true);
  });
});

describe("实战咖啡机模板", () => {
  it("半自动模板结构有效且无介质冲突", () => {
    const d = createSemiAutoMachineDiagram();
    expect(d.nodes.length).toBeGreaterThan(10);
    for (const p of d.pipes) {
      expect(pipePolyline(p, d.nodes), `管路 ${p.id} 折线无效`).toBeTruthy();
    }
    expect(checkDiagramFluid(d).size).toBe(0);
  });

  it("全自动模板结构有效且无介质冲突", () => {
    const d = createFullAutoMachineDiagram();
    expect(d.nodes.length).toBeGreaterThan(12);
    for (const p of d.pipes) {
      expect(pipePolyline(p, d.nodes), `管路 ${p.id} 折线无效`).toBeTruthy();
    }
    expect(checkDiagramFluid(d).size).toBe(0);
  });

  it("模板包含新增的 OPV 与冲煮头元件", () => {
    const semi = createSemiAutoMachineDiagram();
    expect(semi.nodes.some((n) => n.type === "opv")).toBe(true);
    expect(semi.nodes.some((n) => n.type === "groupHead")).toBe(true);
  });
});
