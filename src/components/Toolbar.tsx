import { useEffect, useRef, useState } from "react";
import {
  canRedo,
  canUndo,
  fitToScreen,
  loadDiagram,
  markSaved,
  newDiagram,
  redo,
  setGlobalFlowScale,
  setSourceFilePath,
  setSelectionDisabled,
  setStyleBrush,
  setWorkMode,
  setZoomCenter,
  undo,
  updateDiagram,
  useAppState
} from "../store";
import { exportEngineeringJSON, exportGIF, exportPDF, exportPNG, exportSVG, exportJPG, parseDiagramJSON, buildShareLink, compressDiagram, decompressDiagram, saveJSONFile } from "../export";
import { exportMachinePack, parseMachinePack } from "../machinePack";
import { ExportDialog } from "./ExportDialog";
import { ConditionPanel } from "./ConditionPanel";
import { PromptDialog } from "./PromptDialog";
import { useT } from "../i18n";
import { LayerPanel } from "./LayerPanel";
import { toast } from "../toast";


function Icon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Toolbar({ svgRef, collapsed = false, onToggle, onOpenShortcutSettings, onOpenScenario, onOpenHelp, onOpenAdvice, onOpenValidation }: { svgRef: React.MutableRefObject<SVGSVGElement | null>; collapsed?: boolean; onToggle?: () => void; onOpenShortcutSettings?: () => void; onOpenScenario?: () => void; onOpenHelp?: () => void; onOpenAdvice?: () => void; onOpenValidation?: () => void }) {
  const { diagram, ui } = useAppState();
  const { t, lang, setLang } = useT();
  const mode = ui.mode ?? "edit";
  const fileRef = useRef<HTMLInputElement | null>(null);
  const packRef = useRef<HTMLInputElement | null>(null);
  const playing = diagram.settings.globalAnimationPlaying;
  const hasSel = ui.selection.nodes.length + ui.selection.pipes.length > 0;
  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const [exportDialogFmt, setExportDialogFmt] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [layerOpen, setLayerOpen] = useState(false);
  const [condOpen, setCondOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shareFallback, setShareFallback] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  // 下拉菜单用 fixed 定位（工具行 overflow 会裁剪 absolute 菜单）
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  function menuRectFrom(anchor: HTMLElement | null) {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }

  // 记住上次导出格式
  const [lastExport, setLastExport] = useState<string>(() => {
    try { return localStorage.getItem("fluidpath.lastExport") || "png"; } catch { return "png"; }
  });

  // 点击外部关闭导出下拉
  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

  // 点击外部关闭图层面板
  useEffect(() => {
    if (!layerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (layerRef.current && !layerRef.current.contains(e.target as Node)) setLayerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [layerOpen]);

  // Ctrl+E / Cmd+E 快速导出（使用上次格式）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e" && !(e.target as HTMLElement).closest("input, textarea, select")) {
        e.preventDefault();
        quickExport(lastExport);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lastExport, svgRef, diagram, gifProgress]);

  /** Ctrl+E 快速导出：跳过预览对话框，直接按上次格式与默认参数落盘 */
  function quickExport(format: string) {
    setExportOpen(false);
    if (!svgRef.current) return;
    switch (format) {
      case "png": exportPNG(svgRef.current, diagram, 2); break;
      case "jpg": exportJPG(svgRef.current, diagram, 2); break;
      case "svg": exportSVG(svgRef.current, diagram); break;
      case "pdf": exportPDF(svgRef.current, diagram, undefined); break;
      case "gif": onExportGIF(); break;
      case "json": void saveToLocal(); break;
      case "engineering-json": exportEngineeringJSON(diagram); break;
    }
  }

  function doExport(format: string) {
    setExportOpen(false);
    if (!svgRef.current) return;
    try { localStorage.setItem("fluidpath.lastExport", format); } catch { /* ignore */ }
    setLastExport(format);
    switch (format) {
      case "png":
      case "jpg":
      case "svg":
      case "pdf":
      case "gif":
        // 图像导出进入预览对话框（所见即所得）；Ctrl+E 快速导出走 quickExport
        setExportOpen(false);
        setExportDialogFmt(format);
        break;
      case "json": void saveToLocal(); break;
      case "engineering-json": exportEngineeringJSON(diagram); break;
      case "share": {
        if (location.protocol === "file:") {
          // Electron file:// 下 location.origin 为 "null"，改用「分享码」方案
          const code = compressDiagram(diagram);
          navigator.clipboard.writeText(code).then(() => {
            alert(t("✅ 已复制分享码！接收方在 FluidPath 中点击「导入分享码」粘贴即可打开图纸。"));
          }).catch(() => { setShareFallback(code); });
        } else {
          const link = buildShareLink(diagram);
          navigator.clipboard.writeText(link).then(() => {
            alert("✅ 分享链接已复制！发送给他人即可打开图纸。\n\n" + link.slice(0, 80) + "…");
          }).catch(() => { setShareFallback(link); });
        }
        break;
      }
    }
  }
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [theme, setTheme] = useState<string>(() => {
    const saved = localStorage.getItem("fluidpath.theme");
    const t2 = saved === "dark" ? "dark" : "light";
    document.body.dataset.theme = t2;
    return t2;
  });

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = next;
    localStorage.setItem("fluidpath.theme", next);
    setTheme(next);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  }

  // 全屏变化时同步状态
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // 外部（快捷键）切换主题时同步
  useEffect(() => {
    const onTheme = () => setTheme(document.body.dataset.theme === "dark" ? "dark" : "light");
    window.addEventListener("fp-theme", onTheme);
    return () => window.removeEventListener("fp-theme", onTheme);
  }, []);

  async function onExportGIF() {
    if (!svgRef.current || gifProgress !== null) return;
    setGifProgress(0);
    try {
      await exportGIF(svgRef.current, diagram, (r) => setGifProgress(r));
    } catch (err) {
      alert(`${t("GIF 导出失败")}：${(err as Error).message}`);
    } finally {
      setGifProgress(null);
    }
  }

  const [postLoadTip, setPostLoadTip] = useState<string | null>(null);

  function openFileContent(text: string, sourcePath: string | null) {
      try {
        const d = parseDiagramJSON(text);
        loadDiagram(d);
        setSourceFilePath(sourcePath);
        // 加载后引导提示
        const tips: string[] = [];
        const nodeCount = d.nodes?.length ?? 0;
        const pipeCount = d.pipes?.length ?? 0;
        // 检测大图
        if (nodeCount + pipeCount > 40) {
          tips.push(`📐 大图纸（${nodeCount}元件 + ${pipeCount}管路）：右下角缩略图可快速导航，滚轮缩放，拖拽平移`);
        }
        // 检测多种介质
        if (d.pipes?.length) {
          const fluidTypes = new Set(d.pipes.map((p: any) => p.fluidType).filter(Boolean));
          if (fluidTypes.size >= 3) {
            tips.push(`🎨 检测到 ${fluidTypes.size} 种介质 → 右键画布可「生成自动图例」`);
          }
        }
        // 检测演示模式可用性
        const hasValves = d.nodes?.some((n: any) =>
          n.type === "solenoid2" || n.type === "solenoid3" || n.type === "pump" || n.type === "milkPump" || n.type === "airPump"
        );
        if (hasValves) {
          tips.push(`🎬 含电磁阀/泵 → 工具栏「演示模式」可逐步讲解液路原理`);
        }
        if (tips.length) {
          setPostLoadTip(tips.join("\n"));
          setTimeout(() => setPostLoadTip(null), 12000);
        }
      } catch (err) {
        alert(`打开失败：${(err as Error).message}`);
      }
  }

  function openFile(file: File) {
    file.text().then((text) => openFileContent(text, (file as File & { path?: string }).path ?? null));
  }

  async function openJsonFromDesktop() {
    const api = (window as unknown as { electron?: { openJsonFile?: () => Promise<{ path: string; content: string } | null> } }).electron;
    if (!api?.openJsonFile) {
      fileRef.current?.click();
      return;
    }
    try {
      const result = await api.openJsonFile();
      if (result) openFileContent(result.content, result.path);
    } catch (err) {
      alert(`打开失败：${(err as Error).message}`);
    }
  }

  async function openAppWindow() {
    const api = (window as unknown as { electron?: { openAppWindow?: () => Promise<unknown> } }).electron;
    if (!api?.openAppWindow) {
      const child = window.open(window.location.href, "_blank");
      if (!child) toast(t("浏览器阻止了新窗口，请允许弹出窗口"), "error");
      return;
    }
    try {
      await api.openAppWindow();
    } catch (err) {
      toast(`${t("新窗口打开失败")}：${(err as Error).message}`, "error");
    }
  }

  async function saveToLocal() {
    const api = (window as unknown as {
      electron?: { saveJsonDialog?: (payload: { json: string; defaultName: string }) => Promise<{ saved: boolean; path?: string }> };
    }).electron;
    const json = JSON.stringify({ ...diagram, _version: 3, _exportedAt: new Date().toISOString() }, null, 2);
    if (!api?.saveJsonDialog) {
      try {
        const result = await saveJSONFile(diagram);
        markSaved();
        toast(result.picker ? `${t("已保存到")} ${result.filename}` : t("浏览器已开始下载文件"));
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
        toast(`${t("保存失败")}：${(err as Error).message}`, "error");
      }
      return;
    }
    try {
      const result = await api.saveJsonDialog({ json, defaultName: diagram.name || "fluidpath-diagram" });
      if (!result.saved) return;
      setSourceFilePath(result.path ?? null);
      markSaved();
      toast(`${t("已保存到")} ${result.path ?? ""}`);
    } catch (err) {
      toast(`${t("保存失败")}：${(err as Error).message}`, "error");
    }
  }

  function viewSize() {
    const el = svgRef.current;
    return { w: el?.clientWidth ?? 1200, h: el?.clientHeight ?? 800 };
  }

  return (
    <div className={`toolbar${collapsed ? " collapsed" : ""}`}>
      <div className="tb-row">
      <div className="brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2f7fd6" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 7 h9 a4 4 0 0 1 4 4 v9" />
          <path d="M4 12 h5 a3 3 0 0 1 3 3 v5" opacity="0.5" />
        </svg>
        {!collapsed && <span>FluidPath Studio</span>}
      </div>
      {!collapsed && (
        <input
          className="diagram-name"
          value={diagram.name ?? ""}
          title={t("图纸名称（保存/导出时用作文件名，可直接修改）")}
          onChange={(e) => updateDiagram((d) => { d.name = e.target.value; })}
          spellCheck={false}
        />
      )}
      <button className="tb-btn tb-collapse" onClick={onToggle} title={collapsed ? t("展开工具栏") : t("折叠工具栏")} aria-label={collapsed ? t("展开工具栏") : t("折叠工具栏")}>
        {collapsed ? "▼" : "▲"}
      </button>
      {!collapsed && <>
      <div className="tb-sep" />
      <button className="tb-btn" title={t("新建")} onClick={() => { if (confirm(t("新建") + "?")) newDiagram(); }}>
        <Icon d="M12 5v14M5 12h14" />{t("新建")}
      </button>
      <button className="tb-btn" title={t("打开独立工作台，可与当前窗口互相复制粘贴")} onClick={() => void openAppWindow()}>
        <Icon d="M4 5h11v11H4zM9 9h11v10H9z" />{t("新窗口")}
      </button>
      <button className="tb-btn" title={t("打开 JSON")} onClick={openJsonFromDesktop}>
        <Icon d="M3 8l3-4h5l2 3h8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />{t("打开 JSON")}
      </button>
      <button className="tb-btn" title={t("导入机型包（图纸+验收+说明一次恢复）")} onClick={() => packRef.current?.click()}>
        <Icon d="M21 8l-9-5-9 5v8l9 5 9-5zM12 3v18M3 8l9 5 9-5" />{t("导入机型包")}
      </button>
      <button className="tb-btn" title={t("导出机型包（图纸+场景+验收一次打包）")} onClick={() => {
        try { if (!localStorage.getItem("fluidpath.packHintShown")) { toast(t("机型包 = 图纸 + 验收案例 + 元数据一次打包，对方导入即可打开完整工作现场")); localStorage.setItem("fluidpath.packHintShown", "1"); } } catch { /* ignore */ }
        const fn = exportMachinePack(diagram);
        toast(t("机型包已导出") + ": " + fn);
      }}>
        <Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" />{t("导出机型包")}
      </button>
      <button className="tb-btn sq" title={t("导入分享码")} aria-label={t("导入分享码")} onClick={() => setImportOpen(true)}>
        <Icon d="M9 12h6M9 16h6M7 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" />
      </button>
      <button
        className="tb-btn"
        title={t("保存到本地（选择路径）")}
        onClick={() => void saveToLocal()}
      >
        <Icon d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" />{t("保存到本地")}
      </button>
      <div className="tb-sep" />
      <button className="tb-btn" disabled={!canUndo()} onClick={undo} title="Undo">
        <Icon d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />{t("撤销")}
      </button>
      <button className="tb-btn" disabled={!canRedo()} onClick={redo} title="Redo">
        <Icon d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />{t("重做")}
      </button>
      <div className="tb-sep" />
      <div className="zoom-group">
        <button className="tb-btn sq" onClick={() => setZoomCenter(ui.zoom / 1.2, viewSize().w, viewSize().h)} title={t("缩小")}>−</button>
        <span className="zoom-label" title="100%" onClick={() => setZoomCenter(1, viewSize().w, viewSize().h)}>
          {Math.round(ui.zoom * 100)}%
        </span>
        <button className="tb-btn sq" onClick={() => setZoomCenter(ui.zoom * 1.2, viewSize().w, viewSize().h)} title={t("放大")}>+</button>
        <button className="tb-btn sq" onClick={() => fitToScreen(viewSize().w, viewSize().h)} title={t("适应画布")}>⊡</button>
      </div>
      <div className="tb-sep" />
      <button
        className={`tb-btn ${playing ? "active" : ""}`}
        onClick={() =>
          updateDiagram((d) => {
            d.settings.globalAnimationPlaying = !d.settings.globalAnimationPlaying;
          }, false)
        }
        title={playing ? t("暂停全部") : t("播放全部")}
      >
        {playing ? <Icon d="M10 5v14M15 5v14" /> : <Icon d="M7 5l12 7-12 7z" />}
        {playing ? t("暂停全部") : t("播放全部")}
      </button>
      <div className="flow-scale-group tb-flow-inline" title={t("流速")}>
        <span className="flow-scale-label">{t("流速")}</span>
        <input type="range" min={50} max={250} value={Math.round((diagram.settings.flowScale ?? 1) * 100)} onChange={(e) => setGlobalFlowScale(Number(e.target.value) / 100)} />
        <span className="flow-scale-val">×{(diagram.settings.flowScale ?? 1).toFixed(1)}</span>
      </div>
      <button className="tb-btn" onClick={onOpenScenario} title={t("演示/讲述模式：按场景逐步讲解液路")}>
        <Icon d="M3 5l15 7-15 7zM19 4v16" />{t("演示")}
      </button>
      </>}
      </div>
      {!collapsed && (
      <div className="tb-row">
      <button
        className="tb-btn"
        disabled={!hasSel}
        onClick={() => setSelectionDisabled(true)}
        title={t("置灰选中")}
      >
        <Icon d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10" />{t("置灰选中")}
      </button>
      <button
        className="tb-btn"
        disabled={!hasSel}
        onClick={() => setSelectionDisabled(false)}
        title={t("取消置灰")}
      >
        <Icon d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6" />{t("取消置灰")}
      </button>
      <div className="tb-sep" />
      <button className={`tb-btn ${ui.styleBrush ? "active" : ""}`} onClick={() => setStyleBrush(!ui.styleBrush)} title={t("样式刷")}>
        <Icon d="M9.5 14.5l-3 3 1.5 1.5 3-3M14.5 9.5l3-3-1.5-1.5-3 3M5 3l16 16-2 2L3 5z" />{t("样式刷")}
      </button>
      <button className="tb-btn" onClick={onOpenShortcutSettings} title={t("快捷键")}>
        <Icon d="M21 4H3v6h18V4zM21 14H3v6h18v-6zM7 7h.01M7 17h.01" />{t("快捷键")}
      </button>
      <button className="tb-btn" onClick={onOpenHelp} title={t("使用指南")}>
        <Icon d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9a3 3 0 0 1 6 0c0 3-3 2-3 5M12 17h.01" />{t("使用指南")}
      </button>
      <button className="tb-btn" onClick={onOpenAdvice} title={t("回路诊断：智能检查液路并给出修改建议")}>
        <Icon d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16.5h.01" />{t("回路诊断")}
      </button>
      <button className={`tb-btn${condOpen ? " active" : ""}`} onClick={() => setCondOpen((v) => !v)} title={t("工况：把当前阀位/泵开关存成方案，一键切换对比")}>
        <Icon d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M8 12h8" />{t("工况")}
      </button>
      <button className="tb-btn" onClick={onOpenValidation} title={t("定义并运行图纸工况验收")}>
        <Icon d="M5 12l4 4L19 6" />{t("验收")}
      </button>
      {condOpen && <ConditionPanel onClose={() => setCondOpen(false)} />}
      <div className="layer-wrap" ref={layerRef}>
        <button className={`tb-btn${layerOpen ? " active" : ""}`} onClick={() => setLayerOpen((v) => !v)} title={t("图层管理")}>
          <Icon d="M3 5h18l-2 6v8H5v-8L3 5zM5 19h14" />{t("图层")}
        </button>
        {layerOpen && <LayerPanel onClose={() => setLayerOpen(false)} />}
      </div>
      <button className="tb-btn" onClick={toggleTheme} title={theme === "dark" ? t("亮色") : t("暗色")}>
        <Icon d={theme === "dark" ? "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" : "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 5a7 7 0 0 1 0 14z"} />
        {theme === "dark" ? t("亮色") : t("暗色")}
      </button>
      <div className="tb-sep" />
      {/* 三态工作模式：编辑 / 演示 / 验收 */}
      <div className="tb-mode seg" role="group" aria-label={t("工作模式")}>
        <button className={mode === "edit" ? "on" : ""} title={t("编辑模式：画图、接线、属性编辑")} onClick={() => setWorkMode("edit")}>✏️ {t("编辑")}</button>
        <button className={mode === "present" ? "on" : ""} title={t("演示模式：收起面板，按场景步骤讲解")} onClick={() => setWorkMode("present")}>🎬 {t("演示")}</button>
        <button className={mode === "verify" ? "on" : ""} title={t("验收模式：工况快照与验收矩阵")} onClick={() => setWorkMode("verify")}>✓ {t("验收")}</button>
      </div>
      <div className="tb-sep" />
      <button className="tb-btn" data-testid="lang-toggle" onClick={() => setLang(lang === "zh" ? "en" : "zh")} title="中 / EN">
        {lang === "zh" ? "EN" : "中"}
      </button>
      <button className="tb-btn" onClick={toggleFullscreen} title={fullscreen ? t("退出全屏") : t("全屏")}>
        <Icon d={fullscreen ? "M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" : "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"} />
        {fullscreen ? t("退出全屏") : t("全屏")}
      </button>
      <div className="tb-sep" />
      {/* 导出下拉菜单 */}
      <div className="export-dropdown" ref={exportRef}>
        <button className="tb-btn export-main" onClick={() => { setExportOpen(false); setExportDialogFmt(lastExport); }} title={`打开导出预览（上次格式 ${lastExport.toUpperCase()}）· Ctrl+E 快速导出 · 点击 ▼ 选择格式`}>
          <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />{t("导出")} {lastExport.toUpperCase()}
        </button>
        <button className={`tb-btn sq export-toggle ${exportOpen ? "active" : ""}`} onClick={(e) => { menuRectFrom(e.currentTarget); setExportOpen(!exportOpen); }} title="选择导出格式">▼</button>
        {exportOpen && (
          <div className="export-menu" data-ui="1" style={{ position: "fixed", top: menuPos.top, right: menuPos.right, marginTop: 0 }}>
            <div className="export-options" onClick={(e) => e.stopPropagation()}>
              <b>{t("导出整理")}</b>
              <label><input type="checkbox" checked={diagram.settings.showNodeLabels !== false} onChange={(e) => updateDiagram((d) => { d.settings.showNodeLabels = e.target.checked; }, false)} /> {t("显示元器件名称")}</label>
              <label><input type="checkbox" checked={diagram.settings.showPipeLabels !== false} onChange={(e) => updateDiagram((d) => { d.settings.showPipeLabels = e.target.checked; }, false)} /> {t("显示管路编号属性")}</label>
              <label><input type="checkbox" checked={diagram.settings.showFluidLabels === true} onChange={(e) => updateDiagram((d) => { d.settings.showFluidLabels = e.target.checked; }, false)} /> {t("显示介质文字")}</label>
              <label><input type="checkbox" checked={diagram.settings.showFluidColors !== false} onChange={(e) => updateDiagram((d) => { d.settings.showFluidColors = e.target.checked; }, false)} /> {t("显示介质颜色")}</label>
            </div>
            <hr />
            <button className="export-item" onClick={() => doExport("pdf")}><span className="export-badge">📄</span> PDF 文档<small>{t("预览 · 可调背景与留白")}</small></button>
            <button className="export-item" onClick={() => doExport("gif")} disabled={gifProgress !== null}><span className="export-badge">🎞️</span> GIF {t("动图")}<small>{gifProgress !== null ? `${t("生成中")} ${Math.round(gifProgress * 100)}%…` : t("预览 · 可调尺寸与速度")}</small></button>
            <button className="export-item" onClick={() => doExport("jpg")}><span className="export-badge">🖼️</span> JPG 图片<small>高压缩 · 用于文档</small></button>
            <hr />
            <button className="export-item" onClick={() => doExport("png")}><span className="export-badge">🖼️</span> PNG 图片<small>{t("预览 · 可调字号与图例")}</small></button>
            <button className="export-item" onClick={() => doExport("svg")}><span className="export-badge">📐</span> SVG 矢量<small>{t("可编辑 · 无限缩放")}</small></button>
            <hr />
            <button className="export-item" onClick={() => doExport("json")}><span className="export-badge">💾</span> 工程文件 (.json)<small>完整数据</small></button>
            <button className="export-item" onClick={() => doExport("engineering-json")}><span className="export-badge">🛡️</span> 工程 JSON<small>不含教学显示覆盖</small></button>
            <button className="export-item" onClick={() => doExport("share")}><span className="export-badge">🔗</span> 分享链接<small>复制即用</small></button>
          </div>
        )}
      </div>
      </div>
      )}
      {exportDialogFmt && (
        <ExportDialog
          svgRef={svgRef}
          initialFormat={exportDialogFmt as "png" | "jpg" | "svg" | "pdf" | "gif"}
          onClose={() => setExportDialogFmt(null)}
        />
      )}
      {importOpen && (
        <PromptDialog
          title="导入分享码"
          label="粘贴接收到的分享码，点确定打开图纸"
          multiline
          placeholder="粘贴分享码…"
          submitLabel="导入"
          onSubmit={(code) => {
            try {
              loadDiagram(decompressDiagram(code));
            } catch (err) {
              alert(`导入失败：${(err as Error).message}`);
            }
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
      {shareFallback !== null && (
        <PromptDialog
          title="复制失败，请手动复制"
          label="自动复制失败，请全选下面内容手动复制（Ctrl/Cmd+A → C）"
          multiline
          defaultValue={shareFallback}
          submitLabel="完成"
          onSubmit={() => {}}
          onClose={() => setShareFallback(null)}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) openFile(f);
          e.target.value = "";
        }}
      />
      {/* 机型包导入 */}
      <input
        ref={packRef}
        type="file"
        accept=".json,application/json,.fluidpack.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            f.text().then((text) => {
              try {
                const pack = parseMachinePack(text);
                loadDiagram(pack.diagram);
                markSaved();
                toast(`${t("机型包已导入")}: ${pack.meta.title}`);
              } catch (err) {
                toast((err as Error).message, "error");
              }
            });
          }
          e.target.value = "";
        }}
      />
      {/* 加载后引导提示条 */}
      {postLoadTip && (
        <div className="file-tip-toast" data-ui="1">
          {postLoadTip.split("\n").map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
