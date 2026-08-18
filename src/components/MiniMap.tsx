import { useMemo, useRef } from "react";
import type { Diagram } from "../types";
import { nodeBBox, pipePolyline, polylineBBox } from "../geometry";

const MM_W = 176;
const MM_H = 116;
const PAD = 8;

interface Props {
  diagram: Diagram;
  zoom: number;
  panX: number;
  panY: number;
  viewW: number;
  viewH: number;
  onNavigate: (worldX: number, worldY: number) => void;
}

/** 画布缩略图导航：右下角小地图，点击/拖拽跳转 */
export function MiniMap({ diagram, zoom, panX, panY, viewW, viewH, onNavigate }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number; moved: boolean } | null>(null);

  // 计算内容范围（节点 + 管路）
  const content = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of diagram.nodes) {
      const bb = nodeBBox(n);
      minX = Math.min(minX, bb.x); minY = Math.min(minY, bb.y);
      maxX = Math.max(maxX, bb.x + bb.w); maxY = Math.max(maxY, bb.y + bb.h);
    }
    for (const p of diagram.pipes) {
      const pts = pipePolyline(p, diagram.nodes);
      if (pts) {
        const bb = polylineBBox(pts);
        minX = Math.min(minX, bb.x); minY = Math.min(minY, bb.y);
        maxX = Math.max(maxX, bb.x + bb.w); maxY = Math.max(maxY, bb.y + bb.h);
      }
    }
    if (!isFinite(minX)) return null;
    const w = maxX - minX + PAD * 2;
    const h = maxY - minY + PAD * 2;
    return { x: minX - PAD, y: minY - PAD, w, h };
  }, [diagram]);

  if (!content) return null;
  // jsdom/极小容器兜底
  const vw = viewW > 0 ? viewW : 800;
  const vh = viewH > 0 ? viewH : 600;
  const c = content;

  const scale = Math.min(MM_W / c.w, MM_H / c.h);
  const ox = (MM_W - c.w * scale) / 2;
  const oy = (MM_H - c.h * scale) / 2;
  const toMM = (wx: number, wy: number) => ({
    x: ox + (wx - c.x) * scale,
    y: oy + (wy - c.y) * scale
  });

  // 可视视口（世界坐标）→ 缩略图矩形
  const viewWorld = {
    x: -panX / zoom,
    y: -panY / zoom,
    w: vw / zoom,
    h: vh / zoom
  };
  const vp = {
    x: ox + (viewWorld.x - c.x) * scale,
    y: oy + (viewWorld.y - c.y) * scale,
    w: viewWorld.w * scale,
    h: viewWorld.h * scale
  };

  function worldFromMouse(e: React.MouseEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * MM_W;
    const my = ((e.clientY - rect.top) / rect.height) * MM_H;
    return {
      x: c.x + (mx - ox) / scale,
      y: c.y + (my - oy) / scale
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = svgRef.current!.getBoundingClientRect();
    // 点击视口内 → 拖拽平移；视口外 → 跳转
    const mx = ((e.clientX - rect.left) / rect.width) * MM_W;
    const my = ((e.clientY - rect.top) / rect.height) * MM_H;
    if (mx >= vp.x && mx <= vp.x + vp.w && my >= vp.y && my <= vp.y + vp.h) {
      dragRef.current = { startX: mx, startY: my, startPanX: panX, startPanY: panY, moved: false };
    } else {
      const w = worldFromMouse(e);
      onNavigate(w.x, w.y);
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const d = dragRef.current;
    if (!d) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * MM_W;
    const my = ((e.clientY - rect.top) / rect.height) * MM_H;
    const dx = (mx - d.startX) / scale;
    const dy = (my - d.startY) / scale;
    onNavigate(d.startPanX - dx * zoom, d.startPanY - dy * zoom);
  }

  function onMouseUp() {
    dragRef.current = null;
  }

  return (
    <div className="minimap" data-ui="1">
      <svg
        ref={svgRef}
        width={MM_W}
        height={MM_H}
        viewBox={`0 0 ${MM_W} ${MM_H}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => (dragRef.current = null)}
      >
        {/* 底 */}
        <rect x={0} y={0} width={MM_W} height={MM_H} fill="var(--surface)" opacity={0.5} rx={4} />
        {/* 管路 */}
        {diagram.pipes.map((p) => {
          const pts = pipePolyline(p, diagram.nodes);
          if (!pts) return null;
          const d = pts.map((pt, i) => {
            const m = toMM(pt.x, pt.y);
            return `${i === 0 ? "M" : "L"} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`;
          }).join(" ");
          return <path key={p.id} d={d} fill="none" stroke={p.fluidColor} strokeWidth={1} opacity={0.85} />;
        })}
        {/* 节点 */}
        {diagram.nodes.map((n) => {
          const bb = nodeBBox(n);
          const a = toMM(bb.x, bb.y);
          const w = bb.w * scale;
          const h = bb.h * scale;
          return (
            <rect
              key={n.id}
              x={a.x}
              y={a.y}
              width={Math.max(1.5, w)}
              height={Math.max(1.5, h)}
              fill={n.fill === "#00000000" ? "transparent" : n.fill}
              stroke={n.stroke}
              strokeWidth={0.8}
              rx={1}
              opacity={n.disabled ? 0.4 : 1}
            />
          );
        })}
        {/* 视口框 */}
        <rect
          x={vp.x}
          y={vp.y}
          width={Math.max(8, vp.w)}
          height={Math.max(6, vp.h)}
          fill="#2f7fd6"
          fillOpacity={0.12}
          stroke="#2f7fd6"
          strokeWidth={1.2}
          rx={2}
          style={{ cursor: "grab" }}
        />
      </svg>
    </div>
  );
}
