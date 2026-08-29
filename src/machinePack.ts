/**
 * 机型包（MachinePack）：把「图纸 + 场景可用性 + 验收案例 + 元数据」一次打包，
 * 导入即恢复完整教学/验收工作现场。
 *
 * 格式：
 * {
 *   format: "fluidpath-machine-pack",
 *   version: 1,
 *   meta: { id, title, description?, appVersion, createdAt },
 *   diagram: Diagram,          // 完整工程图纸（含 settings.validationCases / workConditions）
 *   docs?: string              // Markdown 说明（预留课程包）
 * }
 *
 * 场景（scenarios.ts）按图纸标签/类型自适应解析，无需打包进文件；
 * 验收案例随 diagram.settings.validationCases 持久化。
 */

import type { Diagram } from "./types";
import { APP_VERSION } from "./version";
import { parseDiagramJSON } from "./export";
import { uid } from "./types";

export const MACHINE_PACK_FORMAT = "fluidpath-machine-pack";
export const MACHINE_PACK_VERSION = 1;

export interface MachinePackMeta {
  id: string;
  title: string;
  description?: string;
  appVersion: string;
  createdAt: string;
}

export interface MachinePack {
  format: string;
  version: number;
  meta: MachinePackMeta;
  diagram: Diagram;
  docs?: string;
}

export function buildMachinePack(diagram: Diagram, meta?: Partial<MachinePackMeta>, docs?: string): MachinePack {
  return {
    format: MACHINE_PACK_FORMAT,
    version: MACHINE_PACK_VERSION,
    meta: {
      id: meta?.id ?? `pack_${uid("m")}`,
      title: meta?.title ?? diagram.name ?? "Untitled machine",
      description: meta?.description,
      appVersion: APP_VERSION,
      createdAt: meta?.createdAt ?? new Date().toISOString(),
    },
    diagram,
    docs,
  };
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function safeName(name: string): string {
  return (name || "machine-pack").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
}

/** 生成并下载机型包 JSON */
export function exportMachinePack(diagram: Diagram, meta?: Partial<MachinePackMeta>, docs?: string): string {
  const pack = buildMachinePack(diagram, meta, docs);
  const filename = `${safeName(pack.meta.title)}.fluidpack.json`;
  download(filename, JSON.stringify(pack, null, 2));
  return filename;
}

/**
 * 解析机型包 JSON；不合法时抛出可理解的错误信息。
 */
export function parseMachinePack(text: string): MachinePack {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("不是有效的机型包文件：JSON 解析失败");
  }
  if (!raw || typeof raw !== "object") throw new Error("不是有效的机型包文件：内容为空");
  const obj = raw as Record<string, unknown>;
  if (obj.format !== MACHINE_PACK_FORMAT) {
    throw new Error('不是有效的机型包文件：缺少 format: "fluidpath-machine-pack" 标识（普通工程 JSON 请用「打开 JSON」）');
  }
  if (typeof obj.version !== "number" || obj.version > MACHINE_PACK_VERSION) {
    throw new Error(`机型包版本过新（v${obj.version}），请升级 FluidPath Studio（当前支持 v${MACHINE_PACK_VERSION}）`);
  }
  const diagramRaw = obj.diagram;
  if (!diagramRaw || typeof diagramRaw !== "object") {
    throw new Error("机型包缺少 diagram 字段");
  }
  const diagram = parseDiagramJSON(JSON.stringify(diagramRaw));
  const metaRaw = (obj.meta ?? {}) as Partial<MachinePackMeta>;
  return {
    format: MACHINE_PACK_FORMAT,
    version: MACHINE_PACK_VERSION,
    meta: {
      id: typeof metaRaw.id === "string" ? metaRaw.id : `pack_${uid("m")}`,
      title: typeof metaRaw.title === "string" ? metaRaw.title : diagram.name || "Untitled machine",
      description: typeof metaRaw.description === "string" ? metaRaw.description : undefined,
      appVersion: typeof metaRaw.appVersion === "string" ? metaRaw.appVersion : APP_VERSION,
      createdAt: typeof metaRaw.createdAt === "string" ? metaRaw.createdAt : new Date().toISOString(),
    },
    diagram,
    docs: typeof obj.docs === "string" ? obj.docs : undefined,
  };
}
