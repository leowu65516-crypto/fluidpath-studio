import { describe, it, expect } from "vitest";
import { loadDiagram, updateDiagram, store, flushAutosave, getAutosaveVersions, restoreAutosaveVersion, recordSavedAt, pendingAutosave, clearAutosave } from "../store";
import { traceFunctionalChain } from "../functionalChain";
import { parseDiagramJSON } from "../export";
import bcmtsRaw from "../../BCMTS.json";

const toDiagram = (json: any) => JSON.parse(JSON.stringify(json)) as any;

describe("元件→整机功能链", () => {
  it("奶泵运行+进奶开+排废A：选中奶泵 → 链覆盖 罐→进奶阀→奶泵→奶排废→牛奶出口", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    d.nodes.find((n: any) => n.id === "n_msvz8pbq71ca")!.pumpOn = true;
    d.nodes.find((n: any) => n.id === "n_ms92b8rm798rfd")!.valveState = "open";
    d.nodes.find((n: any) => n.id === "n_ms91h2kcr16ehn")!.valvePath = "A";
    d.nodes.find((n: any) => n.id === "n_ms91xxps4wsawx")!.valvePath = "off";
    const chain = traceFunctionalChain(d, "n_msvz8pbq71ca");
    expect(chain.nodeIds).toContain("n_msw0gh0n7h3a"); // 储液罐（上游源端）
    expect(chain.nodeIds).toContain("n_ms91fm8kiq9nkv"); // 牛奶出口（下游汇端）
    expect(chain.nodeIds).toContain("n_ms92b8rm798rfd"); // 进奶阀
    // 关键奶路管路进入链
    for (const pid of ["pipe_msw0gpmt7m99", "pipe_msvz95cn74m1", "pipe_msby6swr7rm45e"]) {
      expect(chain.pipeIds, `管路 ${pid} 应在链中`).toContain(pid);
    }
  });

  it("关闭阀门 → 链在该阀处截断（不含下游出口）", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    d.nodes.find((n: any) => n.id === "n_msbyfj71l363q0")!.valveState = "closed"; // 润湿阀关
    const chain = traceFunctionalChain(d, "n_msbyfj71l363q0");
    // 上游可达供水链，下游在润湿阀处截断 → 不含储液罐（回流终点在阀后）
    expect(chain.nodeIds).not.toContain("n_msw0gh0n7h3a");
  });
});

describe("自动保存 / 崩溃恢复", () => {
  it("flushAutosave 保存版本 → 恢复 → 记录保存时间后无待恢复", () => {
    const d = toDiagram(bcmtsRaw);
    loadDiagram(d);
    const id = store.get().diagram.id;
    clearAutosave(id);

    updateDiagram((draft) => { draft.nodes.find((n) => n.id === "n_msvz8pbq71ca")!.pumpOn = true; });
    flushAutosave(store.get().diagram);
    expect(getAutosaveVersions(id).length).toBe(1);
    expect(store.get().diagram.nodes.find((n) => n.id === "n_msvz8pbq71ca")?.pumpOn).toBe(true);

    // 再次修改后自动保存应保留两个版本（历史）
    updateDiagram((draft) => { draft.nodes.find((n) => n.id === "n_msvz8pbq71ca")!.pumpOn = false; });
    flushAutosave(store.get().diagram);
    expect(getAutosaveVersions(id).length).toBe(2);

    // 恢复到第一个版本（奶泵开）
    restoreAutosaveVersion(id, 0);
    expect(store.get().diagram.nodes.find((n) => n.id === "n_msvz8pbq71ca")?.pumpOn).toBe(false);

    recordSavedAt(id);
    expect(pendingAutosave(id).length).toBe(0);
    clearAutosave(id);
    expect(getAutosaveVersions(id).length).toBe(0);
  });
});
