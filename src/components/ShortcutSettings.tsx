import { useEffect, useState } from "react";
import { SHORTCUT_DEFS, eventToKeys, getBinding, setBinding, resetBinding, findBindingConflict } from "../shortcuts";
import { useT } from "../i18n";

export function ShortcutSettings({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [, setTick] = useState(0); // 强制刷新

  const refresh = () => setTick((t) => t + 1);

  // 录制：监听一次 keydown
  useEffect(() => {
    if (!recordingId) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setRecordingId(null); return; }
      const keys = eventToKeys(e);
      const conflict = findBindingConflict(keys, recordingId);
      if (conflict) {
        setWarning(`⚠️ "${keys}" 已被「${conflict.label}」使用`);
      } else {
        setWarning(null);
        setBinding(recordingId, keys);
        setRecordingId(null);
        refresh();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recordingId]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.35)", fontFamily: "system-ui, sans-serif",
    }} onClick={onClose}>
      <div style={{
        background: "var(--panel)", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
        maxWidth: 560, width: "92%", maxHeight: "82vh", display: "flex", flexDirection: "column",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650, color: "var(--text)" }}>⌨️ {t("自定义快捷键")}</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 18, color: "var(--text-dim)", cursor: "pointer" }}>✕</button>
        </div>
        {warning && (
          <div style={{ margin: "10px 20px 0", padding: "8px 12px", background: "#fdf3e7", border: "1px solid #e0a34b", borderRadius: 6, color: "#b06d1a", fontSize: 12.5 }}>
            {warning}
          </div>
        )}
        <div style={{ padding: "12px 20px", overflowY: "auto", flex: 1 }}>
          {recordingId && (
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 8, color: "var(--text)", fontSize: 13 }}>
              🎯 {t("正在为")}「{SHORTCUT_DEFS.find((d) => d.id === recordingId)?.label}」{t("录制新快捷键… 请按组合键（Esc 取消）")}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {SHORTCUT_DEFS.map((def) => {
              const binding = getBinding(def.id);
              const isRecording = recordingId === def.id;
              return (
                <div key={def.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                  borderRadius: 8, background: isRecording ? "var(--accent-soft)" : "transparent",
                  border: isRecording ? "1px solid var(--accent)" : "1px solid transparent",
                }}>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{def.label}</span>
                  <kbd style={{
                    fontSize: 12, background: "var(--surface-2)", border: "1px solid var(--border)",
                    borderRadius: 5, padding: "2px 8px", color: "var(--text)", fontFamily: "monospace",
                    minWidth: 60, textAlign: "center",
                  }}>{binding || "（未绑定）"}</kbd>
                  {isRecording ? (
                    <span style={{ fontSize: 12, color: "var(--accent)" }}>{t("录制新快捷键… 请按组合键（Esc 取消）")}</span>
                  ) : (
                    <>
                      <button
                        onClick={() => { setRecordingId(def.id); setWarning(null); }}
                        style={{ fontSize: 12, padding: "3px 10px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", cursor: "pointer" }}
                      >{t("录制")}</button>
                      <button
                        onClick={() => { resetBinding(def.id); refresh(); }}
                        title="恢复默认"
                        style={{ fontSize: 12, padding: "3px 8px", borderRadius: 5, border: "1px solid transparent", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
                      >↺</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ padding: "12px 20px 16px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-dim)" }}>
          {t("录制时会自动检测冲突；方向键微调为固定快捷键，不支持修改。Esc 关闭本面板。")}
        </div>
      </div>
    </div>
  );
}
