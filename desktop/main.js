// PlayPos для Windows: касса, сервер и база данных на одном компьютере, работает без интернета.
import { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCore } from "./core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3700;
let core = null;
let win = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit(); // вторая копия программы просто открывает первую
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

const backupDir = () => path.join(app.getPath("documents"), "PlayPos", "backups");

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, show: false, autoHideMenuBar: true, title: "PlayPos",
    icon: path.join(here, "build", "icon.png"),
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  win.maximize();
  win.once("ready-to-show", () => win.show());
  // Внешние ссылки открываем в обычном браузере, окно кассы показывает только кассу
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(core.url)) { e.preventDefault(); shell.openExternal(url); } });
  win.loadURL(core.url + "/pos");
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Касса", submenu: [
      { label: "Обновить", accelerator: "F5", click: () => win && win.reload() },
      { label: "Во весь экран", accelerator: "F11", click: () => win && win.setFullScreen(!win.isFullScreen()) },
      { type: "separator" },
      { label: "Выход", role: "quit" },
    ] },
    { label: "Данные", submenu: [
      { label: "Сделать резервную копию сейчас", click: async () => {
        try { const f = await core.backup("manual"); dialog.showMessageBox(win, { message: "Резервная копия сохранена", detail: f }); }
        catch (e) { dialog.showErrorBox("PlayPos", "Не удалось сделать копию: " + e.message); }
      } },
      { label: "Открыть папку резервных копий", click: () => shell.openPath(backupDir()) },
    ] },
  ]));
}

// Печать чека сразу на принтер по умолчанию, без окна выбора
ipcMain.handle("print", (e) => new Promise((resolve) => {
  e.sender.print({ silent: true, printBackground: false, margins: { marginType: "none" } }, (ok, reason) => resolve({ ok, reason }));
}));

app.whenReady().then(async () => {
  try {
    core = await startCore({
      dataDir: path.join(app.getPath("userData"), "data"),
      backupDir: backupDir(),
      webRoot: path.join(here, "app", "web"),
      port: PORT,
      appVersion: app.getVersion(),
    });
  } catch (e) {
    dialog.showErrorBox("PlayPos", "Не удалось запустить кассу.\n\n" + e.message + (e.code === "EADDRINUSE" ? `\n\nПорт ${PORT} занят другой программой.` : ""));
    app.exit(1);
    return;
  }
  // USB-принтер напрямую (WebUSB): доступ разрешён, выбирается первое найденное устройство
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler(() => true);
  ses.setDevicePermissionHandler((d) => d.deviceType === "usb");
  ses.on("select-usb-device", (event, details, callback) => {
    event.preventDefault();
    callback(details.deviceList[0] ? details.deviceList[0].deviceId : "");
  });
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true }); // касса стартует вместе с Windows
  buildMenu();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
// Перед выходом — резервная копия и аккуратная остановка базы
app.on("before-quit", (e) => {
  if (quitting || !core) return;
  e.preventDefault();
  quitting = true;
  core.backup("exit").catch(() => {}).finally(() => core.stop().catch(() => {}).finally(() => app.quit()));
});
