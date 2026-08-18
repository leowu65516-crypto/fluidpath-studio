import { useEffect } from "react";
import { getBinding } from "../shortcuts";
import { useT } from "../i18n";

const SHORTCUTS = [
  { id: "undo", desc: "撤销" },
  { id: "redo", desc: "重做" },
  { id: "copy", desc: "复制选中" },
  { id: "paste", desc: "粘贴" },
  { id: "duplicate", desc: "复制选中（原位偏移）" },
  { id: "group", desc: "成组" },
  { id: "ungroup", desc: "解散组" },
  { id: "delete", desc: "删除选中" },
  { id: "search", desc: "搜索并定位元件" },
  { id: "collapseLeft", desc: "折叠/展开左栏" },
  { id: "collapseRight", desc: "折叠/展开右栏" },
  { id: "collapseTop", desc: "折叠/展开工具栏" },
  { id: "theme", desc: "切换明暗主题" },
  { id: "help", desc: "显示/隐藏此面板" },
];

export function ShortcutsPanel({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings?: () => void }) {
  const { t } = useT();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) onClose();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.35)", fontFamily: "system-ui, sans-serif",
    }} onClick={onClose}>
      <div style={{
        background: "var(--panel)", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
        maxWidth: 480, width: "90%", maxHeight: "80vh", overflow: "auto",
        padding: "24px 28px",
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 650, color: "var(--text)" }}>⌨️ 快捷键</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SHORTCUTS.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 13, color: "var(--text)" }}>{t(s.desc)}</span>
              <kbd style={{
                fontSize: 12, background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: 5, padding: "2px 8px", color: "var(--text)",
                whiteSpace: "nowrap", fontFamily: "monospace",
              }}>{getBinding(s.id)}</kbd>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 13, color: "var(--text)" }}>方向键微调 1px / Shift+方向键 10px</span>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("固定")}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              style={{ fontSize: 12.5, padding: "6px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer" }}
            >⚙️ 自定义快捷键</button>
          )}
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>按 ? 或 Esc 关闭</p>
      </div>
    </div>
  );
}
