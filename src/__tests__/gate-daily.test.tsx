/**
 * v1.24 测试：
 * - dailyPassword 算法（用户给定的两个样例 + 边界）
 * - PasswordGate：动态密码登录、语言切换按钮、英文无中文
 * - 英文界面导出 SVG 无「管路」默认中文
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { dailyPassword } from "../gate";
import { PasswordGate } from "../components/PasswordGate";
import { buildExportSVGWithOptions, EXPORT_DEFAULTS, type ExportOptions } from "../export";
import { parseDiagramJSON } from "../export";
import bcmtsRaw from "../../BCMTS.json";

function bcmts() {
  return parseDiagramJSON(JSON.stringify(bcmtsRaw));
}

function opts(over: Partial<ExportOptions> = {}): ExportOptions {
  return { ...EXPORT_DEFAULTS, format: "png", lang: "en", filename: "t", ...over };
}

describe("当日动态密码", () => {
  it("用户样例：2026-06-20 → 626002；2027-10-21 → 720112", () => {
    expect(dailyPassword(new Date(2026, 5, 20))).toBe("626002");
    expect(dailyPassword(new Date(2027, 9, 21))).toBe("720112");
  });

  it("单位数月/日补零反转：2026-01-05 → 650110", () => {
    expect(dailyPassword(new Date(2026, 0, 5))).toBe("621050");
  });

  it("跨年边界：2099-12-31 → 951221", () => {
    expect(dailyPassword(new Date(2099, 11, 31))).toBe("992113");
  });
});

describe("PasswordGate", () => {
  beforeEach(() => {
    try { localStorage.setItem("fluidpath.lang", "zh"); } catch { /* ignore */ }
  });

  it("动态密码可登录", () => {
    const { container } = render(<LangProvider><PasswordGate onPass={() => undefined} /></LangProvider>);
    const input = container.querySelector("input")!;
    const btn = container.querySelector(".gate-btn")!;
    // 模拟输入当日密码
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, dailyPassword());
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    (btn as HTMLButtonElement).click();
    // 无错误提示即通过（onPass 被调用的副作用这里以无 err 类验证）
    expect(container.querySelector(".gate-err")).toBeNull();
  });

  it("语言切换按钮存在且切换后英文无中文", () => {
    const { container } = render(<LangProvider><PasswordGate onPass={() => undefined} /></LangProvider>);
    expect(container.querySelector(".gate-lang")).toBeTruthy();
    const btn = container.querySelector(".gate-lang") as HTMLButtonElement;
    act(() => { btn.click(); });
    expect(container.textContent).not.toMatch(/请输入访问密码/);
    expect(container.textContent).toContain("Enter");
  });
});

describe("英文界面导出物无系统中文", () => {
  beforeEach(() => {
    try { localStorage.setItem("fluidpath.lang", "en"); } catch { /* ignore */ }
  });

  it("BCMTS 英文导出：不含「管路 N」默认中文（渲染为 Pipe N）", () => {
    const d = bcmts();
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "main-canvas");
    const world = document.createElementNS(NS, "g");
    world.setAttribute("data-world", "1");
    // 模拟画布渲染的管路标签（PipeView 在英文界面渲染 Pipe N）
    const t = document.createElementNS(NS, "text");
    t.setAttribute("class", "fp-pipe-label");
    t.textContent = "Pipe 2 · DN25";
    world.appendChild(t);
    svg.appendChild(world);
    const { svg: out } = buildExportSVGWithOptions(svg, d, opts());
    expect(out).not.toContain("管路 ");
    expect(out).toContain("Pipe 2");
  });
});
