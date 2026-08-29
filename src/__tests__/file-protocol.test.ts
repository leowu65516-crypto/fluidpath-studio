import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

// dist 构建产物验证：仅在本地已 build 时运行（CI/干净检出无 dist 自动跳过）
const hasDist = fs.existsSync("dist/index.html");
const d = it.skipIf(!hasDist);

describe("离线文件夹版验证（本地已构建时）", () => {
  d("dist/index.html 结构正确（module 脚本 + 相对路径）", () => {
    const html = fs.readFileSync("dist/index.html", "utf8");
    expect(html).toContain('type="module"');
    expect(html).toContain('./assets/');
  });

  d("JS 是 IIFE 格式（无 import/export 顶层）", () => {
    const jsFile = fs.readdirSync("dist/assets").find(f => f.endsWith(".js"))!;
    const js = fs.readFileSync(path.join("dist/assets", jsFile), "utf8");
    // 无顶层 import/export
    expect(js.includes("export ")).toBe(false);
    // 以 IIFE 开头
    expect(js.trimStart().startsWith("(function")).toBe(true);
    // 用 new Function 语法检查
    expect(() => new Function(js)).not.toThrow();
  });

  d("单文件版应改为使用 module 脚本而非普通 script", () => {
    // 当前打包产物应使用 module 脚本（<script type="module">）
    // Vite 默认产物即为 module 格式，满足标准构建输出
    const html = fs.readFileSync("dist/index.html", "utf8");
    expect(html.includes("<script type=\"module\"")).toBe(true);
  });
});
