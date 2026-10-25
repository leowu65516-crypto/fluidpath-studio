import { useMemo } from "react";
import { useT } from "../i18n";
import type { DiagramNode } from "../types";
import type { SmartBlock } from "../smart-draw/types";
import { DiagramPreview } from "./DiagramPreview";

export function SmartBlockDialog({
  block,
  nodes,
  usedPortIds,
  onCancel,
  onInsert,
}: {
  block: SmartBlock;
  nodes: DiagramNode[];
  usedPortIds: Set<string>;
  onCancel: () => void;
  onInsert: (anchorPortId: string | null) => void;
}) {
  const { t } = useT();
  const preview = useMemo(() => block.build(), [block]);
  const anchors = useMemo(() => {
    const priority = block.id === "steam-wand"
      ? ["steamBoiler", "solenoid3", "solenoid2", "tee", "hotWaterBoiler"]
      : block.id === "cleaning-bypass"
        ? ["hotWaterBoiler", "tee", "solenoid2", "pump"]
        : ["tee", "solenoid2", "solenoid3", "hotWaterBoiler", "milkPump"];
    const list = nodes
      .filter((n) => !n.disabled)
      .flatMap((n) => n.ports
        .filter((p) => p.direction !== "in" && !usedPortIds.has(p.id))
        .map((p) => ({ node: n, port: p, rank: priority.indexOf(n.type) })))
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 6);
    return list;
  }, [block.id, nodes, usedPortIds]);

  return (
    <div className="smart-modal-overlay" data-ui="1" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="smart-block-dialog" role="dialog" aria-modal="true" aria-label={t(block.titleZh)}>
        <header className="smart-modal-head">
          <div>
            <div className="smart-modal-title">+ {t(block.titleZh)}</div>
            <div className="smart-modal-sub">{t(block.descZh)}</div>
          </div>
          <button className="btn ghost sq" onClick={onCancel} aria-label={t("关闭")}>×</button>
        </header>
        <div className="smart-block-preview">
          <DiagramPreview nodes={preview.nodes} pipes={preview.pipes} showLabels />
        </div>
        <div className="smart-block-body">
          <div className="smart-mode-title">{t("接在哪里？")}</div>
          {anchors.length === 0 ? (
            <div className="smart-empty-note">{t("没有找到可用接点。可以先放到右侧，稍后用连线工具连接。")}</div>
          ) : (
            <div className="smart-anchor-list">
              {anchors.map(({ node, port }) => (
                <button key={port.id} type="button" className="smart-anchor" onClick={() => onInsert(port.id)}>
                  <span className="smart-anchor-node">{node.label}</span>
                  <span className="smart-anchor-port">{t("可用接点")} · {port.position}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <footer className="smart-modal-foot">
          <button className="btn ghost" onClick={() => onInsert(null)}>{t("先放到右边，我自己连")}</button>
          <button className="btn ghost" onClick={onCancel}>{t("取消")}</button>
        </footer>
      </div>
    </div>
  );
}
