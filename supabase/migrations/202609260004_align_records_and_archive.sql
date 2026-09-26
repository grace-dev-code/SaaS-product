-- Align the live app with the public service_records schema while preserving
-- the earlier JSON draft and all existing rows.
alter table public.service_records
  add column if not exists vehicle text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists request text,
  add column if not exists summary_title text,
  add column if not exists photo text,
  add column if not exists services jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'not_started',
  add column if not exists record_data jsonb;

-- record_data was required by an earlier draft. Keep it nullable for legacy
-- reads, but new writes use the explicit columns above.
alter table public.service_records alter column record_data drop not null;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='service_records' and column_name='record_data') then
    execute $backfill$
      update public.service_records
      set vehicle = coalesce(vehicle, record_data ->> 'vehicle'),
          customer_name = coalesce(customer_name, record_data ->> 'customer'),
          customer_phone = coalesce(customer_phone, record_data ->> 'phone'),
          customer_email = coalesce(customer_email, record_data ->> 'email'),
          request = coalesce(request, record_data ->> 'request'),
          summary_title = coalesce(summary_title, record_data ->> 'summaryTitle'),
          photo = coalesce(photo, record_data ->> 'photo'),
          services = case when services = '[]'::jsonb then coalesce(record_data -> 'services', '[]'::jsonb) else services end,
          status = case
            when status in ('not_started','in_progress','completed') then status
            when record_data ->> 'status' in ('done','completed') then 'completed'
            when record_data ->> 'status' = 'in_progress' then 'in_progress'
            else 'not_started'
          end
      where record_data is not null
    $backfill$;
  end if;
end;
$$;

create index if not exists service_records_created_at_idx on public.service_records (created_at desc);
create index if not exists service_records_plate_idx on public.service_records (upper(plate));
create index if not exists service_records_customer_code_idx on public.service_records (upper(customer_code));

-- The archive holds a complete copy of the active row before it is removed.
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
  if actor is null then
    raise exception 'Authentication required';
  end if;
  insert into public.deleted (
    id, plate, customer_code, vehicle, customer_name, customer_phone,
    customer_email, request, summary_title, photo, services, status,
    record_data, created_by, created_at, updated_at, deleted_at, deleted_by
  )
  select id::text, plate, customer_code, vehicle, customer_name, customer_phone,
         customer_email, request, summary_title, photo, services, status,
         record_data, created_by, created_at, updated_at, now(), actor
  from public.service_records
  where id::text = p_id;
  get diagnostics archived_count = row_count;
  if archived_count = 0 then return false; end if;
  delete from public.service_records where id::text = p_id;
  return true;
end;
$$;
revoke all on function public.archive_service_record(text) from public;
grant execute on function public.archive_service_record(text) to authenticated;

-- Return only customer-facing fields to the unauthenticated customer portal.
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
    'vehicle', vehicle,
    'customer', customer_name,
    'customerCode', customer_code,
    'request', request,
    'summaryTitle', summary_title,
    'photo', photo,
    'services', services,
    'status', status,
    'createdAt', created_at,
    'updatedAt', updated_at
  )
  from public.service_records
  where upper(customer_code) = upper(trim(p_customer_code))
  order by created_at desc;
$$;
revoke all on function public.get_customer_service_records(text) from public;
grant execute on function public.get_customer_service_records(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_records') then
    alter publication supabase_realtime add table public.service_records;
  end if;
end;
$$;
