// 冒烟测试：用与打包产物一致的 webPreferences 加载 dist/index.html，
// 验证 React 正常挂载（确认 CSP + sandbox 未破坏渲染）。
const { app, BrowserWindow } = require("electron");
const path = require("path");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "..", "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (_e, level, message) => {
    // level 3 = error
    if (level === 3) consoleErrors.push(message);
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    consoleErrors.push(`did-fail-load ${code} ${desc}`);
  });

  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  await new Promise((r) => setTimeout(r, 1800));

  const result = await win.webContents.executeJavaScript(`
    (() => ({
      rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : -1,
      hasApp: !!document.querySelector('.app'),
      hasToolbar: !!document.querySelector('.toolbar'),
      hasCanvas: !!document.querySelector('.main-canvas'),
      title: document.title,
      bodyTheme: document.body.dataset.theme || null,
    }))()
  `);

  console.log("SMOKE_RESULT " + JSON.stringify(result));
  console.log("SMOKE_CONSOLE_ERRORS " + JSON.stringify(consoleErrors));

  const ok = result.rootChildren > 0 && result.hasApp && result.hasCanvas;
  app.exit(ok ? 0 : 1);
});
