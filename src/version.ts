/**
 * 应用版本与版本历史（预留结构）：
 * 每次发布时：1) 更新 APP_VERSION；2) 在 CHANGELOG 头部追加条目；
 * 3) 同步 package.json 的 version（打包文件名依赖它）。
 */
export const APP_VERSION = "1.3.0";

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
}

/** 版本历史（最新在前）。预留：后续可在「关于」面板展示。 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.3.0",
    date: "2026-08-18",
    highlights: [
      "工程化：git 初始化并提交基线；统一预设状态原语（presets.ts）",
      "关键流程 E2E 冒烟测试 + i18n 补全工况/图层/弹窗文案",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-08-18",
    highlights: [
      "工况改为清晰易懂的独立面板（记住开关/恢复）",
      "图层面板修复（下拉被裁剪）+ 选中本层/双击改名/删除归入默认层",
      "启动默认改为最简「水泵→冲泡缸→咖啡出口」",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-08-18",
    highlights: [
      "回路诊断：分层（结构/工况）、停流因果链、一键修改/确认/撤回、教学解释",
      "元件→整机功能链联动（选中元件高亮所在链）",
      "场景↔工况联动（演示步骤一键存为工况）",
      "自动保存/崩溃恢复 + 图纸版本历史（最多 5 份）",
      "十字四通接头、端口上限 8、接头延长线与进/出口可视化区分",
      "演示场景改为角色自适应（冲泡咖啡/热牛奶），删除半自动/全自动演示",
      "移除工具栏「透明」按钮",
    ],
  },
];
