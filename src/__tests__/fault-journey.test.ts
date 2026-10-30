/** 1.50.0：故障模式"下一步"推导（操作闭环的单一事实来源） */
import { describe, expect, it } from "vitest";
import { createEmptyDiagram, createMinimalBrewDiagram } from "../sample";
import { loadDiagram, store } from "../store";
import { EMPTY_PROFILE } from "../fault-codes/profile";
import { deriveFaultJourney, firstRunnableCode } from "../fault-codes/journey";
import type { DiagnosticProfile, FaultCode } from "../fault-codes/types";

function setup(code: Partial<FaultCode> = {}, bound = false): { diagram: ReturnType<typeof createMinimalBrewDiagram>; profile: DiagnosticProfile } {
  const diagram = createMinimalBrewDiagram();
  const profile = structuredClone(EMPTY_PROFILE);
  profile.version = "0.4-draft";
  profile.highlightGroups = [{ id: "g1", label: { zh: "奶泵", en: "Milk pump" }, resolution: "explicit", nodeIds: bound ? [diagram.nodes[0].id] : [], pipeIds: [] }];
  profile.diagnostics = [{
    id: "f1", code: "E045", label: { zh: "奶泵故障", en: "Milk pump" }, definitionStatus: "userDeclared",
    highlightBindings: [{ groupId: "g1", meaning: "inspectionScope" }],
    presentation: { style: "outline", color: "#d97706", animation: "none" },
    troubleshooting: [], controlActions: [], rootCauseStatus: "notDetermined",
    drill: { actions: [{ groupId: "g1", behavior: "stopped" }] },
    ...code,
  }];
  diagram.settings.diagnosticProfile = profile;
  loadDiagram(diagram);
  return { diagram, profile };
}

describe("deriveFaultJourney", () => {
  it("无图纸 → 去图纸", () => {
    loadDiagram(createEmptyDiagram());
    const journey = deriveFaultJourney(store.get().diagram, EMPTY_PROFILE);
    expect(journey.kind).toBe("needs-diagram");
    expect(journey.step).toBe(1);
  });

  it("有图纸无库 → 去故障库", () => {
    const diagram = createMinimalBrewDiagram();
    diagram.settings.diagnosticProfile = structuredClone(EMPTY_PROFILE);
    loadDiagram(diagram);
    expect(deriveFaultJourney(diagram, diagram.settings.diagnosticProfile!).kind).toBe("needs-library");
  });

  it("全部未绑定 → 引导绑定第一个组", () => {
    const { diagram, profile } = setup();
    const journey = deriveFaultJourney(diagram, profile);
    expect(journey.kind).toBe("needs-binding");
    expect(journey.step).toBe(3);
    expect(journey.groups).toEqual(["g1"]);
  });

  it("部分已绑定 → 可先去演练（drill-or-bind）", () => {
    const { diagram, profile } = setup({}, true);
    profile.highlightGroups.push({ id: "g2", label: { zh: "第二组", en: "Second" }, resolution: "explicit", nodeIds: [], pipeIds: [] });
    const journey = deriveFaultJourney(diagram, profile);
    expect(journey.kind).toBe("drill-or-bind");
    expect(journey.code).toBe("E045");
  });

  it("已全部绑定但未选码 → select-code，并给出第一个可演练代码", () => {
    const { diagram, profile } = setup({}, true);
    expect(firstRunnableCode(diagram, profile)?.code).toBe("E045");
    const journey = deriveFaultJourney(diagram, profile);
    expect(journey.kind).toBe("select-code");
    expect(journey.codeId).toBe("f1");
  });

  it("停在落点步骤：未绑完 → bind-more；全部绑完 → bind-done", () => {
    const partial = setup({}, true);
    partial.profile.highlightGroups.push({ id: "g2", label: { zh: "第二组", en: "Second" }, resolution: "explicit", nodeIds: [], pipeIds: [] });
    expect(deriveFaultJourney(partial.diagram, partial.profile, { step: 3 }).kind).toBe("bind-more");
    const done = setup({}, true);
    expect(deriveFaultJourney(done.diagram, done.profile, { step: 3 }).kind).toBe("bind-done");
  });

  it("选中可演练代码 → drill-ready；演练中 → drill-live", () => {
    const { diagram, profile } = setup({}, true);
    expect(deriveFaultJourney(diagram, profile, { selectedCodeId: "f1" }).kind).toBe("drill-ready");
    expect(deriveFaultJourney(diagram, profile, { selectedCodeId: "f1", drillActive: true }).kind).toBe("drill-live");
  });

  it("有落点但无演练配置 → no-drill-config", () => {
    const { diagram, profile } = setup({ drill: undefined }, true);
    expect(deriveFaultJourney(diagram, profile, { selectedCodeId: "f1" }).kind).toBe("no-drill-config");
  });

  it("选中无落点代码 → no-scope，并给绑定范围", () => {
    const { diagram, profile } = setup();
    const journey = deriveFaultJourney(diagram, profile, { selectedCodeId: "f1" });
    expect(journey.kind).toBe("no-scope");
    expect(journey.groups).toEqual(["g1"]);
  });
});
