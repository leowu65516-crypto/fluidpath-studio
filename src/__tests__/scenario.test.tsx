import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store, enterScenario, exitScenario } from "../store";
import { SCENARIOS, getScenario, collectScenarioState, resolveScenarioRoles, availableScenariosForDiagram } from "../scenarios";
import bcmtsRaw from "../../BCMTS.json";
import type { Diagram } from "../types";

const toDiagram = (json: any): Diagram => parseJSON(json);
function parseJSON(json: any): Diagram {
  return JSON.parse(JSON.stringify(json)) as Diagram;
}

function renderApp() {
  return render(
    <LangProvider>
      <App />
    </LangProvider>
  );
}

// BCMTS（CAYE 咖啡机）关键元件 id
const ID = {
  pump: "n_ms7jr4mj2wu7sw",
  inletValve: "n_ms7jsb6764ggp8",
  hotBoiler: "n_ms7jxr3dguuffi",
  steamBoiler: "n_ms7k2qjpyth9jc",
  refillValve: "n_msbxbxyeayob",
  brewV3: "n_ms7jyj8djmqrnd",
  brewChamber: "n_ms7kiabc84vfmg",
  coffeeDrainV3: "n_ms7ksq2xg2m96s",
  coffeeOut: "n_ms7kjrfbg554uu",
  milkTank: "n_msw0gh0n7h3a",
  milkInValve: "n_ms92b8rm798rfd",
  milkPump: "n_msvz8pbq71ca",
  cleanV3: "n_ms91xxps4wsawx",
  milkDrainV3: "n_ms91h2kcr16ehn",
  heatV3: "n_msbx5rtiafzs",
  milkOut: "n_ms91fm8kiq9nkv",
};

