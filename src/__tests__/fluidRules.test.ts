import { describe, it, expect } from "vitest";
import { checkPipeFluid, checkDiagramFluid } from "../fluidRules";
import type { DiagramNode, Diagram, Pipe, Port, FluidType } from "../types";
import msy2 from "../../MSY2.json";

function port(id: string, position: Port["position"], direction?: Port["direction"]): Port {
  return { id, nodeId: "", position, direction };
}

function node(type: DiagramNode["type"], id: string, ports: Port[], label = type): DiagramNode {
  return { id, type, label, x: 0, y: 0, width: 100, height: 100, rotation: 0, fill: "#fff", stroke: "#000", ports: ports.map((p) => ({ ...p, nodeId: id })) };
}

function pipe(ft: FluidType, from?: string, to?: string): Pipe {
  return {
    id: "pipe", label: "管", fromPortId: from, toPortId: to, points: [],
    nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6",
    fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium",
    animated: true, showArrow: true, fluidType: ft, material: "custom", wallOpacity: 1,
    routing: "orthogonal", cornerRadius: 0,
  };
}

describe("液路介质物理常识规则", () => {
  it("热水锅炉进水不允许蒸汽/牛奶/热水（只允许冷水）", () => {
    const boiler = node("hotWaterBoiler", "hb", [port("hb_b", "bottom", "in")]);
    for (const bad of ["steam", "milk", "hotWater"] as FluidType[]) {
      const issues = checkPipeFluid(pipe(bad, undefined, "hb_b"), [boiler]);
      expect(issues.length, `${bad} 应报冲突`).toBeGreaterThan(0);
    }
    expect(checkPipeFluid(pipe("coldWater", undefined, "hb_b"), [boiler])).toHaveLength(0);
  });

  it("热水锅炉出水必须是热水", () => {
    const boiler = node("hotWaterBoiler", "hb", [port("hb_t", "top", "out")]);
    expect(checkPipeFluid(pipe("milk", "hb_t", undefined), [boiler]).length).toBeGreaterThan(0);
    expect(checkPipeFluid(pipe("hotWater", "hb_t", undefined), [boiler])).toHaveLength(0);
  });

  it("蒸汽锅炉出水必须是蒸汽", () => {
    const boiler = node("steamBoiler", "sb", [port("sb_t", "top", "out")]);
    expect(checkPipeFluid(pipe("hotWater", "sb_t", undefined), [boiler]).length).toBeGreaterThan(0);
    expect(checkPipeFluid(pipe("steam", "sb_t", undefined), [boiler])).toHaveLength(0);
  });

  it("蒸汽锅炉进水允许冷水/热水，不允许牛奶", () => {
    const boiler = node("steamBoiler", "sb", [port("sb_i", "top", "in")]);
    expect(checkPipeFluid(pipe("milk", undefined, "sb_i"), [boiler]).length).toBeGreaterThan(0);
    expect(checkPipeFluid(pipe("coldWater", undefined, "sb_i"), [boiler])).toHaveLength(0);
    expect(checkPipeFluid(pipe("hotWater", undefined, "sb_i"), [boiler])).toHaveLength(0);
  });

  it("水泵只走水、奶泵只走奶", () => {
    const pump = node("pump", "p", [port("p_l", "left", "in"), port("p_r", "right", "out")]);
    expect(checkPipeFluid(pipe("milk", "p_r", undefined), [pump]).length).toBeGreaterThan(0);
    expect(checkPipeFluid(pipe("coldWater", "p_r", undefined), [pump])).toHaveLength(0);

    const milkPump = node("milkPump", "mp", [port("mp_l", "left", "out"), port("mp_r", "right", "in")]);
    expect(checkPipeFluid(pipe("coldWater", undefined, "mp_r"), [milkPump]).length).toBeGreaterThan(0);
    expect(checkPipeFluid(pipe("milk", undefined, "mp_r"), [milkPump])).toHaveLength(0);
  });

  it("出口类设备介质约束", () => {
    const cases: Array<[DiagramNode["type"], FluidType, FluidType]> = [
      ["coffeeOutlet", "coffee", "milk"],
      ["steamWand", "steam", "hotWater"],
      ["hotWaterWand", "hotWater", "steam"],
      ["hotWaterOutlet", "hotWater", "coffee"],
    ];
    for (const [type, ok, bad] of cases) {
      const n = node(type, "n", [port("n_i", "top", "in")]);
      expect(checkPipeFluid(pipe(bad, undefined, "n_i"), [n]).length, `${type} 拒绝 ${bad}`).toBeGreaterThan(0);
      expect(checkPipeFluid(pipe(ok, undefined, "n_i"), [n]), `${type} 允许 ${ok}`).toHaveLength(0);
    }
    // 奶出口允许奶类
    const milkOut = node("milkOutlet", "mo", [port("mo_i", "top", "in")]);
    expect(checkPipeFluid(pipe("coffee", undefined, "mo_i"), [milkOut]).length).toBeGreaterThan(0);
    expect(checkPipeFluid(pipe("hotMilk", undefined, "mo_i"), [milkOut])).toHaveLength(0);
  });

  it("直通元件（阀/三通/接头/过滤器）不做介质约束（不误报）", () => {
    const tee = node("tee", "t", [port("t_l", "left"), port("t_r", "right")]);
    expect(checkPipeFluid(pipe("milk", "t_l", undefined), [tee])).toHaveLength(0);
    expect(checkPipeFluid(pipe("steam", undefined, "t_r"), [tee])).toHaveLength(0);
  });

  it("正确示例 MSY2.json 不应产生介质冲突", () => {
    const issues = checkDiagramFluid(msy2 as unknown as Diagram);
    const flat = [...issues.values()].flat();
    // 打印便于排查
    if (flat.length) console.log("MSY2 冲突:", flat.map((i) => i.message));
    expect(flat.length).toBe(0);
  });
});
