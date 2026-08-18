import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store } from "../store";
import { parseDiagramJSON } from "../export";
import { pipePolyline } from "../geometry";
import fixedJson from "../../MSY2.json";
import type { Diagram } from "../types";

const toDiagram = (json: any): Diagram => parseDiagramJSON(JSON.stringify(json));
function renderApp() { return render(<LangProvider><App /></LangProvider>); }

describe("可打开版验证", () => {
  it("parseDiagramJSON 能解析（可打开）", () => {
    const d = toDiagram(fixedJson);
    expect(d.nodes.length).toBe(62);
    expect(d.pipes.length).toBe(71);
  });

  it("所有管路可计算折线（无死路）", () => {
    const d = toDiagram(fixedJson);
    for (const p of d.pipes) {
      expect(pipePolyline(p, d.nodes), `管路 ${p.id}`).toBeTruthy();
    }
  });

  it("无端口冲突、无游离、无悬空", () => {
    const d = toDiagram(fixedJson);
    const used = new Map<string, number>();
    for (const p of d.pipes) {
      for (const ref of [p.fromPortId, p.toPortId]) {
        if (!ref) continue;
        used.set(ref, (used.get(ref) ?? 0) + 1);
      }
    }
    for (const [ref, cnt] of used) expect(cnt, `端口 ${ref}`).toBe(1);
    const dangling = d.nodes.filter((n) => {
      const connected = d.pipes.some((p) => n.ports.some((pp) => pp.id === p.fromPortId || pp.id === p.toPortId));
      return !connected;
    });
    expect(dangling.length).toBe(0);
  });

  it("React 渲染不抛错（真正能打开）", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(fixedJson)); });
    expect(store.get().diagram.nodes.length).toBe(62);
    expect(store.get().diagram.pipes.length).toBe(71);
  });

  it("关键出口介质正确", () => {
    const d = toDiagram(fixedJson);
    const outlet = (name: string) => {
      const n = d.nodes.find((x) => x.label === name);
      if (!n) return undefined;
      return d.pipes.filter((p) => n.ports.some((pp) => pp.id === p.toPortId)).map((p) => p.fluidType).join(",");
    };
    expect(outlet("咖啡出口（单）")).toBe("coffee");
    expect(outlet("牛奶出口（单）")).toBe("hotMilk");
    expect(outlet("热水出口")).toBe("hotWater");
    expect(outlet("美式水出口")).toBe("hotWater");
    expect(outlet("蒸汽杆")).toBe("steam");
  });
});
