// 冒烟测试：用与打包产物一致的 webPreferences 加载 dist/index.html，
// 验证 React 正常挂载（确认 CSP + sandbox 未破坏渲染）。
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

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
  await win.webContents.executeJavaScript("document.querySelector('.help-close')?.click()");
  await new Promise((r) => setTimeout(r, 80));

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

  const faultMode = await win.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-testid="mode-fault"]');
      if (!button) return Promise.resolve({ foundModeButton: false, active: false, panel: false, aiTopbarButtons: -1 });
      button.click();
      return new Promise((resolve) => setTimeout(() => resolve({
        foundModeButton: true,
        active: button.classList.contains('on'),
        panel: !!document.querySelector('.fault-panel'),
        aiTopbarButtons: [...document.querySelectorAll('.toolbar button')].filter((node) => node.textContent.includes('AI')).length,
      }), 120));
    })()
  `);

  // English narrow-window regression: all four work-mode buttons must remain whole and usable.
  win.setBounds({ width: 512, height: 800 });
  await new Promise((r) => setTimeout(r, 80));
  const compactMode = await win.webContents.executeJavaScript(`
    (() => {
      const lang = document.querySelector('[data-testid="lang-toggle"]');
      if (lang?.textContent?.trim() === 'EN') lang.click();
      const group = document.querySelector('.tb-mode');
      const row = group?.closest('.tb-row');
      if (!row || !group) return { found: false };
      row.scrollLeft = Math.max(0, Math.min(group.offsetLeft - 12, row.scrollWidth - row.clientWidth));
      const rowRect = row.getBoundingClientRect();
      const groupRect = group.getBoundingClientRect();
      const buttons = [...group.querySelectorAll('button')].map((button) => {
        const rect = button.getBoundingClientRect();
        return { text: button.textContent.trim(), width: rect.width, scrollWidth: button.scrollWidth, clientWidth: button.clientWidth };
      });
      return {
        found: true,
        scrollLeft: row.scrollLeft,
        row: { left: rowRect.left, right: rowRect.right, width: rowRect.width, scrollWidth: row.scrollWidth, clientWidth: row.clientWidth },
        group: { left: groupRect.left, right: groupRect.right, width: groupRect.width, offsetLeft: group.offsetLeft },
        groupVisible: groupRect.left >= rowRect.left - 1 && groupRect.right <= rowRect.right + 1,
        labels: buttons.map((button) => button.text),
        unclipped: buttons.every((button) => button.scrollWidth <= button.clientWidth),
        buttons,
      };
    })()
  `);
  const screenshot = await win.webContents.capturePage();
  fs.writeFileSync("/tmp/fluidpath-mode-en-512.png", screenshot.toPNG());

  console.log("SMOKE_RESULT " + JSON.stringify(result));
  console.log("SMOKE_FAULT_MODE " + JSON.stringify(faultMode));
  console.log("SMOKE_ENGLISH_MODES " + JSON.stringify(compactMode));
  console.log("SMOKE_CONSOLE_ERRORS " + JSON.stringify(consoleErrors));

  const ok = result.rootChildren > 0 && result.hasApp && result.hasCanvas
    && faultMode.foundModeButton && faultMode.active && faultMode.panel && faultMode.aiTopbarButtons === 0
    && compactMode.found && compactMode.groupVisible && compactMode.unclipped
    && compactMode.labels.join("|") === "✏️ Edit|🎬 Demo|✓ Verify|⚠ Fault";
  app.exit(ok ? 0 : 1);
});
