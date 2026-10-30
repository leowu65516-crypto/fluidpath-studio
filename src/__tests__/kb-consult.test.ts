/** 知识库咨询层：纯函数分档/反查 + 面板与画布联动渲染 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDiagnosticProfile } from "../fault-codes/profile";
import { suspectsForSymptom, strongestCauseForCode } from "../fault-codes/consult";
import { selectKbSymptom, selectKbPart, resetDiagnosticSession, diagnosticSession } from "../fault-codes/session";
import type { DiagnosticProfile } from "../fault-codes/types";

const GOLDEN: DiagnosticProfile = parseDiagnosticProfile(
  JSON.parse(readFileSync(resolve(__dirname, "../../MILK-KB.fluidkb.json"), "utf8")),
);

describe("suspectsForSymptom", () => {
  it("按 pr 降序分档，同组多条合并取最高 pr", () => {
    const s = suspectsForSymptom(GOLDEN, "nomilk"); // 不出奶
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s[0].pr).toBe(3);
    const ids = s.map(x => x.groupId);
    expect(new Set(ids).size).toBe(ids.length); // 组唯一
    for (let i = 1; i < s.length; i++) expect(s[i].pr).toBeLessThanOrEqual(s[i - 1].pr);
  });

  it("未知症状返回空", () => {
    expect(suspectsForSymptom(GOLDEN, "nope")).toEqual([]);
  });

  it("奶温偏高症状的首要嫌疑含奶管/奶箱（手册口径）", () => {
    const s = suspectsForSymptom(GOLDEN, "th");
    const top = s.filter(x => x.pr === 3).map(x => x.groupId);
    expect(top).toContain("part-hose");
    expect(top).toContain("part-tank");
  });
});

describe("strongestCauseForCode", () => {
  it("取引用该码的最高 pr 原因（E045 → 奶泵/报警类）", () => {
    const r = strongestCauseForCode(GOLDEN, "E045")!;
    expect([3, 2, 1]).toContain((GOLDEN.causes ?? []).find(c => c.partGroupId === r.groupId && c.symptomId === r.symptomId)!.pr);
    expect(r.symptomId).toBeTruthy();
  });

  it("无原因条目的码退化到 inspectionScope 绑定组", () => {
    const r = strongestCauseForCode(GOLDEN, "E038")!;
    expect(r.groupId).toBe("part-selv");
  });

  it("未知码返回 null", () => {
    expect(strongestCauseForCode(GOLDEN, "E999")).toBeNull();
  });
});

describe("session kb consult state", () => {
  it("选择症状清空部件、选择部件保留症状；状态字段可读", () => {
    resetDiagnosticSession();
    selectKbSymptom("nomilk");
    selectKbPart("part-pump");
    expect(diagnosticSession.get().kbSymptomId).toBe("nomilk");
    expect(diagnosticSession.get().kbPartGroupId).toBe("part-pump");
    selectKbSymptom(null);
    expect(diagnosticSession.get().kbSymptomId).toBeNull();
    expect(diagnosticSession.get().kbPartGroupId).toBeNull(); // 换症状清空部件
    resetDiagnosticSession();
  });
});
