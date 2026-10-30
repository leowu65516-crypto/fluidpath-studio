/** 1.48.0：故障模式备注/高亮（仅故障模式显示，随图纸保存） */
import { beforeEach, describe, expect, it } from "vitest";
import { createMinimalBrewDiagram } from "../sample";
import { loadDiagram, setSelection, setWorkMode, store } from "../store";
import { addFaultNote, clearFaultNotes, faultNotes, removeFaultNote } from "../fault-codes/notes";
import { parseDiagramJSON } from "../export";
import { EMPTY_PROFILE } from "../fault-codes/profile";

beforeEach(() => {
  setWorkMode("fault");
  const diagram = createMinimalBrewDiagram();
  diagram.settings.diagnosticProfile = structuredClone(EMPTY_PROFILE);
  loadDiagram(diagram);
  setSelection({ nodes: [], pipes: [] });
});

describe("fault notes", () => {
  it("没有画布选择时拒绝创建", () => {
    expect(addFaultNote("检查奶管")).toBeNull();
    expect(faultNotes(store.get().diagram)).toHaveLength(0);
  });

  it("用当前选择创建备注，可删除、可清空", () => {
    const nodeId = store.get().diagram.nodes[0].id;
    setSelection({ nodes: [nodeId], pipes: [] });
    const id = addFaultNote("检查这里是否需要拆机");
    expect(id).toBeTruthy();
    const notes = faultNotes(store.get().diagram);
    expect(notes).toHaveLength(1);
    expect(notes[0].nodeIds).toEqual([nodeId]);
    removeFaultNote(id!);
    expect(faultNotes(store.get().diagram)).toHaveLength(0);
    addFaultNote("第二条");
    clearFaultNotes();
    expect(faultNotes(store.get().diagram)).toHaveLength(0);
  });

  it("备注随图纸 JSON 保存/读取（序列化不丢）", () => {
    const nodeId = store.get().diagram.nodes[0].id;
    setSelection({ nodes: [nodeId], pipes: [] });
    addFaultNote("随图纸保存");
    const raw = JSON.stringify({ ...store.get().diagram, _version: 3 });
    const restored = parseDiagramJSON(raw);
    expect(restored.settings.faultNotes?.[0]?.text).toBe("随图纸保存");
    expect(restored.settings.faultNotes?.[0]?.nodeIds).toEqual([nodeId]);
  });
});
