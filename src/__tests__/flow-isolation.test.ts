import { describe, it, expect } from "vitest";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import { parseDiagramJSON } from "../export";
import type { Diagram, Pipe } from "../types";
import bctmsRaw from "../../BCTMS.json";

/**
 * 回归 harness：全自动咖啡机（BCTMS，双泵多流源拓扑）
 * 背景：奶泵与水泵是两个独立流源，奶路在「润湿/冲洗三通」处与冷水网耦合。
 * 缺陷复现：关闭奶泵后，停流传播穿过运行中的水泵与单向阀，淹没全图（69/70 停流）。
 * 期望：奶泵只影响奶路；水泵供液的主水路不受影响。
 */

function load(): Diagram {
  return parseDiagramJSON(JSON.stringify(bctmsRaw));
}

function disabledSet(d: Diagram): Set<string> {
  setCachedPipes(d.pipes, d.nodes);
  const s = new Set<string>();
  for (const p of d.pipes) {
    if (pipeEffectiveDisabled(p, d.nodes)) s.add(p.id);
  }
  return s;
}

function findPump(d: Diagram, type: "pump" | "milkPump") {
  const n = d.nodes.find((x) => x.type === type);
  expect(n, `需要找到 ${type}`).toBeTruthy();
  return n!;
}

/** 与指定节点的 out 端口相连的管路（泵的出管） */
function outPipeOf(d: Diagram, nodeId: string): Pipe {
  const node = d.nodes.find((n) => n.id === nodeId)!;
  const outPort = node.ports.find((p) => p.direction === "out");
  const pipe = d.pipes.find((p) => p.fromPortId === outPort?.id || p.toPortId === outPort?.id);
  expect(pipe, "泵出管应存在").toBeTruthy();
  return pipe!;
}

function inPipeOf(d: Diagram, nodeId: string): Pipe {
  const node = d.nodes.find((n) => n.id === nodeId)!;
  const inPort = node.ports.find((p) => p.direction === "in");
  const pipe = d.pipes.find((p) => p.fromPortId === inPort?.id || p.toPortId === inPort?.id);
  expect(pipe, "泵入管应存在").toBeTruthy();
  return pipe!;
}

describe("BCTMS 双泵拓扑：停流不得跨流源污染", () => {
  it("基线（两泵运行）：水泵主水路流动，不至于全图停流", () => {
    const d = load();
    const dis = disabledSet(d);
    const waterPump = findPump(d, "pump");
    // 水泵出管必须流动
    expect(dis.has(outPipeOf(d, waterPump.id).id)).toBe(false);
    // 基线停流包含关闭阀门/非激活支路/递归兜底（约 43 条，既有行为）；不应全图停流
    expect(dis.size).toBeGreaterThan(0);
    expect(dis.size).toBeLessThan(d.pipes.length);
  });

  it("关闭奶泵：奶泵自身管路停流", () => {
    const d = load();
    const milkPump = findPump(d, "milkPump");
    milkPump.pumpOn = false;
    const dis = disabledSet(d);
    expect(dis.has(outPipeOf(d, milkPump.id).id)).toBe(true);
    expect(dis.has(inPipeOf(d, milkPump.id).id)).toBe(true);
  });

  it("关闭奶泵：水泵主水路不受污染（核心回归）", () => {
    const d = load();
    const milkPump = findPump(d, "milkPump");
    const waterPump = findPump(d, "pump");
    const baseline = disabledSet(d);

    milkPump.pumpOn = false;
    const dis = disabledSet(d);

    // 水泵出管、水泵入管（水源进水管）保持流动
    expect(dis.has(outPipeOf(d, waterPump.id).id)).toBe(false);
    expect(dis.has(inPipeOf(d, waterPump.id).id)).toBe(false);

    // 热水锅炉出水管保持流动
    const hb = d.nodes.find((n) => n.type === "hotWaterBoiler")!;
    const hbOutPort = hb.ports.find((p) => p.direction === "out")!;
    const hbOut = d.pipes.find((p) => p.fromPortId === hbOutPort.id)!;
    expect(dis.has(hbOut.id)).toBe(false);

    // 停流总数不得爆炸：只允许比基线多出奶路本身的少量管路
    expect(dis.size).toBeLessThanOrEqual(baseline.size + 12);
  });

  it("关闭水泵：其供水链停流（既有教学语义保留）", () => {
    const d = load();
    const waterPump = findPump(d, "pump");
    waterPump.pumpOn = false;
    const dis = disabledSet(d);
    // 水泵自身管路停流
    expect(dis.has(outPipeOf(d, waterPump.id).id)).toBe(true);
    expect(dis.has(inPipeOf(d, waterPump.id).id)).toBe(true);
  });

  it("奶泵运行 + 排废阀 A 路：整条奶路贯通到牛奶出口", () => {
    const d = load();
    const drainValve = d.nodes.find((n) => n.label === "牛奶排废三通电磁阀");
    expect(drainValve, "需要牛奶排废三通电磁阀").toBeTruthy();
    drainValve!.valvePath = "A";
    const dis = disabledSet(d);
    // 奶泵自身吸入/送出管必须流动（泵在运行）
    const milkPump = findPump(d, "milkPump");
    expect(dis.has(inPipeOf(d, milkPump.id).id)).toBe(false);
    expect(dis.has(outPipeOf(d, milkPump.id).id)).toBe(false);
    // 牛奶出口入口管必须流动
    const outlet = d.nodes.find((n) => n.type === "milkOutlet")!;
    const outletPipe = d.pipes.find((p) => p.toPortId && outlet.ports.some((pp) => pp.id === p.toPortId));
    expect(outletPipe, "牛奶出口应有入口管").toBeTruthy();
    expect(dis.has(outletPipe!.id)).toBe(false);
  });
});

