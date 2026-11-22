import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { CanvasView } from "../components/CanvasView";
import { createNode } from "../symbols";
import { buildAnimationFrameSVGs, buildExportSVGWithOptions, EXPORT_DEFAULTS } from "../export";
import {
  DEFAULT_PLATE_OPACITY,
  estimateTextWidth,
  measureLabelWidth,
  plateRect,
  resolveLabelPlate,
} from "../labelPlate";
import { loadDiagram, fitToScreen, store } from "../store";
import type { Diagram, DiagramNode } from "../types";
import bcmtsRaw from "../../BCMTS.json";

const toDiagram = (json: unknown): Diagram => JSON.parse(JSON.stringify(json)) as Diagram;

const diagramOf = (nodes: DiagramNode[]): Diagram => ({
  id: "label-plate-test",
  name: "Label plate",
  nodes,
  pipes: [],
  settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: false, crossoverHops: true },
});

describe("元器件名称底板（labelPlate）", () => {
  it("中文宽度按全角系数估算（jsdom 无真实字形度量时回退到全角估算法）", () => {
    const text = "咖啡冲泡三通电磁阀";
    const cjk = [...text].length;
    // 全角系数：每个汉字接近 1em（旧算法 n×13×0.62 会少算约 40%）
    expect(estimateTextWidth(text, 13)).toBeGreaterThanOrEqual(cjk * 13 * 0.98);
    expect(estimateTextWidth(text, 13)).toBeGreaterThan(text.length * 13 * 0.62);
    expect(measureLabelWidth(text, 13)).toBeGreaterThan(0);
    // 半角字符不能被当成全角
    expect(estimateTextWidth("ABCD", 13)).toBeLessThan(4 * 13 * 0.7);
  });

  it("底板宽度覆盖文字并留出左右内边距", () => {
    const text = "牛奶常温水润湿两通电磁阀";
    const fs = 13;
    const box = plateRect(text, fs, 200, 300);
    const textWidth = measureLabelWidth(text, fs);
    expect(box.width).toBeCloseTo(textWidth + 14, 5);
    expect(box.x).toBeCloseTo(200 - box.width / 2, 5);
    // 垂直方向要包住文字基线以上的字形高度
    expect(box.y).toBeLessThan(300);
    expect(box.y + box.height).toBeGreaterThan(300);
  });

  it("跟随全局 / 显式关闭 / 元件自定义 三种优先级", () => {
    const settings = { nodeLabelBackground: "#ffffff", nodeLabelBackgroundOpacity: 0.5 };
    // 1. 未设置 → 跟随全局
    expect(resolveLabelPlate({}, settings)).toEqual({ color: "#ffffff", opacity: 0.5 });
    // 2. 显式 none → 即使全局开启也不画底板
    expect(resolveLabelPlate({ labelBackground: "none" }, settings)).toBeNull();
    // 3. 元件自定义色 + 元件透明度优先
    expect(resolveLabelPlate({ labelBackground: "#fff3d0", labelBackgroundOpacity: 0.9 }, settings))
      .toEqual({ color: "#fff3d0", opacity: 0.9 });
    // 4. 全局未启用 → 无底板；默认透明度可回落到常量
    expect(resolveLabelPlate({}, {})).toBeNull();
    expect(resolveLabelPlate({ labelBackground: "#eeeeee" }, {})?.opacity).toBe(DEFAULT_PLATE_OPACITY);
  });
});

