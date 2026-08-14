// Zerlegt eine Eingabezeile wie "350 g Kartoffeln" in Menge, Einheit und Name.
// Wird jetzt für die Handeingabe benutzt und später vom Rezept-Import wiederverwendet.

// Bekannte Einheiten mit ihrer Normalform. Schlüssel in Kleinschreibung.
const UNITS = {
  'g': 'g', 'gramm': 'g',
  'kg': 'kg', 'kilo': 'kg', 'kilogramm': 'kg',
  'ml': 'ml', 'milliliter': 'ml',
  'l': 'l', 'liter': 'l',
  'el': 'EL', 'esslöffel': 'EL',
  'tl': 'TL', 'teelöffel': 'TL',
  'prise': 'Prise', 'prisen': 'Prise',
  'stück': 'Stück', 'stck': 'Stück', 'st': 'Stück',
  'bund': 'Bund',
  'packung': 'Packung', 'packungen': 'Packung', 'pck': 'Packung',
  'päckchen': 'Päckchen',
  'dose': 'Dose', 'dosen': 'Dose',
  'glas': 'Glas', 'gläser': 'Glas',
  'flasche': 'Flasche', 'flaschen': 'Flasche',
  'becher': 'Becher',
  'beutel': 'Beutel',
  'zehe': 'Zehe', 'zehen': 'Zehen',
  'knolle': 'Knolle', 'knollen': 'Knolle',
  'scheibe': 'Scheibe', 'scheiben': 'Scheiben',
  'würfel': 'Würfel',
  'tasse': 'Tasse', 'tassen': 'Tasse',
  'msp': 'Msp.', 'messerspitze': 'Msp.',
};

// Zahl am Anfang: "350", "1,5", "1.5", "1/2", "½", "2x"
const FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '¼': 0.25, '¾': 0.75 };

function parseNumber(token) {
  if (token in FRACTIONS) return FRACTIONS[token];
  // "1/2"
  const frac = token.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  // "1,5" oder "1.5" oder "350", optional mit "x" dahinter ("2x")
  const num = token.match(/^(\d+(?:[.,]\d+)?)x?$/i);
  if (num) return parseFloat(num[1].replace(',', '.'));
  return null;
}

// Haupteinstieg: gibt { qty, unit, name } zurück. qty/unit können null sein.
export function parseItemLine(line) {
  let text = line.trim().replace(/\s+/g, ' ');
  if (!text) return null;

  let qty = null;
  let unit = null;

  const tokens = text.split(' ');

  // 1. Token: Zahl?
  const n = parseNumber(tokens[0]);
  if (n !== null && tokens.length > 1) {
    qty = n;
    tokens.shift();

    // Nächstes Token: Einheit?
    const maybeUnit = tokens[0]?.toLowerCase().replace(/\.$/, '');
    if (maybeUnit && UNITS[maybeUnit] && tokens.length > 1) {
      unit = UNITS[maybeUnit];
      tokens.shift();
    }
  }

  const name = tokens.join(' ').trim();
  if (!name) return null;

  return { qty, unit, name };
}

// Menge hübsch anzeigen: 0.5 → "½", 1.5 → "1,5"
export function formatQty(qty) {
  if (qty == null) return '';
  const wholes = Math.floor(qty);
  const rest = qty - wholes;
  const fracChar = Object.entries(FRACTIONS).find(
    ([, v]) => Math.abs(v - rest) < 0.01
  )?.[0];
  if (fracChar) return wholes > 0 ? `${wholes}${fracChar}` : fracChar;
  return String(qty).replace('.', ',');
}

export function formatQtyUnit(item) {
  const parts = [];
  if (item.qty != null) parts.push(formatQty(item.qty));
  if (item.unit) parts.push(item.unit);
  return parts.join(' ');
}
