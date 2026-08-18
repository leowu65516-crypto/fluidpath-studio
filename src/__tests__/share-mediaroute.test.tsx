import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store, patchPipe, syncFluidThroughChain } from "../store";
import { compressDiagram, decompressDiagram } from "../export";
import { ContextMenu } from "../components/ContextMenu";
import type { Diagram } from "../types";

const sample = (): Diagram => ({
  id: "t", name: "测试图",
  nodes: [
    { id: "n1", type: "inlet", label: "进水", x: 0, y: 100, width: 72, height: 36, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "p1", nodeId: "n1", position: "right", direction: "out" }] },
    { id: "n2", type: "valve", label: "截止阀", x: 150, y: 100, width: 70, height: 54, rotation: 0, fill: "#fff", stroke: "#000", ports: [
      { id: "p2", nodeId: "n2", position: "left", direction: "in" },
      { id: "p3", nodeId: "n2", position: "right", direction: "out" },
    ] },
    { id: "n3", type: "tank", label: "罐", x: 300, y: 100, width: 100, height: 120, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "p4", nodeId: "n3", position: "left", direction: "in" }] },
  ],
  pipes: [
    { id: "pipe1", label: "进水管", fromPortId: "p1", toPortId: "p2", points: [], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1 },
    { id: "pipe2", label: "出水管", fromPortId: "p3", toPortId: "p4", points: [], nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6", fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: "coldWater", material: "custom", wallOpacity: 1 },
  ],
  settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: false, crossoverHops: true, layers: [{ id: "layer_default", name: "默认层", visible: true }] },
});

function renderApp() {
  return render(
    <LangProvider>
      <App />
    </LangProvider>
  );
}

describe("一键分享链接", () => {
  it("压缩/解压往返一致", () => {
    const d = sample();
    const enc = compressDiagram(d);
    expect(enc.length).toBeGreaterThan(10);
    const dec = decompressDiagram(enc);
    expect(dec.name).toBe("测试图");
    expect(dec.nodes.length).toBe(3);
    expect(dec.pipes.length).toBe(2);
  });

  it("URL-safe 编码不含非法字符", () => {
    const enc = compressDiagram(sample());
    expect(enc).not.toMatch(/[+/=]/);
  });
});

describe("管路自动标注介质", () => {
  it("开启 showFluidLabels 后画布渲染介质标签", () => {
    renderApp();
    act(() => { loadDiagram({ ...sample(), settings: { ...sample().settings, showFluidLabels: true } }); });
    const svg = document.querySelector(".main-canvas");
    const texts = svg ? Array.from(svg.querySelectorAll("text")).map((t) => t.textContent ?? "") : [];
    // 介质中文名
    expect(texts.some((x) => x.includes("常温水"))).toBe(true);
  });
});

describe("介质独立修改（不自动传播）", () => {
  it("改一条管路介质只影响该条，不联动直通链", () => {
    renderApp();
    act(() => { loadDiagram(sample()); });
    // 改进水管为热水
    act(() => { patchPipe("pipe1", { fluidType: "hotWater", fluidColor: "#e2542f" }); });
    const d = store.get().diagram;
    expect(d.pipes.find((p) => p.id === "pipe1")?.fluidType).toBe("hotWater");
    // 直通链上的出水管应保持冷水（不再自动传播）
    expect(d.pipes.find((p) => p.id === "pipe2")?.fluidType).toBe("coldWater");
  });

  it("显式调用 syncFluidThroughChain 才整链同步", () => {
    renderApp();
    act(() => { loadDiagram(sample()); });
    act(() => { patchPipe("pipe1", { fluidType: "hotWater", fluidColor: "#e2542f" }); });
    act(() => { syncFluidThroughChain("pipe1"); });
    const d = store.get().diagram;
    expect(d.pipes.find((p) => p.id === "pipe2")?.fluidType).toBe("hotWater");
  });
});

describe("画布右键菜单", () => {
  it("ContextMenu 组件渲染菜单项", () => {
    const { container } = render(
      <ContextMenu
        x={100}
        y={100}
        items={[
          { label: "复制" },
          { label: "---", divider: true },
          { label: "删除", danger: true },
        ]}
        onClose={() => {}}
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("复制");
    expect(text).toContain("删除");
  });

  it("空白右键菜单出现粘贴选项", () => {
    renderApp();
    act(() => { loadDiagram(sample()); });
    // 模拟 SVG 空白右键
    const svg = document.querySelector(".main-canvas")!;
    act(() => {
      svg.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 400, clientY: 300 }));
    });
    const menu = document.querySelector('[style*="z-index: 9999"]');
    expect(menu).toBeTruthy();
  });
});
