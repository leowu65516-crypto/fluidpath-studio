import { describe, it, expect } from "vitest";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import { loadDiagram, patchPipe, store, syncFluidThroughChain } from "../store";
import type { DiagramNode, Pipe, Port } from "../types";

// ===== Helpers =====

function makePort(overrides: Partial<Port> = {}): Port {
  return { id: "p1", nodeId: "n1", position: "right", offset: 0.5, ...overrides };
}

function makeNode(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: "n1",
    type: "tank",
    label: "Test",
    x: 100, y: 200,
    width: 100, height: 80,
    rotation: 0,
    fill: "#fff",
    stroke: "#000",
    ports: [],
    ...overrides,
  };
}

function makePipe(id: string, from: string, to: string): Pipe {
  return {
    id,
    label: "pipe",
    fromPortId: from,
    toPortId: to,
    fromPoint: undefined,
    toPoint: undefined,
    points: [],
    nominalDiameter: "DN25",
    visualDiameter: 10,
    wallColor: "#5b6b7d",
    fluidColor: "#2f7fd6",
    fluidOpacity: 0.92,
    direction: "forward",
    flowSpeed: 1.2,
    particleDensity: "medium",
    animated: true,
    showArrow: true,
    fluidType: "coldWater",
    material: "custom",
    wallOpacity: 1,
    routing: "orthogonal",
    cornerRadius: 0,
  };
}

function solenoid2(id: string, valveState: "open" | "closed"): DiagramNode {
  return makeNode({
    id,
    type: "solenoid2",
    valveState,
    ports: [
      makePort({ id: `${id}_l`, nodeId: id, position: "left", direction: "in" }),
      makePort({ id: `${id}_r`, nodeId: id, position: "right", direction: "out" }),
    ],
  });
}

function boiler(id: string): DiagramNode {
  return makeNode({
    id,
    type: "hotWaterBoiler",
    ports: [
      makePort({ id: `${id}_b`, nodeId: id, position: "bottom", direction: "in" }),
      makePort({ id: `${id}_t`, nodeId: id, position: "top", direction: "out" }),
    ],
  });
}

