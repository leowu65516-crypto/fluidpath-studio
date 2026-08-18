const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // 收到 macOS "open-file" 事件时，把文件路径与内容广播给渲染进程
  onOpenFile: (callback) => {
    ipcRenderer.on("open-file", (_event, payload) => callback(payload));
  },
});
