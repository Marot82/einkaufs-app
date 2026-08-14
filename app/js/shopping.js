// Der Einkaufszettel: anzeigen, hinzufügen, abhaken, bearbeiten, aufräumen.

import { loadItems, saveItems, loadHistory, rememberInHistory, newId } from './storage.js';
import { parseItemLine, formatQtyUnit } from './parse.js';
import { CATEGORIES, DEFAULT_CATEGORY, guessCategory } from './categories.js';

let items = loadItems();
let editingId = null;
let longPressTimer = null;
let longPressFired = false;

// ---- DOM-Verweise ----
const listArea = document.getElementById('shopping-list');
const boughtArea = document.getElementById('bought-area');
const boughtList = document.getElementById('bought-list');
const boughtLabel = document.getElementById('bought-label');
const boughtToggle = document.getElementById('bought-toggle');
const emptyHint = document.getElementById('empty-hint');
const addForm = document.getElementById('add-form');
const addInput = document.getElementById('add-input');
const suggestionsBox = document.getElementById('suggestions');
const badge = document.getElementById('badge-shopping');

const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const editQty = document.getElementById('edit-qty');
const editUnit = document.getElementById('edit-unit');
const editName = document.getElementById('edit-name');
const editCategory = document.getElementById('edit-category');

const clearDialog = document.getElementById('clear-dialog');
const clearInfo = document.getElementById('clear-info');

// ---- Hilfen ----

function persist() {
  saveItems(items);
  render();
}

function normName(name) {
  return name.trim().toLowerCase();
}

// Neuen Eintrag einfügen. Gleicher Name + gleiche Einheit → Mengen zusammenzählen.
export function addItem({ qty, unit, name, category, source }) {
  const cat = category || knownCategory(name) || guessCategory(name);
  const existing = items.find(
    (it) => normName(it.name) === normName(name) && (it.unit || null) === (unit || null)
  );

  if (existing && !existing.checked) {
    if (existing.qty != null && qty != null) existing.qty += qty;
    else if (qty != null) existing.qty = qty;
  } else if (existing && existing.checked) {
    // War schon gekauft → wieder aktiv setzen mit der neuen Menge.
    existing.checked = false;
    existing.qty = qty;
  } else {
    items.push({
      id: newId(),
      name: name.trim(),
      qty: qty ?? null,
      unit: unit || null,
      category: cat,
      checked: false,
      source: source || null,
    });
  }

  rememberInHistory({ name, unit, qty, category: cat });
  persist();
}

// Kategorie aus dem Verlauf des Nutzers (hat Vorrang vor dem Wörterbuch).
function knownCategory(name) {
  const entry = loadHistory()[normName(name)];
  return entry?.category || null;
}

// ---- Rendern ----

function render() {
  const open = items.filter((it) => !it.checked);
  const bought = items.filter((it) => it.checked);

  // Offene Einträge nach Kategorie gruppieren, Reihenfolge wie CATEGORIES.
  listArea.innerHTML = '';
  for (const cat of CATEGORIES) {
    const catItems = open.filter((it) => (it.category || DEFAULT_CATEGORY) === cat);
    if (catItems.length === 0) continue;

    const group = document.createElement('div');
    group.className = 'category-group';

    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = cat;
    group.appendChild(title);

    const box = document.createElement('div');
    box.className = 'category-items';
    for (const it of catItems) box.appendChild(renderItem(it));
    group.appendChild(box);

    listArea.appendChild(group);
  }

  // Gekaufte unten
  boughtList.innerHTML = '';
  for (const it of bought) boughtList.appendChild(renderItem(it));
  boughtLabel.textContent = `Im Wagen (${bought.length})`;
  boughtArea.classList.toggle('hidden', bought.length === 0);

  // Leere-Liste-Hinweis + Badge
  emptyHint.classList.toggle('hidden', items.length > 0);
  badge.textContent = String(open.length);
  badge.classList.toggle('hidden', open.length === 0);
}

function renderItem(it) {
  const row = document.createElement('div');
  row.className = 'item' + (it.checked ? ' checked' : '');
  row.dataset.id = it.id;

  const check = document.createElement('div');
  check.className = 'item-check';
  check.textContent = '✓';
  row.appendChild(check);

  const text = document.createElement('div');
  text.className = 'item-text';

  const nameEl = document.createElement('div');
  nameEl.className = 'item-name';
  nameEl.textContent = it.name;
  text.appendChild(nameEl);

  const qtyStr = formatQtyUnit(it);
  if (qtyStr) {
    const qtyEl = document.createElement('div');
    qtyEl.className = 'item-qty';
    qtyEl.textContent = qtyStr;
    text.appendChild(qtyEl);
  }
  row.appendChild(text);

  if (it.source) {
    const note = document.createElement('div');
    note.className = 'item-note';
    note.textContent = it.source;
    row.appendChild(note);
  }

  // Tippen = abhaken, langes Drücken = bearbeiten
  row.addEventListener('click', () => {
    if (longPressFired) { longPressFired = false; return; }
    toggleItem(it.id);
  });
  row.addEventListener('contextmenu', (e) => {
    // Android löst bei langem Drücken ein contextmenu aus – das nutzen wir.
    e.preventDefault();
    longPressFired = true;
    openEditDialog(it.id);
  });
  row.addEventListener('touchstart', () => {
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      openEditDialog(it.id);
    }, 550);
  }, { passive: true });
  row.addEventListener('touchend', () => clearTimeout(longPressTimer));
  row.addEventListener('touchmove', () => clearTimeout(longPressTimer));

  return row;
}

