create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name varchar(80),
  avatar_url text,
  locale varchar(20) not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.todo_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title varchar(120) not null,
  comment text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.todo_lists(id) on delete cascade,
  title varchar(240) not null,
  comment text,
  completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todo_lists_owner_position_idx on public.todo_lists(owner_id, position);
create index if not exists todo_items_list_position_idx on public.todo_items(list_id, position);

alter table public.profiles enable row level security;
alter table public.todo_lists enable row level security;
alter table public.todo_items enable row level security;

create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users manage own lists" on public.todo_lists for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users manage items in own lists" on public.todo_items for all
  using (exists (select 1 from public.todo_lists l where l.id = list_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from public.todo_lists l where l.id = list_id and l.owner_id = auth.uid()));
