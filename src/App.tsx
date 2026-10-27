import { useEffect, useRef, useState } from "react";
import { Toolbar } from "./components/Toolbar";
import { Library } from "./components/Library";
import { CanvasView } from "./components/CanvasView";
import { Inspector } from "./components/Inspector";
import { StatusBar } from "./components/StatusBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ShortcutsPanel } from "./components/ShortcutsPanel";
import { SearchPanel } from "./components/SearchPanel";
import { ShortcutSettings } from "./components/ShortcutSettings";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { HelpPanel } from "./components/HelpPanel";
import { WelcomePanel } from "./components/WelcomePanel";
import { AdvicePanel } from "./components/AdvicePanel";
import { ValidationPanel } from "./components/ValidationPanel";
import { FaultCodePanel } from "./components/FaultCodePanel";
import { AiDrawingPanel } from "./components/AiDrawingPanel";
import { SmartDrawingWizard } from "./components/SmartDrawingWizard";
import { SmartDrawingPanel } from "./components/SmartDrawingPanel";
import { SmartBlockDialog } from "./components/SmartBlockDialog";
import { SaveNudge, type SaveNudgeKind } from "./components/SaveNudge";
import { selectFaultCodes, setSimulationRunning } from "./fault-codes/session";
import { PasswordGate } from "./components/PasswordGate";
import { shouldGate, gateAuthed, setGateAuthed } from "./gate";
import { deleteSelection, duplicateSelection, groupSelection, nudgeSelection, redo, undo, ungroupSelection, copyToClipboard, pasteFromClipboard, exitScenario, hasActiveScenario, setWorkMode, useAppState } from "./store";
import { loadDiagram, newDiagram, insertTemplate, store, setSourceFilePath, insertSmartDrawing, fitToScreen, fitToNodeIds } from "./store";
import { pendingAutosave, restoreAutosaveVersion, clearAutosave, lastEditedDiagramId, flushAutosave, recordSavedAt } from "./store";
import type { AutosaveVersion } from "./store";
import { decompressDiagram, parseDiagramJSON, saveJSONFile } from "./export";
import { getBinding, matchKeys } from "./shortcuts";
import { toast } from "./toast";
import { useT } from "./i18n";
import type { SmartBlock, SmartBuildResult } from "./smart-draw/types";
import { engineeringIssueLabel, engineeringSummary } from "./smart-draw/engineering";
import { trackSmart } from "./smart-draw/telemetry";
import { BANNER_LEAVE_MS } from "./motion";

const ARROW_DELTA: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
};

const HELP_SEEN_KEY = "fluidpath.help.seen.v1";
const RECOVERY_DISMISSED_KEY = (id: string) => `fluidpath.autosave.dismissed.v1.${id}`;

