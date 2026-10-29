/** 命令型浮层互斥总线：except 语义与退订 */
import { describe, expect, it, vi } from "vitest";
import { emitPopupClose, onPopupClose } from "../popupBus";

describe("popupBus", () => {
  it("别人的广播会触发自关，自己的广播不触发", () => {
    const search = vi.fn();
    const off = onPopupClose("search", search);
    emitPopupClose("contextMenu");
    expect(search).toHaveBeenCalledTimes(1);
    emitPopupClose("search");
    expect(search).toHaveBeenCalledTimes(1); // except=自己 → 不关
    off();
  });

  it("退订后不再收到广播", () => {
    const cb = vi.fn();
    const off = onPopupClose("search", cb);
    off();
    emitPopupClose("contextMenu");
    expect(cb).not.toHaveBeenCalled();
  });

  it("多个持有方同时收到同一次广播", () => {
    const a = vi.fn(), b = vi.fn();
    const offA = onPopupClose("search", a);
    const offB = onPopupClose("contextMenu", b);
    emitPopupClose("search"); // 打开搜索 → 菜单关、搜索不关
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    offA(); offB();
  });
});
