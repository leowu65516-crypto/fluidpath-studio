/** 聚焦视图纯函数的不变量断言：元素居中、zoom 钳制、与返回值自洽 */
import { describe, expect, it } from "vitest";
import { computeFocusView } from "../store";

const rect = { x: 1919, y: 181, width: 74, height: 66 }; // 咖啡冲泡三通阀量级
const bigRect = { x: 0, y: 0, width: 600, height: 400 };

describe("computeFocusView", () => {
  it("元素中心落在视口中心（平移公式自洽）", () => {
    const v = computeFocusView(rect, { w: 1200, h: 800 }, 0.27);
    expect(v.panX).toBeCloseTo(600 - (rect.x + rect.width / 2) * v.zoom, 6);
    expect(v.panY).toBeCloseTo(400 - (rect.y + rect.height / 2) * v.zoom, 6);
  });

  it("小元素在低缩放下放大到可辨，且不越过 1", () => {
    // 66px 元件在 0.27 缩放下屏幕约 18px < 48px → 触发放大
    const v = computeFocusView(rect, { w: 1200, h: 800 }, 0.27);
    expect(v.zoom).toBeGreaterThan(0.27);
    expect(v.zoom).toBeLessThanOrEqual(1);
    expect(Math.min(rect.width, rect.height) * v.zoom).toBeGreaterThanOrEqual(48);
  });

  it("大元素保持当前缩放（不缩小也不放大）", () => {
    const v = computeFocusView(bigRect, { w: 1200, h: 800 }, 0.27);
    expect(v.zoom).toBe(0.27);
  });

  it("已可辨元素（≥48px 屏幕）不改变缩放", () => {
    const v = computeFocusView(rect, { w: 1200, h: 800 }, 0.9);
    expect(v.zoom).toBe(0.9);
  });

  it("zoom 钳制上界为 1（不会为小元素无限放大）", () => {
    const tiny = { x: 0, y: 0, width: 8, height: 8 };
    const v = computeFocusView(tiny, { w: 1200, h: 800 }, 0.1);
    expect(v.zoom).toBe(1);
  });
});