export default function App() {
  const { t } = useT();
  const appState = useAppState();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcutSettings, setShowShortcutSettings] = useState(false);
  const [showScenario, setShowScenario] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAdvice, setShowAdvice] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showSmartWizard, setShowSmartWizard] = useState(false);
  const [showSmartPanel, setShowSmartPanel] = useState(false);
  const [smartView, setSmartView] = useState<"all" | "main">("all");
  const [pendingBlock, setPendingBlock] = useState<SmartBlock | null>(null);
  const [saveNudge, setSaveNudge] = useState<{ kind: SaveNudgeKind; detail?: string } | null>(null);
  const lastEngErrors = useRef(0);
  const engInitialized = useRef(false);
  const [startSteps, setStartSteps] = useState(() => {
    try {
      return {
        template: localStorage.getItem("fluidpath.smart.step.template") === "1",
        insert: localStorage.getItem("fluidpath.smart.step.insert") === "1",
        save: localStorage.getItem("fluidpath.smart.step.save") === "1",
      };
    } catch { return { template: false, insert: false, save: false }; }
  });
  const [gateOk, setGateOk] = useState(() => !shouldGate() || gateAuthed());
  // 状态栏诊断徽章点击 → 打开回路诊断面板
  useEffect(() => {
    const onOpen = () => setShowAdvice(true);
    window.addEventListener("fluidpath:open-advice", onOpen);
    return () => window.removeEventListener("fluidpath:open-advice", onOpen);
  }, []);
  // 崩溃恢复：启动时检测未保存的自动备份；退出前强制落盘
  const [recover, setRecover] = useState<{ id: string; versions: AutosaveVersion[] } | null>(null);
  const [recoverHistory, setRecoverHistory] = useState(false);
  // 关闭时询问是否另存（桌面版；空白且未修改直接关闭）
  const [closePrompt, setClosePrompt] = useState(false);
  useEffect(() => {
    const api = (window as unknown as { electron?: { onCloseRequested?: (cb: () => void) => void; confirmClose?: () => void } }).electron;
    if (!api?.onCloseRequested) return;
    const onClose = () => {
      const d = store.get().diagram;
      // 已保存/无修改直接关闭；只有存在未保存到文件的修改才询问
      if (!store.get().ui.dirty) {
        recordSavedAt(d.id);
        api.confirmClose?.();
      } else {
        setClosePrompt(true);
      }
    };
    api.onCloseRequested(onClose);
  }, []);
  useEffect(() => {
    const id = lastEditedDiagramId();
    if (id) {
      let dismissedTs = 0;
      try { dismissedTs = Number(localStorage.getItem(RECOVERY_DISMISSED_KEY(id)) ?? 0); } catch { /* ignore */ }
      const pending = pendingAutosave(id).filter((v) => v.ts > dismissedTs);
      if (pending.length > 0) setRecover({ id, versions: pending });
    }
    const onUnload = () => {
      const d = store.get().diagram;
      flushAutosave(d);
      // 正常关闭时写入基准；崩溃不会触发 beforeunload，下一次仍可恢复。
      recordSavedAt(d.id);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (store.get().ui.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);
  // 启动即空白工作台（不弹欢迎页）；仅首次使用自动打开「使用指南」
  const [showWelcome, setShowWelcome] = useState<boolean>(false);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(HELP_SEEN_KEY) === "1"; } catch { /* ignore */ }
    if (seen) return;
    const timer = setTimeout(() => setShowHelp(true), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const welcomeFileRef = useRef<HTMLInputElement | null>(null);
  // 三栏折叠状态：折叠后收起为窄条，让出画布视角（localStorage 持久化）
  const [collapsed, setCollapsed] = useState<{ library: boolean; inspector: boolean; toolbar: boolean }>(() => {
    try {
      const saved = localStorage.getItem("fluidpath.panelCollapsed");
      if (saved) return { library: false, inspector: false, toolbar: false, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return { library: false, inspector: false, toolbar: false };
  });
  // ===== 工作模式联动（edit / present / verify / fault）=====
  const mode = appState.ui.mode ?? "edit";
  const modeRef = useRef(mode);
  // 故障/验收面板占用右栏；切出编辑模式时收起 AI 绘图，避免与模式面板抢占
  useEffect(() => {
    if (mode !== "edit") {
      setShowAi(false);
      setShowSmartWizard(false);
      setShowSmartPanel(false);
      setPendingBlock(null);
    }
  }, [mode]);
  const [modeNotice, setModeNotice] = useState<"edit" | "present" | "verify" | "fault" | null>(null);
  // 横幅先淡出再卸载：卸载是瞬时的，没有 leaving 窗口就没有退场过渡。
  const [modeNoticeLeaving, setModeNoticeLeaving] = useState(false);
  const modeNoticeTimer = useRef<number | undefined>();
  const modeLeaveTimer = useRef<number | undefined>();
  useEffect(() => {
    const m = mode;
    if (modeRef.current === m) return;
    modeRef.current = m;
    // 模式状态已持续显示在工具栏与状态栏；横幅仅在切换后用于确认权限变化。
    setModeNotice(m);
    setModeNoticeLeaving(false);
    if (modeNoticeTimer.current !== undefined) window.clearTimeout(modeNoticeTimer.current);
    if (modeLeaveTimer.current !== undefined) window.clearTimeout(modeLeaveTimer.current);
    const reduce = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      modeLeaveTimer.current = window.setTimeout(() => setModeNoticeLeaving(true), 4200 - BANNER_LEAVE_MS);
    }
    modeNoticeTimer.current = window.setTimeout(() => setModeNotice(null), 4200);
    if (m === "present") {
      setCollapsed((c) => ({ ...c, library: true, inspector: true, toolbar: false }));
      setShowAdvice(false);
      setShowScenario(true);
    } else if (m === "verify") {
      setCollapsed((c) => ({ ...c, library: true, inspector: false, toolbar: false }));
      setShowAdvice(false);
      setShowScenario(false);
      if (hasActiveScenario()) exitScenario();
    } else if (m === "fault") {
      setCollapsed((c) => ({ ...c, library: true, inspector: false, toolbar: false }));
      setShowAdvice(false);
      setShowScenario(false);
      if (hasActiveScenario()) exitScenario();
    } else {
      setCollapsed((c) => ({ ...c, library: false, inspector: false, toolbar: false }));
      setShowAdvice(false);
      setShowScenario(false);
      if (hasActiveScenario()) exitScenario();
    }
  }, [mode]);
  useEffect(() => () => {
    if (modeNoticeTimer.current !== undefined) window.clearTimeout(modeNoticeTimer.current);
    if (modeLeaveTimer.current !== undefined) window.clearTimeout(modeLeaveTimer.current);
  }, []);
  const togglePanel = (key: keyof typeof collapsed) => () =>
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] };
      try { localStorage.setItem("fluidpath.panelCollapsed", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  // 分享链接：URL 带 ?diagram= 时自动加载
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const enc = params.get("diagram");
    if (enc) {
      try {
        setSmartView("all");
        loadDiagram(decompressDiagram(enc));
        // 清除 URL 参数，避免刷新重复加载
        history.replaceState({}, "", location.pathname);
      } catch (err) {
        console.error("分享链接解析失败:", err);
      }
    }
  }, []);

  // macOS 双击 .json 工程文件打开（Electron 主进程广播文件内容）
  useEffect(() => {
    const api = (window as unknown as {
      electron?: { onOpenFile?: (cb: (p: { path: string; content: string }) => void) => () => void };
    }).electron;
    if (!api?.onOpenFile) return;
    return api.onOpenFile(({ path, content }) => {
      try {
        setSmartView("all");
        loadDiagram(parseDiagramJSON(content));
        setSourceFilePath(path);
      } catch (err) {
        console.error("打开工程文件失败:", err);
        toast(`${t("打开失败")}：${(err as Error).message}`, "error");
      }
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      const hit = (id: string) => matchKeys(e, getBinding(id));
      // 录制快捷键时本监听挂起（设置面板用捕获阶段处理）
      if ((e.target as HTMLElement).closest?.("[data-recording='1']")) return;

      // 演示/验收模式：拓扑编辑类快捷键锁定（拨阀、视角、搜索、帮助等不受限）
      const canEdit = (store.get().ui.mode ?? "edit") === "edit";
      if (!canEdit && (hit("undo") || hit("redo") || hit("duplicate") || hit("group") || hit("ungroup") || hit("copy") || hit("paste") || hit("delete"))) {
        e.preventDefault();
        toast(t((store.get().ui.mode ?? "edit") === "fault" ? "故障模式下已锁定拓扑编辑，切回「✏️ 编辑」可修改" : "演示/验收模式下已锁定编辑，切回「✏️ 编辑」可修改"));
        return;
      }
      if (hit("undo")) { e.preventDefault(); undo(); return; }
      if (hit("redo")) { e.preventDefault(); redo(); return; }
      if (hit("duplicate")) { e.preventDefault(); duplicateSelection(); return; }
      if (hit("group")) { e.preventDefault(); groupSelection(); return; }
      if (hit("ungroup")) { e.preventDefault(); ungroupSelection(); return; }
      if (hit("copy")) { e.preventDefault(); copyToClipboard(); return; }
      if (hit("paste")) { e.preventDefault(); pasteFromClipboard(); return; }
      if (hit("search")) { e.preventDefault(); setShowSearch((v) => !v); return; }
      if (hit("help")) { e.preventDefault(); setShowShortcuts((v) => !v); return; }
      if (hit("collapseLeft")) { e.preventDefault(); togglePanel("library")(); return; }
      if (hit("collapseRight")) { e.preventDefault(); togglePanel("inspector")(); return; }
      if (hit("collapseTop")) { e.preventDefault(); togglePanel("toolbar")(); return; }
      if (hit("fullscreen")) { e.preventDefault(); document.documentElement.requestFullscreen?.(); return; }
      if (hit("theme")) {
        e.preventDefault();
        const next = document.body.dataset.theme === "dark" ? "light" : "dark";
        document.body.dataset.theme = next;
        try { localStorage.setItem("fluidpath.theme", next); } catch { /* ignore */ }
        window.dispatchEvent(new Event("fp-theme"));
        return;
      }
      if (hit("delete") || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
        return;
      }
      // 方向键微调（固定快捷键，不参与自定义）
      if (ARROW_DELTA[e.key]) {
        e.preventDefault();
        const [ux, uy] = ARROW_DELTA[e.key];
        const step = e.shiftKey ? 10 : 1;
        nudgeSelection(ux * step, uy * step);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function closeWelcome() {
    setShowWelcome(false);
    try { localStorage.setItem("fluidpath.welcomed", "1"); } catch { /* ignore */ }
  }

  function openHelp() { setShowHelp(true); }
  function closeHelp() {
    setShowHelp(false);
    try { localStorage.setItem(HELP_SEEN_KEY, "1"); } catch { /* ignore */ }
  }

  function dismissRecovery() {
    if (!recover) return;
    try { localStorage.setItem(RECOVERY_DISMISSED_KEY(recover.id), String(recover.versions[0]?.ts ?? Date.now())); } catch { /* ignore */ }
    setRecover(null);
  }

  async function handleCloseSave() {
    const d = store.get().diagram;
    const api = (window as unknown as { electron?: { saveJsonDialog?: (payload: { json: string; defaultName: string }) => Promise<{ saved: boolean; path?: string }>; confirmClose?: () => void } }).electron;
    try {
      if (api?.saveJsonDialog) {
        const result = await api.saveJsonDialog({ json: JSON.stringify({ ...d, _version: 3, _exportedAt: new Date().toISOString() }, null, 2), defaultName: d.name || "fluidpath-diagram" });
        if (!result.saved) return;
        trackSmart("save_success", { source: "close" });
      } else {
        const result = await saveJSONFile(d);
        if (!result.saved) return;
        trackSmart("save_success", { source: "close-web" });
      }
    } catch { /* ignore */ }
    setClosePrompt(false);
    recordSavedAt(d.id);
    api?.confirmClose?.();
  }
  function handleCloseNoSave() {
    recordSavedAt(store.get().diagram.id);
    setClosePrompt(false);
    (window as unknown as { electron?: { confirmClose?: () => void } }).electron?.confirmClose?.();
  }

  function handleWelcomeAction(id: string) {
    if (id === "help") { closeWelcome(); openHelp(); return; }
    if (id === "new") newDiagram();
    else if (id === "semi") insertTemplate("半自动咖啡机（双锅炉）");
    else if (id === "full") insertTemplate("全自动商用咖啡机");
    else if (id === "open") welcomeFileRef.current?.click();
    closeWelcome();
  }

  function setStartStep(key: "template" | "insert" | "save") {
    setStartSteps((prev) => ({ ...prev, [key]: true }));
    try { localStorage.setItem(`fluidpath.smart.step.${key}`, "1"); } catch { /* ignore */ }
  }

  function openSmartWizard() {
    setStartStep("template");
    if (mode !== "edit") {
      setWorkMode("edit");
      window.setTimeout(() => { setShowAdvice(false); setShowAi(false); setShowSmartWizard(true); }, 0);
      return;
    }
    setShowAdvice(false);
    setShowAi(false);
    setShowSmartWizard(true);
  }

  function handleSmartInserted(result: SmartBuildResult, insertMode: "replace" | "append") {
    insertSmartDrawing(result, insertMode);
    setStartStep("insert");
    setShowSmartWizard(false);
    setShowSmartPanel(true);
    // 插入后保留完整图纸；先用主链视口聚焦，不删减元器件，缩略图与画布内容始终一致。
    setSmartView("all");
    setShowAdvice(false);
    setShowAi(false);
    window.setTimeout(() => {
      const svg = svgRef.current;
      const mainTypes = new Set(["inlet", "pump", "hotWaterBoiler", "thermoblock", "brewChamber", "coffeeOutlet"]);
      let mainIds = result.nodes.filter((n) => mainTypes.has(n.type)).map((n) => n.id);
      if (!mainIds.length) mainIds = result.nodes.filter((n) => n.type === "milkPump" || n.type === "milkOutlet" || n.type === "tank").map((n) => n.id);
      if (!mainIds.length) mainIds = result.nodes.filter((n) => n.type === "steamBoiler" || n.type === "steamWand").map((n) => n.id);
      if (mainIds.length) fitToNodeIds(mainIds, svg?.clientWidth || 1200, svg?.clientHeight || 800, 1);
      else fitToScreen(svg?.clientWidth || 1200, svg?.clientHeight || 800);
    }, 120);
  }

  function focusSmartGroup(kind: "main" | "accessories") {
    const svg = svgRef.current;
    const nodes = appState.diagram.nodes;
    const coffeeMain = new Set(["inlet", "pump", "hotWaterBoiler", "thermoblock", "brewChamber", "coffeeOutlet"]);
    const mainTypes = nodes.some((n) => n.type === "coffeeOutlet")
      ? coffeeMain
      : new Set(["inlet", "pump", "milkPump", "hotWaterBoiler", "steamBoiler", "thermoblock", "brewChamber", "coffeeOutlet", "milkOutlet", "steamWand", "tank"]);
    const accessoryTypes = new Set(["pressureGauge", "safetyValve", "opv", "checkValve"]);
    const ids = nodes
      .filter((n) => kind === "main" ? mainTypes.has(n.type) : accessoryTypes.has(n.type) || (/排废|清洗|drain|clean/i.test(n.label) && n.type === "outlet"))
      .map((n) => n.id);
    if (!ids.length) return;
    fitToNodeIds(ids, svg?.clientWidth || 1200, svg?.clientHeight || 800, 1);
  }

  function handleAddBlock(block: SmartBlock) {
    if (block.build().inletPortId && appState.diagram.nodes.length > 0) {
      setPendingBlock(block);
      return;
    }
    insertSmartDrawing(block.build(), "append");
    trackSmart("block_insert", { block: block.id, anchored: "no" });
    setShowSmartPanel(true);
  }

  function handleBlockInsert(anchorPortId: string | null) {
    if (!pendingBlock) return;
    insertSmartDrawing(pendingBlock.build(), "append", anchorPortId ?? undefined, pendingBlock.medium);
    trackSmart("block_insert", { block: pendingBlock.id, anchored: anchorPortId ? "yes" : "no" });
    setPendingBlock(null);
    setShowSmartPanel(true);
  }

  function dismissSaveNudge() {
    if (saveNudge?.kind === "first-edit") {
      try { localStorage.setItem("fluidpath.saveCoach.dismissedAt", String(Date.now())); } catch { /* ignore */ }
    }
    setSaveNudge(null);
  }

  useEffect(() => {
    if (appState.ui.fileSavedAt) setStartStep("save");
  }, [appState.ui.fileSavedAt]);

  // 插块/连管/改图后增量检查：error 级工程问题增加时立即提示
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const eng = engineeringSummary(store.get().diagram);
      if (!engInitialized.current) {
        engInitialized.current = true;
        lastEngErrors.current = eng.errors;
        return;
      }
      if (eng.errors > lastEngErrors.current) {
        const first = eng.issues.find((i) => i.severity === "error");
        const firstLabel = first ? engineeringIssueLabel(first).title : "";
        toast(`⛔ ${t("工程检查")}：${eng.errors} ${t("项")} error${firstLabel ? ` · ${firstLabel}` : ""}`, "error");
      }
      lastEngErrors.current = eng.errors;
    }, 400);
    return () => window.clearTimeout(timer);
  }, [appState.diagram, t]);

  // 导出图片/PDF/GIF 只算导出，不算保存图纸；提醒一次可编辑文件
  useEffect(() => {
    const onExported = () => setSaveNudge((current) => current ?? { kind: "export" });
    window.addEventListener("fluidpath:exported", onExported);
    return () => window.removeEventListener("fluidpath:exported", onExported);
  }, []);

  // 首次修改时给一次“自动保存 vs 保存文件”教练；同一会话最多一次，24h 内可免打扰
  useEffect(() => {
    if (!appState.ui.dirty || saveNudge || showSmartWizard || showSmartPanel || pendingBlock || closePrompt) return;
    try {
      if (sessionStorage.getItem("fluidpath.saveCoach.seen") === "1") return;
      const dismissed = Number(localStorage.getItem("fluidpath.saveCoach.dismissedAt") ?? 0);
      if (Date.now() - dismissed < 24 * 3600 * 1000) return;
      sessionStorage.setItem("fluidpath.saveCoach.seen", "1");
    } catch { /* ignore */ }
    setSaveNudge({ kind: "first-edit" });
  }, [appState.ui.dirty, saveNudge, showSmartWizard, showSmartPanel, pendingBlock, closePrompt]);

  if (!gateOk) {
    return <PasswordGate onPass={() => { setGateAuthed(); setGateOk(true); }} />;
  }
  // 右栏只有一个活动面板：模式面板优先，其次 AI 绘图，再是回路诊断，最后属性检查器。
  // 用显式变量替代嵌套三元，新增面板时只需要插入一层判断。
  const rightPanel = mode === "fault" ? (
    <FaultCodePanel onClose={() => { selectFaultCodes([]); setSimulationRunning(false); setWorkMode("edit"); }} />
  ) : mode === "verify" ? (
    <ValidationPanel onClose={() => setWorkMode("edit")} />
  ) : showSmartPanel ? (
    <SmartDrawingPanel
      onClose={() => setShowSmartPanel(false)}
      onAddBlock={handleAddBlock}
      onOpenWizard={openSmartWizard}
      onOpenAdvanced={() => { setShowSmartPanel(false); setShowAi(true); }}
      onFocusMain={() => focusSmartGroup("main")}
      onFocusAccessories={() => focusSmartGroup("accessories")}
      smartView={smartView}
      onToggleSmartView={() => setSmartView((v) => v === "main" ? "all" : "main")}
    />
  ) : showAi ? (
    <AiDrawingPanel onClose={() => setShowAi(false)} />
  ) : showAdvice ? (
    <AdvicePanel onClose={() => setShowAdvice(false)} />
  ) : (
    <Inspector collapsed={collapsed.inspector} onToggle={togglePanel("inspector")} />
  );
  const shownMode = modeNotice ?? mode;
  const modeInfo = shownMode === "present"
    ? { icon: "🎬", title: t("演示模式"), summary: t("可拨阀、微调和切换教学步骤"), lock: t("拓扑编辑已锁定") }
    : shownMode === "verify"
      ? { icon: "✓", title: t("验收模式"), summary: t("验收中 · 拓扑已锁定，可摆工况跑验收，切回编辑可修改"), lock: t("禁止手动改到通过") }
      : shownMode === "fault"
        ? { icon: "⚠", title: t("故障模式"), summary: t("选择故障码、绑定排查范围并模拟信号"), lock: t("拓扑编辑已锁定") }
        : { icon: "✏️", title: t("编辑模式"), summary: t("可修改拓扑、属性和工程状态"), lock: t("全部编辑操作可用") };
  return (
    <ErrorBoundary>
      <div className="app" data-mode={mode}>
        {modeNotice && (
          <div className={`mode-banner mode-${modeNotice}${modeNoticeLeaving ? " leaving" : ""}`} data-ui="1" data-testid="mode-banner" role="status" aria-live="polite">
            <span className="mode-banner-main"><b>{modeInfo.icon} {modeInfo.title}</b><span>{modeInfo.summary}</span></span>
            <span className="mode-banner-lock">{modeInfo.lock}</span>
          </div>
        )}
        <Toolbar svgRef={svgRef} collapsed={collapsed.toolbar} onToggle={togglePanel("toolbar")} onOpenShortcutSettings={() => setShowShortcutSettings(true)} onOpenScenario={() => setShowScenario(true)} onOpenHelp={openHelp} onOpenAdvice={() => { setShowAi(false); if (mode === "fault") { setWorkMode("edit"); window.setTimeout(() => setShowAdvice(true), 0); } else { setShowAdvice((v) => !v); } }} onOpenSmart={openSmartWizard} />
        <div className="main">
          <Library collapsed={collapsed.library} onToggle={togglePanel("library")} />
          <div className="canvas-anchor">
          <CanvasView svgRefOut={svgRef} smartView={smartView} />
          {mode === "edit" && appState.diagram.nodes.length === 0 && appState.diagram.pipes.length === 0 && !showHelp && (
            <div className="canvas-empty-overlay" data-ui="1">
              <div className="canvas-empty-card">
                <div className="canvas-empty-title">☕ {t("从这里开始")}</div>
                <div className="smart-start-checklist">
                  <div className="smart-check-title">{t("三步开始")}</div>
                  {([
                    ["template", t("选择模板")],
                    ["insert", t("插入画布")],
                    ["save", t("保存文件")],
                  ] as const).map(([key, label], i) => (
                    <div key={key} className={`smart-check-step ${startSteps[key] ? "done" : ""}`}>
                      <span>{startSteps[key] ? "✓" : i + 1}</span>{label}
                    </div>
                  ))}
                </div>
                <button className="canvas-empty-action primary" onClick={openSmartWizard}>✨ {t("智能绘图")}</button>
                <div className="canvas-empty-sub">{t("描述或选择模板，快速得到可编辑液路图")}</div>
                <button className="canvas-empty-action" onClick={() => welcomeFileRef.current?.click()}>📂 {t("打开已有图纸")}</button>
                <div className="canvas-empty-hint">{t("或从左侧元件库拖拽 / 双击添加元件")}</div>
              </div>
            </div>
          )}
          </div>
          {rightPanel}
        </div>
        <StatusBar />
      </div>
      <input
        ref={welcomeFileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            f.text().then((text) => {
              try { setSmartView("all"); loadDiagram(parseDiagramJSON(text)); } catch (err) { toast(`${t("打开失败")}：${(err as Error).message}`, "error"); }
              setSourceFilePath((f as File & { path?: string }).path ?? null);
            });
          }
          e.target.value = "";
        }}
      />
      {showWelcome && <WelcomePanel onClose={closeWelcome} onAction={handleWelcomeAction} />}
      {showHelp && <HelpPanel onClose={closeHelp} />}
      {showShortcuts && <ShortcutsPanel onClose={() => setShowShortcuts(false)} onOpenSettings={() => { setShowShortcuts(false); setShowShortcutSettings(true); }} />}
      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
      {showShortcutSettings && <ShortcutSettings onClose={() => setShowShortcutSettings(false)} />}
      {showScenario && <ScenarioPanel onClose={() => setShowScenario(false)} />}
      {showSmartWizard && <SmartDrawingWizard onClose={() => setShowSmartWizard(false)} onInserted={handleSmartInserted} />}
      {pendingBlock && (
        <SmartBlockDialog
          block={pendingBlock}
          nodes={appState.diagram.nodes}
          usedPortIds={new Set(appState.diagram.pipes.flatMap((p) => [p.fromPortId, p.toPortId]).filter((x): x is string => !!x))}
          onCancel={() => setPendingBlock(null)}
          onInsert={handleBlockInsert}
        />
      )}
      {saveNudge && !showSmartWizard && !pendingBlock && (
        <SaveNudge kind={saveNudge.kind} detail={saveNudge.detail} onDismiss={dismissSaveNudge} />
      )}
      {/* 崩溃恢复横幅 */}
      {/* 关闭前询问是否另存 */}
      {closePrompt && (
        <div className="close-save-overlay" data-ui="1">
          <div className="close-save-card">
            <div className="close-save-title">💾 {t("保存并退出？")}</div>
            <div className="close-save-sub">{t("当前图纸有未保存到文件的修改。")}</div>
            <div className="close-save-actions">
              <button className="btn" onClick={handleCloseSave}>💾 {t("保存并退出")}</button>
              <button className="btn ghost" onClick={handleCloseNoSave}>{t("不保存，直接退出")}</button>
              <button className="btn ghost" onClick={() => setClosePrompt(false)}>{t("取消")}</button>
            </div>
            <div className="close-save-sub">{t("自动备份仍保留最近 5 个版本，可在下次启动时恢复。")}</div>
          </div>
        </div>
      )}
      {recover && !recoverHistory && (
        <div className="recover-banner" data-ui="1">
          <span>💾 {t("检测到未保存的自动备份")}（{recover.versions.length} {t("个版本")}，{new Date(recover.versions[0].ts).toLocaleTimeString()}）</span>
          <button className="btn" onClick={() => { restoreAutosaveVersion(recover.id, 0); clearAutosave(recover.id); setRecover(null); }}>{t("恢复最新")}</button>
          <button className="btn ghost" onClick={() => setRecoverHistory(true)}>{t("查看历史")}</button>
          <button className="btn ghost" onClick={() => { clearAutosave(recover.id); setRecover(null); }}>{t("丢弃")}</button>
          <button className="recover-dismiss" onClick={dismissRecovery} title={t("本次关闭恢复提示")} aria-label={t("关闭")}>×</button>
        </div>
      )}
      {/* 自动保存版本历史（预留：最多 5 份） */}
      {recover && recoverHistory && (
        <div className="recover-modal" data-ui="1">
          <div className="recover-modal-title">📚 {t("自动备份版本历史")}</div>
          {recover.versions.map((v, i) => (
            <button key={i} className="recover-version" onClick={() => { restoreAutosaveVersion(recover.id, i); clearAutosave(recover.id); setRecover(null); setRecoverHistory(false); }}>
              <span className="recover-ts">{new Date(v.ts).toLocaleString()}</span>
              <span className="recover-meta">{v.diagram.nodes.length} {t("节点")} · {v.diagram.pipes.length} {t("管路")}</span>
            </button>
          ))}
          <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setRecoverHistory(false)}>← {t("返回")}</button>
        </div>
      )}
    </ErrorBoundary>
  );
}
