/**
 * 网页版访问密码门（仅防路人/误点链接；public 仓库下密码在源码可见，属已知限制，
 * 见 FluidPath-交接文档 §9.3）。Electron 桌面与测试环境不启用。
 */
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
