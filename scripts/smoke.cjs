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
  // Reset the first-run marker so the recovery/help behavior is deterministic in CI.
  await win.webContents.executeJavaScript("localStorage.removeItem('fluidpath.help.seen.v1'); localStorage.removeItem('fluidpath.lastDiagramId'); location.reload();");
  await new Promise((r) => setTimeout(r, 500));
  const firstRunHelp = await win.webContents.executeJavaScript("!!document.querySelector('.help-panel')");
  await new Promise((r) => setTimeout(r, 1800));
  await win.webContents.executeJavaScript("document.querySelector('.help-close')?.click()");
  await new Promise((r) => setTimeout(r, 80));
  const helpSeen = await win.webContents.executeJavaScript("localStorage.getItem('fluidpath.help.seen.v1') === '1'");
  await win.reload();
  await new Promise((r) => setTimeout(r, 500));
  const repeatRunHelp = await win.webContents.executeJavaScript("!!document.querySelector('.help-panel')");

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

  // Three-way diaphragm selector: verify the real desktop UI exposes a shared port
  // and two bidirectional routes, rather than positional A/C direction labels.
  const selectorUi = await win.webContents.executeJavaScript(`
    (() => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const language = document.querySelector('[data-testid="lang-toggle"]');
      if (language?.textContent?.trim() === 'EN') language.click();
      const edit = document.querySelector('[data-testid="mode-edit"]');
      if (!edit) return Promise.resolve({ found: false });
      edit.click();
      return sleep(80).then(() => {
        const library = document.querySelector('.library');
        if (library?.classList.contains('collapsed')) library.querySelector('.panel-toggle')?.click();
        return sleep(80);
      }).then(() => {
        const search = document.querySelector('.library input');
        if (!search) return { found: false };
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(search, '3-way diaphragm selector');
        search.dispatchEvent(new Event('input', { bubbles: true }));
        return sleep(80).then(() => {
          let item = [...document.querySelectorAll('.lib-item')].find((node) => node.textContent.includes('3-way diaphragm selector'));
          if (item) return item;
          document.querySelectorAll('.lib-group-title').forEach((group) => group.click());
          return sleep(80).then(() => [...document.querySelectorAll('.lib-item')].find((node) => node.textContent.includes('3-way diaphragm selector')));
        }).then((item) => {
          if (!item) return { found: false };
          item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          return sleep(120).then(() => {
            const text = document.querySelector('.inspector')?.textContent || '';
            const directions = [...document.querySelectorAll('.port-row')].map((row) => row.querySelector('select'));
            return {
              found: true,
              sharedPort: text.includes('Shared port'),
              routeA: text.includes('P3 ↔ P1'),
              routeB: text.includes('P3 ↔ P2'),
              noPositionalRoute: !text.includes('A→C') && !text.includes('B→C'),
              directionsLocked: directions.length === 3 && directions.every((node) => node?.disabled),
            };
          });
        });
      });
    })()
  `);
  const selectorScreenshot = await win.webContents.capturePage();
  fs.writeFileSync("/tmp/fluidpath-selector-en.png", selectorScreenshot.toPNG());

  // English narrow-window regression: all three visible work-mode buttons must remain whole and usable.
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
  console.log("SMOKE_HELP_MEMORY " + JSON.stringify({ firstRunHelp, helpSeen, repeatRunHelp }));
  console.log("SMOKE_FAULT_MODE " + JSON.stringify(faultMode));
  console.log("SMOKE_DIAPHRAGM_SELECTOR " + JSON.stringify(selectorUi));
  console.log("SMOKE_ENGLISH_MODES " + JSON.stringify(compactMode));
  console.log("SMOKE_CONSOLE_ERRORS " + JSON.stringify(consoleErrors));

  const ok = result.rootChildren > 0 && result.hasApp && result.hasCanvas
    && firstRunHelp && helpSeen && !repeatRunHelp
    && faultMode.foundModeButton && faultMode.active && faultMode.panel && faultMode.aiTopbarButtons === 0
    && selectorUi.found && selectorUi.sharedPort && selectorUi.routeA && selectorUi.routeB && selectorUi.noPositionalRoute && selectorUi.directionsLocked
    && compactMode.found && compactMode.groupVisible && compactMode.unclipped
    && compactMode.labels.join("|") === "✏️ Edit|🎬 Demo|⚠ Fault";
  if (!ok) process.exitCode = 1;
  app.exit(ok ? 0 : 1);
});
