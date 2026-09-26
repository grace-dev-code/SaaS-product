-- Keep the JSON records used by the current app while exposing searchable
-- customer-facing columns and an atomic archive operation.
alter table public.service_records
  add column if not exists vehicle text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists request text,
  add column if not exists summary_title text,
  add column if not exists photo text,
  add column if not exists services jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'not_started';

alter table public.service_records disable trigger service_records_set_updated_at;
update public.service_records
set vehicle = coalesce(vehicle, record_data ->> 'vehicle'),
    customer_name = coalesce(customer_name, record_data ->> 'customer'),
    customer_phone = coalesce(customer_phone, record_data ->> 'phone'),
    customer_email = coalesce(customer_email, record_data ->> 'email'),
    request = coalesce(request, record_data ->> 'request'),
    summary_title = coalesce(summary_title, record_data ->> 'summaryTitle'),
    photo = coalesce(photo, record_data ->> 'photo'),
    services = case
      when services <> '[]'::jsonb then services
      when jsonb_typeof(record_data -> 'services') = 'array' and jsonb_array_length(record_data -> 'services') > 0 then record_data -> 'services'
      when record_data ? 'service' then jsonb_build_array(jsonb_build_object(
        'id', coalesce(record_data ->> 'id', id::text) || '-service',
        'type', coalesce(record_data ->> 'service', 'Repair'),
        'title', coalesce(record_data ->> 'service', 'Repair') || ' service',
        'status', case when record_data ->> 'status' in ('done','completed','ready') then 'completed' when record_data ->> 'status' in ('in_progress','in progress') then 'in_progress' else 'not_started' end,
        'estimate', record_data -> 'estimate',
        'request', coalesce(record_data ->> 'request', ''),
        'events', coalesce(record_data -> 'events', '[]'::jsonb)
      ))
      else '[]'::jsonb
    end,
    status = case
      when jsonb_typeof(record_data -> 'services') = 'array'
        and jsonb_array_length(record_data -> 'services') > 0
        and not exists (select 1 from jsonb_array_elements(record_data -> 'services') item where item.value ->> 'status' not in ('completed','done') or item.value ->> 'status' is null)
        then 'completed'
      when jsonb_typeof(record_data -> 'services') = 'array'
        and exists (select 1 from jsonb_array_elements(record_data -> 'services') item where item.value ->> 'status' in ('in_progress','completed','done'))
        then 'in_progress'
      when record_data ->> 'status' in ('completed','done','ready') then 'completed'
      when record_data ->> 'status' in ('in_progress','in progress') then 'in_progress'
      else 'not_started'
    end,
    updated_at = coalesce(nullif(record_data ->> 'updatedAt', '')::timestamptz, updated_at)
where record_data is not null;
alter table public.service_records enable trigger service_records_set_updated_at;

create index if not exists service_records_created_at_idx on public.service_records (created_at desc);
create index if not exists service_records_customer_code_lower_idx on public.service_records (lower(customer_code));

create table if not exists public.deleted (
  id text primary key,
  plate text not null,
  customer_code text,
  vehicle text,
  customer_name text,
  customer_phone text,
  customer_email text,
  request text,
  summary_title text,
  photo text,
  services jsonb not null default '[]'::jsonb,
  status text not null default 'not_started',
  record_data jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz not null default now(),
  deleted_by uuid
);
alter table public.deleted enable row level security;
drop policy if exists "Authenticated members can read archived service records" on public.deleted;
create policy "Authenticated members can read archived service records"
  on public.deleted for select to authenticated using (true);
grant select on public.deleted to authenticated;

create or replace function public.archive_service_record(p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  archived_count integer;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  insert into public.deleted (
    id, plate, customer_code, vehicle, customer_name, customer_phone,
    customer_email, request, summary_title, photo, services, status,
    record_data, created_by, created_at, updated_at, deleted_at, deleted_by
  )
  select id::text, plate, customer_code, vehicle, customer_name, customer_phone,
         customer_email, request, summary_title, photo, services, status,
         record_data, created_by, created_at, updated_at, now(), actor
    from public.service_records where id::text = p_id;
  get diagnostics archived_count = row_count;
  if archived_count = 0 then return false; end if;
  delete from public.service_records where id::text = p_id;
  return true;
end;
$$;
revoke all on function public.archive_service_record(text) from public;
grant execute on function public.archive_service_record(text) to authenticated;

create or replace function public.get_customer_service_records(p_customer_code text)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', id::text,
    'plate', plate,
    'vehicle', coalesce(vehicle, record_data ->> 'vehicle'),
    'customer', coalesce(customer_name, record_data ->> 'customer'),
    'customerCode', customer_code,
    'request', coalesce(request, record_data ->> 'request'),
    'summaryTitle', coalesce(summary_title, record_data ->> 'summaryTitle'),
    'photo', coalesce(photo, record_data ->> 'photo'),
    'services', case
      when services <> '[]'::jsonb then services
      when jsonb_typeof(record_data -> 'services') = 'array' and jsonb_array_length(record_data -> 'services') > 0 then record_data -> 'services'
      when record_data ? 'service' then jsonb_build_array(jsonb_build_object(
        'id', coalesce(record_data ->> 'id', id::text) || '-service',
        'type', coalesce(record_data ->> 'service', 'Repair'),
        'title', coalesce(record_data ->> 'service', 'Repair') || ' service',
        'status', case when record_data ->> 'status' in ('done','completed','ready') then 'completed' when record_data ->> 'status' in ('in_progress','in progress') then 'in_progress' else 'not_started' end,
        'estimate', record_data -> 'estimate',
        'request', coalesce(record_data ->> 'request', ''),
        'events', coalesce(record_data -> 'events', '[]'::jsonb)
      ))
      else '[]'::jsonb
    end,
    'status', coalesce(status, record_data ->> 'status', 'not_started'),
    'createdAt', created_at,
    'updatedAt', updated_at
  )
  from public.service_records
  where nullif(trim(p_customer_code), '') is not null
    and upper(customer_code) = upper(trim(p_customer_code))
  order by created_at desc;
$$;
revoke all on function public.get_customer_service_records(text) from public;
grant execute on function public.get_customer_service_records(text) to anon, authenticated;
