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

function renderApp() {
  return render(<LangProvider><App /></LangProvider>);
}

describe("62节点优化版修复验证", () => {
  it("可被解析且结构完整", () => {
    const d = toDiagram(fixedJson);
    expect(d.nodes.length).toBe(62);
    expect(d.pipes.length).toBe(71);
  });

  it("所有管路能计算折线（无游离死路）", () => {
    const d = toDiagram(fixedJson);
    for (const p of d.pipes) {
      const pts = pipePolyline(p, d.nodes);
      expect(pts, `管路 ${p.id} 折线无效`).toBeTruthy();
    }
  });

  it("无端口冲突、无悬空节点", () => {
    const d = toDiagram(fixedJson);
    const used = new Map<string, number>();
    for (const p of d.pipes) {
      for (const ref of [p.fromPortId, p.toPortId]) {
        if (!ref) continue;
        used.set(ref, (used.get(ref) ?? 0) + 1);
      }
    }
    for (const [ref, cnt] of used) expect(cnt, `端口 ${ref} 冲突`).toBe(1);
    // 悬空
    const dangling = d.nodes.filter((n) => {
      const connected = d.pipes.some((p) => n.ports.some((pp) => pp.id === p.fromPortId || pp.id === p.toPortId));
      return !connected;
    });
    expect(dangling.length).toBe(0);
  });

  it("所有出口介质正确", () => {
    const d = toDiagram(fixedJson);
    const outletMedia = (name: string) => {
      const node = d.nodes.find((n) => n.label === name);
      if (!node) return undefined;
      return d.pipes.filter((p) => node.ports.some((pp) => pp.id === p.toPortId)).map((p) => p.fluidType).join(",");
    };
    expect(outletMedia("咖啡出口（单）")).toBe("coffee");
    expect(outletMedia("牛奶出口（单）")).toBe("hotMilk");
    expect(outletMedia("热水出口")).toBe("hotWater");
    expect(outletMedia("美式水出口")).toBe("hotWater");
    expect(outletMedia("蒸汽杆")).toBe("steam");
    expect(outletMedia("出口排废")).toBe("steam");
  });

  it("水泵/奶泵运行、关键阀导通", () => {
    const d = toDiagram(fixedJson);
    expect(d.nodes.find((n) => n.id === "n_ms7jr4mj2wu7sw")?.pumpOn).toBe(true); // 水泵
    expect(d.nodes.find((n) => n.id === "n_ms91en36c610kc")?.pumpOn).toBe(true); // 奶泵
    expect(d.nodes.find((n) => n.label === "咖啡排废三通电磁阀")?.valvePath).toBe("A");
    expect(d.nodes.find((n) => n.label === "牛奶排废三通电磁阀")?.valvePath).toBe("A");
  });

  it("React 渲染不抛错", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(fixedJson)); });
    expect(store.get().diagram.nodes.length).toBe(62);
  });
});
