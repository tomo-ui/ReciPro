import type { Recipe } from '@/types/recipe'

/** Przykładowe przepisy, żeby UI nie startował pusty */
export function seedRecipes(): Recipe[] {
  const day = 86_400_000
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString()

  return [
    {
      id: 'seed-1',
      title: 'Spaghetti aglio e olio',
      description: 'Klasyk z kuchni włoskiej — pięć składników i dziesięć minut.',
      servings: 2,
      prep_minutes: 5,
      cook_minutes: 10,
      total_minutes: 15,
      ingredients: [
        { text: '200 g spaghetti' },
        { text: '4 ząbki czosnku' },
        { text: '60 ml oliwy z oliwek' },
        { text: 'szczypta płatków chili' },
        { text: 'natka pietruszki, sól' },
      ],
      steps: [
        { text: 'Ugotuj makaron al dente w osolonej wodzie.' },
        { text: 'Na oliwie zeszklij plasterki czosnku z chili — nie zrumień.' },
        { text: 'Dodaj makaron z odrobiną wody z gotowania i energicznie wymieszaj.' },
        { text: 'Posyp pietruszką i podawaj od razu.' },
      ],
      tags: ['makaron', 'szybkie', 'włoskie'],
      parse_method: 'manual',
      created_at: at(1),
      updated_at: at(1),
    },
    {
      id: 'seed-2',
      title: 'Shakshuka',
      description: 'Jajka w pikantnym sosie pomidorowym, najlepsze ze świeżym pieczywem.',
      servings: 3,
      prep_minutes: 10,
      cook_minutes: 20,
      total_minutes: 30,
      ingredients: [
        { text: '1 cebula' },
        { text: '1 papryka czerwona' },
        { text: '400 g pomidorów z puszki' },
        { text: '4 jajka' },
        { text: '1 łyżeczka kuminu' },
        { text: '1 łyżeczka papryki wędzonej' },
      ],
      steps: [
        { text: 'Podsmaż cebulę i paprykę na oliwie do miękkości.' },
        { text: 'Dodaj przyprawy i pomidory, duś 10 minut.' },
        { text: 'Zrób zagłębienia, wbij jajka i przykryj — 5–7 minut.' },
      ],
      tags: ['śniadanie', 'jajka', 'wegetariańskie'],
      parse_method: 'manual',
      created_at: at(3),
      updated_at: at(3),
    },
    {
      id: 'seed-3',
      title: 'Sernik na zimno z malinami',
      servings: 8,
      prep_minutes: 30,
      total_minutes: 270,
      ingredients: [
        { text: '200 g herbatników', group: 'Spód' },
        { text: '80 g masła', group: 'Spód' },
        { text: '500 g twarogu sernikowego', group: 'Masa' },
        { text: '250 ml śmietanki 30%', group: 'Masa' },
        { text: '100 g cukru pudru', group: 'Masa' },
        { text: '300 g malin', group: 'Masa' },
      ],
      steps: [
        { text: 'Zmiksuj herbatniki z masłem i wyłóż na spód formy.' },
        { text: 'Utrzyj twaróg z cukrem, dodaj ubitą śmietankę.' },
        { text: 'Wmieszaj maliny, wyłóż na spód i schładzaj min. 4 godziny.' },
      ],
      tags: ['deser', 'bez pieczenia'],
      parse_method: 'manual',
      created_at: at(6),
      updated_at: at(6),
    },
  ]
}
