// Rezept-Parser: verwandelt eingefügten Text in ein Rezept-Objekt und zurück.
//
// Bevorzugt wird das "App-Format" (siehe Claude-Anweisung-Rezeptformat.md im
// Projektordner). Wird es nicht erkannt, versucht ein Notfall-Modus, aus
// freiem Text wenigstens Zutaten und Schritte zu raten – die Vorschau zeigt
// dem Nutzer immer, was verstanden wurde.

import { parseItemLine } from './parse.js';
import { CATEGORIES, DEFAULT_CATEGORY, guessCategory } from './categories.js';

// Alias-Namen für Kategorien, wie sie in Rezepten öfter vorkommen.
const CATEGORY_ALIASES = {
  'obst & gemüse': 'Obst & Gemüse',
  'obst und gemüse': 'Obst & Gemüse',
  'frisches gemüse': 'Obst & Gemüse',
  'gemüse': 'Obst & Gemüse',
  'obst': 'Obst & Gemüse',
  'kühlregal': 'Kühlregal',
  'kühltheke': 'Kühlregal',
  'milchprodukte': 'Kühlregal',
  'tiefkühl': 'Tiefkühl',
  'tk': 'Tiefkühl',
  'trockenware': 'Trockenware',
  'trockenwaren': 'Trockenware',
  'vorratsschrank': 'Trockenware',
  'grundzutaten': 'Trockenware',
  'gewürze': 'Gewürze',
  'getränke': 'Getränke',
  'haushalt': 'Haushalt',
  'sonstiges': 'Sonstiges',
};

function mapCategory(raw) {
  const key = raw.trim().toLowerCase();
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  const exact = CATEGORIES.find((c) => c.toLowerCase() === key);
  return exact || null;
}

// "(Timer: 12 min)" aus einem Schritttext ziehen.
function extractTimer(text) {
  const m = text.match(/\(\s*Timer:\s*(\d+)\s*(?:min|minuten)?\s*\)/i);
  if (!m) return { text, timerMin: null };
  return { text: text.trim(), timerMin: parseInt(m[1], 10) };
}

// Zutatenzeile: "350 g Kartoffeln (nur die Hälfte)" → Menge/Einheit/Name/Notiz
function parseIngredientLine(line, category) {
  let note = null;
  let text = line.trim().replace(/^[-•*]\s*/, '');

  const noteMatch = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (noteMatch) {
    text = noteMatch[1].trim();
    note = noteMatch[2].trim();
  }

  const parsed = parseItemLine(text);
  if (!parsed) return null;

  return {
    qty: parsed.qty,
    unit: parsed.unit,
    name: parsed.name,
    note,
    category: category || guessCategory(parsed.name),
  };
}

// "(vorziehbar)" markiert Schritte, die früher als geplant erledigt werden
// können – die Kochansicht bietet sie dann jederzeit an.
function extractFlexible(text) {
  const m = text.match(/\s*\(\s*vorziehbar\s*\)/i);
  if (!m) return { text, flexible: false };
  return { text: text.replace(m[0], '').trim(), flexible: true };
}

// Schrittzeile: "- T-240: Naan-Teig ansetzen (Timer: 30 min)"
function parseStepLine(line) {
  let text = line.trim().replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '');
  if (!text) return null;

  let offsetMin = null;
  const offsetMatch = text.match(/^T\s*[-–]\s*(\d+)\s*:?\s*/i);
  if (offsetMatch) {
    offsetMin = parseInt(offsetMatch[1], 10);
    text = text.slice(offsetMatch[0].length).trim();
  } else {
    const zeroMatch = text.match(/^T\s*[-–]?\s*0\s*:?\s*/i);
    if (zeroMatch) {
      offsetMin = 0;
      text = text.slice(zeroMatch[0].length).trim();
    }
  }

  const { text: flexText, flexible } = extractFlexible(text);
  const { text: cleanText, timerMin } = extractTimer(flexText);
  if (!cleanText) return null;
  return { offsetMin, text: cleanText, timerMin, flexible };
}

// ---- Hauptparser ----

export function parseRecipeText(raw) {
  const text = raw.replace(/\r\n?/g, '\n').trim();
  if (!text) return { recipe: null, warnings: ['Der Text ist leer.'] };

  const titleMatch = text.match(/^===\s*REZEPT:?\s*(.+?)\s*===\s*$/m);
  if (titleMatch) return parseAppFormat(text, titleMatch);
  return parseFreeform(text);
}

