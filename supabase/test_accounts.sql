-- 20 kont testowych z przepisami do testowania aplikacji (feed „Dla Ciebie”, obserwowanie, wyszukiwarka, prywatność).
-- Uruchom w Supabase → SQL Editor PO najnowszym engagement.sql (dodaje kolumnę is_test i regułę widoczności). Skrypt jest idempotentny.
--
-- Konta mają is_test = true, więc widzi je WYŁĄCZNIE admin (konto „tk”) z włączonym przełącznikiem
-- „Konta testowe” w Edytuj profil → Panel admina. Dla wszystkich innych użytkowników nie istnieją.
-- Nie da się na nie zalogować (brak hasła, adresy w domenie .invalid). Usunięcie wszystkiego:
--   delete from auth.users where email like 'test__@test.invalid';   -- kasuje też profile i przepisy (kaskadowo)

-- Zabezpieczenie: bez mechanizmu widoczności z engagement.sql konta testowe zobaczyliby wszyscy, więc nie wstawiamy nic
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_test')
     or to_regprocedure('public.can_see_test_accounts()') is null then
    raise exception 'Najpierw uruchom w SQL Editorze plik supabase/engagement.sql (najnowszą wersję), a dopiero potem ten.';
  end if;
end $$;

do $$
declare
  names   text[] := array['Ania','Bartek','Celina','Darek','Ewa','Filip','Gosia','Hubert','Iga','Jacek',
                          'Kasia','Leszek','Marta','Norbert','Ola','Pawel','Renata','Szymon','Tola','Wiktor'];
  bios    text[] := array['Gotuję po pracy, zwykle na szybko.','Fan kuchni włoskiej i dobrej oliwy.','Wszystko, co słodkie.',
                          'Grill przez cały rok.','Roślinnie, ale nie nudno.'];
  -- szablony przepisów: tytuł | tagi | składniki | kroki | minuty | porcje
  t_title text[] := array['Spaghetti aglio e olio','Zupa pomidorowa z ryżem','Szarlotka z kruszonką','Karkówka z grilla','Sałatka grecka',
                          'Pierogi ruskie','Naleśniki z serem','Curry z ciecierzycy','Pizza margherita','Bigos myśliwski',
                          'Sernik na zimno','Owsianka z owocami','Kotlety mielone','Placki ziemniaczane','Shakshuka',
                          'Risotto z grzybami','Tiramisu','Zupa krem z dyni','Tacos z kurczakiem','Brownie czekoladowe'];
  t_tags  text[] := array['{makaron,włoskie,szybkie,obiad}','{zupa,obiad,tradycyjne}','{deser,ciasto,jabłka,pieczenie}','{grill,mięso,obiad}','{sałatka,wegetariańskie,szybkie}',
                          '{obiad,tradycyjne,wegetariańskie}','{śniadanie,słodkie,szybkie}','{wegańskie,obiad,ostre}','{pizza,włoskie,obiad}','{obiad,kapusta,tradycyjne}',
                          '{deser,bez pieczenia,słodkie}','{śniadanie,fit,szybkie}','{obiad,mięso,tradycyjne}','{obiad,ziemniaki,szybkie}','{śniadanie,jajka,ostre}',
                          '{włoskie,obiad,grzyby}','{deser,włoskie,słodkie}','{zupa,wegetariańskie,jesień}','{meksykańskie,drób,obiad}','{deser,czekolada,ciasto}'];
  t_ing   text[] := array['200 g makaronu spaghetti|4 ząbki czosnku|4 łyżki oliwy|szczypta chili|pietruszka',
                          '1 l bulionu|500 ml passaty pomidorowej|3 łyżki ryżu|śmietana|sól, pieprz',
                          '600 g jabłek|250 g mąki|125 g masła|100 g cukru|cynamon',
                          '600 g karkówki|2 łyżki musztardy|czosnek|majeranek|olej',
                          '2 pomidory|1 ogórek|100 g sera feta|oliwki|oliwa',
                          '500 g mąki|400 g ziemniaków|250 g twarogu|cebula|masło',
                          '250 ml mleka|2 jajka|150 g mąki|250 g twarogu|cukier waniliowy',
                          '400 g ciecierzycy|400 ml mleka kokosowego|2 łyżki pasty curry|cebula|szpinak',
                          '300 g mąki|150 g mozzarelli|150 ml passaty|bazylia|drożdże',
                          '1 kg kapusty kiszonej|300 g kiełbasy|200 g boczku|suszone grzyby|liść laurowy',
                          '500 g twarogu|250 ml śmietanki 30%|żelatyna|100 g cukru pudru|maliny',
                          '80 g płatków owsianych|300 ml mleka|1 banan|garść jagód|miód',
                          '500 g mielonego mięsa|1 bułka|1 jajko|cebula|bułka tarta',
                          '1 kg ziemniaków|1 cebula|2 jajka|3 łyżki mąki|sól',
                          '4 jajka|400 g pomidorów|1 papryka|cebula|kumin',
                          '250 g ryżu arborio|300 g pieczarek|1 l bulionu|parmezan|białe wino',
                          '500 g mascarpone|4 jajka|200 g biszkoptów|mocna kawa|kakao',
                          '1 kg dyni|1 cebula|500 ml bulionu|200 ml śmietanki|imbir',
                          '400 g piersi z kurczaka|8 tortilli|1 awokado|limonka|kolendra',
                          '200 g gorzkiej czekolady|150 g masła|3 jajka|150 g cukru|100 g mąki'];
  t_steps text[] := array['Ugotuj makaron al dente.|Podsmaż czosnek na oliwie z chili.|Wymieszaj z makaronem i pietruszką.',
                          'Zagotuj bulion z passatą.|Dodaj ryż i gotuj do miękkości.|Zabiel śmietaną i dopraw.',
                          'Pokrój jabłka i podduś je z cynamonem.|Zagnieć kruszonkę z mąki, masła i cukru.|Piecz 40 minut w 180°C.',
                          'Natrzyj karkówkę marynatą.|Odstaw na kilka godzin.|Grilluj po 6 minut z każdej strony.',
                          'Pokrój warzywa w kostkę.|Dodaj fetę i oliwki.|Polej oliwą i delikatnie wymieszaj.',
                          'Zagnieć ciasto i odstaw na 30 minut.|Zmiel ziemniaki z twarogiem i podsmażoną cebulą.|Lep pierogi i gotuj 4 minuty od wypłynięcia.',
                          'Zmiksuj ciasto naleśnikowe.|Smaż cienkie placki.|Nadziej serem i zwiń.',
                          'Podsmaż cebulę z pastą curry.|Dodaj ciecierzycę i mleko kokosowe.|Duś 15 minut, na końcu dodaj szpinak.',
                          'Wyrób ciasto i odstaw do wyrośnięcia.|Rozwałkuj i posmaruj passatą.|Dodaj mozzarellę, piecz w jak najwyższej temperaturze.',
                          'Zalej grzyby wrzątkiem.|Wszystkie składniki dus 2 godziny.|Odstaw na noc i podgrzej.',
                          'Utrzyj twaróg z cukrem.|Dodaj rozpuszczoną żelatynę i ubitą śmietankę.|Wyłóż na spód i schłodź 4 godziny.',
                          'Ugotuj płatki na mleku.|Dodaj pokrojonego banana.|Posyp jagodami i polej miodem.',
                          'Wyrób masę z mięsa, bułki i jajka.|Uformuj kotlety i obtocz w bułce tartej.|Smaż po 5 minut z każdej strony.',
                          'Zetrzyj ziemniaki i odciśnij sok.|Dodaj jajka, cebulę i mąkę.|Smaż na złoto na rumianym oleju.',
                          'Podsmaż cebulę z papryką i kuminem.|Dodaj pomidory i duś 10 minut.|Wbij jajka i gotuj pod przykryciem.',
                          'Podsmaż pieczarki.|Dodaj ryż i stopniowo dolewaj gorący bulion.|Na końcu wmieszaj parmezan.',
                          'Zaparz kawę i ostudź.|Utrzyj żółtka z mascarpone, dodaj ubite białka.|Przełóż warstwami z biszkoptami, schłodź i oprósz kakao.',
                          'Upiecz dynię z cebulą.|Zblenduj z bulionem.|Dodaj śmietankę i imbir.',
                          'Zamarynuj kurczaka i usmaż.|Podgrzej tortille.|Podawaj z awokado, limonką i kolendrą.',
                          'Rozpuść czekoladę z masłem.|Dodaj jajka z cukrem i mąkę.|Piecz 25 minut w 175°C.'];
  i int; j int; k int; uid uuid; uname text; rid uuid; ing jsonb; stp jsonb; n int := 0;
