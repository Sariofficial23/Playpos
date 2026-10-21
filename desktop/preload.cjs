// Мост между страницей кассы и приложением: печать, принтеры и обновления.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("PlayPosDesktop", {
  print: (opts) => ipcRenderer.invoke("print", opts || {}),
  printers: () => ipcRenderer.invoke("printers"),
  openPrinterSettings: () => ipcRenderer.invoke("open-printer-settings"),
  // Обновления программы через интернет
  updateState: () => ipcRenderer.invoke("update-state"),
  checkUpdate: () => ipcRenderer.invoke("update-check"),
  installUpdate: () => ipcRenderer.invoke("update-install"),
  onUpdate: (cb) => ipcRenderer.on("update", (_e, s) => cb(s)),
});
