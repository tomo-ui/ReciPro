# Dane Open Food Facts

Plik `off-products.json` zawiera polskie produkty z bazy [Open Food Facts](https://world.openfoodfacts.org)
z kompletnymi danymi odżywczymi (nazwa, marka, kod kreskowy, wszystkie 24 wartości z `src/lib/nutrients.ts`
na 100 g, a gdy źródło je podaje — waga jednej miary: łyżki, łyżeczki, szklanki, sztuki, plasterka, ząbka
albo puszki, z pola `serving_size`).

- Baza danych: [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- Zawartość rekordów: [Database Contents License (DbCL) 1.0](https://opendatacommons.org/licenses/dbcl/1-0/)
- Autorzy: współtwórcy Open Food Facts

Plik jest zmodyfikowanym wyciągiem (wszystkie polskie produkty z pełnymi danymi odżywczymi, uproszczone pola,
odrzucone fizycznie niemożliwe wartości) i tak samo jak źródło jest udostępniany na licencji ODbL.

Odtworzenie / aktualizacja (potoki przez stdin są na Windows bardzo wolne — szybciej pobrać i rozpakować do pliku):

```
curl -sL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz -o off.csv.gz
gunzip off.csv.gz
node --max-old-space-size=8192 scripts/foods/off-extract.mjs off.csv off-raw.json 20000
node scripts/foods/off-build.mjs off-raw.json src/data/off-products.json
```

Ogólne składniki (`foods.json`) pochodzą z USDA FoodData Central (domena publiczna).
