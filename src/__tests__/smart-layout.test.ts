import { describe, it, expect } from "vitest";
import { SMART_TEMPLATES, buildSmartTemplate } from "../smart-draw/templates";
import { nodeBBox, pipePolyline } from "../geometry";
import { smartViewProjection } from "../smart-draw/view";
import { findPipeOverlaps } from "../smart-draw/overlap";
import type { Pt } from "../types";

function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function asDiagram(result: { nodes: any[]; pipes: any[]; conditions?: any[] }): any {
  return { id: "t", name: "t", nodes: result.nodes, pipes: result.pipes, settings: { showGrid: true, background: "#fff", globalAnimationPlaying: false, workConditions: result.conditions } };
}

describe("智能绘图模板布局", () => {
  it("所有模板的元件矩形互不重叠", () => {
    for (const template of SMART_TEMPLATES) {
      const result = buildSmartTemplate(template, {});
      const boxes = result.nodes.map((node) => ({ node, box: nodeBBox(node) }));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].box;
          const b = boxes[j].box;
          const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
          if (overlaps) throw new Error(`${template.id}: ${boxes[i].node.label} overlaps ${boxes[j].node.label}`);
        }
      }
    }
  });

  it("所有模板默认走线互不交叉", () => {
    for (const template of SMART_TEMPLATES) {
      const result = buildSmartTemplate(template, {});
      const polys = result.pipes.map((pipe) => ({ pipe, pts: pipePolyline(pipe, result.nodes) }));
      for (let i = 0; i < polys.length; i++) {
        for (let j = i + 1; j < polys.length; j++) {
          const A = polys[i], B = polys[j];
          if (!A.pts || !B.pts) continue;
          const shared = [A.pipe.fromPortId, A.pipe.toPortId].some((x) => x && [B.pipe.fromPortId, B.pipe.toPortId].includes(x));
          if (shared) continue;
          for (let k = 1; k < A.pts.length; k++) {
            for (let l = 1; l < B.pts.length; l++) {
              if (segCross(A.pts[k - 1], A.pts[k], B.pts[l - 1], B.pts[l])) {
                throw new Error(`${template.id}: ${A.pipe.label} crosses ${B.pipe.label}`);
              }
            }
          }
        }
      }
    }
  });

  it("缩略图与画布主链投影一致：无悬空管，串联件保留", () => {
    for (const template of SMART_TEMPLATES) {
      const result = buildSmartTemplate(template, {});
      const projection = smartViewProjection(result.nodes, result.pipes, "main");
      const visiblePorts = new Set(projection.visibleNodes.flatMap((n) => n.ports.map((p) => p.id)));
      for (const pipe of projection.visiblePipes) {
        expect(visiblePorts.has(pipe.fromPortId!)).toBe(true);
        expect(visiblePorts.has(pipe.toPortId!)).toBe(true);
      }
      const hasCoffee = result.nodes.some((n) => n.type === "coffeeOutlet");
      if (hasCoffee) {
        if (result.nodes.some((n) => n.type === "checkValve")) {
          expect(projection.visibleNodes.some((n) => n.type === "checkValve")).toBe(true);
        }
        // 全量整机模板才带流量计；单个咖啡模板没有流量计时不作要求
        if (result.nodes.some((n) => n.type === "flowMeter")) {
          expect(projection.visibleNodes.some((n) => n.type === "flowMeter")).toBe(true);
        }
      }
    }
  });

  it("模板默认无管路视觉重合；构造的平行近距管会被检测", () => {
    for (const template of SMART_TEMPLATES) {
      const result = buildSmartTemplate(template, {});
      const overlaps = findPipeOverlaps(asDiagram(result));
      expect(overlaps).toEqual([]);
    }
    // 构造两根平行近距管：连接不同元件、不在同一节点上，应被检测为视觉重合。
    const water = buildSmartTemplate(SMART_TEMPLATES.find((t) => t.id === "water")!, {});
    const a = water.nodes[0], b = water.nodes[1];
    const synthetic = asDiagram({
      nodes: [
        { ...a, id: "sa1", x: 0, y: 0, ports: a.ports.map((p) => ({ ...p, id: `sp-${p.id}` })) },
        { ...b, id: "sb1", x: 300, y: 0, ports: b.ports.map((p) => ({ ...p, id: `sq-${p.id}` })) },
        { ...a, id: "sa2", x: 0, y: 4, ports: a.ports.map((p) => ({ ...p, id: `sr-${p.id}` })) },
        { ...b, id: "sb2", x: 300, y: 4, ports: b.ports.map((p) => ({ ...p, id: `ss-${p.id}` })) },
      ],
      pipes: [
        { ...water.pipes[0], id: "spp1", label: "A", fromPortId: `sp-${a.ports[0].id}`, toPortId: `sq-${b.ports[0].id}`, points: [] },
        { ...water.pipes[0], id: "spp2", label: "B", fromPortId: `sr-${a.ports[0].id}`, toPortId: `ss-${b.ports[0].id}`, points: [] },
      ],
    });
    expect(findPipeOverlaps(synthetic).length).toBeGreaterThan(0);
  });

  it("整机 / 双锅炉骨架带四个分区提示，且只有一个进水口", () => {
    for (const id of ["full", "dual-boiler"]) {
      const template = SMART_TEMPLATES.find((t) => t.id === id)!;
      const result = buildSmartTemplate(template, {});
      expect(result.zones?.map((z) => z.id)).toEqual(["supply", "coffee", "steam-milk", "drain"]);
      expect(result.nodes.filter((n) => n.type === "inlet")).toHaveLength(1);
    }
  });
});
