# Dane Open Food Facts

Plik `off-products.json` zawiera wybrane polskie produkty z bazy [Open Food Facts](https://world.openfoodfacts.org)
(nazwa, marka, kod kreskowy i wartości odżywcze na 100 g).

- Baza danych: [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- Zawartość rekordów: [Database Contents License (DbCL) 1.0](https://opendatacommons.org/licenses/dbcl/1-0/)
- Autorzy: współtwórcy Open Food Facts

Plik jest zmodyfikowanym wyciągiem (najpopularniejsze polskie produkty z pełnymi danymi, uproszczone pola)
i tak samo jak źródło jest udostępniany na licencji ODbL. Skrypty, które go tworzą: `scripts/foods/off-extract.mjs`
i `scripts/foods/off-build.mjs`. Ogólne składniki (`foods.json`) pochodzą z USDA FoodData Central (domena publiczna).
