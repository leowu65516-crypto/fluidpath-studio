import { describe, expect, it } from "vitest";
import { createNode } from "../symbols";
import { pipeEngineeringDisabled, setCachedPipes } from "../geometry";
import { diaphragmRouteLabel, diaphragmValveRoute } from "../diaphragmValve";
import { runValidationCase } from "../validation";
import { parseDiagramJSON } from "../export";
import type { Diagram, Pipe } from "../types";

function port(node: ReturnType<typeof createNode>, position: "left" | "right" | "bottom") {
  const found = node.ports.find((item) => item.position === position);
  if (!found) throw new Error(`missing ${position} port`);
  return found.id;
}

function pipe(id: string, fromPortId: string, toPortId: string): Pipe {
  return {
    id, label: id, fromPortId, toPortId, points: [], nominalDiameter: "DN6", visualDiameter: 2,
    wallColor: "#444", fluidColor: "#2f7fd6", fluidOpacity: 1, direction: "forward",
    flowSpeed: 1, particleDensity: "medium", animated: true, showArrow: false,
  };
}

function selectorDiagram(path: "A" | "B", commonPosition: "left" | "right" | "bottom" = "right"): Diagram {
  const source = createNode("inlet", 0, 180, "Source");
  const selector = createNode("diaphragmValve3", 180, 140, "Selector");
  selector.valvePath = path;
  selector.valveCommonPortId = port(selector, commonPosition);
  const outletA = createNode("outlet", 360, 70, "Outlet A");
  const outletB = createNode("outlet", 360, 260, "Outlet B");
  const branches = selector.ports.filter((item) => item.id !== selector.valveCommonPortId);
  return {
    id: "diaphragm-selector", name: "Diaphragm selector", nodes: [source, selector, outletA, outletB],
    pipes: [
      pipe("common", port(source, "right"), selector.valveCommonPortId),
      pipe("route-a", branches[0].id, port(outletA, "left")),
      pipe("route-b", branches[1].id, port(outletB, "left")),
    ],
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: true, crossoverHops: true },
  };
}

describe("diaphragm valves", () => {
  it("creates a three-port, two-position selector with three bidirectional ports", () => {
    const valve = createNode("diaphragmValve3", 0, 0);
    expect(valve.valvePath).toBe("A");
    expect(valve.showStateOnDiagram).toBe(true);
    expect(valve.ports.map((item) => item.direction)).toEqual(["bidirectional", "bidirectional", "bidirectional"]);
    expect(valve.valveCommonPortId).toBe(port(valve, "right"));
    expect(createNode("diaphragmValve2", 0, 0).valveState).toBe("open");
  });

  it("only permits the selected shared-port route to carry engineering flow", () => {
    const aRoute = selectorDiagram("A");
    setCachedPipes(aRoute.pipes, aRoute.nodes);
    expect(pipeEngineeringDisabled(aRoute.pipes[0], aRoute.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(aRoute.pipes[1], aRoute.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(aRoute.pipes[2], aRoute.nodes)).toBe(true);

    const bRoute = selectorDiagram("B");
    setCachedPipes(bRoute.pipes, bRoute.nodes);
    expect(pipeEngineeringDisabled(bRoute.pipes[0], bRoute.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(bRoute.pipes[1], bRoute.nodes)).toBe(true);
    expect(pipeEngineeringDisabled(bRoute.pipes[2], bRoute.nodes)).toBe(false);
  });

  it("lets any physical port be the shared port without imposing an inlet or outlet", () => {
    const diagram = selectorDiagram("A", "bottom");
    const selector = diagram.nodes.find((node) => node.type === "diaphragmValve3")!;
    const route = diaphragmValveRoute(selector, "A");
    expect(route.commonPort?.id).toBe(port(selector, "bottom"));
    expect(route.activeBranch?.id).toBe(port(selector, "left"));
    expect(diaphragmRouteLabel(selector, "A")).toBe("P2 ↔ P1");
    expect(diaphragmRouteLabel(selector, "B")).toBe("P2 ↔ P3");

    setCachedPipes(diagram.pipes, diagram.nodes);
    expect(pipeEngineeringDisabled(diagram.pipes[0], diagram.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(diagram.pipes[1], diagram.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(diagram.pipes[2], diagram.nodes)).toBe(true);
  });

  it("migrates existing positional diagrams to the bidirectional shared-port model", () => {
    const legacy = selectorDiagram("A") as Diagram & { _version?: number };
    const selector = legacy.nodes.find((node) => node.type === "diaphragmValve3")!;
    legacy._version = 3;
    delete selector.valveCommonPortId;
    selector.ports[0].direction = "in";
    selector.ports[1].direction = "in";
    selector.ports[2].direction = "out";

    const migrated = parseDiagramJSON(JSON.stringify(legacy));
    const migratedSelector = migrated.nodes.find((node) => node.type === "diaphragmValve3")!;
    expect(migratedSelector.ports.map((item) => item.direction)).toEqual(["bidirectional", "bidirectional", "bidirectional"]);
    expect(migratedSelector.valveCommonPortId).toBe(port(migratedSelector as ReturnType<typeof createNode>, "right"));
  });

  it("marks malformed selector semantics invalid instead of guessing", () => {
    const diagram = selectorDiagram("A");
    const selector = diagram.nodes.find((node) => node.type === "diaphragmValve3")!;
    selector.valveCommonPortId = "missing-port";
    selector.ports[0].direction = "in";
    const result = runValidationCase(diagram, {
      id: "invalid-selector-semantics", name: "Invalid selector semantics", state: {},
      mustFlowPipeIds: ["route-a"], mustStopPipeIds: [],
    });
    expect(result.status).toBe("INVALID");
    expect(result.issues).toContain(`INVALID_SELECTOR_COMMON_PORT: ${selector.id}`);
    expect(result.issues).toContain(`INVALID_SELECTOR_PORT_DIRECTION: ${selector.id}`);
  });

  it("rejects an off state for a selector that has only two legal positions", () => {
    const diagram = selectorDiagram("A");
    const selector = diagram.nodes.find((node) => node.type === "diaphragmValve3")!;
    const result = runValidationCase(diagram, {
      id: "invalid-selector-path", name: "Invalid selector path", state: { [selector.id]: { valvePath: "off" } },
      mustFlowPipeIds: ["route-a"], mustStopPipeIds: [],
    });
    expect(result.status).toBe("INVALID");
    expect(result.issues).toContain(`INVALID_VALVE_PATH: ${selector.id}`);
  });
});
