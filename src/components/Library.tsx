import { useMemo, useRef, useState } from "react";
import { NODE_DEFS, NODE_GROUPS, NodeSymbol, createNode, nodeDisplayLabel } from "../symbols";
import { addNodeAt, patchNode } from "../store";
import { useT } from "../i18n";
import type { NodeDef } from "../symbols";

function LibraryItem({ def, lang, profile }: { def: NodeDef; lang: "zh" | "en"; profile?: "teaching" | "engineering" }) {
  // 避免每次渲染都重新生成随机 ID 的预览节点
  const preview = useMemo(() => createNode(def.type, 0, 0, undefined, def.variant), [def.type, def.variant]);
  const scale = Math.min(34 / def.width, 34 / def.height);
  // 预览符号的内置 label 双语：用渲染时 lang 覆盖 createNode 的默认值
  const previewLabel = def.type === "label" || def.type === "shape" ? (lang === "en" ? "Text" : "文本") : nodeDisplayLabel(def, lang);
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
          <NodeSymbol node={{ ...preview, label: previewLabel, fontSize: def.type === "shape" ? 26 : preview.fontSize }} profile={profile} surface="library" />
        </g>
      </svg>
      <span>{nodeDisplayLabel(def, lang)}</span>
    </div>
  );
}

export function Library({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const [search, setSearch] = useState("");
  const [quickType, setQuickType] = useState<"label" | "annotation">("label");
  const [quickText, setQuickText] = useState("");
  const [quickFontSize, setQuickFontSize] = useState(16);
  const imageInputRef = useRef<HTMLInputElement>(null);
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

  const insertQuickText = () => {
    const type = quickType;
    const node = addNodeAt(type, 300 + Math.random() * 120, 220 + Math.random() * 120);
    patchNode(node.id, { label: quickText.trim() || (type === "label" ? (lang === "en" ? "Text" : "文字标签") : (lang === "en" ? "Note" : "标注说明")), fontSize: quickFontSize });
  };

  const insertImage = (file: File) => {
    const node = addNodeAt("image", 300 + Math.random() * 120, 220 + Math.random() * 120);
    const reader = new FileReader();
    reader.onload = () => patchNode(node.id, { imageData: reader.result as string, label: file.name, width: 180, height: 120 });
    reader.readAsDataURL(file);
  };

  return (
    <div className={`library${collapsed ? " collapsed" : ""}`}>
      <div className={`panel-title${collapsed ? " vertical" : ""}`}>
        <button className="panel-toggle" onClick={onToggle} title={collapsed ? t("展开元件库") : t("折叠元件库")} aria-label={collapsed ? t("展开元件库") : t("折叠元件库")}>
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
        <div className="library-quick-add" data-ui="1">
          <div className="library-quick-title">{t("快速内容")}</div>
          <div className="library-quick-tabs" role="group" aria-label={t("插入内容类型")}>
            <button className={quickType === "label" ? "on" : ""} onClick={() => { setQuickType("label"); setQuickFontSize(16); }}>{t("文字标签")}</button>
            <button className={quickType === "annotation" ? "on" : ""} onClick={() => { setQuickType("annotation"); setQuickFontSize(14); }}>{t("引线标注")}</button>
          </div>
          <input
            className="library-quick-text"
            value={quickText}
            onChange={(event) => setQuickText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") insertQuickText(); }}
            placeholder={quickType === "label" ? t("输入标签文字") : t("输入标注内容")}
          />
          <div className="library-quick-size">
            <label>{t("文字大小")}</label>
            <input type="range" min={8} max={48} value={quickFontSize} onChange={(event) => setQuickFontSize(Number(event.target.value))} />
            <output>{quickFontSize}px</output>
          </div>
          <div className="library-quick-actions">
            <button className="btn" onClick={insertQuickText}>＋ {t("插入")}</button>
            <button className="btn ghost" onClick={() => imageInputRef.current?.click()}>▣ {t("插入图片")}</button>
            <input
              ref={imageInputRef}
              className="library-image-input"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) insertImage(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      )}
      {!collapsed && (
        <div className="lib-scroll">
          {groups.map((group) => {
            const closed = closedGroups.has(group.name);
            return (
              <div key={group.name} className="lib-group">
                <div className="lib-group-title" onClick={() => toggleGroup(group.name)} title={closed ? t("展开分组") : t("折叠分组")}>
                  <span className={`lib-group-caret${closed ? " closed" : ""}`}>▾</span>
                  {t(group.name)}
                  <span className="lib-group-count">{group.items.length}</span>
                </div>
                {!closed && (
                  <div className="lib-grid">
                    {group.items.map((def) => (
                      <LibraryItem key={`${def.type}_${def.variant ?? ""}`} def={def} lang={lang} profile="teaching" />
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
