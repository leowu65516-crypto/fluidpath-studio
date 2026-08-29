import { useState } from "react";
import { useAppState, saveWorkCondition, applyWorkCondition, deleteWorkCondition, listWorkConditions } from "../store";
import { useT } from "../i18n";
import { toast } from "../toast";

/**
 * 工况面板：把当前阀门/泵开关存成「方案」，之后一键切换对比。
 * 面向教学：① 摆好开关 ② 输入名字点「记住」 ③ 点方案里的「恢复」变回。
 * 保存后想干嘛，面板里直接写清楚。
 */
export function ConditionPanel({ onClose }: { onClose: () => void }) {
  useAppState(); // 订阅图纸变化
  const { t } = useT();
  const [name, setName] = useState("");
  const list = listWorkConditions();

  function save() {
    if (!name.trim()) return;
    saveWorkCondition(name.trim());
    setName("");
    toast(t("已记住「{name}」这套开关 —— 点方案旁的「▶ 恢复」即可变回").replace("{name}", name.trim()));
  }

  function apply(n: string) {
    applyWorkCondition(n);
    toast(t("已恢复到「{name}」的开关状态 —— 打开「回路诊断」看出口流/停").replace("{name}", n));
  }

  return (
    <div className="cond-panel" data-ui="1">
      <div className="cond-panel-head">
        <h3>💾 {t("工况 · 开关方案")}</h3>
        <button className="cond-panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="cond-help">
        {t("把图上所有")}<b>{t("阀门 / 泵的「开/关」状态记下来，起个名")}</b>。
        {t("以后想回到这套状态，点「恢复」就全变回来。不是文件，就存在这张图里。")}
      </div>

      <div className="cond-steps">
        <b>{t("① 在图上摆好开关")}</b> → <b>{t("② 下面起名点「记住」")}</b> → <b>{t("③ 点方案里的「恢复」")}</b>
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

      <div className="cond-list-title">{t("已记住的开关方案")}（{list.length}）</div>
      {list.length === 0 ? (
        <div className="cond-empty">{t("还没有方案 —— 先在图上摆好开关，再在上面起名点「记住」。")}</div>
      ) : (
        <div className="cond-list">
          {list.map((c) => (
            <div key={c.name} className="cond-row">
              <span className="cond-name">{c.name}</span>
              <button className="btn" onClick={() => apply(c.name)}>▶ {t("恢复")}</button>
              <button className="btn ghost sq" title={t("删除")} onClick={() => { if (confirm(t("删除方案「{name}」？").replace("{name}", c.name))) deleteWorkCondition(c.name); }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="cond-note">
        <b>{t("保存之后怎么做：")}</b>{t("方案会出现在上面的列表里。之后把图上开关拨乱了，就点这个方案的「▶ 恢复」一键变回；再打开「回路诊断」能直接看各出口流/停。")}
      </div>
    </div>
  );
}
