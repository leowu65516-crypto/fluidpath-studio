import type { SmartOptionValue } from "./types";

export interface SmartTextIntent {
  templateId: "water" | "coffee" | "milk" | "steam" | "full" | null;
  options: Record<string, SmartOptionValue>;
  understood: string[];
  unknown: string[];
}

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

/**
 * 咖啡机领域的自由文本解析：不做模型调用，用小词典把常见描述映射到模板/选项。
 * 未命中的词进入 unknown，由 UI 提示“我还没听懂这部分”，而不是静默猜测。
 */
export function parseSmartText(raw: string): SmartTextIntent {
  const text = raw.trim().toLowerCase();
  const understood: string[] = [];
  const unknown: string[] = [];
  const options: Record<string, SmartOptionValue> = {};
  if (!text) return { templateId: null, options, understood, unknown };

  const milk = has(text, ["奶", "牛奶", "milk", "奶路", "奶泡", "奶沫"]);
  const coffee = has(text, ["咖啡", "冲泡", "coffee", "brew", "espresso"]);
  const steam = has(text, ["蒸汽", "steam", "蒸汽杆"]);
  const cleaning = has(text, ["清洗", "clean", "cleaning"]);
  const drain = has(text, ["排废", "排水", "drain", "waste"]);
  const water = has(text, ["水", "水路", "water", "锅炉", "boiler", "泵", "pump"]);
  const full = has(text, ["整机", "全自动", "双锅炉", "咖啡机", "full", "combo", "dual boiler"]);
  const doubleTank = has(text, ["双奶罐", "两个奶罐", "two tanks", "dual tank", "2 tanks"]);

  if (milk) understood.push("奶路");
  if (coffee) understood.push("咖啡冲泡");
  if (steam) understood.push("蒸汽");
  if (cleaning) understood.push("清洗");
  if (drain) understood.push("排废");
  if (water) understood.push("水路");
  if (full) understood.push("整机");
  if (doubleTank) understood.push("双奶罐");

  if (doubleTank) options.doubleTank = true;
  if (steam) options.steam = true;

  let templateId: SmartTextIntent["templateId"] = null;
  const noSteam = has(text, ["无蒸汽", "不要蒸汽", "不带蒸汽", "no steam"]);
  const singleTank = has(text, ["单奶罐", "一个奶罐", "single tank", "one tank"]);
  if (noSteam) options.steam = false;
  if (singleTank) options.doubleTank = false;

  if (full || (milk && coffee) || (coffee && steam && !milk)) templateId = "full";
  else if (milk) templateId = "milk";
  else if (coffee) templateId = "coffee";
  else if (steam) templateId = "steam";
  else if (water) templateId = "water";

  // 不做“残词”猜未知：中文分词很容易把“咖啡机”拆成“机”误报。
  // 只有完全没识别出场景时，UI 才提示用户从模板卡里选一个。
  return { templateId, options, understood, unknown };
}

export function parseBlockText(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  if (has(text, ["奶", "牛奶", "milk", "奶路"])) return "milk-line";
  if (has(text, ["蒸汽", "steam", "蒸汽杆"])) return "steam-wand";
  if (has(text, ["清洗", "clean", "cleaning", "旁通"])) return "cleaning-bypass";
  if (has(text, ["排废", "排水", "drain", "waste"])) return "drain";
  return null;
}
