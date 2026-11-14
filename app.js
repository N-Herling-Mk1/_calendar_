/* Fall 2026 end-of-term calendar — static front end over data.json.
 * Server mode (serve.py running): every change is POSTed to /api/save and written to data.json.
 * Static mode (GitHub Pages / any static host): changes are kept as a browser draft (localStorage);
 *   use EXPORT JSON to download the updated data.json and commit it.
 */
"use strict";

const DRAFT_KEY = "fall26cal.draft.v1";
const SEL_KEY = "fall26cal.sel.v1";
const S = { data: null, mode: "static", sel: new Set(), hideDone: false, saveTimer: null, editId: null };
try { (JSON.parse(localStorage.getItem(SEL_KEY)) || []).forEach((c) => S.sel.add(c)); } catch (_) {}
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
    const text = await r.text();
    S.fileHash = fnv1a(text);
    fileData = JSON.parse(text);
  } catch (e) {
    status(`could not fetch data.json (${e.message}). If opened as a file, run serve.py or use IMPORT.`, "err");
  }

  if (S.mode === "static") {
    const draft = loadDraft();
    // A draft only applies to the data.json it was made from. If the file has
    // been updated since (a push), the file wins; the old draft is set aside.
    if (draft && fileData && draft.base !== S.fileHash) {
      try { localStorage.setItem(DRAFT_KEY + ".stale", JSON.stringify(draft)); } catch (_) {}
      clearDraft();
      status(`data.json changed since your browser draft (${new Date(draft.saved).toLocaleString()}) — showing the new file; old draft set aside`, "warn");
      S.data = fileData;
    } else if (draft) {
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
// 32-bit FNV-1a over the raw data.json text: fingerprints the file a draft was made from.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
function loadDraft() {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ saved: Date.now(), base: S.fileHash || null, data: S.data })); return true; }
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
    updateBadge();
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
  S.sel.forEach((c) => { if (!S.data.courses[c]) S.sel.delete(c); });   // drop courses no longer in the file
  renderPanels(); renderSelSummary(); renderToday(); renderCal(); renderUnsched(); updateBadge(); renderCounts();
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

// ---------- course panels (filter) ----------
const inSel = (it) => S.sel.size === 0 || S.sel.has(it.course);
function saveSel() { try { localStorage.setItem(SEL_KEY, JSON.stringify([...S.sel])); } catch (_) {} }
function toggleCourse(c) {
  S.sel.has(c) ? S.sel.delete(c) : S.sel.add(c);
  saveSel(); render();
  status(S.sel.size ? `showing ${[...S.sel].join(", ")}` : "showing all courses");
}
function clearSel() { S.sel.clear(); saveSel(); render(); status("showing all courses"); }

function panelStats(list) {
  const t = today(), tIso = iso(t);
  const done = list.filter((i) => i.done).length;
  const open = list.filter((i) => !i.done);
  const overdue = open.filter((i) => i.date && i.date < tIso).length;
  const next = open.filter((i) => i.date && i.date >= tIso).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))[0];
  const exams = open.filter((i) => isExam(i) && i.date && i.date >= tIso).length;
  return { total: list.length, done, overdue, next, exams, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

function panelEl(code, name, color, list, pressed, onClick, keyHint) {
  const st = panelStats(list), t = today();
  const b = document.createElement("button");
  b.type = "button";
  b.className = "panel" + (pressed ? " on" : "") + (S.sel.size && !pressed && code !== "ALL" ? " dim" : "");
  b.style.setProperty("--c", color);
  b.setAttribute("aria-pressed", pressed ? "true" : "false");
  b.title = `${code}${keyHint ? ` — key ${keyHint}` : ""}`;
  const nxt = st.next
    ? `<b>NEXT</b> ${esc(fmtD(parseD(st.next.date)))} (${dayDiff(t, parseD(st.next.date))}d) · <span class="${isExam(st.next) ? "ex" : ""}">${code === "ALL" ? esc(st.next.course) + " · " : ""}${esc(st.next.title)}</span>`
    : (st.total ? "nothing upcoming" : "no items");
  b.innerHTML =
    `<div class="p-top"><span class="p-code">${esc(code)}</span><span class="p-key">${keyHint ?? ""}</span></div>` +
    `<div class="p-name">${esc(name)}</div>` +
    `<div class="p-bar"><i style="width:${st.pct}%"></i></div>` +
    `<div class="p-stats">${st.done}/${st.total} done` +
      (st.overdue ? ` · <span class="ex">${st.overdue} overdue</span>` : "") +
      (st.exams ? ` · ${st.exams} exam${st.exams > 1 ? "s" : ""} left` : "") + `</div>` +
    `<div class="p-next">${nxt}</div>`;
  b.onclick = onClick;
  return b;
}

function renderPanels() {
  const el = $("#panels"); el.innerHTML = "";
  el.appendChild(panelEl("ALL", "every course", "#cfe9f2", S.data.items, S.sel.size === 0, clearSel, "0"));
  Object.keys(S.data.courses).forEach((c, k) => {
    const list = S.data.items.filter((i) => i.course === c);
    el.appendChild(panelEl(c, S.data.courses[c].name || "", color(c), list, S.sel.has(c), () => toggleCourse(c), k < 9 ? String(k + 1) : null));
  });
}

function renderSelSummary() {
  const el = $("#sel-summary");
  if (!S.sel.size) { el.innerHTML = `<span class="muted">showing all courses · click panels to filter (keys 1–${Math.min(9, Object.keys(S.data.courses).length)}, 0 = all)</span>`; return; }
  const shown = S.data.items.filter((i) => i.date && inSel(i)).length;
  el.innerHTML = `FILTER ` + [...S.sel].map((c) => `<span class="chip" style="--c:${color(c)}">${esc(c)}</span>`).join(" ") +
    ` <span class="muted">${shown} dated item${shown === 1 ? "" : "s"}</span> <button id="sel-clear" class="ghost">SHOW ALL</button>`;
  $("#sel-clear").onclick = clearSel;
}

function renderToday() {
  const t = today(), tIso = iso(t);
  const open = S.data.items.filter((i) => !i.done && i.date && inSel(i)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
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
  const filt = S.sel.size ? ` <span class="filt">· ${esc([...S.sel].join(", "))}</span>` : "";
  $("#today-box").innerHTML = `<div class="lbl">TODAY${filt}</div><div class="date">${esc(fmtD(t)).toUpperCase()}, ${t.getFullYear()}</div>${rows}`;
}

function itemEl(it) {
  const d = document.createElement("div");
  d.className = "item" + (isExam(it) ? " exam" : "") + (it.done ? " done" : "") +
    ((!inSel(it) || (S.hideDone && it.done)) ? " hidden" : "");
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
// keys 1..9 toggle course panels, 0 = all (ignored while typing or with the dialog open)
document.addEventListener("keydown", (e) => {
  if (!S.data || $("#dlg").open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === "0") { clearSel(); return; }
  const n = Number(e.key);
  const codes = Object.keys(S.data.courses);
  if (n >= 1 && n <= Math.min(9, codes.length)) toggleCourse(codes[n - 1]);
});
boot();
