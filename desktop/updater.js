// Обновления через интернет: новая версия скачивается в фоне из GitHub Releases,
// устанавливается по кнопке «Обновить сейчас» в кассе или при выходе из программы.
// Нет интернета — касса просто работает на текущей версии и проверит позже.
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;
const CHECK_EVERY = 4 * 3600 * 1000;

export function initUpdater({ app, send }) {
  const state = { state: "idle", current: app.getVersion(), version: null, percent: 0, error: null, checkedAt: null };
  const set = (patch) => { Object.assign(state, patch); send({ ...state }); };

  // В режиме разработки обновлять нечего
  if (!app.isPackaged) {
    set({ state: "dev" });
    return { state: () => ({ ...state }), check: async () => ({ ...state }), ready: () => false, install: () => false };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on("checking-for-update", () => set({ state: "checking", error: null }));
  autoUpdater.on("update-available", (i) => set({ state: "downloading", version: i.version, percent: 0 }));
  autoUpdater.on("update-not-available", () => set({ state: "latest", version: null, checkedAt: Date.now() }));
  autoUpdater.on("download-progress", (p) => set({ state: "downloading", percent: Math.round(p.percent || 0) }));
  autoUpdater.on("update-downloaded", (i) => set({ state: "ready", version: i.version, percent: 100, checkedAt: Date.now() }));
  // Ошибка (обычно нет интернета) — не мешаем кассиру, попробуем при следующей проверке
  autoUpdater.on("error", (e) => set({ state: state.state === "ready" ? "ready" : "error", error: String((e && e.message) || e).slice(0, 200), checkedAt: Date.now() }));

  const check = async () => {
    if (state.state === "downloading" || state.state === "ready") return { ...state };
    try { await autoUpdater.checkForUpdates(); } catch (e) { /* событие error уже записало причину */ }
    return { ...state };
  };
  setTimeout(check, 30 * 1000);
  setInterval(check, CHECK_EVERY);

  return {
    state: () => ({ ...state }),
    check,
    ready: () => state.state === "ready",
    // Тихая установка и автоматический запуск новой версии
    install: () => autoUpdater.quitAndInstall(true, true),
  };
}
