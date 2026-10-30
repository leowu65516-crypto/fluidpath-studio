/** 1.47.0：故障工作台前置状态机（四状态） */
import { describe, expect, it } from "vitest";
import { createEmptyDiagram, createMinimalBrewDiagram } from "../sample";
import { EMPTY_PROFILE } from "../fault-codes/profile";
import { faultWorkbenchStatus } from "../fault-codes/workbench";
import type { DiagnosticProfile, FaultCode } from "../fault-codes/types";

function profileWith(overrides: { groupNodeIds?: string[]; code?: Partial<FaultCode>; symptoms?: DiagnosticProfile["symptoms"] } = {}): DiagnosticProfile {
  const profile: DiagnosticProfile = structuredClone(EMPTY_PROFILE);
  profile.highlightGroups = [{ id: "g1", label: { zh: "水泵", en: "Pump" }, resolution: "explicit", nodeIds: overrides.groupNodeIds ?? [], pipeIds: [] }];
  profile.diagnostics = [{
    id: "f1", code: "E1", label: { zh: "测试故障", en: "Test fault" }, definitionStatus: "userDeclared",
    highlightBindings: [{ groupId: "g1", meaning: "inspectionScope" }],
    presentation: { style: "outline", color: "#d97706", animation: "none" },
    controlActions: [], rootCauseStatus: "notDetermined", ...overrides.code,
  }];
  if (overrides.symptoms) profile.symptoms = overrides.symptoms;
  return profile;
}

describe("faultWorkbenchStatus", () => {
  it("空图纸 → no-diagram（即使有知识库也先要图纸）", () => {
    const status = faultWorkbenchStatus(createEmptyDiagram(), profileWith({ groupNodeIds: ["n-x"] }));
    expect(status.stage).toBe("no-diagram");
    expect(status.hasDiagram).toBe(false);
  });

  it("有图纸但无代码/知识库 → no-library", () => {
    const status = faultWorkbenchStatus(createMinimalBrewDiagram(), structuredClone(EMPTY_PROFILE));
    expect(status.stage).toBe("no-library");
    expect(status.hasLibrary).toBe(false);
  });

  it("有代码但排查范围解析不到对象 → unbound", () => {
    const diagram = createMinimalBrewDiagram();
    const profile = profileWith({ groupNodeIds: [] });
    diagram.settings.diagnosticProfile = profile;
    const status = faultWorkbenchStatus(diagram, profile);
    expect(status.stage).toBe("unbound");
    expect(status.unboundGroupCount).toBe(1);
    expect(status.codesWithoutScope).toBe(1);
    expect(status.readyCodes).toBe(0);
  });

  it("代码有画布落点 → ready，并统计可演练代码数", () => {
    const diagram = createMinimalBrewDiagram();
    const pumpId = diagram.nodes[0].id;
    const profile = profileWith({ groupNodeIds: [pumpId], code: { drill: { actions: [{ groupId: "g1", behavior: "stopped" }] } } });
    diagram.settings.diagnosticProfile = profile;
    const status = faultWorkbenchStatus(diagram, profile);
    expect(status.stage).toBe("ready");
    expect(status.readyCodes).toBe(1);
    expect(status.codesWithoutScope).toBe(0);
    expect(status.drillCount).toBe(1);
    expect(status.boundGroupCount).toBe(1);
  });

  it("只有知识库症状（无代码）也算有库，但无落点时仍是 unbound", () => {
    const diagram = createMinimalBrewDiagram();
    const profile = structuredClone(EMPTY_PROFILE);
    profile.version = "0.3-draft";
    profile.highlightGroups = [{ id: "g1", label: { zh: "奶箱", en: "Tank" }, resolution: "explicit", nodeIds: [], pipeIds: [] }];
    profile.symptoms = [{ id: "s1", label: { zh: "不出奶", en: "No milk" } }];
    diagram.settings.diagnosticProfile = profile;
    const status = faultWorkbenchStatus(diagram, profile);
    expect(status.hasLibrary).toBe(true);
    expect(status.stage).toBe("unbound");
    expect(status.codeCount).toBe(0);
  });
});
