// Krok 3/3: składa zwartą bazę składników dla aplikacji (src/data/foods.json).
// Użycie: node scripts/foods/build.mjs <raw.json> <pl-names.json> <wyjście, np. src/data/foods.json>
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

const [rawFile, plFile, out] = process.argv.slice(2)
if (!rawFile || !plFile || !out) {
  console.error('Użycie: node scripts/foods/build.mjs <raw.json> <pl-names.json> <wyjście.json>')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(rawFile, 'utf8'))
const pl = JSON.parse(readFileSync(plFile, 'utf8'))

const CATEGORY_PL = {
  'Dairy and Egg Products': 'Nabiał i jajka',
  'Spices and Herbs': 'Przyprawy i zioła',
  'Baby Foods': 'Jedzenie dla niemowląt',
  'Fats and Oils': 'Tłuszcze i oleje',
  'Poultry Products': 'Drób',
  'Soups, Sauces, and Gravies': 'Zupy i sosy',
  'Sausages and Luncheon Meats': 'Wędliny i kiełbasy',
  'Breakfast Cereals': 'Płatki śniadaniowe',
  'Fruits and Fruit Juices': 'Owoce i soki',
  'Pork Products': 'Wieprzowina',
  'Vegetables and Vegetable Products': 'Warzywa',
  'Nut and Seed Products': 'Orzechy i nasiona',
  'Beef Products': 'Wołowina',
  Beverages: 'Napoje',
  'Finfish and Shellfish Products': 'Ryby i owoce morza',
  'Legumes and Legume Products': 'Rośliny strączkowe',
  'Lamb, Veal, and Game Products': 'Jagnięcina, cielęcina i dziczyzna',
  'Baked Products': 'Pieczywo i wypieki',
  Sweets: 'Słodycze',
  'Cereal Grains and Pasta': 'Zboża i makaron',
  'Fast Foods': 'Fast food',
  'Meals, Entrees, and Side Dishes': 'Dania gotowe',
  Snacks: 'Przekąski',
  'American Indian/Alaska Native Foods': 'Kuchnia rdzennych Amerykanów',
  'Restaurant Foods': 'Dania z restauracji',
  'Branded Food Products Database': 'Produkty markowe',
  'Quality Control Materials': 'Materiały kontrolne',
  'Alcoholic Beverages': 'Alkohole',
}

const cats = [...new Set(raw.map((f) => f.cat))].sort()
const round = (v) => (v === null ? 0 : Math.round(v * 100) / 100)

/** Waga jednej sztuki/miary; klucze: c=szklanka(cup), t=łyżka, s=łyżeczka, pc=sztuka, sl=plasterek, cl=ząbek, cn=puszka */
function portions(list) {
  const pick = (test, rank = () => 0) => {
    const c = list.filter((p) => test(p.label)).sort((a, b) => rank(a.label) - rank(b.label))[0]
    return c ? Math.round(c.gramsPerUnit * 10) / 10 : undefined
  }
  const plainFirst = (l) => (/^(undetermined\s+)?(cup|tbsp|tsp)$/.test(l) ? 0 : /\d|slices|pieces|chopped|diced|sliced|packed|shredded|grated/.test(l) ? 2 : 1)
  const order = ['medium', 'each', 'whole', 'unit', 'piece', 'large', 'small', 'fruit', 'egg', 'bulb', 'stalk', 'leaf', 'head']
  const pcRank = (l) => {
    const i = order.findIndex((w) => new RegExp(`(^|\\s)${w}(\\s|$|,)`).test(l))
    return i < 0 ? 99 : i
  }
  const p = {
    c: pick((l) => /(^|\s)cup(\s|$|,)/.test(l) && !/fl oz/.test(l), plainFirst),
    t: pick((l) => /\btbsp\b|tablespoon/.test(l), plainFirst),
    s: pick((l) => /\btsp\b|teaspoon/.test(l), plainFirst),
    pc: pick((l) => pcRank(l) < 99, pcRank),
    sl: pick((l) => /(^|\s)slice(\s|$|,)/.test(l)),
    cl: pick((l) => /(^|\s)clove(\s|$|,)/.test(l)),
    cn: pick((l) => /(^|\s)can(\s|$|,)/.test(l)),
  }
  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined))
  return Object.keys(clean).length ? clean : 0
}

// Uwagi „(Includes foods for USDA's Food Distribution Program)” i ich tłumaczenia nic nie wnoszą
const tidyName = (s) => s.replace(/\s*\((?:Includes|zawiera|obejmuje|w tym)[^)]*\)/gi, '').trim()

const foods = raw.map((f) => [f.id, tidyName(pl[f.id] ?? f.en), tidyName(f.en), cats.indexOf(f.cat), f.n.map(round), portions(f.portions)])
const missing = raw.filter((f) => !pl[f.id]).length

await writeFile(
  out,
  JSON.stringify({
    v: 1,
    source: 'USDA FoodData Central, SR Legacy (2018), domena publiczna (CC0). Nazwy polskie: tłumaczenie maszynowe.',
    cats: cats.map((c) => CATEGORY_PL[c] ?? c),
    catsEn: cats,
    // kolejność wartości w n[]: patrz src/lib/nutrients.ts
    foods,
  }),
)
console.log(`Zapisano ${foods.length} produktów do ${out} (bez polskiej nazwy: ${missing})`)
