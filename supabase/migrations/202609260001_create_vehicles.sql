create extension if not exists pgcrypto;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vin text not null unique check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  stock_number text,
  year integer not null check (year between 1886 and 2100),
  make text not null,
  model text not null,
  trim text,
  mileage integer check (mileage is null or mileage >= 0),
  exterior_color text,
  fuel_type text,
  transmission text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_created_at_idx on public.vehicles (created_at desc);

create or replace function public.set_vehicle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at before update on public.vehicles
for each row execute function public.set_vehicle_updated_at();

alter table public.vehicles enable row level security;
drop policy if exists "Authenticated workspace members can read vehicles" on public.vehicles;
create policy "Authenticated workspace members can read vehicles" on public.vehicles
for select to authenticated using (true);
drop policy if exists "Authenticated workspace members can add vehicles" on public.vehicles;
create policy "Authenticated workspace members can add vehicles" on public.vehicles
for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "Authenticated workspace members can update vehicles" on public.vehicles;
create policy "Authenticated workspace members can update vehicles" on public.vehicles
for update to authenticated using (true) with check (true);

grant select, insert, update on public.vehicles to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vehicles'
     ) then
    alter publication supabase_realtime add table public.vehicles;
  end if;
end;
$$;
