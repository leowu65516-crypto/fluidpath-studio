import { useEffect } from "react";
import { setUI, store, useAppState } from "../store";
import { useT } from "../i18n";
import { toast } from "../toast";
import { bindKbGroupSelection, bindKbGroupTargets } from "../fault-codes/actions";
import { suggestGroupTargets, unboundGroups } from "../fault-codes/binding";
import { setBindPreviewGroupId } from "../fault-codes/session";

/** 从当前图纸开启绑定向导（队列 = 所有未绑定部件组）。返回是否成功开启。 */
export function startBindingWizard(onlyGroupIds?: string[]): boolean {
  const profile = store.get().diagram.settings.diagnosticProfile;
  if (!profile) return false;
  const unbound = new Set(unboundGroups(profile).map(group => group.id));
  const queue = (onlyGroupIds?.length ? onlyGroupIds : [...unbound]).filter(id => unbound.has(id));
  if (!queue.length) return false;
  setUI({ kbBinding: { queue, index: 0 } });
  return true;
}

export function stopBindingWizard(): void {
  setUI({ kbBinding: null });
  setBindPreviewGroupId(null);
}

/**
 * 0.4 绑定向导（1.47.0）：一次只处理一个部件组。
 * 画布点选 → 确认绑定 → 自动进入下一组；也支持名称建议、跳过、Esc 退出。
 */
export function BindingWizard({ onError }: { onError: (message: string) => void }) {
  const { diagram, ui } = useAppState();
  const { t, lang } = useT();
  const profile = diagram.settings.diagnosticProfile;
  const binding = ui.kbBinding ?? null;
  const groups = profile?.highlightGroups ?? [];
  const queue = binding ? binding.queue.filter(id => groups.some(group => group.id === id)) : [];
  const index = binding ? Math.min(binding.index, queue.length) : 0;
  const currentId = queue[index];
  const group = groups.find(item => item.id === currentId);
  const label = (pair: { zh?: string; en?: string } | undefined) => (lang === "en" ? pair?.en || pair?.zh || "" : pair?.zh || pair?.en || "");
  const selectionCount = ui.selection.nodes.length + ui.selection.pipes.length;
  const currentBound = !!group && group.nodeIds.length + group.pipeIds.length > 0;
  const suggestions = group ? suggestGroupTargets(diagram, group) : { nodes: [], pipes: [] };
  const suggestionCount = suggestions.nodes.length + suggestions.pipes.length;
  const unboundCount = profile ? unboundGroups(profile).length : 0;

  // 当前组的画布预览（蓝色虚线）；离开向导时清除。
  useEffect(() => {
    setBindPreviewGroupId(binding ? currentId ?? null : null);
    return () => setBindPreviewGroupId(null);
  }, [binding, currentId]);

  // 绑定成功（或组已不存在）后自动进入下一组；队列耗尽则收尾。
  useEffect(() => {
    if (!binding || !profile) return;
    if (queue.length === 0) { stopBindingWizard(); return; }
    if (index >= queue.length) { stopBindingWizard(); toast(t("部件组绑定完成")); return; }
    if (currentBound) {
      if (index + 1 >= queue.length) { stopBindingWizard(); toast(t("部件组绑定完成")); return; }
      setUI({ kbBinding: { queue: binding.queue, index: index + 1 } });
    }
  }, [binding, profile, index, currentBound, queue.length, t]);

  useEffect(() => {
    if (!binding) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") stopBindingWizard(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [binding]);

  if (!binding || !profile) return null;

  function advance() {
    if (index + 1 >= queue.length) { stopBindingWizard(); toast(t("部件组绑定完成")); return; }
    setUI({ kbBinding: { queue: binding!.queue, index: index + 1 } });
  }
  function confirmBinding() {
    if (!currentId) return;
    try {
      bindKbGroupSelection(currentId, "replace");
    } catch (error) {
      onError((error as Error).message);
    }
  }
  function applySuggestion() {
    if (!currentId || !group) return;
    try {
      bindKbGroupTargets(currentId, suggestions);
      toast(t("已按名称建议绑定") + ` ${suggestionCount}`);
    } catch (error) {
      onError((error as Error).message);
    }
  }

  return <section className="bind-wizard" data-ui="1" data-testid="bind-wizard" aria-label={t("部件组绑定向导")}>
    <div className="bind-wizard-head">
      <b>{t("绑定部件组")} <span className="bind-wizard-progress">{Math.min(index + 1, queue.length)} / {queue.length}</span></b>
      <span className="bind-wizard-name">{group ? label(group.label) : t("未命名部件组")}</span>
      <button className="btn ghost sq" onClick={stopBindingWizard} aria-label={t("退出绑定向导")}>×</button>
    </div>
    <p className="bind-wizard-hint">{t("在画布点选元件/管路（可多选），再点「确认绑定」；找不到就跳过，剩余未绑定会保留。")}</p>
    <div className="bind-wizard-row">
      <span className="bind-wizard-sel">{t("已选")} {selectionCount} · {t("未绑定")} {unboundCount}</span>
      <button className="btn" disabled={selectionCount === 0} onClick={confirmBinding}>{t("确认绑定")}</button>
      <button className="btn ghost" disabled={suggestionCount === 0} onClick={applySuggestion}>{t("采用名称建议")} ({suggestionCount})</button>
      <button className="btn ghost" onClick={advance}>{t("跳过")}</button>
    </div>
  </section>;
}
