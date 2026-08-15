// Rezept-Bibliothek: Liste, Import mit Vorschau, Detailansicht,
// "auf den Einkaufszettel", Portionsumrechnung, Export/Teilen.

import { loadRecipes, saveRecipes, seededVersion, markSeeded, newId } from './storage.js';
import { parseRecipeText, serializeRecipe } from './recipeParse.js';
import { formatQty } from './parse.js';
import { CATEGORIES, DEFAULT_CATEGORY } from './categories.js';
import { addItem } from './shopping.js';
import { SEED_RECIPE_TEXT } from './seed.js';
import { openCookingSetup } from './cooking.js';

let recipes = loadRecipes();
let currentId = null;      // gerade geöffnetes Rezept
let currentServings = null; // gewählte Portionszahl in der Detailansicht
let pendingRecipe = null;  // geparstes, noch nicht gespeichertes Rezept

// ---- Eingebautes Beispielrezept (Thali) einpflanzen bzw. aktualisieren ----
// Bei Erststart wird es angelegt; steigt SEED_VERSION, wird eine vorhandene
// Kopie durch die neue Fassung ersetzt (gleiche id, damit z. B. erledigte
// Vortags-Schritte erhalten bleiben). Hat der Nutzer das Rezept gelöscht,
// bleibt es gelöscht.
const SEED_VERSION = 7;
if (seededVersion() < SEED_VERSION) {
  const { recipe } = parseRecipeText(SEED_RECIPE_TEXT);
  if (recipe) {
    const idx = recipes.findIndex((r) => r.name === recipe.name);
    if (idx >= 0) {
      recipe.id = recipes[idx].id;
      recipe.createdAt = recipes[idx].createdAt;
      recipes[idx] = recipe;
      saveRecipes(recipes);
    } else if (seededVersion() === 0) {
      recipe.id = newId();
      recipe.createdAt = Date.now();
      recipes.push(recipe);
      saveRecipes(recipes);
    }
  }
  markSeeded(SEED_VERSION);
}

// ---- DOM ----
const homeEl = document.getElementById('recipes-home');
const importEl = document.getElementById('recipe-import');
const detailEl = document.getElementById('recipe-detail');
const listEl = document.getElementById('recipe-list');
const emptyEl = document.getElementById('recipes-empty');
const importText = document.getElementById('import-text');
const importPreview = document.getElementById('import-preview');
const detailContent = document.getElementById('recipe-detail-content');

const tolistDialog = document.getElementById('tolist-dialog');
const tolistItems = document.getElementById('tolist-items');
const deleteDialog = document.getElementById('recipe-delete-dialog');
const deleteInfo = document.getElementById('recipe-delete-info');

// ---- Unteransichten wechseln ----
function showScreen(name) {
  homeEl.classList.toggle('hidden', name !== 'recipes-home');
  importEl.classList.toggle('hidden', name !== 'recipe-import');
  detailEl.classList.toggle('hidden', name !== 'recipe-detail');
  window.scrollTo(0, 0);
}

for (const btn of document.querySelectorAll('.btn-back')) {
  btn.addEventListener('click', () => showScreen(btn.dataset.back));
}

// ---- Bibliothek ----
function renderList() {
  listEl.innerHTML = '';
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
    if (r.servings) parts.push(`${r.servings} Portionen`);
    parts.push(`${r.ingredients.length} Zutaten`);
    if (r.steps.length > 0) parts.push(`${r.steps.length} Schritte`);
    meta.textContent = parts.join(' · ');
    card.appendChild(meta);

    if (r.info) {
      const info = document.createElement('div');
      info.className = 'recipe-card-info';
      info.textContent = r.info;
      card.appendChild(info);
    }

    card.addEventListener('click', () => openDetail(r.id));
    listEl.appendChild(card);
  }
}

// ---- Import ----
document.getElementById('btn-recipe-import').addEventListener('click', () => {
  importText.value = '';
  importPreview.classList.add('hidden');
  pendingRecipe = null;
  showScreen('recipe-import');
});

document.getElementById('btn-import-parse').addEventListener('click', () => {
  const { recipe, warnings } = parseRecipeText(importText.value);
  pendingRecipe = recipe;
  renderPreview(recipe, warnings);
});

