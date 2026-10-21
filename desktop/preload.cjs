// Мост между страницей кассы и приложением: печать и принтеры.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("PlayPosDesktop", {
  print: (opts) => ipcRenderer.invoke("print", opts || {}),
  printers: () => ipcRenderer.invoke("printers"),
  openPrinterSettings: () => ipcRenderer.invoke("open-printer-settings"),
});
