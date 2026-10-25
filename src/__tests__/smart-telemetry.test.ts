import { beforeEach, describe, expect, it } from "vitest";
import { readSmartTelemetry, resetSmartTelemetry, smartTelemetryKey, trackSmart } from "../smart-draw/telemetry";

beforeEach(() => resetSmartTelemetry());

describe("智能绘图本地埋点", () => {
  it("按事件+属性聚合计数，属性顺序稳定", () => {
    trackSmart("template_select", { template: "milk" });
    trackSmart("template_select", { template: "milk" });
    trackSmart("template_select", { template: "coffee" });
    const stats = readSmartTelemetry();
    expect(stats["template_select|template=milk"]).toBe(2);
    expect(stats["template_select|template=coffee"]).toBe(1);
    expect(smartTelemetryKey("a", { b: 2, a: 1 })).toBe("a|a=1|b=2");
  });

  it("未命中词单独计数，便于扩词典", () => {
    trackSmart("intent_miss", { text: "奶路旁通" });
    expect(readSmartTelemetry()["intent_miss|text=奶路旁通"]).toBe(1);
  });
});
