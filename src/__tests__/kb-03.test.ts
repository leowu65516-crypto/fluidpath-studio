/** 故障知识库 0.3-draft：解析、版本门控、双语完整性、引用完整性 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDiagnosticProfile, EMPTY_PROFILE } from "../fault-codes/profile";
import type { DiagnosticProfile } from "../fault-codes/types";

const GOLDEN: DiagnosticProfile = JSON.parse(
  readFileSync(resolve(__dirname, "../../MILK-KB.fluidkb.json"), "utf8"),
);

const textOk = (t: unknown) => !!t && typeof t === "object" && typeof (t as { zh?: string }).zh === "string"
  && (t as { zh: string }).zh.trim().length > 0 && typeof (t as { en?: string }).en === "string"
  && (t as { en: string }).en.trim().length > 0;

describe("0.3 golden knowledge base (MILK-KB)", () => {
  const kb = parseDiagnosticProfile(structuredClone(GOLDEN));

  it("通过 0.3 解析且规模符合奶路手册", () => {
    expect(kb.version).toBe("0.3-draft");
    expect(kb.kb?.kbVersion).toBe(7);
    expect(kb.highlightGroups!.length).toBeGreaterThanOrEqual(15);
    expect(kb.symptoms!.length).toBe(9);
    expect(kb.causes!.length).toBeGreaterThanOrEqual(40);
    expect(kb.diagnostics.length).toBe(11);
    expect(kb.checkGuides!.length).toBeGreaterThanOrEqual(15);
  });

  it("全部新字段双语完整（zh+en 非空）", () => {
    for (const s of kb.symptoms!) { expect(textOk(s.label)).toBe(true); expect(textOk(s.group!)).toBe(true); }
    for (const c of kb.causes!) { expect(textOk(c.why)).toBe(true); expect(textOk(c.act)).toBe(true); }
    for (const g of kb.checkGuides!) expect(textOk(g.text)).toBe(true);
    for (const d of kb.diagnostics) expect(textOk(d.label)).toBe(true);
  });

  it("引用完整性：cause 的部件组/症状/故障码全部存在", () => {
    const groups = new Set(kb.highlightGroups!.map((g) => g.id));
    const symptoms = new Set(kb.symptoms!.map((s) => s.id));
    const codes = new Set(kb.diagnostics.map((d) => d.code));
    for (const c of kb.causes!) {
      expect(groups.has(c.partGroupId)).toBe(true);
      expect(symptoms.has(c.symptomId)).toBe(true);
      for (const code of c.codes) expect(codes.has(code)).toBe(true);
      expect([3, 2, 1]).toContain(c.pr);
      expect(["store", "svc", "both"]).toContain(c.own);
    }
    for (const g of kb.checkGuides!) expect(groups.has(g.groupId)).toBe(true);
    for (const d of kb.diagnostics) {
      for (const b of d.highlightBindings) expect(groups.has(b.groupId)).toBe(true);
    }
  });

  it("诊断矩阵覆盖度：每个症状至少有 2 条原因，每个部件至少一条症状或要点", () => {
    const bySymptom = new Map<string, number>();
    for (const c of kb.causes!) bySymptom.set(c.symptomId, (bySymptom.get(c.symptomId) ?? 0) + 1);
    for (const s of kb.symptoms!) expect(bySymptom.get(s.id) ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("0.3 parser gates", () => {
  const withVersion = (version: string) => ({ ...structuredClone(GOLDEN), version });

  it("同样内容声明为 0.2 → 拒绝（知识库字段是 0.3 门控）", () => {
    expect(() => parseDiagnosticProfile(withVersion("0.2-draft"))).toThrow(/unsupported field/);
  });

  it("pr 越界 → 拒绝", () => {
    const bad = structuredClone(GOLDEN);
    (bad.causes![0] as { pr: number }).pr = 4;
    expect(() => parseDiagnosticProfile(bad)).toThrow(/3 \(primary\)/);
  });

  it("own 非法 → 拒绝", () => {
    const bad = structuredClone(GOLDEN);
    (bad.causes![0] as { own: string }).own = "factory";
    expect(() => parseDiagnosticProfile(bad)).toThrow(/own/);
  });

  it("why 缺英文 → 拒绝（双语强制）", () => {
    const bad = structuredClone(GOLDEN);
    delete (bad.causes![0].why as { en?: string }).en;
    expect(() => parseDiagnosticProfile(bad)).toThrow(/why\.en/);
  });

  it("cause 引用未知部件组 → 拒绝", () => {
    const bad = structuredClone(GOLDEN);
    bad.causes![0].partGroupId = "part-ghost";
    expect(() => parseDiagnosticProfile(bad)).toThrow(/unknown highlight group/);
  });

  it("cause 引用未知故障码 → 拒绝", () => {
    const bad = structuredClone(GOLDEN);
    bad.causes![0].codes = ["E999"];
    expect(() => parseDiagnosticProfile(bad)).toThrow(/unknown fault code: E999/);
  });

  it("症状 ID 重复 → 拒绝", () => {
    const bad = structuredClone(GOLDEN);
    bad.symptoms![1].id = bad.symptoms![0].id;
    expect(() => parseDiagnosticProfile(bad)).toThrow(/duplicate symptom/);
  });

  it("kb.updatedAt 非日期 → 拒绝", () => {
    const bad = structuredClone(GOLDEN);
    (bad.kb as { updatedAt: string }).updatedAt = "last Tuesday";
    expect(() => parseDiagnosticProfile(bad)).toThrow(/YYYY-MM-DD/);
  });
});

describe("向后兼容", () => {
  it("0.2 空白 profile 原样解析（无知识库字段）", () => {
    const p = parseDiagnosticProfile(structuredClone(EMPTY_PROFILE));
    expect(p.version).toBe("0.2-draft");
  });

  it("0.3 允许不含知识库字段（纯 0.2 内容声明为 0.3）", () => {
    const p = parseDiagnosticProfile({ ...structuredClone(EMPTY_PROFILE), version: "0.3-draft" });
    expect(p.version).toBe("0.3-draft");
    expect(p.symptoms).toBeUndefined();
  });
});
