/**
 * 回路诊断报告：智能建议引擎（advice.ts）的只读派生视图。
 * 供状态栏徽章计数与既有调用方使用；可执行修复请走 advice.ts。
 * 徽章只统计「结构问题」（与阀位/泵态无关的接线/介质错误），
 * 工况提示（泵停/阀关/出液口停流等有意状态）不干扰徽章。
 */

import type { Diagram } from "./types";
import { collectAdvice } from "./advice";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  kind: string;
  title: string;
  message: string;
  ids: string[];
}

export function diagnoseDiagram(diagram: Diagram): Diagnostic[] {
  return collectAdvice(diagram).map((a) => ({
    severity: a.severity,
    kind: a.kind,
    title: a.title,
    message: a.message,
    ids: a.elementIds,
  }));
}

export function diagnosisSummary(diagram: Diagram): { errors: number; warnings: number; infos: number } {
  const all = collectAdvice(diagram).filter((a) => a.category === "structure");
  return {
    errors: all.filter((d) => d.severity === "error").length,
    warnings: all.filter((d) => d.severity === "warning").length,
    infos: all.filter((d) => d.severity === "info").length,
  };
}
