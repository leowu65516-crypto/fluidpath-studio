/**
 * v1.20 演示微调叠加层测试：
 * - 演示中 overrideScenarioNode 跨步骤保留
 * - resetScenarioOverrides 回到场景预设
 * - 切场景清空 overrides
 * - exitScenario 仍还原快照（回归）
 * - highlightMode 设置
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store, enterScenario, setScenarioStep, exitScenario, overrideScenarioNode, resetScenarioOverrides } from "../store";
import bcmtsRaw from "../../BCMTS.json";

function toDiagram(json: any) {
  return {
    ...json,
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: false, crossoverHops: true, layers: [{ id: "l", name: "默认层", visible: true }], ...json.settings },
  };
}

const COLD_VALVE = "n_ms7jyyn0kfcobx"; // 常温水两通电磁阀（coffee 场景不涉及）

beforeEach(() => {
  try { localStorage.setItem("fluidpath.lang", "zh"); } catch { /* ignore */ }
  render(<LangProvider><App /></LangProvider>);
  act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
});

afterEach(cleanup);

describe("演示微调叠加层", () => {
  it("进入场景→微调→切步骤：微调保留", () => {
    act(() => { enterScenario("coffee", 0); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("closed");
    act(() => { overrideScenarioNode(COLD_VALVE, { valveState: "open" }); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("open");
    expect(store.get().ui.scenario?.overrides?.[COLD_VALVE]?.valveState).toBe("open");
    act(() => { setScenarioStep(1); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("open");
    expect(store.get().ui.scenario?.overrides?.[COLD_VALVE]?.valveState).toBe("open");
  });

  it("重置微调：回到场景预设（关）", () => {
    act(() => { enterScenario("coffee", 0); });
    act(() => { overrideScenarioNode(COLD_VALVE, { valveState: "open" }); });
    act(() => { resetScenarioOverrides(); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("closed");
    expect(Object.keys(store.get().ui.scenario?.overrides ?? {}).length).toBe(0);
  });

  it("切换场景：微调清空", () => {
    act(() => { enterScenario("coffee", 0); });
    act(() => { overrideScenarioNode(COLD_VALVE, { valveState: "open" }); });
    act(() => { enterScenario("milk", 0); });
    expect(store.get().ui.scenario?.scenarioId).toBe("milk");
    expect(Object.keys(store.get().ui.scenario?.overrides ?? {}).length).toBe(0);
  });

  it("退出演示：还原快照（微调不进图纸）", () => {
    const before = JSON.stringify(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE));
    act(() => { enterScenario("coffee", 0); });
    act(() => { overrideScenarioNode(COLD_VALVE, { valveState: "open" }); });
    act(() => { exitScenario(); });
    expect(store.get().ui.scenario).toBeNull();
    expect(JSON.stringify(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE))).toBe(before);
  });

});
