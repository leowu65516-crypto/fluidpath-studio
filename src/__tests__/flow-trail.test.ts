import { describe, expect, it } from "vitest";
import { flowComet, flowDashPattern, flowExportEntry, flowHeadOffsetDelta, flowLayerPeriod, flowSpeedPx, headColor, trailColor } from "../flow";

const pipe = { visualDiameter: 10, particleDensity: "high" as const, flowSpeed: 1.5, direction: "forward" as const };

describe("管路流光参数", () => {
  it("粒子节距保持历史数值，老图纸观感不突变", () => {
    expect(flowDashPattern(pipe)).toEqual({ dashLen: 15, gapMul: 1.1, period: 32 });
    expect(flowDashPattern({ visualDiameter: 4, particleDensity: "low" })).toEqual({ dashLen: 6, gapMul: 3.6, period: 28 });
  });

  it("拖尾周期是粒子周期的整数倍，导出可无缝循环", () => {
    for (const density of ["high", "medium", "low"] as const) {
      for (const d of [3, 6, 10, 14]) {
        const p = { visualDiameter: d, particleDensity: density };
        const base = flowDashPattern(p).period;
        const comet = flowComet(p);
        expect(comet.cycle % base).toBe(0);
        expect(comet.bodyLen).toBeGreaterThan(0);
        expect(comet.headLen).toBeGreaterThanOrEqual(3);
        expect(comet.headLen).toBeLessThanOrEqual(comet.bodyLen);
        expect(comet.headLag).toBe(comet.bodyLen - comet.headLen);
      }
    }
  });

  it("三层各自的周期都为正，导出取整不会出现 0 帧", () => {
    for (const layer of ["body", "head", "particle"] as const) {
      const period = flowLayerPeriod(pipe, layer);
      expect(period).toBeGreaterThan(0);
      const cycles = Math.max(1, Math.round((flowSpeedPx(pipe) * 2) / period));
      expect(cycles * period).toBeGreaterThan(0);
    }
  });

  it("头部偏移带方向符号：反向流动时头部仍在流动前端", () => {
    expect(flowHeadOffsetDelta(pipe, 1)).toBeLessThan(0);
    expect(flowHeadOffsetDelta(pipe, -1)).toBeGreaterThan(0);
    expect(flowHeadOffsetDelta(pipe, 1)).toBe(-flowHeadOffsetDelta(pipe, -1));
  });

  it("拖尾色按主题做对比派生，而不是直接复用介质色", () => {
    const pale = "#d9e5ee"; // 蒸汽：浅色介质
    const dark = "#4a2c1a"; // 咖啡液：深色介质
    const lightPale = trailColor(pale, false);
    const lightDark = trailColor(dark, false);
    // 浅色介质在浅色主题下必须压深，深色介质则提亮
    expect(lightPale).not.toBe(`rgb(217, 229, 238)`);
    expect(lightDark).not.toBe(`rgb(74, 44, 26)`);
    // 深色主题下两者都要比原色更亮
    expect(trailColor(pale, true)).not.toBe(lightPale);
    // 头部应比拖尾更接近白
    expect(headColor(dark, false)).not.toBe(trailColor(dark, false));
  });

  it("非法颜色输入有兜底，不抛异常", () => {
    expect(trailColor("", false)).toMatch(/^#/);
    expect(trailColor("not-a-color", true)).toMatch(/^#/);
    expect(headColor("rgb(0, 120, 200)", false)).toMatch(/^rgb\(/);
  });
});

describe("导出链路复用同一套参数", () => {
  it("每层的循环位移都是自身周期的整数倍（GIF 首尾可无缝衔接）", () => {
    for (const layer of ["body", "head", "particle"] as const) {
      for (const seconds of [1, 2, 3.5]) {
        const e = flowExportEntry(pipe, layer, seconds);
        expect(e.cyclePx % e.period).toBe(0);
        expect(e.cyclePx).toBeGreaterThan(0);
      }
    }
  });

  it("头部相位差与画布一致，反向流动时方向相反", () => {
    const forward = flowExportEntry({ ...pipe, direction: "forward" }, "head", 2);
    const reverse = flowExportEntry({ ...pipe, direction: "reverse" }, "head", 2);
    expect(forward.lag).toBeLessThan(0);
    expect(reverse.lag).toBeGreaterThan(0);
    expect(forward.lag).toBe(-reverse.lag);
    expect(flowExportEntry(pipe, "body", 2).lag).toBe(0);
  });
});
