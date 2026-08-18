/** 快捷键自定义模块：定义动作表、绑定存取、按键匹配 */

export interface ShortcutDef {
  id: string;
  label: string;
  defaultKeys: string; // 如 "ctrl+z"
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  { id: "undo", label: "撤销", defaultKeys: "ctrl+z" },
  { id: "redo", label: "重做", defaultKeys: "ctrl+y" },
  { id: "duplicate", label: "复制（原位偏移）", defaultKeys: "ctrl+d" },
  { id: "group", label: "成组", defaultKeys: "ctrl+g" },
  { id: "ungroup", label: "解散组", defaultKeys: "ctrl+shift+g" },
  { id: "copy", label: "复制选中", defaultKeys: "ctrl+c" },
  { id: "paste", label: "粘贴", defaultKeys: "ctrl+v" },
  { id: "delete", label: "删除选中", defaultKeys: "delete" },
  { id: "search", label: "搜索元件", defaultKeys: "ctrl+f" },
  { id: "help", label: "快捷键帮助", defaultKeys: "?" },
  { id: "collapseLeft", label: "折叠/展开左栏", defaultKeys: "alt+1" },
  { id: "collapseRight", label: "折叠/展开右栏", defaultKeys: "alt+2" },
  { id: "collapseTop", label: "折叠/展开工具栏", defaultKeys: "alt+3" },
  { id: "fullscreen", label: "全屏", defaultKeys: "f11" },
  { id: "theme", label: "切换明暗主题", defaultKeys: "ctrl+shift+t" },
];

const STORAGE_KEY = "fluidpath.shortcuts";

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

export function getBinding(id: string): string {
  const map = load();
  const def = SHORTCUT_DEFS.find((d) => d.id === id);
  return map[id] ?? def?.defaultKeys ?? "";
}

export function setBinding(id: string, keys: string) {
  const map = load();
  map[id] = keys;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function resetBinding(id: string) {
  const map = load();
  const def = SHORTCUT_DEFS.find((d) => d.id === id);
  if (def) {
    map[id] = def.defaultKeys;
  } else {
    delete map[id];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

/** 将 KeyboardEvent 转为规范按键串（如 "ctrl+shift+z"、"?"、"f11"） */
export function eventToKeys(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  const key = e.key.toLowerCase();
  const k = key.length === 1 ? key : key === " " ? "space" : key;
  if (!["control", "meta", "alt", "shift"].includes(k)) parts.push(k);
  return parts.join("+");
}

/** 判断事件是否匹配某个按键串 */
export function matchKeys(e: KeyboardEvent, keys: string): boolean {
  if (!keys) return false;
  return eventToKeys(e) === keys.toLowerCase();
}

/** 判断绑定串是否被占用（用于冲突检测） */
export function findBindingConflict(keys: string, exceptId?: string): ShortcutDef | null {
  const normalized = keys.toLowerCase();
  for (const d of SHORTCUT_DEFS) {
    if (d.id === exceptId) continue;
    if (getBinding(d.id).toLowerCase() === normalized) return d;
  }
  return null;
}
