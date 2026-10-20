/* Mi Ponche — registro de horas y pago
   Toda la hora viene de Date.now(), que es el reloj del sistema del iPhone
   (sincronizado automáticamente con los servidores de hora de Apple).
   Cada ponche se guarda como una marca de tiempo exacta (milisegundos), así
   que aunque cierres la app por completo, al abrirla el conteo es exacto. */
'use strict';

const KEY = 'miponche.v1';
const HOUR = 3600000;
const DAYS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DAYS_CAP = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MONTHS_FULL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/* ---------------- Datos ---------------- */
function defaults() {
  return { v: 1, settings: { rate: 15, weekStart: 1, ot: true, otAfter: 40, otMult: 1.5 }, shifts: [], paid: {} };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1 && Array.isArray(s.shifts)) {
        const d = defaults();
        return { v: 1, settings: Object.assign(d.settings, s.settings || {}), shifts: s.shifts, paid: s.paid || {} };
      }
    }
  } catch (e) { /* datos dañados: empezar limpio */ }
  return defaults();
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('No se pudo guardar en el teléfono'); }
}
// Pedir almacenamiento persistente (evita que el sistema borre los datos)
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sortShifts = () => state.shifts.sort((a, b) => a.in - b.in);
const openShift = () => state.shifts.find((s) => !s.out) || null;
const openBreak = (s) => (s && s.breaks.find((b) => !b.e)) || null;

/* ---------------- Cálculos ---------------- */
function breakMs(s, now) {
  let t = 0;
  for (const b of s.breaks) {
    const end = b.e || s.out || now;
    if (end > b.s) t += end - b.s;
  }
  return t;
}
function workedMs(s, now) {
  const end = s.out || now;
  return Math.max(0, end - s.in - breakMs(s, now));
}
function shiftPay(s, now) { return (workedMs(s, now) / HOUR) * s.rate; }

