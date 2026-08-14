// Kochen (Stufe 3): führt Schritt für Schritt durch ein Rezept.
//
// Drei Modi:
//  - 'timed': Essenszeit wählen, die App rechnet von T-Minuten rückwärts und
//    sortiert live in "Jetzt dran" / "Schon möglich" / "Später".
//  - 'free':  ohne Uhrzeit, einfach der Reihe nach – vorziehbare Schritte
//    werden trotzdem jederzeit angeboten.
//  - 'prep':  nur die Vortags-Schritte. Was hier abgehakt wird, merkt sich
//    die App pro Rezept (48 h) und zeigt es beim Kochen als erledigt.
//
// Alle Schritte sind immer antippbar – die Gruppen sind Empfehlung, kein Zwang.

import {
  loadRecipes,
  loadCookingSession, saveCookingSession, clearCookingSession,
  loadPrepDone, savePrepDone,
} from './storage.js';

let session = loadCookingSession();
let tickHandle = null;
let lastRenderMinute = null;
let wakeLock = null;
let audioCtx = null;
const alertedTimers = new Set(); // Timer, für die schon gepiept wurde

// ---- DOM ----
const homeEl = document.getElementById('cooking-home');
const setupEl = document.getElementById('cooking-setup');
const activeEl = document.getElementById('cooking-active');

const recipeListEl = document.getElementById('cooking-recipe-list');
const emptyEl = document.getElementById('cooking-empty');

const setupName = document.getElementById('setup-recipe-name');
const setupMeta = document.getElementById('setup-meta');
const setupMealtime = document.getElementById('setup-mealtime');
const setupTimeInfo = document.getElementById('setup-time-info');
const setupPrepCard = document.getElementById('setup-prep-card');
const setupPrepHint = document.getElementById('setup-prep-hint');

const titleEl = document.getElementById('cooking-title');
const mealInfoEl = document.getElementById('cooking-meal-info');
const timersEl = document.getElementById('cooking-timers');
const contentEl = document.getElementById('cooking-content');

const quitDialog = document.getElementById('cooking-quit-dialog');
const quitInfo = document.getElementById('cooking-quit-info');

let setupRecipeId = null;

// ---- Hilfen ----
function findRecipe(id) {
  return loadRecipes().find((r) => r.id === id) || null;
}

function maxOffset(recipe) {
  let max = 0;
  for (const s of recipe.steps) {
    if (s.offsetMin != null && s.offsetMin > max) max = s.offsetMin;
  }
  return max;
}

function hasTimes(recipe) {
  return recipe.steps.some((s) => s.offsetMin != null);
}

