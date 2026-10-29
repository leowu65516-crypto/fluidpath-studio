/**
 * 命令型浮层互斥总线：右键菜单 / 搜索 / 快捷键面板 / 快捷键设置
 * 同一时刻至多一个——打开方广播（携带自身标识），持有方听到别人的广播后自关。
 * 内容型面板（帮助/演示/诊断/工况）不参与，保持既有行为。
 */
const EVENT = "fluidpath:popup-close";

export function emitPopupClose(except?: string): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { except } }));
  } catch { /* 非 DOM 环境（测试/SSR）忽略 */ }
}

/** 订阅关闭广播；except 为自己的标识时不响应。返回退订函数。 */
export function onPopupClose(except: string, cb: () => void): () => void {
  const handler = (e: Event) => {
    if ((e as CustomEvent).detail?.except !== except) cb();
  };
  try {
    window.addEventListener(EVENT, handler);
  } catch { /* ignore */ }
  return () => window.removeEventListener(EVENT, handler);
}
