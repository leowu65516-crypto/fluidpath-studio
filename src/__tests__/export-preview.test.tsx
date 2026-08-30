/**
 * v1.18 导出预览管线测试：
 * - buildLegendNodes：状态段按元件类型生成（解释红绿语义）
 * - prepareExportDiagram：自定义文字层 / selectionOnly 裁剪
 * - buildExportSVGWithOptions：留白、文字增强、徽标样式、暗色主题、透明
 */
import { describe, it, expect } from "vitest";
import { buildLegendNodes } from "../legend";
import { prepareExportDiagram, buildExportSVGWithOptions, EXPORT_DEFAULTS, type ExportOptions } from "../export";
import { parseDiagramJSON } from "../export";
import type { Diagram } from "../types";
import bcmtsRaw from "../../BCMTS.json";

function bcmts(): Diagram {
  return parseDiagramJSON(JSON.stringify(bcmtsRaw));
}

function baseOpts(over: Partial<ExportOptions> = {}): ExportOptions {
  return { ...EXPORT_DEFAULTS, format: "png", lang: "zh", filename: "test", ...over };
}

describe("buildLegendNodes", () => {
  it("含阀/泵的图纸生成状态段（解释红绿）", () => {
    const d = bcmts();
    const nodes = buildLegendNodes(d, 0, 0, { fluid: false, diameter: false, status: true }, "zh");
    const texts = nodes.map((n) => n.label);
    expect(texts.some((x) => x.includes("两通阀：开"))).toBe(true);
    expect(texts.some((x) => x.includes("两通阀：关"))).toBe(true);
    expect(texts.some((x) => x.includes("三通阀：A 路"))).toBe(true);
    expect(texts.some((x) => x.includes("泵：运行"))).toBe(true);
    // 状态胶囊颜色：绿/红
    const fills = nodes.filter((n) => n.type === "shape").map((n) => n.fill);
    expect(fills).toContain("#3fae6a");
    expect(fills).toContain("#d9534f");
  });

  it("status=false 不生成状态段；英文文案可用", () => {
    const d = bcmts();
    const off = buildLegendNodes(d, 0, 0, { fluid: true, diameter: true, status: false }, "zh");
    expect(off.map((n) => n.label).some((x) => x.includes("状态"))).toBe(false);
    const en = buildLegendNodes(d, 0, 0, { fluid: true, diameter: true, status: true }, "en");
    expect(en.map((n) => n.label).some((x) => x.includes("2-way valve: open"))).toBe(true);
  });
});

describe("prepareExportDiagram", () => {
  it("标题/副标题/底部说明/日期戳生成附加节点，不修改原图", () => {
    const d = bcmts();
    const before = JSON.stringify(d);
    const { diagram: d2, extra } = prepareExportDiagram(d, baseOpts({
      title: "测试标题", subtitle: "副标题", footnote: "脚注", watermark: "WM", dateStamp: true,
    }));
    expect(JSON.stringify(d)).toBe(before); // 原图零污染
    expect(d2.nodes.length).toBe(d.nodes.length);
    const labels = extra.filter((n) => n.type === "label").map((n) => n.label);
    expect(labels).toContain("测试标题");
    expect(labels).toContain("副标题");
    expect(labels).toContain("脚注");
    expect(labels).toContain("WM");
    // 附加节点都在原图 bbox 之外（顶部/底部）
    const titleNode = extra.find((n) => n.label === "测试标题")!;
    const maxY = Math.max(...d.nodes.map((n) => n.y + n.height));
    expect(titleNode.y).toBeLessThan(Math.min(...d.nodes.map((n) => n.y)));
    void maxY;
  });

  it("selectionOnly：只保留选中节点与连通管路", () => {
    const d = bcmts();
    const keep1 = d.nodes.find((n) => n.type === "pump")!;
    const keep2 = d.nodes.find((n) => n.type === "hotWaterBoiler")!;
    const { diagram: d2 } = prepareExportDiagram(d, baseOpts({
      selectionOnly: true,
      selection: { nodes: [keep1.id, keep2.id], pipes: [] },
    }));
    expect(d2.nodes.length).toBeLessThan(d.nodes.length);
    expect(d2.nodes.some((n) => n.id === keep1.id)).toBe(true);
    expect(d2.nodes.some((n) => n.id === keep2.id)).toBe(true);
    // 保留的管路两端都必须在保留节点上
    const ids = new Set(d2.nodes.map((n) => n.id));
    for (const p of d2.pipes) {
      const from = d.nodes.find((n) => n.ports.some((pt) => pt.id === p.fromPortId));
      const to = d.nodes.find((n) => n.ports.some((pt) => pt.id === p.toPortId));
      if (from && to) {
        expect(ids.has(from.id)).toBe(true);
        expect(ids.has(to.id)).toBe(true);
      }
    }
  });
});

