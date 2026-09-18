-- Zunifikowany format przepisu (odpowiada src/types/recipe.ts)
-- Uruchom w Supabase → SQL Editor.

create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,

  title         text not null check (char_length(title) > 0),
  description   text,
  image_url     text,
  source_url    text,

  servings      int  check (servings > 0),
  prep_minutes  int  check (prep_minutes >= 0),
  cook_minutes  int  check (cook_minutes >= 0),
  total_minutes int  check (total_minutes >= 0),

  -- [{ "text": "200 g mąki", "group": "Ciasto" }]
  ingredients   jsonb not null default '[]'::jsonb,
  -- [{ "text": "Wymieszaj…", "group": null }]
  steps         jsonb not null default '[]'::jsonb,
  tags          text[] not null default '{}',

  parse_method  text not null default 'manual'
                check (parse_method in ('manual', 'json-ld', 'heuristic', 'gemini')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists recipes_user_created_idx on public.recipes (user_id, created_at desc);
create index if not exists recipes_tags_idx on public.recipes using gin (tags);

-- Row Level Security: każdy widzi i zmienia tylko swoje przepisy
alter table public.recipes enable row level security;

create policy "recipes_select_own" on public.recipes for select using (auth.uid() = user_id);
create policy "recipes_insert_own" on public.recipes for insert with check (auth.uid() = user_id);
create policy "recipes_update_own" on public.recipes for update using (auth.uid() = user_id);
create policy "recipes_delete_own" on public.recipes for delete using (auth.uid() = user_id);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();
