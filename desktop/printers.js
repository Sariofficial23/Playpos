// Принтеры Windows и их состояние для раздела «Настройки → Принтеры».
// Список берём из Electron, состояние — из Windows (Win32_Printer): офлайн, нет бумаги, открыта крышка и т. д.
import { execFile } from "node:child_process";

// Виртуальные «принтеры» Windows (PDF, OneNote, факс) — чек на них не напечатать
const VIRTUAL_PORT = /^(PORTPROMPT:|nul:|SHRFAX:|XPSPort:|FILE:)/i;
const VIRTUAL_NAME = /(pdf|onenote|fax|факс|xps|document writer)/i;
// DetectedErrorState из Win32_Printer
const ERRORS = { 4: "Нет бумаги", 6: "Нет тонера", 7: "Открыта крышка", 8: "Замятие бумаги", 10: "Нужно обслуживание", 11: "Переполнен лоток" };

export function classify(w) {
  if (!w) return { state: "unknown", text: "Состояние неизвестно" };
  const virtual = VIRTUAL_PORT.test(w.PortName || "") || VIRTUAL_NAME.test(w.Name || "");
  if (virtual) return { state: "virtual", text: "Виртуальный (не для чеков)" };
  // PrinterStatus 7 = Offline; DetectedErrorState 9 = Offline; WorkOffline — Windows пометил «Работать автономно»
  if (w.WorkOffline || w.PrinterStatus === 7 || w.DetectedErrorState === 9) return { state: "offline", text: "Офлайн — проверьте кабель и питание" };
  if (ERRORS[w.DetectedErrorState]) return { state: "error", text: ERRORS[w.DetectedErrorState] };
  if (w.DetectedErrorState === 3) return { state: "online", text: "Онлайн · мало бумаги" };
  return { state: "online", text: "Онлайн" };
}

export function winPrinters() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(null);
    const cmd = "Get-CimInstance Win32_Printer | Select-Object Name,PortName,DriverName,Default,WorkOffline,PrinterStatus,DetectedErrorState | ConvertTo-Json -Compress";
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { windowsHide: true, timeout: 10000 }, (err, out) => {
      if (err) return resolve(null);
      try { const j = JSON.parse(out || "[]"); resolve(Array.isArray(j) ? j : [j]); } catch (e) { resolve(null); }
    });
  });
}

// Объединяем список Electron и состояние Windows
export async function listPrinters(webContents) {
  const [list, win] = await Promise.all([webContents.getPrintersAsync(), winPrinters()]);
  const byName = new Map((win || []).map((w) => [w.Name, w]));
  return list.map((p) => {
    const w = byName.get(p.name);
    return {
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: !!(p.isDefault || (w && w.Default)),
      driver: (w && w.DriverName) || "",
      port: (w && w.PortName) || "",
      ...classify(win ? w : null),
    };
  });
}
