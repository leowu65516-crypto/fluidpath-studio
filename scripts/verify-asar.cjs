// 验证打包后的 app 能真正加载：直接 loadFile asar 内的 dist/index.html
// （与 electron/main.cjs 相同的路径逻辑：__dirname=electron → ../dist/index.html）
const { app, BrowserWindow } = require("electron");
const path = require("path");

app.whenReady().then(async () => {
  const asarPath = path.join(
    __dirname,
    "..",
    "release",
    "mac-arm64",
    "FluidPath Studio.app",
    "Contents",
    "Resources",
    "app.asar",
    "dist",
    "index.html"
  );
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "..", "release", "mac-arm64", "FluidPath Studio.app", "Contents", "Resources", "app.asar", "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  let failed = null;
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    failed = `did-fail-load ${code} ${desc}`;
  });

  try {
    await win.loadFile(asarPath);
    await new Promise((r) => setTimeout(r, 1500));
    const result = await win.webContents.executeJavaScript(
      `({ hasApp: !!document.querySelector('.app'), hasCanvas: !!document.querySelector('.main-canvas'), title: document.title })`
    );
    console.log("ASAR_LOAD_RESULT " + JSON.stringify(result));
    console.log("ASAR_LOAD_FAIL " + JSON.stringify(failed));
    app.exit(!failed && result.hasApp && result.hasCanvas ? 0 : 1);
  } catch (err) {
    console.log("ASAR_LOAD_FAIL " + JSON.stringify(String(err)));
    app.exit(1);
  }
});
