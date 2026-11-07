-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run 누르면 끝!

-- 즐겨찾기 (가고 싶은 곳)
create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  address    text,
  lat        double precision,
  lng        double precision,
  memo       text,
  created_at timestamptz not null default now()
);

-- 일정 (Day별 장소)
create table if not exists public.schedule_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        int  not null check (day >= 1),
  position   int  not null default 0,
  time       text,
  name       text not null,
  address    text,
  lat        double precision,
  lng        double precision,
  memo       text,
  created_at timestamptz not null default now()
);

-- 보안(RLS): "내 데이터는 나만" 보고/쓰기
alter table public.favorites      enable row level security;
alter table public.schedule_items enable row level security;

create policy "own favorites" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own schedule" on public.schedule_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
