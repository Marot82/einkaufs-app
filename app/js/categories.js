// Kategorien in der Reihenfolge, in der sie auf dem Zettel erscheinen
// (grob nach typischem Weg durch den Supermarkt).

export const CATEGORIES = [
  'Obst & Gemüse',
  'Kühlregal',
  'Tiefkühl',
  'Trockenware',
  'Gewürze',
  'Getränke',
  'Haushalt',
  'Sonstiges',
];

export const DEFAULT_CATEGORY = 'Sonstiges';

// Eingebautes Wörterbuch: Zutat → Kategorie.
// Bewusst nur Wortstämme in Kleinschreibung; Vergleich läuft über "enthält".
// Der Verlauf des Nutzers (History) hat immer Vorrang vor diesem Wörterbuch.

const DICT = {
  'Obst & Gemüse': [
    'kartoffel', 'blumenkohl', 'karotte', 'möhre', 'bohne', 'erbse', 'paprika',
    'tomate', 'gurke', 'zwiebel', 'knoblauch', 'ingwer', 'zitrone', 'limette',
    'koriander', 'minze', 'petersilie', 'basilikum', 'schnittlauch', 'dill',
    'apfel', 'banane', 'orange', 'birne', 'traube', 'beere', 'erdbeere',
    'himbeere', 'blaubeere', 'heidelbeere', 'mango', 'avocado', 'salat',
    'spinat', 'zucchini', 'aubergine', 'lauch', 'porree', 'sellerie',
    'brokkoli', 'kohlrabi', 'radieschen', 'rettich', 'kürbis', 'süßkartoffel',
    'pilz', 'champignon', 'frühlingszwiebel', 'chili', 'kraut', 'wirsing',
    'rosenkohl', 'spargel', 'fenchel', 'rote bete', 'pastinake', 'kirsche',
    'pflaume', 'pfirsich', 'nektarine', 'melone', 'ananas', 'kiwi', 'granatapfel',
  ],
  'Kühlregal': [
    'joghurt', 'jogurt', 'tofu', 'milch', 'butter', 'margarine', 'käse',
    'sahne', 'quark', 'creme', 'schmand', 'ei', 'eier', 'wurst', 'schinken',
    'aufschnitt', 'hummus', 'frischkäse', 'mozzarella', 'feta', 'parmesan',
    'skyr', 'kefir', 'buttermilch', 'hafermilch', 'sojamilch', 'mandelmilch',
    'fleisch', 'hähnchen', 'huhn', 'pute', 'rind', 'schwein', 'hack',
    'lachs', 'fisch', 'garnele',
  ],
  'Tiefkühl': [
    'tiefkühl', 'tk-', 'tk ', 'eis ', 'pommes', 'fischstäbchen',
  ],
  'Trockenware': [
    'linse', 'reis', 'mehl', 'hefe', 'cashew', 'mandel', 'nuss', 'nüsse',
    'walnuss', 'erdnuss', 'öl', 'zucker', 'dose', 'rosine', 'nudel', 'pasta',
    'spaghetti', 'couscous', 'bulgur', 'quinoa', 'hafer', 'müsli', 'flocken',
    'brot', 'toast', 'brötchen', 'knäcke', 'zwieback', 'keks', 'schoko',
    'honig', 'marmelade', 'aufstrich', 'essig', 'senf', 'ketchup', 'mayo',
    'sojasauce', 'sojasoße', 'brühe', 'bouillon', 'kichererbse', 'bohnen dose',
    'kokosmilch', 'tomatenmark', 'passata', 'backpulver', 'natron', 'vanille',
    'stärke', 'grieß', 'polenta', 'cracker', 'chips', 'riegel', 'kaffee', 'tee',
    'kakao', 'kapern', 'olive', 'pesto', 'salz',
  ],
  'Gewürze': [
    'kreuzkümmel', 'kümmel', 'koriander gemahlen', 'kurkuma', 'garam masala',
    'senfkörner', 'paprikapulver', 'amchur', 'kasuri methi', 'bockshornklee',
    'schwarzkümmel', 'nigella', 'curryblätter', 'asafoetida', 'hing', 'pfeffer',
    'zimt', 'muskat', 'kardamom', 'nelke', 'lorbeer', 'oregano', 'thymian',
    'rosmarin', 'curry', 'gewürz', 'chiliflocken', 'cayenne', 'anis', 'sternanis',
    'piment', 'sumach', 'za\'atar', 'harissa',
  ],
  'Getränke': [
    'wasser', 'saft', 'schorle', 'cola', 'limo', 'bier', 'wein', 'sekt',
    'sprudel', 'eistee', 'smoothie',
  ],
  'Haushalt': [
    'klopapier', 'toilettenpapier', 'küchenrolle', 'spülmittel', 'spültab',
    'waschmittel', 'müllbeutel', 'müllsack', 'schwamm', 'putzmittel', 'seife',
    'shampoo', 'zahnpasta', 'zahnbürste', 'deo', 'creme haut', 'taschentuch',
    'servietten', 'alufolie', 'frischhaltefolie', 'backpapier', 'batterie',
    'kerze', 'streichholz', 'feuerzeug',
  ],
};

// Reihenfolge, in der das Wörterbuch geprüft wird: speziellere Kategorien zuerst,
// damit z. B. "Kreuzkümmel" bei Gewürzen landet und nicht woanders.
const LOOKUP_ORDER = [
  'Gewürze', 'Tiefkühl', 'Kühlregal', 'Obst & Gemüse',
  'Getränke', 'Haushalt', 'Trockenware',
];

export function guessCategory(name) {
  const lower = name.trim().toLowerCase();
  for (const cat of LOOKUP_ORDER) {
    for (const stem of DICT[cat]) {
      if (lower.includes(stem)) return cat;
    }
  }
  return DEFAULT_CATEGORY;
}
