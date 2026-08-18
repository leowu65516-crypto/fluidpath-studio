import { describe, expect, it } from "vitest";
import { createWorkingCopy, loadDiagram, patchNode, store } from "../store";
import { createSampleDiagram } from "../sample";

describe("编辑副本", () => {
  it("创建独立 ID，后续修改只作用于副本", () => {
    const original = createSampleDiagram();
    original.name = "原始图纸";
    loadDiagram(original);
    const copy = createWorkingCopy();
    const nodeId = copy.nodes[0].id;
    patchNode(nodeId, { label: "仅副本修改" });

    expect(copy.id).not.toBe(original.id);
    expect(copy.settings.workingCopyOf).toBe(original.id);
    expect(store.get().diagram.nodes[0].label).toBe("仅副本修改");
    expect(original.nodes[0].label).not.toBe("仅副本修改");
  });
});
