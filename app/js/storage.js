// Zentraler Speicher: alles liegt in localStorage auf dem Gerät.
// Schlüssel sind mit "eka_" (Einkauf & Kochen App) vorangestellt,
// damit sie sich nicht mit anderem beißen.

const PREFIX = 'eka_';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

// ---- Einkaufszettel ----
// Eintrag: { id, name, qty, unit, category, checked, source }
// qty ist eine Zahl oder null (z. B. "Salz" ohne Menge).

export function loadItems() {
  return load('items', []);
}

export function saveItems(items) {
  save('items', items);
}

// ---- Rezepte ----
// Rezept: { id, name, servings, info, ingredients, prepSteps, steps, notes, createdAt }

export function loadRecipes() {
  return load('recipes', []);
}

export function saveRecipes(recipes) {
  save('recipes', recipes);
}

// Version des eingebauten Beispielrezepts. Alte Speicher enthalten `true`
// (aus der Zeit vor der Versionierung) – das zählt als Version 1.
export function seededVersion() {
  const v = load('seeded', 0);
  return v === true ? 1 : v;
}

export function markSeeded(version) {
  save('seeded', version);
}

// ---- Koch-Session (Stufe 3) ----
// { recipeId, mode: 'timed'|'free'|'prep', mealTime, done: {key: ts},
//   timers: [{ key, label, min, endsAt }], startedAt }

export function loadCookingSession() {
  return load('cooking', null);
}

export function saveCookingSession(session) {
  save('cooking', session);
}

export function clearCookingSession() {
  localStorage.removeItem(PREFIX + 'cooking');
}

// Erledigte Vortags-Schritte, pro Rezept, überleben das Session-Ende.
// { [recipeId]: { [stepKey]: timestamp } } – Einträge älter als 48 h verfallen.

const PREP_MAX_AGE = 48 * 60 * 60 * 1000;

export function loadPrepDone(recipeId) {
  const all = load('prepDone', {});
  const entry = all[recipeId] || {};
  const now = Date.now();
  const fresh = {};
  for (const [key, ts] of Object.entries(entry)) {
    if (now - ts < PREP_MAX_AGE) fresh[key] = ts;
  }
  return fresh;
}

export function savePrepDone(recipeId, doneMap) {
  const all = load('prepDone', {});
  all[recipeId] = doneMap;
  save('prepDone', all);
}

// ---- Verlauf für Vorschläge ----
// { "kartoffeln": { name, unit, category, lastQty, count, lastUsed } }

export function loadHistory() {
  return load('history', {});
}

export function saveHistory(history) {
  save('history', history);
}

export function rememberInHistory(item) {
  const history = loadHistory();
  const key = item.name.trim().toLowerCase();
  const prev = history[key] || { count: 0 };
  history[key] = {
    name: item.name.trim(),
    unit: item.unit || prev.unit || null,
    category: item.category || prev.category || null,
    lastQty: item.qty != null ? item.qty : prev.lastQty || null,
    count: prev.count + 1,
    lastUsed: Date.now(),
  };
  saveHistory(history);
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
