import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { SaveStatusPill } from "../components/SaveStatusPill";
import { SaveNudge } from "../components/SaveNudge";
import { loadDiagram, markSaved, store, updateDiagram } from "../store";
import { createEmptyDiagram } from "../sample";

beforeEach(() => {
  try { localStorage.clear(); localStorage.setItem("fluidpath.lang", "en"); } catch { /* ignore */ }
  loadDiagram(createEmptyDiagram());
});
afterEach(cleanup);

describe("保存状态与保存教练", () => {
  it("修改后显示本机草稿/未保存，保存文件后变绿", () => {
    act(() => updateDiagram((d) => { d.settings.flowScale = 1.2; }, true));
    const view = render(<LangProvider><SaveStatusPill /></LangProvider>);
    expect(view.container.textContent).toMatch(/Unsaved changes|Local draft/);
    act(() => markSaved());
    expect(store.get().ui.dirty).toBe(false);
    expect(view.container.textContent).toMatch(/File saved|No changes/);
  });

  it("保存教练的保存按钮发出全局保存事件", () => {
    const onSave = vi.fn();
    window.addEventListener("fluidpath:save-file", onSave);
    render(<LangProvider><SaveNudge kind="first-edit" onDismiss={() => {}} /></LangProvider>);
    expect(screen.getByText("Changes autosaved locally")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Save file/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    window.removeEventListener("fluidpath:save-file", onSave);
  });
});
