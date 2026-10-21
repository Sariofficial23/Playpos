/* PlayPos — рабочая версия кассы. Источник истины — сервер (/api/rpc) и PostgreSQL:
 * экран показывает состояние с сервера, каждое действие выполняется и проверяется на сервере.
 * В браузере хранятся только настройки этого компьютера (принтер, бумага, вид списка). */
(function () {
  "use strict";

  const DEVICE = "playpos-device";
  const LAYOUT = "playpos-layout";
  const PALETTE = "playpos-palette";
  const TZ = "Asia/Tashkent";
  const MIN = 60000;

  /* ---------- Права доступа ---------- */
  const PERMS = [
    ["Касса", "sell", "Продажа", "Новое посещение и выбор тарифа"],
    ["Касса", "extend", "Продление времени", "Кнопка «Продлить» с доплатой"],
    ["Касса", "pay", "Приём оплаты", "Закрытие счёта: наличные или карта"],
    ["Касса", "finish", "Завершение посещения", "Отметить выход ребёнка"],
    ["Касса", "print", "Печать талона", "Талон 58/80 мм"],
    ["Касса", "shift", "Своя смена", "Открытие и закрытие кассовой смены"],
    ["Управление", "reports", "Отчёты", "Выручка, посещения, итоги смен"],
    ["Управление", "expenses", "Расходы", "Добавление расходов"],
    ["Управление", "refunds", "Возвраты", "Возврат денег по оплаченному счёту"],
    ["Управление", "tariffs", "Тарифы", "Создание и архив тарифов"],
    ["Управление", "staff", "Сотрудники", "Создание кассиров и выдача прав"],
    ["Управление", "settings", "Настройки площадки", "Название, принтер, звук"],
  ];
  const ROLES = {
    owner: { name: "Владелец", perms: PERMS.map((p) => p[1]) },
    admin: { name: "Администратор", perms: ["sell", "extend", "pay", "finish", "print", "shift", "reports", "expenses", "refunds", "tariffs"] },
    cashier: { name: "Кассир", perms: ["sell", "extend", "pay", "finish", "print", "shift"] },
  };
  const permsOf = (role) => Object.fromEntries(PERMS.map((p) => [p[1], ROLES[role].perms.includes(p[1])]));

  const NAV = [
    ["floor", "🎠", "Площадка", null],
    ["visits", "🧒", "Посещения", null],
    ["bills", "🧾", "Счета", "pay"],
    ["shifts", "🗄️", "Смены", "shift"],
    ["expenses", "💸", "Расходы", "expenses"],
    ["reports", "📊", "Отчёты", "reports"],
    ["tariffs", "🎟️", "Тарифы", "tariffs"],
    ["staff", "👥", "Сотрудники", "staff"],
    ["settings", "⚙️", "Настройки", "settings"],
  ];

  /* Готовые наборы тарифов — типичные схемы игровых площадок */
  const PRESETS = [
    { name: "Короткие сеансы", desc: "Для ТРЦ и фудкортов: родители рядом, дети играют недолго.",
      items: [["10 минут", 10, 10000], ["20 минут", 20, 18000], ["30 минут", 30, 25000]] },
    { name: "Почасовой", desc: "Классика: полчаса, час, два часа.",
      items: [["30 минут", 30, 25000], ["1 час", 60, 40000], ["2 часа", 120, 70000]] },
    { name: "Безлимит + продления", desc: "Весь день и короткие доплаты при задержке.",
      items: [["Безлимит на день", 600, 120000], ["+10 минут", 10, 8000, "ext"], ["+30 минут", 30, 20000, "ext"]] },
  ];

  /* ---------- Состояние ---------- */
  let S;
  const ui = { online: true, cat: "all", layout: "list", route: "floor", search: "", billFilter: "open", period: "today", user: null, soundCtx: null, notified: {}, sig: "" };

  let skew = 0; // поправка часов устройства: время всегда считаем по серверу
  const now = () => Date.now() + skew;
  function deviceSettings() { try { return JSON.parse(localStorage.getItem(DEVICE) || "{}"); } catch (e) { return {}; } }
  function saveDevice(patch) { try { localStorage.setItem(DEVICE, JSON.stringify({ ...deviceSettings(), ...patch })); } catch (e) {} }

  function setOnline(on) {
    if (ui.online === on) return;
    ui.online = on;
    let b = document.getElementById("offline");
    if (!b) { b = document.createElement("div"); b.id = "offline"; b.className = "offline"; document.body.appendChild(b); }
    b.textContent = PPI18N.tr("Нет связи с сервером — действия не сохраняются. Проверьте интернет.");
    b.hidden = on;
  }
  async function api(op, data = {}) {
    let r;
    try {
      r = await fetch("/api/rpc", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-PlayPos": "1" }, body: JSON.stringify({ op, ...data }) });
    } catch (e) { setOnline(false); throw new Error("Нет связи с сервером"); }
    setOnline(true);
    const out = await r.json().catch(() => ({}));
    if (r.status === 401 && op !== "login" && S) { S = null; close(); render(); }
    if (!r.ok) throw new Error(out.error || "Ошибка сервера");
    return out;
  }
  function applyState(st) {
    skew = st.serverNow - Date.now();
    st.currentUserId = st.meId;
    st.settings = { paper: "80", autoReceipt: true, printMode: "windows", codepage: 17, drawer: false, sound: true, ...st.settings, ...deviceSettings() };
    S = st;
  }
  async function refresh() { applyState(await api("state")); }
  // Выполнить операцию на сервере, получить свежие данные и перерисовать экран. Ошибку показываем кассиру.
  async function act(op, data, okMsg) {
    try {
      const out = await api(op, data);
      await refresh(); render();
      if (okMsg) toast(okMsg);
      return out;
    } catch (e) {
      toast(esc(PPI18N.tr(e.message)), "bad");
      try { if (S) { await refresh(); render(); } } catch (_) {}
      return null;
    }
  }

  /* ---------- Утилиты ---------- */
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ") + " сум";
  const hm = (ts) => new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const dt = (ts) => new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const dayKey = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: TZ });
  function clock(ms) {
    const s = Math.floor(Math.abs(ms) / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    const p = (n) => String(n).padStart(2, "0");
    return (h ? h + ":" + p(m) : p(m)) + ":" + p(x);
  }
  const me = () => S.staff.find((u) => u.id === S.currentUserId);
  const can = (p) => { const u = me(); return !!u && u.active && (u.role === "owner" || !!u.perms[p]); };
  const staffName = (sid) => (S.staff.find((u) => u.id === sid) || {}).name || "—";
  const billTotal = (b) => b.items.reduce((a, i) => a + i.amount, 0);
  const refunded = (b) => S.refunds.filter((r) => r.billId === b.id).reduce((a, r) => a + r.amount, 0);
  const visitBills = (v) => S.bills.filter((b) => b.visitId === v.id && b.status !== "cancelled");
  const openBills = (v) => visitBills(v).filter((b) => b.status === "open");
  const myShift = () => S.shifts.find((s) => s.staffId === S.currentUserId && !s.closedAt);
  const activeTariffs = (use) => S.tariffs.filter((t) => !t.archived && (t.use === "both" || t.use === use)).sort((a, b) => a.minutes - b.minutes);
  function status(v) {
    if (v.exitAt) return "done";
    const left = v.end - now();
    if (left <= 0) return "bad";
    if (left <= S.settings.warn * MIN || v.minutes <= S.settings.warn) return "warn";
    return "ok";
  }
  function log() {} // журнал действий ведёт сервер

  function toast(msg, kind = "", actionLabel, action) {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.innerHTML = `<span style="flex:1">${msg}</span>`;
    if (actionLabel) {
      const b = document.createElement("button"); b.className = "btn sm sun"; b.textContent = actionLabel;
      b.onclick = () => { el.remove(); action(); }; el.appendChild(b);
    }
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), actionLabel ? 9000 : 3500);
  }

  function beep() {
    if (!S.settings.sound || !ui.soundCtx) return;
    const ctx = ui.soundCtx;
    [0, 0.35].forEach((d) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.type = "triangle"; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.28);
      o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.3);
    });
  }

  /* ---------- Модальные окна ---------- */
  function modal(html, mount, opts) {
    const m = $("#modal");
    m.innerHTML = html; m.hidden = false;
    m.classList.toggle("drawer", !!(opts && opts.side));
    m.onclick = (e) => { if (e.target === m) close(); };
    if (mount) mount(m);
    const f = m.querySelector("[autofocus]"); if (f) f.focus();
  }
  function close() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  /* ---------- Бизнес-операции ---------- */
  function requireShift() {
    if (myShift()) return true;
    if (!can("shift")) { toast("Нет открытой смены и нет права её открыть", "bad"); return false; }
    openShiftDialog();
    toast("Сначала откройте смену — деньги привязываются к смене", "warn");
    return false;
  }

  const createVisit = (child, tariff) => act("visit.create", { child, tariffId: tariff.id });
  const extendVisit = (v, tariff, from) => act("visit.extend", { visitId: v.id, tariffId: tariff.id, from });
  const busy = (btn, on) => { if (btn) btn.disabled = on; };

  /* ---------- Диалоги ---------- */
  function newVisitDialog() {
    if (!can("sell")) return toast("Нет права на продажу", "bad");
    const tariffs = activeTariffs("base");
    if (!tariffs.length) return toast("Сначала добавьте тарифы", "warn");
    let sel = tariffs[Math.min(2, tariffs.length - 1)].id;
    modal(`<div class="dlg">
      <h2>Новое посещение</h2>
      <label class="f">Имя ребёнка</label><input class="input" id="nvName" autofocus maxlength="60" placeholder="Например, Юсуф">
      <label class="f">Тариф</label><div class="picks" id="nvT"></div>
      <div class="summary" id="nvSum"></div>
      <div class="foot">
        <button class="btn ghost" data-x>Отмена</button>
        <button class="btn alt" id="nvStart">Начать, оплата при выходе</button>
        <button class="btn" id="nvPay">Начать и оплатить</button>
      </div></div>`, (m) => {
      const draw = () => {
        $("#nvT", m).innerHTML = tariffs.map((t) => `<button class="pick ${t.id === sel ? "on" : ""}" data-t="${t.id}"><b>${esc(t.name)}</b><small>${money(t.price)}</small></button>`).join("");
        const t = tariffs.find((x) => x.id === sel);
        $("#nvSum", m).innerHTML = `Начало: <b>${hm(now())}</b> · окончание: <b>${hm(now() + t.minutes * MIN)}</b><br>К оплате: <b>${money(t.price)}</b>`;
      };
      draw();
      $("#nvT", m).onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) { sel = b.dataset.t; draw(); } };
      $("[data-x]", m).onclick = close;
      const go = async (pay, btn) => {
        const name = $("#nvName", m).value.trim();
        if (!name) return toast("Введите имя ребёнка", "bad");
        if (pay && !requireShift()) return;
        busy(btn, true);
        const out = await createVisit(name, tariffs.find((x) => x.id === sel));
        busy(btn, false);
        if (!out) return;
        close();
        toast(`${esc(name)}: таймер запущен`);
        if (pay) payDialog(S.bills.filter((b) => b.id === out.billId));
      };
      $("#nvStart", m).onclick = (e) => go(false, e.target);
      $("#nvPay", m).onclick = (e) => go(true, e.target);
    });
  }

  function extendDialog(v) {
    if (!can("extend")) return toast("Нет права на продление", "bad");
    const tariffs = activeTariffs("ext");
    if (!tariffs.length) return toast("Нет тарифов для продления", "warn");
    let sel = tariffs[0].id, from = "prev";
    const overdue = v.end < now();
    modal(`<div class="dlg">
      <h2>Продлить время — ${esc(v.child)}</h2>
      <div class="summary">Сейчас: окончание <b>${hm(v.end)}</b> ${overdue ? `<span class="tag red">просрочено на ${clock(now() - v.end)}</span>` : `<span class="tag green">осталось ${clock(v.end - now())}</span>`}</div>
      <label class="f">На сколько продлить</label><div class="picks" id="exT"></div>
      ${overdue ? `<label class="f">Отсчёт продления</label><div class="seg" id="exF"><button data-f="prev" class="on">От прежнего окончания</button><button data-f="now">От текущего времени</button></div>` : ""}
      <div class="summary" id="exSum"></div>
      <div class="foot"><button class="btn ghost" data-x>Отмена</button><button class="btn alt" id="exOk">Продлить</button><button class="btn" id="exPay">Продлить и оплатить</button></div>
    </div>`, (m) => {
      const draw = () => {
        $("#exT", m).innerHTML = tariffs.map((t) => `<button class="pick ${t.id === sel ? "on" : ""}" data-t="${t.id}"><b>+${t.minutes} мин</b><small>${money(t.price)}</small></button>`).join("");
        const t = tariffs.find((x) => x.id === sel);
        const base = from === "now" ? Math.max(now(), v.end) : v.end;
        const ob = openBills(v)[0];
        const due = openBills(v).reduce((a, b) => a + billTotal(b), 0) + t.price;
        $("#exSum", m).innerHTML = `Новое окончание: <b>${hm(base + t.minutes * MIN)}</b><br>Доплата за продление: <b>+${money(t.price)}</b><br>` +
          (ob ? `Добавится в открытый счёт №${ob.no}. Итого к оплате: <b>${money(due)}</b>` : `Прошлый счёт оплачен — создастся новый счёт на доплату.`);
        if (overdue) m.querySelectorAll("#exF button").forEach((b) => b.classList.toggle("on", b.dataset.f === from));
      };
      draw();
      $("#exT", m).onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) { sel = b.dataset.t; draw(); } };
      if (overdue) $("#exF", m).onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { from = b.dataset.f; draw(); } };
      $("[data-x]", m).onclick = close;
      const go = async (pay, btn) => {
        if (pay && (!can("pay") || !requireShift())) return;
        const t = tariffs.find((x) => x.id === sel);
        busy(btn, true);
        const out = await extendVisit(v, t, from);
        busy(btn, false);
        if (!out) return;
        delete ui.notified[v.id + "w"]; delete ui.notified[v.id + "e"];
        close();
        toast(`${esc(v.child)}: +${t.minutes} мин, +${money(t.price)}`);
        const nv = S.visits.find((x) => x.id === v.id);
        if (pay && nv) payDialog(openBills(nv));
      };
      $("#exOk", m).onclick = (e) => go(false, e.target);
      $("#exPay", m).onclick = (e) => go(true, e.target);
    });
  }

  const ICON_CASH = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="16" height="11" rx="2"/><path d="M6 7V5.5A1.5 1.5 0 0 1 7.5 4H20a2 2 0 0 1 2 2v9a1.5 1.5 0 0 1-1.5 1.5H18"/><circle cx="10" cy="12.5" r="2.2"/></svg>`;
  const ICON_CARD = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/></svg>`;
  const methodName = (m) => (m === "cash" ? "Наличные" : "Карта");
  const payButtons = () => `<label class="f">Способ оплаты</label>
    <div class="pay2" id="pm"><button class="pick pay on" data-m="cash">${ICON_CASH}<span>Наличные</span></button><button class="pick pay" data-m="card">${ICON_CARD}<span>Карта</span></button></div>
    <p class="note">Только учёт способа оплаты — терминалы и эквайринг не подключаются.</p>`;
  function mountPay(m, set) {
    $("#pm", m).onclick = (e) => {
      const b = e.target.closest("[data-m]"); if (!b) return;
      set(b.dataset.m); m.querySelectorAll("#pm .pick").forEach((x) => x.classList.toggle("on", x === b));
    };
  }
  const billLines = (b) => b.items.map((i) => `<div class="ln"><span>${esc(i.title)}</span><span>${money(i.amount)}</span></div>`).join("") +
    (b.status === "paid" ? `<div class="paidline">✓ Оплачено: <b>${methodName(b.method)}</b> · ${dt(b.paidAt)} · кассир ${esc(staffName(b.paidBy))}</div>` : "");

  function payDialog(bills, after) {
    if (!can("pay")) return toast("Нет права принимать оплату", "bad");
    bills = bills.filter((b) => b.status === "open");
    if (!bills.length) { if (after) after(); return; }
    if (!requireShift()) return;
    let method = "cash"; // при каждом открытии по умолчанию «Наличные»
    const total = bills.reduce((a, b) => a + billTotal(b), 0);
    const v = S.visits.find((x) => x.id === bills[0].visitId);
    modal(`<div class="dlg">
      <button class="xbtn" data-x aria-label="Закрыть">×</button>
      <h2>Закрыть счёт</h2>
      <div class="sub">${esc(v ? v.child : "")} · счёт ${bills.map((b) => "№" + b.no).join(", ")}</div>
      <div class="lines">${bills.map(billLines).join("")}</div>
      <div class="tot"><span>Итого</span><b>${money(total)}</b></div>
      ${payButtons()}
      <button class="btn big" id="pOk">Подтвердить оплату</button>
    </div>`, (m) => {
      mountPay(m, (x) => (method = x));
      $("[data-x]", m).onclick = close;
      $("#pOk", m).onclick = async (e) => {
        busy(e.target, true); // защита от двойного клика; сервер тоже не даст оплатить дважды
        const out = await act("bills.pay", { billIds: bills.map((b) => b.id), method });
        if (!out) return busy(e.target, false);
        if (S.settings.autoReceipt !== false) printReceipt(S.bills.filter((b) => out.paid.includes(b.id)));
        close(); toast(`Оплачено ${money(total)} — ${methodName(method).toLowerCase()}`);
        if (after) after();
      };
    }, { side: true });
  }

  /* Панель выхода: всегда видно, как и кем оплачено, и что ещё нужно взять */
  function checkoutPanel(v, exit) {
    if (exit && !can("finish")) return toast("Нет права завершать посещения", "bad");
    const bills = visitBills(v), open = bills.filter((b) => b.status === "open");
    if (open.length && !can("pay")) return toast("Есть неоплаченный счёт — нужен сотрудник с правом оплаты", "bad");
    if (open.length && !requireShift()) return;
    let method = "cash";
    const t = now(), over = Math.max(0, t - v.end);
    const due = open.reduce((a, b) => a + billTotal(b), 0);
    const paidSum = bills.filter((b) => b.status === "paid").reduce((a, b) => a + billTotal(b), 0);
    modal(`<div class="dlg">
      <button class="xbtn" data-x aria-label="Закрыть">×</button>
      <h2>${exit ? "Выход ребёнка" : "Закрыть счёт"}</h2>
      <div class="sub">${esc(v.child)} · ${hm(v.start)}–${hm(v.end)} · на площадке ${clock(t - v.start)}</div>
      ${over ? `<div class="banner" style="margin:12px 0 0">Время вышло ${clock(over)} назад. Если нужна доплата — нажмите «Продлить».</div>` : ""}
      <div class="lines">${bills.map(billLines).join("")}</div>
      ${paidSum && due ? `<div class="ln muted"><span>Уже оплачено</span><span>${money(paidSum)}</span></div>` : ""}
      <div class="tot"><span>${due ? "К оплате" : "Всё оплачено"}</span><b>${money(due || paidSum)}</b></div>
      ${due ? payButtons() : ""}
      <div class="row" style="margin-top:16px">
        ${over && can("extend") ? `<button class="btn alt" id="coExt">⏩ Продлить</button>` : ""}
        <button class="btn big" id="coOk" style="flex:1">${due ? (exit ? "Подтвердить оплату и выход" : "Подтвердить оплату") : "Отметить выход"}</button>
      </div>
    </div>`, (m) => {
      if (due) mountPay(m, (x) => (method = x));
      $("[data-x]", m).onclick = close;
      const ext = $("#coExt", m); if (ext) ext.onclick = () => { close(); extendDialog(v); };
      $("#coOk", m).onclick = async (e) => {
        busy(e.target, true);
        const out = await act("visit.checkout", { visitId: v.id, exit, method });
        if (!out) return busy(e.target, false);
        if (out.paid.length && S.settings.autoReceipt !== false) printReceipt(S.bills.filter((b) => out.paid.includes(b.id)));
        close();
        toast(`${esc(v.child)}: ${due ? `оплачено ${money(due)} (${methodName(method).toLowerCase()})` : "оплачено ранее"}${exit ? ", выход отмечен" : ""}`);
      };
    }, { side: true });
  }

  function finishDialog(v) { checkoutPanel(v, true); }

  /* Печать чека/талона. Документ описывается строками, а печатается одним из двух способов:
   * "windows" — через драйвер и системный диалог (без диалога: Chrome с --kiosk-printing, см. README);
   * "usb" — напрямую в принтер командами ESC/POS через WebUSB (драйвер заменён на WinUSB через Zadig). */
  const R = {
    title: (t) => ({ k: "title", t }), center: (t) => ({ k: "center", t }), text: (t) => ({ k: "text", t }),
    hr: () => ({ k: "hr" }), row: (a, b) => ({ k: "row", a, b }), big: (a, b) => ({ k: "big", a, b }),
  };
  function rowsHtml(rows) {
    return rows.map((r) => ({
      title: () => `<h3>${esc(r.t)}</h3>`, center: () => `<div class="c">${esc(r.t)}</div>`, text: () => `<div>${esc(r.t)}</div>`, hr: () => "<hr>",
      row: () => `<div class="ln"><span>${esc(r.a)}</span><span>${esc(r.b)}</span></div>`, big: () => `<div class="ln big"><span>${esc(r.a)}</span><span>${esc(r.b)}</span></div>`,
    })[r.k]()).join("");
  }
  function printWindows(rows, deviceName) {
    const paper = S.settings.paper === "58" ? 58 : 80;
    let st = document.getElementById("pageSize");
    if (!st) { st = document.createElement("style"); st.id = "pageSize"; document.head.appendChild(st); }
    st.textContent = "@page { margin: 0 }"; // ширину ленты (58/80 мм) задаёт драйвер принтера
    $("#print").innerHTML = `<div class="ticket" style="--paper:${paper === 80 ? 72 : 48}mm">${rowsHtml(rows)}</div>`;
    // В настольном приложении печать идёт сразу на принтер по умолчанию, без окна
    return new Promise((resolve) => setTimeout(async () => {
      if (!window.PlayPosDesktop) { window.print(); return resolve({ ok: true }); }
      let r;
      try { r = await window.PlayPosDesktop.print({ deviceName: deviceName || S.settings.receiptPrinter || "" }); }
      catch (e) { r = { ok: false, reason: String(e && e.message || e) }; }
      // чек после оплаты: если тихая печать не удалась — обычное окно печати, чтобы чек всё равно вышел
      if ((!r || !r.ok) && !deviceName) window.print();
      resolve(r || { ok: false });
    }, 80));
  }

  /* ---------- Принтеры (версия для Windows) ---------- */
  const desktop = () => !!window.PlayPosDesktop;
  async function loadPrinters() {
    if (!desktop()) return;
    try { ui.printers = await window.PlayPosDesktop.printers(); } catch (e) { ui.printers = []; }
    const c = $("#prChip"); if (c) c.outerHTML = printerChip();
    const l = $("#prList"); if (l) l.innerHTML = printerRows();
  }
  // Принтер для чеков: выбранный в настройках, иначе принтер Windows по умолчанию
  function receiptPrinter() {
    const list = ui.printers || [];
    return list.find((p) => p.name === S.settings.receiptPrinter) || (!S.settings.receiptPrinter && list.find((p) => p.isDefault)) || null;
  }
  const STATE = { online: ["🟢", "green"], offline: ["🔴", "red"], error: ["🟠", "red"], virtual: ["⚪", "grey"], unknown: ["⚪", "grey"] };
  function printerChip() {
    if (!desktop() || !ui.printers) return `<span id="prChip"></span>`;
    const p = receiptPrinter();
    if (!p) return `<span id="prChip" class="prchip red">🖨 ${PPI18N.tr("Принтер не выбран")}</span>`;
    return `<span id="prChip" class="prchip ${STATE[p.state][1]}" title="${esc(p.text)}">🖨 ${STATE[p.state][0]} ${esc(PPI18N.tr(p.state === "online" ? "Принтер онлайн" : p.state === "offline" ? "Принтер офлайн" : p.text))}</span>`;
  }
  function printerRows() {
    const list = ui.printers;
    if (!list) return `<tr><td colspan="5">${PPI18N.tr("Загрузка…")}</td></tr>`;
    if (!list.length) return `<tr><td colspan="5"><b>${PPI18N.tr("Принтеры не найдены.")}</b> ${PPI18N.tr("Подключите принтер, установите драйвер и нажмите «Обновить».")}</td></tr>`;
    const cur = receiptPrinter();
    return list.map((p) => `<tr>
      <td><input type="radio" name="rp" value="${esc(p.name)}" ${cur && cur.name === p.name ? "checked" : ""} ${p.state === "virtual" ? "disabled" : ""}></td>
      <td><b>${esc(p.displayName)}</b>${p.isDefault ? ` <span class="tag">${PPI18N.tr("по умолчанию")}</span>` : ""}<br><small style="color:var(--muted)">${esc([p.driver, p.port].filter(Boolean).join(" · "))}</small></td>
      <td><span class="tag ${STATE[p.state][1]}">${STATE[p.state][0]} ${esc(PPI18N.tr(p.text))}</span></td>
      <td>${p.state === "virtual" ? "" : `<button class="btn sm ghost" data-test="${esc(p.name)}">${PPI18N.tr("Тестовый чек")}</button>`}</td></tr>`).join("");
  }
  async function testPrint(name) {
    const rows = [R.title(S.settings.venue), R.center("Тестовый чек"), R.hr(), R.row("Принтер", name), R.row("Дата", dt(now())),
      R.row("Кириллица", "Ёё Жж Щщ №"), R.row("O'zbekcha", "O'yin maydonchasi"), R.big("ИТОГО", money(12345)), R.hr(),
      R.center("Если вы видите этот чек — принтер настроен правильно")];
    const r = await printWindows(rows, name);
    if (r && r.ok) toast(`${PPI18N.tr("Тестовый чек отправлен на")} «${esc(name)}». ${PPI18N.tr("Если он не вышел — проверьте бумагу и драйвер.")}`);
    else toast(`${PPI18N.tr("Не удалось напечатать:")} ${esc(PPI18N.tr((r && r.reason) || "ошибка"))}`, "bad");
  }
  const trRow = (r) => ({ ...r, t: r.t && PPI18N.tr(r.t), a: r.a && PPI18N.tr(r.a), b: r.b && PPI18N.tr(r.b) });
  async function sendToPrinter(rows, opts = {}) {
    if (S.settings.printMode === "usb") {
      try {
        // В чек по USB текст идёт мимо страницы, поэтому переводим его здесь
        await PPPrinter.print(rows.map(trRow), { paper: S.settings.paper, codepage: +S.settings.codepage || 17, drawer: !!opts.drawer });
        return;
      } catch (e) {
        toast(`USB-принтер: ${esc(e.message || e)}. Печать через Windows.`, "warn");
      }
    }
    printWindows(rows);
  }

  /* Чек после закрытия счёта */
  function printReceipt(bills) {
    bills = bills.filter((b) => b.status === "paid");
    if (!bills.length) return;
    const pr = desktop() && S.settings.printMode !== "usb" ? receiptPrinter() : null;
    if (desktop() && S.settings.printMode !== "usb" && (!pr || pr.state === "offline" || pr.state === "error"))
      toast(`🖨 ${pr ? esc(pr.displayName) + ": " + esc(PPI18N.tr(pr.text)) : PPI18N.tr("Принтер не выбран")}. ${PPI18N.tr("Чек можно напечатать позже: «Счета» → «🖨 Чек».")}`, "warn");
    const v = S.visits.find((x) => x.id === bills[0].visitId) || {};
    const b0 = bills[0], total = bills.reduce((a, b) => a + billTotal(b), 0);
    sendToPrinter([
      R.title(S.settings.venue), R.center(`Чек № ${bills.map((b) => b.no).join(", ")}`),
      R.center(`${new Date(b0.paidAt).toLocaleDateString("ru-RU", { timeZone: TZ })} ${hm(b0.paidAt)}`), R.hr(),
      R.row("Ребёнок", v.child || ""), ...(v.start ? [R.row("Время", hm(v.start) + "–" + hm(v.end))] : []), R.hr(),
      ...bills.flatMap((b) => b.items).map((i) => R.row(i.title, money(i.amount))), R.hr(),
      R.big("ИТОГО", money(total)), R.row("Способ оплаты", methodName(b0.method)), R.row("Кассир", staffName(b0.paidBy)), R.hr(),
      R.center("Не является фискальным чеком"), R.center("Спасибо за визит!"),
    ], { drawer: S.settings.drawer && b0.method === "cash" });
    log("Печать чека", `№${bills.map((b) => b.no).join(", ")}, ${money(total)}`);
  }

  function printTicket(v) {
    if (!can("print")) return toast("Нет права печатать талоны", "bad");
    const bills = visitBills(v);
    const unpaid = bills.some((b) => b.status === "open");
    sendToPrinter([
      R.title(S.settings.venue), R.center(`Талон посещения №${v.no}`), R.hr(),
      R.row("Ребёнок", v.child), R.row("Дата", new Date(v.start).toLocaleDateString("ru-RU", { timeZone: TZ })),
      R.row("Начало", hm(v.start)), R.row("Окончание", hm(v.end)), R.row("Тариф", v.tariffName), R.hr(),
      ...bills.flatMap((b) => [R.text(`Счёт №${b.no}`), ...b.items.map((i) => R.row(i.title, money(i.amount))), R.row("Итого", money(billTotal(b))),
        ...(b.status === "paid" ? [R.row("Оплачено", methodName(b.method) + " " + dt(b.paidAt)), R.row("Кассир", staffName(b.paidBy))] : [R.row("Статус", "НЕ ОПЛАЧЕН")]), R.hr()]),
      R.center(unpaid ? "Счёт ещё открыт" : "Счёт оплачен"), R.center("Не является фискальным чеком"),
    ]);
    log("Печать талона", `${v.child}, №${v.no}`);
  }

  function openShiftDialog() {
    modal(`<div class="dlg"><h2>Открыть смену</h2>
      <label class="f">Начальный остаток в кассе</label><input class="input" id="osCash" type="number" min="0" step="1000" value="200000" autofocus>
      <div class="foot"><button class="btn ghost" data-x>Отмена</button><button class="btn" id="osOk">Открыть смену</button></div></div>`, (m) => {
      $("[data-x]", m).onclick = close;
      $("#osOk", m).onclick = async (e) => {
        const cash = Math.max(0, Math.round(+$("#osCash", m).value || 0));
        busy(e.target, true);
        if (await act("shift.open", { openingCash: cash }, "Смена открыта")) close(); else busy(e.target, false);
      };
    });
  }

  function shiftCash(sh) {
    const cashIn = S.bills.filter((b) => b.shiftId === sh.id && b.status === "paid" && b.method === "cash").reduce((a, b) => a + billTotal(b), 0);
    const card = S.bills.filter((b) => b.shiftId === sh.id && b.status === "paid" && b.method === "card").reduce((a, b) => a + billTotal(b), 0);
    const ref = S.refunds.filter((r) => r.shiftId === sh.id && r.method === "cash").reduce((a, r) => a + r.amount, 0);
    const exp = S.expenses.filter((e) => e.shiftId === sh.id && e.source === "cash").reduce((a, e) => a + e.amount, 0);
    return { cashIn, card, ref, exp, expected: sh.openingCash + cashIn - ref - exp };
  }

  function staffDialog(u) {
    const isNew = !u;
    const d = u ? JSON.parse(JSON.stringify(u)) : { name: "", login: "", pin: "", role: "cashier", active: true, perms: permsOf("cashier") };
    const owner = d.role === "owner";
    let group = "";
    modal(`<div class="dlg wide"><h2>${isNew ? "Новый сотрудник" : "Сотрудник: " + esc(d.name)}</h2>
      <div class="grid2">
        <div><label class="f">Имя</label><input class="input" id="sfName" value="${esc(d.name)}" maxlength="40" ${isNew ? "autofocus" : ""}></div>
        <div><label class="f">Роль</label><select class="input" id="sfRole" ${owner ? "disabled" : ""}>
          ${owner ? `<option value="owner">Владелец</option>` : ""}
          <option value="cashier" ${d.role === "cashier" ? "selected" : ""}>Кассир</option>
          <option value="admin" ${d.role === "admin" ? "selected" : ""}>Администратор</option></select></div>
        <div><label class="f">Логин</label><input class="input" id="sfLogin" value="${esc(d.login)}" maxlength="30"></div>
        <div><label class="f">PIN / пароль</label><input class="input" id="sfPin" type="password" autocomplete="new-password" maxlength="100" placeholder="${isNew ? "минимум 4 символа" : "пусто — не менять"}"></div>
      </div>
      <label class="f">Права доступа ${owner ? "<span class='tag'>у владельца все права</span>" : "<span class='tag'>при смене роли права заполняются шаблоном — их можно изменить</span>"}</label>
      <div class="perm-list" id="sfPerms">${PERMS.map(([g, key, title, hint]) => {
        const head = g !== group ? `<div class="perm-group">${(group = g)}</div>` : "";
        return head + `<label class="perm"><div><b>${title}</b><small>${hint}</small></div><span class="switch"><input type="checkbox" data-p="${key}" ${owner || d.perms[key] ? "checked" : ""} ${owner ? "disabled" : ""}><span></span></span></label>`;
      }).join("")}</div>
      <div class="foot"><button class="btn ghost" data-x>Отмена</button><button class="btn" id="sfOk">${isNew ? "Создать" : "Сохранить"}</button></div></div>`, (m) => {
      $("[data-x]", m).onclick = close;
      $("#sfRole", m).onchange = (e) => {
        const p = permsOf(e.target.value);
        m.querySelectorAll("[data-p]").forEach((c) => (c.checked = p[c.dataset.p]));
      };
      $("#sfOk", m).onclick = async (e) => {
        const name = $("#sfName", m).value.trim(), login = $("#sfLogin", m).value.trim().toLowerCase(), pin = $("#sfPin", m).value.trim();
        if (!name || !login) return toast("Заполните имя и логин", "bad");
        if ((isNew || pin) && pin.length < 4) return toast("PIN — минимум 4 символа", "bad");
        const perms = {}; m.querySelectorAll("[data-p]").forEach((c) => (perms[c.dataset.p] = c.checked));
        const role = owner ? "owner" : $("#sfRole", m).value;
        busy(e.target, true);
        if (await act("staff.save", { id: d.id, name, login, password: pin, role, perms }, isNew ? "Сотрудник создан" : "Сохранено")) close(); else busy(e.target, false);
      };
    });
  }

  function tariffDialog(t) {
    const isNew = !t;
    const d = t || { name: "", minutes: 30, price: 25000, use: "both" };
    modal(`<div class="dlg"><h2>${isNew ? "Новый тариф" : "Изменить тариф"}</h2>
      <label class="f">Название</label><input class="input" id="tfName" value="${esc(d.name)}" placeholder="Например, 30 минут" autofocus maxlength="40">
      <div class="grid2">
        <div><label class="f">Длительность, минут</label><input class="input" id="tfMin" type="number" min="1" max="1440" value="${d.minutes}"></div>
        <div><label class="f">Цена, сум</label><input class="input" id="tfPrice" type="number" min="0" step="1000" value="${d.price}"></div>
      </div>
      <label class="f">Где использовать</label>
      <select class="input" id="tfUse">
        <option value="both" ${d.use === "both" ? "selected" : ""}>Вход и продление</option>
        <option value="base" ${d.use === "base" ? "selected" : ""}>Только вход</option>
        <option value="ext" ${d.use === "ext" ? "selected" : ""}>Только продление</option>
      </select>
      <div class="summary" id="tfPpm"></div>
      ${isNew ? "" : `<p style="color:var(--muted);font-size:13px">Изменение цены не меняет уже выставленные счета — в них сохранён снимок цены.</p>`}
      <div class="foot"><button class="btn ghost" data-x>Отмена</button><button class="btn" id="tfOk">Сохранить</button></div></div>`, (m) => {
      const ppm = () => { const mi = +$("#tfMin", m).value || 1, p = +$("#tfPrice", m).value || 0; $("#tfPpm", m).innerHTML = `Цена за минуту: <b>${money(p / mi)}</b> · за час: <b>${money((p / mi) * 60)}</b>`; };
      ppm(); $("#tfMin", m).oninput = ppm; $("#tfPrice", m).oninput = ppm;
      $("[data-x]", m).onclick = close;
      $("#tfOk", m).onclick = async (e) => {
        const name = $("#tfName", m).value.trim(), minutes = Math.round(+$("#tfMin", m).value), price = Math.round(+$("#tfPrice", m).value);
        if (!name || !(minutes > 0) || !(price >= 0)) return toast("Проверьте название, минуты и цену", "bad");
        busy(e.target, true);
        if (await act("tariff.save", { id: t && t.id, name, minutes, price, use: $("#tfUse", m).value }, "Сохранено")) close(); else busy(e.target, false);
      };
    });
  }

  function expenseDialog() {
    const sh = myShift();
    modal(`<div class="dlg"><h2>Новый расход</h2>
      <label class="f">Категория</label><select class="input" id="xCat">${["Хозтовары", "Аренда", "Зарплата", "Ремонт", "Реклама", "Прочее"].map((c) => `<option>${c}</option>`).join("")}</select>
      <label class="f">Сумма, сум</label><input class="input" id="xAmt" type="number" min="1" step="1000" autofocus>
      <label class="f">Комментарий</label><input class="input" id="xCom" maxlength="120">
      <label class="f">Источник денег</label><select class="input" id="xSrc">
        <option value="cash" ${sh ? "" : "disabled"}>Наличные из кассы текущей смены${sh ? "" : " (смена не открыта)"}</option>
        <option value="other" ${sh ? "" : "selected"}>Другой источник (не из кассы)</option></select>
      <div class="foot"><button class="btn ghost" data-x>Отмена</button><button class="btn" id="xOk">Добавить</button></div></div>`, (m) => {
      $("[data-x]", m).onclick = close;
      $("#xOk", m).onclick = async (e) => {
        const amount = Math.round(+$("#xAmt", m).value);
        if (!(amount > 0)) return toast("Введите сумму", "bad");
        busy(e.target, true);
        const ok = await act("expense.create", { category: $("#xCat", m).value, amount, comment: $("#xCom", m).value.trim(), source: $("#xSrc", m).value }, "Сохранено");
        if (ok) close(); else busy(e.target, false);
      };
    });
  }

  function refundDialog(b) {
    const max = billTotal(b) - refunded(b);
    if (max <= 0) return toast("По этому счёту уже всё возвращено", "warn");
    if (!requireShift()) return;
    modal(`<div class="dlg"><h2>Возврат по счёту №${b.no}</h2>
      <div class="summary">Оплачено: <b>${money(billTotal(b))}</b> (${b.method === "cash" ? "наличные" : "карта"}) · можно вернуть: <b>${money(max)}</b></div>
      <label class="f">Сумма возврата</label><input class="input" id="rAmt" type="number" min="1" max="${max}" value="${max}" autofocus>
      <label class="f">Причина (обязательно)</label><input class="input" id="rWhy" maxlength="120">
      <div class="foot"><button class="btn ghost" data-x>Отмена</button><button class="btn danger" id="rOk">Оформить возврат</button></div></div>`, (m) => {
      $("[data-x]", m).onclick = close;
      $("#rOk", m).onclick = async (e) => {
        const amount = Math.round(+$("#rAmt", m).value), reason = $("#rWhy", m).value.trim();
        if (!(amount > 0) || amount > max) return toast(`Сумма от 1 до ${money(max)}`, "bad");
        if (!reason) return toast("Укажите причину", "bad");
        busy(e.target, true);
        if (await act("refund.create", { billId: b.id, amount, reason }, "Возврат оформлен")) close(); else busy(e.target, false);
      };
    });
  }

  /* ---------- Экраны ---------- */
  function viewLogin() {
    const lbl = "display:block;font-weight:800;font-size:14px;margin:12px 0 6px";
    $("#root").innerHTML = `<div class="login"><div class="login-box">
      <a class="logo" href="index.html">${logoMark()}<span>Play<b>Pos</b></span></a>
      <div style="float:right;margin-top:6px">${PPI18N.switcher()}</div><h2 style="margin:18px 0 6px">Вход сотрудника</h2>
      <label style="${lbl}">Логин</label><input class="input" id="ll" autocomplete="username" autocapitalize="off" spellcheck="false" style="width:100%" autofocus>
      <label style="${lbl}">PIN / пароль</label><input class="input" id="lp" type="password" autocomplete="current-password" style="width:100%">
      <button class="btn big" id="lgo">Войти</button></div></div>`;
    const go = async () => {
      const b = $("#lgo");
      if (!$("#ll").value.trim() || !$("#lp").value) return toast("Введите логин и пароль", "bad");
      busy(b, true);
      try { await api("login", { login: $("#ll").value, password: $("#lp").value }); await refresh(); markSeen(); ui.route = "floor"; render(); }
      catch (e) { toast(esc(PPI18N.tr(e.message)), "bad"); busy(b, false); }
    };
    $("#lgo").onclick = go;
    $("#lp").onkeydown = (e) => { if (e.key === "Enter") go(); };
    $("#ll").onkeydown = (e) => { if (e.key === "Enter") $("#lp").focus(); };
    $("#ll").focus();
  }

  const logoMark = () => `<span class="logo-mark"><svg width="18" height="20" viewBox="0 0 18 20"><path d="M3 2.5c0-1.2 1.3-1.9 2.3-1.3l11 7.5c.9.6.9 2 0 2.6l-11 7.5C4.3 19.4 3 18.7 3 17.5z" fill="#fff"/></svg></span>`;

  function shell(title, actions, body) {
    const u = me(), sh = myShift();
    return `<div class="layout">
      <aside class="side" id="side">
        <a class="logo" href="index.html">${logoMark()}<span>Play<b>Pos</b></span></a>
        ${NAV.filter((n) => !n[3] || can(n[3])).map((n) => `<a class="nav ${ui.route === n[0] ? "on" : ""}" href="#${n[0]}"><span class="em">${n[1]}</span>${n[2]}</a>`).join("")}
        <div class="who">${printerChip()}<b>${esc(u.name)}</b>${ROLES[u.role].name}<br>${sh ? `Смена №${sh.no}, открыта в ${hm(sh.openedAt)}` : "Смена не открыта"}
          <div class="row" style="margin-top:8px"><button class="btn sm ghost" id="logout">Выйти</button>${PPI18N.switcher()}</div></div>
      </aside>
      <main class="main">
        <div class="top"><button class="btn sm ghost menu-btn" id="menu">☰</button><h1>${title}</h1>${actions}</div>
        ${body}
      </main></div>`;
  }

  function card(v) {
    const st = status(v), left = v.end - now();
    const paid = openBills(v).length === 0;
    const label = { ok: "Играет", warn: "Скоро заканчивается", bad: "Время вышло — позовите ребёнка" }[st];
    return `<div class="card ${st}" data-v="${v.id}">
      <div class="head"><h3>${esc(v.child)}</h3><span class="chip ${paid ? "paid" : "open"}">${paid ? "✓ оплачен" : "● не оплачен"}</span></div>
      <div class="time" data-t="${v.id}">${st === "bad" ? "+" : ""}${clock(left)}</div>
      <div class="st">${label}</div>
      <div class="meta">${hm(v.start)} → ${hm(v.end)} · ${esc(v.tariffName)}${v.ext.length ? ` · продлений: ${v.ext.length}` : ""}</div>
      <div class="acts">
        ${can("extend") ? `<button class="btn sm extend wide" data-a="extend">⏩ Продлить</button>` : ""}
        ${can("finish") ? `<button class="btn sm" data-a="finish">Завершить</button>` : ""}
        ${can("pay") && !paid ? `<button class="btn sm sun" data-a="bill">Счёт</button>` : ""}
        ${can("print") ? `<button class="btn sm ghost" data-a="print">Талон</button>` : ""}
      </div></div>`;
  }

  /* Категории площадки — фильтр над списком */
  const CATS = [["all", "Все"], ["bad", "Время вышло"], ["warn", "Скоро заканчивается"], ["ok", "Играет"], ["unpaid", "Не оплачены"]];
  function inCat(v, c) {
    if (c === "all") return true;
    if (c === "unpaid") return openBills(v).length > 0;
    return status(v) === c;
  }
  function catTabs() {
    const active = S.visits.filter((v) => !v.exitAt);
    return CATS.map(([k, t]) => `<button class="cat cat-${k} ${ui.cat === k ? "on" : ""}" data-c="${k}">${t}<span>${active.filter((v) => inCat(v, k)).length}</span></button>`).join("");
  }

  /* Компактная строка списка — помещается 20–30 детей на одном экране моноблока */
  function row(v) {
    const st = status(v), paid = openBills(v).length === 0;
    return `<div class="lrow ${st}" data-v="${v.id}">
      <span class="dot"></span>
      <div class="nm"><b>${esc(v.child)}</b><small><span class="cl">${CATS.find((c) => c[0] === st)[1]}</span> · ${hm(v.start)}–${hm(v.end)} · ${esc(v.tariffName)}${v.ext.length ? " · +" + v.ext.length : ""}</small></div>
      <div class="tm" data-t="${v.id}">${st === "bad" ? "+" : ""}${clock(v.end - now())}</div>
      <span class="pd ${paid ? "paid" : "open"}" title="${paid ? "Оплачен" : "Не оплачен"}">${paid ? "✓" : "!"}</span>
      <div class="ra">
        ${can("extend") ? `<button class="btn sm extend" data-a="extend">⏩ Продлить</button>` : ""}
        ${can("pay") ? `<button class="btn sm sun" data-a="bill" ${paid ? 'style="visibility:hidden" tabindex="-1"' : ""}>Счёт</button>` : ""}
        ${can("finish") ? `<button class="btn sm" data-a="finish">Выход</button>` : ""}
        ${can("print") ? `<button class="btn sm ghost" data-a="print" title="Талон">🖨</button>` : ""}
      </div></div>`;
  }

  function floorCards() {
    const q = ui.search.toLowerCase();
    const order = { bad: 0, warn: 1, ok: 2 };
    const list = S.visits.filter((v) => !v.exitAt && inCat(v, ui.cat) && (!q || v.child.toLowerCase().includes(q)))
      .sort((a, b) => order[status(a)] - order[status(b)] || a.end - b.end);
    return list.length ? list.map(ui.layout === "list" ? row : card).join("") : `<div class="empty" style="grid-column:1/-1">${ui.cat === "all" ? "Сейчас на площадке никого нет. Нажмите «Новое посещение»." : "В этой категории сейчас никого нет."}</div>`;
  }

  // Подписка программы (только в версии для Windows): предупреждение за 7 дней и после окончания
  function licenseBanner() {
    const l = S.license;
    if (!l) return "";
    if (!l.ok) return `<div class="banner" style="background:var(--danger-bg);color:#8d1422">⛔ ${esc(l.reason)}. Новые посещения и смены недоступны; дети на площадке и отчёты — доступны.</div>`;
    if (l.daysLeft != null && l.daysLeft <= 7) return `<div class="banner">⏳ Подписка PlayPos заканчивается через ${l.daysLeft} дн. (${new Date(l.until).toLocaleDateString("ru-RU", { timeZone: TZ })}). Продлите, чтобы касса работала без перерыва.</div>`;
    return "";
  }

  function viewFloor() {
    const active = S.visits.filter((v) => !v.exitAt);
    const over = active.filter((v) => status(v) === "bad").length;
    const today = dayKey(now());
    const paidToday = S.bills.filter((b) => b.status === "paid" && dayKey(b.paidAt) === today).reduce((a, b) => a + billTotal(b), 0);
    const unpaid = S.bills.filter((b) => b.status === "open").reduce((a, b) => a + billTotal(b), 0);
    return shell("Площадка",
      `<button class="btn ghost sm" id="snd">${ui.soundCtx && S.settings.sound ? "🔔 Звук включён" : "🔕 Включить звук"}</button>${can("sell") ? `<button class="btn" id="nv">＋ Новое посещение</button>` : ""}`,
      `${licenseBanner()}${!myShift() && can("shift") ? `<div class="banner">Смена не открыта — оплату принять нельзя.<button class="btn sm" id="os">Открыть смену</button></div>` : ""}
      <div class="stats">
        <div class="stat"><small>Детей на площадке</small><b>${active.length}</b></div>
        <div class="stat"><small>Просрочено</small><b style="color:${over ? "var(--danger)" : "inherit"}">${over}</b></div>
        <div class="stat"><small>Не оплачено</small><b>${money(unpaid)}</b></div>
        <div class="stat"><small>Получено сегодня</small><b>${can("reports") ? money(paidToday) : "—"}</b></div>
      </div>
      <div class="bar"><input class="input" id="q" placeholder="Поиск по имени" value="${esc(ui.search)}">
        <div class="seg" id="lay"><button data-l="list" class="${ui.layout === "list" ? "on" : ""}">☰ Список</button><button data-l="cards" class="${ui.layout === "cards" ? "on" : ""}">▦ Плитки</button></div></div>
      <div class="cats" id="cats">${catTabs()}</div>
      <div class="${ui.layout === "list" ? "vlist" : "cards"}" id="grid">${floorCards()}</div>`);
  }

  function mountFloor() {
    const nv = $("#nv"); if (nv) nv.onclick = newVisitDialog;
    const os = $("#os"); if (os) os.onclick = openShiftDialog;
    $("#snd").onclick = () => {
      try { ui.soundCtx = ui.soundCtx || new (window.AudioContext || window.webkitAudioContext)(); ui.soundCtx.resume(); } catch (e) {}
      S.settings.sound = true; saveDevice({ sound: true }); beep(); render(); toast("Звук включён — это тестовый сигнал");
    };
    $("#lay").onclick = (e) => {
      const b = e.target.closest("[data-l]"); if (!b) return;
      ui.layout = b.dataset.l; try { localStorage.setItem(LAYOUT, ui.layout); } catch (e) {}
      render();
    };
    $("#cats").onclick = (e) => {
      const b = e.target.closest("[data-c]"); if (!b) return;
      ui.cat = b.dataset.c; $("#cats").innerHTML = catTabs(); $("#grid").innerHTML = floorCards();
    };
    $("#q").oninput = (e) => { ui.search = e.target.value; $("#grid").innerHTML = floorCards(); };
    $("#grid").onclick = (e) => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const v = S.visits.find((x) => x.id === b.closest("[data-v]").dataset.v);
      ({ extend: extendDialog, finish: finishDialog, bill: (v) => checkoutPanel(v, false), print: printTicket })[b.dataset.a](v);
    };
  }

  function viewVisits() {
    const rows = [...S.visits].sort((a, b) => b.start - a.start).map((v) => {
      const st = status(v), sum = visitBills(v).reduce((a, b) => a + billTotal(b), 0), paid = openBills(v).length === 0;
      return `<tr><td>№${v.no}</td><td><b>${esc(v.child)}</b></td><td>${dt(v.start)}</td><td>${hm(v.end)}</td><td>${v.exitAt ? hm(v.exitAt) : "—"}</td>
        <td>${st === "done" ? `<span class="tag grey">завершено</span>` : st === "bad" ? `<span class="tag red">просрочено</span>` : `<span class="tag green">на площадке</span>`}</td>
        <td class="num">${money(sum)}</td><td>${paid ? `<span class="tag green">оплачен</span><br><small>${[...new Set(visitBills(v).map((b) => methodName(b.method)))].join(" + ")}</small>` : `<span class="tag red">открыт</span>`}</td>
        <td>${can("print") ? `<button class="btn sm ghost" data-p="${v.id}">Талон</button>` : ""}</td></tr>`;
    }).join("");
    return shell("Посещения", "", `<div class="panel tbl"><table><thead><tr><th>№</th><th>Ребёнок</th><th>Начало</th><th>План. конец</th><th>Выход</th><th>Статус</th><th class="num">Сумма</th><th>Оплата</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  function mountVisits() {
    document.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => printTicket(S.visits.find((v) => v.id === b.dataset.p))));
  }

  function viewBills() {
    const f = ui.billFilter;
    const list = S.bills.filter((b) => f === "all" || b.status === f).sort((a, b) => b.createdAt - a.createdAt);
    const rows = list.map((b) => {
      const v = S.visits.find((x) => x.id === b.visitId) || {};
      const r = refunded(b);
      return `<tr><td>№${b.no}</td><td>${esc(v.child)}</td><td>${b.items.map((i) => esc(i.title)).join("<br>")}</td><td class="num"><b>${money(billTotal(b))}</b>${r ? `<br><small style="color:var(--danger)">возврат −${money(r)}</small>` : ""}</td>
        <td>${b.status === "paid" ? `<span class="tag green">оплачен</span><br><small>${b.method === "cash" ? "наличные" : "карта"} · ${dt(b.paidAt)} · ${esc(staffName(b.paidBy))}</small>` : `<span class="tag red">открыт</span>`}</td>
        <td>${b.status === "open" ? `<button class="btn sm" data-pay="${b.id}">Оплатить</button>` : `${can("print") ? `<button class="btn sm ghost" data-rc="${b.id}">🖨 Чек</button> ` : ""}${can("refunds") ? `<button class="btn sm ghost" data-ref="${b.id}">Возврат</button>` : ""}`}</td></tr>`;
    }).join("");
    return shell("Счета", `<div class="seg" id="bf">${[["open", "Открытые"], ["paid", "Оплаченные"], ["all", "Все"]].map(([k, t]) => `<button data-f="${k}" class="${f === k ? "on" : ""}">${t}</button>`).join("")}</div>`,
      `<div class="panel tbl">${rows ? `<table><thead><tr><th>№</th><th>Ребёнок</th><th>Позиции</th><th class="num">Сумма</th><th>Статус</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">Счетов нет</div>`}</div>`);
  }
  function mountBills() {
    $("#bf").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { ui.billFilter = b.dataset.f; render(); } };
    document.querySelectorAll("[data-pay]").forEach((b) => (b.onclick = () => payDialog([S.bills.find((x) => x.id === b.dataset.pay)])));
    document.querySelectorAll("[data-rc]").forEach((b) => (b.onclick = () => printReceipt([S.bills.find((x) => x.id === b.dataset.rc)])));
    document.querySelectorAll("[data-ref]").forEach((b) => (b.onclick = () => refundDialog(S.bills.find((x) => x.id === b.dataset.ref))));
  }

  function viewShifts() {
    const sh = myShift();
    let cur = `<div class="panel"><h2>Моя смена</h2><p>Смена не открыта.</p><button class="btn" id="os">Открыть смену</button></div>`;
    if (sh) {
      const c = shiftCash(sh);
      cur = `<div class="panel"><h2>Смена №${sh.no} · открыта ${dt(sh.openedAt)}</h2>
        <div class="kpis">
          <div class="kpi"><small>Начальный остаток</small><b>${money(sh.openingCash)}</b></div>
          <div class="kpi"><small>Наличные оплаты</small><b>${money(c.cashIn)}</b></div>
          <div class="kpi"><small>Карта (не в кассе)</small><b>${money(c.card)}</b></div>
          <div class="kpi"><small>Возвраты наличными</small><b>−${money(c.ref)}</b></div>
          <div class="kpi"><small>Расходы из кассы</small><b>−${money(c.exp)}</b></div>
          <div class="kpi hl"><small>Ожидается в кассе</small><b>${money(c.expected)}</b></div>
        </div>
        <label style="display:block;font-weight:800;margin:16px 0 6px">Фактически наличных в кассе</label>
        <div class="row"><input class="input" id="cc" type="number" min="0" step="1000" placeholder="${c.expected}"><button class="btn" id="cs">Закрыть смену</button></div>
        <p style="color:var(--muted);font-size:13px">Дети на площадке и открытые счета не пропадают после закрытия смены — их продолжит следующая смена.</p></div>`;
    }
    const rows = [...S.shifts].reverse().map((s) => {
      const c = shiftCash(s), diff = s.closedAt ? s.countedCash - c.expected : null;
      return `<tr><td>№${s.no}</td><td>${esc(staffName(s.staffId))}</td><td>${dt(s.openedAt)}</td><td>${s.closedAt ? dt(s.closedAt) : `<span class="tag green">открыта</span>`}</td>
        <td class="num">${money(c.cashIn)}</td><td class="num">${money(c.card)}</td><td class="num">${money(c.expected)}</td>
        <td class="num">${s.closedAt ? money(s.countedCash) : "—"}</td><td class="num">${diff === null ? "—" : `<b style="color:${diff ? "var(--danger)" : "var(--ok)"}">${diff > 0 ? "+" : ""}${money(diff)}</b>`}</td></tr>`;
    }).join("");
    return shell("Смены", "", cur + `<div class="panel tbl"><h2>История смен</h2><table><thead><tr><th>№</th><th>Кассир</th><th>Открыта</th><th>Закрыта</th><th class="num">Наличные</th><th class="num">Карта</th><th class="num">Ожидалось</th><th class="num">Факт</th><th class="num">Расхождение</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  function mountShifts() {
    const os = $("#os"); if (os) os.onclick = openShiftDialog;
    const cs = $("#cs");
    if (cs) cs.onclick = async () => {
      const v = $("#cc").value;
      if (v === "") return toast("Введите фактическую сумму наличных", "bad");
      busy(cs, true);
      const out = await act("shift.close", { countedCash: Math.round(+v) });
      if (!out) return busy(cs, false);
      toast(out.diff === 0 ? "Смена закрыта, касса сошлась ✓" : `Смена закрыта. Расхождение: ${money(out.diff)}`, out.diff ? "warn" : "");
    };
  }

  function viewExpenses() {
    const rows = [...S.expenses].sort((a, b) => b.at - a.at).map((e) => `<tr><td>${dt(e.at)}</td><td>${esc(e.category)}</td><td>${esc(e.comment)}</td><td>${e.source === "cash" ? "Касса смены" : "Другой источник"}</td><td>${esc(staffName(e.staffId))}</td><td class="num"><b>${money(e.amount)}</b></td></tr>`).join("");
    return shell("Расходы", `<button class="btn" id="ax">＋ Добавить расход</button>`,
      `<div class="panel tbl">${rows ? `<table><thead><tr><th>Дата</th><th>Категория</th><th>Комментарий</th><th>Источник</th><th>Автор</th><th class="num">Сумма</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">Расходов пока нет</div>`}</div>`);
  }

  function inPeriod(ts) {
    if (!ts) return false;
    const k = dayKey(ts), t = now();
    if (ui.period === "today") return k === dayKey(t);
    if (ui.period === "yesterday") return k === dayKey(t - 86400000);
    return ts >= t - 7 * 86400000;
  }
  function viewReports() {
    const who = ui.repStaff || "all";
    const mine = (sid) => who === "all" || sid === who;
    const paid = S.bills.filter((b) => b.status === "paid" && inPeriod(b.paidAt) && mine(b.paidBy));
    const sum = (arr) => arr.reduce((a, b) => a + billTotal(b), 0);
    const cash = sum(paid.filter((b) => b.method === "cash")), card = sum(paid.filter((b) => b.method === "card"));
    const refs = S.refunds.filter((r) => inPeriod(r.at) && mine(r.staffId));
    const refunds = refs.reduce((a, r) => a + r.amount, 0);
    const exp = S.expenses.filter((e) => inPeriod(e.at) && mine(e.staffId)).reduce((a, e) => a + e.amount, 0);
    const extSum = paid.flatMap((b) => b.items).filter((i) => i.kind === "ext").reduce((a, i) => a + i.amount, 0);
    const started = S.visits.filter((v) => inPeriod(v.start)), finished = S.visits.filter((v) => inPeriod(v.exitAt));
    const unpaid = S.bills.filter((b) => b.status === "open").reduce((a, b) => a + billTotal(b), 0);
    const pop = {};
    started.forEach((v) => (pop[v.tariffName] = (pop[v.tariffName] || 0) + 1));
    const popRows = Object.entries(pop).sort((a, b) => b[1] - a[1]).map(([n, c]) => `<tr><td>${esc(n)}</td><td class="num">${c}</td></tr>`).join("");

    // Касса по кассирам: кто сколько принял наличными и картой
    const by = {};
    const row = (sid) => (by[sid] = by[sid] || { n: 0, cash: 0, card: 0, ref: 0 });
    paid.forEach((b) => { const r = row(b.paidBy); r.n++; r[b.method] += billTotal(b); });
    refs.forEach((x) => (row(x.staffId).ref += x.amount));
    const cashierRows = Object.entries(by).map(([sid, r]) => `<tr><td><b>${esc(staffName(sid))}</b></td><td class="num">${r.n}</td><td class="num">${money(r.cash)}</td><td class="num">${money(r.card)}</td><td class="num">${r.ref ? "−" + money(r.ref) : "—"}</td><td class="num"><b>${money(r.cash + r.card - r.ref)}</b></td></tr>`).join("");

    const shifts = S.shifts.filter((s) => mine(s.staffId) && (inPeriod(s.openedAt) || inPeriod(s.closedAt) || !s.closedAt));
    const shiftRows = shifts.map((s) => {
      const c = shiftCash(s), diff = s.closedAt ? s.countedCash - c.expected : null;
      return `<tr><td>№${s.no}</td><td>${esc(staffName(s.staffId))}</td><td>${dt(s.openedAt)} – ${s.closedAt ? hm(s.closedAt) : `<span class="tag green">открыта</span>`}</td>
        <td class="num">${money(c.cashIn)}</td><td class="num">${money(c.card)}</td><td class="num">${money(c.expected)}</td>
        <td class="num">${s.closedAt ? money(s.countedCash) : "—"}</td><td class="num">${diff === null ? "—" : `<b style="color:${diff ? "var(--danger)" : "var(--ok)"}">${diff > 0 ? "+" : ""}${money(diff)}</b>`}</td></tr>`;
    }).join("");

    const payRows = [...paid].sort((a, b) => b.paidAt - a.paidAt).map((b) => {
      const v = S.visits.find((x) => x.id === b.visitId) || {};
      return `<tr><td>${dt(b.paidAt)}</td><td>${esc(v.child)}</td><td>№${b.no}<br><small>${b.items.map((i) => esc(i.title)).join(", ")}</small></td><td>${esc(staffName(b.paidBy))}</td>
        <td><span class="tag ${b.method === "cash" ? "green" : ""}">${b.method === "cash" ? "💵 Наличные" : "💳 Карта"}</span></td><td class="num"><b>${money(billTotal(b))}</b></td></tr>`;
    }).join("");

    const staffOpts = `<select class="input" id="rs" style="padding:8px 10px"><option value="all">Все кассиры</option>${S.staff.map((u) => `<option value="${u.id}" ${who === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select>`;
    return shell("Отчёты", `${staffOpts}<div class="seg" id="pf">${[["today", "Сегодня"], ["yesterday", "Вчера"], ["week", "7 дней"]].map(([k, t]) => `<button data-f="${k}" class="${ui.period === k ? "on" : ""}">${t}</button>`).join("")}</div>`,
      `<div class="panel"><h2>Деньги${who === "all" ? "" : " — " + esc(staffName(who))}</h2><div class="kpis">
        <div class="kpi"><small>Получено всего</small><b>${money(cash + card)}</b></div>
        <div class="kpi"><small>💵 Наличные</small><b>${money(cash)}</b></div>
        <div class="kpi"><small>💳 Карта</small><b>${money(card)}</b></div>
        <div class="kpi"><small>в т.ч. продления</small><b>${money(extSum)}</b></div>
        <div class="kpi"><small>Возвраты</small><b>−${money(refunds)}</b></div>
        <div class="kpi"><small>Расходы</small><b>−${money(exp)}</b></div>
        <div class="kpi hl"><small>Результат по внесённым расходам</small><b>${money(cash + card - refunds - exp)}</b></div>
        <div class="kpi"><small>Средний оплаченный счёт</small><b>${money(paid.length ? (cash + card) / paid.length : 0)}</b></div>
        <div class="kpi"><small>Открытые неоплаченные счета</small><b>${money(unpaid)}</b></div>
      </div><p style="color:var(--muted);font-size:13px">«Результат по внесённым расходам» — не чистая прибыль: учтены только расходы, внесённые в программу.</p></div>
      <div class="panel tbl"><h2>Касса по кассирам</h2>${cashierRows ? `<table><thead><tr><th>Кассир</th><th class="num">Оплат</th><th class="num">💵 Наличные</th><th class="num">💳 Карта</th><th class="num">Возвраты</th><th class="num">Итого</th></tr></thead><tbody>${cashierRows}</tbody>
        <tfoot><tr><td><b>Всего</b></td><td class="num"><b>${paid.length}</b></td><td class="num"><b>${money(cash)}</b></td><td class="num"><b>${money(card)}</b></td><td class="num"><b>${refunds ? "−" + money(refunds) : "—"}</b></td><td class="num"><b>${money(cash + card - refunds)}</b></td></tr></tfoot></table>` : "Нет оплат за период"}</div>
      <div class="panel tbl"><h2>Смены и сверка кассы</h2>${shiftRows ? `<table><thead><tr><th>Смена</th><th>Кассир</th><th>Время</th><th class="num">Наличные</th><th class="num">Карта</th><th class="num">Ожидалось в кассе</th><th class="num">Факт</th><th class="num">Расхождение</th></tr></thead><tbody>${shiftRows}</tbody></table>` : "Нет смен за период"}</div>
      <div class="grid2">
        <div class="panel"><h2>Посещения</h2><div class="kpis">
          <div class="kpi"><small>Начато</small><b>${started.length}</b></div><div class="kpi"><small>Завершено</small><b>${finished.length}</b></div>
          <div class="kpi"><small>Сейчас на площадке</small><b>${S.visits.filter((v) => !v.exitAt).length}</b></div>
          <div class="kpi"><small>Продлений</small><b>${S.visits.flatMap((v) => v.ext).filter((e) => inPeriod(e.at)).length}</b></div></div></div>
        <div class="panel tbl"><h2>Популярные тарифы</h2>${popRows ? `<table><tbody>${popRows}</tbody></table>` : "Нет данных"}</div>
      </div>
      <div class="panel tbl"><h2>Все оплаты</h2>${payRows ? `<table><thead><tr><th>Время</th><th>Ребёнок</th><th>Счёт</th><th>Кассир</th><th>Способ</th><th class="num">Сумма</th></tr></thead><tbody>${payRows}</tbody></table>` : "Нет оплат за период"}</div>
      <div class="panel tbl"><h2>Журнал действий</h2><table><tbody>${S.log.slice(0, 25).map((l) => `<tr><td>${dt(l.at)}</td><td>${esc(staffName(l.staffId))}</td><td><b>${esc(l.action)}</b></td><td>${esc(l.detail)}</td></tr>`).join("") || "<tr><td>Пока пусто</td></tr>"}</tbody></table></div>`);
  }
  function mountReports() {
    $("#pf").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { ui.period = b.dataset.f; render(); } };
    $("#rs").onchange = (e) => { ui.repStaff = e.target.value; render(); };
  }

  function viewTariffs() {
    const list = [...S.tariffs].sort((a, b) => a.archived - b.archived || a.minutes - b.minutes);
    const useName = { both: "вход и продление", base: "только вход", ext: "только продление" };
    return shell("Тарифы", `<button class="btn" id="at">＋ Новый тариф</button>`,
      `<div class="panel"><h2>Ваши тарифы</h2><div class="tariffs">${list.map((t) => `<div class="tariff ${t.archived ? "arch" : ""}">
        <div class="mins">${t.minutes >= 60 && t.minutes % 60 === 0 ? t.minutes / 60 + " ч" : t.minutes + " мин"}</div>
        <b>${esc(t.name)}</b><div class="pr">${money(t.price)}</div>
        <small style="color:var(--muted)">${useName[t.use]} · ${money(t.price / t.minutes)}/мин</small>
        <div class="row" style="margin-top:6px">${t.archived ? `<button class="btn sm ghost" data-r="${t.id}">Вернуть</button>` : `<button class="btn sm ghost" data-e="${t.id}">Изменить</button><button class="btn sm ghost" data-ar="${t.id}">В архив</button>`}</div>
      </div>`).join("")}</div>
      <p style="color:var(--muted);font-size:13px">Тарифы не удаляются, а архивируются: история посещений и счетов сохраняет цену на момент продажи.</p></div>
      <div class="panel"><h2>Готовые шаблоны</h2><p style="color:var(--muted);margin-top:-6px">Типичные схемы игровых площадок. Добавьте и поправьте цены под свой рынок.</p>
        <div class="presets">${PRESETS.map((p, i) => `<div class="preset"><h4>${p.name}</h4><p>${p.desc}</p><div style="font-size:13px;margin-bottom:10px">${p.items.map((x) => `${x[0]} — ${money(x[2])}`).join("<br>")}</div><button class="btn sm" data-pr="${i}">Добавить набор</button></div>`).join("")}</div></div>`);
  }
  function mountTariffs() {
    $("#at").onclick = () => tariffDialog();
    const t = (x) => S.tariffs.find((y) => y.id === x);
    document.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => tariffDialog(t(b.dataset.e))));
    document.querySelectorAll("[data-ar]").forEach((b) => (b.onclick = () => act("tariff.archive", { id: b.dataset.ar, archived: true })));
    document.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => act("tariff.archive", { id: b.dataset.r, archived: false })));
    document.querySelectorAll("[data-pr]").forEach((b) => (b.onclick = () => {
      const p = PRESETS[+b.dataset.pr];
      act("tariff.addMany", { title: p.name, items: p.items.map(([name, minutes, price, use]) => ({ name, minutes, price, use: use || "both" })) }, `Набор «${p.name}» добавлен`);
    }));
  }

  function viewStaff() {
    return shell("Сотрудники", `<button class="btn" id="as">＋ Добавить сотрудника</button>`,
      `<div class="banner info">Откройте сотрудника, чтобы включить или выключить нужные права. Выключатель на карточке — блокировка входа.</div>
      <div class="staff">${S.staff.map((u) => {
        const on = PERMS.filter((p) => u.role === "owner" || u.perms[p[1]]);
        const self = u.id === S.currentUserId;
        return `<div class="person ${u.active ? "" : "off"}">
          <div class="row"><span class="ava">${esc(PPI18N.tr(u.name)[0])}</span><div style="flex:1"><b style="font-size:17px">${esc(u.name)}</b><br><small style="color:var(--muted)">${ROLES[u.role].name} · ${esc(u.login)}</small></div>
            <label class="switch" title="${u.active ? "Активен" : "Заблокирован"}"><input type="checkbox" data-act="${u.id}" ${u.active ? "checked" : ""} ${u.role === "owner" || self ? "disabled" : ""}><span></span></label></div>
          <div class="perms-mini">${on.map((p) => `<span class="tag green">${p[2]}</span>`).join("")}${on.length === PERMS.length ? "" : PERMS.filter((p) => !on.includes(p)).map((p) => `<span class="tag grey">${p[2]}</span>`).join("")}</div>
          <button class="btn sm ghost" data-ed="${u.id}">Открыть и настроить доступ</button></div>`;
      }).join("")}</div>`);
  }
  function mountStaff() {
    $("#as").onclick = () => staffDialog();
    document.querySelectorAll("[data-ed]").forEach((b) => (b.onclick = () => staffDialog(S.staff.find((u) => u.id === b.dataset.ed))));
    document.querySelectorAll("[data-act]").forEach((c) => (c.onchange = () => act("staff.active", { id: c.dataset.act, active: c.checked }, "Сохранено")));
  }

  function viewSettings() {
    let pal = "jungle"; try { pal = localStorage.getItem(PALETTE) || pal; } catch (e) {}
    const st = S.settings;
    const printersPanel = desktop() ? `<div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Принтеры</h2>
        <div class="row"><button class="btn sm ghost" id="prRefresh">↻ Обновить</button><button class="btn sm ghost" id="prWin">Настройки принтеров Windows</button></div></div>
        <p class="note">Выберите принтер для чеков и нажмите «Тестовый чек». Состояние обновляется само каждые 10 секунд. Новый принтер: подключите его, установите драйвер (бумага 80 мм, поля 0) и нажмите «Обновить».</p>
        <div class="tbl"><table><thead><tr><th>Чеки</th><th>Принтер</th><th>Состояние</th><th></th></tr></thead><tbody id="prList">${printerRows()}</tbody></table></div></div>` : "";
    return shell("Настройки", "", `${printersPanel}<div class="grid2">
      <div class="panel"><h2>Площадка</h2>
        <label style="display:block;font-weight:800;margin:6px 0">Название (печатается на талоне)</label><input class="input" id="stV" value="${esc(st.venue)}" style="width:100%">
        <label style="display:block;font-weight:800;margin:14px 0 6px">Ширина бумаги принтера</label>
        <div class="seg" id="stP"><button data-v="58" class="${st.paper === "58" ? "on" : ""}">58 мм</button><button data-v="80" class="${st.paper === "80" ? "on" : ""}">80 мм</button></div>
        <label style="display:block;font-weight:800;margin:14px 0 6px">Способ печати</label>
        <div class="seg" id="stM"><button data-m="windows" class="${st.printMode !== "usb" ? "on" : ""}">Windows (драйвер)</button><button data-m="usb" class="${st.printMode === "usb" ? "on" : ""}">USB напрямую</button></div>
        <div id="usbBox" class="summary" style="${st.printMode === "usb" ? "" : "display:none"}">
          ${PPPrinter.supported() ? `<div>Принтер: <b id="usbName">${esc((PPPrinter.saved() || {}).name || "не подключён")}</b></div>
          <div class="row" style="margin:8px 0"><button class="btn sm" id="usbConn">Подключить принтер</button><button class="btn sm ghost" id="usbTest">Тестовый чек</button></div>
          <div class="row">Кодовая страница (ESC t) <input class="input" id="stCp" type="number" min="0" max="255" value="${st.codepage ?? 17}" style="width:90px"></div>
          <label class="row" style="margin-top:8px"><input type="checkbox" id="stDr" ${st.drawer ? "checked" : ""}> Открывать денежный ящик при оплате наличными</label>` : `<b>Этот браузер не поддерживает USB-печать — откройте кассу в Chrome или Edge.</b>`}
          <p class="note">Перед подключением замените драйвер принтера на WinUSB программой Zadig (как в Clopos). После этого обычная печать Windows на этот принтер работать не будет.</p>
        </div>
        <label class="perm" style="margin-top:14px"><div><b>Печатать чек после оплаты</b><small>Чек выходит сразу, когда кассир подтверждает оплату</small></div><span class="switch"><input type="checkbox" id="stR" ${st.autoReceipt !== false ? "checked" : ""}><span></span></span></label>
        <label style="display:block;font-weight:800;margin:14px 0 6px">Предупреждать за, минут</label><input class="input" id="stW" type="number" min="1" max="30" value="${st.warn}">
        <div class="row" style="margin-top:16px"><button class="btn" id="stSave">Сохранить</button></div></div>
      <div class="panel"><h2>Цвета бренда</h2>
        <div class="presets">${[["sunny", "Солнечная площадка", "#ff7a00"], ["candy", "Конфетти", "#7b5cff"], ["jungle", "Джунгли", "#0fb5a5"], ["night", "Ночь (как на макете)", "#2f62f0"]].map(([k, n, c]) => `<button class="pick ${pal === k ? "on" : ""}" data-pal="${k}"><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${c};vertical-align:middle"></span> <b style="display:inline">${n}</b></button>`).join("")}</div>
        <p class="note" style="margin-top:20px">Название площадки и время предупреждения общие для всех касс. Принтер, бумага и печать чека настраиваются на каждом компьютере отдельно.</p></div></div>`);
  }
  function mountSettings() {
    let paper = S.settings.paper, mode = S.settings.printMode || "windows";
    if (desktop()) {
      loadPrinters();
      $("#prRefresh").onclick = () => { ui.printers = null; $("#prList").innerHTML = printerRows(); loadPrinters(); };
      $("#prWin").onclick = () => window.PlayPosDesktop.openPrinterSettings();
      $("#prList").onchange = (e) => {
        if (e.target.name !== "rp") return;
        S.settings.receiptPrinter = e.target.value; saveDevice({ receiptPrinter: e.target.value });
        toast(`${PPI18N.tr("Чеки будут печататься на")} «${esc(e.target.value)}»`); loadPrinters();
      };
      $("#prList").onclick = (e) => { const b = e.target.closest("[data-test]"); if (b) testPrint(b.dataset.test); };
    }
    $("#stM").onclick = (e) => {
      const b = e.target.closest("[data-m]"); if (!b) return; mode = b.dataset.m;
      document.querySelectorAll("#stM button").forEach((x) => x.classList.toggle("on", x === b));
      $("#usbBox").style.display = mode === "usb" ? "" : "none";
    };
    const conn = $("#usbConn");
    if (conn) conn.onclick = async () => {
      try { const d = await PPPrinter.connect(); $("#usbName").textContent = d.productName || "USB-принтер"; toast("Принтер подключён"); }
      catch (e) { toast(`Не удалось подключить: ${esc(e.message || e)}`, "bad"); }
    };
    const test = $("#usbTest");
    if (test) test.onclick = async () => {
      try {
        await PPPrinter.print([R.title(S.settings.venue), R.center("Тестовый чек"), R.hr(), R.row("Принтер", "OK"), R.row("Кириллица", "Ёё Жж Щщ №"), R.hr(), R.center("PlayPos")].map(trRow),
          { paper, codepage: +$("#stCp").value || 17, drawer: false });
        toast("Тестовый чек отправлен");
      } catch (e) { toast(`Ошибка печати: ${esc(e.message || e)}`, "bad"); }
    };
    $("#stP").onclick = (e) => { const b = e.target.closest("[data-v]"); if (!b) return; paper = b.dataset.v; document.querySelectorAll("#stP button").forEach((x) => x.classList.toggle("on", x === b)); };
    $("#stSave").onclick = async () => {
      const dev = { paper, autoReceipt: $("#stR").checked, printMode: mode };
      if ($("#stCp")) dev.codepage = Math.min(255, Math.max(0, Math.round(+$("#stCp").value || 17)));
      if ($("#stDr")) dev.drawer = $("#stDr").checked;
      saveDevice(dev);
      await act("settings.save", { venue: $("#stV").value.trim(), warn: Math.round(+$("#stW").value || 5) }, "Сохранено");
    };
    document.querySelectorAll("[data-pal]").forEach((b) => (b.onclick = () => { applyPalette(b.dataset.pal, true); render(); }));
  }

  const VIEWS = {
    floor: [viewFloor, mountFloor], visits: [viewVisits, mountVisits], bills: [viewBills, mountBills], shifts: [viewShifts, mountShifts],
    expenses: [viewExpenses, () => ($("#ax").onclick = expenseDialog)], reports: [viewReports, mountReports],
    tariffs: [viewTariffs, mountTariffs], staff: [viewStaff, mountStaff], settings: [viewSettings, mountSettings],
  };

  function render() {
    if (!S) return viewLogin();
    const u = me();
    if (!u || !u.active) { S = null; return viewLogin(); }
    const nav = NAV.find((n) => n[0] === ui.route);
    if (!nav || (nav[3] && !can(nav[3]))) ui.route = "floor"; // права проверяются и при прямом переходе по ссылке
    if (location.hash.slice(1) !== ui.route) history.replaceState(null, "", "#" + ui.route);
    const [view, mount] = VIEWS[ui.route];
    $("#root").innerHTML = view();
    mount();
    $("#logout").onclick = async () => { try { await api("logout"); } catch (e) {} S = null; close(); render(); };
    $("#menu").onclick = () => $("#side").classList.toggle("open");
    ui.sig = floorSig();
  }

  function applyPalette(p, persist) {
    document.documentElement.dataset.palette = p;
    if (persist) try { localStorage.setItem(PALETTE, p); } catch (e) {}
  }

  const floorSig = () => S.visits.filter((v) => !v.exitAt).map((v) => v.id + status(v) + openBills(v).length).join("|");

  /* Таймер: каждую секунду пересчитываем остаток от сохранённого времени окончания */
  function tick() {
    if (!S || !me()) return;
    S.visits.filter((v) => !v.exitAt).forEach((v) => {
      const st = status(v);
      if (st === "warn" && !ui.notified[v.id + "w"]) {
        ui.notified[v.id + "w"] = 1;
        if (can("extend")) toast(`${esc(v.child)}: осталось меньше ${S.settings.warn} мин`, "warn", "Продлить", () => extendDialog(v));
      }
      if (st === "bad" && !ui.notified[v.id + "e"]) {
        ui.notified[v.id + "e"] = 1; ui.notified[v.id + "w"] = 1;
        beep();
        toast(`⏰ ${esc(v.child)}: время вышло`, "bad", can("extend") ? "Продлить" : null, () => extendDialog(v));
      }
    });
    if (ui.route !== "floor" || !$("#grid")) return;
    if (floorSig() !== ui.sig) { ui.sig = floorSig(); $("#cats").innerHTML = catTabs(); $("#grid").innerHTML = floorCards(); return; }
    document.querySelectorAll("[data-t]").forEach((el) => {
      const v = S.visits.find((x) => x.id === el.dataset.t);
      if (v) el.textContent = (status(v) === "bad" ? "+" : "") + clock(v.end - now());
    });
  }

  /* ---------- Запуск ---------- */
  // Посещения, которые уже были просрочены при открытии, не должны сразу сыпать уведомлениями
  function markSeen() {
    S.visits.forEach((v) => { if (v.exitAt) return; const st = status(v); if (st === "bad") ui.notified[v.id + "e"] = ui.notified[v.id + "w"] = 1; if (st === "warn") ui.notified[v.id + "w"] = 1; });
  }
  try { ui.layout = localStorage.getItem(LAYOUT) || "list"; } catch (e) {}
  try { applyPalette(localStorage.getItem(PALETTE) || "jungle"); } catch (e) {}
  ui.route = (location.hash || "#floor").slice(1);
  window.addEventListener("hashchange", async () => {
    ui.route = location.hash.slice(1) || "floor"; close();
    try { if (S) await refresh(); } catch (e) {}
    render();
  });
  // Синхронизация между кассами: каждые 5 секунд берём свежие данные с сервера
  async function poll() {
    if (!S || document.hidden || !$("#modal").hidden) return;
    try {
      await refresh();
      const typing = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
      if (ui.route === "floor" && !typing) render();
    } catch (e) {}
  }
  setInterval(poll, 5000);
  // Состояние принтера: в настройках каждые 10 секунд, в остальное время — раз в 30 секунд
  let prTick = 0;
  setInterval(() => { prTick++; if (S && desktop() && (ui.route === "settings" || prTick % 3 === 0)) loadPrinters(); }, 10000);
  if (desktop()) setTimeout(loadPrinters, 1500);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  (async () => {
    $("#root").innerHTML = `<div class="login"><div class="login-box">${PPI18N.tr("Загрузка…")}</div></div>`;
    try {
      const info = await api("info");
      if (info.desktop && info.license && !info.license.activated) { location.href = "activate"; return; }
      if (info.needsSetup) { location.href = "setup"; return; }
    } catch (e) {}
    try { await refresh(); markSeen(); } catch (e) { S = null; }
    render();
  })();
  setInterval(tick, 1000);
})();
