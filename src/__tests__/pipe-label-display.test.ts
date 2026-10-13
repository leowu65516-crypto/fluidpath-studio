/**
 * 管路中段标签显示开关（编辑状态可视化，v1.30.5）：
 * 编号（管路xx / Pipe xx）与管径（DNxx）可分别开关；两者都关时不渲染标签。
 */
import { describe, it, expect } from "vitest";
import { composePipeMidLabel } from "../components/PipeView";

describe("composePipeMidLabel（管路中段标签组合）", () => {
  it("默认：编号 · 管径", () => {
    expect(composePipeMidLabel("管路 12", "DN25", true, true, "zh")).toBe("管路 12 · DN25");
  });

  it("关闭管径：只显示编号", () => {
    expect(composePipeMidLabel("管路 12", "DN25", true, false, "zh")).toBe("管路 12");
  });

  it("关闭编号：只显示管径", () => {
    expect(composePipeMidLabel("管路 12", "DN25", false, true, "zh")).toBe("DN25");
  });

  it("两者都关：空串（不渲染标签）", () => {
    expect(composePipeMidLabel("管路 12", "DN25", false, false, "zh")).toBe("");
  });

  it("无管径数据时编号单独显示；英文界面默认名转 Pipe N", () => {
    expect(composePipeMidLabel("管路 7", undefined, true, true, "zh")).toBe("管路 7");
    expect(composePipeMidLabel("管路 7", "DN32", true, true, "en")).toBe("Pipe 7 · DN32");
  });

  it("自定义管路名不受英文转换影响", () => {
    expect(composePipeMidLabel("主咖啡管", "DN25", true, true, "en")).toBe("主咖啡管 · DN25");
  });
});
