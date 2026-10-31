/** 演练基线闭环：全通基线工况生成、缺基线一键重演出差异、0 差异提示与数字定位入口 */
import { describe, expect, it, beforeEach } from "vitest";
import { loadDiagram, setWorkMode, store, updateDiagram } from "../store";
import { createEmptyDiagram } from "../sample";
import { createRunBaselineCondition, restartDrillWithBaseline, startFaultDrill, restoreFaultDrill, drillResidueIds, clearDrillResidue } from "../fault-codes/drill";
import { resetDiagnosticSession, diagnosticSession } from "../fault-codes/session";
import { parseDiagnosticProfile } from "../fault-codes/profile";
import type { DiagnosticProfile } from "../fault-codes/types";
import type { DiagramNode } from "../types";

function node(partial: Partial<DiagramNode> & Pick<DiagramNode, "id" | "type">): DiagramNode {
  return { label: partial.type, x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#333", ports: [], ...partial } as DiagramNode;
}
function miniDiagram(): ReturnType<typeof createEmptyDiagram> {
  const d = createEmptyDiagram();
  const inlet = node({ id: "n-in", type: "inlet", label: "Inlet" });
  const valve = node({ id: "n-v", type: "solenoid2", label: "V", valveState: "closed" });
  const pump = node({ id: "n-p", type: "milkPump", label: "P", pumpOn: false });
  const tank = node({ id: "n-t", type: "tank", label: "T" });
  d.nodes.push(inlet, valve, pump, tank);
  // 端口在 createEmptyDiagram 场景下省略：直接用 from/to 端口 stub 不进引擎；演练只依赖 group 绑定的 nodeIds
  const profile: DiagnosticProfile = parseDiagnosticProfile({
    format: "fluidpath.diagnostic-profile", version: "0.4-draft", namespace: "t",
    source: { kind: "userDeclared", appliesToRealMachine: false },
    signalDefinitions: [],
    highlightGroups: [{ id: "part-pump", label: { zh: "泵", en: "Pump" }, resolution: "explicit", nodeIds: ["n-p"], pipeIds: [] }],
    diagnostics: [{ id: "f1", code: "E001", label: { zh: "泵故障", en: "Pump" }, definitionStatus: "userDeclared", highlightBindings: [{ groupId: "part-pump", meaning: "inspectionScope" }], presentation: { style: "outline", color: "#d97706", animation: "none" }, controlActions: [], rootCauseStatus: "notDetermined", drill: { conditionName: "运行基线", actions: [{ groupId: "part-pump", behavior: "stuckClosed" }] } }],
  });
  d.settings.diagnosticProfile = profile;
  return d;
}

beforeEach(() => { setWorkMode("fault"); resetDiagnosticSession(); restoreFaultDrill(); });

describe("createRunBaselineCondition", () => {
  it("泵开/两通开/三通 A，且不改动原图", () => {
    const d = miniDiagram();
    loadDiagram(d);
    const before = structuredClone(store.get().diagram);
    const cond = createRunBaselineCondition(store.get().diagram, "运行基线");
    expect(cond.name).toBe("运行基线");
    const pumpState = cond.state["n-p"];
    expect(pumpState).toMatchObject({ pumpOn: true });
    expect(cond.state["n-v"]).toMatchObject({ valveState: "open" });
    expect(store.get().diagram).toEqual(before); // 纯函数，不改原图
  });
});

describe("restartDrillWithBaseline", () => {
  it("缺基线时一键重演：创建工况并重跑演练，返回缺失工况名可被上游消费", () => {
    const d = miniDiagram();
    loadDiagram(d);
    const first = startFaultDrill("f1");
    expect(first.ok).toBe(true);
    expect(first.missingCondition).toBe(true);
    expect(first.missingConditionName).toBe("运行基线");
    restoreFaultDrill();
    const again = restartDrillWithBaseline("f1", "运行基线");
    expect(again.ok).toBe(true);
    expect(again.missingCondition).toBe(false);
    // 工况已入图纸且演练重新挂载
    expect(store.get().diagram.settings.workConditions?.some(c => c.name === "运行基线")).toBe(true);
    expect(diagnosticSession.get().drill?.faultCode).toBe("E001");
    restoreFaultDrill();
    // 还原后可再次以已存在的工况直接演练（不再缺）
    const third = startFaultDrill("f1");
    expect(third.ok).toBe(true);
    expect(third.missingCondition).toBe(false);
  });
});

describe("drill residue", () => {
  it("演练残留可检测与清除；残留下重演先清残留，正常还原不残留", () => {
    const d = miniDiagram();
    loadDiagram(d);
    // 模拟演练中刷新：注入留在图上、会话丢失
    startFaultDrill("f1");
    resetDiagnosticSession();
    expect(drillResidueIds(store.get().diagram, store.get().diagram.settings.diagnosticProfile!).nodes.length).toBe(1);
    // 残留不清则重演无意义：restart 内部先清残留再以全通基线重演
    const again = restartDrillWithBaseline("f1", "运行基线");
    expect(again.ok).toBe(true);
    expect(diagnosticSession.get().drill).not.toBeNull(); // 演练进行中（注入在图上属正常）
    restoreFaultDrill(); // 工况快照含全属性（含 fault）：正常还原不残留
    expect(drillResidueIds(store.get().diagram, store.get().diagram.settings.diagnosticProfile!).nodes.length).toBe(0);
    // 独立清除入口：手工注入残留后可一键清
    updateDiagram(draft => { draft.nodes.find(n => n.id === "n-p")!.fault = "pumpStuck"; });
    expect(clearDrillResidue(store.get().diagram, store.get().diagram.settings.diagnosticProfile!)).toBe(1);
    expect(store.get().diagram.nodes.find(n => n.id === "n-p")?.fault).toBeUndefined();
  });
});