describe("流体传播：锅炉进水阀关闭 → 下游停流（即使出口阀打开）", () => {
  it("进水阀关闭时，锅炉出水管与出口阀下游管路全部停流", () => {
    const nodes = [
      solenoid2("inletValve", "closed"),
      boiler("boiler"),
      solenoid2("outletValve", "open"),
      makeNode({ id: "tank", type: "tank", ports: [makePort({ id: "tank_l", nodeId: "tank", position: "left" })] }),
    ];
    const pipes = [
      makePipe("pipe_in", "inletValve_r", "boiler_b"),      // 进水阀 → 锅炉
      makePipe("pipe_out", "boiler_t", "outletValve_l"),    // 锅炉 → 出水阀
      makePipe("pipe_down", "outletValve_r", "tank_l"),     // 出水阀 → 下游
    ];
    setCachedPipes(pipes);

    expect(pipeEffectiveDisabled(pipes[0], nodes)).toBe(true);   // 进水管：阀门关闭
    expect(pipeEffectiveDisabled(pipes[1], nodes)).toBe(true);   // 锅炉出水管：传播到进水管
    expect(pipeEffectiveDisabled(pipes[2], nodes)).toBe(true);   // 下游管路：出口阀打开但上游无供液
  });

  it("进水阀打开时，锅炉出水管与下游管路正常流动", () => {
    const nodes = [
      solenoid2("inletValve", "open"),
      boiler("boiler"),
      solenoid2("outletValve", "open"),
      makeNode({ id: "tank", type: "tank", ports: [makePort({ id: "tank_l", nodeId: "tank", position: "left" })] }),
    ];
    const pipes = [
      makePipe("pipe_in", "inletValve_r", "boiler_b"),
      makePipe("pipe_out", "boiler_t", "outletValve_l"),
      makePipe("pipe_down", "outletValve_r", "tank_l"),
    ];
    setCachedPipes(pipes);

    expect(pipeEffectiveDisabled(pipes[0], nodes)).toBe(false);
    expect(pipeEffectiveDisabled(pipes[1], nodes)).toBe(false);
    expect(pipeEffectiveDisabled(pipes[2], nodes)).toBe(false);
  });

  it("出水阀本身关闭时，其下游管路停流（既有行为保持）", () => {
    const nodes = [
      solenoid2("inletValve", "open"),
      boiler("boiler"),
      solenoid2("outletValve", "closed"),
      makeNode({ id: "tank", type: "tank", ports: [makePort({ id: "tank_l", nodeId: "tank", position: "left" })] }),
    ];
    const pipes = [
      makePipe("pipe_in", "inletValve_r", "boiler_b"),
      makePipe("pipe_out", "boiler_t", "outletValve_l"),
      makePipe("pipe_down", "outletValve_r", "tank_l"),
    ];
    setCachedPipes(pipes);

    expect(pipeEffectiveDisabled(pipes[2], nodes)).toBe(true);   // 下游：出口阀关闭
    expect(pipeEffectiveDisabled(pipes[1], nodes)).toBe(true);   // 出水管：也因出口阀关闭
  });

  it("三通电磁阀 A 路径打开但上游关闭时，A 出侧下游也停流", () => {
    const nodes = [
      solenoid2("inletValve", "closed"),
      boiler("boiler"),
      makeNode({
        id: "sv3", type: "solenoid3", valvePath: "A",
        ports: [
          makePort({ id: "sv3_l", nodeId: "sv3", position: "left", direction: "in" }),
          makePort({ id: "sv3_r", nodeId: "sv3", position: "right", direction: "out" }),
          makePort({ id: "sv3_b", nodeId: "sv3", position: "bottom", direction: "out" }),
        ],
      }),
      makeNode({ id: "tank", type: "tank", ports: [makePort({ id: "tank_l", nodeId: "tank", position: "left" })] }),
    ];
    const pipes = [
      makePipe("pipe_in", "inletValve_r", "boiler_b"),
      makePipe("pipe_out", "boiler_t", "sv3_l"),
      makePipe("pipe_A", "sv3_r", "tank_l"),
    ];
    setCachedPipes(pipes);

    // A 路径虽然打开，但上游进水关闭 → A 出侧也应停流
    expect(pipeEffectiveDisabled(pipes[2], nodes)).toBe(true);
  });

  it("截止阀直通传播：进水阀关闭 → 经截止阀与锅炉 → 出水阀下游全部停流", () => {
    // 结构：进水阀(关) → 截止阀(valve) → 锅炉 → 出水阀(开) → 下游
    const nodes = [
      solenoid2("inletValve", "closed"),
      makeNode({
        id: "pressRed", type: "valve",
        ports: [
          makePort({ id: "pressRed_l", nodeId: "pressRed", position: "left", direction: "in" }),
          makePort({ id: "pressRed_r", nodeId: "pressRed", position: "right", direction: "out" }),
        ],
      }),
      boiler("boiler"),
      solenoid2("outletValve", "open"),
      makeNode({ id: "tank", type: "tank", ports: [makePort({ id: "tank_l", nodeId: "tank", position: "left" })] }),
    ];
    const pipes = [
      makePipe("pipe_in", "inletValve_r", "pressRed_l"),   // 进水阀 → 截止阀
      makePipe("pipe_press", "pressRed_r", "boiler_b"),    // 截止阀 → 锅炉
      makePipe("pipe_out", "boiler_t", "outletValve_l"),   // 锅炉 → 出水阀
      makePipe("pipe_down", "outletValve_r", "tank_l"),    // 出水阀 → 下游
    ];
    setCachedPipes(pipes);

    expect(pipeEffectiveDisabled(pipes[0], nodes)).toBe(true);  // 进水阀后
    expect(pipeEffectiveDisabled(pipes[1], nodes)).toBe(true);  // 穿过截止阀
    expect(pipeEffectiveDisabled(pipes[2], nodes)).toBe(true);  // 锅炉出水管
    expect(pipeEffectiveDisabled(pipes[3], nodes)).toBe(true);  // 出水阀下游
  });

  it("管路缓存未设置时退化为直接判断，不抛错", () => {
    setCachedPipes([]);
    const nodes = [
      solenoid2("inletValve", "closed"),
      makeNode({ id: "tank", type: "tank", ports: [makePort({ id: "tank_l", nodeId: "tank", position: "left" })] }),
    ];
    const pipe = makePipe("pipe", "inletValve_r", "tank_l");
    expect(pipeEffectiveDisabled(pipe, nodes)).toBe(true); // 直接连关闭阀门
  });
});

