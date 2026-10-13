import { useState } from "react";
import { PromptDialog } from "./PromptDialog";
import { useAppState, saveWorkCondition, applyWorkCondition, renameWorkCondition, deleteWorkCondition, listWorkConditions } from "../store";
import { useT } from "../i18n";
import { toast } from "../toast";

/**
 * 工况面板：把当前完整教学状态存成方案，之后一键切换对比。
 * 面向教学：① 调整当前状态 ② 输入名字点“记住” ③ 点方案里的“恢复”变回。
 * 保存后想干嘛，面板里直接写清楚。
 */
export function ConditionPanel({ onClose }: { onClose: () => void }) {
  useAppState(); // 订阅图纸变化
  const { t } = useT();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const list = listWorkConditions();

  function save() {
    if (!name.trim()) return;
    saveWorkCondition(name.trim());
    setName("");
    toast(t("已保存「{name}」完整工况 —— 点方案旁的“恢复”即可变回").replace("{name}", name.trim()));
  }

  function apply(n: string) {
    applyWorkCondition(n);
    toast(t("已恢复「{name}」的完整工况 —— 打开“回路诊断”查看工程流/停").replace("{name}", n));
  }

  return (
    <div className="cond-panel" data-ui="1">
      <div className="cond-panel-head">
        <h3>💾 {t("工况 · 完整状态")}</h3>
        <button className="cond-panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="cond-help">
        {t("把当前图纸的")}<b>{t("泵阀、介质、工程状态、教学显示覆盖和画布显示设置记下来，起个名")}</b>。
        {t("以后想回到这套状态，点“恢复”就全部还原。工况不会改变新增/删除对象或端口连接。")}
      </div>

      <div className="cond-steps">
        <b>{t("① 调好当前状态")}</b> → <b>{t("② 下面起名点“记住”")}</b> → <b>{t("③ 点方案里的“恢复”")}</b>
      </div>

      <div className="cond-save-row">
        <input
          value={name}
          placeholder={t("起个名，如：做咖啡 / 清洗 / 待机")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        />
        <button className="cond-save-btn" onClick={save}>💾 {t("记住")}</button>
      </div>

      <div className="cond-list-title">{t("已保存工况")}（{list.length}）</div>
      {list.length === 0 ? (
        <div className="cond-empty">{t("还没有工况 —— 先调好图纸状态，再在上面起名点“记住”。")}</div>
      ) : (
        <div className="cond-list">
          {list.map((c) => (
            <div key={c.name} className="cond-row">
              <span className="cond-name" title={t("双击或点 ✏️ 重命名")} onDoubleClick={() => setRenaming(c.name)}>{c.name}</span>
              <button className="btn ghost sq" title={t("重命名")} onClick={() => setRenaming(c.name)}>✏️</button>
              <button className="btn" onClick={() => apply(c.name)}>▶ {t("恢复")}</button>
              <button className="btn ghost sq" title={t("删除")} onClick={() => { if (confirm(t("删除方案「{name}」？").replace("{name}", c.name))) deleteWorkCondition(c.name); }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {renaming !== null && (
        <PromptDialog
          title={t("重命名工况")}
          label={t("输入新的工况名称")}
          defaultValue={renaming}
          submitLabel={t("保存")}
          onSubmit={(v) => {
            const ok = renameWorkCondition(renaming, v);
            if (!ok) toast(t("重命名失败：名称无效或已存在"), "error");
            else toast(t("已重命名为「{name}」").replace("{name}", v.trim()));
          }}
          onClose={() => setRenaming(null)}
        />
      )}

      <div className="cond-note">
        <b>{t("保存之后怎么做：")}</b>{t("工况会出现在上面的列表里，也可在“演示”里被编排成步骤。之后改乱了状态，点“恢复”就一键变回；再打开“回路诊断”能直接查看各出口流/停。")}
      </div>
    </div>
  );
}
