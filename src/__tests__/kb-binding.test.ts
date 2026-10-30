/** 1.46.0：知识库绑定辅助 / 导入合并 / 咨询选择保持 / 删除引用清理 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDiagnosticProfile, mergeProfileBindings, EMPTY_PROFILE } from "../fault-codes/profile";
import { importFaultCatalog, deleteFaultCode } from "../fault-codes/actions";
import { normalizePartLabel, unboundGroups, suggestGroupTargets } from "../fault-codes/binding";
import { codeReferences, dominantOwn } from "../fault-codes/consult";
import { invalidateDiagnosticSimulation, selectKbSymptom, selectKbPart, diagnosticSession, resetDiagnosticSession } from "../fault-codes/session";
import { loadDiagram, setWorkMode, setSelection, store, undo } from "../store";
import { createEmptyDiagram } from "../sample";
import type { DiagnosticProfile } from "../fault-codes/types";
import type { Diagram } from "../types";

const GOLDEN: DiagnosticProfile = parseDiagnosticProfile(
  JSON.parse(readFileSync(resolve(__dirname, "../../MILK-KB.fluidkb.json"), "utf8")),
);

function syntheticDiagram(): Diagram {
  const d = createEmptyDiagram();
  const node = (id: string, label: string, type: Diagram["nodes"][number]["type"]) => ({
    id, type, label, x: 0, y: 0, width: 80, height: 60, rotation: 0, fill: "#fff", stroke: "#333", ports: [],
  });
  d.nodes.push(
    node("n-pump", "奶泵", "milkPump"),
    node("n-hose1", "进奶管路 1", "tee"),
    node("n-hose2", "进奶管路 2", "tee"),
    node("n-boiler", "蒸汽锅炉", "steamBoiler"),
  );
  return d;
}

function loadKbDiagram(profile: DiagnosticProfile = structuredClone(GOLDEN)) {
  const d = syntheticDiagram();
  d.settings.diagnosticProfile = profile;
  loadDiagram(d);
  return d;
}

beforeEach(() => { setWorkMode("fault"); resetDiagnosticSession(); });

describe("部件名归一与落点建议", () => {
  it("去掉手册编号前缀与括号注释", () => {
    expect(normalizePartLabel({ zh: "16. 进奶管路" })).toBe("进奶管路");
    expect(normalizePartLabel({ zh: "13. 蒸汽三通电磁阀" })).toBe("蒸汽三通电磁阀");
    expect(normalizePartLabel({ zh: "5. 两通隔膜阀(奶输送)" })).toBe("两通隔膜阀");
    expect(normalizePartLabel({ zh: "（注）奶箱" })).toBe("奶箱");
  });

  it("只建议名称匹配的元件，全等优先、包含其次", () => {
    const d = syntheticDiagram();
    const pump = { id: "g1", label: { zh: "8. 奶泵", en: "8. Milk Pump" }, resolution: "explicit" as const, nodeIds: [], pipeIds: [] };
    expect(suggestGroupTargets(d, pump).nodes).toEqual(["n-pump"]);
    const hose = { id: "g2", label: { zh: "16. 进奶管路", en: "16. Milk Hose" }, resolution: "explicit" as const, nodeIds: [], pipeIds: [] };
    expect(suggestGroupTargets(d, hose).nodes).toEqual(["n-hose1", "n-hose2"]);
  });

  it("建议不到时返回空（手册类别/英文标签/核心过短）", () => {
    const d = syntheticDiagram();
    const make = (zh: string, en = "") => ({ id: "g", label: { zh, en }, resolution: "explicit" as const, nodeIds: [], pipeIds: [] });
    expect(suggestGroupTargets(d, make("配方与软件设置")).nodes).toEqual([]);
    expect(suggestGroupTargets(d, make("", "Milk Tank")).nodes).toEqual([]);
    expect(suggestGroupTargets(d, make("A")).nodes).toEqual([]);
  });

  it("未绑定清单只统计两侧都为空的部件组", () => {
    const p = structuredClone(GOLDEN);
    p.highlightGroups[0].nodeIds = ["n-pump"];
    expect(unboundGroups(p)).toHaveLength(p.highlightGroups.length - 1);
  });
});

describe("导入合并（协议 §18.5）", () => {
  it("同 namespace 且带 KB 元数据：按部件组 id 保留绑定", () => {
    loadKbDiagram();
    const top = GOLDEN.highlightGroups[0].id;
    store.get().diagram.settings.diagnosticProfile!.highlightGroups.find(g => g.id === top)!.nodeIds = ["n-pump"];
    const result = importFaultCatalog(JSON.stringify(GOLDEN));
    expect(result.preservedBindings).toBe(true);
    expect(store.get().diagram.settings.diagnosticProfile!.highlightGroups.find(g => g.id === top)!.nodeIds).toEqual(["n-pump"]);
    expect(result.conflicts).toEqual([]);
  });

  it("新库删除已绑定部件组：保留其它绑定并报冲突清单", () => {
    const makeProfile = (groupIdList: string[], bound: Record<string, string[]>): DiagnosticProfile => parseDiagnosticProfile({
      format: "fluidpath.diagnostic-profile", version: "0.3-draft", namespace: "caye.test",
      source: { kind: "userDeclared", appliesToRealMachine: false },
      kb: { kbVersion: 3, source: { zh: "测试手册", en: "Test handbook" }, updatedAt: "2026-10-30" },
      signalDefinitions: [],
      highlightGroups: groupIdList.map(id => ({ id, label: { zh: id, en: id }, resolution: "explicit", nodeIds: bound[id] ?? [], pipeIds: [] })),
      diagnostics: [{ id: "code-1", code: "T1", label: { zh: "测试码", en: "Test code" }, definitionStatus: "userDeclared", highlightBindings: [{ groupId: groupIdList[0], meaning: "inspectionScope" }], presentation: { style: "outline", color: "#d97706", animation: "none" }, controlActions: [], rootCauseStatus: "notDetermined", troubleshooting: [] }],
      symptoms: [{ id: "s1", label: { zh: "症状", en: "Symptom" } }],
      causes: [{ id: "c1", partGroupId: groupIdList[0], symptomId: "s1", pr: 3, own: "store", codes: ["T1"], why: { zh: "原因", en: "Why" }, act: { zh: "对策", en: "Act" } }],
      checkGuides: [],
    });
    const previous = makeProfile(["g-keep", "g-drop"], { "g-keep": ["n-pump"], "g-drop": ["n-hose1"] });
    const d = syntheticDiagram(); d.settings.diagnosticProfile = previous; loadDiagram(d);
    const next = makeProfile(["g-keep"], {});
    const result = importFaultCatalog(JSON.stringify(next));
    expect(result.preservedBindings).toBe(true);
    expect(result.conflicts).toEqual(["g-drop"]);
    expect(store.get().diagram.settings.diagnosticProfile!.highlightGroups.find(g => g.id === "g-keep")!.nodeIds).toEqual(["n-pump"]);
  });

  it("跨 namespace / 无 KB 元数据：仍然 detach，避免旧 ID 误绑", () => {
    const d = syntheticDiagram();
    d.settings.diagnosticProfile = structuredClone(EMPTY_PROFILE);
    loadDiagram(d);
    const result = importFaultCatalog(JSON.stringify(GOLDEN));
    expect(result.preservedBindings).toBe(false);
    expect(store.get().diagram.settings.diagnosticProfile!.highlightGroups.every(g => g.nodeIds.length === 0)).toBe(true);
  });

  it("mergeProfileBindings 纯函数：无旧库时原样返回、冲突为空", () => {
    const merged = mergeProfileBindings(GOLDEN);
    expect(merged.conflicts).toEqual([]);
    expect(merged.profile.highlightGroups.every(g => g.nodeIds.length === 0)).toBe(true);
  });
});

describe("咨询选择与 profile 变更", () => {
  it("绑定/编辑后症状与部件选择保持（id 仍存在）", () => {
    loadKbDiagram();
    selectKbSymptom("nomilk");
    selectKbPart("part-hose");
    invalidateDiagnosticSimulation(store.get().diagram.settings.diagnosticProfile!);
    expect(diagnosticSession.get().kbSymptomId).toBe("nomilk");
    expect(diagnosticSession.get().kbPartGroupId).toBe("part-hose");
  });

  it("症状/部件在新 profile 中不存在时清空", () => {
    loadKbDiagram();
    selectKbSymptom("nomilk");
    selectKbPart("part-hose");
    invalidateDiagnosticSimulation(structuredClone(EMPTY_PROFILE));
    expect(diagnosticSession.get().kbSymptomId).toBeNull();
    expect(diagnosticSession.get().kbPartGroupId).toBeNull();
  });
});

describe("删除故障码与知识库引用", () => {
  it("被 causes 引用时默认拒绝，删除并清理引用后可通过校验且可撤销", () => {
    loadKbDiagram();
    const fault = store.get().diagram.settings.diagnosticProfile!.diagnostics.find(f => f.code === "E041")!;
    expect(() => deleteFaultCode(fault.id)).toThrow(/Referenced by/);
    expect(store.get().diagram.settings.diagnosticProfile!.diagnostics.some(f => f.id === fault.id)).toBe(true);
    deleteFaultCode(fault.id, { removeReferences: true });
    const profile = store.get().diagram.settings.diagnosticProfile!;
    expect(profile.diagnostics.some(f => f.id === fault.id)).toBe(false);
    expect((profile.causes ?? []).some(cause => cause.codes.includes("E041"))).toBe(false);
    undo();
    const restored = store.get().diagram.settings.diagnosticProfile!;
    expect(restored.diagnostics.some(f => f.id === fault.id)).toBe(true);
    expect((restored.causes ?? []).some(cause => cause.codes.includes("E041"))).toBe(true);
  });

  it("未被引用的码可直接删除（E038）", () => {
    loadKbDiagram();
    const fault = store.get().diagram.settings.diagnosticProfile!.diagnostics.find(f => f.code === "E038")!;
    expect(codeReferences(store.get().diagram.settings.diagnosticProfile!, "E038")).toHaveLength(0);
    deleteFaultCode(fault.id);
    expect(store.get().diagram.settings.diagnosticProfile!.diagnostics.some(f => f.id === fault.id)).toBe(false);
  });
});

describe("处置归属唯一取值", () => {
  it("门店优先于先排查后报修，svc 最后", () => {
    const cause = (own: "store" | "svc" | "both") => ({ own } as Parameters<typeof dominantOwn>[0][number]);
    expect(dominantOwn([cause("svc"), cause("store")])).toBe("store");
    expect(dominantOwn([cause("both"), cause("svc")])).toBe("both");
    expect(dominantOwn([cause("svc")])).toBe("svc");
    expect(dominantOwn([])).toBe("svc");
  });
});

describe("setSelection 兜底（绑定动作依赖）", () => {
  it("选择节点后可以被读取", () => {
    loadKbDiagram();
    setSelection({ nodes: ["n-pump"], pipes: [] });
    expect(store.get().ui.selection.nodes).toEqual(["n-pump"]);
  });
});
