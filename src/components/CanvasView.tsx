import { useEffect, useMemo, useRef, useState } from "react";
import type { DiagramNode, Pipe, Pt } from "../types";
import {
  computeAlign,
  findPort,
  nearestPort,
  nodeBBox,
  pathD,
  pipePolyline,
  polylineBBox,
  PORT_STUB,
  portWorldNormal,
  portWorldPos,
  projectOnPolyline,
  rectsIntersect,
  setCachedPipes,
  simplify,
  snap,
  pipeEffectiveDisabled,
  pipeTeachingOverride
} from "../geometry";
import { NodeSymbol, spoutTips, defOf, nodeCanvasLabel } from "../symbols";
import { MiniMap } from "./MiniMap";
import { PipeView } from "./PipeView";
import { useT } from "../i18n";
import { ContextMenu } from "./ContextMenu";
import { focusElement, blinkElements, showChainPath } from "../store";
import { collectAdvice, traceStopCause } from "../advice";
import { traceFunctionalChain } from "../functionalChain";
import {
  BOILER_TYPES,
  addNodeAt,
  clearSelection,
  copyNodeStyle,
  copyPipeStyle,
  createPipe,
  deleteSelection,
  duplicateSelection,
  expandGroup,
  fitToScreen,
  generateLegend,
  groupSelection,
  hasNodeStyle,
  hasPipeStyle,
  newDiagram,
  pasteFromClipboard,
  pasteNodeStyle,
  pastePipeStyle,
  pushHistory,
  selectNode,
  selectPipe,
  setMouseWorld,
  setSelection,
  setSelectionDisabled,
  setUI,
  store,
  ungroupSelection,
  updateDiagram,
  useAppState,
  zoomAt,
  loadDiagram,
  syncFluidThroughChain
} from "../store";
import { patchNode, patchPipe } from "../store";
import { parseDiagramJSON } from "../export";
import { checkDiagramFluid, fluidLabel, fluidColor } from "../fluidRules";

type DragState =
  | { type: "pan"; startClientX: number; startClientY: number; startPanX: number; startPanY: number }
  | { type: "node"; ids: string[]; start: Map<string, Pt>; startWorld: Pt; moved: boolean }
  | { type: "vertex"; pipeId: string; vIndex: number; pts: Pt[]; free: boolean; moved: boolean }
  | { type: "marquee"; start: Pt }
  | { type: "connect"; fromPortId: string; fromNodeId: string }
  | { type: "port"; nodeId: string; portId: string; moved: boolean }
  | { type: "terminal"; pipeId: string; end: "from" | "to"; exclude: string[]; moved: boolean }
  | { type: "resize"; nodeId: string; corner: string; start: { x: number; y: number; w: number; h: number }; startWorld: Pt; moved: boolean; startRot: number; startAngle: number }
  | { type: "annotation-target"; nodeId: string; startWorld: Pt; moved: boolean };

export interface CanvasHandle {
  svg: () => SVGSVGElement | null;
}

