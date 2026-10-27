/**
 * 管路流动动画的公共参数层。
 *
 * 为什么要有这一层：画布（CanvasView 的 rAF 循环）与三条导出链路（GIF / 场景 GIF / 逐帧渲染）
 * 原先各自复制了一份「虚线节距 / 速度 / 周期取整」的计算，任何视觉改动都会三处漂移。
 * 这里只负责**纯视觉**参数，绝不参与工程判定（停流仍由 geometry.pipeEffectiveDisabled 决定）。
 */
import type { Pipe } from "./types";

export type FlowLayer = "body" | "head" | "particle";

/** 粒子层（原有白色短虚线）的节距参数，保持历史数值不变，避免老图纸观感突变。 */
export function flowDashPattern(pipe: Pick<Pipe, "visualDiameter" | "particleDensity">): {
  dashLen: number;
  gapMul: number;
  period: number;
} {
  const dashLen = Math.max(6, pipe.visualDiameter * 1.5);
  const gapMul = pipe.particleDensity === "high" ? 1.1 : pipe.particleDensity === "medium" ? 2.1 : 3.6;
  return { dashLen, gapMul, period: dashLen + Math.round(dashLen * gapMul) };
}

/** 流速 → 像素速度（与历史实现一致：26 + flowSpeed×58，再乘全局速度滑杆） */
export function flowSpeedPx(pipe: Pick<Pipe, "flowSpeed">, flowScale = 1): number {
  return (26 + pipe.flowSpeed * 58) * flowScale;
}

export interface FlowComet {
  /** 彗星周期（拖尾 + 间隔），取粒子周期的整数倍，保证循环无缝 */
  cycle: number;
  /** 拖尾本体长度 */
  bodyLen: number;
  /** 头部高光长度 */
  headLen: number;
  /** 头部相对本体的相位差（本体与头部共用 base 偏移 + 该差值） */
  headLag: number;
  bodyDash: string;
  headDash: string;
  particleDash: string;
}

/**
 * 彗星拖尾参数：本体是长虚线，头部是短高光，两者共用同一个循环周期。
 * 全部取整数像素，GIF 逐帧推进时用「整数个周期」即可无缝衔接。
 */
export function flowComet(pipe: Pick<Pipe, "visualDiameter" | "particleDensity">): FlowComet {
  const { dashLen, period } = flowDashPattern(pipe);
  const cycle = period * 2;
  const bodyLen = Math.max(6, Math.round(period * 0.62));
  const headLen = Math.max(3, Math.round(dashLen * 0.5));
  const bodyDash = `${bodyLen} ${cycle - bodyLen}`;
  const headDash = `${headLen} ${cycle - headLen}`;
  return {
    cycle,
    bodyLen,
    headLen,
    headLag: bodyLen - headLen,
    bodyDash,
    headDash,
    particleDash: `${dashLen} ${Math.round(dashLen * (pipe.particleDensity === "high" ? 1.1 : pipe.particleDensity === "medium" ? 2.1 : 3.6))}`,
  };
}

/** 某一层的循环周期：导出时按层取整，避免 GIF 循环接缝 */
export function flowLayerPeriod(pipe: Pick<Pipe, "visualDiameter" | "particleDensity">, layer: FlowLayer): number {
  if (layer === "particle") return flowDashPattern(pipe).period;
  return flowComet(pipe).cycle;
}

/** 头部相对本体的偏移差（已带方向符号） */
export function flowHeadOffsetDelta(pipe: Pick<Pipe, "visualDiameter" | "particleDensity">, dir: number): number {
  return -dir * flowComet(pipe).headLag;
}

/**
 * 导出用：把某一层换算成「整数个周期」的循环位移。
 * 取整是 GIF 无缝循环的前提；头部再叠加固定相位差，保证头部始终在拖尾前端。
 */
export function flowExportEntry(
  pipe: Pick<Pipe, "visualDiameter" | "particleDensity" | "flowSpeed" | "direction">,
  layer: FlowLayer,
  seconds: number
): { period: number; cyclePx: number; dir: number; lag: number } {
  const period = flowLayerPeriod(pipe, layer);
  const cycles = Math.max(1, Math.round((flowSpeedPx(pipe) * seconds) / period));
  const dir = pipe.direction === "forward" ? 1 : -1;
  const lag = layer === "head" ? -dir * flowComet(pipe).headLag : 0;
  return { period, cyclePx: cycles * period, dir, lag };
}

/** 拖尾颜色：按主题把介质色做对比派生，而不是直接用介质色（浅色介质会糊成一片） */
export function trailColor(fluidColor: string, dark: boolean): string {
  const rgb = parseColor(fluidColor);
  if (!rgb) return dark ? "#eaf2fb" : "#3d6f9e";
  const lum = luminance(rgb);
  let out: RGB;
  if (dark) {
    // 深色底：提亮但保留介质色相，并保证最低亮度可辨
    out = mix(rgb, { r: 255, g: 255, b: 255 }, 0.34);
    const l2 = luminance(out);
    if (l2 < 0.34) out = mix(out, { r: 255, g: 255, b: 255 }, Math.min(0.6, (0.34 - l2) / Math.max(0.05, 1 - l2)));
  } else {
    // 浅色底：深色介质轻提亮，浅色介质压深；幅度都收窄，避免把管子洗成奶白
    out = lum > 0.72 ? mix(rgb, { r: 12, g: 26, b: 42 }, 0.2) : mix(rgb, { r: 255, g: 255, b: 255 }, 0.2);
  }
  return `rgb(${Math.round(out.r)}, ${Math.round(out.g)}, ${Math.round(out.b)})`;
}

/** 头部高光：接近白但保留一点介质色，避免七种介质都用同一个死白 */
export function headColor(fluidColor: string, dark: boolean): string {
  const rgb = parseColor(fluidColor);
  if (!rgb) return dark ? "#ffffff" : "#ffffff";
  // 头部是「高光」而不是「更白的拖尾」：浅色介质反过来压深，否则浅底上看不见
  const base = luminance(rgb) > 0.78 && !dark
    ? mix(rgb, { r: 12, g: 26, b: 42 }, 0.28)
    : mix(rgb, { r: 255, g: 255, b: 255 }, 0.9);
  return `rgb(${Math.round(base.r)}, ${Math.round(base.g)}, ${Math.round(base.b)})`;
}

interface RGB { r: number; g: number; b: number }

function parseColor(input: string | undefined): RGB | null {
  if (!input) return null;
  const s = input.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
    }
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  const fn = s.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1].split(",").map((x) => Number(x.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return { r: parts[0], g: parts[1], b: parts[2] };
    }
  }
  return null;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** 相对亮度（WCAG 公式的简化版，用于决定提亮还是压深） */
export function luminance(c: RGB): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

/**
 * 判断画布底色是否偏暗。
 * 拖尾配色必须跟着**画布底色**走，而不是 UI 主题：图纸背景是用户自选的，
 * 深色主题下也完全可能是浅色画布（默认样例就是）。
 */
export function isDarkColor(color: string | undefined, fallback = false): boolean {
  const rgb = parseColor(color);
  if (!rgb) return fallback;
  return luminance(rgb) < 0.42;
}

/** 系统是否要求减弱动效（画布动画由 JS 驱动，不能只靠 CSS 媒体查询） */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
