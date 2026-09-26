create table if not exists public.service_records (
  id text primary key,
  plate text not null,
  customer_code text not null,
  record_data jsonb not null check (jsonb_typeof(record_data) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_records_plate_idx
  on public.service_records (upper(plate));
create index if not exists service_records_customer_code_idx
  on public.service_records (upper(customer_code));
create index if not exists service_records_updated_at_idx
  on public.service_records (updated_at desc);

create or replace function public.set_service_record_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_records_set_updated_at on public.service_records;
create trigger service_records_set_updated_at
before update on public.service_records
for each row execute function public.set_service_record_updated_at();

alter table public.service_records enable row level security;

drop policy if exists "Workspace members can read service records" on public.service_records;
create policy "Workspace members can read service records"
on public.service_records for select to authenticated using (true);

drop policy if exists "Workspace members can create service records" on public.service_records;
create policy "Workspace members can create service records"
on public.service_records for insert to authenticated
with check (auth.uid() = created_by);

drop policy if exists "Workspace members can update service records" on public.service_records;
create policy "Workspace members can update service records"
on public.service_records for update to authenticated
using (true) with check (true);

drop policy if exists "Workspace members can delete service records" on public.service_records;
create policy "Workspace members can delete service records"
on public.service_records for delete to authenticated using (true);

grant select, insert, update, delete on public.service_records to authenticated;

-- Customer code lookup exposes service progress and history without exposing private contact fields.
create or replace function public.get_customer_service_records(p_customer_code text)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select record_data - 'phone' - 'email' - 'createdBy'
  from public.service_records
  where upper(customer_code) = upper(trim(p_customer_code))
  order by created_at desc;
$$;

revoke all on function public.get_customer_service_records(text) from public;
grant execute on function public.get_customer_service_records(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'service_records'
     ) then
    alter publication supabase_realtime add table public.service_records;
  end if;
end;
$$;
