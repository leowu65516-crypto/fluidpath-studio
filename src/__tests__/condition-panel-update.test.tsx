import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { ConditionPanel } from "../components/ConditionPanel";
import { Inspector } from "../components/Inspector";
import { createNode } from "../symbols";
import { connect } from "../smart-draw/builders";
import { loadDiagram, saveWorkCondition, setSelection, applyWorkCondition, store } from "../store";
import type { Diagram } from "../types";

afterEach(cleanup);

function diagram(): Diagram {
  return {
    id: "condition-panel-test",
    name: "Condition panel test",
    nodes: [],
    pipes: [],
    settings: { showGrid: true, background: "#fff", globalAnimationPlaying: false },
  };
}

describe("工况面板更新流程", () => {
  it("恢复已保存工况后提供明确的更新按钮", () => {
    localStorage.setItem("fluidpath.lang", "zh");
    loadDiagram(diagram());
    saveWorkCondition("反冲洗");

    render(<LangProvider><ConditionPanel onClose={() => undefined} /></LangProvider>);
    fireEvent.click(screen.getByRole("button", { name: /恢复/ }));
    expect(screen.getByText("当前打开工况")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /更新此工况/ }));
    expect(store.get().diagram.settings.workConditions?.[0].name).toBe("反冲洗");
  });

  it("在工况面板和检查器同时打开时修改介质并更新快照", () => {
    localStorage.setItem("fluidpath.lang", "zh");
    const source = createNode("inlet", 0, 0), sink = createNode("outlet", 200, 0);
    const pipe = connect(source, "right", sink, "left", "coldWater");
    loadDiagram({ ...diagram(), nodes: [source, sink], pipes: [pipe] });
    saveWorkCondition("冲泡");
    render(<LangProvider><ConditionPanel onClose={() => undefined} /><Inspector /></LangProvider>);
    fireEvent.click(screen.getByRole("button", { name: /恢复/ }));
    act(() => setSelection({ nodes: [], pipes: [pipe.id] }));
    const select = [...document.querySelectorAll<HTMLSelectElement>(".inspector select")].find((el) => [...el.options].some((option) => option.value === "hotWater"));
    expect(select).toBeTruthy();
    fireEvent.change(select!, { target: { value: "hotWater" } });
    fireEvent.click(screen.getByRole("button", { name: /更新此工况/ }));
    act(() => applyWorkCondition("冲泡"));
    expect(store.get().diagram.pipes[0].fluidType).toBe("hotWater");
  });
});
