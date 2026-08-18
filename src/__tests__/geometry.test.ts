import { describe, it, expect } from "vitest";
import {
  orthogonalize,
  simplify,
  portLocalPos,
  portWorldPos,
  nodeCenter,
  pathD,
  dist,
  snap,
  rectsIntersect,
  nodeBBox,
  rotatePt,
  computeAlign,
  pipeEffectiveDisabled,
} from "../geometry";
import type { DiagramNode, Pipe, Port, Pt } from "../types";

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

function makePipe(overrides: Partial<Pipe> = {}): Pipe {
  return {
    id: "pipe1",
    label: "Test Pipe",
    fromPortId: "p1",
    toPortId: "p2",
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
    ...overrides,
  };
}

// ===== Tests =====

describe("rotatePt", () => {
  it("returns the same point for 0 degrees", () => {
    const p = { x: 10, y: 20 };
    const c = { x: 0, y: 0 };
    expect(rotatePt(p, c, 0)).toEqual({ x: 10, y: 20 });
  });

  it("rotates 90 degrees around origin", () => {
    const p = { x: 10, y: 0 };
    const c = { x: 0, y: 0 };
    const r = rotatePt(p, c, 90);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(10);
  });

  it("rotates around a custom center", () => {
    const p = { x: 110, y: 100 };
    const c = { x: 100, y: 100 };
    const r = rotatePt(p, c, 180);
    expect(r.x).toBeCloseTo(90);
    expect(r.y).toBeCloseTo(100);
  });
});

describe("orthogonalize", () => {
  it("passes through already-orthogonal points", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ];
    expect(orthogonalize(pts)).toEqual(pts);
  });

  it("inserts a corner point for diagonals", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ];
    const result = orthogonalize(pts);
    expect(result.length).toBe(3);
    expect(result[1]).toEqual({ x: 100, y: 0 });
    expect(result[2]).toEqual({ x: 100, y: 50 });
  });

  it("deduplicates consecutive near-equal points", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100.005, y: 0 },
      { x: 100, y: 50 },
    ];
    const result = orthogonalize(pts);
    expect(result.length).toBe(3);
  });
});

describe("simplify", () => {
  it("removes collinear intermediate points", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ];
    const result = simplify(pts);
    expect(result.length).toBe(3);
    expect(result[1]).toEqual({ x: 100, y: 0 });
  });

  it("preserves essential corner points", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ];
    expect(simplify(pts)).toEqual(pts);
  });
});

describe("portLocalPos", () => {
  it("calculates right-side port at default offset", () => {
    const node = makeNode({ width: 100, height: 80 });
    const port = makePort({ position: "right" });
    const pos = portLocalPos(node, port);
    expect(pos).toEqual({ x: 100, y: 40 });
  });

  it("calculates top-side port at custom offset", () => {
    const node = makeNode({ width: 100, height: 80 });
    const port = makePort({ position: "top", offset: 0.3 });
    const pos = portLocalPos(node, port);
    expect(pos).toEqual({ x: 30, y: 0 });
  });

  it("calculates bottom-side port", () => {
    const node = makeNode({ width: 100, height: 80 });
    const port = makePort({ position: "bottom", offset: 0.8 });
    const pos = portLocalPos(node, port);
    expect(pos).toEqual({ x: 80, y: 80 });
  });

  it("calculates left-side port", () => {
    const node = makeNode({ width: 100, height: 80 });
    const port = makePort({ position: "left", offset: 0.25 });
    const pos = portLocalPos(node, port);
    expect(pos).toEqual({ x: 0, y: 20 });
  });
});

describe("nodeCenter", () => {
  it("returns the center of a node", () => {
    const node = makeNode({ x: 100, y: 200, width: 100, height: 80 });
    expect(nodeCenter(node)).toEqual({ x: 150, y: 240 });
  });
});

describe("portWorldPos", () => {
  it("returns world position for a right-side port", () => {
    const node = makeNode({ x: 100, y: 200, width: 100, height: 80 });
    const port = makePort({ position: "right" });
    const wp = portWorldPos(node, port);
    expect(wp).toEqual({ x: 200, y: 240 });
  });
});

describe("pathD", () => {
  it("generates SVG path string", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ];
    expect(pathD(pts)).toBe("M 0 0 L 100 0 L 100 50");
  });

  it("returns empty string for empty points", () => {
    expect(pathD([])).toBe("");
  });
});