describe("水泵/奶泵启动功能", () => {
  function pumpNode(id: string, pumpOn?: boolean): DiagramNode {
    return makeNode({
      id,
      type: "pump",
      pumpOn,
      ports: [
        makePort({ id: `${id}_l`, nodeId: id, position: "left", direction: "in" }),
        makePort({ id: `${id}_r`, nodeId: id, position: "right", direction: "out" }),
      ],
    });
  }

  it("泵默认运行（pumpOn 未设置）时管路正常流动", () => {
    const nodes = [pumpNode("p"), makeNode({ id: "t", type: "tank", ports: [makePort({ id: "t_l", nodeId: "t", position: "left" })] })];
    const pipes = [makePipe("pipe1", "p_r", "t_l")];
    setCachedPipes(pipes);
    expect(pipeEffectiveDisabled(pipes[0], nodes)).toBe(false);
  });

  it("泵停止时，其出侧管路停流", () => {
    const nodes = [pumpNode("p", false), makeNode({ id: "t", type: "tank", ports: [makePort({ id: "t_l", nodeId: "t", position: "left" })] })];
    const pipes = [makePipe("pipe1", "p_r", "t_l")];
    setCachedPipes(pipes);
    expect(pipeEffectiveDisabled(pipes[0], nodes)).toBe(true);
  });

  it("泵停止时，泵前（入侧）管路也停流（泵自身切断）", () => {
    const nodes = [
      makeNode({ id: "src", type: "inlet", ports: [makePort({ id: "src_r", nodeId: "src", position: "right", direction: "out" })] }),
      pumpNode("p", false),
    ];
    const pipes = [makePipe("pipe_in", "src_r", "p_l")];
    setCachedPipes(pipes);
    expect(pipeEffectiveDisabled(pipes[0], nodes)).toBe(true);
  });

  it("泵停止时，下游经直通元件（阀门/过滤器）的管路也停流", () => {
    const nodes = [
      pumpNode("p", false),
      makeNode({ id: "v", type: "valve", ports: [
        makePort({ id: "v_l", nodeId: "v", position: "left", direction: "in" }),
        makePort({ id: "v_r", nodeId: "v", position: "right", direction: "out" }),
      ] }),
      makeNode({ id: "t", type: "tank", ports: [makePort({ id: "t_l", nodeId: "t", position: "left" })] }),
    ];
    const pipes = [
      makePipe("pipe1", "p_r", "v_l"),
      makePipe("pipe2", "v_r", "t_l"),
    ];
    setCachedPipes(pipes);
    expect(pipeEffectiveDisabled(pipes[0], nodes)).toBe(true);
    expect(pipeEffectiveDisabled(pipes[1], nodes)).toBe(true);
  });

  it("泵重新运行后管路恢复流动", () => {
    const nodes = [
      pumpNode("p", false),
      makeNode({ id: "t", type: "tank", ports: [makePort({ id: "t_l", nodeId: "t", position: "left" })] }),
    ];
    const pipes = [makePipe("pipe1", "p_r", "t_l")];
    setCachedPipes(pipes);
    expect(pipeEffectiveDisabled(pipes[0], nodes)).toBe(true);
    // 泵启动
    nodes[0].pumpOn = true;
    expect(pipeEffectiveDisabled(pipes[0], nodes)).toBe(false);
  });
});

