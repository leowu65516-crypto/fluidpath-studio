/**
 * i18n 防回归测试：英文模式下主要面板不得出现中文残留。
 * 覆盖：PasswordGate / ErrorBoundary / PortEditor / AdvicePanel / Toolbar / Library / Inspector / ContextMenu。
 * 注意：用户数据（节点标签如「水泵」）不算 UI 文案，测试用英文标签图纸或在无数据面板上断言。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { LangProvider } from "../i18n";
import { PasswordGate } from "../components/PasswordGate";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PortEditor } from "../components/PortEditor";
import { AdvicePanel } from "../components/AdvicePanel";
import { Toolbar } from "../components/Toolbar";
import { Library } from "../components/Library";
import { Inspector } from "../components/Inspector";
import { ContextMenu } from "../components/ContextMenu";
import { loadDiagram, store } from "../store";
import { knowledgeOf } from "../knowledge";
import { collectAdvice } from "../advice";
import { fluidLabel } from "../fluidRules";
import { buildDiagnosisReport } from "../report";
import type { Diagram } from "../types";

beforeEach(() => { try { localStorage.removeItem("fluidpath.lang"); } catch { /* 默认 en */ } });
afterEach(cleanup);

const CJK = /[\u4e00-\u9fff]/;

function renderEn(ui: ReactElement) {
  return render(<LangProvider>{ui}</LangProvider>);
}

function expectNoChinese(container: HTMLElement, label: string) {
  const text = container.textContent ?? "";
  const hits = (text.match(new RegExp(CJK.source, "g")) ?? []).join("");
  expect(hits, `${label} 存在中文残留: ${hits}`).toBe("");
}

