-- Store workshop records in the shared vehicles table, alongside inventory entries.
-- Vehicle inventory rows retain their existing shape; workshop-only columns are populated
-- only for record_type = 'service'.
alter table public.vehicles
  alter column vin drop not null,
  alter column year drop not null,
  alter column make drop not null,
  alter column model drop not null;

alter table public.vehicles
  add column if not exists record_type text not null default 'inventory',
  add column if not exists registration_plate text,
  add column if not exists service_record_id text,
  add column if not exists customer_code text,
  add column if not exists service_record_data jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_record_type_check'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_record_type_check check (record_type in ('inventory', 'service'));
  end if;
end;
$$;

create unique index if not exists vehicles_service_record_id_uidx
  on public.vehicles (service_record_id);
create index if not exists vehicles_registration_plate_idx
  on public.vehicles (upper(registration_plate));
create index if not exists vehicles_customer_code_idx
  on public.vehicles (upper(customer_code));

-- Move all previously stored service records into vehicles. Keep the old table intact for
-- rollback/audit; application reads and writes no longer use it after this migration.
insert into public.vehicles (
  record_type, registration_plate, service_record_id, customer_code,
  service_record_data, created_by, created_at, updated_at
)
select
  'service', plate, id, customer_code, record_data, created_by, created_at, updated_at
from public.service_records
on conflict (service_record_id) do update set
  registration_plate = excluded.registration_plate,
  customer_code = excluded.customer_code,
  service_record_data = excluded.service_record_data,
  updated_at = excluded.updated_at;

create or replace function public.get_customer_service_records(p_customer_code text)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select service_record_data - 'phone' - 'email' - 'createdBy'
  from public.vehicles
  where record_type = 'service'
    and upper(customer_code) = upper(trim(p_customer_code))
  order by created_at desc;
$$;

revoke all on function public.get_customer_service_records(text) from public;
grant execute on function public.get_customer_service_records(text) to anon, authenticated;

-- Only expose real inventory vehicles in the existing inventory UI through its API helpers.
