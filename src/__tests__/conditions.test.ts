import { describe, it, expect } from "vitest";
import { saveWorkCondition, applyWorkCondition, deleteWorkCondition, listWorkConditions, loadDiagram, store } from "../store";
import { parseDiagramJSON } from "../export";
import { diffStateIds } from "../presets";
import bcmtsRaw from "../../BCMTS.json";
import type { Diagram } from "../types";

const toDiagram = (json: any): Diagram => JSON.parse(JSON.stringify(json)) as Diagram;

describe("工况快照", () => {
  it("保存 → 修改阀位 → 应用工况还原阀位", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    // 摆一个明确的阀位组合：奶泵开、进奶阀开、清洗三通 off
    applyWorkCondition("__none__"); // 空操作保护（不存在时无副作用）
    let d = store_diagram();
    d.nodes.find((n) => n.id === "n_msvz8pbq71ca")!.pumpOn = true;
    d.nodes.find((n) => n.id === "n_ms92b8rm798rfd")!.valveState = "open";
    d.nodes.find((n) => n.id === "n_ms91xxps4wsawx")!.valvePath = "off";
    saveWorkCondition("做咖啡测试");

    // 改成另一组
    d = store_diagram();
    d.nodes.find((n) => n.id === "n_msvz8pbq71ca")!.pumpOn = false;
    d.nodes.find((n) => n.id === "n_ms91xxps4wsawx")!.valvePath = "A";

    applyWorkCondition("做咖啡测试");
    const after = store_diagram();
    expect(after.nodes.find((n) => n.id === "n_msvz8pbq71ca")?.pumpOn).toBe(true);
    expect(after.nodes.find((n) => n.id === "n_ms92b8rm798rfd")?.valveState).toBe("open");
    expect(after.nodes.find((n) => n.id === "n_ms91xxps4wsawx")?.valvePath).toBe("off");

    deleteWorkCondition("做咖啡测试");
    expect(listWorkConditions().some((c) => c.name === "做咖啡测试")).toBe(false);
  });

  it("工况随图纸 settings 保存", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    saveWorkCondition("清洗测试");
    const d = store_diagram();
    expect(d.settings.workConditions?.some((c) => c.name === "清洗测试")).toBe(true);
    deleteWorkCondition("清洗测试");
  });
});

function store_diagram(): Diagram {
  return store.get().diagram;
}

describe("状态差异对比", () => {
  it("diffStateIds 只返回发生变化的节点", () => {
    const prev = { p1: { pumpOn: true }, v1: { valveState: "open" as const }, v2: { valvePath: "A" as const } };
    const next = { p1: { pumpOn: false }, v1: { valveState: "open" as const }, v2: { valvePath: "A" as const } };
    expect(diffStateIds(prev, next)).toEqual(["p1"]);
    expect(diffStateIds(prev, prev)).toEqual([]);
  });
});

describe("工况随 JSON/分享码持久化", () => {
  it("导出 JSON 再导入后工况仍在", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    saveWorkCondition("做咖啡");
    // 模拟导出（JSON.stringify 即 exportJSON 的序列化方式）
    const json = JSON.stringify(store.get().diagram);
    // 模拟导入（parseDiagramJSON 即加载流程）
    const reopened = parseDiagramJSON(json);
    expect(reopened.settings.workConditions?.some((c: any) => c.name === "做咖啡")).toBe(true);
    // 加载后 listWorkConditions 可见
    loadDiagram(reopened);
    expect(listWorkConditions().some((c) => c.name === "做咖啡")).toBe(true);
    deleteWorkCondition("做咖啡");
  });
});
