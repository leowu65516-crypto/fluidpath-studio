/**
 * v1.30 导出文字增强（分类放大 / 描边 / 底板 / 拖拽偏移）测试：
 * - 修复回归：节点/管路标签带 data-ui="1"，导出克隆剥离 UI 元素时必须保留它们；
 * - 分类缩放互不干扰（管路/阀门/元器件/开关/图例/自定义文字）；
 * - 描边加强（光晕）只作用于被放大的文字；白色底板按需插入；
 * - offsets 拖拽偏移按元素 key 生效；分类倍率与全局 textScale 相乘。
 */
import { describe, it, expect } from "vitest";
import { buildExportSVGWithOptions, prepareExportDiagram, EXPORT_DEFAULTS, type ExportOptions } from "../export";
import { parseDiagramJSON } from "../export";
import type { Diagram } from "../types";
import bcmtsRaw from "../../BCMTS.json";

function bcmts(): Diagram {
  return parseDiagramJSON(JSON.stringify(bcmtsRaw));
}

function baseOpts(over: Partial<ExportOptions> = {}): ExportOptions {
  return { ...EXPORT_DEFAULTS, format: "png", lang: "zh", filename: "test", ...over };
}

/** 构造最小画布 SVG：注入带身份标记的文字元素（模拟 CanvasView/PipeView 渲染） */
function makeSvgEl(): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "main-canvas");
  const world = document.createElementNS(NS, "g");
  world.setAttribute("data-world", "1");
  const text = (attrs: Record<string, string>, content: string, parent: SVGGElement = world) => {
    const t = document.createElementNS(NS, "text");
    for (const [k, v] of Object.entries(attrs)) t.setAttribute(k, v);
    t.textContent = content;
    parent.appendChild(t);
    return t;
  };
  // 阀门标签（solenoid3，带 data-ui 模拟真实画布）
  text({ class: "fp-node-label", "data-node-id": "n1", "data-node-kind": "solenoid3", "data-ui": "1", x: "100", y: "60", "font-size": "13" }, "三通电磁阀");
  // 元器件标签（pump）
  text({ class: "fp-node-label", "data-node-id": "n2", "data-node-kind": "pump", "data-ui": "1", x: "200", y: "60", "font-size": "14" }, "水泵");
  // 管路主标签（带 data-ui）
  text({ "data-pipe-id": "p1", "data-ui": "1", x: "150", y: "80", "font-size": "11" }, "管路 1 · DN25");
  // 介质标签（fp-fluid-label）
  text({ class: "fp-fluid-label", "data-pipe-id": "p1", x: "150", y: "95", "font-size": "9.5" }, "冷水");
  // 开关状态徽标（位于节点组内）
  {
    const ng = document.createElementNS(NS, "g");
    ng.setAttribute("data-node-id", "n1");
    const bg = document.createElementNS(NS, "g");
    bg.setAttribute("class", "fp-state-badge");
    text({ x: "10", y: "14", "font-size": "10" }, "A", bg);
    ng.appendChild(bg);
    world.appendChild(ng);
  }
  // 图例 / 自定义文字（导出管线追加）
  text({ "data-export-kind": "legend", "data-export-node-id": "lg1", x: "400", y: "60", "font-size": "15" }, "图例");
  text({ "data-export-kind": "custom", "data-export-node-id": "c1", x: "400", y: "90", "font-size": "27" }, "标题");
  svg.appendChild(world);
  document.body.appendChild(svg);
  return svg;
}

describe("导出文字增强（v1.30）", () => {
  it("回归修复：带 data-ui 的节点/管路标签在导出克隆中保留", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts());
    expect(svg).toContain("三通电磁阀");
    expect(svg).toContain("管路 1 · DN25");
  });

  it("分类放大互不干扰：阀门/管路/开关/图例各自生效，元器件不动", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({
      text: { scales: { valves: 2, pipes: 1.5, switches: 2, legend: 1.5, custom: 1 }, halo: true, plates: false, offsets: {} },
    }));
    // 阀门 13*2=26；元器件 14 不变；管路主标签 11*1.5=16.5；介质 9.5*1.5=14.3；徽标 10*2=20；图例 15*1.5=22.5；自定义 27 不变
    expect(svg).toContain('font-size="26"');
    expect(svg).toContain('font-size="16.5"');
    expect(svg).toContain('font-size="14.3"');
    expect(svg).toContain('font-size="20"');
    expect(svg).toContain('font-size="22.5"');
    expect(svg).toContain('font-size="27"');
    expect(svg).toContain('font-size="14"'); // 元器件未放大
    expect(svg).not.toContain('font-size="42"');
  });

  it("描边加强只作用于被放大的文字；白色底板按需插入", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({
      text: { scales: { valves: 2, pipes: 1.5, switches: 2, legend: 1.5 }, halo: true, plates: true, offsets: {} },
    }));
    const haloCount = (svg.match(/paint-order: stroke/g) || []).length;
    const plateCount = (svg.match(/fill-opacity="0.72"/g) || []).length;
    expect(haloCount).toBe(5); // 阀门 + 管路主标签 + 介质 + 徽标 + 图例（都放大）
    expect(plateCount).toBeGreaterThanOrEqual(5);
  });

  it("拖拽偏移按元素 key 生效（节点标签 x/y 平移）", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({
      text: { scales: { valves: 1.5 }, halo: true, plates: false, offsets: { "node:n1": { x: 50, y: -30 } } },
    }));
    // 阀门标签：x 100+50=150，y 60-30=30
    expect(svg).toMatch(/x="150"[^>]*font-size="19.5"/s);
    expect(svg).toContain('y="30"');
  });

  it("分类倍率与全局 textScale 相乘", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({ textScale: 2, text: { scales: { valves: 2 }, halo: true, plates: false, offsets: {} } }));
    expect(svg).toContain('font-size="52"'); // 13*2*2
  });
});

describe("prepareExportDiagram 附加节点分类标记", () => {
  it("自定义文字层标 custom，图例标 legend", () => {
    const d = bcmts();
    const { extra } = prepareExportDiagram(d, baseOpts({
      title: "标题", legend: { fluid: true, diameter: false, status: true },
    }));
    const custom = extra.filter((n) => n.exportKind === "custom");
    const legend = extra.filter((n) => n.exportKind === "legend");
    expect(custom.map((n) => n.label)).toContain("标题");
    expect(legend.length).toBeGreaterThan(0);
  });
});
