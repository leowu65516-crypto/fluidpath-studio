import { useEffect, useMemo, useRef, useState } from "react";
import { focusNode, useAppState } from "../store";
import { defOf } from "../symbols";
import { useT } from "../i18n";

export function SearchPanel({ onClose }: { onClose: () => void }) {
  const { diagram } = useAppState();
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return diagram.nodes
      .filter((n) => n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q))
      .slice(0, 50);
  }, [query, diagram.nodes]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActive(0), [query]);

  function jump(id: string) {
    focusNode(id);
    onClose();
  }

  return (
    <div style={{
      position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
      zIndex: 9000, width: 360, maxWidth: "90vw",
      background: "var(--panel)", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      border: "1px solid var(--border)", fontFamily: "system-ui, sans-serif", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ color: "var(--text-dim)", fontSize: 14 }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          placeholder={t("搜索元件名称… (Ctrl+F / Esc 关闭)")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && results[active]) jump(results[active].id);
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          }}
          style={{
            flex: 1, border: "none", outline: "none", fontSize: 13, padding: "4px 0",
            color: "var(--text)", background: "transparent",
          }}
        />
      </div>
      <div style={{ maxHeight: 320, overflowY: "auto", padding: "4px 0" }}>
        {query.trim() && results.length === 0 && (
          <div style={{ padding: "18px 16px", textAlign: "center", color: "var(--text-dim)", fontSize: 12.5 }}>
            {t("未找到匹配的元件")}
          </div>
        )}
        {results.map((n, i) => (
          <div
            key={n.id}
            onClick={() => jump(n.id)}
            onMouseEnter={() => setActive(i)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "7px 14px",
              cursor: "pointer", background: i === active ? "var(--accent-soft)" : "transparent",
            }}
          >
            <span style={{
              flexShrink: 0, fontSize: 11, color: "var(--text-dim)", background: "var(--surface-2)",
              borderRadius: 4, padding: "1px 6px",
            }}>{defOf(n.type, n.variant).label}</span>
            <span style={{ flex: 1, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.label}</span>
            <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>({Math.round(n.x)}, {Math.round(n.y)})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
