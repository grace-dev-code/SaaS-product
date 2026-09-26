alter table public.vehicles
  add column if not exists customer_access_code text not null default encode(gen_random_bytes(16), 'hex'),
  add column if not exists customer_status text not null default 'received',
  add column if not exists public_note text,
  add column if not exists estimated_completion_at timestamptz;

alter table public.vehicles
  drop constraint if exists vehicles_customer_status_check;
alter table public.vehicles
  add constraint vehicles_customer_status_check
  check (customer_status in ('received', 'inspection', 'in_progress', 'ready'));

create unique index if not exists vehicles_customer_access_code_key
  on public.vehicles (lower(customer_access_code));

create or replace function public.get_customer_vehicle_status(p_access_code text)
returns table (
  year integer,
  make text,
  model text,
  stock_number text,
  customer_status text,
  public_note text,
  estimated_completion_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select v.year, v.make, v.model, v.stock_number, v.customer_status,
         v.public_note, v.estimated_completion_at, v.updated_at
  from public.vehicles as v
  where lower(v.customer_access_code) = lower(trim(p_access_code))
  limit 1;
$$;

revoke all on function public.get_customer_vehicle_status(text) from public;
grant execute on function public.get_customer_vehicle_status(text) to anon, authenticated;
