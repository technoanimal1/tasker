-- Thumbnail Studio (applied to thumbs-store project).
-- A single global template ("control area") + per-game thumbnails.

create table if not exists public.thumb_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'default',
  params jsonb not null default '{}'::jsonb,   -- layout params driving every thumbnail
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.thumb_templates enable row level security;
drop policy if exists "thumb_templates_all_auth" on public.thumb_templates;
create policy "thumb_templates_all_auth" on public.thumb_templates
  for all to authenticated using (true) with check (true);

create table if not exists public.thumbnails (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  provider text not null default 'PRAGMATIC',
  accent_color text not null default '#0c8022',   -- per-thumbnail "color parameter"
  bg_path text,
  kv_path text,
  logo_color_path text,
  logo_white_path text,
  created_at timestamptz not null default now()
);
alter table public.thumbnails enable row level security;
drop policy if exists "thumbnails_all_auth" on public.thumbnails;
create policy "thumbnails_all_auth" on public.thumbnails
  for all to authenticated using (true) with check (true);

insert into public.thumb_templates (name, params, is_active)
select 'default',
  '{"bgScale":1.0,"bgOffsetX":0,"bgOffsetY":0,"kvScale":1.0,"kvOffsetY":0,"logo":{"x":24,"y":180,"w":196,"h":120},"logoVariant":"color","cornerRadius":16,"showProvider":true}'::jsonb,
  true
where not exists (select 1 from public.thumb_templates);