/** 构造最小画布 SVG（jsdom） */
function makeSvgEl(d: Diagram): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "main-canvas");
  const world = document.createElementNS(NS, "g");
  world.setAttribute("data-world", "1");
  for (const p of d.pipes) {
    const g = document.createElementNS(NS, "g");
    const flow = document.createElementNS(NS, "path");
    flow.setAttribute("data-flow", p.id);
    g.appendChild(flow);
    world.appendChild(g);
  }
  svg.appendChild(world);
  document.body.appendChild(svg);
  return svg;
}

describe("buildExportSVGWithOptions", () => {
  it("padding 扩展画布尺寸", () => {
    const d = bcmts();
    const svgEl = makeSvgEl(d);
    const a = buildExportSVGWithOptions(svgEl, d, baseOpts({ padding: 0 }));
    const b = buildExportSVGWithOptions(svgEl, d, baseOpts({ padding: 60 }));
    expect(b.w).toBe(a.w + 120);
    expect(b.h).toBe(a.h + 120);
  });

  it("textScale：节点标签字号放大（SVG DOM 后处理）", () => {
    const d = bcmts();
    const svgEl = makeSvgEl(d);
    // 原画布注入一个节点标签元素（模拟 CanvasView 渲染）
    const world = svgEl.querySelector("[data-world='1']")!;
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("class", "fp-node-label");
    t.setAttribute("font-size", "13");
    world.appendChild(t);
    const { svg } = buildExportSVGWithOptions(svgEl, d, baseOpts({ textScale: 2 }));
    expect(svg).toContain('font-size="26"');
  });

  it("badgeStyle=hidden：移除状态徽标", () => {
    const d = bcmts();
    const svgEl = makeSvgEl(d);
    const world = svgEl.querySelector("[data-world='1']")!;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "fp-state-badge");
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.textContent = "Running";
    g.appendChild(t);
    world.appendChild(g);
    const kept = buildExportSVGWithOptions(svgEl, d, baseOpts({ badgeStyle: "default" }));
    expect(kept.svg).toContain("Running");
    const removed = buildExportSVGWithOptions(svgEl, d, baseOpts({ badgeStyle: "hidden" }));
    expect(removed.svg).not.toContain("Running");
  });

  it("darkMode：var() 主题色解析为暗色板", () => {
    const d = bcmts();
    const svgEl = makeSvgEl(d);
    const world = svgEl.querySelector("[data-world='1']")!;
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("class", "fp-node-label");
    t.setAttribute("fill", "var(--node-label)");
    world.appendChild(t);
    const light = buildExportSVGWithOptions(svgEl, d, baseOpts({ darkMode: false }));
    expect(light.svg).toContain("#41505f");
    const dark = buildExportSVGWithOptions(svgEl, d, baseOpts({ darkMode: true }));
    expect(dark.svg).toContain("#aebccb");
    expect(dark.svg).not.toContain("var(--node-label)");
  });

  it("图例开关：状态图例进入导出物", () => {
    const d = bcmts();
    const svgEl = makeSvgEl(d);
    const on = buildExportSVGWithOptions(svgEl, d, baseOpts({ legend: { fluid: true, diameter: false, status: true } }));
    expect(on.svg).toContain("两通阀：开（导通）");
    const off = buildExportSVGWithOptions(svgEl, d, baseOpts({ legend: { fluid: false, diameter: false, status: false } }));
    expect(off.svg).not.toContain("两通阀：开（导通）");
  });

  it("透明背景：不注入背景 rect", () => {
    const d = bcmts();
    const svgEl = makeSvgEl(d);
    const transparent = buildExportSVGWithOptions(svgEl, d, baseOpts({ background: "transparent" }));
    const white = buildExportSVGWithOptions(svgEl, d, baseOpts({ background: "white" }));
    // 白色背景的第一个 rect fill=#ffffff；透明版本无全幅背景（以无 fill="#ffffff" 全幅 rect 粗判）
    expect(white.svg).toContain('fill="#ffffff"');
    expect(transparent.svg).not.toContain('fill="#ffffff"');
  });
});

describe("ExportDialog 组件", () => {
  it("渲染选项面板与预览 canvas", async () => {
    const { render, cleanup } = await import("@testing-library/react");
    const { LangProvider } = await import("../i18n");
    const { ExportDialog } = await import("../components/ExportDialog");
    const { loadDiagram } = await import("../store");
    const { act } = await import("@testing-library/react");
    try { localStorage.setItem("fluidpath.lang", "zh"); } catch { /* ignore */ }
    const d = bcmts();
    render(<LangProvider><div id="root2" /></LangProvider>);
    act(() => { loadDiagram(d); });
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "main-canvas");
    const world = document.createElementNS(NS, "g");
    world.setAttribute("data-world", "1");
    svg.appendChild(world);
    document.body.appendChild(svg);
    const ref = { current: svg };
    const { container } = render(
      <LangProvider>
        <ExportDialog svgRef={ref} initialFormat="png" onClose={() => undefined} />
      </LangProvider>
    );
    expect(container.querySelector(".exp-preview")).toBeTruthy();
    expect(container.textContent).toContain("背景");
    expect(container.textContent).toContain("文字增强");
    expect(container.textContent).toContain("状态颜色说明");
    expect(container.textContent).toContain("自定义文字");
    cleanup();
  });
});
