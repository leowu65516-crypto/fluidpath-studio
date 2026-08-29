/**
 * 自动保存 / 崩溃恢复 / 同路径副本（从 store.ts 拆出的领域模块，v1.17 领域拆分第一步）。
 *
 * 与 store 的依赖通过 initAutosave 注入，避免循环导入；
 * store.ts 继续全量 re-export 本模块 API，保持对外兼容零变化。
 */

import type { Diagram, UIState } from "./types";

export const AUTOSAVE_MAX_VERSIONS = 5;
const AUTOSAVE_KEY = (id: string) => `fluidpath.autosave.v1.${id}`;
const SAVED_KEY = (id: string) => `fluidpath.saved.ts.${id}`;
const LAST_DIAGRAM_KEY = "fluidpath.lastDiagramId";

export interface AutosaveVersion {
  ts: number;
  diagram: Diagram;
}

export type ElectronBridge = {
  writeAutosaveCopy?: (payload: { sourcePath: string; json: string }) => Promise<{ path: string }>;
  writeSelectionClipboard?: (json: string) => Promise<boolean>;
  readSelectionClipboard?: () => Promise<string | null>;
};

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let sourceFilePath: string | null = null;
let fileAutosaveEnabled = false;
let fileAutosavePath: string | null = null;
let fileAutosaveTicker: ReturnType<typeof setInterval> | null = null;

// ===== 依赖注入（store.ts 初始化时绑定） =====
let getDiagram: () => Diagram = () => {
  throw new Error("autosave deps not initialized");
};
let notifyUI: (patch: Partial<UIState>) => void = () => undefined;
let reloadDiagram: (d: Diagram) => void = () => undefined;

export function initAutosave(deps: { getDiagram: () => Diagram; notifyUI: (patch: Partial<UIState>) => void; reloadDiagram: (d: Diagram) => void }) {
  getDiagram = deps.getDiagram;
  notifyUI = deps.notifyUI;
  reloadDiagram = deps.reloadDiagram;
}

export function setSourceFilePath(path: string | null) {
  sourceFilePath = path;
  fileAutosaveEnabled = false;
  fileAutosavePath = null;
  if (fileAutosaveTicker) { clearInterval(fileAutosaveTicker); fileAutosaveTicker = null; }
  notifyUI({});
}

export function fileAutosaveStatus() {
  return { enabled: fileAutosaveEnabled, sourcePath: sourceFilePath, copyPath: fileAutosavePath };
}

/** 开启后每分钟将当前图纸原子写入原 JSON 同目录的 .autosave.json 副本。 */
export async function setFileAutosave(enabled: boolean): Promise<{ enabled: boolean; path?: string }> {
  if (!enabled) {
    fileAutosaveEnabled = false;
    fileAutosavePath = null;
    if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
    if (fileAutosaveTicker) { clearInterval(fileAutosaveTicker); fileAutosaveTicker = null; }
    notifyUI({});
    return { enabled: false };
  }
  const bridge = (window as Window & { electron?: ElectronBridge }).electron;
  if (!sourceFilePath || !bridge?.writeAutosaveCopy) throw new Error("请先通过桌面版打开 JSON 图纸，再开启同路径自动保存");
  fileAutosaveEnabled = true;
  const result = await writeFileAutosave(getDiagram());
  if (fileAutosaveTicker) clearInterval(fileAutosaveTicker);
  fileAutosaveTicker = setInterval(() => { void writeFileAutosave(getDiagram()); }, 60_000);
  notifyUI({});
  return { enabled: true, path: result };
}

async function writeFileAutosave(diagram: Diagram): Promise<string | undefined> {
  const bridge = (window as Window & { electron?: ElectronBridge }).electron;
  if (!fileAutosaveEnabled || !sourceFilePath || !bridge?.writeAutosaveCopy) return undefined;
  const result = await bridge.writeAutosaveCopy({ sourcePath: sourceFilePath, json: JSON.stringify({ ...diagram, _version: 3, _autosavedAt: new Date().toISOString() }, null, 2) });
  fileAutosavePath = result.path;
  return result.path;
}

/** 编辑后防抖调度自动保存（800ms 无变化才落盘） */
export function scheduleAutosave(diagram: Diagram) {
  if (!diagram.id || diagram.nodes.length === 0) return;
  try { localStorage.setItem(LAST_DIAGRAM_KEY, diagram.id); } catch { /* ignore */ }
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    persistAutosave(diagram);
    void writeFileAutosave(diagram);
  }, fileAutosaveEnabled ? 60_000 : 800);
}

function persistAutosave(diagram: Diagram) {
  autosaveTimer = null;
  try {
    const key = AUTOSAVE_KEY(diagram.id);
    let versions: AutosaveVersion[] = [];
    const raw = localStorage.getItem(key);
    if (raw) { try { versions = JSON.parse(raw) as AutosaveVersion[]; } catch { versions = []; } }
    // 与最新版本内容一致则不重复写（防抖 + 去重）
    if (versions[0] && JSON.stringify(versions[0].diagram) === JSON.stringify(diagram)) return;
    versions.unshift({ ts: Date.now(), diagram: structuredClone(diagram) });
    versions = versions.slice(0, AUTOSAVE_MAX_VERSIONS);
    localStorage.setItem(key, JSON.stringify(versions));
  } catch { /* 存储满/不可用：忽略，不影响主流程 */ }
}

/** 立即落盘（beforeunload 时调用，防止退出丢最新改动） */
export function flushAutosave(diagram: Diagram) {
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  persistAutosave(diagram);
  void writeFileAutosave(diagram);
}

export function getAutosaveVersions(diagramId: string): AutosaveVersion[] {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY(diagramId));
    return raw ? (JSON.parse(raw) as AutosaveVersion[]) : [];
  } catch { return []; }
}

/** 崩溃恢复：有比最近保存更新的自动备份 */
export function pendingAutosave(diagramId: string): AutosaveVersion[] {
  const savedTs = Number(localStorage.getItem(SAVED_KEY(diagramId)) ?? 0);
  return getAutosaveVersions(diagramId).filter((v) => v.ts > savedTs);
}

export function restoreAutosaveVersion(diagramId: string, index: number) {
  const v = getAutosaveVersions(diagramId)[index];
  if (v) reloadDiagram(v.diagram);
}

/** 恢复后/显式保存后记录基准时间，清除待恢复状态 */
export function recordSavedAt(diagramId: string) {
  if (!diagramId) return;
  try { localStorage.setItem(SAVED_KEY(diagramId), String(Date.now())); } catch { /* ignore */ }
}

export function clearAutosave(diagramId: string) {
  try { localStorage.removeItem(AUTOSAVE_KEY(diagramId)); recordSavedAt(diagramId); } catch { /* ignore */ }
}

export function lastEditedDiagramId(): string | null {
  try { return localStorage.getItem(LAST_DIAGRAM_KEY); } catch { return null; }
}