function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ms, n) { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
function weekStartOf(ms) {
  const d = new Date(startOfDay(ms));
  const diff = (d.getDay() - Number(state.settings.weekStart) + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}
function dayKey(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* Ley federal (FLSA): tasa regular = pago a tarifa normal / horas totales.
   Prima de horas extra = horas extra × (multiplicador − 1) × tasa regular.
   Con una sola tarifa da lo mismo que: 40 h × tarifa + extra × tarifa × 1.5 */
function weekSummary(ws, now) {
  const we = addDays(ws, 7);
  const shifts = state.shifts.filter((s) => s.in >= ws && s.in < we);
  let ms = 0, straight = 0, lunch = 0;
  for (const s of shifts) { ms += workedMs(s, now); straight += shiftPay(s, now); lunch += breakMs(s, now); }
  const hours = ms / HOUR;
  const st = state.settings;
  const otHours = st.ot ? Math.max(0, hours - Number(st.otAfter)) : 0;
  const regRate = hours > 0 ? straight / hours : 0;
  const premium = otHours * (Number(st.otMult) - 1) * regRate;
  return {
    ws, we, shifts, ms, hours, lunch,
    regHours: hours - otHours, otHours, regRate, straight, premium,
    regPay: (hours - otHours) * regRate,
    otPay: otHours * Number(st.otMult) * regRate,
    gross: round2(straight + premium),
  };
}
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ---------------- Formatos ---------------- */
const pad = (n) => String(n).padStart(2, '0');
function fmtDur(ms, withSec = true) {
  const tot = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(tot / 3600), m = Math.floor((tot % 3600) / 60), s = tot % 60;
  return withSec ? `${h}h ${pad(m)}m ${pad(s)}s` : `${h}h ${pad(m)}m`;
}
const fmtDec = (ms) => (ms / HOUR).toFixed(2) + ' h';
function fmtTime(ms, sec = true) {
  const d = new Date(ms);
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return sec ? `${h}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ap}` : `${h}:${pad(d.getMinutes())} ${ap}`;
}
function fmtShortDate(ms) { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function fmtRange(ws) {
  const a = new Date(ws), b = new Date(addDays(ws, 6));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  return `${fmtShortDate(ws)} – ${fmtShortDate(addDays(ws, 6))} ${b.getFullYear()}`;
}
function toLocalInput(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fromLocalInput(v) {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), 0).getTime();
}
const parseNum = (v) => { const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : NaN; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Ponches ---------------- */
let undoSnap = null;
function snapshot() { undoSnap = JSON.stringify(state); }
function vibrate() { try { navigator.vibrate && navigator.vibrate(15); } catch (e) {} }

function punchIn() {
  if (openShift()) return;
  snapshot();
  const now = Date.now();
  state.shifts.push({ id: uid(), in: now, out: null, breaks: [], rate: Number(state.settings.rate) });
  sortShifts(); save(); vibrate(); renderAll();
  toast('Entrada ponchada a las ' + fmtTime(now), true);
}
function lunchOut() {
  const s = openShift(); if (!s || openBreak(s)) return;
  snapshot();
  const now = Date.now();
  s.breaks.push({ s: now, e: null });
  save(); vibrate(); renderAll();
  toast('Salida a almorzar: ' + fmtTime(now), true);
}
function lunchIn() {
  const s = openShift(); const b = openBreak(s); if (!b) return;
  snapshot();
  const now = Date.now();
  b.e = now;
  save(); vibrate(); renderAll();
  toast('De regreso del almuerzo: ' + fmtTime(now), true);
}
function punchOut() {
  if (!openShift()) return;
  const now = Date.now();
  confirmModal('¿Ponchar salida final?', `Se registrará tu salida a las <b>${fmtTime(now)}</b> y se cerrará el turno de hoy.`, 'Sí, ponchar salida', () => {
    const s = openShift(); if (!s) return;
    snapshot();
    const t = Date.now();
    const b = openBreak(s); if (b) b.e = t;
    s.out = t;
    save(); vibrate(); renderAll();
    toast('Salida ponchada: ' + fmtTime(t) + ' · ' + fmtDur(workedMs(s, t), false), true);
  });
}
function undo() {
  if (!undoSnap) return;
  state = JSON.parse(undoSnap); undoSnap = null;
  save(); renderAll(); toast('Listo, se deshizo el último ponche');
}

/* ---------------- Render: Ponchar ---------------- */
function renderClock(now) {
  const d = new Date(now);
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  $('clock').textContent = `${h}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  $('ampm').textContent = ap;
  $('date').textContent = `${DAYS_CAP[d.getDay()]}, ${d.getDate()} de ${MONTHS_FULL[d.getMonth()]} de ${d.getFullYear()}`;
}

function renderActions() {
  const s = openShift(), b = openBreak(s);
  const ic = {
    in: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4"/></svg>',
    lunch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v8M5 3v4a2 2 0 004 0V3M7 11v10M17 21V3c-2 1-3 4-3 7v3h3"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14l-5-5 5-5M4 9h11a5 5 0 010 10h-3"/></svg>',
    out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 17l5-5-5-5M19 12H8M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4"/></svg>',
  };
  let html = '';
  if (!s) html = `<button class="btn big primary" type="button" data-act="in">${ic.in}Ponchar entrada</button>`;
  else if (b) html = `<button class="btn big lunch" type="button" data-act="lunchIn">${ic.back}Regresar del almuerzo</button>
                     <button class="btn out" type="button" data-act="out">${ic.out}Salida final</button>`;
  else html = `<button class="btn big lunch" type="button" data-act="lunchOut">${ic.lunch}Salir a almorzar</button>
               <button class="btn out" type="button" data-act="out">${ic.out}Salida final</button>`;
  $('actions').innerHTML = html;
}

function renderStatus(now) {
  const s = openShift(), b = openBreak(s);
  let cls = '', txt = 'Fuera de turno', extra = '';
  if (s && b) { cls = 'lunch'; txt = 'En almuerzo desde ' + fmtTime(b.s, false); extra = `Llevas <b>${fmtDur(now - b.s)}</b> de almuerzo`; }
  else if (s) { cls = 'working'; txt = 'Trabajando desde ' + fmtTime(s.in, false); extra = `Este turno: <b>${fmtDur(workedMs(s, now))}</b>`; }
  $('status').innerHTML = `<div><span class="pill ${cls}"><span class="dot"></span>${txt}</span>${extra ? `<span class="elapsed" id="elapsed">${extra}</span>` : ''}</div>`;
}
function updateElapsed(now) {
  const el = $('elapsed'); if (!el) return;
  const s = openShift(), b = openBreak(s);
  if (s && b) el.innerHTML = `Llevas <b>${fmtDur(now - b.s)}</b> de almuerzo`;
  else if (s) el.innerHTML = `Este turno: <b>${fmtDur(workedMs(s, now))}</b>`;
}

function todayShifts(now) {
  const d0 = startOfDay(now), d1 = addDays(d0, 1);
  const open = openShift();
  return state.shifts.filter((s) => (s.in >= d0 && s.in < d1) || s === open);
}
function renderToday(now) {
  const list = todayShifts(now);
  let w = 0, l = 0, p = 0;
  for (const s of list) { w += workedMs(s, now); l += breakMs(s, now); p += shiftPay(s, now); }
  $('todayWorked').textContent = fmtDur(w);
  $('todayLunch').textContent = fmtDur(l, false);
  $('todayPay').textContent = money.format(p);
  return list;
}
function renderTimeline(now) {
  const list = todayShifts(now);
  if (!list.length) { $('timeline').innerHTML = '<li class="empty" style="justify-content:center;border:0">Aún no has ponchado hoy</li>'; return; }
  let html = '';
  for (const s of list) {
    html += `<li><span class="lbl"><span class="tdot"></span>Entrada</span><span class="t">${fmtTime(s.in)}</span></li>`;
    for (const b of s.breaks) {
      html += `<li><span class="lbl"><span class="tdot l"></span>Salida a almorzar</span><span class="t">${fmtTime(b.s)}</span></li>`;
      if (b.e) html += `<li><span class="lbl"><span class="tdot l"></span>Regreso del almuerzo</span><span class="t">${fmtTime(b.e)}</span></li>`;
    }
    if (s.out) html += `<li><span class="lbl"><span class="tdot o"></span>Salida final</span><span class="t">${fmtTime(s.out)}</span></li>`;
  }
  $('timeline').innerHTML = html;
}
function renderWeekMini(now) {
  const sum = weekSummary(weekStartOf(now), now);
  $('weekMiniHours').textContent = fmtDur(sum.ms, false);
  $('weekMiniPay').textContent = money.format(sum.gross);
}

/* ---------------- Render: Semana ---------------- */
let viewWeek = weekStartOf(Date.now());
function renderWeek(now) {
  const sum = weekSummary(viewWeek, now);
  $('weekRange').textContent = fmtRange(viewWeek);
  $('thisWeek').style.visibility = viewWeek === weekStartOf(now) ? 'hidden' : 'visible';
  renderWeekSummary(sum);
  renderWeekDays(sum, now);
  const key = dayKey(viewWeek);
  const inp = $('paidInput');
  if (document.activeElement !== inp) inp.value = state.paid[key] != null ? Number(state.paid[key]).toFixed(2) : '';
  renderPaidDiff(sum);
}
function renderWeekSummary(sum) {
  const st = state.settings;
  const rateTxt = sum.hours > 0 ? money.format(sum.regRate) + '/h' : money.format(st.rate) + '/h';
  $('weekSummary').innerHTML = `
    <div class="sum-top">
      <div><div class="stat-label">Horas trabajadas</div><div class="sum-big">${fmtDur(sum.ms, false)}</div><div class="sum-sub">${fmtDec(sum.ms)} · ${fmtDur(sum.ms)}</div></div>
      <div style="text-align:right"><div class="stat-label">Te deben (bruto)</div><div class="sum-big accent">${money.format(sum.gross)}</div></div>
    </div>
    <div class="rows">
      <div class="row"><span>Horas regulares</span><span>${sum.regHours.toFixed(2)} h × ${rateTxt}</span></div>
      <div class="row"><span>Pago regular</span><span>${money.format(sum.regPay)}</span></div>
      ${st.ot ? `<div class="row"><span>Horas extra (más de ${Number(st.otAfter)} h)</span><span class="${sum.otHours > 0 ? 'warn' : ''}">${sum.otHours.toFixed(2)} h × ${Number(st.otMult)}</span></div>
      <div class="row"><span>Pago horas extra</span><span>${money.format(sum.otPay)}</span></div>` : ''}
      <div class="row"><span>Almuerzo (no pagado)</span><span>${fmtDur(sum.lunch, false)}</span></div>
      <div class="row total"><span>Total a cobrar</span><span class="accent">${money.format(sum.gross)}</span></div>
    </div>`;
}
function renderWeekDays(sum, now) {
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d0 = addDays(viewWeek, i), d1 = addDays(viewWeek, i + 1);
    const shifts = sum.shifts.filter((s) => s.in >= d0 && s.in < d1);
    const dd = new Date(d0);
    let ms = 0; for (const s of shifts) ms += workedMs(s, now);
    html += `<div class="day ${shifts.length ? '' : 'off'}">
      <div class="day-head"><div class="day-name">${DAYS_CAP[dd.getDay()]}<small>${fmtShortDate(d0)}</small></div><div class="day-hours">${shifts.length ? fmtDur(ms, false) : '—'}</div></div>`;
    for (const s of shifts) {
      const lunch = breakMs(s, now);
      html += `<button type="button" class="shift" data-edit="${s.id}">
        <span><b>${fmtTime(s.in, false)}</b> → <b>${s.out ? fmtTime(s.out, false) : 'ahora'}</b>${!s.out ? '<span class="tag live">en curso</span>' : ''}${s.edited ? '<span class="tag">editado</span>' : ''}<br>
        ${lunch ? 'Almuerzo ' + fmtDur(lunch, false) + ' · ' : ''}${money.format(s.rate)}/h</span>
        <span class="pay">${money.format(shiftPay(s, now))}</span></button>`;
    }
    html += '</div>';
  }
  $('weekDays').innerHTML = html;
}
function renderPaidDiff(sum) {
  const v = state.paid[dayKey(viewWeek)];
  const el = $('paidDiff');
  if (v == null || v === '') { el.innerHTML = ''; return; }
  const diff = round2(sum.gross - Number(v));
  if (Math.abs(diff) < 0.01) el.innerHTML = '<span class="accent">Cuadra: te pagaron lo correcto</span>';
  else if (diff > 0) el.innerHTML = `<span class="bad">Te faltan ${money.format(diff)}</span>`;
  else el.innerHTML = `<span class="accent">Te pagaron ${money.format(-diff)} de más</span>`;
}

/* ---------------- Render: Historial (carpetas por mes) ---------------- */
const FOLD_KEY = 'miponche.folders';
let openFolders = null;
try { const f = JSON.parse(localStorage.getItem(FOLD_KEY)); if (Array.isArray(f)) openFolders = new Set(f); } catch (e) {}
if (!openFolders) { const d = new Date(); openFolders = new Set([d.getFullYear() + '-' + pad(d.getMonth() + 1)]); }
function saveFolders() { try { localStorage.setItem(FOLD_KEY, JSON.stringify([...openFolders])); } catch (e) {} }

function diffHtml(gross, paid, cls) {
  if (paid == null || paid === '') return '';
  const d = round2(gross - Number(paid));
  if (Math.abs(d) < 0.01) return `<div class="${cls} accent">Cuadra</div>`;
  return d > 0 ? `<div class="${cls} bad">Faltan ${money.format(d)}</div>` : `<div class="${cls} accent">+${money.format(-d)} de más</div>`;
}
const FOLDER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>';
const CHEV_SVG = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function renderHistory(now) {
  const weeks = [...new Set(state.shifts.map((s) => weekStartOf(s.in)))].sort((a, b) => b - a);
  if (!weeks.length) { $('historyList').innerHTML = '<div class="card empty">Todavía no hay semanas registradas. Cuando ponches, tus semanas aparecerán aquí organizadas por mes.</div>'; return; }
  // Agrupar: año → mes (según el día en que empieza la semana)
  const years = new Map();
  for (const ws of weeks) {
    const d = new Date(ws), y = d.getFullYear(), ym = y + '-' + pad(d.getMonth() + 1);
    if (!years.has(y)) years.set(y, new Map());
    const months = years.get(y);
    if (!months.has(ym)) months.set(ym, { month: d.getMonth(), weeks: [] });
    months.get(ym).weeks.push({ ws, sum: weekSummary(ws, now), paid: state.paid[dayKey(ws)] });
  }
  let html = '';
  for (const [y, months] of years) {
    let yMs = 0, yGross = 0;
    for (const m of months.values()) for (const w of m.weeks) { yMs += w.sum.ms; yGross += w.sum.gross; }
    html += `<div class="year"><span class="year-name">${y}</span><span class="year-sum">${fmtDur(yMs, false)} · ${money.format(yGross)}</span></div>`;
    for (const [ym, m] of months) {
      let ms = 0, gross = 0, owed = 0, hasPaid = false;
      for (const w of m.weeks) {
        ms += w.sum.ms; gross += w.sum.gross;
        if (w.paid != null && w.paid !== '') { hasPaid = true; owed += w.sum.gross - Number(w.paid); }
      }
      owed = round2(owed);
      const fdiff = !hasPaid ? '' : Math.abs(owed) < 0.01 ? '<div class="f-diff accent">Cuadra</div>' : owed > 0 ? `<div class="f-diff bad">Faltan ${money.format(owed)}</div>` : `<div class="f-diff accent">+${money.format(-owed)}</div>`;
      const open = openFolders.has(ym);
      html += `<div class="folder${open ? ' open' : ''}">
        <button type="button" class="folder-head" data-folder="${ym}" aria-expanded="${open}">
          <span class="folder-ic">${FOLDER_SVG}</span>
          <span class="f-l"><div class="f-name">${MONTHS_FULL[m.month].charAt(0).toUpperCase() + MONTHS_FULL[m.month].slice(1)}</div>
          <div class="f-sub">${m.weeks.length} ${m.weeks.length === 1 ? 'semana' : 'semanas'} · ${fmtDur(ms, false)}</div></span>
          <span class="f-r"><div class="f-pay">${money.format(gross)}</div>${fdiff}</span>${CHEV_SVG}
        </button>
        <div class="folder-body">`;
      for (const w of m.weeks) {
        const s = w.sum;
        html += `<button type="button" class="wk" data-week="${w.ws}">
          <span><div class="wk-range">${fmtRange(w.ws)}</div><div class="wk-sub">${fmtDur(s.ms, false)} · ${s.shifts.length} ${s.shifts.length === 1 ? 'turno' : 'turnos'}${s.otHours > 0 ? ' · ' + s.otHours.toFixed(2) + ' h extra' : ''}</div></span>
          <span class="wk-r"><span><div class="wk-pay">${money.format(s.gross)}</div>${diffHtml(s.gross, w.paid, 'wk-diff')}</span>${CHEV_SVG}</span>
        </button>`;
      }
      html += '</div></div>';
    }
  }
  $('historyList').innerHTML = html;
}

/* ---------------- Ajustar ponches de hoy ---------------- */
function adjustToday() {
  const now = Date.now();
  const list = todayShifts(now);
  if (list.length === 1) { editShift(list[0].id); return; }
  if (list.length > 1) {
    openModal('¿Qué turno quieres ajustar?', 'Hoy tienes más de un turno.', [
      ...list.map((s) => ({ label: fmtTime(s.in, false) + ' → ' + (s.out ? fmtTime(s.out, false) : 'en curso'), cls: 'ghost', fn: () => { setTimeout(() => editShift(s.id), 0); } })),
      { label: 'Cancelar', cls: 'ghost' },
    ]);
    return;
  }
  const last = state.shifts[state.shifts.length - 1];
  openModal('Ajustar ponches', 'Hoy no tienes ponches. ¿Qué quieres hacer?', [
    ...(last ? [{ label: 'Ajustar el último turno (' + DAYS_CAP[new Date(last.in).getDay()] + ' ' + fmtShortDate(last.in) + ')', cls: 'primary', fn: () => { setTimeout(() => editShift(last.id), 0); } }] : []),
    { label: 'Agregar un turno a mano', cls: last ? 'ghost' : 'primary', fn: () => { setTimeout(() => editShift(null), 0); } },
    { label: 'Cancelar', cls: 'ghost' },
  ]);
}

/* ---------------- Render: Ajustes ---------------- */
function renderSettings() {
  const st = state.settings;
  const set = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
  set('setRate', Number(st.rate).toFixed(2));
  $('setWeekStart').value = String(st.weekStart);
  $('setOt').checked = !!st.ot;
  set('setOtAfter', st.otAfter);
  set('setOtMult', st.otMult);
}

/* ---------------- General ---------------- */
let currentView = 'punch';
function renderAll() {
  const now = Date.now();
  renderClock(now); renderStatus(now); renderActions(); renderToday(now); renderTimeline(now); renderWeekMini(now);
  if (currentView === 'week') renderWeek(now);
  if (currentView === 'history') renderHistory(now);
  if (currentView === 'settings') renderSettings();
}
function showView(v) {
  currentView = v;
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.view === v));
  window.scrollTo(0, 0);
  renderAll();
}

// Reloj: se re-sincroniza con el reloj del sistema en cada segundo exacto
let lastDay = dayKey(Date.now());
function tick() {
  const now = Date.now();
  renderClock(now);
  const s = openShift();
  if (dayKey(now) !== lastDay) { lastDay = dayKey(now); renderAll(); }
  else if (s) {
    updateElapsed(now); renderToday(now); renderWeekMini(now);
    if (currentView === 'week' && s.in >= viewWeek && s.in < addDays(viewWeek, 7)) {
      const sum = weekSummary(viewWeek, now); renderWeekSummary(sum); renderWeekDays(sum, now); renderPaidDiff(sum);
    }
  }
  setTimeout(tick, 1000 - (Date.now() % 1000) + 2);
}

/* ---------------- Modal / Toast ---------------- */
function openModal(title, bodyHtml, actions) {
  $('toast').hidden = true;
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  const box = $('modalActions'); box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn full ' + (a.cls || 'ghost'); b.textContent = a.label;
    b.onclick = () => { if (a.fn && a.fn() === false) return; closeModal(); };
    box.appendChild(b);
  }
  $('modal').hidden = false;
}
function closeModal() { $('modal').hidden = true; $('modalBody').innerHTML = ''; }
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
function confirmModal(title, html, okLabel, fn, danger) {
  openModal(title, html, [{ label: okLabel, cls: danger ? 'danger' : 'primary', fn }, { label: 'Cancelar', cls: 'ghost' }]);
}

let toastTimer = null;
function toast(msg, withUndo) {
  $('toastText').textContent = msg;
  $('toastBtn').hidden = !withUndo;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, withUndo ? 8000 : 3000);
}
$('toastBtn').addEventListener('click', () => { $('toast').hidden = true; undo(); });

/* ---------------- Editar / agregar turno ---------------- */
function breakRowHtml(i, b) {
  return `<div class="brk" data-brk="${i}">
    <div class="brk-head"><span>Almuerzo ${i + 1}</span><button type="button" data-rmbrk="${i}">Quitar</button></div>
    <label class="field"><span>Salida a almorzar</span><input class="input" type="datetime-local" step="1" data-bs value="${toLocalInput(b.s)}"></label>
    <label class="field"><span>Regreso del almuerzo</span><input class="input" type="datetime-local" step="1" data-be value="${toLocalInput(b.e)}"></label>
  </div>`;
}
function editShift(id) {
  const existing = id ? state.shifts.find((s) => s.id === id) : null;
  let s;
  if (existing) s = JSON.parse(JSON.stringify(existing));
  else {
    const base = new Date(); base.setSeconds(0, 0);
    const d = (h, m) => { const x = new Date(base); x.setHours(h, m, 0, 0); return x.getTime(); };
    s = { id: uid(), in: d(8, 0), out: d(16, 30), breaks: [{ s: d(12, 0), e: d(12, 30) }], rate: Number(state.settings.rate) };
  }
    const body = `
    <p>Corrige cualquier hora si ponchaste sin querer. Para quitar un almuerzo, toca <b>Quitar</b>. Si ponchaste la salida por error, toca <b>Borrar</b> en la salida y sigues en el turno.</p>
    <div class="form" id="editForm">
      <label class="field"><span>Entrada</span><input class="input" type="datetime-local" step="1" id="eIn" value="${toLocalInput(s.in)}"></label>
      <div id="eBreaks" class="form">${s.breaks.map((b, i) => breakRowHtml(i, b)).join('')}</div>
      <button type="button" class="btn ghost full" id="eAddBrk">+ Agregar almuerzo / pausa</button>
      <div class="field"><label for="eOut"><span style="font-weight:600;font-size:15px;color:var(--text)">Salida final</span></label><div class="out-row"><input class="input" type="datetime-local" step="1" id="eOut" value="${toLocalInput(s.out)}"><button type="button" class="mini-btn" id="eClearOut">Borrar</button></div><small>Vacía = todavía estás trabajando.</small></div>
      <label class="field"><span>Pago por hora en este turno</span><div class="paid-row"><span class="money-prefix">$</span><input class="input money" type="text" inputmode="decimal" id="eRate" value="${Number(s.rate).toFixed(2)}"></div></label>
      <div class="err" id="eErr"></div>
    </div>`;
  const actions = [{ label: existing ? 'Guardar cambios' : 'Agregar turno', cls: 'primary', fn: () => saveEdit(existing, s) }];
  if (existing) actions.push({ label: 'Eliminar turno', cls: 'danger-ghost', fn: () => { setTimeout(() => deleteShift(existing.id), 0); } });
  actions.push({ label: 'Cancelar', cls: 'ghost' });
  openModal(existing ? 'Editar turno' : 'Agregar turno a mano', body, actions);

  $('eClearOut').onclick = () => { $('eOut').value = ''; };
  $('eAddBrk').onclick = () => {
    const box = $('eBreaks'); const i = box.children.length;
    box.insertAdjacentHTML('beforeend', breakRowHtml(i, { s: null, e: null }));
  };
  $('eBreaks').onclick = (e) => {
    const r = e.target.closest('[data-rmbrk]'); if (!r) return;
    r.closest('.brk').remove();
    [...$('eBreaks').children].forEach((el, i) => { el.querySelector('.brk-head span').textContent = 'Almuerzo ' + (i + 1); });
  };
}
function saveEdit(existing, s) {
  if (existing) existing = state.shifts.find((x) => x.id === existing.id) || null;
  const err = (m) => { $('eErr').textContent = m; return false; };
  const tin = fromLocalInput($('eIn').value);
  const tout = fromLocalInput($('eOut').value);
  const rate = parseNum($('eRate').value);
  if (!tin) return err('Pon la hora de entrada.');
  if (!tout) {
    const other = state.shifts.find((x) => !x.out && x.id !== s.id);
    if (other) return err('Ya hay otro turno abierto. Ponle la salida a ese turno primero.');
    if (state.shifts.some((x) => x.id !== s.id && x.in > tin)) return err('Pon la hora de salida (solo el turno más reciente puede quedar abierto).');
  }
  if (tout && tout <= tin) return err('La salida debe ser después de la entrada.');
  if (tout && tout - tin > 24 * HOUR) return err('Un turno no puede pasar de 24 horas.');
  if (tin > Date.now() + 60000) return err('La entrada no puede estar en el futuro.');
  if (!(rate >= 0)) return err('El pago por hora no es válido.');
  const breaks = [];
  for (const row of $('eBreaks').children) {
    const bs = fromLocalInput(row.querySelector('[data-bs]').value);
    const be = fromLocalInput(row.querySelector('[data-be]').value);
    if (!bs && !be) continue;
    if (!bs) return err('Falta la salida a almorzar.');
    if (bs < tin || (tout && bs > tout)) return err('El almuerzo debe estar dentro del turno.');
    if (!be && tout) return err('Falta el regreso del almuerzo.');
    if (be && be <= bs) return err('El regreso del almuerzo debe ser después de la salida.');
    if (be && tout && be > tout) return err('El almuerzo debe terminar antes de la salida.');
    breaks.push({ s: bs, e: be || null });
  }
  breaks.sort((a, b) => a.s - b.s);
  for (let i = 1; i < breaks.length; i++) if (!breaks[i - 1].e || breaks[i].s < breaks[i - 1].e) return err('Los almuerzos se cruzan entre sí.');
  if (breaks.filter((b) => !b.e).length > 1) return err('Solo puede haber un almuerzo abierto.');
  const overlap = state.shifts.find((x) => x.id !== s.id && tin < (x.out || Date.now()) && (tout || Date.now()) > x.in);
  if (overlap) return err('Este turno se cruza con otro del ' + fmtShortDate(overlap.in) + '.');

  snapshot();
  const rec = { id: s.id, in: tin, out: tout || null, breaks, rate, edited: true };
  if (existing) Object.assign(existing, rec); else state.shifts.push(rec);
  sortShifts(); save();
  viewWeek = weekStartOf(tin);
  renderAll();
  toast(existing ? 'Turno actualizado' : 'Turno agregado', true);
}
function deleteShift(id) {
  const s = state.shifts.find((x) => x.id === id); if (!s) return;
  confirmModal('¿Eliminar este turno?', `${DAYS_CAP[new Date(s.in).getDay()]} ${fmtShortDate(s.in)}, ${fmtTime(s.in, false)} → ${s.out ? fmtTime(s.out, false) : 'en curso'}.`, 'Eliminar', () => {
    snapshot();
    state.shifts = state.shifts.filter((x) => x.id !== id);
    save(); renderAll(); toast('Turno eliminado', true);
  }, true);
}

/* ---------------- Exportar / respaldo ---------------- */
async function shareOrDownload(name, text, type) {
  const blob = new Blob([text], { type });
  try {
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function exportCsv() {
  const now = Date.now();
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = [['Semana', 'Fecha', 'Día', 'Entrada', 'Salida almuerzo', 'Regreso almuerzo', 'Salida', 'Almuerzo (h)', 'Horas trabajadas', 'Tarifa', 'Pago (sin horas extra)', 'Editado']];
  for (const s of state.shifts) {
    rows.push([
      fmtRange(weekStartOf(s.in)), dayKey(s.in), DAYS_CAP[new Date(s.in).getDay()], fmtTime(s.in),
      s.breaks.map((b) => fmtTime(b.s)).join(' / '), s.breaks.map((b) => (b.e ? fmtTime(b.e) : '')).join(' / '),
      s.out ? fmtTime(s.out) : 'en curso', (breakMs(s, now) / HOUR).toFixed(2), (workedMs(s, now) / HOUR).toFixed(4),
      Number(s.rate).toFixed(2), shiftPay(s, now).toFixed(2), s.edited ? 'sí' : 'no',
    ]);
  }
  rows.push([]);
  rows.push(['Semana', 'Horas', 'Horas regulares', 'Horas extra', 'Total bruto a cobrar', 'Te pagaron', 'Diferencia']);
  const weeks = [...new Set(state.shifts.map((s) => weekStartOf(s.in)))].sort((a, b) => a - b);
  for (const ws of weeks) {
    const sum = weekSummary(ws, now); const p = state.paid[dayKey(ws)];
    rows.push([fmtRange(ws), sum.hours.toFixed(4), sum.regHours.toFixed(4), sum.otHours.toFixed(4), sum.gross.toFixed(2), p != null ? Number(p).toFixed(2) : '', p != null ? round2(sum.gross - Number(p)).toFixed(2) : '']);
  }
  const csv = '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
  shareOrDownload('mi-ponche-' + dayKey(now) + '.csv', csv, 'text/csv');
}
function exportJson() {
  shareOrDownload('mi-ponche-respaldo-' + dayKey(Date.now()) + '.json', JSON.stringify(state, null, 2), 'application/json');
}
function importJson(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (!s || s.v !== 1 || !Array.isArray(s.shifts)) throw new Error('bad');
      confirmModal('¿Restaurar esta copia?', `Tiene ${s.shifts.length} turnos. Reemplazará los datos que tienes ahora.`, 'Restaurar', () => {
        snapshot();
        state = { v: 1, settings: Object.assign(defaults().settings, s.settings || {}), shifts: s.shifts, paid: s.paid || {} };
        sortShifts(); save(); renderAll(); toast('Copia restaurada', true);
      });
    } catch (e) { toast('Ese archivo no es una copia válida de Mi Ponche'); }
  };
  r.readAsText(file);
}

/* ---------------- Eventos ---------------- */
document.querySelector('.tabbar').addEventListener('click', (e) => {
  const t = e.target.closest('.tab'); if (!t) return;
  if (t.dataset.view === 'week' && currentView !== 'week') viewWeek = weekStartOf(Date.now());
  showView(t.dataset.view);
});
$('actions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  ({ in: punchIn, lunchOut, lunchIn, out: punchOut })[b.dataset.act]();
});
$('weekMini').addEventListener('click', () => { viewWeek = weekStartOf(Date.now()); showView('week'); });
$('prevWeek').addEventListener('click', () => { viewWeek = addDays(viewWeek, -7); renderWeek(Date.now()); });
$('nextWeek').addEventListener('click', () => { viewWeek = addDays(viewWeek, 7); renderWeek(Date.now()); });
$('thisWeek').addEventListener('click', () => { viewWeek = weekStartOf(Date.now()); renderWeek(Date.now()); });
$('weekDays').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) editShift(b.dataset.edit); });
$('historyList').addEventListener('click', (e) => {
  const f = e.target.closest('[data-folder]');
  if (f) { const k = f.dataset.folder; if (openFolders.has(k)) openFolders.delete(k); else openFolders.add(k); saveFolders(); renderHistory(Date.now()); return; }
  const b = e.target.closest('[data-week]'); if (b) { viewWeek = Number(b.dataset.week); showView('week'); }
});
$('adjustToday').addEventListener('click', adjustToday);
$('timeline').addEventListener('click', (e) => { if (e.target.closest('li') && !e.target.closest('.empty')) adjustToday(); });
$('paidInput').addEventListener('input', () => {
  const key = dayKey(viewWeek); const v = $('paidInput').value.trim();
  if (v === '') delete state.paid[key];
  else { const n = parseNum(v); if (!isFinite(n)) return; state.paid[key] = n; }
  save(); renderPaidDiff(weekSummary(viewWeek, Date.now()));
});
$('paidInput').addEventListener('blur', () => renderWeek(Date.now()));
$('addShiftWeek').addEventListener('click', () => editShift(null));
$('addShiftSettings').addEventListener('click', () => editShift(null));

$('setRate').addEventListener('change', () => {
  const n = parseNum($('setRate').value);
  if (!(n >= 0)) { toast('Pago por hora no válido'); renderSettings(); return; }
  state.settings.rate = n; save();
  const s = openShift();
  if (s && s.rate !== n) {
    openModal('¿Aplicar al turno de hoy?', `Tienes un turno abierto a ${money.format(s.rate)}/h. ¿Quieres que también use ${money.format(n)}/h?`, [
      { label: 'Sí, aplicar al turno de hoy', cls: 'primary', fn: () => { s.rate = n; save(); renderAll(); } },
      { label: 'No, solo turnos nuevos', cls: 'ghost' },
    ]);
  }
  renderAll(); toast('Pago por hora: ' + money.format(n));
});
$('setWeekStart').addEventListener('change', () => { state.settings.weekStart = Number($('setWeekStart').value); viewWeek = weekStartOf(Date.now()); save(); renderAll(); });
$('setOt').addEventListener('change', () => { state.settings.ot = $('setOt').checked; save(); renderAll(); });
$('setOtAfter').addEventListener('change', () => { const n = parseNum($('setOtAfter').value); if (n > 0) state.settings.otAfter = n; save(); renderAll(); });
$('setOtMult').addEventListener('change', () => { const n = parseNum($('setOtMult').value); if (n >= 1) state.settings.otMult = n; save(); renderAll(); });
$('exportCsv').addEventListener('click', exportCsv);
$('exportJson').addEventListener('click', exportJson);
$('importJson').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importJson(f); e.target.value = ''; });
$('wipe').addEventListener('click', () => {
  confirmModal('¿Borrar todo?', 'Se borrarán todos tus turnos y pagos guardados en este teléfono. Te recomendamos guardar una copia de seguridad antes.', 'Sí, borrar todo', () => {
    setTimeout(() => confirmModal('¿Seguro?', 'Esto no se puede deshacer.', 'Borrar definitivamente', () => {
      const keep = state.settings; state = defaults(); state.settings = keep; save(); renderAll(); toast('Datos borrados');
    }, true), 0);
  }, true);
});

// Al volver a la app (después de cerrarla o cambiar de app) recargar y recalcular con la hora real
function resync() { if (!$('modal').hidden) { renderAll(); return; } state = load(); renderAll(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
window.addEventListener('pageshow', resync);
window.addEventListener('storage', (e) => { if (e.key === KEY) resync(); });

/* ---------------- Inicio ---------------- */
renderAll();
tick();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