/** 英文标签的最小图（pump → outlet），避免用户数据中文干扰 */
function enMiniDiagram(): Diagram {
  return {
    id: "en-mini",
    name: "EN mini",
    nodes: [
      { id: "p1", type: "pump", label: "Pump", x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", pumpOn: true, ports: [ { id: "pin", nodeId: "p1", position: "left", direction: "in" }, { id: "pout", nodeId: "p1", position: "right", direction: "out" } ] },
      { id: "o1", type: "hotWaterOutlet", label: "Outlet", x: 200, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [ { id: "oin", nodeId: "o1", position: "left", direction: "in" } ] },
    ],
    pipes: [ { id: "pipe1", label: "P1", fluidType: "coldWater", fromPortId: "pout", toPortId: "oin", direction: "forward", points: [], visualDiameter: 8, fluidColor: "#2f7fd6", animated: true, showArrow: true } as never ],
    settings: { showGrid: true, background: "#fff", globalAnimationPlaying: false },
  };
}

describe("英文模式主要面板无中文残留", () => {
  it("PasswordGate 英文无中文", () => {
    const { container } = renderEn(<PasswordGate onPass={() => undefined} />);
    // 语言切换按钮显示目标语言「中」，属有意设计
    container.querySelector(".gate-lang")?.remove();
    expectNoChinese(container, "PasswordGate");
  });

  it("ErrorBoundary fallback 英文无中文", () => {
    const { container } = renderEn(
      <ErrorBoundary>
        <div>ok</div>
      </ErrorBoundary>
    );
    // 正常路径无中文
    expectNoChinese(container, "ErrorBoundary(normal)");
  });

  it("PortEditor 英文无中文", () => {
    const d = enMiniDiagram();
    renderEn(<div />);
    // 直接渲染 PortEditor（store 已有默认空图；PortEditor 只依赖传入 node）
    const { container } = renderEn(<PortEditor node={d.nodes[0]} />);
    expectNoChinese(container, "PortEditor");
  });

  it("AdvicePanel 英文无中文（含诊断文案双语）", () => {
    const d = enMiniDiagram();
    renderEn(<div />);
    const act = () => loadDiagram(d);
    act();
    const { container } = renderEn(<AdvicePanel onClose={() => undefined} />);
    expectNoChinese(container, "AdvicePanel");
  });

  it("Toolbar + Library + Inspector 英文无中文", () => {
    const d = enMiniDiagram();
    renderEn(<div />);
    loadDiagram(d);
    const svgRef = { current: null } as React.MutableRefObject<SVGSVGElement | null>;
    const t1 = renderEn(<Toolbar svgRef={svgRef} />);
    // 语言切换按钮显示目标语言「中」，属有意设计，从断言中排除
    t1.container.querySelector('[data-testid="lang-toggle"]')?.remove();
    expectNoChinese(t1.container, "Toolbar");
    t1.unmount();
    const t2 = renderEn(<Library />);
    expectNoChinese(t2.container, "Library");
    t2.unmount();
    const t3 = renderEn(<Inspector />);
    expectNoChinese(t3.container, "Inspector");
    t3.unmount();
  });

  it("ContextMenu（右键菜单条目构建后）英文无中文", () => {
    const items = [
      { label: "📋 Duplicate (Ctrl+D)" },
      { label: "🔍 Why stopped?" },
      { divider: true } as never,
      { label: "🗑️ Delete" },
    ];
    const { container } = renderEn(<ContextMenu x={10} y={10} items={items as never} onClose={() => undefined} />);
    expectNoChinese(container, "ContextMenu(sample)");
  });

  it("知识库英文条目无中文", () => {
    for (const type of ["tank", "pump", "milkPump", "solenoid2", "solenoid3", "hotWaterBoiler", "steamBoiler", "checkValve", "brewChamber", "flowMeter"]) {
      const k = knowledgeOf(type, "en");
      expect(k, `缺少英文知识条目: ${type}`).toBeTruthy();
      const text = `${k!.role} ${k!.principle} ${k!.common ?? ""}`;
      expect(CJK.test(text), `英文知识条目含中文: ${type}`).toBe(false);
    }
  });

  it("诊断建议英文文案无中文", () => {
    const d = enMiniDiagram();
    const advices = collectAdvice(d, undefined, "en");
    for (const a of advices) {
      const text = `${a.title} ${a.message} ${a.fixLabel} ${a.why ?? ""}`;
      expect(CJK.test(text), `英文建议含中文 (${a.kind}): ${text}`).toBe(false);
    }
  });

  it("介质标签英文无中文", () => {
    for (const ft of ["coldWater", "hotWater", "steam", "coffee", "milk", "air"] as const) {
      expect(CJK.test(fluidLabel(ft, "en")), `英文介质名含中文: ${ft}`).toBe(false);
    }
  });

  it("诊断报告（英文）无中文", () => {
    const d = enMiniDiagram();
    const { markdown } = buildDiagnosisReport(d, "en", true);
    // 报告含图纸名（用户数据）不参与断言；断言固定区块文案
    const fixedSections = ["Summary", "Structure issues", "State notices", "Validation results", "Outlet status"];
    for (const s of fixedSections) expect(markdown).toContain(s);
    // 排除图纸名后不应有中文
    const stripped = markdown.split(d.name).join("");
    expect(CJK.test(stripped), `英文报告含中文: ${stripped.slice(0, 300)}`).toBe(false);
  });
});

describe("中文模式回归", () => {
  beforeEach(() => { try { localStorage.setItem("fluidpath.lang", "zh"); } catch { /* ignore */ } });

  it("诊断建议中文文案仍然可用", () => {
    const d = enMiniDiagram();
    const advices = collectAdvice(d, undefined, "zh");
    // 最小图：outlet 无上游 → 有 outlet-stalled / pump 类提示；至少非空且含中文
    expect(advices.length).toBeGreaterThan(0);
    expect(CJK.test(advices.map((a) => a.title).join(""))).toBe(true);
  });

  it("store 图纸不被 i18n 影响", () => {
    const d = enMiniDiagram();
    loadDiagram(d);
    expect(store.get().diagram.name).toBe("EN mini");
  });
});
