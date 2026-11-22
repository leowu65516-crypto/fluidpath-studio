import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CanvasView } from "../components/CanvasView";
import { LangProvider } from "../i18n";
import { createEmptyDiagram } from "../sample";
import { createNode } from "../symbols";
import { buildExportSVGWithOptions, prepareAnimationScene, EXPORT_DEFAULTS } from "../export";
import { fitToScreen, loadDiagram, store } from "../store";

afterEach(cleanup);
describe("export text preserves and adjusts diagram state", () => {
  it("keeps current sizes, exports multiline overrides and expands the view without mutating the diagram", () => {
    const d = createEmptyDiagram();
    const valve = createNode("solenoid2", 80, 100, "冲泡\n阀门"); valve.fontSize = 23;
    const label = createNode("label", 300, 100, "说明\n第二行"); label.fontSize = 21;
    d.nodes.push(valve, label); loadDiagram(d); fitToScreen(1200, 800);
    const ref = { current: null } as React.MutableRefObject<SVGSVGElement | null>;
    render(<LangProvider><CanvasView svgRefOut={ref} /></LangProvider>);
    const before = JSON.stringify(store.get().diagram);
    const opts = { ...EXPORT_DEFAULTS, format: "svg" as const, lang: "zh" as const, text: { scales: {}, halo: true, plates: false, offsets: {}, overrides: {}, sizes: {} } };
    const original = buildExportSVGWithOptions(ref.current!, store.get().diagram, opts);
    const originalDoc = new DOMParser().parseFromString(original.svg, "image/svg+xml");
    expect(originalDoc.querySelector(`.fp-node-label[data-node-id="${valve.id}"]`)?.getAttribute("font-size")).toBe("23");
    expect(originalDoc.querySelector('text[data-object-text]')?.getAttribute("font-size")).toBe("21");
    const changed = { ...opts, text: { ...opts.text, offsets: { [`node:${valve.id}`]: { x: 1200, y: 400 } }, overrides: { [`node:${valve.id}`]: "第一行\n第二行", [`object:${label.id}`]: "标注\n换行" }, sizes: { [`node:${valve.id}`]: 40, [`object:${label.id}`]: 35 } } };
    const output = buildExportSVGWithOptions(ref.current!, store.get().diagram, changed);
    const doc = new DOMParser().parseFromString(output.svg, "image/svg+xml");
    const text = doc.querySelector(`.fp-node-label[data-node-id="${valve.id}"]`)!;
    expect(text.getAttribute("font-size")).toBe("40");
    expect([...text.querySelectorAll("tspan")].map((e) => e.textContent)).toEqual(["第一行", "第二行"]);
    expect(doc.querySelector("text[data-object-text]")?.getAttribute("font-size")).toBe("35");
    expect(output.w).toBeGreaterThan(original.w + 500);
    const animation = prepareAnimationScene(ref.current!, store.get().diagram, { ...changed, format: "gif" });
    expect(animation.w).toBe(output.w);
    expect(animation.clone.querySelector(`.fp-node-label[data-node-id="${valve.id}"]`)?.getAttribute("font-size")).toBe("40");
    expect(JSON.stringify(store.get().diagram)).toBe(before);
  });
});
