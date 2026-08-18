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

describe("优化版逻辑修复验证", () => {
  it("可解析且结构完整", () => {
    const d = toDiagram(fixedJson);
    expect(d.nodes.length).toBe(62);
    expect(d.pipes.length).toBe(71);
  });

  it("所有管路可计算折线", () => {
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

  it("所有出口介质正确", () => {
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

  it("关键阀状态正确", () => {
    const d = toDiagram(fixedJson);
    expect(d.nodes.find((n) => n.label === "咖啡排废三通电磁阀")?.valvePath).toBe("A");
    expect(d.nodes.find((n) => n.label === "牛奶排废三通电磁阀")?.valvePath).toBe("A");
    expect(d.nodes.find((n) => n.label === "蒸汽三通电磁阀")?.valvePath).toBe("A");
    expect(d.nodes.find((n) => n.label === "牛奶加热三通电磁阀")?.valvePath).toBe("A");
    expect(d.nodes.find((n) => n.label === "牛奶清洗三通电磁阀")?.valvePath).toBe("off");
  });

  it("React 渲染不抛错", () => {
    renderApp();
    act(() => { loadDiagram(toDiagram(fixedJson)); });
    expect(store.get().diagram.nodes.length).toBe(62);
  });
});

describe("用户指定修改点验证", () => {
  it("牛奶加热三通→单向阀介质=蒸汽", () => {
    const d = toDiagram(fixedJson);
    const p = d.pipes.find((x) => x.id === "pipe_msby1d1x2x7g2p");
    expect(p?.fluidType).toBe("steam");
  });

  it("常温快速冲洗链=常温水且阀常闭", () => {
    const d = toDiagram(fixedJson);
    const portToNode = new Map();
    d.nodes.forEach((n) => n.ports.forEach((pp) => portToNode.set(pp.id, { node: n, port: pp })));
    const flush = d.nodes.find((n) => n.label === "常温快速冲洗两通电磁阀");
    expect(flush?.valveState).toBe("closed");
    const up = d.pipes.find((p) => p.toPortId && portToNode.get(p.toPortId)?.node.id === flush?.id);
    const down = d.pipes.find((p) => p.fromPortId && portToNode.get(p.fromPortId)?.node.id === flush?.id);
    expect(up?.fluidType).toBe("coldWater");
    expect(down?.fluidType).toBe("coldWater");
  });

  it("蒸汽排废链=蒸汽直到排废接口", () => {
    const d = toDiagram(fixedJson);
    const wasteValve = d.nodes.find((n) => n.label === "锅炉蒸汽排废两通电磁阀");
    const portToNode = new Map();
    d.nodes.forEach((n) => n.ports.forEach((pp) => portToNode.set(pp.id, { node: n, port: pp })));
    const down = d.pipes.find((p) => p.fromPortId && portToNode.get(p.fromPortId)?.node.id === wasteValve?.id);
    const p50 = d.pipes.find((x) => x.id === "pipe_msbxjvrpvhuw");
    const p49 = d.pipes.find((x) => x.id === "pipe_msbxivgapekq");
    expect(down?.fluidType).toBe("steam");
    expect(p50?.fluidType).toBe("steam");
    expect(p49?.fluidType).toBe("steam");
  });

  it("牛奶主链仍全程 milk", () => {
    const d = toDiagram(fixedJson);
    const portToNode = new Map();
    d.nodes.forEach((n) => n.ports.forEach((pp) => portToNode.set(pp.id, { node: n, port: pp })));
    const mp = d.nodes.find((n) => n.type === "milkPump")!;
    const mpIn = mp.ports.find((p) => p.position === "right")!;
    const inPipe = d.pipes.find((p) => p.toPortId === mpIn.id);
    expect(inPipe?.fluidType).toBe("milk");
  });
});

describe("旁通热水阀修改点", () => {
  it("旁通热水阀输入侧=hotWater，出侧=hotWater 且有连接", () => {
    const d = toDiagram(fixedJson);
    const valve = d.nodes.find((n) => n.label === "旁通热水电磁阀");
    const portToNode = new Map();
    d.nodes.forEach((n) => n.ports.forEach((pp) => portToNode.set(pp.id, { node: n, port: pp })));
    const inPipe = d.pipes.find((p) => p.toPortId && portToNode.get(p.toPortId)?.node.id === valve?.id);
    const outPipe = d.pipes.find((p) => p.fromPortId && portToNode.get(p.fromPortId)?.node.id === valve?.id);
    expect(inPipe?.fluidType).toBe("hotWater");   // 入侧热水
    expect(outPipe?.fluidType).toBe("hotWater");  // 出侧热水
    // 出侧有下游连接（接入三通接头分流）
    expect(outPipe?.toPortId).toBeTruthy();
    expect(portToNode.get(outPipe?.toPortId ?? "")?.node).toBeTruthy();
  });
});
