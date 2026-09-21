import type { Diagram } from "../types";
import type { Lang } from "../i18n";
import type { DiagnosticSession } from "./session";
import { resolveFaultTargets, resolveHighlightGroupTargets } from "./profile";
import { APP_VERSION } from "../version";

export function downloadText(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a"); a.href = url; a.download = filename.replace(/[\\/:*?"<>|]/g, "_");
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const escape = (s: string) => s.replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
export function buildFaultReport(diagram: Diagram, session: DiagnosticSession, lang: Lang): string {
  const L = (zh: string, en: string) => lang === "zh" ? zh : en;
  const profile = diagram.settings.diagnosticProfile;
  const lines = [
    `# ${L("故障码与水路报告", "Fault code and circuit report")}`, "",
    `- ${L("图纸", "Drawing")}: ${escape(diagram.name)} (${diagram.id})`,
    `- ${L("应用版本", "App version")}: ${APP_VERSION}`,
    `- ${L("导出时间", "Exported at")}: ${new Date().toISOString()}`,
    `- ${L("代码库", "Catalog")}: ${profile?.namespace ?? "—"} / ${profile?.version ?? "—"}`,
    `- ${L("仿真时间", "Simulation time")}: ${session.nowMs} ms`, "",
    L("高亮表示关联排查范围，不证明故障根因。所有模拟值均为教学输入，未连接实机。", "Highlights indicate inspection scopes, not proven root causes. Simulation values are teaching inputs; no machine is connected."), "",
  ];
  for (const fault of profile?.diagnostics ?? []) {
    const targets = resolveFaultTargets(diagram, profile!, fault), result = session.results[fault.id];
    lines.push(`## ${escape(fault.code)} · ${escape(fault.label[lang] || fault.label.zh || fault.label.en)}`, "");
    lines.push(`- ${L("定义来源", "Definition source")}: ${fault.definitionStatus}`);
    lines.push(`- ${L("查阅选中", "Selected for lookup")}: ${session.selectedIds.includes(fault.id)}`);
    lines.push(`- ${L("教学注入", "Teaching injection")}: ${session.injectedIds.includes(fault.id)}`);
    lines.push(`- ${L("检测", "Detection")}: ${result?.detectionStatus ?? "NOT_RUN"}; ${result?.alarmState ?? "—"}; acknowledged=${result?.acknowledged ?? false}`);
    lines.push(`- ${L("目标", "Targets")}: ${[...targets.nodes, ...targets.pipes].join(", ") || "—"}`);
    lines.push(`- ${L("失效引用", "Missing references")}: ${targets.missing.join(", ") || "—"}`, "");
    for (const [index, step] of (fault.troubleshooting ?? []).entries()) {
      const stepTargets = step.highlightBinding ? resolveHighlightGroupTargets(diagram, profile!, step.highlightBinding.groupId) : { nodes: [], pipes: [], missing: [] };
      lines.push(`### ${L("排查步骤", "Troubleshooting step")} ${index + 1}: ${escape(step.label[lang] || step.label.zh || step.label.en)}`);
      if (step.instruction?.[lang] || step.instruction?.zh || step.instruction?.en) lines.push(`- ${L("动作", "Action")}: ${escape(step.instruction?.[lang] || step.instruction?.zh || step.instruction?.en || "")}`);
      lines.push(`- ${L("可疑范围", "Suspect scope")}: ${[...stepTargets.nodes, ...stepTargets.pipes].join(", ") || "—"}`);
      lines.push(`- ${L("传感器", "Signals")}: ${step.sensorIds.join(", ") || "—"}`);
      if (step.sensorNote?.[lang] || step.sensorNote?.zh || step.sensorNote?.en) lines.push(`- ${L("线索", "Clue")}: ${escape(step.sensorNote?.[lang] || step.sensorNote?.zh || step.sensorNote?.en || "")}`);
      lines.push(`- ${L("失效引用", "Missing references")}: ${stepTargets.missing.join(", ") || "—"}`, "");
    }
  }
  lines.push(`## ${L("检测定义与时序证据", "Definitions and timeline evidence")}`, "", "```json", JSON.stringify({ definitions: profile ?? null, simulation: { nowMs: session.nowMs, values: session.values, results: session.results, events: session.events } }, null, 2), "```", "");
  return lines.join("\n");
}