// ===== 介质修改语义：独立修改（不再自动全局传播） =====
function buildChain() {
  const nodes = [
    { id: "s", type: "tank", label: "源", x: 0, y: 0, width: 50, height: 50, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "s_r", nodeId: "s", position: "right", direction: "out" }] },
    { id: "p", type: "pump", label: "泵", x: 100, y: 0, width: 50, height: 50, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "p_l", nodeId: "p", position: "left", direction: "in" }, { id: "p_r", nodeId: "p", position: "right", direction: "out" }] },
    { id: "f", type: "filter", label: "滤", x: 200, y: 0, width: 50, height: 50, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "f_l", nodeId: "f", position: "left", direction: "in" }, { id: "f_r", nodeId: "f", position: "right", direction: "out" }] },
    { id: "v", type: "solenoid2", label: "阀", x: 300, y: 0, width: 50, height: 50, rotation: 0, fill: "#fff", stroke: "#000", valveState: "open", ports: [{ id: "v_l", nodeId: "v", position: "left", direction: "in" }, { id: "v_r", nodeId: "v", position: "right", direction: "out" }] },
    { id: "e", type: "tank", label: "端", x: 400, y: 0, width: 50, height: 50, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "e_l", nodeId: "e", position: "left", direction: "in" }] },
  ] as any;
  const mk = (id: string, from: string, to: string, ft: Pipe["fluidType"]): Pipe => ({
    id, fromPortId: from, toPortId: to, points: [], label: "管", fluidType: ft, fluidColor: "#2f7fd6",
    nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidOpacity: 0.92, direction: "forward" as const, flowSpeed: 1.2, particleDensity: "medium" as const, animated: true, showArrow: true, material: "custom", wallOpacity: 1, routing: "orthogonal", cornerRadius: 0,
  });
  const pipes = [mk("p1", "s_r", "p_l", "coldWater"), mk("p2", "p_r", "f_l", "coldWater"), mk("p3", "f_r", "v_l", "coldWater"), mk("p4", "v_r", "e_l", "coldWater")];
  return { nodes, pipes };
}

describe("介质修改语义（独立修改，不自动传播）", () => {
  it("改一条管路介质只影响该条，不联动直通链", () => {
    const { nodes, pipes } = buildChain();
    loadDiagram({ id: "t", name: "t", nodes, pipes, settings: { showGrid: true, background: "#fff", globalAnimationPlaying: true, crossoverHops: true } });
    patchPipe("p2", { fluidType: "hotWater" });
    const d = store.get().diagram;
    expect(d.pipes.find((x) => x.id === "p2")?.fluidType).toBe("hotWater");
    expect(d.pipes.find((x) => x.id === "p1")?.fluidType).toBe("coldWater");
    expect(d.pipes.find((x) => x.id === "p3")?.fluidType).toBe("coldWater");
    expect(d.pipes.find((x) => x.id === "p4")?.fluidType).toBe("coldWater");
  });

  it("显式调用 syncFluidThroughChain 才整链同步", () => {
    const { nodes, pipes } = buildChain();
    loadDiagram({ id: "t", name: "t", nodes, pipes, settings: { showGrid: true, background: "#fff", globalAnimationPlaying: true, crossoverHops: true } });
    patchPipe("p2", { fluidType: "hotWater" });
    syncFluidThroughChain("p2");
    const d = store.get().diagram;
    expect(d.pipes.find((x) => x.id === "p1")?.fluidType).toBe("hotWater");
    expect(d.pipes.find((x) => x.id === "p3")?.fluidType).toBe("hotWater");
    expect(d.pipes.find((x) => x.id === "p4")?.fluidType).toBe("hotWater");
    expect(d.pipes.find((x) => x.id === "p4")?.fluidColor).toBe("#e2542f");
  });
});