function fmtClock(ts) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} Std` : `${h} Std ${m} min`;
}

// "Timer: 9 min"-Vermerk aus dem Anzeigetext nehmen – dafür gibt es den Knopf.
function displayText(text) {
  return text.replace(/\s*\(\s*Timer:\s*\d+\s*(?:min|minuten)?\s*\)/i, '').trim();
}

// ---- Unteransichten ----
function showSub(name) {
  homeEl.classList.toggle('hidden', name !== 'home');
  setupEl.classList.toggle('hidden', name !== 'setup');
  activeEl.classList.toggle('hidden', name !== 'active');
  window.scrollTo(0, 0);
}

// Beim Öffnen des Kochen-Tabs: laufende Session zeigen, sonst Rezeptwahl.
export function refreshCookingView() {
  if (session) {
    if (!findRecipe(session.recipeId)) {
      // Rezept wurde gelöscht → Session verwerfen
      endSession();
      return;
    }
    showSub('active');
    renderActive();
    startTicking();
  } else {
    stopTicking();
    showSub('home');
    renderHome();
  }
}

// Aus der Rezept-Detailansicht: direkt ins Setup springen.
export function openCookingSetup(recipeId) {
  if (session && session.recipeId === recipeId) {
    // Läuft schon → einfach hin
    switchToCookingTab();
    refreshCookingView();
    return;
  }
  if (session) {
    // Andere Session läuft → erst dorthin, Nutzer soll bewusst beenden
    switchToCookingTab();
    refreshCookingView();
    return;
  }
  openSetup(recipeId);
  switchToCookingTab();
}

function switchToCookingTab() {
  document.querySelector('.nav-btn[data-view="view-cooking"]').click();
}

// ---- Rezeptwahl ----
function renderHome() {
  const recipes = loadRecipes().filter((r) => r.steps.length > 0 || r.prepSteps.length > 0);
  recipeListEl.innerHTML = '';
  emptyEl.classList.toggle('hidden', recipes.length > 0);

  for (const r of recipes) {
    const card = document.createElement('button');
    card.className = 'recipe-card';

    const name = document.createElement('div');
    name.className = 'recipe-card-name';
    name.textContent = r.name;
    card.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'recipe-card-meta';
    const parts = [];
    if (r.steps.length > 0) parts.push(`${r.steps.length} Schritte`);
    const dur = maxOffset(r);
    if (dur > 0) parts.push(`ca. ${fmtDuration(dur)}`);
    if (r.prepSteps.length > 0) parts.push(`${r.prepSteps.length} Vortags-Schritte`);
    meta.textContent = parts.join(' · ');
    card.appendChild(meta);

    card.addEventListener('click', () => openSetup(r.id));
    recipeListEl.appendChild(card);
  }
}

// ---- Setup ----
function openSetup(recipeId) {
  const r = findRecipe(recipeId);
  if (!r) return;
  setupRecipeId = recipeId;

  setupName.textContent = r.name;

  const parts = [];
  if (r.steps.length > 0) parts.push(`${r.steps.length} Schritte`);
  const dur = maxOffset(r);
  if (dur > 0) parts.push(`Zeitbedarf ca. ${fmtDuration(dur)}`);
  setupMeta.textContent = parts.join(' · ');

  // Zeitplan nur anbieten, wenn das Rezept T-Zeiten hat
  const timedCard = document.getElementById('setup-start-timed').closest('.setup-card');
  timedCard.classList.toggle('hidden', !hasTimes(r));

  if (hasTimes(r)) {
    // Vorschlag: jetzt + Zeitbedarf + 10 min Puffer, auf 5 min gerundet
    const suggested = new Date(Date.now() + (dur + 10) * 60000);
    suggested.setMinutes(Math.ceil(suggested.getMinutes() / 5) * 5, 0, 0);
    setupMealtime.value = suggested.toTimeString().slice(0, 5);
    updateSetupTimeInfo();
  }

  // Vortags-Karte
  const prepDone = loadPrepDone(recipeId);
  const openPrep = r.prepSteps.filter((_, i) => !prepDone['p' + i]).length;
  setupPrepCard.classList.toggle('hidden', r.prepSteps.length === 0);
  if (r.prepSteps.length > 0) {
    setupPrepHint.textContent = openPrep === 0
      ? 'Alle Vortags-Schritte sind schon erledigt. 👍'
      : `${openPrep} von ${r.prepSteps.length} Vortags-Schritten sind noch offen. Was du hier abhakst, merkt sich die App fürs Kochen.`;
  }

  showSub('setup');
}

// Gewählte Uhrzeit → Zeitstempel; liegt sie in der Vergangenheit, ist morgen gemeint.
function mealTimeFromInput() {
  const value = setupMealtime.value;
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  const t = new Date();
  t.setHours(h, m, 0, 0);
  if (t.getTime() < Date.now() - 60000) t.setDate(t.getDate() + 1);
  return t.getTime();
}

function updateSetupTimeInfo() {
  const r = findRecipe(setupRecipeId);
  const ts = mealTimeFromInput();
  if (!r || !ts) { setupTimeInfo.textContent = ''; return; }

  const inMin = Math.round((ts - Date.now()) / 60000);
  const isTomorrow = new Date(ts).getDate() !== new Date().getDate();
  let info = `Essen ${isTomorrow ? 'morgen ' : ''}um ${fmtClock(ts)} – in ${fmtDuration(inMin)}.`;

  const need = maxOffset(r);
  if (inMin < need) {
    info += ` ⚠ Knapp: Das Rezept braucht eigentlich ${fmtDuration(need)} – die ersten Schritte sind dann sofort dran.`;
  }
  setupTimeInfo.textContent = info;
}

setupMealtime.addEventListener('input', updateSetupTimeInfo);
document.getElementById('cooking-setup-back').addEventListener('click', () => {
  showSub('home');
  renderHome();
});

function startSession(mode) {
  const r = findRecipe(setupRecipeId);
  if (!r) return;

  const done = {};
  // Bereits erledigte Vortags-Schritte übernehmen
  const prepDone = loadPrepDone(r.id);
  for (const key of Object.keys(prepDone)) done[key] = prepDone[key];

  session = {
    recipeId: r.id,
    mode,
    mealTime: mode === 'timed' ? mealTimeFromInput() : null,
    done,
    timers: [],
    startedAt: Date.now(),
  };
  saveCookingSession(session);
  alertedTimers.clear();
  refreshCookingView();
  requestWakeLock();
}

document.getElementById('setup-start-timed').addEventListener('click', () => startSession('timed'));
document.getElementById('setup-start-free').addEventListener('click', () => startSession('free'));
document.getElementById('setup-start-prep').addEventListener('click', () => startSession('prep'));

// ---- Session beenden ----
document.getElementById('cooking-quit').addEventListener('click', () => {
  const r = session && findRecipe(session.recipeId);
  const total = r ? r.steps.length : 0;
  const doneCount = r ? r.steps.filter((_, i) => session.done['s' + i]).length : 0;
  quitInfo.textContent = doneCount >= total && total > 0
    ? 'Alles erledigt – guten Appetit!'
    : 'Der Fortschritt dieser Koch-Session geht verloren. Erledigte Vortags-Schritte bleiben gemerkt.';
  quitDialog.showModal();
});
document.getElementById('cooking-quit-cancel').addEventListener('click', () => quitDialog.close());
document.getElementById('cooking-quit-confirm').addEventListener('click', () => endSession());

function endSession() {
  session = null;
  clearCookingSession();
  stopTicking();
  releaseWakeLock();
  showSub('home');
  renderHome();
}

// ---- Schritte abhaken ----
function toggleStep(key) {
  if (!session) return;
  if (session.done[key]) delete session.done[key];
  else session.done[key] = Date.now();

  // Vortags-Schritte zusätzlich dauerhaft merken
  if (key.startsWith('p')) {
    const prepDone = loadPrepDone(session.recipeId);
    if (session.done[key]) prepDone[key] = session.done[key];
    else delete prepDone[key];
    savePrepDone(session.recipeId, prepDone);
  }

  saveCookingSession(session);
  renderActive();
}

// ---- Timer ----
function startTimer(key, label, min) {
  if (!session) return;
  session.timers.push({ key, label, min, endsAt: Date.now() + min * 60000 });
  saveCookingSession(session);
  ensureAudio();
  renderActive();
}

function cancelTimer(idx) {
  if (!session) return;
  session.timers.splice(idx, 1);
  saveCookingSession(session);
  renderActive();
}

function ensureAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { /* ohne Ton geht es auch */ }
}

function beep() {
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, now + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.4, now + i * 0.35 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.35 + 0.3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + i * 0.35);
      osc.stop(now + i * 0.35 + 0.32);
    }
  } catch { /* egal */ }
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
}

function renderTimers() {
  timersEl.innerHTML = '';
  if (!session || session.timers.length === 0) return;

  const now = Date.now();
  session.timers.forEach((t, idx) => {
    const row = document.createElement('div');
    const remaining = Math.ceil((t.endsAt - now) / 1000);
    const isDone = remaining <= 0;
    row.className = 'timer-row' + (isDone ? ' timer-done' : '');

    const label = document.createElement('div');
    label.className = 'timer-label';
    label.textContent = t.label;

    const time = document.createElement('div');
    time.className = 'timer-time';
    if (isDone) {
      time.textContent = '⏰ fertig!';
      const timerId = t.key + ':' + t.endsAt;
      if (!alertedTimers.has(timerId)) {
        alertedTimers.add(timerId);
        beep();
      }
    } else {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      time.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }

    const close = document.createElement('button');
    close.className = 'timer-close';
    close.textContent = isDone ? 'OK' : '✕';
    close.addEventListener('click', () => cancelTimer(idx));

    row.append(label, time, close);
    timersEl.appendChild(row);
  });
}

// ---- Laufende Session rendern ----
function stepKey(kind, idx) {
  return (kind === 'prep' ? 'p' : 's') + idx;
}

// Schritte in Gruppen einteilen. Jede Gruppe: { title, hint, steps: [entry] }
// entry: { key, step, planned (ts|null), status: 'due'|'soon'|'later'|'flex' }
function computeGroups(r) {
  const now = Date.now();
  const groups = [];

  // Vortags-Schritte (offen)
  const prepOpen = [];
  r.prepSteps.forEach((s, i) => {
    const key = stepKey('prep', i);
    if (!session.done[key]) prepOpen.push({ key, step: s, planned: null, status: 'flex' });
  });

  if (session.mode === 'prep') {
    if (prepOpen.length > 0) {
      groups.push({
        title: 'Vortags-Schritte',
        hint: 'In beliebiger Reihenfolge – die App merkt sich alles Erledigte.',
        steps: prepOpen,
      });
    }
    return groups;
  }

  if (prepOpen.length > 0) {
    groups.push({
      title: 'Vorbereitung (eigentlich Vortag)',
      hint: 'Noch offen – am besten gleich zu Beginn nachholen.',
      steps: prepOpen,
    });
  }

  const due = [];
  const flex = [];
  const later = [];

  if (session.mode === 'timed' && session.mealTime) {
    r.steps.forEach((s, i) => {
      const key = stepKey('step', i);
      if (session.done[key]) return;
      if (s.offsetMin == null) {
        flex.push({ key, step: s, planned: null, status: 'flex' });
        return;
      }
      const planned = session.mealTime - s.offsetMin * 60000;
      if (planned <= now) due.push({ key, step: s, planned, status: 'due' });
      else if (s.flexible) flex.push({ key, step: s, planned, status: 'flex' });
      else later.push({ key, step: s, planned, status: 'later' });
    });
    due.sort((a, b) => a.planned - b.planned);
    later.sort((a, b) => a.planned - b.planned);
  } else {
    // Ohne Zeitplan: erster offener Schritt ist dran, vorziehbare immer möglich
    let firstFound = false;
    r.steps.forEach((s, i) => {
      const key = stepKey('step', i);
      if (session.done[key]) return;
      const entry = { key, step: s, planned: null, status: 'later' };
      if (!firstFound && !s.flexible) {
        entry.status = 'due';
        due.push(entry);
        firstFound = true;
      } else if (s.flexible) {
        entry.status = 'flex';
        flex.push(entry);
      } else {
        later.push(entry);
      }
    });
    // Falls nur noch vorziehbare Schritte übrig sind: den ersten als "dran" zeigen
    if (due.length === 0 && flex.length > 0) {
      due.push({ ...flex.shift(), status: 'due' });
    }
  }

  if (due.length > 0) {
    groups.push({ title: 'Jetzt dran', hint: null, steps: due });
  }
  if (flex.length > 0) {
    groups.push({
      title: 'Schon möglich',
      hint: 'Wenn du Luft hast, kannst du diese Schritte vorziehen.',
      steps: flex,
    });
  }
  if (later.length > 0) {
    groups.push({ title: 'Später', hint: null, steps: later });
  }

  return groups;
}

function renderActive() {
  const r = session && findRecipe(session.recipeId);
  if (!r) { endSession(); return; }

  titleEl.textContent = r.name;

  // Kopfzeile: Essenszeit
  if (session.mode === 'timed' && session.mealTime) {
    const inMin = Math.round((session.mealTime - Date.now()) / 60000);
    if (inMin > 0) {
      mealInfoEl.textContent = `Essen um ${fmtClock(session.mealTime)} · noch ${fmtDuration(inMin)}`;
    } else {
      mealInfoEl.textContent = `Essenszeit ${fmtClock(session.mealTime)} ist erreicht`;
    }
  } else if (session.mode === 'prep') {
    mealInfoEl.textContent = 'Vorbereitung für später';
  } else {
    mealInfoEl.textContent = 'Ohne Zeitplan – in deinem Tempo';
  }

  renderTimers();

  contentEl.innerHTML = '';
  const groups = computeGroups(r);

  const allSteps = session.mode === 'prep' ? r.prepSteps : r.steps;
  const prefix = session.mode === 'prep' ? 'p' : 's';
  const doneCount = allSteps.filter((_, i) => session.done[prefix + i]).length;
  const allDone = groups.length === 0 && allSteps.length > 0;

  // Fortschritt
  if (allSteps.length > 0) {
    const prog = document.createElement('div');
    prog.className = 'cooking-progress';
    const bar = document.createElement('div');
    bar.className = 'cooking-progress-bar';
    bar.style.width = `${Math.round((doneCount / allSteps.length) * 100)}%`;
    prog.appendChild(bar);
    contentEl.appendChild(prog);
  }

  if (allDone) {
    const card = document.createElement('div');
    card.className = 'placeholder-card';
    const emoji = document.createElement('div');
    emoji.className = 'placeholder-emoji';
    emoji.textContent = session.mode === 'prep' ? '✅' : '🎉';
    const h = document.createElement('h2');
    h.textContent = session.mode === 'prep'
      ? 'Alles vorbereitet!'
      : 'Alles erledigt – guten Appetit!';
    const btn = document.createElement('button');
    btn.className = 'btn-primary btn-block';
    btn.textContent = session.mode === 'prep' ? 'Fertig für heute' : 'Kochen abschließen';
    btn.style.marginTop = '16px';
    btn.addEventListener('click', () => endSession());
    card.append(emoji, h, btn);
    contentEl.appendChild(card);
  }

  for (const group of groups) {
    const head = document.createElement('h3');
    head.className = 'detail-section-title cooking-group-title'
      + (group.title === 'Jetzt dran' ? ' group-due' : '');
    head.textContent = group.title;
    contentEl.appendChild(head);

    if (group.hint) {
      const hint = document.createElement('p');
      hint.className = 'cooking-group-hint';
      hint.textContent = group.hint;
      contentEl.appendChild(hint);
    }

    const box = document.createElement('div');
    box.className = 'category-items';
    for (const entry of group.steps) {
      box.appendChild(renderStepRow(entry));
    }
    contentEl.appendChild(box);
  }

  // Erledigte Schritte (zum Zurücknehmen)
  const doneEntries = [];
  allSteps.forEach((s, i) => {
    const key = prefix + i;
    if (session.done[key]) doneEntries.push({ key, step: s });
  });
  // Im Kochmodus auch erledigte Vortags-Schritte zeigen
  if (session.mode !== 'prep') {
    r.prepSteps.forEach((s, i) => {
      const key = 'p' + i;
      if (session.done[key]) doneEntries.push({ key, step: s });
    });
  }
  if (doneEntries.length > 0 && !allDone) {
    const head = document.createElement('h3');
    head.className = 'detail-section-title cooking-group-title done-title';
    head.textContent = `Erledigt (${doneEntries.length})`;
    contentEl.appendChild(head);

    const box = document.createElement('div');
    box.className = 'category-items cooking-done-list';
    for (const entry of doneEntries) {
      box.appendChild(renderStepRow({ ...entry, planned: null, status: 'done' }));
    }
    contentEl.appendChild(box);
  }

  // Notizen als Nachschlagewerk
  if (r.notes) {
    const details = document.createElement('details');
    details.className = 'cooking-notes';
    const summary = document.createElement('summary');
    summary.textContent = 'Detail-Rezepte & Notizen';
    const pre = document.createElement('div');
    pre.className = 'detail-notes';
    pre.textContent = r.notes;
    details.append(summary, pre);
    contentEl.appendChild(details);
  }
}

function renderStepRow(entry) {
  const isDone = entry.status === 'done';
  const row = document.createElement('div');
  row.className = 'item cooking-step' + (isDone ? ' checked' : '');
  if (entry.status === 'due') row.classList.add('step-due');

  const check = document.createElement('div');
  check.className = 'item-check';
  check.textContent = '✓';
  row.appendChild(check);

  const text = document.createElement('div');
  text.className = 'item-text';

  // Zeit-Badge
  const badges = document.createElement('div');
  let hasBadge = false;
  if (entry.planned != null) {
    const badge = document.createElement('span');
    badge.className = 'step-time';
    const now = Date.now();
    if (entry.status === 'due') {
      const overdue = Math.round((now - entry.planned) / 60000);
      badge.textContent = overdue >= 3 ? `${fmtClock(entry.planned)} · seit ${fmtDuration(overdue)}` : 'jetzt';
    } else {
      const inMin = Math.max(1, Math.round((entry.planned - now) / 60000));
      badge.textContent = `${fmtClock(entry.planned)} · in ${fmtDuration(inMin)}`;
    }
    badges.appendChild(badge);
    hasBadge = true;
  }
  if (entry.step.flexible && entry.status === 'flex') {
    const badge = document.createElement('span');
    badge.className = 'step-time step-flex';
    badge.textContent = 'vorziehbar';
    badges.appendChild(badge);
    hasBadge = true;
  }
  if (hasBadge) text.appendChild(badges);

  const nameEl = document.createElement('div');
  nameEl.className = 'item-name cooking-step-text';
  nameEl.textContent = displayText(entry.step.text);
  text.appendChild(nameEl);
  row.appendChild(text);

  // Timer-Knopf
  if (entry.step.timerMin && !isDone) {
    const timerBtn = document.createElement('button');
    timerBtn.className = 'timer-btn';
    timerBtn.textContent = `⏱ ${entry.step.timerMin} min`;
    timerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const label = displayText(entry.step.text);
      startTimer(entry.key, label.length > 40 ? label.slice(0, 40) + '…' : label, entry.step.timerMin);
    });
    row.appendChild(timerBtn);
  }

  row.addEventListener('click', () => toggleStep(entry.key));
  return row;
}

// ---- Tick: Zeiten und Timer aktuell halten ----
function startTicking() {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    if (!session || activeEl.classList.contains('hidden')) return;
    renderTimers();
    // Schritt-Gruppen nur einmal pro Minute neu einsortieren
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== lastRenderMinute) {
      lastRenderMinute = minute;
      renderActive();
    }
  }, 1000);
}

function stopTicking() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

// ---- Bildschirm anlassen beim Kochen ----
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* z. B. Energiesparmodus – nicht schlimm */ }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session) {
    requestWakeLock();
    renderActive();
  }
});

// ---- Start ----
document.querySelector('.nav-btn[data-view="view-cooking"]')
  .addEventListener('click', refreshCookingView);

refreshCookingView();
