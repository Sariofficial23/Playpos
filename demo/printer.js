/* PlayPos — прямая печать на чековый принтер по USB (WebUSB + команды ESC/POS).
 * Так работают веб-кассы вроде Clopos: драйвер принтера в Windows заменяется на WinUSB через Zadig,
 * после этого Chrome/Edge отправляет команды прямо в принтер — без окна печати, с обрезкой ленты
 * и открытием денежного ящика. Работает только по HTTPS (или localhost) и в Chrome / Edge. */
(function () {
  "use strict";
  const SAVED = "playpos-usb-printer";
  let dev = null, epOut = null;

  /* Кодировка CP866 (кириллица для чековых принтеров, ESC t 17) */
  function encode(str) {
    const out = [];
    for (const ch of String(str)) {
      const c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c >= 0x410 && c <= 0x42f) out.push(c - 0x410 + 0x80); // А–Я
      else if (c >= 0x430 && c <= 0x43f) out.push(c - 0x430 + 0xa0); // а–п
      else if (c >= 0x440 && c <= 0x44f) out.push(c - 0x440 + 0xe0); // р–я
      else if (c === 0x401) out.push(0xf0); // Ё
      else if (c === 0x451) out.push(0xf1); // ё
      else if (c === 0x2116) out.push(0xfc); // №
      else if ("‘’ʻʼ`".includes(ch)) out.push(0x27);
      else if ("«»“”„".includes(ch)) out.push(0x22);
      else if ("—–−".includes(ch)) out.push(0x2d);
      else if (c === 0xa0 || c === 0x202f) out.push(0x20);
      else out.push(0x3f); // ?
    }
    return out;
  }

  // Перенос текста по словам на строки шириной w символов
  function wrap(t, w) {
    const lines = []; let cur = "";
    String(t).split(/\s+/).forEach((word) => {
      while (word.length > w) { if (cur) { lines.push(cur); cur = ""; } lines.push(word.slice(0, w)); word = word.slice(w); }
      if (!word) return;
      if (!cur) cur = word; else if (cur.length + 1 + word.length <= w) cur += " " + word; else { lines.push(cur); cur = word; }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  function pair(a, b, w) {
    a = String(a); b = String(b);
    if (a.length + 1 + b.length <= w) return [a + " ".repeat(w - a.length - b.length) + b];
    const ls = wrap(a, w), last = ls[ls.length - 1];
    if (last.length + 1 + b.length <= w) ls[ls.length - 1] = last + " ".repeat(w - last.length - b.length) + b;
    else ls.push(" ".repeat(Math.max(0, w - b.length)) + b);
    return ls;
  }

  /* rows: [{k:"title"|"center"|"text"|"hr"|"row"|"big", t, a, b}] → байты ESC/POS */
  function render(rows, opts) {
    const w = opts.paper === "58" ? 32 : 48; // символов в строке, шрифт A
    const ESC = 0x1b, GS = 0x1d, LF = 0x0a;
    const b = [ESC, 0x40, ESC, 0x74, opts.codepage ?? 17];
    const line = (s) => b.push(...encode(s), LF);
    const align = (n) => b.push(ESC, 0x61, n);
    const bold = (on) => b.push(ESC, 0x45, on ? 1 : 0);
    const size = (n) => b.push(GS, 0x21, n); // 0x00 обычный, 0x01 двойная высота
    rows.forEach((r) => {
      if (r.k === "title") { align(1); bold(1); size(0x01); wrap(r.t, w).forEach(line); size(0); bold(0); }
      else if (r.k === "center") { align(1); wrap(r.t, w).forEach(line); }
      else if (r.k === "text") { align(0); wrap(r.t, w).forEach(line); }
      else if (r.k === "hr") { align(0); line("-".repeat(w)); }
      else if (r.k === "row") { align(0); pair(r.a, r.b, w).forEach(line); }
      else if (r.k === "big") { align(0); bold(1); size(0x01); pair(r.a, r.b, w).forEach(line); size(0); bold(0); }
    });
    align(0);
    b.push(ESC, 0x64, 4); // прогон 4 строки
    if (opts.drawer) b.push(ESC, 0x70, 0, 25, 250); // импульс на денежный ящик
    b.push(GS, 0x56, 66, 0); // частичная обрезка
    return new Uint8Array(b);
  }

  async function open(d) {
    if (!d.opened) await d.open();
    if (d.configuration === null) await d.selectConfiguration(1);
    for (const itf of d.configuration.interfaces) {
      for (const alt of itf.alternates) {
        const ep = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
        if (ep) {
          if (!itf.claimed) await d.claimInterface(itf.interfaceNumber);
          dev = d; epOut = ep.endpointNumber;
          try { localStorage.setItem(SAVED, JSON.stringify({ v: d.vendorId, p: d.productId, name: d.productName || "" })); } catch (e) {}
          return d;
        }
      }
    }
    throw new Error("У устройства нет выхода для печати");
  }

  async function find() {
    if (dev && dev.opened) return dev;
    if (!navigator.usb) throw new Error("WebUSB не поддерживается");
    let saved = null; try { saved = JSON.parse(localStorage.getItem(SAVED) || "null"); } catch (e) {}
    const list = await navigator.usb.getDevices();
    const d = (saved && list.find((x) => x.vendorId === saved.v && x.productId === saved.p)) || list[0];
    if (!d) throw new Error("Принтер не подключён");
    return open(d);
  }

  window.PPPrinter = {
    supported: () => !!navigator.usb,
    saved: () => { try { return JSON.parse(localStorage.getItem(SAVED) || "null"); } catch (e) { return null; } },
    async connect() { const d = await navigator.usb.requestDevice({ filters: [] }); return open(d); },
    async print(rows, opts) {
      const d = await find();
      const data = render(rows, opts);
      for (let i = 0; i < data.length; i += 4096) await d.transferOut(epOut, data.slice(i, i + 4096));
      return data.length;
    },
    render,
  };
})();
