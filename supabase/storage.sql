-- Miniaturki przepisów importowanych z TikToka (uruchom w Supabase → SQL Editor).
-- Adresy miniaturek TikToka wygasają po ok. 48 h, więc serwer zapisuje obrazy u nas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Odczyt: bucket jest publiczny (adresy obrazów działają w <img> bez logowania).
-- Zapis i usuwanie: tylko zalogowany użytkownik i tylko w swoim folderze <user_id>/…
create policy "recipe_images_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "recipe_images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