function renderPreview(recipe, warnings) {
  importPreview.innerHTML = '';
  importPreview.classList.remove('hidden');

  if (!recipe || recipe.ingredients.length === 0) {
    const p = document.createElement('p');
    p.className = 'preview-warning';
    p.textContent = warnings.join(' ');
    importPreview.appendChild(p);
    return;
  }

  const h = document.createElement('h2');
  h.textContent = `Verstanden: ${recipe.name}`;
  importPreview.appendChild(h);

  const meta = document.createElement('p');
  meta.className = 'preview-meta';
  const parts = [];
  if (recipe.servings) parts.push(`${recipe.servings} Portionen`);
  parts.push(`${recipe.ingredients.length} Zutaten`);
  if (recipe.prepSteps.length > 0) parts.push(`${recipe.prepSteps.length} Vortags-Schritte`);
  if (recipe.steps.length > 0) parts.push(`${recipe.steps.length} Koch-Schritte`);
  meta.textContent = parts.join(' · ');
  importPreview.appendChild(meta);

  for (const w of warnings) {
    const p = document.createElement('p');
    p.className = 'preview-warning';
    p.textContent = '⚠ ' + w;
    importPreview.appendChild(p);
  }

  const ul = document.createElement('ul');
  ul.className = 'preview-ingredients';
  for (const i of recipe.ingredients) {
    const li = document.createElement('li');
    li.textContent = ingredientLabel(i, 1);
    ul.appendChild(li);
  }
  importPreview.appendChild(ul);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary btn-block';
  saveBtn.textContent = 'Rezept speichern';
  saveBtn.addEventListener('click', () => {
    pendingRecipe.id = newId();
    pendingRecipe.createdAt = Date.now();
    recipes.push(pendingRecipe);
    saveRecipes(recipes);
    renderList();
    openDetail(pendingRecipe.id);
  });
  importPreview.appendChild(saveBtn);
}