function parseAppFormat(text, titleMatch) {
  const warnings = [];
  const recipe = {
    name: titleMatch[1].trim(),
    servings: null,
    info: null,
    ingredients: [],
    prepSteps: [],
    steps: [],
    notes: null,
  };

  const body = text.slice(titleMatch.index + titleMatch[0].length);

  // Kopfzeilen (vor der ersten Sektion)
  const servMatch = body.match(/^PORTIONEN:\s*(\d+)\s*$/m);
  if (servMatch) recipe.servings = parseInt(servMatch[1], 10);
  else warnings.push('Keine Portionsangabe gefunden – Umrechnen ist damit nicht möglich.');

  const infoMatch = body.match(/^INFO:\s*(.+)$/m);
  if (infoMatch) recipe.info = infoMatch[1].trim();

  // Sektionen: == NAME == bis zur nächsten Sektion
  const sections = {};
  const sectionRegex = /^==\s*([A-ZÄÖÜ]+)\s*==\s*$/gm;
  let match;
  const found = [];
  while ((match = sectionRegex.exec(body)) !== null) {
    found.push({
      name: match[1].toUpperCase(),
      headerStart: match.index,
      contentStart: match.index + match[0].length,
    });
  }
  for (let i = 0; i < found.length; i++) {
    const end = i + 1 < found.length ? found[i + 1].headerStart : body.length;
    sections[found[i].name] = body.slice(found[i].contentStart, end).trim();
  }

  // ZUTATEN
  if (sections.ZUTATEN) {
    let currentCat = null;
    for (const line of sections.ZUTATEN.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const catMatch = t.match(/^\[(.+)\]$/);
      if (catMatch) {
        currentCat = mapCategory(catMatch[1]);
        if (!currentCat) {
          warnings.push(`Unbekannte Kategorie „${catMatch[1]}“ – Zutaten werden automatisch einsortiert.`);
        }
        continue;
      }
      const ing = parseIngredientLine(t, currentCat);
      if (ing) recipe.ingredients.push(ing);
      else warnings.push(`Zutatenzeile nicht verstanden: „${t}“`);
    }
  } else {
    warnings.push('Keine Zutaten-Sektion gefunden.');
  }

  // VORTAG
  if (sections.VORTAG) {
    for (const line of sections.VORTAG.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const step = parseStepLine(t);
      if (step) recipe.prepSteps.push({ text: step.text, timerMin: step.timerMin });
    }
  }

  // SCHRITTE
  if (sections.SCHRITTE) {
    for (const line of sections.SCHRITTE.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const step = parseStepLine(t);
      if (step) recipe.steps.push(step);
    }
  }

  // NOTIZEN
  if (sections.NOTIZEN) recipe.notes = sections.NOTIZEN;

  if (recipe.ingredients.length === 0) {
    warnings.push('Es wurden keine Zutaten erkannt.');
  }

  return { recipe, warnings };
}

// ---- Notfall-Modus für freien Text ----

const INGREDIENT_HEADERS = /^(zutaten|einkaufsliste|du brauchst)\b/i;
const STEP_HEADERS = /^(zubereitung|schritte|anleitung|so geht's|zubereitungsschritte)\b/i;

function parseFreeform(text) {
  const warnings = [
    'Kein App-Format erkannt – ich habe geraten. Bitte die Vorschau genau prüfen.',
  ];
  const lines = text.split('\n');

  const recipe = {
    name: null,
    servings: null,
    info: null,
    ingredients: [],
    prepSteps: [],
    steps: [],
    notes: null,
  };

  // Titel: erste nicht-leere Zeile, Markdown-Rauten entfernen
  for (const line of lines) {
    const t = line.trim().replace(/^#+\s*/, '').replace(/\*+/g, '');
    if (t) { recipe.name = t.slice(0, 80); break; }
  }

  // Portionen irgendwo im Text ("für 2", "2 Portionen", "Portionen: 4")
  const servMatch = text.match(/(?:für|portionen:?)\s*(\d+)\s*(?:portionen|personen)?/i);
  if (servMatch) recipe.servings = parseInt(servMatch[1], 10);

  let mode = 'unknown'; // unknown | ingredients | steps
  for (const rawLine of lines) {
    const t = rawLine.trim().replace(/^#+\s*/, '');
    if (!t) continue;
    if (INGREDIENT_HEADERS.test(t)) { mode = 'ingredients'; continue; }
    if (STEP_HEADERS.test(t)) { mode = 'steps'; continue; }

    if (mode === 'ingredients') {
      const ing = parseIngredientLine(t, null);
      // Nur übernehmen, wenn es wie eine Zutat aussieht (Menge oder kurze Zeile)
      if (ing && (ing.qty !== null || ing.name.length <= 40)) {
        recipe.ingredients.push(ing);
      }
    } else if (mode === 'steps') {
      const step = parseStepLine(t);
      if (step) recipe.steps.push(step);
    }
  }

  if (recipe.ingredients.length === 0) {
    warnings.push('Keine Zutaten erkannt. Tipp: Lass dir das Rezept im App-Format geben (Anleitung liegt im Projektordner).');
  }

  return { recipe, warnings };
}

// ---- Rückweg: Rezept-Objekt → App-Format-Text (für Export/Teilen) ----

export function serializeRecipe(recipe) {
  const lines = [];
  lines.push(`=== REZEPT: ${recipe.name} ===`);
  if (recipe.servings) lines.push(`PORTIONEN: ${recipe.servings}`);
  if (recipe.info) lines.push(`INFO: ${recipe.info}`);
  lines.push('');

  lines.push('== ZUTATEN ==');
  for (const cat of CATEGORIES) {
    const ings = recipe.ingredients.filter((i) => (i.category || DEFAULT_CATEGORY) === cat);
    if (ings.length === 0) continue;
    lines.push(`[${cat}]`);
    for (const i of ings) {
      let line = '';
      if (i.qty != null) line += String(i.qty).replace('.', ',') + ' ';
      if (i.unit) line += i.unit + ' ';
      line += i.name;
      if (i.note) line += ` (${i.note})`;
      lines.push(line);
    }
  }
  lines.push('');

  if (recipe.prepSteps.length > 0) {
    lines.push('== VORTAG ==');
    for (const s of recipe.prepSteps) lines.push(`- ${s.text}`);
    lines.push('');
  }

  if (recipe.steps.length > 0) {
    lines.push('== SCHRITTE ==');
    for (const s of recipe.steps) {
      const prefix = s.offsetMin != null ? `T-${s.offsetMin}: ` : '';
      const flex = s.flexible ? ' (vorziehbar)' : '';
      lines.push(`- ${prefix}${s.text}${flex}`);
    }
    lines.push('');
  }

  if (recipe.notes) {
    lines.push('== NOTIZEN ==');
    lines.push(recipe.notes);
  }

  return lines.join('\n').trim() + '\n';
}
