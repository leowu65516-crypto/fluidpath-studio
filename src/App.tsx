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
import { PasswordGate } from "./components/PasswordGate";
import { shouldGate, gateAuthed, setGateAuthed } from "./gate";
import { deleteSelection, duplicateSelection, groupSelection, nudgeSelection, redo, undo, ungroupSelection, copyToClipboard, pasteFromClipboard } from "./store";
import { loadDiagram, newDiagram, insertTemplate, store, setSourceFilePath } from "./store";
import { pendingAutosave, restoreAutosaveVersion, clearAutosave, lastEditedDiagramId, flushAutosave } from "./store";
import type { AutosaveVersion } from "./store";
import { decompressDiagram, parseDiagramJSON } from "./export";
import { getBinding, matchKeys } from "./shortcuts";

const ARROW_DELTA: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
};

export default function App() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcutSettings, setShowShortcutSettings] = useState(false);
  const [showScenario, setShowScenario] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAdvice, setShowAdvice] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
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
  useEffect(() => {
    const id = lastEditedDiagramId();
    if (id) {
      const pending = pendingAutosave(id);
      if (pending.length > 0) setRecover({ id, versions: pending });
    }
    const onUnload = () => flushAutosave(store.get().diagram);
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try { return localStorage.getItem("fluidpath.welcomed") !== "1"; } catch { return true; }
  });
  const welcomeFileRef = useRef<HTMLInputElement | null>(null);
  // 三栏折叠状态：折叠后收起为窄条，让出画布视角（localStorage 持久化）
  const [collapsed, setCollapsed] = useState<{ library: boolean; inspector: boolean; toolbar: boolean }>(() => {
    try {
      const saved = localStorage.getItem("fluidpath.panelCollapsed");
      if (saved) return { library: false, inspector: false, toolbar: false, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return { library: false, inspector: false, toolbar: false };
  });
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
        loadDiagram(parseDiagramJSON(content));
        setSourceFilePath(path);
      } catch (err) {
        console.error("打开工程文件失败:", err);
        alert(`打开失败：${(err as Error).message}`);
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

  function handleWelcomeAction(id: string) {
    if (id === "help") { closeWelcome(); setShowHelp(true); return; }
    if (id === "new") newDiagram();
    else if (id === "semi") insertTemplate("半自动咖啡机（双锅炉）");
    else if (id === "full") insertTemplate("全自动商用咖啡机");
    else if (id === "open") welcomeFileRef.current?.click();
    closeWelcome();
  }

  if (!gateOk) {
    return <PasswordGate onPass={() => { setGateAuthed(); setGateOk(true); }} />;
  }
  return (
    <ErrorBoundary>
      <div className="app">
        <Toolbar svgRef={svgRef} collapsed={collapsed.toolbar} onToggle={togglePanel("toolbar")} onOpenShortcutSettings={() => setShowShortcutSettings(true)} onOpenScenario={() => setShowScenario(true)} onOpenHelp={() => setShowHelp(true)} onOpenAdvice={() => { setShowValidation(false); setShowAdvice((v) => !v); }} onOpenValidation={() => { setShowAdvice(false); setShowValidation((v) => !v); }} />
        <div className="main">
          <Library collapsed={collapsed.library} onToggle={togglePanel("library")} />
          <CanvasView svgRefOut={svgRef} />
          {showAdvice ? <AdvicePanel onClose={() => setShowAdvice(false)} /> : showValidation ? <ValidationPanel onClose={() => setShowValidation(false)} /> : <Inspector collapsed={collapsed.inspector} onToggle={togglePanel("inspector")} />}
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
              try { loadDiagram(parseDiagramJSON(text)); } catch (err) { alert(`打开失败：${(err as Error).message}`); }
              setSourceFilePath((f as File & { path?: string }).path ?? null);
            });
          }
          e.target.value = "";
        }}
      />
      {showWelcome && <WelcomePanel onClose={closeWelcome} onAction={handleWelcomeAction} />}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
      {showShortcuts && <ShortcutsPanel onClose={() => setShowShortcuts(false)} onOpenSettings={() => { setShowShortcuts(false); setShowShortcutSettings(true); }} />}
      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
      {showShortcutSettings && <ShortcutSettings onClose={() => setShowShortcutSettings(false)} />}
      {showScenario && <ScenarioPanel onClose={() => setShowScenario(false)} />}
      {/* 崩溃恢复横幅 */}
      {recover && !recoverHistory && (
        <div className="recover-banner" data-ui="1">
          <span>💾 检测到未保存的自动备份（{recover.versions.length} 个版本，{new Date(recover.versions[0].ts).toLocaleTimeString()}）</span>
          <button className="btn" onClick={() => { restoreAutosaveVersion(recover.id, 0); clearAutosave(recover.id); setRecover(null); }}>恢复最新</button>
          <button className="btn ghost" onClick={() => setRecoverHistory(true)}>查看历史</button>
          <button className="btn ghost" onClick={() => { clearAutosave(recover.id); setRecover(null); }}>丢弃</button>
        </div>
      )}
      {/* 自动保存版本历史（预留：最多 5 份） */}
      {recover && recoverHistory && (
        <div className="recover-modal" data-ui="1">
          <div className="recover-modal-title">📚 自动备份版本历史</div>
          {recover.versions.map((v, i) => (
            <button key={i} className="recover-version" onClick={() => { restoreAutosaveVersion(recover.id, i); clearAutosave(recover.id); setRecover(null); setRecoverHistory(false); }}>
              <span className="recover-ts">{new Date(v.ts).toLocaleString()}</span>
              <span className="recover-meta">{v.diagram.nodes.length} 节点 · {v.diagram.pipes.length} 管路</span>
            </button>
          ))}
          <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setRecoverHistory(false)}>← 返回</button>
        </div>
      )}
    </ErrorBoundary>
  );
}