function toggleItem(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  it.checked = !it.checked;
  persist();
}

// ---- Hinzufügen + Vorschläge ----

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const parsed = parseItemLine(addInput.value);
  if (!parsed) return;
  addItem(parsed);
  addInput.value = '';
  hideSuggestions();
  addInput.focus();
});

addInput.addEventListener('input', () => showSuggestions(addInput.value));
addInput.addEventListener('blur', () => setTimeout(hideSuggestions, 200));

function showSuggestions(value) {
  const query = value.trim().toLowerCase();
  // Falls der Nutzer schon eine Menge getippt hat ("2 Zit"), nur den Namensteil suchen.
  const parsed = query ? parseItemLine(query) : null;
  const namePart = parsed ? parsed.name.toLowerCase() : '';

  if (namePart.length < 2) { hideSuggestions(); return; }

  const history = loadHistory();
  const openNames = new Set(
    items.filter((it) => !it.checked).map((it) => normName(it.name))
  );

  const matches = Object.values(history)
    .filter((h) => h.name.toLowerCase().includes(namePart))
    .filter((h) => !openNames.has(normName(h.name)))
    .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
    .slice(0, 5);

  if (matches.length === 0) { hideSuggestions(); return; }

  suggestionsBox.innerHTML = '';
  for (const h of matches) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggestion';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = h.name;
    btn.appendChild(nameSpan);

    const qtyStr = formatQtyUnit({ qty: h.lastQty, unit: h.unit });
    if (qtyStr) {
      const qtySpan = document.createElement('span');
      qtySpan.className = 'sug-qty';
      qtySpan.textContent = `zuletzt: ${qtyStr}`;
      btn.appendChild(qtySpan);
    }

    btn.addEventListener('click', () => {
      // Hat der Nutzer selbst eine Menge getippt, gewinnt seine Menge.
      const typed = parseItemLine(addInput.value);
      addItem({
        name: h.name,
        qty: typed?.qty ?? h.lastQty ?? null,
        unit: typed?.qty != null ? typed.unit : h.unit,
        category: h.category,
      });
      addInput.value = '';
      hideSuggestions();
      addInput.focus();
    });
    suggestionsBox.appendChild(btn);
  }
  suggestionsBox.classList.remove('hidden');
}

function hideSuggestions() {
  suggestionsBox.classList.add('hidden');
}

// ---- Bearbeiten-Dialog ----

function openEditDialog(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  editingId = id;

  editQty.value = it.qty != null ? String(it.qty).replace('.', ',') : '';
  editUnit.value = it.unit || '';
  editName.value = it.name;

  editCategory.innerHTML = '';
  for (const cat of CATEGORIES) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    if ((it.category || DEFAULT_CATEGORY) === cat) opt.selected = true;
    editCategory.appendChild(opt);
  }

  editDialog.showModal();
}

editForm.addEventListener('submit', () => {
  const it = items.find((x) => x.id === editingId);
  if (!it) return;

  const qtyRaw = editQty.value.trim().replace(',', '.');
  it.qty = qtyRaw === '' ? null : (isNaN(parseFloat(qtyRaw)) ? it.qty : parseFloat(qtyRaw));
  it.unit = editUnit.value.trim() || null;
  it.name = editName.value.trim() || it.name;
  it.category = editCategory.value;

  rememberInHistory(it);
  persist();
});

document.getElementById('edit-cancel').addEventListener('click', () => editDialog.close());

document.getElementById('edit-delete').addEventListener('click', () => {
  items = items.filter((x) => x.id !== editingId);
  editDialog.close();
  persist();
});

// ---- Aufräumen (Gekauftes entfernen) ----

document.getElementById('btn-clear-bought').addEventListener('click', () => {
  const bought = items.filter((it) => it.checked);
  if (bought.length === 0) return;
  clearInfo.textContent =
    bought.length === 1
      ? '1 gekaufter Eintrag wird vom Zettel entfernt.'
      : `${bought.length} gekaufte Einträge werden vom Zettel entfernt.`;
  clearDialog.showModal();
});

document.getElementById('clear-cancel').addEventListener('click', () => clearDialog.close());

document.getElementById('clear-confirm').addEventListener('click', () => {
  items = items.filter((it) => !it.checked);
  persist();
});

// ---- Gekauft-Bereich ein-/ausklappen ----

boughtToggle.addEventListener('click', () => {
  boughtArea.classList.toggle('collapsed');
});

// ---- Start ----
render();
