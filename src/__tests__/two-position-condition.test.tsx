import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { Inspector } from "../components/Inspector";
import { createEmptyDiagram } from "../sample";
import { createNode } from "../symbols";
import { parseDiagramJSON } from "../export";
import { pipeEngineeringDisabled, setCachedPipes } from "../geometry";
import { connect } from "../smart-draw/builders";
import { createCustomScenarioFromConditions, enterScenario, exitScenario, loadDiagram, overrideScenarioNode, saveScenarioConditionAs, saveWorkCondition, selectNode, setScenarioStep, store, updateScenarioCondition } from "../store";

afterEach(cleanup);

describe("two-position valve and presentation conditions", () => {
  it("migrates legacy closed states to A and lets the user select B", () => {
    localStorage.setItem("fluidpath.lang", "zh");
    const diagram = createEmptyDiagram();
    const valve = createNode("solenoid3", 50, 50);
    valve.valvePath = "off";
    diagram.nodes.push(valve);
    loadDiagram(parseDiagramJSON(JSON.stringify(diagram)));
    selectNode(valve.id);
    render(<LangProvider><Inspector /></LangProvider>);
    expect(store.get().diagram.nodes[0].valvePath).toBe("A");
    fireEvent.click(screen.getByRole("button", { name: "下方 (B)" }));
    expect(store.get().diagram.nodes[0].valvePath).toBe("B");
  });

  it("updates a shared condition or saves a new condition bound only to the current step", () => {
    const diagram = createEmptyDiagram();
    const valve = createNode("solenoid3", 50, 50);
    diagram.nodes.push(valve);
    loadDiagram(diagram);
    saveWorkCondition("A");
    saveWorkCondition("B");
    const id = createCustomScenarioFromConditions(["A", "B"], "zh")!;
    enterScenario(id, 0);
    overrideScenarioNode(valve.id, { valvePath: "B" });
    expect(updateScenarioCondition("A")).toBe(true);
    setScenarioStep(1);
    expect(store.get().diagram.nodes[0].valvePath).toBe("A");
    overrideScenarioNode(valve.id, { valvePath: "B" });
    expect(saveScenarioConditionAs("B copy", "zh")).toBe(true);
    expect(saveScenarioConditionAs("A", "zh")).toBe(false);
    setScenarioStep(0);
    expect(store.get().diagram.nodes[0].valvePath).toBe("B");
    setScenarioStep(1);
    expect(store.get().diagram.nodes[0].valvePath).toBe("B");
    exitScenario();
    expect(store.get().ui.dirty).toBe(true);
    const scene = store.get().diagram.settings.customScenarios!.find((item) => item.id === id)!;
    expect(scene.steps.map((step) => step.conditionName)).toEqual(["A", "B copy"]);
    expect(store.get().diagram.settings.workConditions!.find((item) => item.name === "B")!.state[valve.id].valvePath).toBe("A");
  });

  it("keeps a three-port flow control outlet supplied when either inlet remains active", () => {
    const first = createNode("pump", 0, 0);
    const second = createNode("pump", 0, 200);
    const valve = createNode("flowControl3", 200, 100);
    const outlet = createNode("outlet", 400, 100);
    const pipes = [connect(first, "right", valve, "left"), connect(second, "right", valve, "bottom"), connect(valve, "right", outlet, "left")];
    const nodes = [first, second, valve, outlet];
    expect(valve.ports.map((port) => port.direction)).toEqual(["in", "in", "out"]);
    first.pumpOn = false;
    second.pumpOn = true;
    setCachedPipes(pipes, nodes);
    expect(pipeEngineeringDisabled(pipes[2], nodes)).toBe(false);
    first.pumpOn = true;
    second.pumpOn = false;
    setCachedPipes(pipes, nodes);
    expect(pipeEngineeringDisabled(pipes[2], nodes)).toBe(false);
    first.pumpOn = false;
    setCachedPipes(pipes, nodes);
    expect(pipeEngineeringDisabled(pipes[2], nodes)).toBe(true);
    setCachedPipes([], []);
  });
});
