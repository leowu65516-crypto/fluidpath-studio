import { describe, it, expect, beforeEach } from "vitest";
import { loadDiagram, addLayer, removeLayer, renameLayer, setNodeLayer, store } from "../store";
import { createMinimalBrewDiagram } from "../sample";

beforeEach(() => {
  loadDiagram(createMinimalBrewDiagram());
});

describe("图层", () => {
  it("删除图层：本层元件归入剩余图层，而非永远可见", () => {
    const l2 = addLayer("第二层");
    const pumpId = store.get().diagram.nodes[0].id;
    setNodeLayer(pumpId, l2);
    removeLayer(l2);
    const d = store.get().diagram;
    const defaultId = d.settings.layers![0].id;
    expect(d.nodes.find((n) => n.id === pumpId)!.layerId).toBe(defaultId);
    expect(d.settings.layers!.length).toBe(1);
  });

  it("renameLayer 改名", () => {
    const id = store.get().diagram.settings.layers![0].id;
    renameLayer(id, "改过的名字");
    expect(store.get().diagram.settings.layers![0].name).toBe("改过的名字");
  });
});
