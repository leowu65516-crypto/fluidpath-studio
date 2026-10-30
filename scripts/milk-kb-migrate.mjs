// 一次性迁移脚本：从 V2 交互 HTML 提取奶路故障知识库 → MILK-KB.fluidkb.json（用完即删）
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("/Users/leo/Documents/HTML工具/可视化工具/CAYE Milk System Panel 奶泵系统交互_V2.html", "utf8");

function extractConst(name, terminator = "];") {
  const start = html.indexOf(`const ${name} =`) >= 0 ? html.indexOf(`const ${name} =`) : html.indexOf(`const ${name} =`.replace(" =", "="));
  if (start < 0) throw new Error(`const ${name} not found`);
  const bodyStart = html.indexOf(html.slice(start, start + 40).includes("={") ? "{" : "[", start);
  const end = html.indexOf(terminator, bodyStart);
  if (end < 0) throw new Error(`${name} terminator not found`);
  // 返回完整 const 声明：裸字面量相邻会触发 ASI 成员访问歧义
  return `const ${name} = ${html.slice(bodyStart, end + 1)};`;
}

const sandbox = new Function(`
  ${extractConst("PARTS")}
  ${extractConst("SYMPTOMS")}
  ${extractConst("CAUSES")}
  ${extractConst("MILK_CODES")}
  ${extractConst("CHECK_GUIDE", "};")}
  ${extractConst("CODE_PART_FALLBACK", "};")}
  return { PARTS, SYMPTOMS, CAUSES, MILK_CODES, CHECK_GUIDE, CODE_PART_FALLBACK };
`)();

const { PARTS, SYMPTOMS, CAUSES, MILK_CODES, CHECK_GUIDE, CODE_PART_FALLBACK } = sandbox;

// CAUSES 还引用非实体件的手册诊断类别与设置项，补为部件组
const EXTRA_GROUPS = [
  { id: "recipe", zh: "配方与软件设置", en: "Recipe & settings" },
  { id: "module", zh: "奶泵模组（整体）", en: "Milk-pump module (assembly)" },
  { id: "harness", zh: "线束与接插件", en: "Harness & connectors" },
  { id: "alarm", zh: "报警处置", en: "Alarm handling" },
  { id: "cleanValve", zh: "牛奶清洗电磁阀", en: "Milk cleaning valve" },
  { id: "tempComp", zh: "温度补偿设置", en: "Temperature compensation" },
  { id: "cupRest", zh: "杯台与出奶口", en: "Cup rest & spout" },
];
const EXTRA_IDS = new Set(EXTRA_GROUPS.map((g) => g.id));

// 故障码 → 部件：V2 的反查逻辑（CAUSES 最高优先 → PARTS.codes → 固定兜底）
function partForCode(code) {
  const c = CAUSES.filter((x) => (x.codes || []).includes(code)).sort((a, b) => b.pr - a.pr)[0];
  if (c) return `part-${c.p}`;
  const p = PARTS.find((x) => (x.codes || []).includes(code));
  if (p) return `part-${p.id}`;
  return CODE_PART_FALLBACK[code] ? `part-${CODE_PART_FALLBACK[code]}` : null;
}

const kb = {
  format: "fluidpath.diagnostic-profile",
  version: "0.4-draft",
  namespace: "caye.milk",
  source: { kind: "userDeclared", appliesToRealMachine: true },
  kb: {
    kbVersion: 7,
    source: {
      zh: "CAYE_咖啡机故障对策速查手册_V7（奶泵模组 F28/F30/F31/F32）+《维修手册》第 3 章 牛奶模组",
      en: "CAYE Fault Countermeasure Handbook V7 (milk module F28/F30/F31/F32) + Service Manual ch.3 (milk module)",
    },
    updatedAt: "2026-10-30",
  },
  signalDefinitions: [],
  highlightGroups: [
    ...PARTS.filter((p) => !p.noTrouble).map((p) => ({
      id: `part-${p.id}`,
      label: { zh: `${p.n}. ${p.zh}`, en: `${p.n}. ${p.en}` },
      resolution: "explicit",
      nodeIds: [],
      pipeIds: [],
    })),
    ...EXTRA_GROUPS.map((g) => ({
      id: `part-${g.id}`,
      label: { zh: g.zh, en: g.en },
      resolution: "explicit",
      nodeIds: [],
      pipeIds: [],
    })),
  ],
  diagnostics: MILK_CODES.map((c) => ({
    id: `code-${c.c}`,
    code: c.c,
    label: { zh: c.zh, en: c.en },
    definitionStatus: "userDeclared",
    highlightBindings: [{ groupId: partForCode(c.c), meaning: "inspectionScope" }],
    presentation: { style: "outline", color: c.hot ? "#d97706" : "#64748b", animation: "none" },
    controlActions: [],
    rootCauseStatus: "notDetermined",
  })),
  symptoms: SYMPTOMS.map((s) => ({
    id: s.id,
    label: { zh: s.zh, en: s.en },
    group: { zh: s.zhGrp, en: s.enGrp },
  })),
  causes: CAUSES.map((c, i) => ({
    id: `cause-${c.p}-${c.s}-${i}`,
    partGroupId: `part-${c.p}`,
    symptomId: c.s,
    pr: c.pr,
    own: c.own,
    codes: c.codes || [],
    why: { zh: c.zh, en: c.en },
    act: { zh: c.az, en: c.ae },
  })),
  checkGuides: Object.entries(CHECK_GUIDE).map(([pid, g]) => ({
    groupId: `part-${pid}`,
    text: { zh: g.zh, en: g.en },
  })),
};

writeFileSync("/Users/leo/Documents/Fluidpath studio/MILK-KB.fluidkb.json", JSON.stringify(kb, null, 2) + "\n");
console.log(`parts=${kb.highlightGroups.length} symptoms=${kb.symptoms.length} causes=${kb.causes.length} codes=${kb.diagnostics.length} guides=${kb.checkGuides.length}`);
const unmapped = kb.diagnostics.filter((d) => !d.highlightBindings[0].groupId || d.highlightBindings[0].groupId === "part-null");
if (unmapped.length) console.log("UNMAPPED CODES:", unmapped.map((d) => d.code));
