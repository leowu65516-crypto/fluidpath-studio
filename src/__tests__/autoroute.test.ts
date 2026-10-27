import { describe, expect, it } from "vitest";
import {
  ROUTE_CLEARANCE,
  autoRoute,
  pipePolyline,
  routeCost,
  routeHits,
  type Rect,
  type RouteOccupancy
} from "../geometry";
import type { DiagramNode, Pipe, Pt } from "../types";

/** 障碍矩形（调用方需自行外扩净空，autoRoute 假定传入的已是「外扩后」的盒子） */
function box(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

function node(id: string, type: string, x: number, y: number, w = 60, h = 40, ports: Array<{ id: string; position: string }> = []): DiagramNode {
  return {
    id, type, label: id, x, y, width: w, height: h, rotation: 0, fill: "#fff", stroke: "#000",
    ports: ports.map((p) => ({ ...p, nodeId: id, direction: "in" }) as any)
  } as unknown as DiagramNode;
}

function pipe(over: Partial<Pipe>): Pipe {
  return {
    id: "p", label: "P", points: [], nominalDiameter: "DN25", visualDiameter: 10,
    wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.9, direction: "forward",
    flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true,
    fluidType: "coldWater", material: "custom", wallOpacity: 1, routing: "orthogonal", cornerRadius: 0,
    ...over
  } as Pipe;
}

/** 断言：折线全部正交，且不穿过任何障碍矩形（纯几何，不看坐标快照） */
function assertNoHit(pts: Pt[], obstacles: Rect[]) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    expect(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01).toBe(true);
  }
  expect(routeHits(pts, obstacles)).toBe(0);
}

describe("autoRoute 不变量", () => {
  it("单障碍：L 形绕行，不穿障碍", () => {
    const obstacles = [box(150, 60, 180, 120)];
    const mids = autoRoute({ x: 0, y: 120 }, { x: 400, y: 120 }, { x: 1, y: 0 }, obstacles);
    const pts: Pt[] = [{ x: 0, y: 120 }, ...mids, { x: 400, y: 120 }];
    assertNoHit(pts, obstacles);
    expect(pts.length).toBeGreaterThanOrEqual(3);
  });

  it("两障碍之间：选择可通行的走廊而不是硬穿", () => {
    const obstacles = [box(120, 0, 60, 90), box(120, 150, 60, 90)]; // 中间留 60px 通道
    const mids = autoRoute({ x: 0, y: 120 }, { x: 320, y: 120 }, { x: 1, y: 0 }, obstacles);
    const pts: Pt[] = [{ x: 0, y: 120 }, ...mids, { x: 320, y: 120 }];
    assertNoHit(pts, obstacles);
  });

  it("死角：候选全穿模时 A* 兜底仍能给出不穿模路径", () => {
    // 上下夹住，只有右侧留一个缺口
    const obstacles = [box(100, -200, 200, 300), box(100, 160, 200, 300), box(300, 0, 60, 200)];
    const mids = autoRoute({ x: 0, y: 120 }, { x: 520, y: 120 }, { x: 1, y: 0 }, obstacles);
    const pts: Pt[] = [{ x: 0, y: 120 }, ...mids, { x: 520, y: 120 }];
    expect(routeHits(pts, obstacles)).toBe(0);
  });

  it("平行管错层：占用表让第二根管换一条走廊", () => {
    const obstacles = [box(200, 100, 120, 44)]; // 正挡在 y=120 的直线上，两根管都必须绕
    const occ: RouteOccupancy = new Map();
    const route = (y: number) => {
      const mids = autoRoute({ x: 0, y }, { x: 500, y }, { x: 1, y: 0 }, obstacles, { occupancy: occ, layered: true });
      return [{ x: 0, y }, ...mids, { x: 500, y }];
    };
    const a = route(120);
    const b = route(120);
    assertNoHit(a, obstacles);
    assertNoHit(b, obstacles);
    // 主段 = 与障碍上下边贴得最近的那段水平线
    const mainY = (pts: Pt[]) => {
      const ys = pts.filter((p) => Math.abs(p.y - 120) > 1).map((p) => p.y);
      return ys.length ? ys.sort((m, n) => Math.abs(m - 120) - Math.abs(n - 120))[0] : 120;
    };
    // 第二根管被占用表推到另一条走廊，且至少隔一个净空
    expect(Math.abs(mainY(a) - mainY(b))).toBeGreaterThanOrEqual(ROUTE_CLEARANCE - 1);
  });

  it("关闭 layered 时不生成错层候选（拖动热路径保持候选规模）", () => {
    const obstacles = [box(200, 0, 120, 90)];
    const occ: RouteOccupancy = new Map([["h:90", 5], ["h:72", 5], ["h:108", 5]]);
    const mids = autoRoute({ x: 0, y: 120 }, { x: 500, y: 120 }, { x: 1, y: 0 }, obstacles, { occupancy: occ });
    const pts: Pt[] = [{ x: 0, y: 120 }, ...mids, { x: 500, y: 120 }];
    expect(routeHits(pts, obstacles)).toBe(0);
    expect(routeCost(pts, obstacles)).toBeLessThan(1e6);
  });

  it("净空常量参与判定：障碍贴得更近时路径必须让得更远", () => {
    const obstacles = [box(200, 100, 120, 44)];
    const mids = autoRoute({ x: 0, y: 120 }, { x: 500, y: 120 }, { x: 1, y: 0 }, obstacles);
    const pts: Pt[] = [{ x: 0, y: 120 }, ...mids, { x: 500, y: 120 }];
    const ys = pts.map((p) => p.y);
    expect(Math.max(...ys) >= 144 || Math.min(...ys) <= 100).toBe(true);
  });
});

describe("pipePolyline 游离端也避障", () => {
  it("单端游离的管不再直穿元件", () => {
    const a = node("a", "tank", 0, 100, 60, 40, [{ id: "a_r", position: "right" }]);
    const blocker = node("o", "shape", 200, 80, 140, 80);
    const p = pipe({ id: "free", fromPortId: "a_r", toPoint: { x: 420, y: 120 } });
    const pts = pipePolyline(p, [a, blocker]);
    expect(pts).toBeTruthy();
    // 障碍外扩净空后不得被穿越
    const inflated = [box(200 - ROUTE_CLEARANCE, 80 - ROUTE_CLEARANCE, 140 + ROUTE_CLEARANCE * 2, 80 + ROUTE_CLEARANCE * 2)];
    const body = pts!.slice(1, -1);
    expect(routeHits(body, inflated)).toBe(0);
  });

  it("两端都游离时也走避障（不再直连）", () => {
    const blocker = node("o", "shape", 200, 80, 140, 80);
    const p = pipe({ fromPoint: { x: 0, y: 120 }, toPoint: { x: 420, y: 120 } });
    const pts = pipePolyline(p, [blocker]);
    const inflated = [box(200 - ROUTE_CLEARANCE, 80 - ROUTE_CLEARANCE, 140 + ROUTE_CLEARANCE * 2, 80 + ROUTE_CLEARANCE * 2)];
    expect(routeHits(pts!.slice(1, -1), inflated)).toBe(0);
  });
});
