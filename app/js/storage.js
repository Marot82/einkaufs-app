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

export function isSeeded() {
  return load('seeded', false);
}

export function markSeeded() {
  save('seeded', true);
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
