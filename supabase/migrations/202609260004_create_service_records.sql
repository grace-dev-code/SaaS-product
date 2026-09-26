create extension if not exists pgcrypto;

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  vehicle text,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_code text,
  request text,
  summary_title text,
  photo text,
  services jsonb not null default '[]'::jsonb,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade an earlier draft of this table without removing any existing data.
alter table public.service_records
  add column if not exists plate text,
  add column if not exists vehicle text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists customer_code text,
  add column if not exists request text,
  add column if not exists summary_title text,
  add column if not exists photo text,
  add column if not exists services jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'not_started';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_records' and column_name = 'record'
  ) then
    alter table public.service_records alter column record drop not null;
    update public.service_records
    set plate = coalesce(plate, record ->> 'plate'),
        vehicle = coalesce(vehicle, record ->> 'vehicle'),
        customer_name = coalesce(customer_name, record ->> 'customer'),
        customer_phone = coalesce(customer_phone, record ->> 'phone'),
        customer_email = coalesce(customer_email, record ->> 'email'),
        customer_code = coalesce(customer_code, record ->> 'customerCode'),
        request = coalesce(request, record ->> 'request'),
        summary_title = coalesce(summary_title, record ->> 'summaryTitle'),
        photo = coalesce(photo, record ->> 'photo'),
        services = case when services = '[]'::jsonb then coalesce(record -> 'services', '[]'::jsonb) else services end,
        status = coalesce(nullif(record ->> 'status', ''), status)
    where record is not null;
  end if;
end;
$$;

create index if not exists service_records_created_at_idx on public.service_records (created_at desc);
create index if not exists service_records_plate_idx on public.service_records (plate);
create index if not exists service_records_customer_code_idx on public.service_records (customer_code);

create or replace function public.set_service_record_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_records_set_updated_at on public.service_records;
create trigger service_records_set_updated_at before update on public.service_records
for each row execute function public.set_service_record_updated_at();

alter table public.service_records enable row level security;

drop policy if exists "Authenticated workspace members can read service records" on public.service_records;
create policy "Authenticated workspace members can read service records"
  on public.service_records for select to authenticated using (true);

drop policy if exists "Authenticated workspace members can add service records" on public.service_records;
create policy "Authenticated workspace members can add service records"
  on public.service_records for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "Authenticated workspace members can update service records" on public.service_records;
create policy "Authenticated workspace members can update service records"
  on public.service_records for update to authenticated using (true) with check (true);

grant select, insert, update on public.service_records to authenticated;
