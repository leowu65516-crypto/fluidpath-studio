import type { Diagram, Pipe, Pt } from "../types";
import { pipePolyline } from "../geometry";

export interface PipeOverlap {
  id: string;
  pipeIds: string[];
  titleZh: string;
  titleEn: string;
  messageZh: string;
  messageEn: string;
}

function shareEndpoint(a: Pipe, b: Pipe): boolean {
  return [a.fromPortId, a.toPortId].some((p) => p && [b.fromPortId, b.toPortId].includes(p));
}

/** 两根管如果接在同一个元件上（哪怕不是同一个端口），在接头附近重合是正常的。 */
function shareNode(a: Pipe, b: Pipe, portNode: Map<string, string>): boolean {
  const aNodes = [a.fromPortId, a.toPortId].map((id) => id ? portNode.get(id) : undefined).filter(Boolean);
  const bNodes = [b.fromPortId, b.toPortId].map((id) => id ? portNode.get(id) : undefined).filter(Boolean);
  return aNodes.some((id) => bNodes.includes(id));
}

function overlap1d(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

/** 找出共线重合、以及平行但间距过近的管路；只做视觉提示，不改工程。 */
export function findPipeOverlaps(diagram: Diagram): PipeOverlap[] {
  const out: PipeOverlap[] = [];
  const polys = diagram.pipes.map((pipe) => ({ pipe, pts: pipePolyline(pipe, diagram.nodes) })).filter((x): x is { pipe: Pipe; pts: Pt[] } => !!x.pts);
  const portNode = new Map<string, string>();
  for (const n of diagram.nodes) for (const p of n.ports) portNode.set(p.id, n.id);
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      const A = polys[i], B = polys[j];
      if (shareEndpoint(A.pipe, B.pipe) || shareNode(A.pipe, B.pipe, portNode)) continue;
      let found = false;
      for (let a = 1; a < A.pts.length && !found; a++) {
        const a1 = A.pts[a - 1], a2 = A.pts[a];
        for (let b = 1; b < B.pts.length && !found; b++) {
          const b1 = B.pts[b - 1], b2 = B.pts[b];
          const aHorizontal = Math.abs(a2.y - a1.y) < 1.5;
          const bHorizontal = Math.abs(b2.y - b1.y) < 1.5;
          if (aHorizontal && bHorizontal) {
            const gap = Math.abs(a1.y - b1.y);
            const overlap = overlap1d(a1.x, a2.x, b1.x, b2.x);
            if (overlap > 12 && gap < 7) found = true;
          } else if (!aHorizontal && !bHorizontal) {
            const gap = Math.abs(a1.x - b1.x);
            const overlap = overlap1d(a1.y, a2.y, b1.y, b2.y);
            if (overlap > 12 && gap < 7) found = true;
          }
        }
      }
      if (found) {
        out.push({
          id: `overlap-${i}-${j}`,
          pipeIds: [A.pipe.id, B.pipe.id],
          titleZh: "管路视觉重合",
          titleEn: "Pipes visually overlap",
          messageZh: `${A.pipe.label} 与 ${B.pipe.label} 平行/共线过近；可点“整理管路”重新布线，或手动拉开。`,
          messageEn: `${A.pipe.label} and ${B.pipe.label} run too close or overlap; use "Tidy pipes" or offset manually.`,
        });
      }
    }
  }
  return out;
}