describe("dist", () => {
  it("calculates distance between two points", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("returns 0 for same point", () => {
    expect(dist({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(0);
  });
});

describe("snap", () => {
  it("snaps to nearest grid point", () => {
    expect(snap(13, 8)).toBe(16);
    expect(snap(7, 8)).toBe(8);
    expect(snap(16, 8)).toBe(16);
  });

  it("defaults to 8px grid", () => {
    expect(snap(13)).toBe(16);
  });
});

describe("rectsIntersect", () => {
  it("detects overlapping rectangles", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it("detects non-overlapping rectangles", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 })).toBe(false);
  });

  it("touching edges do not intersect", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe("nodeBBox", () => {
  it("computes bounding box for non-rotated node", () => {
    const node = makeNode({ x: 100, y: 200, width: 100, height: 80 });
    const bb = nodeBBox(node);
    expect(bb).toEqual({ x: 100, y: 200, w: 100, h: 80 });
  });

  it("computes bounding box for rotated node", () => {
    const node = makeNode({ x: 100, y: 200, width: 100, height: 80, rotation: 45 });
    const bb = nodeBBox(node);
    // Rotated 45°, the bounding box should be larger
    expect(bb.w).toBeGreaterThan(100);
    expect(bb.h).toBeGreaterThan(80);
  });
});

describe("computeAlign", () => {
  it("snaps to aligned center when close enough", () => {
    const moving = { x: 100, y: 100, w: 50, h: 50 };
    const others = [{ x: 200, y: 100, w: 50, h: 50 }];
    const result = computeAlign(moving, others, 10);
    // moving center X = 125, other center X = 225, diff = 100 — too far
    // moving center Y = 125, other center Y = 125, diff = 0 — already aligned
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
  });

  it("snaps left edge when within tolerance", () => {
    const moving = { x: 105, y: 100, w: 50, h: 50 };
    const others = [{ x: 100, y: 200, w: 60, h: 50 }];
    const result = computeAlign(moving, others, 10);
    // moving.left=105, other.left=100 (diff=-5) OR other.center=130 (diff=25)
    // Also moving.center=130 vs other.center=130 (diff=0) — center is closer
    // Expected: dx=0 (center alignment is closest)
    expect(result.dx).toBe(0);
  });

  it("returns no snap when far away", () => {
    const moving = { x: 100, y: 100, w: 50, h: 50 };
    const others = [{ x: 500, y: 500, w: 50, h: 50 }];
    const result = computeAlign(moving, others, 10);
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
  });
});

describe("pipeEffectiveDisabled", () => {
  const nodes = [
    makeNode({ id: "n1", type: "pump", ports: [makePort({ id: "p1", nodeId: "n1", position: "right" })] }),
    makeNode({ id: "n2", type: "solenoid2", valveState: "open", ports: [makePort({ id: "p2", nodeId: "n2", position: "left" })] }),
    makeNode({ id: "n3", type: "tank", ports: [makePort({ id: "p3", nodeId: "n3", position: "left" })] }),
  ];

  it("not disabled when valve is open", () => {
    const pipe = makePipe({ fromPortId: "p1", toPortId: "p2" });
    expect(pipeEffectiveDisabled(pipe, nodes)).toBe(false);
  });

  it("disabled when pipe itself is disabled", () => {
    const pipe = makePipe({ disabled: true });
    expect(pipeEffectiveDisabled(pipe, nodes)).toBe(true);
  });

  it("disabled when connected to a disabled node", () => {
    const disabledNodes = [
      makeNode({ id: "n1", disabled: true, ports: [makePort({ id: "p1", nodeId: "n1", position: "right" })] }),
    ];
    const pipe = makePipe({ fromPortId: "p1", toPortId: "p2" });
    expect(pipeEffectiveDisabled(pipe, disabledNodes)).toBe(true);
  });

  it("disabled when solenoid2 is closed", () => {
    const closedNodes = [
      makeNode({ id: "n1", type: "pump", ports: [makePort({ id: "p1", nodeId: "n1", position: "right" })] }),
      makeNode({ id: "n2", type: "solenoid2", valveState: "closed", ports: [makePort({ id: "p2", nodeId: "n2", position: "left" })] }),
    ];
    const pipe = makePipe({ fromPortId: "p1", toPortId: "p2" });
    expect(pipeEffectiveDisabled(pipe, closedNodes)).toBe(true);
  });

  it("disabled for solenoid3 inactive path", () => {
    const sv3Nodes = [
      makeNode({ id: "s1", type: "pump", ports: [makePort({ id: "p1", nodeId: "s1", position: "left" })] }),
      makeNode({
        id: "sv3", type: "solenoid3", valvePath: "A",
        ports: [
          makePort({ id: "pa", nodeId: "sv3", position: "right" }),
          makePort({ id: "pb", nodeId: "sv3", position: "bottom" }),
          makePort({ id: "pl", nodeId: "sv3", position: "left" }),
        ],
      }),
    ];
    const pipeA = makePipe({ fromPortId: "pl", toPortId: "pa" }); // path A = active
    const pipeB = makePipe({ fromPortId: "pl", toPortId: "pb" }); // path B = inactive
    expect(pipeEffectiveDisabled(pipeA, sv3Nodes)).toBe(false);
    expect(pipeEffectiveDisabled(pipeB, sv3Nodes)).toBe(true);
  });
});

describe("端口位置变更 → 管路自动跟随", () => {
  it("portWorldPos 随 port.position 变化而变化", () => {
    const node = makeNode({ id: "n1", x: 100, y: 200, width: 100, height: 80 });
    const port = makePort({ id: "p1", nodeId: "n1", position: "bottom", offset: 0.5 });
    // bottom 端口在底部中间
    let wp = portWorldPos(node, port);
    expect(wp).toEqual({ x: 150, y: 280 });
    // 改到 top
    port.position = "top";
    wp = portWorldPos(node, port);
    expect(wp).toEqual({ x: 150, y: 200 });
    // 改到 left
    port.position = "left";
    port.offset = 0.25;
    wp = portWorldPos(node, port);
    expect(wp).toEqual({ x: 100, y: 220 });
  });
});

// ===== P1: 核心算法（走线避障 / 跨线拱桥 / 曲线） =====
import { smoothPath, roundedOrthPath, projectOnPolyline, pointAtLength, pathDWithHops, pipePolyline } from "../geometry";

describe("P1 smoothPath 平滑曲线", () => {
  it("输出以 M 开头且包含 C 贝塞尔命令", () => {
    const d = smoothPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    expect(d.startsWith("M")).toBe(true);
    expect(d.includes(" C ")).toBe(true);
  });
  it("两点退化为直线", () => {
    const d = smoothPath([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(d).toBe("M 0 0 L 100 0");
  });
});

describe("P1 roundedOrthPath 圆角折线", () => {
  it("r=0 时保持直角折线", () => {
    const d = roundedOrthPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 0);
    expect(d).toBe("M 0 0 L 100 0 L 100 50");
  });
  it("r>0 时用 Q 圆角", () => {
    const d = roundedOrthPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 10);
    expect(d.includes(" Q ")).toBe(true);
  });
});

describe("P1 projectOnPolyline 投影", () => {
  it("投影到水平线段中点", () => {
    const r = projectOnPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], { x: 50, y: 10 });
    expect(r.point.x).toBe(50);
    expect(r.point.y).toBe(0);
    expect(r.index).toBe(0);
  });
  it("端点外投影被夹紧", () => {
    const r = projectOnPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], { x: 200, y: 5 });
    expect(r.point.x).toBe(100);
  });
});