describe("BCTMS 咖啡排废路：A 出口 / B 排废工况", () => {
  const COFFEE_DRAIN_VALVE = "n_ms7ksq2xg2m96s"; // 咖啡排废三通电磁阀
  const MILK_DRAIN_VALVE = "n_ms91h2kcr16ehn"; // 牛奶排废三通电磁阀
  const STEAM_DRAIN_VALVE = "n_ms7kxxr4x9iyye"; // 锅炉蒸汽排废两通电磁阀
  const PIPE_68 = "pipe_msch36sc8rm0"; // 冲泡缸 → 三通接头
  const PIPE_70 = "pipe_mscoi58j11wqs"; // 三通接头 → 咖啡排废阀
  const PIPE_59_COFFEE = "pipe_msbwrcxqa3ud"; // 咖啡排废阀 A → 咖啡出口
  const PIPE_58_COFFEE = "pipe_msby7uaue4i4ah"; // 咖啡排废阀 B → 排废汇合三通
  const PIPE_57 = "pipe_msby7l3tbtk5oe"; // 牛奶排废阀 B → 排废汇合三通
  const PIPE_60 = "pipe_msbyapo7oyci5z"; // 排废汇合三通 → 蒸汽排废三通（排废总管）
  const PIPE_49 = "pipe_msbxivgapekq"; // 蒸汽排废三通 → 锅炉蒸汽排废阀
  const PIPE_51 = "pipe_msbxk5rgvii5"; // 锅炉蒸汽排废阀 → 排废接口

  it("A 路工况：冲泡缸 → 咖啡排废阀 → 咖啡出口贯通，B 支路隔离停流", () => {
    const d = load();
    const v = d.nodes.find((n) => n.id === COFFEE_DRAIN_VALVE)!;
    v.valvePath = "A";
    const dis = disabledSet(d);
    expect(dis.has(PIPE_68)).toBe(false);
    expect(dis.has(PIPE_70)).toBe(false);
    expect(dis.has(PIPE_59_COFFEE)).toBe(false);
    expect(dis.has(PIPE_58_COFFEE)).toBe(true); // 非激活 B 支路隔离
  });

  it("排废工况：咖啡/牛奶排废阀切 B + 蒸汽排废阀打开，整条排废链流动，A 出口隔离", () => {
    const d = load();
    const set = (id: string, patch: Record<string, unknown>) =>
      Object.assign(d.nodes.find((n) => n.id === id)!, patch);
    set(COFFEE_DRAIN_VALVE, { valvePath: "B" });
    set(MILK_DRAIN_VALVE, { valvePath: "B" });
    set(STEAM_DRAIN_VALVE, { valveState: "open" });
    const dis = disabledSet(d);
    // 咖啡/牛奶排废支路 → 汇合三通 → 排废总管 → 蒸汽排废阀 → 排废接口 全部流动
    expect(dis.has(PIPE_58_COFFEE)).toBe(false);
    expect(dis.has(PIPE_57)).toBe(false);
    expect(dis.has(PIPE_60)).toBe(false);
    expect(dis.has(PIPE_49)).toBe(false);
    expect(dis.has(PIPE_51)).toBe(false);
    // A 路（咖啡出口）必须隔离停流，不再被 forceFlow 掩盖
    expect(dis.has(PIPE_59_COFFEE)).toBe(true);
  });
});

