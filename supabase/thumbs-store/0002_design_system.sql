-- Design system (frames + branches) — applied to the `thumbs-store` project
-- (udvbjvwavgrjwsziqtxl). Shared brand assets, branches, and frame layouts,
-- plus a public storage bucket for uploaded assets.

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('background','key_visual','logo')),
  name text not null,
  storage_path text not null,
  url text not null,
  mime text,
  width integer,
  height integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brand_assets_kind_active_idx on public.brand_assets(kind, is_active);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  parent_branch_id uuid references public.branches(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- layout jsonb = ordered list of layers. Asset layers reference a shared brand
-- asset by KIND so swapping the asset propagates to every frame and branch.
create table if not exists public.frames (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  width integer not null default 1200,
  height integer not null default 630,
  background_color text not null default '#0b1020',
  layout jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists frames_branch_idx on public.frames(branch_id);

alter table public.brand_assets enable row level security;
alter table public.branches enable row level security;
alter table public.frames enable row level security;

drop policy if exists "brand_assets_all_auth" on public.brand_assets;
create policy "brand_assets_all_auth" on public.brand_assets
  for all to authenticated using (true) with check (true);

drop policy if exists "branches_all_auth" on public.branches;
create policy "branches_all_auth" on public.branches
  for all to authenticated using (true) with check (true);

drop policy if exists "frames_all_auth" on public.frames;
create policy "frames_all_auth" on public.frames
  for all to authenticated using (true) with check (true);

insert into public.branches (name, description, is_default)
select 'main', 'Default branch', true
where not exists (select 1 from public.branches);

-- Public storage bucket for uploaded brand assets.
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

drop policy if exists "brand_assets_public_read" on storage.objects;
create policy "brand_assets_public_read" on storage.objects
  for select to public using (bucket_id = 'brand-assets');

drop policy if exists "brand_assets_auth_insert" on storage.objects;
create policy "brand_assets_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'brand-assets');

drop policy if exists "brand_assets_auth_update" on storage.objects;
create policy "brand_assets_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'brand-assets');

drop policy if exists "brand_assets_auth_delete" on storage.objects;
create policy "brand_assets_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'brand-assets');
