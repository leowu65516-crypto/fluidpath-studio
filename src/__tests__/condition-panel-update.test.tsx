import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { ConditionPanel } from "../components/ConditionPanel";
import { loadDiagram, saveWorkCondition, store } from "../store";
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
});
