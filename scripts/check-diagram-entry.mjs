/**
 * 无头验收入口：被 scripts/check-diagram.mjs 用 esbuild 打包后在 Node 运行。
 * stdin: { diagramJson, caseFilter, reportOut }
 * stdout: JSON 结果 + 可选 Markdown 报告
 */
import { buildDiagnosisReport } from "../src/report";
import { runValidationCases } from "../src/validation";
import { parseDiagramJSON } from "../src/export";
import { APP_VERSION } from "../src/version";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { diagramJson, caseFilter, reportOut } = JSON.parse(input);
  const diagram = parseDiagramJSON(diagramJson);
  let results = runValidationCases(diagram);
  if (caseFilter && caseFilter.length > 0) results = results.filter((r) => caseFilter.includes(r.name));
  const passed = results.filter((r) => r.passed).length;
  let report = null;
  if (reportOut) {
    report = buildDiagnosisReport(diagram, "zh", true).markdown;
  }
  process.stdout.write(JSON.stringify({
    diagramName: diagram.name,
    appVersion: APP_VERSION,
    total: results.length,
    passed,
    results: results.map((r) => ({ name: r.name, passed: r.passed, checked: r.checked, failures: r.failures })),
    report,
  }));
});
