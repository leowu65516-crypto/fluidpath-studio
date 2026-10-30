/** 知识库咨询 UI：面板渲染、分档视觉、孤儿组保护 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KbConsultPanel } from "../components/KbConsultPanel";
import { FaultHighlightOverlay } from "../components/FaultHighlightOverlay";
import { FaultCodePanel } from "../components/FaultCodePanel";
import { LangProvider } from "../i18n";
import { loadDiagram, setWorkMode, store, updateDiagram } from "../store";
import { EMPTY_PROFILE, parseDiagnosticProfile } from "../fault-codes/profile";
import { createFaultCode, deleteFaultCode } from "../fault-codes/actions";
import { selectKbSymptom, selectKbPart, resetDiagnosticSession, diagnosticSession } from "../fault-codes/session";
import { suspectsForSymptom } from "../fault-codes/consult";
import { createEmptyDiagram } from "../sample";
import type { DiagnosticProfile } from "../fault-codes/types";

const GOLDEN: DiagnosticProfile = parseDiagnosticProfile(
  JSON.parse(readFileSync(resolve(__dirname, "../../MILK-KB.fluidkb.json"), "utf8")),
);

function loadKbDiagram() {
  const d = createEmptyDiagram();
  d.settings.diagnosticProfile = structuredClone(GOLDEN);
  // 空图无节点会让绑定/描边断言空转：放两个最小节点作为绑定落点
  d.nodes.push(
    { id: "n-inlet", type: "inlet", label: "Inlet", x: 0, y: 0, width: 72, height: 36, rotation: 0, fill: "#fff", stroke: "#333", ports: [] },
    { id: "n-pump", type: "pump", label: "Pump", x: 200, y: 0, width: 90, height: 90, rotation: 0, fill: "#fff", stroke: "#333", ports: [] },
  );
  loadDiagram(d);
}

beforeEach(() => { setWorkMode("fault"); resetDiagnosticSession(); loadKbDiagram(); });

describe("KbConsultPanel", () => {
  it("症状 chips 按分组渲染；点症状出现嫌疑分档并按 pr 排序", () => {
    const view = render(createElement(LangProvider, null, createElement(KbConsultPanel, { profile: store.get().diagram.settings.diagnosticProfile!, canEdit: true, onError: () => undefined, onImport: () => undefined, onLoadSample: () => undefined })));
    const chips = view.getAllByRole("button", { name: /Outlet temp too high|No milk/i });
    expect(chips.length).toBeGreaterThanOrEqual(2);
    act(() => { fireEvent.click(view.getByRole("button", { name: /No milk \/ steam only/ })); });
    const suspects = view.getByTestId("kb-suspects");
    const first = suspects.firstElementChild!;
    expect(first.className).toContain("pr3");
    // 状态条填充
    const status = view.getByTestId("kb-status").textContent ?? "";
    expect(status).toContain("No milk");
    cleanup();
  });

  it("点部件出现详情卡：排查要点 + 为什么/对策 + 绑定按钮", () => {
    const view = render(createElement(LangProvider, null, createElement(KbConsultPanel, { profile: store.get().diagram.settings.diagnosticProfile!, canEdit: true, onError: () => undefined, onImport: () => undefined, onLoadSample: () => undefined })));
    act(() => { fireEvent.click(view.getByRole("button", { name: /No milk \/ steam only/ })); });
    // 选一个带排查要点的实体件（奶箱），而非首个嫌疑（清洗阀组无 guide）
    const rows = [...view.getByTestId("kb-suspects").querySelectorAll<HTMLButtonElement>(".kb-suspect-head")];
    const tankRow = rows.find(r => r.textContent?.includes("Milk Tank")) ?? rows[0];
    act(() => { fireEvent.click(tankRow); });
    const detail = view.getByTestId("kb-detail");
    expect(detail.textContent).toContain("Why");
    expect(detail.textContent).toContain("Action");
    expect(detail.textContent).toContain("Inspection points");
    expect(detail.textContent).toContain("Locate part");
    cleanup();
  });
});

describe("FaultHighlightOverlay KB 分层", () => {
  it("选中症状渲染 pr 分档描边（data-kb-suspect=3/2/1），选中部件变蓝", () => {
    const suspects = suspectsForSymptom(store.get().diagram.settings.diagnosticProfile!, "nomilk");
    expect(suspects.length).toBeGreaterThan(0);
    // 先绑定 pr3 首要组到全部节点，再渲染（渲染持有 diagram 引用快照）
    const top = suspects[0];
    updateDiagram(doc => {
      const g = doc.settings.diagnosticProfile!.highlightGroups.find(x => x.id === top.groupId)!;
      g.nodeIds = doc.nodes.map(n => n.id);
    });
    const d = store.get().diagram;
    const svg = render(createElement("svg", null, createElement(FaultHighlightOverlay, { diagram: d, visibleNodes: new Set(d.nodes.map(n => n.id)), visiblePipes: new Set(d.pipes.map(p => p.id)) })));
    expect(svg.container.querySelector("[data-kb-consult]")).toBeNull(); // 未选症状
    act(() => { selectKbSymptom("nomilk"); });
    const g3 = svg.container.querySelector(`[data-kb-suspect="3"]`);
    expect(g3).not.toBeNull();
    expect(g3!.querySelector("rect[data-fault-target]")).not.toBeNull();
    act(() => { selectKbPart(top.groupId); });
    expect(svg.container.querySelector(`[data-kb-suspect="3"]`)?.getAttribute("stroke")).toBe("#2563eb");
    cleanup();
    resetDiagnosticSession();
  });
});

describe("KB 部件组孤儿保护", () => {
  it("删除无码引用的故障码不清除 causes 引用的部件组", () => {
    const before = store.get().diagram.settings.diagnosticProfile!;
    const groupsBefore = before.highlightGroups.map(g => g.id).sort().join(",");
    const id = createFaultCode("TMP", "临时", "zh");
    act(() => { deleteFaultCode(id); });
    const after = store.get().diagram.settings.diagnosticProfile!;
    expect(after.highlightGroups.map(g => g.id).sort().join(",")).toBe(groupsBefore);
  });
});

describe("1.46.0 咨询台联动与引导", () => {
  it("点故障码会反查知识库症状与部件", () => {
    const view = render(createElement(LangProvider, null, createElement(FaultCodePanel, { onClose: () => undefined })));
    const list = view.container.querySelector(".fault-code-list")!;
    const codeButton = [...list.querySelectorAll("button")].find(button => button.textContent?.includes("E045"));
    expect(codeButton).toBeTruthy();
    act(() => { fireEvent.click(codeButton!); });
    expect(diagnosticSession.get().kbSymptomId).toBeTruthy();
    expect(diagnosticSession.get().kbPartGroupId).toBeTruthy();
    expect(view.getByTestId("kb-status").textContent).not.toContain("None");
    cleanup();
  });

  it("无知识库时给出示例/导入引导，点击示例走预览回调", () => {
    const d = createEmptyDiagram();
    d.settings.diagnosticProfile = structuredClone(EMPTY_PROFILE);
    loadDiagram(d);
    let sampleClicked = 0;
    const view = render(createElement(LangProvider, null, createElement(KbConsultPanel, {
      profile: store.get().diagram.settings.diagnosticProfile!,
      canEdit: true, onError: () => undefined, onImport: () => undefined,
      onLoadSample: () => { sampleClicked += 1; },
    })));
    expect(view.container.querySelector('[data-kb-empty="1"]')).toBeTruthy();
    act(() => { fireEvent.click(view.getByRole("button", { name: "Load sample knowledge base" })); });
    expect(sampleClicked).toBe(1);
    cleanup();
  });

  it("绑定工作台列出未绑定部件组并显示计数", () => {
    const view = render(createElement(LangProvider, null, createElement(KbConsultPanel, {
      profile: store.get().diagram.settings.diagnosticProfile!,
      canEdit: true, onError: () => undefined, onImport: () => undefined, onLoadSample: () => undefined,
    })));
    const bindBox = view.container.querySelector(".kb-bind-box");
    expect(bindBox).toBeTruthy();
    expect(bindBox!.textContent).toContain("Unbound");
    expect(view.container.querySelectorAll(".kb-unbound")).toHaveLength(GOLDEN.highlightGroups.length);
    cleanup();
  });
});
