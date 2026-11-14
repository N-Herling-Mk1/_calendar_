/* Fall 2026 end-of-term calendar — static front end over data.json.
 * Server mode (serve.py running): every change is POSTed to /api/save and written to data.json.
 * Static mode (GitHub Pages / any static host): changes are kept as a browser draft (localStorage);
 *   use EXPORT JSON to download the updated data.json and commit it.
 */
"use strict";

const DRAFT_KEY = "fall26cal.draft.v1";
const S = { data: null, mode: "static", hidden: new Set(), hideDone: false, saveTimer: null, editId: null };
const $ = (s) => document.querySelector(s);

// ---------- utilities ----------
const pad = (n) => String(n).padStart(2, "0");
const hhmmss = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const dayDiff = (a, b) => Math.round((b - a) / 86400000);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtD = (d) => `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function fmtT(t) {
  if (!t) return "";
  let [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "p" : "a"; h = h % 12 || 12;
  return m ? `${h}:${pad(m)}${ap}` : `${h}${ap}`;
}
const isExam = (it) => /^exam/i.test(it.type || "");
const color = (course) => (S.data.courses[course] && S.data.courses[course].color) || "#9fb3bf";
const sortKey = (it) => `${it.date || "9999"} ${it.time || "00:00"}`;

function status(msg, kind = "info") {
  const el = $("#status");
  el.textContent = `[${hhmmss()}] ${msg}`;
  el.dataset.kind = kind;
  console.log(`[cal] ${msg}`);
}

// ---------- load ----------
async function boot() {
  status("probing for local save server…");
  try {
    const r = await fetch("api/ping", { cache: "no-store" });
    if (r.ok && (await r.json()).mode === "server") S.mode = "server";
  } catch (_) { /* static host or file:// */ }

  status("loading data.json…");
  let fileData = null;
  try {
    const r = await fetch("data.json", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    fileData = await r.json();
  } catch (e) {
    status(`could not fetch data.json (${e.message}). If opened as a file, run serve.py or use IMPORT.`, "err");
  }

  if (S.mode === "static") {
    const draft = loadDraft();
    if (draft) {
      S.data = draft.data;
      status(`static mode · using browser draft from ${new Date(draft.saved).toLocaleString()} — EXPORT JSON to update the file, RELOAD FILE to discard`, "warn");
    }
  }
  if (!S.data && fileData) {
    S.data = fileData;
    status(`loaded data.json · ${fileData.items.length} items · ${S.mode === "server" ? "server mode: changes write to data.json" : "static mode: changes stay in this browser until exported"}`, "ok");
  }
  if (!S.data) { updateBadge(); return; }
  normalize();
  render();
  // roll the today box over at midnight
  setInterval(() => { if (S.lastToday !== iso(today())) render(); }, 60000);
}

function normalize() {
  const d = S.data;
  d.meta ||= {}; d.courses ||= {}; d.periods ||= []; d.items ||= []; d.types ||= [];
  d.items.forEach((it, i) => { it.id ||= `x${i}`; it.done = !!it.done; it.date ||= null; });
  $("#title").textContent = (d.meta.title || "Calendar").toUpperCase();
  document.title = d.meta.title || "Calendar";
}

// ---------- persistence ----------
function loadDraft() {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ saved: Date.now(), data: S.data })); return true; }
  catch (_) { return false; }
}
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }

function changed(what) {
  S.data.meta.updated = new Date().toISOString();
  render();
  if (S.mode === "server") {
    status(`${what} · saving…`);
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(saveServer, 300);
  } else {
    const ok = saveDraft();
    status(ok ? `${what} · kept in browser draft — EXPORT JSON to write data.json` : `${what} · browser storage unavailable — EXPORT JSON now to keep it`, "warn");
  }
}

async function saveServer() {
  try {
    const r = await fetch("api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(S.data, null, 2) });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    status(`saved to data.json · ${j.items} items · previous copy in data.json.bak`, "ok");
  } catch (e) {
    saveDraft();
    status(`save to data.json FAILED (${e.message}) — kept as browser draft`, "err");
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(S.data, null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "data.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  status(`exported data.json (${S.data.items.length} items) — replace the file in the site folder`, "ok");
}

async function importJson(file) {
  try {
    const obj = JSON.parse(await file.text());
    if (!obj || !Array.isArray(obj.items)) throw new Error("no items[] array");
    S.data = obj; normalize();
    changed(`imported ${file.name} (${obj.items.length} items)`);
  } catch (e) { status(`import failed: ${e.message}`, "err"); }
}

async function reloadFile() {
  if (S.mode === "static" && loadDraft() && !confirm("Discard the browser draft and reload data.json?")) return;
  clearDraft(); S.data = null;
  await boot();
}

// ---------- render ----------
function render() {
  if (!S.data) return;
  S.lastToday = iso(today());
  renderLegend(); renderToday(); renderCal(); renderUnsched(); updateBadge(); renderCounts();
}

function updateBadge() {
  const b = $("#mode-badge");
  if (S.mode === "server") { b.textContent = "SERVER · AUTO-SAVE TO data.json"; b.className = "badge"; }
  else { b.textContent = loadDraft() ? "STATIC · UNEXPORTED DRAFT" : "STATIC · READ FROM data.json"; b.className = loadDraft() ? "badge warn" : "badge"; }
}

function renderCounts() {
  const its = S.data.items, done = its.filter((i) => i.done).length;
  $("#counts").textContent = `${its.length - done} open · ${done} done · ${its.filter((i) => !i.date).length} undated`;
}

function renderLegend() {
  const el = $("#legend"); el.innerHTML = "";
  Object.keys(S.data.courses).forEach((c) => {
    const s = document.createElement("span");
    s.className = "chip" + (S.hidden.has(c) ? " off" : "");
    s.style.setProperty("--c", color(c));
    s.textContent = c; s.title = `${S.data.courses[c].name || c} — click to show/hide`;
    s.onclick = () => { S.hidden.has(c) ? S.hidden.delete(c) : S.hidden.add(c); render(); };
    el.appendChild(s);
  });
}

function renderToday() {
  const t = today(), tIso = iso(t);
  const open = S.data.items.filter((i) => !i.done && i.date).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const dueToday = open.filter((i) => i.date === tIso);
  const upcoming = open.filter((i) => i.date > tIso);
  const week = upcoming.filter((i) => dayDiff(t, parseD(i.date)) <= 7).length;
  const overdue = open.filter((i) => i.date < tIso).length;
  const per = S.data.periods.filter((p) => tIso >= p.start && tIso <= p.end).map((p) => p.label);
  let rows = "";
  if (dueToday.length) dueToday.forEach((i) => { rows += `<div class="row"><b>▸</b> <span class="${isExam(i) ? "ex" : ""}">${esc(fmtT(i.time))} ${esc(i.course)} · ${esc(i.title)}</span></div>`; });
  else rows += `<div class="row">nothing due today</div>`;
  if (upcoming[0]) {
    const n = upcoming[0], dd = dayDiff(t, parseD(n.date));
    rows += `<div class="row"><b>NEXT</b> ${esc(fmtD(parseD(n.date)))} (${dd}d) · <span class="${isExam(n) ? "ex" : ""}">${esc(n.course)} · ${esc(n.title)}</span></div>`;
  }
  rows += `<div class="row"><b>7-DAY</b> ${week} open${overdue ? ` · <span class="ex">${overdue} past due & unchecked</span>` : ""}${per.length ? ` · ${esc(per.join(" · "))}` : ""}</div>`;
  $("#today-box").innerHTML = `<div class="lbl">TODAY</div><div class="date">${esc(fmtD(t)).toUpperCase()}, ${t.getFullYear()}</div>${rows}`;
}

function itemEl(it) {
  const d = document.createElement("div");
  d.className = "item" + (isExam(it) ? " exam" : "") + (it.done ? " done" : "") +
    ((S.hidden.has(it.course) || (S.hideDone && it.done)) ? " hidden" : "");
  d.style.setProperty("--c", color(it.course));
  const tip = [it.type, it.location, it.notes].filter(Boolean).join(" · ");
  d.title = tip;
  const time = it.time ? fmtT(it.time) + (it.end ? `–${fmtT(it.end)}` : "") : "";
  d.innerHTML = `<input type="checkbox" ${it.done ? "checked" : ""} aria-label="done">` +
    `<span class="t">${esc(time)}</span><span class="crs">${esc(it.course)}</span>` +
    `<span class="ttl">${esc(it.title)}</span>`;
  const cb = d.querySelector("input");
  cb.onclick = (e) => { e.stopPropagation(); it.done = cb.checked; changed(`${it.done ? "checked off" : "unchecked"}: ${it.title}`); };
  d.onclick = () => openEdit(it.id);
  return d;
}

function renderCal() {
  const cal = $("#cal"); cal.innerHTML = "";
  let start = parseD(S.data.meta.start || iso(today()));
  start = addDays(start, -start.getDay());                    // snap to Sunday
  let end = parseD(S.data.meta.end || iso(addDays(start, 34)));
  end = addDays(end, 6 - end.getDay());                       // snap to Saturday
  const tIso = iso(today());
  const byDate = {};
  S.data.items.filter((i) => i.date).forEach((i) => (byDate[i.date] ||= []).push(i));

  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const di = iso(d);
    const cell = document.createElement("div");
    const pers = S.data.periods.filter((p) => di >= p.start && di <= p.end);
    const kinds = new Set(pers.map((p) => p.kind));
    cell.className = "day" +
      (d.getDay() === 0 || d.getDay() === 6 ? " weekend" : "") +
      (di < tIso ? " past" : "") + (di === tIso ? " today" : "") +
      (kinds.has("closure") ? " p-closure" : kinds.has("break") ? " p-break" : "") +
      (kinds.has("finals") ? " p-finals" : "");
    const showMonth = d.getDate() === 1 || d.getTime() === start.getTime();
    cell.innerHTML = `<div class="dnum"><span>${showMonth ? `<span class="m">${MON[d.getMonth()].toUpperCase()}</span>` : ""}${d.getDate()}</span>${di === tIso ? '<span class="tag">TODAY</span>' : ""}</div>` +
      pers.map((p) => `<div class="plabel">${esc(p.label)}</div>`).join("");
    (byDate[di] || []).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).forEach((it) => cell.appendChild(itemEl(it)));
    const add = document.createElement("button");
    add.className = "add ghost"; add.textContent = "+"; add.title = `Add item on ${fmtD(d)}`;
    add.onclick = (e) => { e.stopPropagation(); openEdit(null, di); };
    cell.appendChild(add);
    cal.appendChild(cell);
  }
}

function renderUnsched() {
  const box = $("#unsched"); box.innerHTML = "";
  const list = S.data.items.filter((i) => !i.date);
  $("#unsched-n").textContent = `(${list.length})`;
  list.forEach((it) => box.appendChild(itemEl(it)));
}

// ---------- edit dialog ----------
function openEdit(id, dateIso = null) {
  const f = $("#frm"), dlg = $("#dlg");
  const sel = f.elements.course; sel.innerHTML = "";
  Object.keys(S.data.courses).forEach((c) => sel.add(new Option(c, c)));
  $("#types").innerHTML = (S.data.types || []).map((t) => `<option value="${esc(t)}">`).join("");
  const it = id ? S.data.items.find((i) => i.id === id) : null;
  if (it && !sel.querySelector(`option[value="${CSS.escape(it.course)}"]`)) sel.add(new Option(it.course, it.course));
  S.editId = id;
  $("#dlg-title").textContent = it ? "EDIT ITEM" : "NEW ITEM";
  $("#btn-del").style.visibility = it ? "visible" : "hidden";
  const v = it || { date: dateIso, time: "23:59", end: null, course: sel.options[0]?.value || "", type: "Homework", title: "", location: "", notes: "", done: false };
  f.elements.date.value = v.date || "";
  f.elements.time.value = v.time || "";
  f.elements.end.value = v.end || "";
  f.elements.course.value = v.course;
  f.elements.type.value = v.type || "";
  f.elements.title.value = v.title || "";
  f.elements.location.value = v.location || "";
  f.elements.notes.value = v.notes || "";
  f.elements.done.checked = !!v.done;
  dlg.showModal();
  f.elements.title.focus();
}

function saveEdit(e) {
  e.preventDefault();
  const f = $("#frm").elements;
  const val = {
    date: f.date.value || null, time: f.time.value || null, end: f.end.value || null,
    course: f.course.value, type: f.type.value.trim() || "Other", title: f.title.value.trim(),
    location: f.location.value.trim(), notes: f.notes.value.trim(), done: f.done.checked,
  };
  if (!val.title) { f.title.focus(); return; }
  if (S.editId) {
    Object.assign(S.data.items.find((i) => i.id === S.editId), val);
    changed(`edited: ${val.title}`);
  } else {
    S.data.items.push({ id: "n" + Date.now().toString(36), ...val });
    changed(`added: ${val.title}`);
  }
  $("#dlg").close();
}

function deleteEdit() {
  const it = S.data.items.find((i) => i.id === S.editId);
  if (!it || !confirm(`Delete "${it.title}"?`)) return;
  S.data.items = S.data.items.filter((i) => i.id !== S.editId);
  $("#dlg").close();
  changed(`deleted: ${it.title}`);
}

// ---------- wire up ----------
$("#frm").addEventListener("submit", saveEdit);
$("#btn-cancel").onclick = () => $("#dlg").close();
$("#btn-del").onclick = deleteEdit;
$("#btn-add").onclick = () => S.data && openEdit(null, iso(today()));
$("#btn-export").onclick = () => S.data && exportJson();
$("#btn-reset").onclick = reloadFile;
$("#file-import").onchange = (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ""; };
$("#hide-done").onchange = (e) => { S.hideDone = e.target.checked; render(); };
boot();
