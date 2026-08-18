import { describe, it, expect } from "vitest";
import { buildBom } from "../bom";
import { GUIDE } from "../guide";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import { createSemiAutoMachineDiagram, createFullAutoMachineDiagram } from "../sample";
import { diagnoseDiagram } from "../diagnostics";

describe("BOM 清单", () => {
  it("生成包含项目名与元件分组", () => {
    const d = createSemiAutoMachineDiagram();
    const text = buildBom(d);
    expect(text).toContain("元件清单");
    expect(text).toContain(d.name);
    expect(text).toContain("冲泡锅炉");
  });
});

describe("故障模拟（教学）", () => {
  it("泵卡死使下游管路停流", () => {
    const nodes = [
      { id: "p", type: "pump", label: "泵", pumpOn: true, fault: "pumpStuck", x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "p_r", nodeId: "p", position: "right", direction: "out" }] },
      { id: "t", type: "tank", label: "罐", x: 200, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "t_l", nodeId: "t", position: "left", direction: "in" }] },
    ] as any;
    const pipe = { id: "pipe1", label: "管", fromPortId: "p_r", toPortId: "t_l", points: [], fluidType: "coldWater", fluidColor: "#2f7fd6", nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, material: "custom", wallOpacity: 1 } as any;
    setCachedPipes([pipe], nodes);
    expect(pipeEffectiveDisabled(pipe, nodes)).toBe(true);
  });

  it("管路堵塞使该管路停流", () => {
    const nodes = [
      { id: "a", type: "tank", label: "罐A", x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "pa", nodeId: "a", position: "right", direction: "out" }] },
      { id: "b", type: "tank", label: "罐B", x: 200, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "pb", nodeId: "b", position: "left", direction: "in" }] },
    ] as any;
    const pipe = { id: "pipe1", label: "管", fromPortId: "pa", toPortId: "pb", fault: "pipeBlocked", points: [], fluidType: "coldWater", fluidColor: "#2f7fd6", nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, material: "custom", wallOpacity: 1 } as any;
    setCachedPipes([pipe], nodes);
    expect(pipeEffectiveDisabled(pipe, nodes)).toBe(true);
  });

  it("诊断报告能识别故障状态", () => {
    const d = createFullAutoMachineDiagram();
    // 注入一个故障
    d.nodes.find((n) => n.type === "pump")!.fault = "pumpStuck";
    const diags = diagnoseDiagram(d);
    expect(diags.some((x) => x.kind === "fault")).toBe(true);
  });
});

describe("使用指南", () => {
  it("包含 8 个以上章节", () => {
    expect(GUIDE.length).toBeGreaterThanOrEqual(8);
  });
  it("每个章节都有标题与内容", () => {
    for (const s of GUIDE) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.blocks.length).toBeGreaterThan(0);
    }
  });
});
