import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store, setSelection, batchReroutePipes, distributePipes } from "../store";
import type { Diagram } from "../types";

function renderApp() { return render(<LangProvider><App /></LangProvider>); }

// 构造：三条平行管路从 A 到 B（不同 y）
function makeDiagram(): Diagram {
  return {
    id: "t", name: "test",
    nodes: [
      { id: "a", type: "tee", label: "A", x: 0, y: 100, width: 64, height: 64, rotation: 0, fill: "#fff", stroke: "#000", ports: [
        { id: "a1", nodeId: "a", position: "right", offset: 0.3, direction: "out" },
        { id: "a2", nodeId: "a", position: "right", offset: 0.5, direction: "out" },
        { id: "a3", nodeId: "a", position: "right", offset: 0.7, direction: "out" },
      ] },
      { id: "b", type: "tee", label: "B", x: 400, y: 100, width: 64, height: 64, rotation: 0, fill: "#fff", stroke: "#000", ports: [
        { id: "b1", nodeId: "b", position: "left", offset: 0.3, direction: "in" },
        { id: "b2", nodeId: "b", position: "left", offset: 0.5, direction: "in" },
        { id: "b3", nodeId: "b", position: "left", offset: 0.7, direction: "in" },
      ] },
    ],
    pipes: [
      { id: "p1", label: "1", fromPortId: "a1", toPortId: "b1", points: [{ x: 200, y: 110 }, { x: 200, y: 120 }], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1 },
      { id: "p2", label: "2", fromPortId: "a2", toPortId: "b2", points: [{ x: 200, y: 130 }, { x: 200, y: 140 }], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1 },
      { id: "p3", label: "3", fromPortId: "a3", toPortId: "b3", points: [{ x: 200, y: 150 }, { x: 200, y: 160 }], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1 },
    ],
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: false, crossoverHops: true, layers: [{ id: "l", name: "默认层", visible: true }] },
  };
}

describe("批量重路由 + 等距排列", () => {
  it("batchReroutePipes 清空选中管路 points", () => {
    renderApp();
    act(() => { loadDiagram(makeDiagram()); });
    act(() => { setSelection({ nodes: [], pipes: ["p1", "p2"] }); });
    act(() => { batchReroutePipes(["p1", "p2"]); });
    const d = store.get().diagram;
    expect(d.pipes.find((p) => p.id === "p1")?.points).toEqual([]);
    expect(d.pipes.find((p) => p.id === "p2")?.points).toEqual([]);
  });

  it("distributePipes 对平行管路做等距排列", () => {
    renderApp();
    act(() => { loadDiagram(makeDiagram()); });
    act(() => { distributePipes(["p1", "p2", "p3"]); });
    const d = store.get().diagram;
    // 三条平行管路主线段 y 应等距
    const ys = ["p1", "p2", "p3"].map((id) => {
      const p = d.pipes.find((x) => x.id === id)!;
      const midY = p.points[0]?.y ?? 0;
      return midY;
    }).sort((a, b) => a - b);
    const step1 = ys[1] - ys[0];
    const step2 = ys[2] - ys[1];
    expect(Math.abs(step1 - step2)).toBeLessThan(1);
  });
});
