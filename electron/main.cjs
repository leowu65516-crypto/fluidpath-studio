const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// 允许 PDF 导出等弹窗
const isMac = process.platform === "darwin";

// macOS 双击 .json 打开时，open-file 事件可能在窗口创建前触发，先缓存路径
let pendingFilePath = null;

function sendOpenFile(win, filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    win.webContents.send("open-file", { path: filePath, content });
  } catch (err) {
    dialog.showErrorBox("打开失败", "无法读取文件：\n" + err.message);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    title: "FluidPath Studio — 液路动态示意图编辑器",
    backgroundColor: "#e8edf3",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 防止外部导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    // PDF 导出会 window.open 一个打印页（about:blank）→ 允许同源 file 弹窗与空白打印页
    if (url.startsWith("file:") || url === "about:blank" || url === "") {
      return { action: "allow" };
    }
    // 其他外部链接交给系统浏览器
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 加载构建产物：main.cjs 位于 electron/ 下，dist/ 与 electron/ 平级
  // （开发模式为 <项目根>/dist，打包后为 app.asar/dist）
  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  win.loadFile(indexPath).catch((err) => {
    dialog.showErrorBox("加载失败", "请先运行 npm run build 构建前端资源。\n\n" + err.message);
  });

  win.webContents.on("will-navigate", (e, url) => {
    // 阻止导航到外部页面（允许 PDF 打印页的 about:blank）
    if (!url.startsWith("file:") && url !== "about:blank") {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // 打开外部链接用系统浏览器（如 a[download] 等）
  win.webContents.on("new-window", (e, url) => {
    e.preventDefault();
    shell.openExternal(url);
  });

  return win;
}

ipcMain.handle("write-autosave-copy", async (_event, { sourcePath, json }) => {
  if (typeof sourcePath !== "string" || !sourcePath.endsWith(".json") || typeof json !== "string") {
    throw new Error("自动保存需要先打开一个 JSON 图纸");
  }
  const parsed = path.parse(sourcePath);
  const target = path.join(parsed.dir, `${parsed.name}.autosave.json`);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, json, "utf8");
  fs.renameSync(temp, target);
  return { path: target };
});

app.whenReady().then(() => {
  const win = createWindow();

  // 窗口就绪后，若有待打开的工程文件则加载
  if (pendingFilePath) {
    const filePath = pendingFilePath;
    pendingFilePath = null;
    win.webContents.once("did-finish-load", () => sendOpenFile(win, filePath));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});

// macOS 打开文件（.json 工程文件）
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.webContents.isLoading()) {
    sendOpenFile(win, filePath);
  } else {
    pendingFilePath = filePath;
  }
});
