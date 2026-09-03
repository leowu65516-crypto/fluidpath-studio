/**
 * 网页版访问密码门（仅防路人/误点链接；public 仓库下算法在源码可见，属已知限制，
 * 见 FluidPath-交接文档 §9.3）。Electron 桌面与测试环境不启用。
 *
 * v1.24：改为「当日动态密码」——六位 = 反转的两位年 + 反转的两位月 + 反转的两位日。
 * 例：2026-06-20 → 626002；2027-10-21 → 720112。按浏览器本地时区计算，跨零点自动更换。
 */

/** 当日动态密码：yy/MM/dd 各两位数字反转后拼接（如 2026-06-20 → 626002） */
export function dailyPassword(now: Date = new Date()): string {
  const rev = (x: string) => x.split("").reverse().join("");
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return rev(yy) + rev(mm) + rev(dd);
}

/** 旧固定密码（已不再用于校验，仅为兼容保留的说明性常量） */
export const GATE_PASSWORD = "800866";
export const GATE_KEY = "fluidpath.gate.v1";

export function shouldGate(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (location.protocol === "file:") return false; // Electron 桌面不启用
    if (process.env.NODE_ENV === "test") return false; // 测试环境跳过
    return true;
  } catch {
    return false;
  }
}

export function gateAuthed(): boolean {
  try {
    return sessionStorage.getItem(GATE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setGateAuthed(): void {
  try {
    sessionStorage.setItem(GATE_KEY, "1");
  } catch {
    /* ignore */
  }
}
