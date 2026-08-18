import { describe, it, expect } from "vitest";
import { createSteamSystemDiagram, createMilkFoamDiagram, createCommercialMachineDiagram } from "../sample";
import { insertTemplate, store } from "../store";
import { pipePolyline } from "../geometry";

function assertValidDiagram(diagram: { nodes: any[]; pipes: any[] }) {
  const portSet = new Set<string>();
  for (const n of diagram.nodes) {
    expect(n.id, "节点需有 id").toBeTruthy();
    for (const p of n.ports) {
      expect(p.nodeId, `端口 ${p.id} nodeId 不匹配`).toBe(n.id);
      portSet.add(p.id);
    }
  }
  for (const pipe of diagram.pipes) {
    for (const ref of [pipe.fromPortId, pipe.toPortId]) {
      if (ref) expect(portSet.has(ref), `管路 ${pipe.id} 引用不存在的端口 ${ref}`).toBe(true);
    }
    const pts = pipePolyline(pipe, diagram.nodes);
    expect(pts, `管路 ${pipe.id} 折线无效`).toBeTruthy();
    expect(pts!.length).toBeGreaterThanOrEqual(2);
  }
}

describe("模板库扩展", () => {
  it("蒸汽系统模板结构有效", () => {
    const d = createSteamSystemDiagram();
    expect(d.nodes.length).toBeGreaterThan(5);
    expect(d.pipes.length).toBeGreaterThan(5);
    assertValidDiagram(d);
  });

  it("牛奶发泡系统模板结构有效", () => {
    const d = createMilkFoamDiagram();
    expect(d.nodes.length).toBeGreaterThan(5);
    expect(d.pipes.length).toBeGreaterThan(5);
    assertValidDiagram(d);
  });

  it("蒸汽系统包含蒸汽杆与安全阀", () => {
    const d = createSteamSystemDiagram();
    expect(d.nodes.some((n) => n.type === "steamWand")).toBe(true);
    expect(d.nodes.some((n) => n.type === "safetyValve")).toBe(true);
  });

  it("牛奶发泡系统包含奶沫出口", () => {
    const d = createMilkFoamDiagram();
    expect(d.nodes.some((n) => n.type === "milkOutlet")).toBe(true);
  });
});

// ===== P3: 商用咖啡机整机模板 =====
describe("商用咖啡机整机模板", () => {
  it("结构有效且包含完整双锅炉拓扑", () => {
    const d = createCommercialMachineDiagram();
    expect(d.nodes.length).toBeGreaterThan(15);
    expect(d.pipes.length).toBeGreaterThan(18);
    assertValidDiagram(d);
  });

  it("包含关键设备：热水锅炉/蒸汽锅炉/奶泵/牛奶出口/蒸汽杆/安全阀", () => {
    const d = createCommercialMachineDiagram();
    const labels = d.nodes.map((n) => n.label);
    expect(labels.some((l) => l.includes("热水锅炉"))).toBe(true);
    expect(labels.some((l) => l.includes("蒸汽锅炉"))).toBe(true);
    expect(labels.some((l) => l.includes("奶泵"))).toBe(true);
    expect(labels.some((l) => l.includes("牛奶出口"))).toBe(true);
    expect(labels.some((l) => l.includes("蒸汽杆"))).toBe(true);
    expect(labels.some((l) => l.includes("安全阀"))).toBe(true);
  });

  it("介质链正确：热水锅炉出热水、蒸汽锅炉出蒸汽、牛奶出口热牛奶", () => {
    const d = createCommercialMachineDiagram();
    const portToNode = new Map<string, string>();
    d.nodes.forEach((n) => n.ports.forEach((p) => portToNode.set(p.id, n.label)));
    // 牛奶出口入端 = hotMilk
    const mo = d.nodes.find((n) => n.type === "milkOutlet");
    const moIn = d.pipes.find((p) => mo && mo.ports.some((pp) => pp.id === p.toPortId));
    expect(moIn?.fluidType).toBe("hotMilk");
    // 蒸汽杆入端 = steam
    const sw = d.nodes.find((n) => n.type === "steamWand");
    const swIn = d.pipes.find((p) => sw && sw.ports.some((pp) => pp.id === p.toPortId));
    expect(swIn?.fluidType).toBe("steam");
  });

  it("insertTemplate 能加载商用机整机模板", () => {
    insertTemplate("商用咖啡机整机");
    expect(store.get().diagram.name).toBe("商用咖啡机整机水路");
  });
});
