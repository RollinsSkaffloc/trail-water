-- Run in Supabase: SQL Editor > New query.

create table water_sources (
  id          uuid primary key default gen_random_uuid(),
  osm_ref     text unique,                       -- e.g. 'n123456' (node) or 'w987654' (way)
  name        text,
  kind        text not null default 'spring' check (kind in ('spring', 'creek', 'other')),
  lng         double precision not null,
  lat         double precision not null,
  created_at  timestamptz not null default now()
);
create index water_sources_lat_lng_idx on water_sources (lat, lng);

create table water_reports (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references water_sources (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status       text not null check (status in ('flowing', 'trickling', 'pooled', 'dry')),
  note         text check (char_length(note) <= 500),
  observed_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index water_reports_source_idx on water_reports (source_id, observed_at desc);

-- One row per source with its most recent report. The app reads this.
create view water_source_status with (security_invoker = true) as
select s.id, s.name, s.kind, s.lng, s.lat,
       r.status      as latest_status,
       r.observed_at as latest_observed_at,
       r.note        as latest_note
from water_sources s
left join lateral (
  select status, observed_at, note
  from water_reports
  where source_id = s.id
  order by observed_at desc
  limit 1
) r on true;

alter table water_sources enable row level security;
alter table water_reports enable row level security;

create policy "anyone can read sources"  on water_sources for select using (true);
create policy "anyone can read reports"  on water_reports for select using (true);
create policy "signed-in users post reports" on water_reports
  for insert to authenticated with check (user_id = auth.uid());
create policy "authors delete their reports" on water_reports
  for delete to authenticated using (user_id = auth.uid());

-- Sources are written only by the import script (service key bypasses RLS).
