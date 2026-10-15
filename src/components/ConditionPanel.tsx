import { useState } from "react";
import { PromptDialog } from "./PromptDialog";
import { useAppState, saveWorkCondition, applyWorkCondition, updateWorkCondition, renameWorkCondition, deleteWorkCondition, listWorkConditions } from "../store";
import { getScenario } from "../scenarios";
import { useT } from "../i18n";
import { toast } from "../toast";

/**
 * 工况面板：把当前完整教学状态存成方案，之后一键切换对比。
 * 面向教学：① 调整当前状态 ② 输入名字点“记住” ③ 点方案里的“恢复”变回。
 * 保存后想干嘛，面板里直接写清楚。
 */
export function ConditionPanel({ onClose }: { onClose: () => void }) {
  const { diagram, ui } = useAppState();
  const { t } = useT();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [openedCondition, setOpenedCondition] = useState<string | null>(null);
  const list = listWorkConditions();
  const scenario = ui.scenario ? getScenario(ui.scenario.scenarioId, diagram) : undefined;
  const scenarioStep = scenario?.steps[ui.scenario?.stepIndex ?? 0];
  const scenarioCondition = scenarioStep?.conditionName
    ?? (scenarioStep && list.some((condition) => condition.name === scenarioStep.title) ? scenarioStep.title : null);
  const activeCondition = scenarioCondition ?? openedCondition;
  const activeExists = Boolean(activeCondition && list.some((condition) => condition.name === activeCondition));

  function save() {
    if (!name.trim()) return;
    saveWorkCondition(name.trim());
    setName("");
    toast(t("已保存「{name}」完整工况 —— 点方案旁的“恢复”即可变回").replace("{name}", name.trim()));
  }

  function apply(n: string) {
    applyWorkCondition(n);
    setOpenedCondition(n);
    toast(t("已恢复「{name}」的完整工况 —— 打开“回路诊断”查看工程流/停").replace("{name}", n));
  }

  function updateActiveCondition() {
    if (!activeCondition || !updateWorkCondition(activeCondition)) return;
    toast(t("已更新「{name}」完整工况；演示中引用此工况的步骤下次进入将使用最新状态").replace("{name}", activeCondition));
  }

  return (
    <div className="cond-panel" data-ui="1">
      <div className="cond-panel-head">
        <h3>💾 {t("工况 · 完整状态")}</h3>
        <div className="cond-panel-actions">
          <button className="cond-panel-toggle" onClick={() => setCollapsed((value) => !value)} title={collapsed ? t("展开") : t("折叠")} aria-label={collapsed ? t("展开") : t("折叠")}>{collapsed ? "▸" : "▾"}</button>
          <button className="cond-panel-close" onClick={onClose} title={t("关闭")}>✕</button>
        </div>
      </div>

      {!collapsed && <>
      <div className="cond-help">
        {t("把当前图纸的")}<b>{t("泵阀、介质、工程状态、教学显示覆盖和画布显示设置记下来，起个名")}</b>。
        {t("以后想回到这套状态，点“恢复”就全部还原；恢复后修改了状态，可点“更新此工况”覆盖保存。工况不会改变新增/删除对象或端口连接。")}
      </div>

      <div className="cond-steps">
        <b>{t("① 调好当前状态")}</b> → <b>{t("② 起名点“记住”")}</b> → <b>{t("③ 恢复后可更新")}</b>
      </div>

      {activeExists && <div className="cond-active" aria-live="polite">
        <div>
          <span>{scenarioCondition ? t("演示当前工况") : t("当前打开工况")}</span>
          <strong>{activeCondition}</strong>
        </div>
        <button className="cond-update-btn" onClick={updateActiveCondition}>↻ {t("更新此工况")}</button>
      </div>}

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
            <div key={c.name} className={`cond-row${activeCondition === c.name ? " is-active" : ""}`}>
              <span className="cond-name" title={t("双击或点 ✏️ 重命名")} onDoubleClick={() => setRenaming(c.name)}>{c.name}</span>
              <button className="btn ghost sq" title={t("重命名")} onClick={() => setRenaming(c.name)}>✏️</button>
              <button className="btn" onClick={() => apply(c.name)}>▶ {t("恢复")}</button>
              {activeCondition === c.name && <button className="btn ghost sq cond-row-update" title={t("更新此工况")} onClick={updateActiveCondition}>↻</button>}
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
        <b>{t("保存之后怎么做：")}</b>{t("工况会出现在列表里，也可在“演示”中编排成步骤。恢复某个工况或进入引用它的演示步骤后，修改教学显示覆盖、介质或属性，再点“更新此工况”即可覆盖该方案；不会改变图纸拓扑。")}
      </div>
      </>}
    </div>
  );
}
