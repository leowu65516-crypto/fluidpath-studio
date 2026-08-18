import { useMemo, useState } from "react";
import { NODE_DEFS, NODE_GROUPS, NodeSymbol, createNode, nodeDisplayLabel } from "../symbols";
import { addNodeAt } from "../store";
import { useT } from "../i18n";
import type { NodeDef } from "../symbols";

function LibraryItem({ def, lang }: { def: NodeDef; lang: "zh" | "en" }) {
  // 避免每次渲染都重新生成随机 ID 的预览节点
  const preview = useMemo(() => createNode(def.type, 0, 0, undefined, def.variant), [def.type, def.variant]);
  const scale = Math.min(34 / def.width, 34 / def.height);
  return (
    <div
      className="lib-item"
      draggable
      title={`${lang === "en" ? "Drag to add" : "拖拽到画布添加"} ${nodeDisplayLabel(def, lang)}`}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/fluidpath-node", def.type);
        if (def.variant) e.dataTransfer.setData("application/fluidpath-variant", def.variant);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDoubleClick={() => addNodeAt(def.type, 300 + Math.random() * 120, 220 + Math.random() * 120, def.variant)}
    >
      <svg width={40} height={40} viewBox="0 0 40 40">
        <g transform={`translate(${20 - (def.width * scale) / 2} ${20 - (def.height * scale) / 2}) scale(${scale})`}>
          <NodeSymbol node={{ ...preview, label: def.type === "label" ? "文本" : def.type === "shape" ? "文字" : preview.label, fontSize: def.type === "shape" ? 26 : preview.fontSize }} />
        </g>
      </svg>
      <span>{nodeDisplayLabel(def, lang)}</span>
    </div>
  );
}

export function Library({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const [search, setSearch] = useState("");
  const { t, lang } = useT();
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("fluidpath.libraryGroups") ?? "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch { return new Set(); }
  });

  const toggleGroup = (name: string) => {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      try { localStorage.setItem("fluidpath.libraryGroups", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const filtered = search.trim()
    ? NODE_DEFS.filter((d) => `${d.label} ${nodeDisplayLabel(d, "en")}`.toLowerCase().includes(search.toLowerCase()))
    : NODE_DEFS;

  // 搜索模式下按组分组，只显示有匹配的分组
  const groups = search.trim()
    ? NODE_GROUPS.map((g) => ({
        name: g,
        items: filtered.filter((d) => d.group === g),
      })).filter((g) => g.items.length > 0)
    : NODE_GROUPS.map((g) => ({
        name: g,
        items: NODE_DEFS.filter((d) => d.group === g),
      }));

  return (
    <div className={`library${collapsed ? " collapsed" : ""}`}>
      <div className={`panel-title${collapsed ? " vertical" : ""}`}>
        <button className="panel-toggle" onClick={onToggle} title={collapsed ? "展开元件库" : "折叠元件库"} aria-label={collapsed ? "展开元件库" : "折叠元件库"}>
          {collapsed ? "▶" : "◀"}
        </button>
        {!collapsed && <span>{t("元件库")}</span>}
        {collapsed && <span className="vertical-text">{t("元件库")}</span>}
      </div>
      {!collapsed && (
        <div className="lib-search-wrap">
          <input
            type="text"
            placeholder={t("搜索元件…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              height: 26,
              padding: "0 8px",
              border: "1px solid var(--border)",
              borderRadius: 5,
              fontSize: 12.5,
              outline: "none",
              boxSizing: "border-box",
              background: "var(--input-bg)",
              color: "var(--text)",
            }}
          />
        </div>
      )}
      {!collapsed && (
        <div className="lib-scroll">
          {groups.map((group) => {
            const closed = closedGroups.has(group.name);
            return (
              <div key={group.name} className="lib-group">
                <div className="lib-group-title" onClick={() => toggleGroup(group.name)} title={closed ? t("展开工具栏") : t("折叠工具栏")}>
                  <span className={`lib-group-caret${closed ? " closed" : ""}`}>▾</span>
                  {t(group.name)}
                  <span className="lib-group-count">{group.items.length}</span>
                </div>
                {!closed && (
                  <div className="lib-grid">
                    {group.items.map((def) => (
                      <LibraryItem key={`${def.type}_${def.variant ?? ""}`} def={def} lang={lang} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!collapsed && (
        <div className="lib-hint">
          {t("拖拽元件到画布 · 双击快速添加")}<br />
          {t("搜索框过滤元件")}
        </div>
      )}
    </div>
  );
}
