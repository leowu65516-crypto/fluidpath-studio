// 桌面多窗口冒烟：窗口 A 写系统剪贴板 -> 新建窗口 B -> B 读回同一载荷。
const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

require(path.join(__dirname, "..", "electron", "main.cjs"));

function waitFor(check, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = check();
      if (value) { clearInterval(timer); resolve(value); }
      else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error("timeout")); }
    }, 80);
  });
}

function close(code) {
  if (globalThis.originalShowSaveDialog) dialog.showSaveDialog = globalThis.originalShowSaveDialog;
  if (globalThis.savePath && fs.existsSync(globalThis.savePath)) fs.unlinkSync(globalThis.savePath);
  for (const win of BrowserWindow.getAllWindows()) win.destroy();
  app.exit(code);
}

app.whenReady().then(async () => {
  try {
    const windowA = await waitFor(() => BrowserWindow.getAllWindows()[0]);
    await windowA.webContents.executeJavaScript("document.querySelector('.main-canvas') !== null");
    const payload = JSON.stringify({ kind: "fluidpath-selection", version: 1, nodes: [{ id: "a" }], pipes: [] });
    await windowA.webContents.executeJavaScript(`window.electron.writeSelectionClipboard(${JSON.stringify(payload)})`);
    await windowA.webContents.executeJavaScript("window.electron.openAppWindow()");
    const windowB = await waitFor(() => BrowserWindow.getAllWindows().find((win) => win.id !== windowA.id));
    await windowB.webContents.executeJavaScript("document.querySelector('.main-canvas') !== null");
    const received = await windowB.webContents.executeJavaScript("window.electron.readSelectionClipboard()");
    const parsed = JSON.parse(received);
    globalThis.originalShowSaveDialog = dialog.showSaveDialog;
    globalThis.savePath = path.join(app.getPath("temp"), `fluidpath-save-smoke-${process.pid}.json`);
    let saveOptions = null;
    dialog.showSaveDialog = async (options) => {
      saveOptions = options;
      return { canceled: false, filePath: globalThis.savePath };
    };
    const saveResult = await windowA.webContents.executeJavaScript("window.electron.saveJsonDialog({ json: '{\\\"ok\\\":true}', defaultName: 'My: diagram' })");
    const savePassed = saveResult.saved && saveResult.path === globalThis.savePath && fs.readFileSync(globalThis.savePath, "utf8") === "{\"ok\":true}" && saveOptions.defaultPath === "My_ diagram.json";
    const passed = parsed.kind === "fluidpath-selection" && parsed.version === 1 && parsed.nodes.length === 1 && savePassed;
    console.log("MULTIWINDOW_SMOKE_RESULT " + JSON.stringify({ windows: BrowserWindow.getAllWindows().length, clipboard: parsed.kind, savePassed, passed }));
    close(passed ? 0 : 1);
  } catch (err) {
    console.log("MULTIWINDOW_SMOKE_FAIL " + JSON.stringify(String(err)));
    close(1);
  }
});
