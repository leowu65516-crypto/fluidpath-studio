import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { createEmptyDiagram } from "../sample";
import { saveJSONFile } from "../export";

describe("网页版多窗口与路径保存", () => {
  const originalOpen = window.open;
  const originalPicker = (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("fluidpath.lang", "zh");
  });

  afterEach(() => {
    cleanup();
    window.open = originalOpen;
    if (originalPicker === undefined) delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
    else (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = originalPicker;
  });

  it("网页端新窗口按钮打开同一工作台网址", () => {
    const open = vi.fn(() => null);
    window.open = open;
    render(<LangProvider><App /></LangProvider>);
    screen.getByRole("button", { name: "新窗口" }).click();
    expect(open).toHaveBeenCalledWith(window.location.href, "_blank");
  });

  it("支持浏览器原生文件保存器并使用图纸名称作为默认文件名", async () => {
    const writes: string[] = [];
    const close = vi.fn(async () => undefined);
    const createWritable = vi.fn(async () => ({ write: async (text: string) => { writes.push(text); }, close }));
    (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn(async (options: { suggestedName: string }) => ({ name: options.suggestedName, createWritable }));
    const diagram = createEmptyDiagram();
    diagram.name = "网页图纸.json";
    const result = await saveJSONFile(diagram);
    expect(result).toEqual({ saved: true, filename: "网页图纸.json", picker: true });
    expect(((window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "网页图纸.json" }));
    expect(writes[0]).toContain('"_version": 3');
    expect(close).toHaveBeenCalled();
  });

});
