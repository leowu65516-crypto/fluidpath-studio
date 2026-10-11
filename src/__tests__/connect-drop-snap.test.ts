/**
 * 新建连线松手解析（P0/P1 修复）：
 * - resolveConnectDrop：精确命中端口热区优先；落空时按容差接近吸附（与重连端子同一手感）；
 *   容差外返回 null（调用方 toast「未连接到端口，请拖到目标端口上」）；
 * - 自连（落点离出发端口很近）返回出发端口本身，交由 createPipe 的共用校验报 same-port；
 * - 吸附结果与 validatePipeConnection 的合法性判定正交：非法端口也能被吸附，由共用校验给出明确原因。
 */
import { describe, it, expect } from "vitest";
import { resolveConnectDrop, validatePipeConnection } from "../connection";
import type { Diagram, DiagramNode } from "../types";

function port(id: string, direction: "in" | "out" | "bidirectional") {
  return { id, position: "right" as const, offset: 0.5, direction };
}

function mkNode(id: string, x: number, y: number, ports: ReturnType<typeof port>[]): DiagramNode {
  return {
    id,
    type: "pump",
    x,
    y,
    width: 100,
    height: 60,
    rotation: 0,
    label: id,
    ports,
  } as unknown as DiagramNode;
}

/** 两节点：n1 出口锚点 (200,30)（x=100,w=100 的右缘），n2 入口锚点 (500,30) */
function mkDiagram(): Diagram {
  const n1 = mkNode("n1", 100, 0, [port("p1", "out")]);
  const n2 = mkNode("n2", 400, 0, [port("p2", "in")]);
  return { name: "t", nodes: [n1, n2], pipes: [], conditions: [], savedState: {} } as unknown as Diagram;
}

describe("resolveConnectDrop（新建连线松手解析）", () => {
  const d = mkDiagram();

  it("精确命中端口热区：直接返回该端口（即使另一个端口更近）", () => {
    expect(resolveConnectDrop(d.nodes, { x: 200, y: 300 }, 16, "p2")).toBe("p2");
  });

  it("落空但距端口 ≤ 容差：接近吸附（重连同手感）", () => {
    // p2 端口世界锚点 = (500, 30)；落点偏移 10px
    expect(resolveConnectDrop(d.nodes, { x: 505, y: 38 }, 16, null)).toBe("p2");
  });

  it("超出容差：返回 null（调用方给出「未连接到端口」提示）", () => {
    expect(resolveConnectDrop(d.nodes, { x: 505, y: 80 }, 16, null)).toBeNull();
    expect(resolveConnectDrop(d.nodes, { x: 0, y: 0 }, 16, null)).toBeNull();
  });

  it("精确命中传了不存在的端口 id：回退到接近吸附", () => {
    expect(resolveConnectDrop(d.nodes, { x: 505, y: 38 }, 16, "ghost")).toBe("p2");
  });

  it("自连：落点离出发端口很近时吸附到它本身（由共用校验报 same-port）", () => {
    const hit = resolveConnectDrop(d.nodes, { x: 202, y: 32 }, 16, null);
    expect(hit).toBe("p1");
    expect(validatePipeConnection(d, "p1", hit!)).toBe("same-port");
  });

  it("吸附与合法性正交：非法目标（both-in）也能吸附，交给共用校验给出原因", () => {
    const n3 = mkNode("n3", 700, 0, [port("p3", "in")]);
    const d2 = { ...d, nodes: [...d.nodes, n3] } as Diagram;
    const hit = resolveConnectDrop(d2.nodes, { x: 805, y: 32 }, 16, null);
    expect(hit).toBe("p3");
    expect(validatePipeConnection(d2, "p2", hit!)).toBe("both-in");
  });
});
