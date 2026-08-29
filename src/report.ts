/**
 * 诊断/验收 Markdown 报告生成与下载：
 * - 图纸名、应用版本、导出时间、图纸规模
 * - 摘要（结构问题 / 工况提示 / 验收通过率）
 * - 结构问题与工况提示明细（严重度、类别、标题、说明）
 * - 出液口停流因果链（根因 → 该管）
 * - 出口状态与泵/锅炉状态
 * - 验收 pass/fail 与失败管段表
 *
 * 纯数据生成（buildXxxReport）与触发下载（exportXxxReport）分离，便于测试。
 */

import type { Diagram } from "./types";
import type { Lang } from "./i18n";
import { collectAdvice } from "./advice";
import { runValidationCases, type ValidationResult } from "./validation";
import { pipeEngineeringDisabled } from "./geometry";
import { APP_VERSION } from "./version";

const L = (lang: Lang, zh: string, en: string): string => (lang === "zh" ? zh : en);

function severityTag(sev: string, lang: Lang): string {
  if (sev === "error") return L(lang, "⛔ 错误", "⛔ Error");
  if (sev === "warning") return L(lang, "⚠️ 警告", "⚠️ Warning");
  return L(lang, "💡 提示", "💡 Info");
}

function fmtn(n: number): string {
  return String(n);
}

/** 出口类型清单（与 advice.ts 保持一致） */
const OUTLET_TYPES = new Set(["coffeeOutlet", "milkOutlet", "hotWaterOutlet", "steamWand", "hotWaterWand", "groupHead"]);

export interface ReportBuild {
  markdown: string;
  validationResults: ValidationResult[] | null;
}

