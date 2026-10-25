import { useT } from "../i18n";

export type SaveNudgeKind = "first-edit" | "insert" | "block" | "reroute" | "export";

export function SaveNudge({
  kind,
  detail,
  onDismiss,
}: {
  kind: SaveNudgeKind;
  detail?: string;
  onDismiss: () => void;
}) {
  const { t } = useT();
  const title = kind === "first-edit"
    ? t("修改已自动保存在本机")
    : kind === "insert"
      ? t("已插入，建议保存文件")
      : kind === "block"
        ? t("已添加功能块")
        : kind === "reroute"
          ? t("已重新自动布线")
          : t("图片已导出");
  const body = kind === "first-edit"
    ? t("自动保存用于崩溃恢复；要分享或换电脑，请保存为文件。")
    : kind === "export"
      ? t("导出图片不等于保存图纸；需要可编辑文件请保存 JSON。")
      : t("本机已自动保存。要分享或换电脑，请保存文件。");
  return (
    <div className="save-nudge" data-ui="1" role="status">
      <div className="save-nudge-icon">💾</div>
      <div className="save-nudge-main">
        <div className="save-nudge-title">{title}</div>
        <div className="save-nudge-body">{detail ? `${detail}。${body}` : body}</div>
        <div className="save-nudge-actions">
          <button className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent("fluidpath:save-file"))}>💾 {t("保存文件")}</button>
          <button className="btn ghost" onClick={onDismiss}>{t("以后再说")}</button>
        </div>
      </div>
      <button className="save-nudge-close" onClick={onDismiss} aria-label={t("关闭")}>×</button>
    </div>
  );
}
