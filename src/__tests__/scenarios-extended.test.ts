/**
 * P0 场景扩展测试：americano / hotWand / milkClean / drain
 * - 角色规则对 BCMTS 解析成功
 - 每个场景应用最终步骤阀位后，引擎断言关键管路流动/停流
 */
import { describe, it, expect } from "vitest";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import { parseDiagramJSON } from "../export";
import { SCENARIOS, availableScenariosForDiagram, resolveScenarioRoles, collectScenarioState, valveActionsToPreset } from "../scenarios";
import { applyStates } from "../presets";
import bcmtsRaw from "../../BCMTS.json";

function loadBcmts() {
  return parseDiagramJSON(JSON.stringify(bcmtsRaw));
}

/** 应用场景到第 stepIndex 步后的阀位（返回新 Diagram，不改原图） */
function applyScenario(d0: ReturnType<typeof loadBcmts>, scenarioId: string, stepIndex = Infinity) {
  const d = structuredClone(d0);
  const sc = SCENARIOS.find((s) => s.id === scenarioId)!;
  const resolved = resolveScenarioRoles(d);
  const idx = Math.min(stepIndex, sc.steps.length - 1);
  const { valves } = collectScenarioState(sc, idx, resolved.nodes);
  applyStates(d, valveActionsToPreset(valves));
  setCachedPipes(d.pipes, d.nodes);
  return d;
}

/** 某节点进水侧的第一根管路 */
function inletPipeOf(d: ReturnType<typeof loadBcmts>, nodeId: string) {
  const n = d.nodes.find((x) => x.id === nodeId)!;
  const inIds = new Set(n.ports.filter((p) => p.direction === "in").map((p) => p.id));
  return d.pipes.find((p) => p.toPortId && inIds.has(p.toPortId));
}

describe("P0 场景扩展：角色解析与可用场景", () => {
  it("场景总数为 6，含 4 个新增场景", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(["coffee", "milk", "americano", "hotWand", "milkClean", "drain"]);
  });

  it("BCMTS 解析出全部新角色", () => {
    const d = loadBcmts();
    const { nodes, missing } = resolveScenarioRoles(d);
    for (const role of ["hotWandV3", "americanoV3", "hotWandOut", "americanoOut", "coldWaterValve", "bypassValve", "steamDrainV2", "wasteOut"]) {
      expect(nodes[role], `角色 ${role} 未解析（missing=${missing.join(",")}）`).toBeTruthy();
    }
  });

  it("BCMTS 上 6 个场景全部可用", () => {
    const d = loadBcmts();
    const ids = availableScenariosForDiagram(d).map((s) => s.id);
    expect(ids).toContain("americano");
    expect(ids).toContain("hotWand");
    expect(ids).toContain("milkClean");
    expect(ids).toContain("drain");
  });
});

describe("P0 场景扩展：BCMTS 引擎流动断言", () => {
  it("americano：美式出口流动，热水杆出口停流；勾兑步冷水阀打开", () => {
    const d0 = loadBcmts();
    const d = applyScenario(d0, "americano");
    const roles = resolveScenarioRoles(d).nodes;
    const amPipe = inletPipeOf(d, roles.americanoOut!);
    const wandPipe = inletPipeOf(d, roles.hotWandOut!);
    expect(amPipe).toBeTruthy();
    expect(wandPipe).toBeTruthy();
    expect(pipeEffectiveDisabled(amPipe!, d.nodes)).toBe(false);
    expect(pipeEffectiveDisabled(wandPipe!, d.nodes)).toBe(true);
    // 常温水阀已开
    const cold = d.nodes.find((n) => n.id === roles.coldWaterValve)!;
    expect(cold.valveState).toBe("open");
  });

  it("americano 第 1 步（未选路）美式出口尚无流动", () => {
    const d0 = loadBcmts();
    const d = applyScenario(d0, "americano", 0);
    const roles = resolveScenarioRoles(d).nodes;
    const amPipe = inletPipeOf(d, roles.americanoOut!);
    expect(amPipe && !pipeEffectiveDisabled(amPipe, d.nodes)).toBe(false);
  });

  it("hotWand：热水杆出口流动", () => {
    const d0 = loadBcmts();
    const d = applyScenario(d0, "hotWand");
    const roles = resolveScenarioRoles(d).nodes;
    const wandPipe = inletPipeOf(d, roles.hotWandOut!);
    expect(wandPipe).toBeTruthy();
    expect(pipeEffectiveDisabled(wandPipe!, d.nodes)).toBe(false);
  });

  it("milkClean：清洗热水回流管流动（热水倒灌奶路回罐），奶泵保持关闭", () => {
    const d0 = loadBcmts();
    const d = applyScenario(d0, "milkClean");
    const roles = resolveScenarioRoles(d).nodes;
    const milkPump = d.nodes.find((n) => n.id === roles.milkPump)!;
    expect(milkPump.pumpOn).toBe(false);
    const refPipe = d.pipes.find((p) => (p.label || "").includes("清洗热水回流")) ?? d.pipes.find((p) => p.id === "pipe_reflux_clean");
    expect(refPipe).toBeTruthy();
    expect(pipeEffectiveDisabled(refPipe!, d.nodes)).toBe(false);
  });

  it("drain：排废总阀打开后排废出口流动", () => {
    const d0 = loadBcmts();
    const d = applyScenario(d0, "drain");
    const roles = resolveScenarioRoles(d).nodes;
    const wastePipe = inletPipeOf(d, roles.wasteOut!);
    expect(wastePipe).toBeTruthy();
    expect(pipeEffectiveDisabled(wastePipe!, d.nodes)).toBe(false);
    // 总排废阀为开
    const drain2 = d.nodes.find((n) => n.id === roles.steamDrainV2)!;
    expect(drain2.valveState).toBe("open");
  });

  it("drain 第 1 步（总阀未开）排废出口停流", () => {
    const d0 = loadBcmts();
    const d = applyScenario(d0, "drain", 0);
    const roles = resolveScenarioRoles(d).nodes;
    const wastePipe = inletPipeOf(d, roles.wasteOut!);
    expect(wastePipe && !pipeEffectiveDisabled(wastePipe, d.nodes)).toBe(false);
  });
});
