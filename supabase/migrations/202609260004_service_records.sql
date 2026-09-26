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
  photo_path text,
  services jsonb not null default '[]'::jsonb,
  status text not null default 'not_started',
  vehicle_id uuid references public.vehicles(id) on delete set null,
  source_local_id text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add any columns missing from the earlier service_records draft.
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
  add column if not exists photo_path text,
  add column if not exists services jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'not_started',
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists source_local_id text,
  add column if not exists created_by uuid default auth.uid() references auth.users(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Preserve rows from the original JSON draft, if that draft is present.
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
        status = case lower(coalesce(nullif(record ->> 'status', ''), status))
          when 'done' then 'completed'
          when 'completed' then 'completed'
          when 'in_progress' then 'in_progress'
          when 'pending' then 'not_started'
          when 'not_started' then 'not_started'
          else status
        end
    where record is not null;
  end if;
end;
$$;

create index if not exists service_records_created_at_idx on public.service_records (created_at desc);
create index if not exists service_records_plate_idx on public.service_records (plate);
create index if not exists service_records_customer_code_idx on public.service_records (customer_code);
create index if not exists service_records_vehicle_created_idx on public.service_records (vehicle_id, created_at desc);
create unique index if not exists service_records_owner_source_local_uidx
  on public.service_records (created_by, source_local_id)
  where source_local_id is not null and created_by is not null;

-- Consolidate records created by the earlier canonical-vehicle workflow.
do $$
begin
  if to_regclass('public.vehicle_service_records') is not null then
    insert into public.service_records (
      plate, vehicle, customer_name, customer_phone, customer_email, customer_code,
      request, summary_title, photo, photo_path, services, status, vehicle_id,
      source_local_id, created_by, created_at, updated_at
    )
    select
      payload ->> 'plate',
      payload ->> 'vehicle',
      payload ->> 'customer',
      payload ->> 'phone',
      payload ->> 'email',
      payload ->> 'customerCode',
      payload ->> 'request',
      payload ->> 'summaryTitle',
      case when photo_path is null then coalesce(payload ->> 'photo', '') else null end,
      photo_path,
      coalesce(payload -> 'services', '[]'::jsonb),
      case lower(coalesce(payload ->> 'status', ''))
        when 'done' then 'completed'
        when 'completed' then 'completed'
        when 'in_progress' then 'in_progress'
        else 'not_started'
      end,
      vehicle_id,
      local_record_id,
      created_by,
      created_at,
      updated_at
    from public.vehicle_service_records
    where nullif(trim(payload ->> 'plate'), '') is not null
    on conflict (created_by, source_local_id)
      where source_local_id is not null and created_by is not null
      do nothing;
  end if;
end;
$$;

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

-- Remove the broad authenticated-user policies from the earlier draft.
drop policy if exists "Authenticated workspace members can read service records" on public.service_records;
drop policy if exists "Authenticated workspace members can add service records" on public.service_records;
drop policy if exists "Authenticated workspace members can update service records" on public.service_records;
drop policy if exists "FlowDrive staff can read service records" on public.service_records;
drop policy if exists "FlowDrive staff can add service records" on public.service_records;
drop policy if exists "FlowDrive staff can update service records" on public.service_records;
drop policy if exists "FlowDrive staff can remove service records" on public.service_records;

create policy "FlowDrive staff can read service records"
  on public.service_records for select to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin'));

create policy "FlowDrive staff can add service records"
  on public.service_records for insert to authenticated
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin')
    and created_by = auth.uid()
  );

create policy "FlowDrive staff can update service records"
  on public.service_records for update to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin'))
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin'));

create policy "FlowDrive staff can remove service records"
  on public.service_records for delete to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin'));

revoke all on public.service_records from public, anon;
grant select, insert, update, delete on public.service_records to authenticated;

-- Keep the former JSON-payload table staff-only after its rows have been copied.
alter table public.vehicle_service_records enable row level security;
drop policy if exists "Authenticated members can view vehicle service records" on public.vehicle_service_records;
drop policy if exists "Authenticated members can add vehicle service records" on public.vehicle_service_records;
drop policy if exists "Authenticated members can update vehicle service records" on public.vehicle_service_records;
drop policy if exists "FlowDrive staff can read legacy service records" on public.vehicle_service_records;
drop policy if exists "FlowDrive staff can add legacy service records" on public.vehicle_service_records;
drop policy if exists "FlowDrive staff can update legacy service records" on public.vehicle_service_records;

create policy "FlowDrive staff can read legacy service records"
  on public.vehicle_service_records for select to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin')
    and exists (select 1 from public.vehicles v where v.id = vehicle_id)
  );

create policy "FlowDrive staff can add legacy service records"
  on public.vehicle_service_records for insert to authenticated
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin')
    and auth.uid() = created_by
    and exists (select 1 from public.vehicles v where v.id = vehicle_id)
  );

create policy "FlowDrive staff can update legacy service records"
  on public.vehicle_service_records for update to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin')
    and exists (select 1 from public.vehicles v where v.id = vehicle_id)
  )
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin')
    and exists (select 1 from public.vehicles v where v.id = vehicle_id)
  );

revoke all on public.vehicle_service_records from public, anon;
grant select, insert, update on public.vehicle_service_records to authenticated;

-- Photos remain private and are readable only by approved staff roles.
drop policy if exists "Authenticated members can read vehicle service photos" on storage.objects;
drop policy if exists "Authenticated members can upload vehicle service photos" on storage.objects;
drop policy if exists "Authenticated members can update vehicle service photos" on storage.objects;
drop policy if exists "Authenticated members can delete vehicle service photos" on storage.objects;
drop policy if exists "FlowDrive staff can read vehicle service photos" on storage.objects;
drop policy if exists "FlowDrive staff can upload vehicle service photos" on storage.objects;
drop policy if exists "FlowDrive staff can update vehicle service photos" on storage.objects;
drop policy if exists "FlowDrive staff can delete vehicle service photos" on storage.objects;

create policy "FlowDrive staff can read vehicle service photos" on storage.objects
for select to authenticated using (
  bucket_id = 'vehicle-service-photos'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin')
  and exists (select 1 from public.vehicles v where v.id::text = (storage.foldername(name))[1])
);

create policy "FlowDrive staff can upload vehicle service photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'vehicle-service-photos'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin')
  and exists (select 1 from public.vehicles v where v.id::text = (storage.foldername(name))[1])
);

create policy "FlowDrive staff can update vehicle service photos" on storage.objects
for update to authenticated using (
  bucket_id = 'vehicle-service-photos'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin')
  and exists (select 1 from public.vehicles v where v.id::text = (storage.foldername(name))[1])
) with check (
  bucket_id = 'vehicle-service-photos'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin')
  and exists (select 1 from public.vehicles v where v.id::text = (storage.foldername(name))[1])
);

create policy "FlowDrive staff can delete vehicle service photos" on storage.objects
for delete to authenticated using (
  bucket_id = 'vehicle-service-photos'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('staff', 'mechanic', 'manager', 'admin')
  and exists (select 1 from public.vehicles v where v.id::text = (storage.foldername(name))[1])
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_records'
     ) then
    alter publication supabase_realtime add table public.service_records;
  end if;
end;
$$;