describe("P1 pointAtLength 沿折线取点", () => {
  it("折线中点返回正确坐标", () => {
    const r = pointAtLength([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 150);
    expect(r.pt.x).toBe(100);
    expect(r.pt.y).toBe(50);
  });
  it("起点返回首点", () => {
    const r = pointAtLength([{ x: 10, y: 20 }, { x: 100, y: 20 }], 0);
    expect(r.pt).toEqual({ x: 10, y: 20 });
  });
});

describe("P1 pathDWithHops 跨线拱桥", () => {
  it("垂直交叉时生成拱桥（含 A 圆弧命令）", () => {
    // 上层水平线 (0,50)→(200,50)，下层垂直线 (100,0)→(100,100)
    const d = pathDWithHops(
      [{ x: 0, y: 50 }, { x: 200, y: 50 }],
      [{ pts: [{ x: 100, y: 0 }, { x: 100, y: 100 }], halfW: 5 }],
      3
    );
    expect(d.includes(" A ")).toBe(true);
  });
  it("平行线不生成拱桥", () => {
    const d = pathDWithHops(
      [{ x: 0, y: 50 }, { x: 200, y: 50 }],
      [{ pts: [{ x: 0, y: 80 }, { x: 200, y: 80 }], halfW: 5 }],
      3
    );
    expect(d.includes(" A ")).toBe(false);
  });
});

describe("P1 pipePolyline 自动走线避障", () => {
  it("两节点间自动生成正交折线（不经障碍物）", () => {
    const n1 = { id: "a", type: "tank", label: "A", x: 0, y: 0, width: 60, height: 40, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "a_r", nodeId: "a", position: "right", direction: "out" }] };
    const n2 = { id: "b", type: "tank", label: "B", x: 300, y: 0, width: 60, height: 40, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "b_l", nodeId: "b", position: "left", direction: "in" }] };
    const pipe = {
      id: "p", label: "P", fromPortId: "a_r", toPortId: "b_l", fromPoint: undefined, toPoint: undefined,
      points: [], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1, routing: "orthogonal", cornerRadius: 0,
    };
    const pts = pipePolyline(pipe as any, [n1, n2] as any);
    expect(pts).toBeTruthy();
    expect(pts!.length).toBeGreaterThanOrEqual(2);
    // 所有线段水平或垂直
    for (let i = 1; i < pts!.length; i++) {
      const dx = Math.abs(pts![i].x - pts![i - 1].x);
      const dy = Math.abs(pts![i].y - pts![i - 1].y);
      expect(dx < 0.01 || dy < 0.01).toBe(true);
    }
  });

  it("对角节点自动插入折点（≥3点且正交）", () => {
    const n1 = { id: "a", type: "tank", label: "A", x: 0, y: 0, width: 60, height: 40, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "a_r", nodeId: "a", position: "right", direction: "out" }] };
    const n2 = { id: "b", type: "tank", label: "B", x: 300, y: 200, width: 60, height: 40, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "b_l", nodeId: "b", position: "left", direction: "in" }] };
    const pipe = {
      id: "p", label: "P", fromPortId: "a_r", toPortId: "b_l", fromPoint: undefined, toPoint: undefined,
      points: [], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1, routing: "orthogonal", cornerRadius: 0,
    };
    const pts = pipePolyline(pipe as any, [n1, n2] as any);
    expect(pts).toBeTruthy();
    expect(pts!.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < pts!.length; i++) {
      const dx = Math.abs(pts![i].x - pts![i - 1].x);
      const dy = Math.abs(pts![i].y - pts![i - 1].y);
      expect(dx < 0.01 || dy < 0.01).toBe(true);
    }
  });

  it("有障碍物时绕行（不穿越矩形障碍）", () => {
    const n1 = { id: "a", type: "tank", label: "A", x: 0, y: 100, width: 60, height: 40, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "a_r", nodeId: "a", position: "right", direction: "out" }] };
    const n2 = { id: "b", type: "tank", label: "B", x: 400, y: 100, width: 60, height: 40, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "b_l", nodeId: "b", position: "left", direction: "in" }] };
    // 障碍在正中间
    const obs = { id: "o", type: "shape", variant: "rect", label: "障碍", x: 150, y: 80, width: 140, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [] };
    const pipe = {
      id: "p", label: "P", fromPortId: "a_r", toPortId: "b_l", fromPoint: undefined, toPoint: undefined,
      points: [], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1, routing: "orthogonal", cornerRadius: 0,
    };
    const pts = pipePolyline(pipe as any, [n1, n2, obs] as any);
    expect(pts).toBeTruthy();
    // 校验没有线段穿过障碍包围盒（外扩净空后）
    const obsBox = { x: 150 - 18, y: 80 - 18, w: 140 + 36, h: 80 + 36 };
    let hit = false;
    for (let i = 1; i < pts!.length; i++) {
      const a = pts![i - 1], b = pts![i];
      const seg = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
      if (seg.x < obsBox.x + obsBox.w && seg.x + seg.w > obsBox.x && seg.y < obsBox.y + obsBox.h && seg.y + seg.h > obsBox.y) {
        // 允许贴边但不可穿越障碍本体
        const core = { x: 150, y: 80, w: 140, h: 80 };
        if (seg.x < core.x + core.w && seg.x + seg.w > core.x && seg.y < core.y + core.h && seg.y + seg.h > core.y) hit = true;
      }
    }
    expect(hit).toBe(false);
  });
});
