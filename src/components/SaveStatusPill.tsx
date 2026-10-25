import { useMemo, useState } from "react";
import { fileAutosaveStatus, latestAutosaveAt, useAppState } from "../store";
import { useT } from "../i18n";

function hhmm(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function SaveStatusPill() {
  const { diagram, ui } = useAppState();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const sourcePath = fileAutosaveStatus().sourcePath;
  const lastAuto = ui.lastAutosaveAt || latestAutosaveAt(diagram.id);
  const dirty = ui.dirty;
  const fileName = sourcePath ? sourcePath.split(/[\\/]/).pop() : "";

  const label = useMemo(() => {
    if (dirty) {
      if (lastAuto) return `● ${t("本机草稿")} ${hhmm(lastAuto)} · ${t("文件未保存")}`;
      return `● ${t("有未保存修改")} · ${t("正在保存到本机…")}`;
    }
    if (sourcePath) return `✓ ${t("已保存到")} ${fileName}${ui.fileSavedAt ? ` · ${hhmm(ui.fileSavedAt)}` : ""}`;
    if (ui.fileSavedAt) return `✓ ${t("已保存文件")}${ui.fileSavedAt ? ` · ${hhmm(ui.fileSavedAt)}` : ""}`;
    return `✓ ${t("未修改")}`;
  }, [dirty, fileName, lastAuto, sourcePath, t, ui.fileSavedAt]);

  return (
    <span className="save-pill-wrap">
      <button
        type="button"
        className={`sb-item save-pill ${dirty ? "dirty" : "saved"}`}
        onClick={() => setOpen((v) => !v)}
        title={t("查看保存状态与保存说明")}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <>
          <div className="save-popover-backdrop" onMouseDown={() => setOpen(false)} />
          <div className="save-popover" role="dialog" aria-label={t("保存说明")}>
            <div className="save-popover-title">{t("保存说明")}</div>
            <div className="save-popover-row">
              <b>🔄 {t("自动保存（本机）")}</b>
              <span>{t("编辑后自动保存在浏览器，保留 5 个版本；用于崩溃恢复，不能发给别人。")}</span>
            </div>
            <div className="save-popover-row">
              <b>💾 {t("保存文件（JSON）")}</b>
              <span>{t("生成一个 .json 文件，可分享、换电脑打开、纳入版本管理。")}</span>
            </div>
            <div className="save-popover-row">
              <b>🖼️ {t("导出图片")}</b>
              <span>{t("PNG/SVG/PDF/GIF 只用于展示，不能再编辑，也不等于保存图纸。")}</span>
            </div>
            <button className="btn wide primary" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("fluidpath:save-file")); }}>
              💾 {t("保存文件")}
            </button>
          </div>
        </>
      )}
    </span>
  );
}
