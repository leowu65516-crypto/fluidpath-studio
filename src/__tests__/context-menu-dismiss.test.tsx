/** 右键菜单：Escape 全局关闭 + 收到互斥广播自关（别人的广播才关） */
import { describe, expect, it, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { ContextMenu } from "../components/ContextMenu";
import { emitPopupClose } from "../popupBus";

/** 菜单监听器延时一帧挂载（避开右键自身事件）；用例先等挂载完成再发事件 */
async function mount() {
  const spy = vi.fn();
  render(createElement(ContextMenu, { x: 10, y: 10, items: [{ label: "Fit" }], onClose: spy }));
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  return spy;
}

function fireKey(key: string) {
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key })); });
}

describe("ContextMenu dismissal", () => {
  it("Escape 关闭", async () => {
    const onClose = await mount();
    fireKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("普通按键不关闭", async () => {
    const onClose = await mount();
    fireKey("a");
    expect(onClose).not.toHaveBeenCalled();
    cleanup();
  });

  it("收到其他浮层的关闭广播时自关（互斥），自己的广播不响应", async () => {
    const onClose = await mount();
    act(() => { emitPopupClose("search"); }); // 搜索打开 → 菜单自关
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => { emitPopupClose("contextMenu"); }); // 菜单自己打开的广播 → 不动
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
