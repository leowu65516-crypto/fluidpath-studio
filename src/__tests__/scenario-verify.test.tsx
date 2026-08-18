import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store, enterScenario, patchNode } from "../store";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import bcmtsRaw from "../../BCMTS.json";
import msy2Raw from "../../MSY2.json";
import type { Diagram } from "../types";

const toDiagram = (json: any): Diagram => JSON.parse(JSON.stringify(json)) as Diagram;

function renderApp() {
  return render(
    <LangProvider>
      <App />
    </LangProvider>
  );
}

function flowState(d: Diagram, labels: string[]): Record<string, boolean> {
  setCachedPipes(d.pipes, d.nodes);
  const m: Record<string, boolean> = {};
  for (const lbl of labels) {
    const p = d.pipes.find((x) => x.label === lbl);
    m[lbl] = p ? !pipeEffectiveDisabled(p, d.nodes) : false;
  }
  return m;
}

describe("演示场景在 BCMTS 下的引擎行为验证", () => {
  it("咖啡场景第2步：冲泡阀 A，热水注入冲泡缸（1/8 流动，56/57 尚未萃取）", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("coffee", 1); });
    const d = store.get().diagram;
    const m = flowState(d, ["管路 1", "管路 8", "管路 56", "管路 57", "管路 17"]);
    expect(m["管路 1"]).toBe(true);
    expect(m["管路 8"]).toBe(true);
    expect(m["管路 56"]).toBe(false); // 咖啡排废阀未开 → 萃取未开始
    expect(m["管路 57"]).toBe(false);
    expect(m["管路 17"]).toBe(false);
  });

  it("咖啡场景第3步：咖啡排废阀 A，全链贯通到咖啡出口", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("coffee", 2); });
    const d = store.get().diagram;
    const m = flowState(d, ["管路 1", "管路 8", "管路 56", "管路 57", "管路 17"]);
    expect(m["管路 1"]).toBe(true);
    expect(m["管路 8"]).toBe(true);
    expect(m["管路 56"]).toBe(true);
    expect(m["管路 57"]).toBe(true);
    expect(m["管路 17"]).toBe(true);
    // 水泵运行中 → 供水链不停流
    expect(d.nodes.find((n) => n.id === "n_ms7jr4mj2wu7sw")?.pumpOn).toBe(true);
  });

  it("热牛奶场景第2步：奶链与蒸汽加热链全通、清洗三通关闭（9/51 停流）", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("milk", 1); });
    const d = store.get().diagram;
    const m = flowState(d, ["管路 68", "管路 41", "管路 49", "管路 50", "管路 63", "管路 64", "管路 34", "管路 35", "管路 21", "管路 32", "管路 33", "管路 9", "管路 51"]);
    for (const lbl of ["管路 68", "管路 41", "管路 49", "管路 50", "管路 63", "管路 64", "管路 34", "管路 35", "管路 21", "管路 32", "管路 33"]) {
      expect(m[lbl], `${lbl} 应流动`).toBe(true);
    }
    // 清洗三通关闭 → 热水清洗路必须停
    expect(m["管路 9"]).toBe(false);
    expect(m["管路 51"]).toBe(false);
  });

  it("热牛奶场景第1步：蒸汽锅炉补水链 27/25 流动", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("milk", 0); });
    const d = store.get().diagram;
    const m = flowState(d, ["管路 27", "管路 25"]);
    expect(m["管路 27"]).toBe(true);
    expect(m["管路 25"]).toBe(true);
  });
});

describe("停流传播链完整性（MSY2）", () => {
  it("关闭水泵 → 供水链全停（含热水锅炉出）", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(msy2Raw)); });
    act(() => { patchNode("n_ms7jr4mj2wu7sw", { pumpOn: false }); });
    const d = store.get().diagram;
    setCachedPipes(d.pipes, d.nodes);
    // 供水链：进水口→单向阀→两通→过滤器→水泵
    const inletPipe = d.pipes.find((p) => p.label === "水源进水管")!;
    expect(pipeEffectiveDisabled(inletPipe, d.nodes)).toBe(true);
    // 热水锅炉出管也应停（上游供水中断）
    const hb = d.nodes.find((n) => n.type === "hotWaterBoiler")!;
    const hbOut = d.pipes.find((p) => p.fromPortId && hb.ports.some((pp) => pp.id === p.fromPortId));
    expect(hbOut ? pipeEffectiveDisabled(hbOut, d.nodes) : true).toBe(true);
  });

  it("关闭奶泵 → 牛奶链停流", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(msy2Raw)); });
    act(() => { patchNode("n_ms91en36c610kc", { pumpOn: false }); });
    const d = store.get().diagram;
    setCachedPipes(d.pipes, d.nodes);
    // 奶泵出管应停
    const mp = d.nodes.find((n) => n.id === "n_ms91en36c610kc")!;
    const mpOut = mp.ports.find((p) => p.direction === "out")!;
    const mpOutPipe = d.pipes.find((p) => p.fromPortId === mpOut.id)!;
    expect(pipeEffectiveDisabled(mpOutPipe, d.nodes)).toBe(true);
  });
});
