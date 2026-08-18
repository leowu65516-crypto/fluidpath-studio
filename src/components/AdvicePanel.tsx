import { useEffect, useMemo, useRef, useState } from "react";
import { collectAdvice } from "../advice";
import type { SmartAdvice } from "../advice";
import { applyFix, useAppState, setSelection, focusElement, store, restoreDiagram, blinkElements, showChainPath } from "../store";
import { pipeEffectiveDisabled } from "../geometry";
import type { Diagram } from "../types";

/**
 * 智能诊断侧栏：常驻右侧，与画布并排显示。
 * - 总览视图：整机健康（结构/工况计数、出口流停、泵/锅炉状态）→ 返回总览
 * - 问题列表：分层（结构问题/工况提示）、严重度筛选、序号列表
 * - 悬停/点击建议 → 画布闪烁定位；停流类显示因果链（根因 + 沿链点亮）
 * - 「一键修改 / 确认 / 撤回修改」三步操作；每条建议附「为什么」教学解释
 */
export function AdvicePanel({ onClose }: { onClose: () => void }) {
  const { diagram, ui } = useAppState();
  const [view, setView] = useState<"overview" | "list">("overview");
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [appliedOrder, setAppliedOrder] = useState<string[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [stateOpen, setStateOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">("all");
  const listRef = useRef<HTMLDivElement>(null);
  const undoSnapshots = useRef(new Map<string, Diagram>());

  const inScenario = !!ui.scenario;

  const portToNode = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of diagram.nodes) for (const p of n.ports) m.set(p.id, n.id);
    return m;
  }, [diagram]);

  // 框选范围：选中节点 + 选中管路 + 选中节点相连的管路
  const scoped = ui.selection.nodes.length + ui.selection.pipes.length > 0;
  const scope = useMemo(() => {
    const nodeIds = new Set(ui.selection.nodes);
    const pipeIds = new Set(ui.selection.pipes);
    if (nodeIds.size > 0) {
      for (const p of diagram.pipes) {
        const fn = p.fromPortId ? portToNode.get(p.fromPortId) : undefined;
        const tn = p.toPortId ? portToNode.get(p.toPortId) : undefined;
        if ((fn && nodeIds.has(fn)) || (tn && nodeIds.has(tn))) pipeIds.add(p.id);
      }
    }
    return { nodeIds, pipeIds };
  }, [ui.selection.nodes, ui.selection.pipes, diagram, portToNode]);

  const all = useMemo(() => collectAdvice(diagram, scoped ? scope : undefined), [diagram, scoped, scope]);
  const appliedSet = useMemo(() => new Set(appliedOrder), [appliedOrder]);
  const pending = all.filter((a) => !handled.has(a.id) && !appliedSet.has(a.id));
  const byFilter = (a: SmartAdvice) => filter === "all" || a.severity === filter;
  const structureItems = pending.filter((a) => a.category === "structure" && byFilter(a));
  const stateItems = pending.filter((a) => a.category === "state" && byFilter(a));
  const appliedList = appliedOrder
    .map((id) => all.find((a) => a.id === id))
    .filter((a): a is SmartAdvice => !!a);

  // 工况验证摘要：各出口当前流/停
  const outletStatus = useMemo(() => {
    const TYPES = ["coffeeOutlet", "milkOutlet", "hotWaterOutlet", "hotWaterWand", "steamWand"];
    const out: Array<{ id: string; label: string; flowing: boolean }> = [];
    for (const n of diagram.nodes) {
      if (!TYPES.includes(n.type)) continue;
      const inP = diagram.pipes.find((p) => p.toPortId && n.ports.some((pt) => pt.id === p.toPortId));
      out.push({ id: n.id, label: n.label || n.type, flowing: !!inP && !pipeEffectiveDisabled(inP, diagram.nodes) });
    }
    return out;
  }, [diagram]);

  // 泵/锅炉状态（总览用）
  const powerStatus = useMemo(() => {
    const pumps: Array<{ id: string; label: string; on: boolean; fault?: string }> = [];
    const boilers: Array<{ id: string; label: string; type: string }> = [];
    for (const n of diagram.nodes) {
      if (n.type === "pump" || n.type === "milkPump") pumps.push({ id: n.id, label: n.label || n.type, on: n.pumpOn !== false, fault: n.fault });
      else if (n.type === "hotWaterBoiler" || n.type === "steamBoiler") boilers.push({ id: n.id, label: n.label || n.type, type: n.type });
    }
    return { pumps, boilers };
  }, [diagram]);

  const structErr = structureItems.filter((a) => a.severity === "error").length;
  const structWarn = structureItems.filter((a) => a.severity === "warning").length;
  const stateCount = stateItems.length;

  function mark(id: string) {
    setHandled((prev) => new Set(prev).add(id));
  }
  function confirm(a: SmartAdvice) {
    if (!a.fix) return;
    undoSnapshots.current.set(a.id, structuredClone(store.get().diagram));
    applyFix(a.fix);
    setAppliedOrder((prev) => [...prev, a.id]);
  }
  function revert(a: SmartAdvice) {
    const snap = undoSnapshots.current.get(a.id);
    if (!snap) return;
    restoreDiagram(snap);
    const idx = appliedOrder.indexOf(a.id);
    if (idx >= 0) {
      const toRemove = appliedOrder.slice(idx);
      toRemove.forEach((id) => undoSnapshots.current.delete(id));
      setAppliedOrder((prev) => prev.slice(0, idx));
    } else {
      undoSnapshots.current.delete(a.id);
      setAppliedOrder((prev) => prev.filter((id) => id !== a.id));
    }
  }

  // 点建议 → 闪烁定位 + 停流类沿因果链点亮画布路径
  function focus(a: SmartAdvice) {
    setHighlightId(a.id);
    const nodeIds = a.elementIds.filter((id) => diagram.nodes.some((n) => n.id === id));
    const pipeIds = a.elementIds.filter((id) => diagram.pipes.some((p) => p.id === id));
    const first = nodeIds[0] ?? pipeIds[0];
    if (first) focusElement(first);
    setSelection({ nodes: nodeIds, pipes: pipeIds });
    blinkElements(a.elementIds);
    if (a.cause) {
      const chainPipes = a.cause.ids.filter((id) => diagram.pipes.some((p) => p.id === id));
      if (chainPipes.length > 0) showChainPath(chainPipes);
    }
  }

  const selectedIds = new Set([...ui.selection.nodes, ...ui.selection.pipes]);
  const activeId = pending.find((a) => a.elementIds.some((id) => selectedIds.has(id)))?.id ?? null;
  useEffect(() => {
    if (!activeId) return;
    setHighlightId(activeId);
    const el = listRef.current?.querySelector(`[data-advice-id="${activeId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  const filters: Array<{ key: "all" | "error" | "warning" | "info"; label: string }> = [
    { key: "all", label: "全部" },
    { key: "error", label: "⛔" },
    { key: "warning", label: "⚠️" },
    { key: "info", label: "💡" },
  ];

  const renderItem = (a: SmartAdvice, isApplied: boolean, seq?: number) => (
    <div
      key={a.id}
      data-advice-id={a.id}
      className={`advice-item adv-${a.severity}${highlightId === a.id ? " active" : ""}${isApplied ? " applied" : ""}`}
      onClick={() => { focus(a); }}
      onMouseEnter={() => blinkElements(a.elementIds)}
    >
      <div className="advice-item-title">
        {typeof seq === "number" && <span className="advice-seq">{seq}</span>}
        {a.severity === "error" ? "⛔" : a.severity === "warning" ? "⚠️" : "💡"} {a.title}
        {isApplied && <span className="advice-applied-tag">✓ 已修改</span>}
        {!isApplied && a.category === "state" && <span className="advice-state-tag">工况</span>}
      </div>
      <div className="advice-item-msg">{a.message}</div>
      {a.why && <div className="advice-item-why">❓ {a.why}</div>}
      <div className="advice-item-actions" onClick={(e) => e.stopPropagation()}>
        {isApplied ? (
          <button className="btn" onClick={() => revert(a)}>↩ 撤回修改</button>
        ) : (
          <>
            {a.fix && <button className="btn" onClick={() => confirm(a)}>✓ 一键修改</button>}
            <button className="btn ghost" onClick={() => mark(a.id)}>✓ 确认</button>
          </>
        )}
      </div>
    </div>
  );

  const head = (
    <div className="advice-head">
      <h2>🔍 回路诊断{scoped ? " · 选中范围" : ""}</h2>
      <div className="advice-view-toggle">
        <button className={`advice-view-btn${view === "overview" ? " active" : ""}`} onClick={() => setView("overview")} title="返回总览">📊 总览</button>
        <button className={`advice-view-btn${view === "list" ? " active" : ""}`} onClick={() => setView("list")} title="问题列表">{structureItems.length + stateItems.length > 0 ? `🔍 问题 ${structureItems.length + stateItems.length}` : "🔍 问题"}</button>
      </div>
      <div className="advice-count">
        {structErr > 0 && <span className="diag-badge-error">{structErr}</span>}
        {structWarn > 0 && <span className="diag-badge-warning">{structWarn}</span>}
      </div>
      <button className="advice-close" onClick={onClose} title="返回属性面板">✕</button>
    </div>
  );

  return (
    <div className="advice-sidebar">
      {head}
      {view === "overview" ? (
        <div className="advice-scroll">
          {/* 健康计数卡 */}
          <div className="advice-health">
            <div className={`health-card${structErr + structWarn > 0 ? " bad" : " ok"}`}>
              <div className="health-num">{structErr + structWarn}</div>
              <div className="health-label">结构问题</div>
            </div>
            <div className={`health-card${stateCount > 0 ? " warn" : " ok"}`}>
              <div className="health-num">{stateCount}</div>
              <div className="health-label">工况提示</div>
            </div>
            <div className="health-card">
              <div className="health-num">{appliedList.length}</div>
              <div className="health-label">已修改</div>
            </div>
          </div>
          {structErr + structWarn + stateCount === 0 && appliedList.length === 0 && (
            <div className="advice-empty">✓ 无待处理建议</div>
          )}

          {/* 出口状态 */}
          {outletStatus.length > 0 && (
            <div className="advice-group-title">出口状态（该流却不流）</div>
          )}
          <div className="advice-outlets">
            {outletStatus.map((o) => (
              <span key={o.id} className={`outlet-chip ${o.flowing ? "on" : "off"}`} onClick={() => focusElement(o.id)} style={{ cursor: "pointer" }}>
                <span className="outlet-dot" />{o.label}
              </span>
            ))}
          </div>

          {/* 泵/锅炉状态 */}
          {powerStatus.pumps.length + powerStatus.boilers.length > 0 && <div className="advice-group-title">泵与锅炉</div>}
          <div className="advice-power">
            {powerStatus.pumps.map((p) => (
              <div key={p.id} className="power-row" onClick={() => { focusElement(p.id); blinkElements([p.id]); }} style={{ cursor: "pointer" }}>
                <span className={`power-dot ${p.on ? "on" : "off"}${p.fault ? " fault" : ""}`} />
                <span className="power-label">{p.label}</span>
                <span className="power-state">{p.fault ? "故障" : p.on ? "运行" : "停止"}</span>
              </div>
            ))}
            {powerStatus.boilers.map((b) => (
              <div key={b.id} className="power-row" onClick={() => { focusElement(b.id); blinkElements([b.id]); }} style={{ cursor: "pointer" }}>
                <span className="power-dot on" />
                <span className="power-label">{b.label}</span>
                <span className="power-state">{b.type === "steamBoiler" ? "蒸汽" : "热水"}</span>
              </div>
            ))}
          </div>

          <div className="advice-note">👉 点「问题」查看具体建议：悬停画布闪烁定位、停流类可沿链点亮根因路径、一键修改后可撤回。</div>
        </div>
      ) : (
        <div className="advice-list-wrap">
          <div className="advice-filter">
            {filters.map((f) => (
              <button key={f.key} className={`advice-filter-btn${filter === f.key ? " active" : ""}`} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <div className="advice-scroll" ref={listRef}>
            {structureItems.length === 0 && stateItems.length === 0 && appliedList.length === 0 ? (
              <div className="advice-empty">✓ 无待处理建议</div>
            ) : (
              <>
                {structureItems.length > 0 && (
                  <div className="advice-group-title">结构问题（接线 / 介质）· {structureItems.length}</div>
                )}
                {structureItems.map((a, i) => renderItem(a, false, i + 1))}
                {stateItems.length > 0 && (
                  <>
                    <button className="advice-group-title advice-group-toggle" onClick={() => setStateOpen(!stateOpen)}>
                      {stateOpen ? "▾" : "▸"} 工况提示（泵停 / 阀关 / 停流）· {stateItems.length}
                    </button>
                    {stateOpen && stateItems.map((a, i) => renderItem(a, false, i + 1))}
                  </>
                )}
                {inScenario && (
                  <div className="advice-note">🎬 演示进行中：工况提示与演示步骤无关，已折叠。</div>
                )}
                {appliedList.length > 0 && (
                  <>
                    <div className="advice-group-title">已修改（可撤回）</div>
                    {appliedList.map((a) => renderItem(a, true))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