begin
  for i in 1..20 loop
    uid := ('00000000-0000-4000-a000-' || lpad(i::text, 12, '0'))::uuid;
    uname := 'test_' || lower(names[i]);

    insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (uid, 'authenticated', 'authenticated', 'test' || lpad(i::text, 2, '0') || '@test.invalid', now(), now())
    on conflict (id) do nothing;

    -- ostatnie dwa konta są prywatne (test widoczności przepisów)
    insert into public.profiles (id, username, full_name, is_public, is_test, bio)
    values (uid, uname, names[i] || ' (test)', i <= 18, true, bios[1 + (i % array_length(bios, 1))])
    on conflict (id) do nothing;

    -- dwa przepisy na konto: szablony i oraz (i + 9) mod 20 + 1, z rozłożonymi w czasie datami
    foreach k in array array[i, ((i + 9) % 20) + 1] loop
      n := n + 1;
      rid := ('00000000-0000-4000-b000-' || lpad(n::text, 12, '0'))::uuid;
      select coalesce(jsonb_agg(jsonb_build_object('text', x)), '[]'::jsonb) into ing from unnest(string_to_array(t_ing[k], '|')) x;
      select coalesce(jsonb_agg(jsonb_build_object('text', x)), '[]'::jsonb) into stp from unnest(string_to_array(t_steps[k], '|')) x;
      insert into public.recipes (id, user_id, title, servings, total_minutes, ingredients, steps, tags, parse_method, created_at, updated_at)
      values (rid, uid, t_title[k], 2 + (k % 5), 15 + (k * 7) % 90, ing, stp, t_tags[k]::text[], 'manual',
              now() - (n * interval '7 hours'), now() - (n * interval '7 hours'))
      on conflict (id) do nothing;
    end loop;
  end loop;
end $$;