/** 生成完整诊断+验收 Markdown 报告（不触发下载） */
export function buildDiagnosisReport(diagram: Diagram, lang: Lang = "zh", includeValidation = true): ReportBuild {
  const advices = collectAdvice(diagram, undefined, lang);
  const structure = advices.filter((a) => a.category === "structure");
  const state = advices.filter((a) => a.category === "state");
  const stalled = state.filter((a) => a.kind === "outlet-stalled" && a.cause);

  const errs = structure.filter((a) => a.severity === "error").length;
  const warns = structure.filter((a) => a.severity === "warning").length;
  const infos = structure.filter((a) => a.severity === "info").length;

  // 出口状态
  const outlets = diagram.nodes
    .filter((n) => OUTLET_TYPES.has(n.type))
    .map((n) => {
      const inP = diagram.pipes.find((p) => p.toPortId && n.ports.some((pt) => pt.id === p.toPortId));
      return {
        label: n.label || n.type,
        flowing: !!inP && !pipeEngineeringDisabled(inP, diagram.nodes),
      };
    });

  // 泵/锅炉
  const pumps = diagram.nodes.filter((n) => n.type === "pump" || n.type === "milkPump" || n.type === "airPump");
  const boilers = diagram.nodes.filter((n) => n.type === "hotWaterBoiler" || n.type === "steamBoiler");

  // 验收
  const validationResults = includeValidation ? runValidationCases(diagram) : null;
  const vPass = validationResults?.filter((r) => r.passed).length ?? 0;
  const vTotal = validationResults?.length ?? 0;

  const lines: string[] = [];
  const zh = lang === "zh";

  lines.push(`# ${L(lang, "FluidPath 诊断报告", "FluidPath Diagnosis Report")} · ${diagram.name || L(lang, "未命名图纸", "Untitled")}`);
  lines.push("");
  lines.push(`- ${L(lang, "应用版本", "App version")}: ${APP_VERSION}`);
  lines.push(`- ${L(lang, "导出时间", "Exported at")}: ${new Date().toLocaleString(zh ? "zh-CN" : "en-US")}`);
  lines.push(`- ${L(lang, "图纸规模", "Size")}: ${fmtn(diagram.nodes.length)} ${L(lang, "节点", "nodes")} · ${fmtn(diagram.pipes.length)} ${L(lang, "管路", "pipes")}`);
  lines.push("");

  lines.push(`## ${L(lang, "摘要", "Summary")}`);
  lines.push("");
  lines.push(`- ${L(lang, "结构问题", "Structure issues")}: ${fmtn(structure.length)}（${L(lang, "错误", "errors")} ${errs} / ${L(lang, "警告", "warnings")} ${warns} / ${L(lang, "提示", "infos")} ${infos}）`);
  lines.push(`- ${L(lang, "工况提示", "State notices")}: ${fmtn(state.length)}`);
  if (includeValidation) {
    lines.push(`- ${L(lang, "验收", "Validation")}: ${vPass}/${vTotal} ${L(lang, "通过", "passed")}`);
  }
  lines.push("");

  // 结构问题
  lines.push(`## ${L(lang, "结构问题", "Structure issues")}`);
  lines.push("");
  if (structure.length === 0) {
    lines.push(L(lang, "无。", "None."));
  } else {
    lines.push(`| # | ${L(lang, "严重度", "Severity")} | ${L(lang, "类别", "Kind")} | ${L(lang, "标题", "Title")} | ${L(lang, "说明", "Detail")} |`);
    lines.push("|---|---|---|---|---|");
    structure.forEach((a, i) => {
      lines.push(`| ${i + 1} | ${severityTag(a.severity, lang)} | ${a.kind} | ${a.title.split("|").join("\\|")} | ${a.message.split("|").join("\\|")} |`);
    });
  }
  lines.push("");

  // 工况提示
  lines.push(`## ${L(lang, "工况提示", "State notices")}`);
  lines.push("");
  if (state.length === 0) {
    lines.push(L(lang, "无。", "None."));
  } else {
    lines.push(`| # | ${L(lang, "严重度", "Severity")} | ${L(lang, "类别", "Kind")} | ${L(lang, "标题", "Title")} | ${L(lang, "说明", "Detail")} |`);
    lines.push("|---|---|---|---|---|");
    state.forEach((a, i) => {
      lines.push(`| ${i + 1} | ${severityTag(a.severity, lang)} | ${a.kind} | ${a.title.split("|").join("\\|")} | ${a.message.split("|").join("\\|")} |`);
    });
  }
  lines.push("");

  // 停流因果链
  if (stalled.length > 0) {
    lines.push(`## ${L(lang, "停流因果链（出液口）", "Stop-flow causal chains (outlets)")}`);
    lines.push("");
    for (const a of stalled) {
      if (!a.cause) continue;
      const chainIds = a.cause.ids;
      const nameOf = (id: string) => {
        const n = diagram.nodes.find((nn) => nn.id === id);
        if (n) return `${n.label || n.type} (${n.type})`;
        const p = diagram.pipes.find((pp) => pp.id === id);
        if (p) return L(lang, `管路「${p.label || p.id}」`, `pipe "${p.label || p.id}"`);
        return id;
      };
      lines.push(`- ${a.message}`);
      lines.push(`  - ${L(lang, "根因", "Root cause")}: ${nameOf(chainIds[0])}`);
      lines.push(`  - ${L(lang, "因果链", "Chain")}: ${chainIds.map(nameOf).join(" → ")}`);
    }
    lines.push("");
  }

  // 出口状态
  if (outlets.length > 0) {
    lines.push(`## ${L(lang, "出口状态", "Outlet status")}`);
    lines.push("");
    lines.push(`| ${L(lang, "出口", "Outlet")} | ${L(lang, "状态", "Status")} |`);
    lines.push("|---|---|");
    for (const o of outlets) {
      lines.push(`| ${o.label.split("|").join("\\|")} | ${o.flowing ? `✅ ${L(lang, "流动", "Flowing")}` : `⛔ ${L(lang, "停流", "Stopped")}`} |`);
    }
    lines.push("");
  }

  // 泵/锅炉
  if (pumps.length + boilers.length > 0) {
    lines.push(`## ${L(lang, "动力与锅炉", "Pumps & boilers")}`);
    lines.push("");
    lines.push(`| ${L(lang, "元件", "Component")} | ${L(lang, "状态", "Status")} |`);
    lines.push("|---|---|");
    for (const p of pumps) {
      const st = p.fault
        ? `⚠️ ${L(lang, "故障", "Fault")}`
        : p.pumpOn !== false
          ? `✅ ${L(lang, "运行", "Running")}`
          : `⛔ ${L(lang, "停止", "Stopped")}`;
      lines.push(`| ${(p.label || p.type).split("|").join("\\|")} | ${st} |`);
    }
    for (const b of boilers) {
      lines.push(`| ${(b.label || b.type).split("|").join("\\|")} | 🔥 ${b.type === "steamBoiler" ? L(lang, "蒸汽", "Steam") : L(lang, "热水", "Hot water")} |`);
    }
    lines.push("");
  }

  // 验收
  if (includeValidation) {
    lines.push(`## ${L(lang, "验收结果", "Validation results")}`);
    lines.push("");
    if (!validationResults || validationResults.length === 0) {
      lines.push(L(lang, "本图纸未定义验收案例。", "No validation cases defined for this drawing."));
    } else {
      for (const r of validationResults) {
        lines.push(`### ${r.name} — ${r.passed ? `✅ ${L(lang, "通过", "PASS")}` : `❌ ${L(lang, "失败", "FAIL")}`}（${r.checked} ${L(lang, "项", "checks")}）`);
        lines.push("");
        if (!r.passed && r.failures.length > 0) {
          lines.push(`| ${L(lang, "管路", "Pipe")} | ${L(lang, "期望", "Expected")} | ${L(lang, "实际", "Actual")} |`);
          lines.push("|---|---|---|");
          for (const f of r.failures) {
            const exp = f.expected === "flow" ? L(lang, "流动", "flow") : L(lang, "停流", "stop");
            const act = f.actual === "flow" ? L(lang, "流动", "flow") : L(lang, "停流", "stop");
            lines.push(`| ${f.label.split("|").join("\\|")} | ${exp} | ${act} |`);
          }
        }
        lines.push("");
      }
    }
  }

  lines.push("---");
  lines.push(`*${L(lang, "由 FluidPath Studio 自动生成", "Generated automatically by FluidPath Studio")}*`);

  return { markdown: lines.join("\n"), validationResults };
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function safeName(name: string): string {
  return (name || "fluidpath-report").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
}

/** 生成并下载诊断报告（浏览器 Blob 下载；桌面版同样适用） */
export function exportDiagnosisReport(diagram: Diagram, lang: Lang = "zh", includeValidation = true): string {
  const { markdown } = buildDiagnosisReport(diagram, lang, includeValidation);
  const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const filename = `${safeName(diagram.name)}-report-${ts}.md`;
  download(filename, markdown);
  return filename;
}
