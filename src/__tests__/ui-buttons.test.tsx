import { describe, it, expect } from "vitest";
import { render, act, screen } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, setSelection } from "../store";
import type { Diagram } from "../types";

function renderApp() { return render(<LangProvider><App /></LangProvider>); }

function makeDiagram(): Diagram {
  return {
    id: "t", name: "test",
    nodes: [
      { id: "a", type: "tee", label: "A", x: 0, y: 100, width: 64, height: 64, rotation: 0, fill: "#fff", stroke: "#000", ports: [
        { id: "a1", nodeId: "a", position: "right", offset: 0.3, direction: "out" },
        { id: "a2", nodeId: "a", position: "right", offset: 0.5, direction: "out" },
      ] },
      { id: "b", type: "tee", label: "B", x: 400, y: 100, width: 64, height: 64, rotation: 0, fill: "#fff", stroke: "#000", ports: [
        { id: "b1", nodeId: "b", position: "left", offset: 0.3, direction: "in" },
        { id: "b2", nodeId: "b", position: "left", offset: 0.5, direction: "in" },
      ] },
    ],
    pipes: [
      { id: "p1", label: "1", fromPortId: "a1", toPortId: "b1", points: [], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1 },
      { id: "p2", label: "2", fromPortId: "a2", toPortId: "b2", points: [], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1 },
    ],
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: false, crossoverHops: true, layers: [{ id: "l", name: "默认层", visible: true }] },
  };
}

describe("批量走线整理 UI", () => {
  it("多选管路后显示重路由/等距按钮", () => {
    renderApp();
    act(() => { loadDiagram(makeDiagram()); });
    act(() => { setSelection({ nodes: [], pipes: ["p1", "p2"] }); });
    expect(screen.getByText(/批量重路由/)).toBeTruthy();
    expect(screen.getByText(/等距排列/)).toBeTruthy();
  });
});
