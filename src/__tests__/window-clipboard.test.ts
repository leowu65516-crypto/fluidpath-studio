import { describe, expect, it } from "vitest";
import { createSampleDiagram } from "../sample";
import {
  copyToClipboard,
  loadDiagram,
  parseSelectionClipboard,
  pasteFromClipboard,
  serializeSelectionClipboard,
  setSelection,
  store,
} from "../store";

describe("跨窗口选中内容复制", () => {
  it("框选节点时会带上两端都在选区内的内部管路", () => {
    const diagram = createSampleDiagram();
    loadDiagram(diagram);
    setSelection({ nodes: diagram.nodes.map((node) => node.id), pipes: [] });

    copyToClipboard();
    const clip = store.get().ui.clipboard!;
    expect(clip.nodes).toHaveLength(3);
    expect(clip.pipes).toHaveLength(2);

    const restored = parseSelectionClipboard(serializeSelectionClipboard(clip));
    expect(restored).toEqual(clip);
  });

  it("粘贴会生成新的节点和端口 ID，不会连接回窗口 A 的对象", () => {
    const diagram = createSampleDiagram();
    loadDiagram(diagram);
    setSelection({ nodes: diagram.nodes.map((node) => node.id), pipes: [] });
    copyToClipboard();
    pasteFromClipboard();

    const pasted = store.get().diagram;
    expect(pasted.nodes).toHaveLength(6);
    expect(pasted.pipes).toHaveLength(4);
    const originalIds = new Set(diagram.nodes.map((node) => node.id));
    expect(pasted.nodes.slice(3).every((node) => !originalIds.has(node.id))).toBe(true);
  });

  it("拒绝无效或其他应用的剪贴板文本", () => {
    expect(parseSelectionClipboard('{"kind":"other"}')).toBeNull();
    expect(parseSelectionClipboard("not-json")).toBeNull();
  });
});
