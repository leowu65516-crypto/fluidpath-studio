import { describe, it, expect, beforeEach } from "vitest";
import {
  store,
  newDiagram,
  addNodeAt,
  deleteSelection,
  clearSelection,
  selectNode,
  selectPipe,
  canUndo,
  canRedo,
  undo,
  redo,
  updateDiagram,
} from "../store";

beforeEach(() => {
  newDiagram();
});

describe("newDiagram", () => {
  it("creates an empty diagram", () => {
    const s = store.get();
    expect(s.diagram.nodes).toHaveLength(0);
    expect(s.diagram.pipes).toHaveLength(0);
  });
});

describe("addNodeAt", () => {
  it("adds a node and selects it", () => {
    const node = addNodeAt("tank", 100, 200);
    const s = store.get();
    expect(s.diagram.nodes).toHaveLength(1);
    expect(s.diagram.nodes[0].id).toBe(node.id);
    expect(s.ui.selection.nodes).toContain(node.id);
  });
});

describe("selection", () => {
  it("selectNode selects a node", () => {
    const node = addNodeAt("pump", 100, 200);
    selectNode(node.id);
    const s = store.get();
    expect(s.ui.selection.nodes).toContain(node.id);
  });

  it("clearSelection clears all selections", () => {
    addNodeAt("valve", 100, 200);
    clearSelection();
    const s = store.get();
    expect(s.ui.selection.nodes).toHaveLength(0);
  });

  it("selectPipe selects a pipe", () => {
    // First add two nodes with ports to create a pipe
    addNodeAt("tank", 100, 200);
    addNodeAt("tank", 300, 200);
    // Create a pipe via store
    const s0 = store.get();
    const nodes = s0.diagram.nodes;
    updateDiagram((d) => {
      const p1 = nodes[0]?.ports[0];
      const p2 = nodes[1]?.ports[0];
      if (p1 && p2) {
        d.pipes.push({
          id: "test-pipe",
          label: "Test",
          fromPortId: p1.id,
          toPortId: p2.id,
          points: [],
          nominalDiameter: "DN25",
          visualDiameter: 10,
          wallColor: "#5b6b7d",
          fluidColor: "#2f7fd6",
          fluidOpacity: 0.92,
          direction: "forward",
          flowSpeed: 1.2,
          particleDensity: "medium",
          animated: true,
          showArrow: true,
          fluidType: "coldWater",
          material: "custom",
          wallOpacity: 1,
          routing: "orthogonal",
          cornerRadius: 0,
        });
      }
    });
    selectPipe("test-pipe");
    const s = store.get();
    expect(s.ui.selection.pipes).toContain("test-pipe");
  });
});

describe("undo/redo", () => {
  it("undo reverts the last operation", () => {
    addNodeAt("tank", 100, 200);
    expect(store.get().diagram.nodes).toHaveLength(1);
    expect(canUndo()).toBe(true);
    undo();
    // After undo, the diagram should be empty again (we started with newDiagram)
    expect(store.get().diagram.nodes).toHaveLength(0);
  });

  it("redo restores after undo", () => {
    addNodeAt("tank", 100, 200);
    undo();
    expect(store.get().diagram.nodes).toHaveLength(0);
    expect(canRedo()).toBe(true);
    redo();
    expect(store.get().diagram.nodes).toHaveLength(1);
  });

  it("no undo when history is empty", () => {
    expect(canUndo()).toBe(false);
  });
});

describe("deleteSelection", () => {
  it("deletes selected nodes", () => {
    addNodeAt("pump", 100, 200);
    deleteSelection();
    const s = store.get();
    expect(s.diagram.nodes).toHaveLength(0);
  });
});