describe("direction=reverse 反向管：递归层须尊重有效流向", () => {
  it("反向管流入三通算入侧供液：出侧管不得被其余停流入侧管误判停流", () => {
    // 拓扑：T(储液罐) --A--> J1 --B(reverse)--> J2 --OUT--> 出口；V(关闭) --C--> J2（停流入侧管）
    // B 的存储方向与流向相反（from/to 对调 + direction=reverse），有效流向 J1 → J2。
    // 修复前：递归层把 B 漏算出 J2 的入侧 → J2 唯一入侧 C 停流 → OUT 被误判停流。
    const raw = {
      nodes: [
        { id: "T", type: "tank", label: "储液罐", x: 0, y: 0, w: 60, h: 60, ports: [{ id: "T1", position: "right", direction: "out" }] },
        { id: "J1", type: "tee", label: "三通接头一", x: 120, y: 0, w: 20, h: 20, ports: [{ id: "J1L", position: "left", direction: "bidirectional" }, { id: "J1R", position: "right", direction: "bidirectional" }] },
        { id: "J2", type: "tee", label: "三通接头二", x: 240, y: 0, w: 20, h: 20, ports: [{ id: "J2L", position: "left", direction: "bidirectional" }, { id: "J2B", position: "bottom", direction: "bidirectional" }, { id: "J2R", position: "right", direction: "bidirectional" }] },
        { id: "V", type: "solenoid2", label: "两通电磁阀", x: 240, y: 120, w: 30, h: 30, valveState: "closed", ports: [{ id: "VIn", position: "left", direction: "in" }, { id: "VOut", position: "right", direction: "out" }] },
        { id: "O", type: "outlet", label: "出口排废", x: 360, y: 0, w: 30, h: 30, ports: [{ id: "O1", position: "left", direction: "in" }] },
      ],
      pipes: [
        { id: "A", label: "管路 A", fluidType: "coldWater", fromPortId: "T1", toPortId: "J1L" },
        { id: "B", label: "管路 B（反向存储）", fluidType: "coldWater", fromPortId: "J2L", toPortId: "J1R", direction: "reverse" },
        { id: "C", label: "管路 C", fluidType: "wasteLiquid", fromPortId: "VOut", toPortId: "J2B" },
        { id: "OUT", label: "出流管", fluidType: "wasteLiquid", fromPortId: "J2R", toPortId: "O1" },
      ],
    };
    const d = parseDiagramJSON(JSON.stringify(raw));
    const dis = disabledSet(d);
    expect(dis.has("A")).toBe(false); // 罐 → 三通 流动
    expect(dis.has("B")).toBe(false); // 反向管流动
    expect(dis.has("C")).toBe(true); // 关闭阀出侧停流
    expect(dis.has("OUT")).toBe(false); // J2 仍有流动入侧（B）→ 出流不得判停
  });
});

describe("需求域：供液到达但下游全关的死路不得显示流动", () => {
  function deadEndDiagram(v2State: "open" | "closed") {
    const raw = {
      nodes: [
        { id: "IN", type: "inlet", label: "进水口", x: 0, y: 0, w: 40, h: 40, ports: [{ id: "IN1", position: "right", direction: "out" }] },
        { id: "P", type: "pump", label: "水泵", x: 80, y: 0, w: 40, h: 40, ports: [{ id: "P1", position: "left", direction: "in" }, { id: "P2", position: "right", direction: "out" }] },
        { id: "J", type: "tee", label: "三通接头", x: 160, y: 0, w: 20, h: 20, ports: [{ id: "JL", position: "left", direction: "bidirectional" }, { id: "JR", position: "right", direction: "bidirectional" }, { id: "JB", position: "bottom", direction: "bidirectional" }] },
        { id: "V1", type: "solenoid2", label: "两通电磁阀A", x: 240, y: 0, w: 30, h: 30, valveState: "open", ports: [{ id: "V1L", position: "left", direction: "in" }, { id: "V1R", position: "right", direction: "out" }] },
        { id: "V2", type: "solenoid2", label: "两通电磁阀B", x: 240, y: 80, w: 30, h: 30, valveState: v2State, ports: [{ id: "V2L", position: "left", direction: "in" }, { id: "V2R", position: "right", direction: "out" }] },
        { id: "O1", type: "outlet", label: "出口一", x: 320, y: 0, w: 30, h: 30, ports: [{ id: "O1a", position: "left", direction: "in" }] },
        { id: "O2", type: "outlet", label: "出口二", x: 320, y: 80, w: 30, h: 30, ports: [{ id: "O2a", position: "left", direction: "in" }] },
      ],
      pipes: [
        { id: "a", label: "管路 1", fluidType: "coldWater", fromPortId: "IN1", toPortId: "P1" },
        { id: "b", label: "管路 2", fluidType: "coldWater", fromPortId: "P2", toPortId: "JL" },
        { id: "c", label: "管路 3", fluidType: "coldWater", fromPortId: "JR", toPortId: "V1L" },
        { id: "d", label: "管路 4", fluidType: "coldWater", fromPortId: "V1R", toPortId: "O1a" },
        { id: "e", label: "管路 5", fluidType: "coldWater", fromPortId: "JB", toPortId: "V2L" },
        { id: "f", label: "管路 6", fluidType: "coldWater", fromPortId: "V2R", toPortId: "O2a" },
      ],
    };
    return parseDiagramJSON(JSON.stringify(raw));
  }
  it("终端阀全关：供液到达的死路支管停流，开放支路不受影响", () => {
    const dis = disabledSet(deadEndDiagram("closed"));
    expect(dis.has("a")).toBe(false); // 水源 → 泵
    expect(dis.has("b")).toBe(false); // 泵 → 三通（仍供开放支路）
    expect(dis.has("c")).toBe(false); // 三通 → 开阀
    expect(dis.has("d")).toBe(false); // 开阀 → 出口
    expect(dis.has("e")).toBe(true); // 三通 → 闭阀：死路，不得流动
    expect(dis.has("f")).toBe(true); // 闭阀 → 出口
  });
  it("终端阀打开：支路恢复流动", () => {
    const dis = disabledSet(deadEndDiagram("open"));
    expect(dis.has("e")).toBe(false);
    expect(dis.has("f")).toBe(false);
  });
});
