/**
 * 智能绘图的轻量本地埋点：localStorage 计数，不采集图纸内容、不联网。
 * 键格式：event|prop=value|prop=value
 */
const KEY = "fluidpath.smart.telemetry.v1";

export type SmartTelemetryProps = Record<string, string | number | boolean>;

function storage(): Storage | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

export function smartTelemetryKey(event: string, props: SmartTelemetryProps = {}): string {
  const parts = Object.entries(props)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`);
  return [event, ...parts].join("|");
}

export function trackSmart(event: string, props: SmartTelemetryProps = {}): void {
  const s = storage();
  if (!s) return;
  try {
    const all = readSmartTelemetry();
    const key = smartTelemetryKey(event, props);
    all[key] = (all[key] ?? 0) + 1;
    s.setItem(KEY, JSON.stringify(all));
  } catch { /* 存储满/禁用不影响主流程 */ }
}

export function readSmartTelemetry(): Record<string, number> {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    return out;
  } catch { return {}; }
}

export function resetSmartTelemetry(): void {
  try { storage()?.removeItem(KEY); } catch { /* ignore */ }
}

/** 便于在开发者工具里查看：__fluidpathSmartTelemetry() */
if (typeof window !== "undefined") {
  (window as unknown as { __fluidpathSmartTelemetry?: () => Record<string, number> }).__fluidpathSmartTelemetry = readSmartTelemetry;
}
