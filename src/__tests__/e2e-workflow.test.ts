import { describe, it, expect } from "vitest";
import { loadDiagram, store, saveWorkCondition, applyWorkCondition, enterScenario, exitScenario, listWorkConditions } from "../store";
import { parseDiagramJSON, compressDiagram, decompressDiagram } from "../export";
import { diagnoseDiagram } from "../diagnostics";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import bcmtsRaw from "../../BCMTS.json";

/**
 * 关键流程 E2E（真实生产模块，逻辑层）：
 * 启动默认图 → 摆状态存工况 → 恢复 → 场景演示 → 回路诊断 → 导出 JSON / 分享码往返。
 * 覆盖从「打开工作台」到「导出交付」的完整用户路径。
 */
describe("关键流程 E2E", () => {
  it("完整走一遍：启动→工况→演示→诊断→导出/分享往返", () => {
    // 1. 启动默认图是最简三元件（水泵→冲泡缸→咖啡出口）
    expect(store.get().diagram.nodes.length).toBe(3);
    expect(store.get().diagram.nodes.some((n) => n.type === "pump")).toBe(true);

    // 2. 载入实战图 BCMTS
    loadDiagram(parseDiagramJSON(JSON.stringify(bcmtsRaw)));
    const pumpId = "n_msvz8pbq71ca"; // 奶泵

    // 3. 工况：停奶泵 → 记住「待机」→ 开奶泵 → 恢复「待机」
    store.get().diagram.nodes.find((n) => n.id === pumpId)!.pumpOn = false;
    saveWorkCondition("待机");
    store.get().diagram.nodes.find((n) => n.id === pumpId)!.pumpOn = true;
    applyWorkCondition("待机");
    expect(store.get().diagram.nodes.find((n) => n.id === pumpId)?.pumpOn).toBe(false);
    expect(listWorkConditions().some((c) => c.name === "待机")).toBe(true);

    // 4. 场景演示：冲泡咖啡第 3 步 → 咖啡出口流动
    enterScenario("coffee", 2);
    setCachedPipes(store.get().diagram.pipes, store.get().diagram.nodes);
    const outletPipe = store.get().diagram.pipes.find((p) => p.label === "管路 17")!;
    expect(outletPipe).toBeTruthy();
    expect(pipeEffectiveDisabled(outletPipe, store.get().diagram.nodes)).toBe(false);
    exitScenario();

    // 5. 回路诊断：结构问题 0（BCMTS 已修复干净）
    const diags = diagnoseDiagram(store.get().diagram);
    expect(diags.filter((d) => d.severity === "error")).toHaveLength(0);

    // 6. 导出 JSON 往返：工况仍在
    const reopened = parseDiagramJSON(JSON.stringify(store.get().diagram));
    expect(reopened.settings.workConditions?.some((c) => c.name === "待机")).toBe(true);

    // 7. 分享码往返：节点数一致
    const code = compressDiagram(store.get().diagram);
    const back = decompressDiagram(code);
    expect(back.nodes.length).toBe(store.get().diagram.nodes.length);
    expect(back.pipes.length).toBe(store.get().diagram.pipes.length);
  });
});
