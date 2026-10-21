// Мост между страницей кассы и приложением: только печать чека.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("PlayPosDesktop", {
  print: () => ipcRenderer.invoke("print"),
});