describe("画布显示开关：开/关徽标 与 A/B 通路徽标", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.removeItem("fluidpath.lang");
    const twoWay = createNode("solenoid2", 40, 40, "两通阀");
    const threeWay = createNode("solenoid3", 260, 40, "三通阀");
    loadDiagram(diagramOf([twoWay, threeWay]));
    fitToScreen(1200, 800);
  });

  const renderCanvas = () => {
    const ref = { current: null } as React.MutableRefObject<SVGSVGElement | null>;
    return render(<LangProvider><CanvasView svgRefOut={ref} /></LangProvider>).container;
  };

  it("默认同时显示开/关徽标与 A/B 通路徽标", () => {
    const container = renderCanvas();
    const badges = container.querySelectorAll("g.fp-state-badge");
    // 两通阀开/关 + 三通阀 A/B
    expect(badges.length).toBe(2);
  });

  it("关闭 A/B 通路徽标只隐藏通路字母，开/关徽标仍在", () => {
    const diagram = store.get().diagram;
    loadDiagram({ ...diagram, settings: { ...diagram.settings, showValvePathBadge: false } });
    fitToScreen(1200, 800);
    const container = renderCanvas();
    const badges = [...container.querySelectorAll("g.fp-state-badge")];
    expect(badges.length).toBe(1);
    // 剩下的是开/关徽标：里面含有可点击的阀位开关矩形与状态文字
    expect(badges[0].querySelectorAll("rect").length).toBeGreaterThan(1);
    expect(container.querySelectorAll("g.fp-state-badge title").length).toBe(0);
  });

  it("关闭开/关徽标后画布不再出现阀位文字", () => {
    const diagram = store.get().diagram;
    loadDiagram({ ...diagram, settings: { ...diagram.settings, showSwitchState: false } });
    fitToScreen(1200, 800);
    const container = renderCanvas();
    const badges = container.querySelectorAll("g.fp-state-badge");
    expect(badges.length).toBe(1); // 只剩三通阀的 A/B
    expect(container.querySelectorAll("g.fp-state-badge title").length).toBe(2);
  });

  it("图纸级名称底板会渲染，元件设 none 时单独关掉", () => {
    const diagram = store.get().diagram;
    const [twoWay, threeWay] = diagram.nodes;
    loadDiagram({
      ...diagram,
      nodes: diagram.nodes.map((n) => (n.id === threeWay.id ? { ...n, labelBackground: "none" } : n)),
      settings: { ...diagram.settings, nodeLabelBackground: "#ffffff" },
    });
    fitToScreen(1200, 800);
    const container = renderCanvas();
    expect(container.querySelectorAll(".fp-node-label-plate").length).toBe(1);
    expect(store.get().diagram.nodes.find((n) => n.id === twoWay.id)).toBeTruthy();
  });

  it("空名称不生成底板，关闭状态时包括符号内部状态", () => {
    const pulse = createNode("pulseAirValve", 500, 40, " ");
    const current = store.get().diagram;
    loadDiagram({ ...current, nodes: [...current.nodes, pulse], settings: { ...current.settings, nodeLabelBackground: "#ffffff", showSwitchState: false, showValvePathBadge: false } });
    fitToScreen(1200, 800);
    const container = renderCanvas();
    expect(container.querySelectorAll(".fp-state-badge")).toHaveLength(0);
    expect(container.querySelectorAll(".fp-node-label-plate")).toHaveLength(2);
  });

  it("导出预览在不放大时也添加底板，并即时切换工程符号", () => {
    const ref = { current: null } as React.MutableRefObject<SVGSVGElement | null>;
    render(<LangProvider><CanvasView svgRefOut={ref} /></LangProvider>);
    const opts = { ...EXPORT_DEFAULTS, format: "gif" as const, lang: "zh" as const, symbolProfile: "engineering" as const, text: { scales: {}, halo: true, plates: true, offsets: {}, overrides: {}, sizes: {} } };
    const staticSvg = buildExportSVGWithOptions(ref.current!, store.get().diagram, opts).svg;
    const animatedSvg = buildAnimationFrameSVGs(ref.current!, store.get().diagram, opts).svgs[0];
    for (const svg of [staticSvg, animatedSvg]) {
      expect(svg).toContain("fp-export-text-plate");
      expect(svg).toContain('data-symbol-feature="solenoid-coil"');
    }
  });
});

describe("GIF 预览帧与真实导出同算法", () => {
  it("buildAnimationFrameSVGs 为每条流动管路生成不同相位的帧", () => {
    localStorage.removeItem("fluidpath.lang");
    loadDiagram(toDiagram(bcmtsRaw));
    fitToScreen(1200, 800);
    const ref = { current: null } as React.MutableRefObject<SVGSVGElement | null>;
    render(<LangProvider><CanvasView svgRefOut={ref} /></LangProvider>);
    expect(ref.current).toBeTruthy();
    const out = buildAnimationFrameSVGs(ref.current as SVGSVGElement, store.get().diagram, {
      ...EXPORT_DEFAULTS,
      format: "gif",
      filename: "anim",
      background: "white",
      padding: 0,
      scale: 1,
      selectionOnly: false,
      selection: undefined,
      lang: "zh",
    });
    expect(out.svgs.length).toBe(14);
    expect(out.w).toBeGreaterThan(0);
    // 第一帧与后半循环帧内容不同（虚线相位推进）
    expect(out.svgs[0]).not.toBe(out.svgs[7]);
  });
});