// ---- Detailansicht ----
function ingredientLabel(ing, factor) {
  let label = '';
  if (ing.qty != null) label += formatQty(round2(ing.qty * factor)) + ' ';
  if (ing.unit) label += ing.unit + ' ';
  label += ing.name;
  return label.trim();
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function currentRecipe() {
  return recipes.find((r) => r.id === currentId) || null;
}

function scaleFactor(r) {
  if (!r.servings || !currentServings) return 1;
  return currentServings / r.servings;
}

function openDetail(id) {
  currentId = id;
  const r = currentRecipe();
  if (!r) return;
  currentServings = r.servings || null;
  renderDetail();
  showScreen('recipe-detail');
}

function renderDetail() {
  const r = currentRecipe();
  if (!r) return;
  const factor = scaleFactor(r);
  detailContent.innerHTML = '';

  const h = document.createElement('h2');
  h.className = 'detail-name';
  h.textContent = r.name;
  detailContent.appendChild(h);

  if (r.info) {
    const info = document.createElement('p');
    info.className = 'detail-info';
    info.textContent = r.info;
    detailContent.appendChild(info);
  }

  // Portions-Stepper
  if (r.servings) {
    const stepper = document.createElement('div');
    stepper.className = 'portion-stepper';

    const minus = document.createElement('button');
    minus.textContent = '−';
    minus.addEventListener('click', () => {
      if (currentServings > 1) { currentServings--; renderDetail(); }
    });

    const label = document.createElement('span');
    label.textContent = `${currentServings} Portionen`;

    const plus = document.createElement('button');
    plus.textContent = '+';
    plus.addEventListener('click', () => {
      currentServings++; renderDetail();
    });

    stepper.append(minus, label, plus);
    detailContent.appendChild(stepper);
  }

  // Aktionen
  const actions = document.createElement('div');
  actions.className = 'detail-actions';

  const toListBtn = document.createElement('button');
  toListBtn.className = 'btn-primary';
  toListBtn.textContent = '🛒 Auf den Einkaufszettel';
  toListBtn.addEventListener('click', openToListDialog);
  actions.appendChild(toListBtn);

  if (r.steps.length > 0 || r.prepSteps.length > 0) {
    const cookBtn = document.createElement('button');
    cookBtn.className = 'btn-plain';
    cookBtn.textContent = '👨‍🍳 Jetzt kochen';
    cookBtn.addEventListener('click', () => openCookingSetup(r.id));
    actions.appendChild(cookBtn);
  }

  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn-plain';
  shareBtn.textContent = 'Teilen / Export';
  shareBtn.addEventListener('click', () => exportRecipe(shareBtn));
  actions.appendChild(shareBtn);

  detailContent.appendChild(actions);

  // Zutaten, gruppiert
  const ingHead = document.createElement('h3');
  ingHead.className = 'detail-section-title';
  ingHead.textContent = 'Zutaten';
  detailContent.appendChild(ingHead);

  for (const cat of CATEGORIES) {
    const ings = r.ingredients.filter((i) => (i.category || DEFAULT_CATEGORY) === cat);
    if (ings.length === 0) continue;

    const catTitle = document.createElement('div');
    catTitle.className = 'category-title';
    catTitle.textContent = cat;
    detailContent.appendChild(catTitle);

    const box = document.createElement('div');
    box.className = 'category-items';
    for (const i of ings) {
      const row = document.createElement('div');
      row.className = 'item item-static';
      const text = document.createElement('div');
      text.className = 'item-text';
      const nameEl = document.createElement('div');
      nameEl.className = 'item-name';
      nameEl.textContent = ingredientLabel(i, factor);
      text.appendChild(nameEl);
      if (i.note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'item-qty';
        noteEl.textContent = i.note;
        text.appendChild(noteEl);
      }
      row.appendChild(text);
      box.appendChild(row);
    }
    detailContent.appendChild(box);
  }

  // Vortag
  if (r.prepSteps.length > 0) {
    const head = document.createElement('h3');
    head.className = 'detail-section-title';
    head.textContent = 'Am Vortag';
    detailContent.appendChild(head);
    detailContent.appendChild(renderSteps(r.prepSteps));
  }

  // Schritte
  if (r.steps.length > 0) {
    const head = document.createElement('h3');
    head.className = 'detail-section-title';
    head.textContent = 'Am Tag selbst';
    detailContent.appendChild(head);
    detailContent.appendChild(renderSteps(r.steps));
  }

  // Notizen
  if (r.notes) {
    const head = document.createElement('h3');
    head.className = 'detail-section-title';
    head.textContent = 'Notizen';
    detailContent.appendChild(head);
    const pre = document.createElement('div');
    pre.className = 'detail-notes';
    pre.textContent = r.notes;
    detailContent.appendChild(pre);
  }
}

function renderSteps(steps) {
  const box = document.createElement('ol');
  box.className = 'step-list';
  for (const s of steps) {
    const li = document.createElement('li');
    if (s.offsetMin != null) {
      const badge = document.createElement('span');
      badge.className = 'step-time';
      badge.textContent = s.offsetMin === 0 ? 'Essenszeit' : `${formatOffset(s.offsetMin)} vorher`;
      li.appendChild(badge);
    }
    const span = document.createElement('span');
    span.textContent = s.text;
    li.appendChild(span);
    box.appendChild(li);
  }
  return box;
}

function formatOffset(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} Std` : `${h}:${String(m).padStart(2, '0')} Std`;
}

// ---- Auf den Einkaufszettel ----
function openToListDialog() {
  const r = currentRecipe();
  if (!r) return;
  const factor = scaleFactor(r);

  tolistItems.innerHTML = '';
  r.ingredients.forEach((ing, idx) => {
    const label = document.createElement('label');
    label.className = 'tolist-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.idx = String(idx);

    const span = document.createElement('span');
    span.textContent = ingredientLabel(ing, factor);

    label.append(cb, span);
    tolistItems.appendChild(label);
  });

  tolistDialog.showModal();
}

document.getElementById('tolist-cancel').addEventListener('click', () => tolistDialog.close());

document.getElementById('tolist-confirm').addEventListener('click', () => {
  const r = currentRecipe();
  if (!r) return;
  const factor = scaleFactor(r);

  let count = 0;
  for (const cb of tolistItems.querySelectorAll('input[type=checkbox]')) {
    if (!cb.checked) continue;
    const ing = r.ingredients[parseInt(cb.dataset.idx, 10)];
    addItem({
      name: ing.name,
      qty: ing.qty != null ? round2(ing.qty * factor) : null,
      unit: ing.unit,
      category: ing.category,
      source: r.name,
    });
    count++;
  }

  // Nach dem Hinzufügen direkt zum Zettel springen
  if (count > 0) {
    document.querySelector('.nav-btn[data-view="view-shopping"]').click();
  }
});

// ---- Export / Teilen ----
async function exportRecipe(btn) {
  const r = currentRecipe();
  if (!r) return;
  const text = serializeRecipe(r);

  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch {
      /* abgebrochen → Zwischenablage versuchen */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = '✓ Kopiert!';
    setTimeout(() => { btn.textContent = old; }, 1500);
  } catch {
    alert('Konnte nicht kopieren – bitte manuell markieren.');
  }
}

// ---- Löschen ----
document.getElementById('btn-recipe-delete').addEventListener('click', () => {
  const r = currentRecipe();
  if (!r) return;
  deleteInfo.textContent = `„${r.name}“ wird aus der Bibliothek entfernt. Einträge auf dem Einkaufszettel bleiben erhalten.`;
  deleteDialog.showModal();
});

document.getElementById('recipe-delete-cancel').addEventListener('click', () => deleteDialog.close());

document.getElementById('recipe-delete-confirm').addEventListener('click', () => {
  recipes = recipes.filter((r) => r.id !== currentId);
  saveRecipes(recipes);
  renderList();
  showScreen('recipes-home');
});

// ---- Start ----
renderList();
