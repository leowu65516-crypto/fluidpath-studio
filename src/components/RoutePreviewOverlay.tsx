import type { Pt } from "../types";

/**
 * 整理预览层：把「重排全部」算出的新走线以虚线幽灵叠在画布上，
 * 用户确认后才真正写回 points。只读渲染，点不穿、不改任何数据。
 */
export function RoutePreviewOverlay({ routes, zoom }: { routes: Array<{ id: string; pts: Pt[] }>; zoom: number }) {
  if (!routes.length) return null;
  const dash = `${8 / Math.max(0.2, zoom)} ${6 / Math.max(0.2, zoom)}`;
  const width = 3 / Math.max(0.3, Math.min(1.6, zoom));
  return (
    <g className="route-preview" pointerEvents="none" data-ui="1" data-testid="route-preview">
      {routes.map((r) => (
        <path
          key={r.id}
          d={r.pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ")}
          fill="none"
          stroke="#2f7fd6"
          strokeOpacity={0.4}
          strokeWidth={width}
          strokeDasharray={dash}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}
