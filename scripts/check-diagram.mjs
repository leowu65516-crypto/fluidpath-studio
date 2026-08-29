#!/usr/bin/env node
/**
 * FluidPath 无头验收 CLI（P2）：
 *   node scripts/check-diagram.mjs <diagram.json> [--cases all|<name>...] [--report <out.md>]
 *
 * 用 esbuild 把引擎与验收逻辑打包为 Node 可执行 bundle 后运行，
 * 退出码 0 = 全部验收通过；1 = 存在失败；2 = 用法/IO 错误。
 * 可接入 CI 对图纸交付做回归把关。
 */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith("--"));
if (!fileArg) {
  console.error("用法: node scripts/check-diagram.mjs <diagram.json> [--cases all|<name>...] [--report <out.md>]");
  process.exit(2);
}
const caseFilter = [];
let reportOut = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--cases") {
    const v = args[++i];
    if (v && v !== "all") caseFilter.push(...v.split(",").map((s) => s.trim()).filter(Boolean));
  } else if (args[i] === "--report") {
    reportOut = args[++i];
  }
}

const diagramPath = resolve(fileArg);
let diagramJson;
try {
  diagramJson = readFileSync(diagramPath, "utf8");
} catch (err) {
  console.error(`无法读取图纸: ${err.message}`);
  process.exit(2);
}

// 生成运行时入口 bundle（引擎 + 验收 runner）
const entry = join(here, "check-diagram-entry.mjs");
const tmp = mkdtempSync(join(tmpdir(), "fluidpath-check-"));
const bundlePath = join(tmp, "engine.cjs");
await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: bundlePath,
  logLevel: "silent",
  define: { "process.env.NODE_ENV": '"production"' },
});

const res = spawnSync(process.execPath, [bundlePath], {
  input: JSON.stringify({ diagramJson, caseFilter, reportOut }),
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
rmSync(tmp, { recursive: true, force: true });
try {
  const out = JSON.parse(res.stdout);
  console.log(`图纸: ${out.diagramName}`);
  console.log(`应用版本: ${out.appVersion}`);
  console.log(`验收案例: ${out.total} 个，通过 ${out.passed} 个`);
  for (const r of out.results) {
    const mark = r.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${mark}  ${r.name}（检查 ${r.checked} 项）`);
    for (const f of r.failures) {
      console.log(`        - ${f.label}: 期望${f.expected === "flow" ? "流" : "停"}，实际${f.actual === "flow" ? "流" : "停"}`);
    }
  }
  if (out.report) {
    writeFileSync(resolve(reportOut), out.report, "utf8");
    console.log(`报告已写入: ${resolve(reportOut)}`);
  }
  process.exit(out.passed === out.total ? 0 : 1);
} catch {
  console.error("运行失败:", res.stderr || res.stdout);
  process.exit(2);
}
