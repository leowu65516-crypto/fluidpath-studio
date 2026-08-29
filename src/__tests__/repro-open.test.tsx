import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store } from "../store";

// 直接读取副本文件
import fs from "fs";

// 本机调试用测试：依赖个人 Downloads 文件，缺失时自动跳过
const LOCAL_JSON = "/Users/leo/Downloads/最新水路图(可打开)_副本.json";
const hasLocal = fs.existsSync(LOCAL_JSON);
const d = it.skipIf(!hasLocal);

describe("复现打开失败", () => {
  d("加载最新水路图(可打开)_副本 应不抛错", () => {
    const P = LOCAL_JSON;
    const text = fs.readFileSync(P, "utf8");
    const json = JSON.parse(text);
    render(<LangProvider><App /></LangProvider>);
    expect(() => {
      act(() => { loadDiagram(json); });
    }).not.toThrow();
    expect(store.get().diagram.nodes.length).toBe(62);
  });
});
