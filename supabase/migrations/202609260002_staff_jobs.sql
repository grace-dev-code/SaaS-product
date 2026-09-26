create table if not exists public.staff_jobs (
  id uuid primary key default gen_random_uuid(),
  vehicle_name text not null,
  registration text,
  stock_number text,
  vehicle_key text not null,
  work_title text not null,
  department text not null check (department in ('service', 'body_shop', 'inspection', 'wash')),
  assigned_to_email text not null,
  estimated_minutes integer not null default 60 check (estimated_minutes between 1 and 10000),
  due_date date,
  priority smallint not null default 3 check (priority between 1 and 4),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'completed')),
  staff_note text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  check (nullif(trim(registration), '') is not null or nullif(trim(stock_number), '') is not null)
);

create index if not exists staff_jobs_vehicle_key_idx on public.staff_jobs (vehicle_key, department, status);
create index if not exists staff_jobs_assignee_status_idx on public.staff_jobs (lower(assigned_to_email), status, due_date);

create or replace function public.prepare_staff_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.assigned_to_email := lower(trim(new.assigned_to_email));
  new.registration := nullif(upper(trim(coalesce(new.registration, ''))), '');
  new.stock_number := nullif(upper(trim(coalesce(new.stock_number, ''))), '');
  new.vehicle_key := upper(regexp_replace(coalesce(new.registration, new.stock_number, ''), '[^A-Z0-9]', '', 'g'));
  new.updated_at := now();
  if new.department = 'wash' and new.status <> 'completed' and exists (
    select 1 from public.staff_jobs j
    where j.vehicle_key = new.vehicle_key
      and j.department <> 'wash'
      and j.status <> 'completed'
      and j.id <> new.id
  ) then
    new.status := 'blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_jobs_prepare on public.staff_jobs;
create trigger staff_jobs_prepare before insert or update on public.staff_jobs
for each row execute function public.prepare_staff_job();

create or replace function public.sync_wash_after_repair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.department = 'wash' then
    if new.status <> 'completed' and exists (
      select 1 from public.staff_jobs j
      where j.vehicle_key = new.vehicle_key
        and j.department <> 'wash'
        and j.status <> 'completed'
        and j.id <> new.id
    ) then
      update public.staff_jobs set status = 'blocked', updated_at = now()
      where id = new.id and status <> 'blocked';
    end if;
  elsif new.status = 'completed' then
    if not exists (
      select 1 from public.staff_jobs j
      where j.vehicle_key = new.vehicle_key
        and j.department <> 'wash'
        and j.status <> 'completed'
    ) then
      update public.staff_jobs set status = 'not_started', updated_at = now()
      where vehicle_key = new.vehicle_key and department = 'wash' and status = 'blocked';
    end if;
  elsif new.status <> 'completed' then
    update public.staff_jobs set status = 'blocked', updated_at = now()
    where vehicle_key = new.vehicle_key and department = 'wash' and status = 'not_started';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_jobs_sync_wash on public.staff_jobs;
create trigger staff_jobs_sync_wash after insert or update of vehicle_key, department, status on public.staff_jobs
for each row execute function public.sync_wash_after_repair();

alter table public.staff_jobs enable row level security;
drop policy if exists "Managers can view all staff jobs; staff can view assigned jobs" on public.staff_jobs;
create policy "Managers can view all staff jobs; staff can view assigned jobs" on public.staff_jobs
for select to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('manager', 'admin')
  or lower(assigned_to_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "Managers can add staff jobs" on public.staff_jobs;
create policy "Managers can add staff jobs" on public.staff_jobs
for insert to authenticated
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('manager', 'admin')
  and created_by = auth.uid()
);

drop policy if exists "Managers and assignees can update staff jobs" on public.staff_jobs;
create policy "Managers and assignees can update staff jobs" on public.staff_jobs
for update to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('manager', 'admin')
  or lower(assigned_to_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('manager', 'admin')
  or lower(assigned_to_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

grant select, insert, update on public.staff_jobs to authenticated;
revoke update on public.staff_jobs from authenticated;
grant update (status, staff_note, updated_at, started_at, completed_at) on public.staff_jobs to authenticated;

create or replace function public.reassign_staff_job(p_job_id uuid, p_assigned_to_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('manager', 'admin') then
    raise exception 'Only managers can reassign staff jobs';
  end if;
  if p_assigned_to_email is null or position('@' in trim(p_assigned_to_email)) < 2 then
    raise exception 'Enter the staff member’s Google sign-in email';
  end if;
  update public.staff_jobs
  set assigned_to_email = lower(trim(p_assigned_to_email)), updated_at = now()
  where id = p_job_id;
  if not found then raise exception 'Job was not found'; end if;
end;
$$;
revoke all on function public.reassign_staff_job(uuid, text) from public;
grant execute on function public.reassign_staff_job(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_jobs'
     ) then
    alter publication supabase_realtime add table public.staff_jobs;
  end if;
end;
$$;
