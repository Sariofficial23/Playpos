/* PlayPos — админ-панель владельца платформы: клиенты (площадки), логины для активации программы, оплаты подписки. */
(function () {
  "use strict";
  const TZ = "Asia/Tashkent";
  const DAY = 86400000;
  let S = null;
  const ui = { tab: "clients", filter: "all", q: "" };

  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ") + " сум";
  const date = (ts) => (ts ? new Date(ts).toLocaleDateString("ru-RU", { timeZone: TZ }) : "—");
  const dt = (ts) => (ts ? new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "—");
  const genPass = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

  function toast(msg, kind = "") {
    const el = document.createElement("div");
    el.className = "toast " + kind; el.textContent = msg;
    $("#toasts").appendChild(el); setTimeout(() => el.remove(), 4000);
  }
  function modal(html, mount) {
    const m = $("#modal"); m.innerHTML = html; m.hidden = false;
    m.onclick = (e) => { if (e.target === m) close(); };
    mount(m);
    const f = m.querySelector("[autofocus]"); if (f) f.focus();
  }
  function close() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  async function api(op, data = {}) {
    let r;
    try { r = await fetch("/api/rpc", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-PlayPos": "1" }, body: JSON.stringify({ op, ...data }) }); }
    catch (e) { throw new Error("Нет связи с сервером"); }
    const out = await r.json().catch(() => ({}));
    if (r.status === 401 && S) { S = null; render(); }
    if (!r.ok) throw new Error(out.error || "Ошибка сервера");
    return out;
  }
  async function refresh() { S = await api("admin.state"); }
  async function act(op, data, ok) {
    try { const out = await api(op, data); await refresh(); render(); if (ok) toast(ok); return out || true; }
    catch (e) { toast(e.message, "bad"); return null; }
  }

  // Состояние подписки клиента
  function stateOf(c) {
    if (!c.active) return { k: "off", t: "Отключён", cls: "grey" };
    if (c.lifetime) return { k: "ok", t: "Бессрочно", cls: "green" };
    const left = Math.ceil((c.until - Date.now()) / DAY);
    if (left <= 0) return { k: "expired", t: "Истёк", cls: "red" };
    if (left <= 7) return { k: "soon", t: `Осталось ${left} дн.`, cls: "" };
    return { k: "ok", t: `Активен · ${left} дн.`, cls: "green" };
  }

  /* ---------- Вход и первая настройка ---------- */
  function viewLogin(needsSetup) {
    const lb = "display:block;font-weight:800;font-size:14px;margin:12px 0 6px";
    $("#root").innerHTML = `<div class="login"><div class="login-box">
      <a class="logo"><span class="logo-mark"><svg width="18" height="20" viewBox="0 0 18 20"><path d="M3 2.5c0-1.2 1.3-1.9 2.3-1.3l11 7.5c.9.6.9 2 0 2.6l-11 7.5C4.3 19.4 3 18.7 3 17.5z" fill="#fff"/></svg></span><span>Play<b>Pos</b></span></a>
      <h2 style="margin:18px 0 6px">${needsSetup ? "Создание администратора" : "Админ-панель PlayPos"}</h2>
      ${needsSetup ? `<p style="color:var(--muted);margin:0">Один раз: введите код установки (SETUP_TOKEN из настроек Vercel), вашу почту и пароль.</p>
        <label style="${lb}">Код установки</label><input class="input" id="tk" type="password" style="width:100%">` : ""}
      <label style="${lb}">Почта</label><input class="input" id="em" type="email" autocomplete="username" style="width:100%" autofocus>
      <label style="${lb}">Пароль${needsSetup ? " (минимум 8 символов)" : ""}</label><input class="input" id="pw" type="password" autocomplete="${needsSetup ? "new-password" : "current-password"}" style="width:100%">
      <button class="btn big" id="go">${needsSetup ? "Создать и войти" : "Войти"}</button></div></div>`;
    const go = async () => {
      const b = $("#go"); b.disabled = true;
      try {
        await api(needsSetup ? "admin.setup" : "admin.login", { token: needsSetup ? $("#tk").value : undefined, email: $("#em").value, password: $("#pw").value });
        await refresh(); render();
      } catch (e) { toast(e.message, "bad"); b.disabled = false; }
    };
    $("#go").onclick = go;
    $("#pw").onkeydown = (e) => { if (e.key === "Enter") go(); };
  }

  /* ---------- Кабинет ---------- */
  function viewMain() {
    const newLeads = (S.leads || []).filter((l) => !l.done).length;
    const cs = S.clients.map((c) => ({ ...c, st: stateOf(c) }));
    const count = (k) => cs.filter((c) => c.st.k === k).length;
    const q = ui.q.toLowerCase();
    const list = cs.filter((c) => (ui.filter === "all" || c.st.k === ui.filter) &&
      (!q || [c.venue, c.contact, c.phone, c.login].some((x) => String(x).toLowerCase().includes(q))));
    const month = new Date().toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7);
    const income = S.payments.filter((p) => new Date(p.at).toLocaleDateString("en-CA", { timeZone: TZ }).startsWith(month)).reduce((a, p) => a + p.amount, 0);
    const rows = list.map((c) => `<tr data-id="${c.id}" style="cursor:pointer">
      <td><b>${esc(c.venue)}</b><br><small style="color:var(--muted)">${esc(c.contact)}</small></td>
      <td>${esc(c.phone)}</td><td><code>${esc(c.login)}</code></td>
      <td>${c.lifetime ? "∞" : date(c.until)}</td>
      <td><span class="tag ${c.st.cls}">${c.st.t}</span></td>
      <td>${c.deviceBound ? "✓ активирован" : `<span style="color:var(--muted)">не активирован</span>`}<br><small style="color:var(--muted)">${c.lastSeen ? "на связи " + dt(c.lastSeen) : ""}</small></td>
      <td><button class="btn sm" data-ext="${c.id}">Продлить</button></td></tr>`).join("");
    const seg = [["all", "Все", cs.length], ["ok", "Активные", count("ok")], ["soon", "Скоро заканчиваются", count("soon")], ["expired", "Истекли", count("expired")], ["off", "Отключены", count("off")]];
    $("#root").innerHTML = `<div class="layout">
      <aside class="side">
        <a class="logo"><span class="logo-mark"><svg width="18" height="20" viewBox="0 0 18 20"><path d="M3 2.5c0-1.2 1.3-1.9 2.3-1.3l11 7.5c.9.6.9 2 0 2.6l-11 7.5C4.3 19.4 3 18.7 3 17.5z" fill="#fff"/></svg></span><span>Play<b>Pos</b></span></a>
        <a class="nav ${ui.tab === "clients" ? "on" : ""}" data-tab="clients" href="#"><span class="em">🏢</span>Клиенты</a>
        <a class="nav ${ui.tab === "leads" ? "on" : ""}" data-tab="leads" href="#"><span class="em">📨</span>Заявки${newLeads ? ` <span class="tag red" style="margin-left:auto">${newLeads}</span>` : ""}</a>
        <div class="who"><b>${esc(S.email)}</b>Администратор PlayPos<div class="row" style="margin-top:8px"><button class="btn sm ghost" id="out">Выйти</button></div></div>
      </aside>
      <main class="main">${ui.tab === "leads" ? leadsView() : `
        <div class="top"><h1>Клиенты</h1><button class="btn" id="add">＋ Новый клиент</button></div>
        <div class="stats">
          <div class="stat"><small>Всего клиентов</small><b>${cs.length}</b></div>
          <div class="stat"><small>Активные</small><b>${count("ok")}</b></div>
          <div class="stat"><small>Скоро заканчиваются / истекли</small><b style="color:${count("soon") + count("expired") ? "var(--danger)" : "inherit"}">${count("soon")} / ${count("expired")}</b></div>
          <div class="stat"><small>Оплаты за этот месяц</small><b>${money(income)}</b></div>
        </div>
        <div class="bar"><input class="input" id="q" placeholder="Поиск: площадка, телефон, логин" value="${esc(ui.q)}"></div>
        <div class="cats" id="flt">${seg.map(([k, t, n]) => `<button class="cat cat-${k} ${ui.filter === k ? "on" : ""}" data-f="${k}">${t}<span>${n}</span></button>`).join("")}</div>
        <div class="panel tbl">${rows ? `<table><thead><tr><th>Площадка</th><th>Телефон</th><th>Логин</th><th>Оплачено до</th><th>Статус</th><th>Программа</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
          : `<div class="empty">Клиентов пока нет. Нажмите «Новый клиент».</div>`}</div>`}
      </main></div>`;
    document.querySelectorAll("[data-tab]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); ui.tab = a.dataset.tab; render(); }));
    document.querySelectorAll("[data-lead]").forEach((c) => (c.onchange = () => act("admin.leadDone", { id: c.dataset.lead, done: c.checked }, c.checked ? "Заявка обработана" : "Заявка снова новая")));
    if (ui.tab === "leads") return;
    $("#add").onclick = clientNew;
    $("#out").onclick = async () => { try { await api("admin.logout"); } catch (e) {} S = null; render(); };
    $("#q").oninput = (e) => { ui.q = e.target.value; const pos = e.target.selectionStart; render(); const i = $("#q"); i.focus(); i.setSelectionRange(pos, pos); };
    $("#flt").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { ui.filter = b.dataset.f; render(); } };
    document.querySelectorAll("[data-ext]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); extendDialog(S.clients.find((c) => c.id === b.dataset.ext)); }));
    document.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => clientCard(S.clients.find((c) => c.id === tr.dataset.id))));
  }

  // Заявки с сайта: имя и телефон тех, кто хочет программу
  function leadsView() {
    const list = S.leads || [];
    const rows = list.map((l) => `<tr style="${l.done ? "opacity:.55" : ""}">
      <td>${dt(l.at)}</td><td><b>${esc(l.name)}</b>${l.venue ? `<br><small style="color:var(--muted)">${esc(l.venue)}</small>` : ""}</td>
      <td><a href="tel:${esc(l.phone.replace(/[^\d+]/g, ""))}"><b>${esc(l.phone)}</b></a></td><td>${esc(l.message)}</td>
      <td><label class="row"><input type="checkbox" data-lead="${l.id}" ${l.done ? "checked" : ""}> Обработана</label></td></tr>`).join("");
    return `<div class="top"><h1>Заявки с сайта</h1></div>
      <div class="panel tbl">${rows ? `<table><thead><tr><th>Дата</th><th>Имя / площадка</th><th>Телефон</th><th>Сообщение</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : `<div class="empty">Заявок пока нет. Они появятся, когда посетители сайта оставят имя и телефон.</div>`}</div>`;
  }

  const periodPick = (name, withLifetime) => `<div class="picks" id="${name}">${[[1, "1 месяц"], [3, "3 месяца"], [6, "6 месяцев"], [12, "12 месяцев"]].concat(withLifetime ? [["lifetime", "Бессрочно"]] : [])
    .map(([v, t], i) => `<button type="button" class="pick ${i === 0 ? "on" : ""}" data-p="${v}"><b>${t}</b></button>`).join("")}</div>`;
  function mountPick(m, id, set) {
    $("#" + id, m).onclick = (e) => { const b = e.target.closest("[data-p]"); if (!b) return; set(b.dataset.p); m.querySelectorAll(`#${id} .pick`).forEach((x) => x.classList.toggle("on", x === b)); };
  }

  function clientNew() {
    let period = "1";
    const pass = genPass();
    modal(`<div class="dlg wide"><h2>Новый клиент</h2>
      <div class="grid2">
        <div><label class="f">Название площадки</label><input class="input" id="cV" maxlength="80" autofocus placeholder="Kids Jungle — Чиланзар"></div>
        <div><label class="f">Контактное лицо</label><input class="input" id="cC" maxlength="60" placeholder="Имя владельца"></div>
        <div><label class="f">Телефон</label><input class="input" id="cP" maxlength="30" placeholder="+998 90 123 45 67"></div>
        <div><label class="f">Логин для активации (латиница)</label><input class="input" id="cL" maxlength="30" placeholder="kidsjungle"></div>
        <div><label class="f">Пароль</label><div class="row"><input class="input" id="cW" value="${pass}" style="flex:1"><button type="button" class="btn sm ghost" id="gen">Сгенерировать</button></div></div>
        <div><label class="f">Сумма оплаты, сум</label><input class="input" id="cA" type="number" min="0" step="1000" value="0"></div>
      </div>
      <label class="f">Срок подписки</label>${periodPick("cT", true)}
      <label class="f">Комментарий</label><input class="input" id="cN" maxlength="200" placeholder="Например: оплата наличными, установка включена">
      <div class="foot"><button class="btn ghost" data-x>Отмена</button><button class="btn" id="cOk">Создать клиента</button></div></div>`, (m) => {
      mountPick(m, "cT", (v) => (period = v));
      $("#gen", m).onclick = () => ($("#cW", m).value = genPass());
      $("[data-x]", m).onclick = close;
      $("#cOk", m).onclick = async (e) => {
        e.target.disabled = true;
        const data = { venue: $("#cV", m).value, contact: $("#cC", m).value, phone: $("#cP", m).value, login: $("#cL", m).value.trim(), password: $("#cW", m).value, period, amount: Math.round(+$("#cA", m).value || 0), comment: $("#cN", m).value };
        if (await act("admin.clientCreate", data, "Клиент создан")) { close(); credentials(data); } else e.target.disabled = false;
      };
    });
  }

  // Данные для отправки клиенту
  function credentials(d) {
    const text = `PlayPos — касса для детской площадки\n\n1. Установите программу PlayPos (файл PlayPos-Setup.exe).\n2. При первом запуске введите:\n   Логин: ${d.login}\n   Пароль: ${d.password}\n\nДля активации нужен интернет, дальше касса работает и без него.`;
    modal(`<div class="dlg"><h2>Данные для клиента</h2>
      <p style="color:var(--muted)">Отправьте клиенту (Telegram, WhatsApp). Пароль больше нигде не показывается — при необходимости его можно сменить в карточке клиента.</p>
      <textarea class="input" id="cr" rows="9" style="width:100%;font-family:monospace;font-size:13px">${esc(text)}</textarea>
      <div class="foot"><button class="btn ghost" data-x>Закрыть</button><button class="btn" id="cp">Скопировать</button></div></div>`, (m) => {
      $("[data-x]", m).onclick = close;
      $("#cp", m).onclick = async () => { try { await navigator.clipboard.writeText($("#cr", m).value); toast("Скопировано"); } catch (e) { $("#cr", m).select(); } };
    });
  }

  function extendDialog(c) {
    let period = "1";
    const st = stateOf(c);
    modal(`<div class="dlg"><h2>Продлить — ${esc(c.venue)}</h2>
      <div class="summary">Сейчас: ${c.lifetime ? "бессрочно" : "оплачено до <b>" + date(c.until) + "</b>"} · <span class="tag ${st.cls}">${st.t}</span><br>
        Новый срок считается от более поздней даты: текущего окончания или сегодняшнего дня.</div>
      <label class="f">На сколько</label>${periodPick("eT", true)}
      <label class="f">Сумма оплаты, сум</label><input class="input" id="eA" type="number" min="0" step="1000" value="0">
      <label class="f">Комментарий</label><input class="input" id="eN" maxlength="200">
      <div class="foot"><button class="btn ghost" data-x>Отмена</button><button class="btn" id="eOk">Продлить</button></div></div>`, (m) => {
      mountPick(m, "eT", (v) => (period = v));
      $("[data-x]", m).onclick = close;
      $("#eOk", m).onclick = async (e) => {
        e.target.disabled = true;
        const out = await act("admin.clientExtend", { id: c.id, period, amount: Math.round(+$("#eA", m).value || 0), comment: $("#eN", m).value });
        if (out) { close(); toast(out.until ? `Оплачено до ${date(out.until)}` : "Бессрочная лицензия"); } else e.target.disabled = false;
      };
    });
  }

  function clientCard(c) {
    const st = stateOf(c);
    const pays = S.payments.filter((p) => p.clientId === c.id);
    modal(`<div class="dlg wide"><h2>${esc(c.venue)}</h2>
      <div class="summary">Статус: <span class="tag ${st.cls}">${st.t}</span> · ${c.lifetime ? "бессрочно" : "оплачено до <b>" + date(c.until) + "</b>"}<br>
        Логин: <code>${esc(c.login)}</code> · Программа: ${c.deviceBound ? "активирована " + dt(c.activatedAt) : "не активирована"}${c.lastSeen ? " · на связи " + dt(c.lastSeen) : ""}${c.appVersion ? " · версия " + esc(c.appVersion) : ""}</div>
      <div class="grid2">
        <div><label class="f">Название площадки</label><input class="input" id="uV" value="${esc(c.venue)}" maxlength="80"></div>
        <div><label class="f">Контактное лицо</label><input class="input" id="uC" value="${esc(c.contact)}" maxlength="60"></div>
        <div><label class="f">Телефон</label><input class="input" id="uP" value="${esc(c.phone)}" maxlength="30"></div>
        <div><label class="f">Новый пароль</label><div class="row"><input class="input" id="uW" placeholder="пусто — не менять" style="flex:1"><button type="button" class="btn sm ghost" id="gen">Сгенерировать</button></div></div>
      </div>
      <label class="f">Заметки</label><input class="input" id="uN" value="${esc(c.note)}" maxlength="500">
      <div class="row" style="margin-top:14px">
        <button class="btn sm" id="uExt">Продлить</button>
        ${c.deviceBound ? `<button class="btn sm ghost" id="uUnb">Отвязать компьютер</button>` : ""}
        <button class="btn sm ${c.active ? "danger" : ""}" id="uAct">${c.active ? "Отключить доступ" : "Включить доступ"}</button>
      </div>
      <h3 style="margin:18px 0 6px">История оплат</h3>
      <div class="tbl">${pays.length ? `<table><thead><tr><th>Дата</th><th>Срок</th><th>Было до</th><th>Стало до</th><th class="num">Сумма</th><th>Комментарий</th></tr></thead><tbody>${pays.map((p) =>
        `<tr><td>${dt(p.at)}</td><td>${p.months ? "+" + p.months + " мес." : "∞"}</td><td>${date(p.prevUntil)}</td><td>${p.newUntil ? date(p.newUntil) : "∞"}</td><td class="num">${money(p.amount)}</td><td>${esc(p.comment)}</td></tr>`).join("")}</tbody></table>` : "Оплат нет"}</div>
      <div class="foot"><button class="btn ghost" data-x>Закрыть</button><button class="btn" id="uOk">Сохранить</button></div></div>`, (m) => {
      $("[data-x]", m).onclick = close;
      $("#gen", m).onclick = () => ($("#uW", m).value = genPass());
      $("#uExt", m).onclick = () => extendDialog(c);
      const unb = $("#uUnb", m);
      if (unb) unb.onclick = async () => { if (confirm("Отвязать программу от компьютера клиента? Клиент сможет активировать её на новом компьютере тем же логином.")) { if (await act("admin.clientUnbind", { id: c.id }, "Компьютер отвязан")) close(); } };
      $("#uAct", m).onclick = async () => {
        if (c.active && !confirm("Отключить доступ? Программа клиента перестанет принимать новые посещения при следующей проверке (до 6 часов).")) return;
        if (await act("admin.clientActive", { id: c.id, active: !c.active }, c.active ? "Доступ отключён" : "Доступ включён")) close();
      };
      $("#uOk", m).onclick = async (e) => {
        e.target.disabled = true;
        const password = $("#uW", m).value.trim();
        const ok = await act("admin.clientUpdate", { id: c.id, venue: $("#uV", m).value, contact: $("#uC", m).value, phone: $("#uP", m).value, note: $("#uN", m).value, password }, "Сохранено");
        if (!ok) return (e.target.disabled = false);
        close();
        if (password) credentials({ login: c.login, password });
      };
    });
  }

  function render() { if (!S) return api("admin.info").then((i) => viewLogin(i.needsSetup), () => viewLogin(false)); viewMain(); }

  (async () => {
    try { await refresh(); } catch (e) { S = null; }
    render();
    setInterval(async () => { if (S && $("#modal").hidden && document.activeElement?.id !== "q") { try { await refresh(); render(); } catch (e) {} } }, 60000);
  })();
})();