export function CanvasView({ svgRefOut }: { svgRefOut: React.MutableRefObject<SVGSVGElement | null> }) {
  const app = useAppState();
  const { t, lang } = useT();
  const { diagram, ui } = app;
  const blinkIds = new Set(ui.blink?.ids ?? []);
  const blinkStamp = ui.blink?.stamp ?? 0;
  // 元件→整机功能链（单选时高亮；演示/多选时不叠加）
  const funcChain = useMemo(() => {
    if (ui.scenario) return null;
    if (ui.selection.nodes.length + ui.selection.pipes.length !== 1) return null;
    return traceFunctionalChain(diagram, ui.selection.nodes[0], ui.selection.pipes[0]);
  }, [diagram, ui.selection, ui.scenario]);
  const funcNodeSet = new Set(funcChain?.nodeIds ?? []);
  const funcPipeSet = new Set(funcChain?.pipeIds ?? []);
  // 选中单根管路：两端端口高亮（便于看清连接关系）
  const selectedPipeEnds = useMemo(() => {
    if (ui.selection.nodes.length !== 0 || ui.selection.pipes.length !== 1) return null;
    const p = diagram.pipes.find((x) => x.id === ui.selection.pipes[0]);
    if (!p || (!p.fromPortId && !p.toPortId)) return null;
    return { fromPortId: p.fromPortId, toPortId: p.toPortId };
  }, [diagram, ui.selection]);
  const chainPathSet = new Set(ui.chainPath?.pipeIds ?? []);
  // 介质物理常识校验：实时计算冲突，供画布感叹号与修复菜单使用
  const fluidIssues = useMemo(() => checkDiagramFluid(diagram), [diagram]);
  // 结构问题即时 lint：接线/介质错误实时红点（不依赖打开诊断面板）
  const structLint = useMemo(() => {
    const nodeMsg = new Map<string, string>();
    const pipeMsg = new Map<string, string>();
    for (const a of collectAdvice(diagram)) {
      if (a.category !== "structure") continue;
      for (const id of a.elementIds) {
        if (diagram.nodes.some((n) => n.id === id)) nodeMsg.set(id, `${a.title}：${a.message}`);
        else if (diagram.pipes.some((pp) => pp.id === id)) pipeMsg.set(id, `${a.title}：${a.message}`);
      }
    }
    return { nodeMsg, pipeMsg };
  }, [diagram]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const flowRefs = useRef(new Map<string, SVGPathElement>());
  const offsets = useRef(new Map<string, number>());
  const dragRef = useRef<DragState | null>(null);
  const spaceRef = useRef(false);
  const [connectMouse, setConnectMouse] = useState<Pt | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<Pt | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverPort, setHoverPort] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [snapPortId, setSnapPortId] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  // 右键菜单
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: Array<{ label: string; onClick?: () => void; danger?: boolean; disabled?: boolean; divider?: boolean }> } | null>(null);
  const [stopCause, setStopCause] = useState<{ x: number; y: number; pipeId: string; reason: string; ids: string[] } | null>(null);
  // 标签就地编辑：{ kind: "pipe"|"node"; id: string; x; y }
  const [editingLabel, setEditingLabel] = useState<{ kind: "pipe" | "node"; id: string; x: number; y: number; width: number; value: string } | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    svgRefOut.current = svgRef.current;
  });

  // ===== 流动动画：rAF 直接驱动 stroke-dashoffset，避免 React 重渲染 =====
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const st = store.get();
      setCachedPipes(st.diagram.pipes, st.diagram.nodes); // 同步管路缓存用于传播检测
      if (st.diagram.settings.globalAnimationPlaying) {
        const flowScale = st.diagram.settings.flowScale ?? 1;
        for (const pipe of st.diagram.pipes) {
          if (!pipe.animated) continue;
          if (pipeEffectiveDisabled(pipe, st.diagram.nodes)) continue; // 置灰/阀门关断管路：冻结不流动
          const el = flowRefs.current.get(pipe.id);
          if (!el) continue;
          const speedPx = (26 + pipe.flowSpeed * 58) * flowScale; // 流速 → 像素速度
          const dir = pipe.direction === "forward" ? 1 : -1;
          const off = (offsets.current.get(pipe.id) ?? 0) - dir * speedPx * dt;
          offsets.current.set(pipe.id, off);
          el.setAttribute("stroke-dashoffset", off.toFixed(2));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ===== 样式刷模式：Esc 退出 =====
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && store.get().ui.styleBrush) {
        setUI({ styleBrush: false });
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  // ===== 空格平移 =====
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement)?.closest("input,textarea")) {
        spaceRef.current = true;
        forceRender((v) => v + 1);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        forceRender((v) => v + 1);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function screenToWorld(clientX: number, clientY: number): Pt {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - ui.panX) / ui.zoom,
      y: (clientY - rect.top - ui.panY) / ui.zoom
    };
  }

  function beginWindowDrag(onMove: (e: MouseEvent) => void, onUp: (e: MouseEvent) => void) {
    const move = (e: MouseEvent) => onMove(e);
    const up = (e: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onUp(e);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // ===== 背景：平移 / 框选 =====
  function onBackgroundMouseDown(e: React.MouseEvent) {
    if (e.button === 1 || e.button === 2 || spaceRef.current) {
      const st = store.get().ui;
      dragRef.current = {
        type: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: st.panX,
        startPanY: st.panY
      };
      beginWindowDrag(
        (ev) => {
          const d = dragRef.current;
          if (d?.type !== "pan") return;
          setUI({ panX: d.startPanX + ev.clientX - d.startClientX, panY: d.startPanY + ev.clientY - d.startClientY });
        },
        () => (dragRef.current = null)
      );
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const start = screenToWorld(e.clientX, e.clientY);
    dragRef.current = { type: "marquee", start };
    setMarqueeEnd(start);
    beginWindowDrag(
      (ev) => {
        const d = dragRef.current;
        if (d?.type !== "marquee") return;
        setMarqueeEnd(screenToWorld(ev.clientX, ev.clientY));
      },
      (ev) => {
        const d = dragRef.current;
        dragRef.current = null;
        if (d?.type !== "marquee") return;
        const end = screenToWorld(ev.clientX, ev.clientY);
        const rect = {
          x: Math.min(d.start.x, end.x),
          y: Math.min(d.start.y, end.y),
          w: Math.abs(d.start.x - end.x),
          h: Math.abs(d.start.y - end.y)
        };
        setMarqueeEnd(null);
        if (rect.w < 4 && rect.h < 4) {
          clearSelection();
          return;
        }
        const st = store.get().diagram;
        const nodes = expandGroup(st.nodes.filter((n) => rectsIntersect(rect, nodeBBox(n))).map((n) => n.id));
        const pipes = st.pipes
          .filter((p) => {
            const pts = pipePolyline(p, st.nodes);
            return pts ? rectsIntersect(rect, polylineBBox(pts)) : false;
          })
          .map((p) => p.id);
        setSelection({ nodes, pipes });
      }
    );
  }

  // ===== 节点拖动 =====
  function onNodeMouseDown(e: React.MouseEvent, node: DiagramNode) {
    if (e.button !== 0 || spaceRef.current) return;
    e.stopPropagation();
    // 样式刷模式：第一次点击吸取，后续点击应用
    if (ui.styleBrush) {
      e.preventDefault();
      if (!hasNodeStyle()) {
        copyNodeStyle(node.id);
        setSelection({ nodes: [node.id], pipes: [] });
      } else {
        pasteNodeStyle(node.id);
      }
      return;
    }
    const st = store.get().ui;
    let ids = st.selection.nodes;
    if (!ids.includes(node.id)) {
      selectNode(node.id, e.shiftKey);
      const group = expandGroup([node.id]);
      ids = e.shiftKey ? [...new Set([...st.selection.nodes, ...group])] : group;
    }
    const startWorld = screenToWorld(e.clientX, e.clientY);
    const startPos = new Map<string, Pt>();
    store
      .get()
      .diagram.nodes.filter((n) => ids.includes(n.id))
      .forEach((n) => startPos.set(n.id, { x: n.x, y: n.y }));
    dragRef.current = { type: "node", ids, start: startPos, startWorld, moved: false };
    beginWindowDrag(
      (ev) => {
        const d = dragRef.current;
        if (d?.type !== "node") return;
        const cur = screenToWorld(ev.clientX, ev.clientY);
        let dx = cur.x - d.startWorld.x;
        let dy = cur.y - d.startWorld.y;
        if (!d.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        if (!d.moved) {
          pushHistory();
          d.moved = true;
        }
        const nodes = store.get().diagram.nodes;
        let vLines: number[] = [];
        let hLines: number[] = [];
        const settings = store.get().diagram.settings;
        const guidesEnabled = settings.showAlignmentGuides !== false;
        const snapEnabled = settings.snapToGrid !== false;
        if (ev.altKey || !guidesEnabled) {
          // 按住 Alt 临时关闭吸附，或项目设置关闭对齐辅助线：不参与对齐
          setGuides({ v: [], h: [] });
        } else {
          // 拖动集合的整体包围盒 vs 其余节点
          const movingRects = nodes.filter((n) => d.start.has(n.id)).map((n) => {
            const s = d.start.get(n.id)!;
            const bb = nodeBBox({ ...n, x: s.x + dx, y: s.y + dy });
            return bb;
          });
          const others = nodes.filter((n) => !d.start.has(n.id)).map(nodeBBox);
          if (movingRects.length && others.length) {
            const minX = Math.min(...movingRects.map((r) => r.x));
            const minY = Math.min(...movingRects.map((r) => r.y));
            const box = {
              x: minX,
              y: minY,
              w: Math.max(...movingRects.map((r) => r.x + r.w)) - minX,
              h: Math.max(...movingRects.map((r) => r.y + r.h)) - minY
            };
            const tol = 7 / store.get().ui.zoom;
            const al = computeAlign(box, others, tol);
            dx += al.dx;
            dy += al.dy;
            vLines = al.vLines;
            hLines = al.hLines;
          }
        }
        // 未命中对齐的轴回落到网格吸附（可在项目设置关闭）
        const gx = vLines.length === 0;
        const gy = hLines.length === 0;
        setGuides({ v: vLines, h: hLines });
        updateDiagram((draft) => {
          for (const n of draft.nodes) {
            const s = d.start.get(n.id);
            if (s) {
              n.x = snapEnabled && !ev.altKey && gx ? snap(s.x + dx) : s.x + dx;
              n.y = snapEnabled && !ev.altKey && gy ? snap(s.y + dy) : s.y + dy;
            }
          }
        }, false);
        return;
      },
      () => {
        dragRef.current = null;
        setGuides({ v: [], h: [] });
      }
    );
  }

  // ===== 端口拖拽改位（Alt+拖动） =====
  function onPortMoveDrag(nodeId: string, portId: string) {
    dragRef.current = { type: "port", nodeId, portId, moved: false };
    beginWindowDrag(
      (ev) => {
        const d = dragRef.current;
        if (d?.type !== "port") return;
        const node = store.get().diagram.nodes.find((n) => n.id === d.nodeId);
        if (!node) return;
        if (!d.moved) {
          pushHistory();
          d.moved = true;
        }
        // 转换到节点局部坐标（逆旋转）
        const world = screenToWorld(ev.clientX, ev.clientY);
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        const rad = (-node.rotation * Math.PI) / 180;
        const dx = world.x - cx;
        const dy = world.y - cy;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad) + node.width / 2;
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad) + node.height / 2;
        // 距离四条边的距离，取最近边（锅炉仅允许上/下端）
        const dist = { left: lx, right: node.width - lx, top: ly, bottom: node.height - ly };
        const sides: Array<keyof typeof dist> = BOILER_TYPES.has(node.type)
          ? ["top", "bottom"]
          : (Object.keys(dist) as Array<keyof typeof dist>);
        const side = sides.reduce((a, b) => (dist[a] <= dist[b] ? a : b));
        const offRaw = side === "left" || side === "right" ? ly / node.height : lx / node.width;
        const offset = Math.round(Math.min(0.95, Math.max(0.05, offRaw)) * 100) / 100;
        updateDiagram((draft) => {
          const n = draft.nodes.find((nn) => nn.id === d.nodeId);
          const p = n?.ports.find((pp) => pp.id === d.portId);
          if (p) {
            p.position = side;
            p.offset = offset;
          }
        }, false);
      },
      () => (dragRef.current = null)
    );
  }

  // ===== 节点缩放（四角手柄）+ Shift 旋转 =====
  function onResizeMouseDown(e: React.MouseEvent, node: DiagramNode, corner: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startWorld = screenToWorld(e.clientX, e.clientY);
    const startRot = node.rotation;
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const startAngle = Math.atan2(startWorld.y - cy, startWorld.x - cx) * (180 / Math.PI);
    dragRef.current = {
      type: "resize",
      nodeId: node.id,
      corner,
      start: { x: node.x, y: node.y, w: node.width, h: node.height },
      startWorld,
      moved: false,
      startRot,
      startAngle
    };
    beginWindowDrag(
      (ev) => {
        const d = dragRef.current;
        if (d?.type !== "resize") return;
        // Shift 键旋转
        if (ev.shiftKey) {
          const cur = screenToWorld(ev.clientX, ev.clientY);
          const curAngle = Math.atan2(cur.y - cy, cur.x - cx) * (180 / Math.PI);
          if (!d.moved && Math.abs(cur.x - d.startWorld.x) < 2 && Math.abs(cur.y - d.startWorld.y) < 2) return;
          if (!d.moved) { pushHistory(); d.moved = true; }
          let rot = d.startRot + (curAngle - d.startAngle);
          rot = ((rot % 360) + 360) % 360;
          updateDiagram((draft) => {
            const n = draft.nodes.find((nn) => nn.id === d.nodeId);
            if (n) n.rotation = Math.round(rot);
          }, false);
          return;
        }
        // 正常缩放
        const cur = screenToWorld(ev.clientX, ev.clientY);
        const dx = cur.x - d.startWorld.x;
        const dy = cur.y - d.startWorld.y;
        if (!d.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        if (!d.moved) {
          pushHistory();
          d.moved = true;
        }
        const MIN = 24;
        let { x, y, w, h } = d.start;
        if (d.corner.includes("e")) w = Math.max(MIN, d.start.w + dx);
        if (d.corner.includes("s")) h = Math.max(MIN, d.start.h + dy);
        if (d.corner.includes("w")) {
          w = Math.max(MIN, d.start.w - dx);
          x = d.start.x + d.start.w - w;
        }
        if (d.corner.includes("n")) {
          h = Math.max(MIN, d.start.h - dy);
          y = d.start.y + d.start.h - h;
        }
        updateDiagram((draft) => {
          const n = draft.nodes.find((nn) => nn.id === d.nodeId);
          if (n) {
            n.x = snap(x, 4);
            n.y = snap(y, 4);
            n.width = snap(w, 4);
            n.height = snap(h, 4);
          }
        }, false);
      },
      () => (dragRef.current = null)
    );
  }

  // ===== 端口连线 =====
  function onPortMouseDown(e: React.MouseEvent, nodeId: string, portId: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.altKey) {
      onPortMoveDrag(nodeId, portId);
      return;
    }
    dragRef.current = { type: "connect", fromPortId: portId, fromNodeId: nodeId };
    setConnectMouse(screenToWorld(e.clientX, e.clientY));
    beginWindowDrag(
      (ev) => {
        const d = dragRef.current;
        if (d?.type !== "connect") return;
        setConnectMouse(screenToWorld(ev.clientX, ev.clientY));
      },
      (ev) => {
        const d = dragRef.current;
        dragRef.current = null;
        setConnectMouse(null);
        if (d?.type !== "connect") return;
        const target = (ev.target as Element)?.closest?.("[data-port-id]");
        const toPortId = target?.getAttribute("data-port-id");
        if (toPortId && toPortId !== d.fromPortId) {
          createPipe(d.fromPortId, toPortId);
        }
      }
    );
  }

  // ===== 管路折点拖动（曲线自由 / 折线落网格） =====
  function onVertexMouseDown(e: React.MouseEvent, pipe: Pipe, pts: Pt[], vIndex: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const free = pipe.routing === "curved";
    dragRef.current = { type: "vertex", pipeId: pipe.id, vIndex, pts: pts.map((p) => ({ ...p })), free, moved: false };
    beginWindowDrag(
      (ev) => {
        const d = dragRef.current;
        if (d?.type !== "vertex") return;
        const cur = screenToWorld(ev.clientX, ev.clientY);
        if (!d.moved) {
          pushHistory();
          d.moved = true;
        }
        const next = d.pts.map((p) => ({ ...p }));
        next[d.vIndex] = free ? cur : { x: snap(cur.x), y: snap(cur.y) };
        updateDiagram((draft) => {
          const p = draft.pipes.find((pp) => pp.id === d.pipeId);
          if (p) p.points = simplify(next).slice(1, -1);
        }, false);
      },
      () => (dragRef.current = null)
    );
  }

  // ===== 选中管路上点击 → 插入折点并立即拖动 =====
  function onPipeBodyMouseDown(e: React.MouseEvent, pipe: Pipe, pts: Pt[], selected: boolean) {
    if (e.button !== 0 || spaceRef.current) return;
    e.stopPropagation();
    // 样式刷模式：第一次点击吸取管路样式，后续点击应用
    if (ui.styleBrush) {
      e.preventDefault();
      if (!hasPipeStyle()) {
        copyPipeStyle(pipe.id);
        setSelection({ nodes: [], pipes: [pipe.id] });
      } else {
        pastePipeStyle(pipe.id);
      }
      return;
    }
    if (!selected && !e.shiftKey) {
      selectPipe(pipe.id, e.shiftKey);
      return;
    }
    // 已选中：在该位置插入折点并进入拖动
    const world = screenToWorld(e.clientX, e.clientY);
    const proj = projectOnPolyline(pts, world);
    const free = pipe.routing === "curved";
    const np = free ? proj.point : { x: snap(proj.point.x), y: snap(proj.point.y) };
    const full = [...pts];
    full.splice(proj.index + 1, 0, np);
    dragRef.current = { type: "vertex", pipeId: pipe.id, vIndex: proj.index + 1, pts: full.map((p) => ({ ...p })), free, moved: false };
    beginWindowDrag(
      (ev) => {
        const d = dragRef.current;
        if (d?.type !== "vertex") return;
        const cur = screenToWorld(ev.clientX, ev.clientY);
        if (!d.moved) {
          pushHistory();
          d.moved = true;
        }
        const next = d.pts.map((p) => ({ ...p }));
        next[d.vIndex] = free ? cur : { x: snap(cur.x), y: snap(cur.y) };
        updateDiagram((draft) => {
          const p = draft.pipes.find((pp) => pp.id === d.pipeId);
          if (p) p.points = simplify(next).slice(1, -1);
        }, false);
      },
      () => (dragRef.current = null)
    );
  }

  // ===== 右键折点删除 =====
  function removeVertex(pipe: Pipe, vIndex: number) {
    pushHistory();
    updateDiagram((draft) => {
      const p = draft.pipes.find((pp) => pp.id === pipe.id);
      if (!p) return;
      const next = pipePolyline(p, draft.nodes);
      if (!next || next.length < 4) return; // 至少保留两端 + 1 折点
      const arr = next.slice(1, -1);
      arr.splice(vIndex - 1, 1);
      p.points = arr;
    });
  }

  // ===== 管路端子拖拽（重连端口 / 游离端点） =====
  function onTerminalMouseDown(e: React.MouseEvent, pipe: Pipe, end: "from" | "to") {
    if (e.button !== 0 || spaceRef.current) return;
    e.stopPropagation();
    selectPipe(pipe.id, e.shiftKey);
    const exclude = [pipe.fromPortId, pipe.toPortId].filter(Boolean) as string[];
    dragRef.current = { type: "terminal", pipeId: pipe.id, end, exclude, moved: false };
    beginWindowDrag(
      (ev) => {
        const d = dragRef.current;
        if (d?.type !== "terminal") return;
        const world = screenToWorld(ev.clientX, ev.clientY);
        if (!d.moved) {
          pushHistory();
          d.moved = true;
        }
        const tol = 16 / store.get().ui.zoom;
        const cand = nearestPort(store.get().diagram.nodes, world, d.exclude, tol);
        setSnapPortId(cand?.portId ?? null);
        const pt = { x: snap(world.x), y: snap(world.y) };

        updateDiagram((draft) => {
          const p = draft.pipes.find((pp) => pp.id === d.pipeId);
          if (!p) return;
          if (d.end === "from") {
            if (cand) {
              p.fromPortId = cand.portId;
              p.fromPoint = undefined;
            } else {
              p.fromPortId = undefined;
              p.fromPoint = pt;
            }
          } else {
            if (cand) {
              p.toPortId = cand.portId;
              p.toPoint = undefined;
            } else {
              p.toPortId = undefined;
              p.toPoint = pt;
            }
          }
        }, false);
      },
      () => {
        dragRef.current = null;
        setSnapPortId(null);
      }
    );
  }

  function onWheel(e: React.WheelEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0012);
    zoomAt(e.clientX, e.clientY, factor, rect);
  }

  // ===== 标注目标点拖拽 =====
  function onAnnotationTargetMouseDown(e: React.MouseEvent, nodeId: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startWorld = screenToWorld(e.clientX, e.clientY);
    dragRef.current = { type: "annotation-target", nodeId, startWorld, moved: false };
    beginWindowDrag(
      (ev) => {
        const d = dragRef.current;
        if (d?.type !== "annotation-target") return;
        const cur = screenToWorld(ev.clientX, ev.clientY);
        const dx = cur.x - d.startWorld.x;
        const dy = cur.y - d.startWorld.y;
        if (!d.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        if (!d.moved) { pushHistory(); d.moved = true; }
        updateDiagram((draft) => {
          const node = draft.nodes.find((n) => n.id === d.nodeId);
          if (node && node.pointerTarget) {
            node.pointerTarget.x += dx;
            node.pointerTarget.y += dy;
          }
        }, false);
        dragRef.current = { ...d, startWorld: cur };
      },
      () => (dragRef.current = null)
    );
  }

  // ===== 电磁阀/泵 画布切换 =====
  function onValveToggle(nodeId: string, path?: "A" | "B" | "off") {
    const node = store.get().diagram.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    pushHistory();
    if (node.type === "solenoid2") {
      patchNode(nodeId, { valveState: node.valveState === "closed" ? "open" : "closed" });
    } else if (node.type === "solenoid3" && path) {
      patchNode(nodeId, { valvePath: path });
    } else if (node.type === "pump" || node.type === "milkPump") {
      patchNode(nodeId, { pumpOn: node.pumpOn === false ? true : false });
    }
  }

  // ===== 标签就地编辑 =====
  function beginLabelEdit(kind: "pipe" | "node", id: string, worldX: number, worldY: number, value: string) {
    setEditingLabel({ kind, id, x: worldX, y: worldY, width: Math.max(90, value.length * 7 + 30), value });
    // 下一帧聚焦
    requestAnimationFrame(() => editInputRef.current?.focus());
  }

  function commitLabelEdit() {
    if (!editingLabel) return;
    const { kind, id, value } = editingLabel;
    const trimmed = value.trim();
    pushHistory();
    if (kind === "pipe") {
      patchPipe(id, { label: trimmed });
    } else {
      patchNode(id, { label: trimmed });
    }
    setEditingLabel(null);
  }

  function cancelLabelEdit() {
    setEditingLabel(null);
  }

  // 结构 lint 红点 → 打开诊断面板并定位
  function openAdviceAndFocus(id: string) {
    window.dispatchEvent(new CustomEvent("fluidpath:open-advice"));
    focusElement(id);
    blinkElements([id]);
  }

  // ===== 停流因果卡（右键「为什么停流」） =====
  function showStopCause(pipeId: string, x: number, y: number) {
    const d = store.get().diagram;
    const p = d.pipes.find((pp) => pp.id === pipeId);
    if (!p) return;
    const cause = traceStopCause(p, d);
    setStopCause({ x, y, pipeId, reason: cause.reason, ids: cause.ids });
  }

  // ===== 画布右键菜单 =====
  function openContextMenu(e: React.MouseEvent, kind: "canvas" | "node" | "pipe", id?: string) {
    e.preventDefault();
    e.stopPropagation();
    const sel = store.get().ui.selection;
    const hasSel = sel.nodes.length + sel.pipes.length > 0;
    const items: Array<{ label: string; onClick?: () => void; danger?: boolean; disabled?: boolean; divider?: boolean }> = [];

    if (kind === "node" && id) {
      if (!sel.nodes.includes(id)) selectNode(id);
      items.push({ label: "📋 复制节点 (Ctrl+D)", onClick: () => duplicateSelection() });
      items.push({ label: "🎨 复制节点样式", onClick: () => copyNodeStyle(id) });
      items.push({ label: "📌 粘贴节点样式", onClick: () => pasteNodeStyle(id), disabled: !hasNodeStyle() });
      items.push({ label: "---", divider: true });
      items.push({ label: "🔗 成组 (Ctrl+G)", onClick: () => groupSelection(), disabled: sel.nodes.length < 2 });
      items.push({ label: "🔓 解散组", onClick: () => ungroupSelection(), disabled: !sel.nodes.some((nid) => store.get().diagram.nodes.find((n) => n.id === nid)?.groupId) });
      items.push({ label: "---", divider: true });
      items.push({ label: "🌫️ 置灰选中", onClick: () => setSelectionDisabled(true) });
      items.push({ label: "✨ 取消置灰", onClick: () => setSelectionDisabled(false) });
      items.push({ label: "---", divider: true });
      items.push({ label: "🗑️ 删除节点", onClick: () => deleteSelection(), danger: true });
    } else if (kind === "pipe" && id) {
      if (!sel.pipes.includes(id)) selectPipe(id);
      const p = store.get().diagram.pipes.find((x) => x.id === id);
      const pipeStopped = !!p && pipeTeachingOverride(p) !== "flow" && pipeEffectiveDisabled(p, store.get().diagram.nodes);
      if (pipeStopped) {
        items.push({ label: "🔍 为什么停流？", onClick: () => showStopCause(p!.id, e.clientX, e.clientY) });
        items.push({ label: "---", divider: true });
      }
      items.push({ label: "🔄 重置走线", onClick: () => { const pp = store.get().diagram.pipes.find((x) => x.id === id); if (pp) patchPipe(id, { points: [] }); } });
      items.push({ label: "↔️ 反向流向", onClick: () => { const p = store.get().diagram.pipes.find((x) => x.id === id); if (p) patchPipe(id, { direction: p.direction === "forward" ? "reverse" : "forward" }); } });
      items.push({ label: "🔗 沿直通链同步介质", onClick: () => syncFluidThroughChain(id) });
      items.push({ label: "🎨 复制管路样式", onClick: () => copyPipeStyle(id) });
      items.push({ label: "📌 粘贴管路样式", onClick: () => pastePipeStyle(id), disabled: !hasPipeStyle() });
      items.push({ label: "---", divider: true });
      items.push({ label: "🗑️ 删除管路", onClick: () => deleteSelection(), danger: true });
    } else {
      // 画布空白
      items.push({ label: "📋 粘贴 (Ctrl+V)", onClick: () => pasteFromClipboard(), disabled: !store.get().ui.clipboard });
      items.push({ label: "---", divider: true });
      items.push({ label: "⊡ 适应画布", onClick: () => { const el = document.querySelector(".main-canvas"); fitToScreen((el as HTMLElement)?.clientWidth ?? 1200, (el as HTMLElement)?.clientHeight ?? 800); } });
      items.push({ label: "📊 生成图例", onClick: () => { const svg = document.querySelector(".main-canvas") as SVGSVGElement | null; if (!svg) return; const bb = svg.getBoundingClientRect(); const wx = (-store.get().ui.panX) / store.get().ui.zoom + bb.width / 2 / store.get().ui.zoom - 180; const wy = (-store.get().ui.panY) / store.get().ui.zoom + bb.height / 2 / store.get().ui.zoom; generateLegend(wx, wy); } });
      items.push({ label: "---", divider: true });
      items.push({ label: "🗑️ 全部清除", onClick: () => { if (confirm("确定清空整个画布？")) newDiagram(); }, danger: true });
    }

    if (!hasSel && kind === "canvas") {
      items[0] = { label: "📋 粘贴 (Ctrl+V)", onClick: () => pasteFromClipboard(), disabled: !store.get().ui.clipboard };
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  }

  // ===== 介质冲突感叹号 → 逐条选择修复 =====
  function handleFluidIssueClick(pipe: Pipe, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const issues = checkDiagramFluid(store.get().diagram).get(pipe.id);
    if (!issues || !issues.length) return;
    const items: Array<{ label: string; onClick?: () => void; danger?: boolean; disabled?: boolean; divider?: boolean }> = [];
    items.push({ label: `⚠️ 介质异常（${issues.length} 处）`, disabled: true });
    items.push({ label: "---", divider: true });
    for (const issue of issues) {
      items.push({ label: `${issue.nodeLabel}：应为 ${issue.allowed.map(fluidLabel).join(" / ")}`, disabled: true });
      for (const ft of issue.allowed) {
        items.push({
          label: `   ↳ 改为「${fluidLabel(ft)}」`,
          onClick: () => patchPipe(pipe.id, { fluidType: ft, fluidColor: fluidColor(ft) }),
        });
      }
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  }

  // ===== 元件库拖放 + 图片拖放 + JSON 拖入加载 =====
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    // 先检查是否有图片文件被拖入
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      for (const f of files) {
        // JSON 工程文件
        if (f.name.endsWith(".json")) {
          f.text().then((text) => {
            try {
              loadDiagram(parseDiagramJSON(text));
            } catch (err) {
              alert(`打开失败：${(err as Error).message}`);
            }
          });
          return;
        }
        if (f.type.startsWith("image/")) {
          const reader = new FileReader();
          const pt = screenToWorld(e.clientX, e.clientY);
          reader.onload = () => {
            const node = addNodeAt("image", snap(pt.x - 80), snap(pt.y - 60), undefined);
            updateDiagram((d) => {
              const n = d.nodes.find((nn) => nn.id === node.id);
              if (n) {
                n.imageData = reader.result as string;
                n.width = 240;
                n.height = 180;
              }
            });
          };
          reader.readAsDataURL(f);
          return;
        }
      }
      return;
    }
    const type = e.dataTransfer.getData("application/fluidpath-node");
    if (!type) return;
    const variant = e.dataTransfer.getData("application/fluidpath-variant") || undefined;
    const pt = screenToWorld(e.clientX, e.clientY);
    addNodeAt(type as DiagramNode["type"], snap(pt.x - 50), snap(pt.y - 50), variant as DiagramNode["variant"]);
  }

  // ===== 渲染管路 =====
  // ===== 渲染节点 =====
  function renderNode(node: DiagramNode) {
    const selected = ui.selection.nodes.includes(node.id);
    const showPorts = selected || hoverNode === node.id || dragRef.current?.type === "connect";
    // 锅炉上下端端口常显可点，便于在其上方安装多个附件并精确选择连接
    const portHint = BOILER_TYPES.has(node.type);
    const portVisible = showPorts || portHint;
    // 接头延长线（stub）常显：低透明度，悬停/连线时加亮——即使实际接头朝向与元件图不符也能一眼找到接线处
    const portOpacity = showPorts ? 1 : 0.45;
    // 演示模式：激活节点高亮光环，非激活淡化
    const scenario = ui.scenario;
    const nodeActive = scenario ? scenario.activeNodes.includes(node.id) : true;
    const nodeDim = scenario ? !nodeActive : false;
    // 悬停浮动提示：元件名 + 类型 + 当前状态（解决元件多、文字小找不到）
    const stateHint = (() => {
      if (node.type === "pump" || node.type === "milkPump") return node.pumpOn !== false ? "运行" : "停止";
      if (node.type === "solenoid2") return node.valveState === "open" ? "开" : "关";
      if (node.type === "solenoid3") return node.valvePath === "A" ? "A 路" : node.valvePath === "B" ? "B 路" : "关";
      return "";
    })();
    return (
      <g key={node.id}>
        <title>{nodeCanvasLabel(node, lang) || defOf(node.type, node.variant).label}{stateHint ? `（${stateHint}）` : ""}{node.fault ? " · 故障" : ""}</title>
        {/* 故障模拟红色标记（教学用） */}
        {node.fault && (
          <g pointerEvents="none" transform={`translate(${node.x + node.width} ${node.y})`}>
            <circle cx={0} cy={0} r={9} fill="#d64545" stroke="#ffffff" strokeWidth={1.6} />
            <text x={0} y={4} textAnchor="middle" fontSize={12} fontWeight={800} fill="#ffffff" fontFamily="system-ui, sans-serif">!</text>
          </g>
        )}
        {/* 结构问题即时 lint 红点（编辑时实时提示） */}
        {structLint.nodeMsg.has(node.id) && (
          <g data-ui="1" transform={`translate(${node.x - 6} ${node.y + node.height - 2})`} style={{ cursor: "pointer" }}
            onMouseDown={(e) => { e.stopPropagation(); openAdviceAndFocus(node.id); }}>
            <circle r={9} fill="#d64545" stroke="#ffffff" strokeWidth={1.6} />
            <text y={4} textAnchor="middle" fontSize={12} fontWeight={800} fill="#ffffff" fontFamily="system-ui, sans-serif" pointerEvents="none">!</text>
            <title>{structLint.nodeMsg.get(node.id)}</title>
          </g>
        )}
        {/* 演示高亮光环 */}
        {nodeActive && scenario && (
          <rect
            x={node.x - 6}
            y={node.y - 6}
            width={node.width + 12}
            height={node.height + 12}
            rx={10}
            fill="none"
            stroke="#ffd34d"
            strokeWidth={3}
            opacity={0.8}
            pointerEvents="none"
          />
        )}
        {/* 功能链软蓝光环（元件→整机角色联动，单选时显示） */}
        {funcChain && funcNodeSet.has(node.id) && (
          <rect
            x={node.x - 7}
            y={node.y - 7}
            width={node.width + 14}
            height={node.height + 14}
            rx={11}
            fill="none"
            stroke="#2f7fd6"
            strokeWidth={2.5}
            opacity={0.5}
            pointerEvents="none"
          />
        )}
        {/* 定位闪烁光环（回路诊断/场景演示定位） */}
        {blinkIds.has(node.id) && (
          <rect
            key={`blink-${blinkStamp}`}
            className="blink-pulse"
            x={node.x - 8}
            y={node.y - 8}
            width={node.width + 16}
            height={node.height + 16}
            rx={12}
            fill="none"
            stroke="#ff6a00"
            strokeWidth={3.5}
            pointerEvents="none"
          />
        )}
        {/* 图形+端口+手柄 —— 可能旋转 */}
        <g
          transform={`translate(${node.x} ${node.y}) rotate(${node.rotation} ${node.width / 2} ${node.height / 2})`}
          onMouseEnter={() => setHoverNode(node.id)}
          onMouseLeave={() => setHoverNode((h) => (h === node.id ? null : h))}
        >
          <g onMouseDown={(e) => onNodeMouseDown(e, node)} onContextMenu={(e) => openContextMenu(e, "node", node.id)} style={{ cursor: "move", opacity: node.disabled ? 0.4 : nodeDim ? 0.35 : 1 }}>
            <rect data-ui="1" x={-4} y={-4} width={node.width + 8} height={node.height + 8} fill="transparent" stroke={selected ? "#2f7fd6" : "transparent"} strokeWidth={1.6} strokeDasharray={selected ? "5 4" : undefined} rx={6} />
            {node.groupId && (selected || hoverNode === node.id) && (
              <g data-ui="1" pointerEvents="none">
                <rect x={-4} y={-4} width={14} height={10} rx={2} fill="#7a5cc4" opacity={0.9} />
                <path d="M -1.2 -1.4 h 3.4 v 4 h -3.4 z M 3.8 0.6 h 3.4 v 4 h -3.4 z" fill="#ffffff" opacity={0.95} />
              </g>
            )}
            <NodeSymbol node={node} />
            {(node.type === "coffeeOutlet" || node.type === "milkOutlet" || node.type === "hotWaterOutlet" || node.type === "groupHead") && node.dispensing !== false && diagram.settings.globalAnimationPlaying && (
              <g pointerEvents="none">
                {spoutTips(node).map((tip, i) => {
                  const dripColor = node.type === "milkOutlet" ? "#f3ead6" : node.type === "hotWaterOutlet" ? "#2f7fd6" : "#7b4a2d";
                  return (
                    <g key={i}>
                      <circle className="drip-dot" data-drip="1" data-drip-phase="0" cx={tip.x} cy={tip.y + 4} r={2.8} fill={dripColor} opacity={0.9} />
                      <circle className="drip-dot d2" data-drip="1" data-drip-phase="0.5" cx={tip.x} cy={tip.y + 4} r={2.3} fill={dripColor} opacity={0.9} />
                    </g>
                  );
                })}
              </g>
            )}
          </g>
          {/* 端口：接头延长线 stub + 进/出口可视化区分（进口=蓝空心+内箭头 / 出口=橙实心+外箭头 / 双向=灰菱形） */}
          {node.ports.map((port) => {
            const local = { top: { x: node.width * (port.offset ?? 0.5), y: 0 }, bottom: { x: node.width * (port.offset ?? 0.5), y: node.height }, left: { x: 0, y: node.height * (port.offset ?? 0.5) }, right: { x: node.width, y: node.height * (port.offset ?? 0.5) } }[port.position];
            const active = hoverPort === port.id || snapPortId === port.id;
            const isPipeEnd = selectedPipeEnds && (selectedPipeEnds.fromPortId === port.id || selectedPipeEnds.toPortId === port.id);
            const dir = port.direction ?? "bidirectional";
            const isIn = dir === "in", isOut = dir === "out";
            const color = isIn ? "#2f7fd6" : isOut ? "#e8890c" : "#8a97a6";
            // 沿边法向（端口在旋转组内，用本地法向即可）
            const nv = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[port.position];
            const tx = local.x + nv.x * PORT_STUB;
            const ty = local.y + nv.y * PORT_STUB;
            const px = -nv.y, py = nv.x; // 垂直方向
            return (
              <g key={port.id} data-ui="1" opacity={portOpacity}>
                {/* 接头延长线（stub）：从元件边缘向外伸 24px，常显 */}
                <line x1={local.x} y1={local.y} x2={tx} y2={ty} stroke={color} strokeWidth={active ? 2.4 : 1.5} opacity={active ? 1 : 0.8} />
                {/* 方向箭头：出口→外，进口→内；双向画菱形 */}
                {isOut && (
                  <g pointerEvents="none">
                    <line x1={tx + nv.x * 6 + px * 3.2} y1={ty + nv.y * 6 + py * 3.2} x2={tx} y2={ty} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
                    <line x1={tx + nv.x * 6 - px * 3.2} y1={ty + nv.y * 6 - py * 3.2} x2={tx} y2={ty} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
                  </g>
                )}
                {isIn && (
                  <g pointerEvents="none">
                    <line x1={local.x - nv.x * 6 + px * 3.2} y1={local.y - nv.y * 6 + py * 3.2} x2={local.x} y2={local.y} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
                    <line x1={local.x - nv.x * 6 - px * 3.2} y1={local.y - nv.y * 6 - py * 3.2} x2={local.x} y2={local.y} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
                  </g>
                )}
                {!isIn && !isOut && (
                  <rect x={tx - 3} y={ty - 3} width={6} height={6} transform={`rotate(45 ${tx} ${ty})`} fill="#ffffff" stroke={color} strokeWidth={1.4} pointerEvents="none" />
                )}
                {/* 端口圆点画在 stub 末端：出口实心橙 / 进口空心蓝 / 双向空心灰 */}
                <circle cx={tx} cy={ty} r={active ? 6 : 4.5} fill={isOut ? color : "#ffffff"} stroke={isPipeEnd ? "#ff6a00" : color} strokeWidth={isPipeEnd ? 2.6 : 1.8} pointerEvents="none" />
                {isPipeEnd && <circle cx={tx} cy={ty} r={9} fill="none" stroke="#ff6a00" strokeWidth={1.4} opacity={0.7} pointerEvents="none" />}
                {/* 热区：stub 末端 + 元件边缘各一个（连线锚点仍在边缘，点末端也能起线） */}
                <circle cx={tx} cy={ty} r={12} fill="transparent" data-port-id={port.id} style={{ cursor: "crosshair", pointerEvents: portVisible ? "all" : "none" }} onMouseDown={(e) => onPortMouseDown(e, node.id, port.id)} onMouseEnter={() => setHoverPort(port.id)} onMouseLeave={() => setHoverPort((h) => (h === port.id ? null : h))} />
                <circle cx={local.x} cy={local.y} r={10} fill="transparent" data-port-id={port.id} style={{ cursor: "crosshair", pointerEvents: portVisible ? "all" : "none" }} onMouseDown={(e) => onPortMouseDown(e, node.id, port.id)} onMouseEnter={() => setHoverPort(port.id)} onMouseLeave={() => setHoverPort((h) => (h === port.id ? null : h))} />
                {dir !== "bidirectional" && active && (
                  <text x={tx} y={ty - 10} textAnchor="middle" fontSize={10} fill={color} pointerEvents="none">{isIn ? "进" : "出"}</text>
                )}
              </g>
            );
          })}
          {/* 四角缩放手柄 */}
          {selected && ui.selection.nodes.length === 1 && ([
            { c: "nw", x: -4, y: -4, cur: "nwse-resize" },
            { c: "ne", x: node.width + 4, y: -4, cur: "nesw-resize" },
            { c: "sw", x: -4, y: node.height + 4, cur: "nesw-resize" },
            { c: "se", x: node.width + 4, y: node.height + 4, cur: "nwse-resize" }
          ] as const).map((hd) => (
            <rect key={hd.c} data-ui="1" x={hd.x - 4.5} y={hd.y - 4.5} width={9} height={9} rx={1.5} fill="#ffffff" stroke="#2f7fd6" strokeWidth={1.6} style={{ cursor: hd.cur }} onMouseDown={(e) => onResizeMouseDown(e, node, hd.c)} />
          ))}
          {/* 电磁阀画布开关（默认显示，属性可关） */}
          {(node.type === "solenoid2" || node.type === "solenoid3") && node.showStateOnDiagram !== false && (
            node.type === "solenoid2" ? (
              <g>
                <rect x={8} y={node.height + 24} width={node.width - 16} height={20} rx={10} fill="#f0f4f9" stroke="#b9c6d4" strokeWidth={1} />
                <rect x={node.valveState === "closed" ? 10 : node.width - 28} y={node.height + 26} width={18} height={16} rx={8} fill={node.valveState === "closed" ? "#d9534f" : "#3fae6a"} stroke="#fff" strokeWidth={1.2} style={{ cursor: "pointer" }} onMouseDown={(e) => { e.stopPropagation(); onValveToggle(node.id); }} />
              </g>
            ) : (
              <g>
                {(["A", "off", "B"] as const).map((val, i) => {
                  const bx = 6 + (node.width - 12) * (i / 2);
                  const active = (node.valvePath ?? "A") === val;
                  const colors: Record<string, string> = { A: "#3fae6a", B: "#2f7fd6", off: "#d9534f" };
                  return (
                    <g key={val} style={{ cursor: "pointer" }} onMouseDown={(e) => { e.stopPropagation(); onValveToggle(node.id, val); }}>
                      <rect x={bx - 8} y={node.height + 24} width={16} height={16} rx={3} fill={active ? colors[val] : "#eef2f7"} stroke={active ? colors[val] : "#b9c6d4"} strokeWidth={1.2} />
                      <text x={bx} y={node.height + 36} textAnchor="middle" fontSize={10} fill={active ? "#fff" : "#6b7787"} fontFamily="system-ui, sans-serif" fontWeight={600} pointerEvents="none">{val === "off" ? "关" : val}</text>
                    </g>
                  );
                })}
              </g>
            )
          )}
          {/* 泵画布开关（开/停，默认显示，属性可关） */}
          {(node.type === "pump" || node.type === "milkPump") && node.showStateOnDiagram !== false && (
            <g>
              <rect x={8} y={node.height + 24} width={node.width - 16} height={20} rx={10} fill="#f0f4f9" stroke="#b9c6d4" strokeWidth={1} />
              <rect x={node.pumpOn === false ? 10 : node.width - 28} y={node.height + 26} width={18} height={16} rx={8} fill={node.pumpOn === false ? "#d9534f" : "#3fae6a"} stroke="#fff" strokeWidth={1.2} style={{ cursor: "pointer" }} onMouseDown={(e) => { e.stopPropagation(); onValveToggle(node.id); }} />
              <text x={node.width / 2} y={node.height + 38} textAnchor="middle" fontSize={9} fill={node.pumpOn === false ? "#d9534f" : "#3fae6a"} fontFamily="system-ui, sans-serif" fontWeight={650} pointerEvents="none">{node.pumpOn === false ? "停止" : "运行"}</text>
            </g>
          )}
        </g>
        {/* 节点标签 — 永远在旋转组外，保持水平 */}
        {diagram.settings.showNodeLabels !== false && node.type !== "label" && node.type !== "shape" && (
          <text
            x={node.x + node.width / 2} y={node.y + node.height + 18}
            textAnchor="middle" fontSize={node.fontSize ?? 13} fill="var(--node-label)"
            fontFamily="system-ui, -apple-system, sans-serif"
            data-ui="1"
            style={{ cursor: "text" }}
            onDoubleClick={(e) => { e.stopPropagation(); beginLabelEdit("node", node.id, node.x + node.width / 2, node.y + node.height + 18, node.label); }}
          >{nodeCanvasLabel(node, lang)}</text>
        )}
      </g>
    );
  }

  // 交叉跨线：预计算所有管路折线与外轮廓半宽
  const crossHop = diagram.settings.crossoverHops !== false;
  // 同步管路缓存到 geometry 模块（必须在渲染管路前调用，确保介质传播从第一帧生效）
  setCachedPipes(diagram.pipes, diagram.nodes);
  const pipePolys: Array<{ pts: Pt[]; halfW: number } | null> = diagram.pipes.map((p) => {
    const pts = pipePolyline(p, diagram.nodes);
    return pts ? { pts, halfW: (p.visualDiameter + 5 + 2.4) / 2 } : null;
  });
  // 选中管路的端子端点（用于绘制可拖拽手柄）
  const pipePtsById = new Map<string, Pt[] | null>();
  diagram.pipes.forEach((p, i) => pipePtsById.set(p.id, pipePolys[i]?.pts ?? null));
  // 当前选中的标注节点 ID
  const selectedAnnotationId =
    ui.selection.nodes.length === 1 && diagram.nodes.find((n) => n.id === ui.selection.nodes[0])?.type === "annotation"
      ? ui.selection.nodes[0]
      : null;

  // 连线预览
  let connectPreview: string | null = null;
  const drag = dragRef.current;
  if (drag?.type === "connect" && connectMouse) {
    const from = findPort(diagram.nodes, drag.fromPortId);
    if (from) {
      const a = portWorldPos(from.node, from.port);
      const n = portWorldNormal(from.node, from.port);
      const s0 = { x: a.x + n.x * 24, y: a.y + n.y * 24 };
      const mid = Math.abs(n.x) > 0.5 ? { x: connectMouse.x, y: s0.y } : { x: s0.x, y: connectMouse.y };
      connectPreview = pathD([a, s0, mid, connectMouse]);
    }
  }

  // 可视世界范围（网格铺设）
  const viewRect = (() => {
    const el = svgRef.current;
    const w = el?.clientWidth ?? 1600;
    const h = el?.clientHeight ?? 900;
    return {
      x: (0 - ui.panX) / ui.zoom - 100,
      y: (0 - ui.panY) / ui.zoom - 100,
      w: w / ui.zoom + 200,
      h: h / ui.zoom + 200
    };
  })();

  // ===== 图层可见性过滤 =====
  const layers = diagram.settings.layers ?? [];
  const visibleLayers = new Set(layers.filter((l) => l.visible).map((l) => l.id));
  const visibleNodeIds = new Set(diagram.nodes.filter((n) => !n.layerId || visibleLayers.has(n.layerId)).map((n) => n.id));
  const visiblePipeIds = new Set(diagram.pipes.filter((p) => {
    // 管路只要两端任一端点所在的节点可见即可
    const fromNode = p.fromPortId ? diagram.nodes.find((n) => n.ports.some((pt) => pt.id === p.fromPortId)) : null;
    const toNode = p.toPortId ? diagram.nodes.find((n) => n.ports.some((pt) => pt.id === p.toPortId)) : null;
    const fromVisible = !fromNode || visibleNodeIds.has(fromNode.id);
    const toVisible = !toNode || visibleNodeIds.has(toNode.id);
    return fromVisible || toVisible;
  }).map((p) => p.id));

  const marquee = drag?.type === "marquee" && marqueeEnd ? { a: drag.start, b: marqueeEnd } : null;

  return (
    <div className={`canvas-wrap${diagram.settings.globalAnimationPlaying ? " fp-animating" : ""}`} style={{ background: diagram.settings.background }}>
      <svg
        ref={svgRef}
        className="main-canvas"
        style={{ cursor: ui.styleBrush ? "copy" : spaceRef.current ? "grab" : "default" }}
        onMouseDown={onBackgroundMouseDown}
        onWheel={onWheel}
        onContextMenu={(e) => openContextMenu(e, "canvas")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onMouseMove={(e) => setMouseWorld(screenToWorld(e.clientX, e.clientY))}
      >
        <defs data-ui="1">
          <pattern id="dotgrid" width={24} height={24} patternUnits="userSpaceOnUse">
            <circle cx={1.2} cy={1.2} r={1.2} fill="#b9c6d4" />
          </pattern>
          <pattern id="linegrid" width={48} height={48} patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#c3cdd9" strokeWidth={1} />
          </pattern>
        </defs>
        <g data-world="1" transform={`translate(${ui.panX} ${ui.panY}) scale(${ui.zoom})`}>
          {diagram.settings.showGrid && (() => {
            const bt = diagram.settings.backgroundType ?? "dot";
            if (bt === "grid") {
              return <rect data-ui="1" x={viewRect.x} y={viewRect.y} width={viewRect.w} height={viewRect.h} fill="url(#linegrid)" pointerEvents="none" />;
            }
            if (bt === "solid") return null;
            return <rect data-ui="1" x={viewRect.x} y={viewRect.y} width={viewRect.w} height={viewRect.h} fill="url(#dotgrid)" pointerEvents="none" />;
          })()}
          <g>{diagram.pipes.filter((p) => visiblePipeIds.has(p.id)).map((p, i) => {
            const scenario = ui.scenario;
            const inScenario = scenario ? scenario.activePipes.includes(p.id) : true;
            const scenarioDim = scenario ? !inScenario : false;
            return (
              <PipeView
                key={p.id}
                pipe={p}
                index={i}
                nodes={diagram.nodes}
                selected={ui.selection.pipes.includes(p.id)}
                crossHop={crossHop}
                allPolys={pipePolys}
                scenarioActive={inScenario}
                scenarioDim={scenarioDim}
                blink={blinkIds.has(p.id)}
                blinkStamp={blinkStamp}
                chainGlow={chainPathSet.has(p.id)}
                chainStamp={ui.chainPath?.stamp ?? 0}
                lintMsg={structLint.pipeMsg.get(p.id)}
                onLintClick={(pp) => openAdviceAndFocus(pp.id)}
                funcChain={funcPipeSet.has(p.id)}
                showFluidLabels={diagram.settings.showFluidLabels !== false}
                showPipeLabels={diagram.settings.showPipeLabels !== false}
                showFluidColors={diagram.settings.showFluidColors !== false}
                flowRefMap={flowRefs.current}
                onPipeBodyMouseDown={onPipeBodyMouseDown}
                onVertexMouseDown={onVertexMouseDown}
                onContextMenu={openContextMenu}
                onRemoveVertex={removeVertex}
                onLabelDoubleClick={(pid, x, y, label) => beginLabelEdit("pipe", pid, x, y, label)}
                issues={fluidIssues.get(p.id)}
                onFluidIssueClick={handleFluidIssueClick}
              />
            );
          })}</g>
          <g>{diagram.nodes.filter((n) => visibleNodeIds.has(n.id)).map(renderNode)}</g>
          {/* 标注节点引线 + 目标点手柄（与节点分开渲染以避免 transform 干扰） */}
          {diagram.nodes.filter((n) => visibleNodeIds.has(n.id) && n.type === "annotation" && n.pointerTarget).map((n) => {
            const t = n.pointerTarget!;
            const bottomCx = n.x + n.width / 2;
            const bottomCy = n.y + n.height;
            const annotated = selectedAnnotationId === n.id;
            return (
              <g key={`ann-${n.id}`}>
                <line x1={bottomCx} y1={bottomCy} x2={t.x} y2={t.y} stroke={annotated ? "#2f7fd6" : "#6b7787"} strokeWidth={annotated ? 2 : 1.4} strokeDasharray={annotated ? undefined : "4 3"} />
                {/* 线端圆点 */}
                <circle cx={t.x} cy={t.y} r={5} fill={annotated ? "#2f7fd6" : "#ffffff"} stroke="#2f7fd6" strokeWidth={1.8} />
                <circle cx={t.x} cy={t.y} r={2} fill={annotated ? "#fff" : "#2f7fd6"} stroke="none" />
                {/* 拖拽热区 */}
                <circle
                  cx={t.x} cy={t.y} r={12} fill="transparent"
                  style={{ cursor: "move", pointerEvents: annotated ? "all" : "none" }}
                  onMouseDown={(e) => onAnnotationTargetMouseDown(e, n.id)}
                />
              </g>
            );
          })}
          {/* 选中管路的端子拖拽手柄（绘制在节点之上，保证一定抓得住） */}
          <g data-ui="1">
            {ui.selection.pipes.map((pid) => {
              const pts = pipePtsById.get(pid);
              if (!pts || pts.length < 2) return null;
              const from = pts[0];
              const to = pts[pts.length - 1];
              return (
                <g key={pid}>
                  {[from, to].map((pt, i) => (
                    <g key={i}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={11}
                        fill="transparent"
                        style={{ cursor: "move" }}
                        onMouseDown={(e) => onTerminalMouseDown(e, diagram.pipes.find((p) => p.id === pid)!, i === 0 ? "from" : "to")}
                      />
                      <circle cx={pt.x} cy={pt.y} r={5.5} fill="#ffffff" stroke="#2f7fd6" strokeWidth={2} pointerEvents="none" />
                      <circle cx={pt.x} cy={pt.y} r={2} fill="#2f7fd6" pointerEvents="none" />
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
          {connectPreview && (
            <path data-ui="1" d={connectPreview} fill="none" stroke="#2f7fd6" strokeWidth={2.4} strokeDasharray="7 5" pointerEvents="none" />
          )}
          {/* 对齐参考线 */}
          {(guides.v.length > 0 || guides.h.length > 0) && (
            <g data-ui="1" pointerEvents="none">
              {guides.v.map((x) => (
                <line key={`v${x}`} x1={x} y1={viewRect.y} x2={x} y2={viewRect.y + viewRect.h} stroke="#e0459b" strokeWidth={1 / ui.zoom} strokeDasharray={`${4 / ui.zoom} ${3 / ui.zoom}`} />
              ))}
              {guides.h.map((y) => (
                <line key={`h${y}`} x1={viewRect.x} y1={y} x2={viewRect.x + viewRect.w} y2={y} stroke="#e0459b" strokeWidth={1 / ui.zoom} strokeDasharray={`${4 / ui.zoom} ${3 / ui.zoom}`} />
              ))}
            </g>
          )}
          {marquee && (
            <rect
              data-ui="1"
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.a.x - marquee.b.x)}
              height={Math.abs(marquee.a.y - marquee.b.y)}
              fill="#2f7fd61a"
              stroke="#2f7fd6"
              strokeWidth={1.2}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
      {/* 标签就地编辑输入框（HTML overlay，位置与标签对齐） */}
      {editingLabel && (
        <input
          ref={editInputRef}
          value={editingLabel.value}
          onChange={(e) => setEditingLabel((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitLabelEdit();
            else if (e.key === "Escape") cancelLabelEdit();
          }}
          onBlur={commitLabelEdit}
          style={{
            position: "absolute",
            left: (editingLabel.x * ui.zoom + ui.panX) - editingLabel.width / 2,
            top: (editingLabel.y * ui.zoom + ui.panY) - 10,
            width: editingLabel.width,
            zIndex: 50,
            fontSize: 13,
            textAlign: "center",
            padding: "3px 6px",
            border: "2px solid #2f7fd6",
            borderRadius: 5,
            outline: "none",
            background: "#ffffff",
            color: "#2b3644",
            fontFamily: "system-ui, sans-serif",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        />
      )}
      {/* 画布缩略图导航 */}
      <MiniMap
        diagram={diagram}
        zoom={ui.zoom}
        panX={ui.panX}
        panY={ui.panY}
        viewW={svgRef.current?.clientWidth ?? 800}
        viewH={svgRef.current?.clientHeight ?? 600}
        onNavigate={(wx, wy) => setUI({ panX: wx, panY: wy })}
      />
      {/* 样式刷提示条 */}
      {ui.styleBrush && (
        <div className="brush-tip" data-ui="1">
          🖌️ {t("样式刷已开启：")}<b>{t("点击元件吸取样式")}</b>{t("再点击其他元件应用 · Esc 退出")}
        </div>
      )}
      {/* 右键菜单 */}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
      )}
      {/* 停流因果卡（右键「为什么停流」） */}
      {stopCause && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 9997, background: "transparent" }} onMouseDown={() => setStopCause(null)} />
          <div style={{
            position: "fixed", left: Math.min(stopCause.x, window.innerWidth - 320), top: Math.min(stopCause.y + 10, window.innerHeight - 160),
            zIndex: 9998, width: 300, background: "var(--panel)", border: "1px solid #e0a34b", borderRadius: 10,
            boxShadow: "0 8px 28px rgba(0,0,0,0.22)", padding: "12px 14px", fontFamily: "system-ui, sans-serif",
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
              🔍 {t("为什么停流")}：{diagram.pipes.find((pp) => pp.id === stopCause.pipeId)?.label ?? ""}
            </div>
            <div style={{ fontSize: 13, color: "#b0492f", lineHeight: 1.6, marginBottom: 8 }}>{stopCause.reason}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {stopCause.ids.map((id, i) => {
                const nd = diagram.nodes.find((n) => n.id === id);
                const pp = diagram.pipes.find((x) => x.id === id);
                const label = nd?.label ?? pp?.label ?? id.slice(0, 8);
                return <span key={i} className="cause-chip">{i === 0 ? "根因：" : "→ "}{label}</span>;
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => { focusElement(stopCause.ids[0] ?? stopCause.pipeId); blinkElements(stopCause.ids); showChainPath(stopCause.ids.filter((id) => diagram.pipes.some((pp) => pp.id === id))); setStopCause(null); }}>📍 定位根因</button>
              <button className="btn ghost" onClick={() => setStopCause(null)}>关闭</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
