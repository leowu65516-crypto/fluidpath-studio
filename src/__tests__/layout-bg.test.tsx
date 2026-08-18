import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store, setSelection, mirrorSelection, autoLayout, batchReplaceLabels } from "../store";
import type { Diagram } from "../types";

function makeDiagram(): Diagram {
  return {
    id: "t", name: "测试",
    nodes: [
      { id: "n1", type: "tank", label: "A", x: 0, y: 0, width: 100, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "p1", nodeId: "n1", position: "right", direction: "out" }] },
      { id: "n2", type: "tank", label: "B", x: 300, y: 0, width: 100, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "p2", nodeId: "n2", position: "left", direction: "in" }] },
      { id: "n3", type: "tank", label: "C", x: 0, y: 300, width: 100, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "p3", nodeId: "n3", position: "left", direction: "in" }] },
    ],
    pipes: [
      { id: "pipe1", label: "AB", fromPortId: "p1", toPortId: "p2", points: [], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1 },
    ],
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: false, crossoverHops: true, layers: [{ id: "l1", name: "默认层", visible: true }] },
  };
}

function renderApp() {
  return render(
    <LangProvider>
      <App />
    </LangProvider>
  );
}

describe("镜像翻转", () => {
  it("水平镜像：节点 x 坐标关于中心翻转，端口 right↔left", () => {
    renderApp();
    act(() => { loadDiagram(makeDiagram()); });
    act(() => { setSelection({ nodes: ["n1", "n2"], pipes: [] }); });
    act(() => { mirrorSelection(true); });
    const d = store.get().diagram;
    const a = d.nodes.find((n) => n.id === "n1")!;
    const b = d.nodes.find((n) => n.id === "n2")!;
    // n1(0..100) 与 n2(300..400)，中心 cx=200
    // n1 新 x = 2*200 - (0+100) = 300
    expect(a.x).toBe(300);
    // n2 新 x = 2*200 - (300+100) = 0
    expect(b.x).toBe(0);
    // 端口翻转
    expect(a.ports[0].position).toBe("left");
    expect(b.ports[0].position).toBe("right");
  });

  it("垂直镜像：节点 y 坐标翻转", () => {
    renderApp();
    act(() => { loadDiagram(makeDiagram()); });
    act(() => { setSelection({ nodes: ["n1", "n3"], pipes: [] }); });
    act(() => { mirrorSelection(false); });
    const d = store.get().diagram;
    const a = d.nodes.find((n) => n.id === "n1")!;
    const c = d.nodes.find((n) => n.id === "n3")!;
    // n1 y 0..80, n3 y 300..380, cy=190
    // n1 新 y = 2*190 - (0+80) = 300
    expect(a.y).toBe(300);
    // n3 新 y = 2*190 - (300+80) = 0
    expect(c.y).toBe(0);
  });
});

describe("自动排版", () => {
  it("水平排列：节点从左到右，不重叠", () => {
    renderApp();
    act(() => { loadDiagram(makeDiagram()); });
    act(() => { setSelection({ nodes: ["n1", "n2", "n3"], pipes: [] }); });
    act(() => { autoLayout("leftright"); });
    const d = store.get().diagram;
    const nodes = d.nodes.filter((n) => ["n1", "n2", "n3"].includes(n.id)).sort((a, b) => a.x - b.x);
    expect(nodes[1].x).toBeGreaterThan(nodes[0].x + nodes[0].width);
    expect(nodes[2].x).toBeGreaterThan(nodes[1].x + nodes[1].width);
  });

  it("网格排列：节点分散到多行", () => {
    renderApp();
    act(() => { loadDiagram(makeDiagram()); });
    act(() => { setSelection({ nodes: ["n1", "n2", "n3"], pipes: [] }); });
    act(() => { autoLayout("grid"); });
    const d = store.get().diagram;
    // 3 个节点 cols=2 → 第二行有节点
    const ys = d.nodes.map((n) => n.y);
    expect(new Set(ys).size).toBeGreaterThan(1);
  });
});

describe("批量替换标签", () => {
  it("前缀：标签前加文本", () => {
    renderApp();
    act(() => { loadDiagram(makeDiagram()); });
    act(() => { batchReplaceLabels("prefix", "X-", "", ["n1", "n2"], []); });
    const d = store.get().diagram;
    expect(d.nodes.find((n) => n.id === "n1")?.label).toBe("X-A");
    expect(d.nodes.find((n) => n.id === "n2")?.label).toBe("X-B");
  });

  it("替换：把指定文本替换为新文本", () => {
    renderApp();
    act(() => { loadDiagram(makeDiagram()); });
    act(() => { batchReplaceLabels("replace", "NEW", "B", ["n2"], []); });
    const d = store.get().diagram;
    expect(d.nodes.find((n) => n.id === "n2")?.label).toBe("NEW");
  });
});

describe("背景样式切换", () => {
  it("设置 backgroundType 后画布渲染对应图案", () => {
    renderApp();
    act(() => {
      loadDiagram({
        ...makeDiagram(),
        settings: { ...makeDiagram().settings, backgroundType: "grid" },
      });
    });
    const svg = document.querySelector(".main-canvas");
    expect(svg).toBeTruthy();
    // 方格 pattern 应存在
    expect(svg?.querySelector('pattern[id="linegrid"]')).toBeTruthy();
  });
});
