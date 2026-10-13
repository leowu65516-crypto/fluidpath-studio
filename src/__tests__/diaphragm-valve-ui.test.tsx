import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { Inspector } from "../components/Inspector";
import { createNode } from "../symbols";
import { loadDiagram, selectNode, store } from "../store";
import type { Diagram } from "../types";

afterEach(cleanup);

describe("three-way diaphragm selector inspector", () => {
  beforeEach(() => {
    localStorage.removeItem("fluidpath.lang");
    const selector = createNode("diaphragmValve3", 0, 0, "Selector");
    const diagram: Diagram = {
      id: "selector-ui", name: "Selector UI", nodes: [selector], pipes: [],
      settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: false, crossoverHops: true },
    };
    loadDiagram(diagram);
    selectNode(selector.id);
  });

  it("updates both bidirectional routes when the shared port changes", async () => {
    const { container } = render(<LangProvider><Inspector /></LangProvider>);
    expect(container.textContent).toContain("P3 ↔ P1");
    expect(container.textContent).toContain("P3 ↔ P2");

    const selectors = [...container.querySelectorAll("select")];
    const sharedPortSelect = selectors.find((element) => element.value.startsWith("p"));
    expect(sharedPortSelect).toBeTruthy();
    const bottomPortId = storeSelectorPort("bottom");
    fireEvent.change(sharedPortSelect!, { target: { value: bottomPortId } });

    await waitFor(() => {
      expect(container.textContent).toContain("P2 ↔ P1");
      expect(container.textContent).toContain("P2 ↔ P3");
    });
    expect([...container.querySelectorAll('select[title="Flow direction"]')].every((element) => (element as HTMLSelectElement).disabled)).toBe(true);
    expect((container.querySelector('button[title="A 3-way diaphragm selector has exactly three bidirectional ports"]') as HTMLButtonElement | null)?.disabled).toBe(true);
  });
});

function storeSelectorPort(position: "left" | "right" | "bottom") {
  const selector = createCurrentSelector();
  return selector.ports.find((port) => port.position === position)!.id;
}

function createCurrentSelector() {
  return store.get().diagram.nodes.find((node) => node.type === "diaphragmValve3")!;
}
