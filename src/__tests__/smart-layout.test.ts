import { describe, it, expect } from "vitest";
import { SMART_TEMPLATES, buildSmartTemplate } from "../smart-draw/templates";
import { nodeBBox, pipePolyline } from "../geometry";
import type { Pt } from "../types";

function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
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

  it("整机 / 双锅炉骨架带四个分区提示，且只有一个进水口", () => {
    for (const id of ["full", "dual-boiler"]) {
      const template = SMART_TEMPLATES.find((t) => t.id === id)!;
      const result = buildSmartTemplate(template, {});
      expect(result.zones?.map((z) => z.id)).toEqual(["supply", "coffee", "steam-milk", "drain"]);
      expect(result.nodes.filter((n) => n.type === "inlet")).toHaveLength(1);
    }
  });
});
