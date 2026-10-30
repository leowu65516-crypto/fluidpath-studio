/** 1.49.0：自建知识库编辑器（症状/原因/要点）与解绑动作 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { LangProvider } from "../i18n";
import { createMinimalBrewDiagram } from "../sample";
import { loadDiagram, setWorkMode, store } from "../store";
import { EMPTY_PROFILE } from "../fault-codes/profile";
import { addCause, addSymptom, editDiagnosticProfile, removeSymptom, setCheckGuide, unbindGroup, upgradeToKnowledgeBase } from "../fault-codes/actions";
import { FaultKnowledgeEditor } from "../components/FaultKnowledgeEditor";

function addTestGroup(): string {
  const id = "g-test";
  editDiagnosticProfile(profile => {
    profile.version = "0.4-draft";
    profile.highlightGroups.push({ id, label: { zh: "测试部件", en: "Test part" }, resolution: "explicit", nodeIds: [store.get().diagram.nodes[0].id], pipeIds: [] });
  });
  return id;
}

function loadEmptyProfileDiagram() {
  const diagram = createMinimalBrewDiagram();
  diagram.settings.diagnosticProfile = structuredClone(EMPTY_PROFILE);
  loadDiagram(diagram);
}

beforeEach(() => { setWorkMode("fault"); loadEmptyProfileDiagram(); });

describe("knowledge-base actions", () => {
  it("升级为 0.4 空知识库并补齐数组", () => {
    upgradeToKnowledgeBase();
    const profile = store.get().diagram.settings.diagnosticProfile!;
    expect(profile.version).toBe("0.4-draft");
    expect(profile.kb?.kbVersion).toBe(1);
    expect(profile.symptoms).toEqual([]);
    expect(profile.causes).toEqual([]);
    expect(profile.checkGuides).toEqual([]);
  });

  it("添加症状/原因/排查要点并通过解析器校验", () => {
    upgradeToKnowledgeBase();
    const groupId = addTestGroup();
    const symptomId = addSymptom({ zh: "不出奶", en: "No milk" }, { zh: "运行", en: "Running" });
    addCause({ symptomId, partGroupId: groupId, pr: 3, own: "store", codes: [], why: { zh: "原因", en: "Why" }, act: { zh: "对策", en: "Act" } });
    expect(store.get().diagram.settings.diagnosticProfile!.symptoms).toHaveLength(1);
    expect(store.get().diagram.settings.diagnosticProfile!.causes).toHaveLength(1);
    setCheckGuide(groupId, { zh: "检查", en: "Check" });
    expect(store.get().diagram.settings.diagnosticProfile!.checkGuides).toHaveLength(1);
  });

  it("删除症状会级联删除其下原因", () => {
    upgradeToKnowledgeBase();
    const groupId = addTestGroup();
    const symptomId = addSymptom({ zh: "症状", en: "Symptom" });
    addCause({ symptomId, partGroupId: groupId, pr: 2, own: "svc", codes: [], why: { zh: "原因", en: "Why" }, act: { zh: "对策", en: "Act" } });
    expect(store.get().diagram.settings.diagnosticProfile!.causes).toHaveLength(1);
    removeSymptom(symptomId);
    expect(store.get().diagram.settings.diagnosticProfile!.symptoms).toHaveLength(0);
    expect(store.get().diagram.settings.diagnosticProfile!.causes).toHaveLength(0);
  });

  it("添加原因引用不存在的报警码会被解析器拒绝", () => {
    upgradeToKnowledgeBase();
    const groupId = addTestGroup();
    const symptomId = addSymptom({ zh: "症状", en: "Symptom" });
    expect(() => addCause({ symptomId, partGroupId: groupId, pr: 2, own: "svc", codes: ["E999"], why: { zh: "原因", en: "Why" }, act: { zh: "对策", en: "Act" } })).toThrow(/unknown fault code/);
  });

  it("unbindGroup 只清空指定组（可撤销）", () => {
    upgradeToKnowledgeBase();
    const first = addTestGroup();
    editDiagnosticProfile(profile => {
      profile.highlightGroups.push({ id: "second", label: { zh: "第二组", en: "Second" }, resolution: "explicit", nodeIds: [store.get().diagram.nodes[1].id], pipeIds: [] });
    });
    unbindGroup(first);
    const after = store.get().diagram.settings.diagnosticProfile!;
    expect(after.highlightGroups.find(group => group.id === first)!.nodeIds).toEqual([]);
    expect(after.highlightGroups.find(group => group.id === "second")!.nodeIds).toEqual([store.get().diagram.nodes[1].id]);
  });
});

describe("FaultKnowledgeEditor UI", () => {
  it("没有知识库结构时给创建入口，创建后出现表单", () => {
    const view = render(createElement(LangProvider, null, createElement(FaultKnowledgeEditor, {
      profile: store.get().diagram.settings.diagnosticProfile!, canEdit: true, onError: () => undefined,
    })));
    const createBtn = view.getByRole("button", { name: /Create empty knowledge base/ });
    act(() => { fireEvent.click(createBtn); });
    cleanup();
    const view2 = render(createElement(LangProvider, null, createElement(FaultKnowledgeEditor, {
      profile: store.get().diagram.settings.diagnosticProfile!, canEdit: true, onError: () => undefined,
    })));
    expect(view2.getByRole("button", { name: /Add symptom/ })).toBeTruthy();
    cleanup();
  });

  it("用表单添加症状后出现在列表", () => {
    upgradeToKnowledgeBase();
    const view = render(createElement(LangProvider, null, createElement(FaultKnowledgeEditor, {
      profile: store.get().diagram.settings.diagnosticProfile!, canEdit: true, onError: () => undefined,
    })));
    act(() => {
      fireEvent.change(view.getByLabelText("Symptom (Chinese)"), { target: { value: "不出奶" } });
      fireEvent.change(view.getByLabelText("Symptom (English)"), { target: { value: "No milk" } });
      fireEvent.click(view.getByRole("button", { name: /Add symptom/ }));
    });
    expect(store.get().diagram.settings.diagnosticProfile!.symptoms?.[0]).toMatchObject({ label: { zh: "不出奶", en: "No milk" } });
    cleanup();
  });
});
