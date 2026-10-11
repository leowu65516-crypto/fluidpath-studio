/**
 * v1.30 导出文字增强（分类放大 / 描边 / 底板 / 拖拽偏移 / 逐条改字）测试：
 * - 修复回归：节点/管路标签带 data-ui="1"，导出克隆剥离 UI 元素时必须保留它们；
 * - 分类缩放互不干扰（管路/阀门/元器件/开关/图例/自定义文字）；
 * - 描边加强（光晕）只作用于被放大的文字；白色底板按需插入；
 * - offsets：管路三段（label/anno/fluid）独立偏移；徽标整组偏移（按节点旋转逆变换）；
 * - overrides：节点标签/管路标签/徽标分段逐条改字（仅导出物）；
 * - 分类倍率与全局 textScale 相乘。
 */
import { describe, it, expect } from "vitest";
import { buildExportSVGWithOptions, prepareExportDiagram, EXPORT_DEFAULTS, type ExportOptions, type ExportTextEnhance } from "../export";
import { parseDiagramJSON } from "../export";
import type { Diagram } from "../types";
import bcmtsRaw from "../../BCMTS.json";

function bcmts(): Diagram {
  return parseDiagramJSON(JSON.stringify(bcmtsRaw));
}

function baseOpts(over: Partial<ExportOptions> = {}): ExportOptions {
  return { ...EXPORT_DEFAULTS, format: "png", lang: "zh", filename: "test", ...over };
}

function textOver(over: Partial<ExportTextEnhance>): ExportTextEnhance {
  return { scales: {}, halo: true, plates: false, offsets: {}, overrides: {}, sizes: {}, ...over };
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
  // 管路三段：主标签 / 标注 / 介质（均带 data-ui / data-pipe-id）
  text({ "data-pipe-id": "p1", "data-ui": "1", x: "150", y: "80", "font-size": "11" }, "管路 1 · DN25");
  text({ class: "fp-pipe-annotation", "data-pipe-id": "p1", x: "150", y: "88", "font-size": "10.5" }, "M1");
  text({ class: "fp-fluid-label", "data-pipe-id": "p1", x: "150", y: "95", "font-size": "9.5" }, "冷水");
  // 开关状态徽标（位于带旋转的节点组内）
  {
    const ng = document.createElementNS(NS, "g");
    ng.setAttribute("data-node-id", "n1");
    ng.setAttribute("transform", "translate(100 60) rotate(0 39 37)");
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
      text: textOver({ scales: { valves: 2, pipes: 1.5, switches: 2, legend: 1.5, custom: 1 } }),
    }));
    // 阀门 13*2=26；元器件 14 不变；管路主标签 11*1.5=16.5；标注 10.5*1.5=15.8；介质 9.5*1.5=14.3；徽标 10*2=20；图例 15*1.5=22.5；自定义 27 不变
    expect(svg).toContain('font-size="26"');
    expect(svg).toContain('font-size="16.5"');
    expect(svg).toContain('font-size="15.8"');
    expect(svg).toContain('font-size="14.3"');
    expect(svg).toContain('font-size="20"');
    expect(svg).toContain('font-size="22.5"');
    expect(svg).toContain('font-size="27"');
    expect(svg).toContain('font-size="14"'); // 元器件未放大
  });

  it("描边加强只作用于被放大的文字；白色底板按需插入", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({
      text: textOver({ scales: { valves: 2, pipes: 1.5, switches: 2, legend: 1.5 }, halo: true, plates: true }),
    }));
    const haloCount = (svg.match(/paint-order: stroke/g) || []).length;
    const plateCount = (svg.match(/fill-opacity="0.72"/g) || []).length;
    expect(haloCount).toBe(6); // 阀门 + 管路三段 + 徽标 + 图例
    expect(plateCount).toBeGreaterThanOrEqual(6);
  });

  it("管路三段（主标签/标注/介质）偏移互相独立", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({
      text: textOver({ offsets: { "pipe:p1:label": { x: 10, y: 0 }, "pipe:p1:anno": { x: 0, y: 20 }, "pipe:p1:fluid": { x: -5, y: 0 } } }),
    }));
    expect(svg).toMatch(/x="160"[^>]*font-size="11"/s); // 主标签 150+10
    expect(svg).toContain('y="108"'); // 标注 88+20
    expect(svg).toContain('x="145"'); // 介质 150-5
  });

  it("徽标整组拖拽：按节点旋转逆变换写入局部 transform", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({
      text: textOver({ offsets: { "node:n1:badge": { x: 30, y: -10 } } }),
    }));
    expect(svg).toContain('transform="translate(30 -10)"');
  });

  it("逐条修改文字内容（节点标签/管路标签/徽标分段），仅导出物生效", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({
      text: textOver({ overrides: { "node:n1": "新的阀名", "pipe:p1:label": "主咖啡管", "node:n1:badge:0": "甲" } }),
    }));
    expect(svg).toContain("新的阀名");
    expect(svg).toContain("主咖啡管");
    expect(svg).toContain("甲");
    expect(svg).not.toContain("三通电磁阀");
    // 画布原文字不受影响（零污染）
    expect(svgEl.textContent).toContain("三通电磁阀");
  });

  it("分类倍率与全局 textScale 相乘", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({ textScale: 2, text: textOver({ scales: { valves: 2 } }) }));
    expect(svg).toContain('font-size="52"'); // 13*2*2
  });

  it("逐条文字大小：sizes 覆盖分类倍率（绝对字号）", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({
      text: textOver({ scales: { valves: 2 }, sizes: { "node:n1": 30, "pipe:p1:label": 21 } }),
    }));
    expect(svg).toContain('font-size="30"'); // 阀门绝对 30（非 13*2=26）
    expect(svg).toContain('font-size="21"'); // 管路标签绝对 21
    expect(svg).not.toContain('font-size="26"');
  });

  it("新增自定义文字：extraTexts 渲染、偏移键 export:ex_<id> 生效", () => {
    const d = bcmts();
    const svgEl = makeSvgEl();
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({
      extraTexts: [{ id: "ut1", text: "测试文字", x: 500, y: 300, size: 24 }],
      text: textOver({ offsets: { "export:ex_ut1": { x: 12, y: 0 } } }),
    }));
    expect(svg).toContain("测试文字");
    expect(svg).toMatch(/x="512"/); // 500 + 12
    expect(svg).toContain('font-size="24"');
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

  it("附加节点 id 稳定（ex_title / ex_legend_0）；extraTexts 生成 ex_<id> 且坐标为中心点", () => {
    const d = bcmts();
    const { extra } = prepareExportDiagram(d, baseOpts({
      title: "标题", legend: { fluid: true, diameter: false, status: false },
      extraTexts: [{ id: "ut1", text: "自由文字", x: 500, y: 300, size: 24 }],
    }));
    expect(extra.some((n) => n.id === "ex_title")).toBe(true);
    expect(extra.some((n) => n.id === "ex_legend_0")).toBe(true);
    const n1 = extra.find((n) => n.id === "ex_ut1");
    expect(n1).toBeTruthy();
    expect(n1!.label).toBe("自由文字");
    expect(n1!.fontSize).toBe(24);
    // 文字中心 = (500, 300)：渲染 x = n.x + w/2，y = n.y + h/2 + fs/3
    expect(n1!.x + (n1!.width ?? 0) / 2).toBeCloseTo(500, 5);
    expect(n1!.y + (n1!.height ?? 24) / 2 + 24 / 3).toBeCloseTo(300, 5);
  });
});
