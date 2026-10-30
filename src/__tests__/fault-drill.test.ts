/** 1.47.0：故障演练（0.4-draft）——注入解析、引擎差异、还原与版本门控 */
import { beforeEach, describe, expect, it } from "vitest";
import { createMinimalBrewDiagram } from "../sample";
import { loadDiagram, setWorkMode, store, undo } from "../store";
import { EMPTY_PROFILE, parseDiagnosticProfile } from "../fault-codes/profile";
import { applyDrillToDiagram, pipeStopSet, resolveDrillTargets, restoreFaultDrill, startFaultDrill } from "../fault-codes/drill";
import { diagnosticSession, resetDiagnosticSession } from "../fault-codes/session";
import type { DiagnosticProfile, FaultCode } from "../fault-codes/types";
import type { Diagram } from "../types";

function makeDiagram(actions: Array<{ groupId: string; behavior: "stopped" | "stuckClosed" | "disabled" | "enabled" }> = [{ groupId: "g-pump", behavior: "stopped" }]): Diagram {
  const diagram = createMinimalBrewDiagram();
  const pumpId = diagram.nodes[0].id;
  const profile: DiagnosticProfile = structuredClone(EMPTY_PROFILE);
  profile.version = "0.4-draft";
  profile.highlightGroups = [{ id: "g-pump", label: { zh: "水泵", en: "Pump" }, resolution: "explicit", nodeIds: [pumpId], pipeIds: [] }];
  const fault: FaultCode = {
    id: "f1", code: "E-PUMP", label: { zh: "泵停", en: "Pump stopped" }, definitionStatus: "userDeclared",
    highlightBindings: [{ groupId: "g-pump", meaning: "inspectionScope" }],
    presentation: { style: "outline", color: "#d97706", animation: "none" },
    troubleshooting: [], controlActions: [], rootCauseStatus: "notDetermined",
    drill: { note: { zh: "水泵停止", en: "Pump stopped" }, actions },
  };
  profile.diagnostics = [fault];
  diagram.settings.diagnosticProfile = profile;
  return diagram;
}

beforeEach(() => { setWorkMode("fault"); resetDiagnosticSession(); });

describe("resolveDrillTargets", () => {
  it("按部件组解析到元件，并把 stopped 映射为 pumpOn=false", () => {
    const diagram = makeDiagram();
    const profile = diagram.settings.diagnosticProfile!;
    const targets = resolveDrillTargets(diagram, profile, profile.diagnostics[0].drill!);
    expect(targets.nodes).toHaveLength(1);
    expect(targets.nodes[0].nodeId).toBe(diagram.nodes[0].id);
    expect(targets.nodes[0].patch.pumpOn).toBe(false);
    expect(targets.missingGroups).toEqual([]);
  });

  it("未绑定的部件组进入 missingGroups（演练可继续但提示不完整）", () => {
    const diagram = makeDiagram();
    const profile = diagram.settings.diagnosticProfile!;
    profile.highlightGroups[0].nodeIds = [];
    const targets = resolveDrillTargets(diagram, profile, profile.diagnostics[0].drill!);
    expect(targets.nodes).toHaveLength(0);
    expect(targets.missingGroups).toEqual(["g-pump"]);
  });

  it("applyDrillToDiagram 只改 draft，不碰源图纸", () => {
    const diagram = makeDiagram();
    const profile = diagram.settings.diagnosticProfile!;
    const beforePumpOn = diagram.nodes[0].pumpOn;
    const preview = structuredClone(diagram);
    applyDrillToDiagram(preview, profile, profile.diagnostics[0].drill!);
    expect(preview.nodes[0].pumpOn).toBe(false);
    expect(diagram.nodes[0].pumpOn).toBe(beforePumpOn);
  });
});

describe("startFaultDrill / restoreFaultDrill", () => {
  it("注入后产生新增停流差异，会话可读，还原后恢复原状态", () => {
    const diagram = makeDiagram();
    loadDiagram(diagram);
    const beforeStops = pipeStopSet(store.get().diagram);
    const result = startFaultDrill("f1");
    expect(result.ok).toBe(true);
    expect(store.get().diagram.nodes[0].pumpOn).toBe(false);
    expect(diagnosticSession.get().drill?.faultCode).toBe("E-PUMP");
    expect(diagnosticSession.get().drill!.changes.stoppedPipes.length).toBeGreaterThan(0);
    for (const pipeId of diagnosticSession.get().drill!.changes.stoppedPipes) expect(beforeStops.has(pipeId)).toBe(false);
    expect(restoreFaultDrill()).toBe(true);
    expect(diagnosticSession.get().drill).toBeNull();
    expect(store.get().diagram.nodes[0].pumpOn).toBe(true);
    expect(pipeStopSet(store.get().diagram)).toEqual(beforeStops);
  });

  it("没有演练配置时返回 no-drill", () => {
    const diagram = makeDiagram();
    diagram.settings.diagnosticProfile!.diagnostics[0].drill = undefined;
    loadDiagram(diagram);
    expect(startFaultDrill("f1").reason).toBe("no-drill");
  });

  it("演练是一次可撤销更新：undo 可回到演练前", () => {
    loadDiagram(makeDiagram());
    startFaultDrill("f1");
    expect(store.get().diagram.nodes[0].pumpOn).toBe(false);
    undo();
    expect(store.get().diagram.nodes[0].pumpOn).toBe(true);
    resetDiagnosticSession();
  });
});

describe("0.4 parser drill gates", () => {
  const base = () => {
    const profile = structuredClone(EMPTY_PROFILE);
    profile.version = "0.4-draft";
    profile.highlightGroups = [{ id: "g1", label: { zh: "泵", en: "Pump" }, resolution: "explicit", nodeIds: [], pipeIds: [] }];
    profile.diagnostics = [{
      id: "f1", code: "E1", label: { zh: "故障", en: "Fault" }, definitionStatus: "userDeclared",
      highlightBindings: [{ groupId: "g1", meaning: "inspectionScope" }],
      presentation: { style: "outline", color: "#d97706", animation: "none" },
      troubleshooting: [], controlActions: [], rootCauseStatus: "notDetermined",
    }];
    return profile;
  };

  it("0.4 接受合法 drill 并强制组引用/行为枚举", () => {
    const good = base();
    good.diagnostics[0].drill = { note: { zh: "说明", en: "Note" }, actions: [{ groupId: "g1", behavior: "stopped" }] };
    const parsed = parseDiagnosticProfile(good);
    expect(parsed.diagnostics[0].drill?.actions?.[0].behavior).toBe("stopped");

    const badGroup = structuredClone(good);
    badGroup.diagnostics[0].drill!.actions![0].groupId = "ghost";
    expect(() => parseDiagnosticProfile(badGroup)).toThrow(/unknown highlight group/);

    const badBehavior = structuredClone(good);
    (badBehavior.diagnostics[0].drill!.actions![0] as { behavior: string }).behavior = "explode";
    expect(() => parseDiagnosticProfile(badBehavior)).toThrow(/unknown drill behavior/);
  });

  it("0.3 声明 drill 被版本门控拒绝", () => {
    const profile = base();
    (profile as { version: string }).version = "0.3-draft";
    profile.diagnostics[0].drill = { actions: [{ groupId: "g1", behavior: "stopped" }] };
    expect(() => parseDiagnosticProfile(profile)).toThrow(/unsupported field/);
  });
});