describe("演示/讲述模式（角色自适应）", () => {
  it("场景清单：冲泡咖啡/热牛奶 + 美式/热水杆/清洗/排废四新场景", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(["coffee", "milk", "americano", "hotWand", "milkClean", "drain"]);
    expect(getScenario("coffee")!.steps.length).toBe(3);
    expect(getScenario("milk")!.steps.length).toBe(2);
    expect(getScenario("americano")!.steps.length).toBe(3);
    expect(getScenario("hotWand")!.steps.length).toBe(2);
    expect(getScenario("milkClean")!.steps.length).toBe(2);
    expect(getScenario("drain")!.steps.length).toBe(2);
    expect(getScenario("semi-auto")).toBeUndefined();
    expect(getScenario("full-auto")).toBeUndefined();
  });

  it("resolveScenarioRoles 在 BCMTS 上解析出全部角色", () => {
    const d = toDiagram(bcmtsRaw);
    const { nodes, missing } = resolveScenarioRoles(d);
    expect(missing).toEqual([]);
    expect(nodes.waterPump).toBe(ID.pump);
    expect(nodes.inletValve).toBe(ID.inletValve);
    expect(nodes.refillValve).toBe(ID.refillValve);
    expect(nodes.milkPump).toBe(ID.milkPump);
    expect(nodes.brewV3).toBe(ID.brewV3);
    expect(nodes.coffeeDrainV3).toBe(ID.coffeeDrainV3);
    expect(nodes.cleanV3).toBe(ID.cleanV3);
    expect(nodes.milkDrainV3).toBe(ID.milkDrainV3);
    expect(nodes.heatV3).toBe(ID.heatV3);
  });

  it("缺少奶泵的图纸不显示热牛奶，仍显示其余场景", () => {
    const d = toDiagram(bcmtsRaw);
    d.nodes = d.nodes.filter((n) => n.id !== ID.milkPump);
    expect(availableScenariosForDiagram(d).map((s) => s.id)).toEqual(["coffee", "americano", "hotWand", "milkClean", "drain"]);
  });

  it("collectScenarioState 按角色累积激活节点与阀状态", () => {
    const coffee = getScenario("coffee")!;
    const resolved = resolveScenarioRoles(toDiagram(bcmtsRaw)).nodes;
    const s2 = collectScenarioState(coffee, 2, resolved); // 第3步
    expect(s2.activeNodes.has(ID.pump)).toBe(true);
    expect(s2.activeNodes.has(ID.brewChamber)).toBe(true);
    expect(s2.activeNodes.has(ID.coffeeOut)).toBe(true);
    expect(s2.valves[ID.pump]).toBe("pump-run");
    expect(s2.valves[ID.brewV3]).toBe("A");
    expect(s2.valves[ID.coffeeDrainV3]).toBe("A");
  });

  it("进入咖啡场景第1步：泵运行、进水阀开、无关阀位被基线复位", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("coffee", 0); });
    const d = store.get().diagram;
    expect(d.nodes.find((n) => n.id === ID.pump)?.pumpOn).toBe(true);
    expect(d.nodes.find((n) => n.id === ID.inletValve)?.valveState).toBe("open");
    // 基线复位：奶泵停、清洗三通 off（不再受存档阀位干扰）
    expect(d.nodes.find((n) => n.id === ID.milkPump)?.pumpOn).toBe(false);
    expect(d.nodes.find((n) => n.id === ID.cleanV3)?.valvePath).toBe("off");
    const sc = store.get().ui.scenario!;
    expect(sc.activeNodes).toContain(ID.pump);
    expect(sc.activePipes.length).toBeGreaterThan(0);
  });

  it("咖啡场景第3步：冲泡阀 A、咖啡排废阀 A、全链高亮无断档", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("coffee", 2); });
    const d = store.get().diagram;
    expect(d.nodes.find((n) => n.id === ID.brewV3)?.valvePath).toBe("A");
    expect(d.nodes.find((n) => n.id === ID.coffeeDrainV3)?.valvePath).toBe("A");
    const sc = store.get().ui.scenario!;
    // 供水链中间段（滤网）与咖啡链中间段（三通）自动补齐：59/61/8/56/57/17 全部高亮
    const labels = new Set(
      sc.activePipes.map((pid) => d.pipes.find((p) => p.id === pid)?.label)
    );
    for (const lbl of ["管路 59", "管路 61", "管路 8", "管路 56", "管路 57", "管路 17"]) {
      expect(labels.has(lbl), `高亮应包含 ${lbl}`).toBe(true);
    }
  });

  it("热牛奶场景第1步：补水阀打开，补水链 27/25 高亮", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("milk", 0); });
    const d = store.get().diagram;
    expect(d.nodes.find((n) => n.id === ID.refillValve)?.valveState).toBe("open");
    const sc = store.get().ui.scenario!;
    expect(sc.activeNodes).toContain(ID.steamBoiler);
    const labels = new Set(
      sc.activePipes.map((pid) => d.pipes.find((p) => p.id === pid)?.label)
    );
    expect(labels.has("管路 27")).toBe(true);
    expect(labels.has("管路 25")).toBe(true);
  });

  it("热牛奶场景第2步：奶泵+蒸汽加热两路齐开、清洗三通关闭、奶链与加热链完整高亮", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("milk", 1); });
    const d = store.get().diagram;
    expect(d.nodes.find((n) => n.id === ID.milkPump)?.pumpOn).toBe(true);
    expect(d.nodes.find((n) => n.id === ID.milkInValve)?.valveState).toBe("open");
    expect(d.nodes.find((n) => n.id === ID.milkDrainV3)?.valvePath).toBe("A");
    // 蒸汽加热三通同步导通
    expect(d.nodes.find((n) => n.id === ID.heatV3)?.valvePath).toBe("A");
    // 清洗三通必须关闭（用户核心诉求）
    expect(d.nodes.find((n) => n.id === ID.cleanV3)?.valvePath).toBe("off");
    const sc = store.get().ui.scenario!;
    const labels = new Set(
      sc.activePipes.map((pid) => d.pipes.find((p) => p.id === pid)?.label)
    );
    for (const lbl of ["管路 68", "管路 41", "管路 49", "管路 50", "管路 63", "管路 64", "管路 34", "管路 35", "管路 21", "管路 32", "管路 33"]) {
      expect(labels.has(lbl), `高亮应包含 ${lbl}`).toBe(true);
    }
  });

  it("进入场景：本步新增元件触发定位闪烁（blink）", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("coffee", 0); });
    const b = store.get().ui.blink;
    expect(b).toBeTruthy();
    expect(b!.ids).toContain(ID.pump);
    expect(b!.ids).toContain(ID.inletValve);
  });

  it("退出场景：恢复进入前的阀位快照（不再全部打成全开）", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    // 先摆一个自定义状态
    act(() => {
      const d = store.get().diagram;
      d.nodes.find((n) => n.id === ID.pump)!.pumpOn = false;
      d.nodes.find((n) => n.id === ID.cleanV3)!.valvePath = "B";
    });
    act(() => { enterScenario("coffee", 0); });
    act(() => { exitScenario(); });
    expect(store.get().ui.scenario).toBeNull();
    const d = store.get().diagram;
    expect(d.nodes.find((n) => n.id === ID.pump)?.pumpOn).toBe(false); // 快照还原
    expect(d.nodes.find((n) => n.id === ID.cleanV3)?.valvePath).toBe("B"); // 快照还原
  });
});

describe("演示模式画布渲染", () => {
  it("进入场景后画布出现黄色高亮环 + 淡化非激活", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("coffee", 2); });
    const svg = document.querySelector(".main-canvas");
    const highlightRects = svg ? Array.from(svg.querySelectorAll('rect[stroke="#ffd34d"]')) : [];
    expect(highlightRects.length).toBeGreaterThan(0);
    const glowPaths = svg ? Array.from(svg.querySelectorAll('path[stroke-opacity="0.35"]')) : [];
    expect(glowPaths.length).toBeGreaterThan(0);
  });

  it("退出场景后高亮清除", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
    act(() => { enterScenario("coffee", 0); });
    act(() => { exitScenario(); });
    const svg = document.querySelector(".main-canvas");
    const highlightRects = svg ? Array.from(svg.querySelectorAll('rect[stroke="#ffd34d"]')) : [];
    expect(highlightRects.length).toBe(0);
  });
});
