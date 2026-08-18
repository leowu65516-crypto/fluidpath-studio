import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store } from "../store";

// 直接读取副本文件
import fs from "fs";

describe("复现打开失败", () => {
  it("加载最新水路图(可打开)_副本 应不抛错", () => {
    const P = "/Users/leo/Downloads/最新水路图(可打开)_副本.json";
    const text = fs.readFileSync(P, "utf8");
    const json = JSON.parse(text);
    render(<LangProvider><App /></LangProvider>);
    expect(() => {
      act(() => { loadDiagram(json); });
    }).not.toThrow();
    expect(store.get().diagram.nodes.length).toBe(62);
  });
});
