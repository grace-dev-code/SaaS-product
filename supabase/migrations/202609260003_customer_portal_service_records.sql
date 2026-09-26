-- Customer status lookup uses the customer_code already stored on service_records.
-- The RPC only returns customer-facing fields and keeps table access behind a code check.

drop function if exists public.get_customer_vehicle_status(text);

create index if not exists service_records_customer_code_lower_idx
  on public.service_records (lower(customer_code));

create function public.get_customer_vehicle_status(p_customer_code text)
returns table (
  vehicle text,
  plate text,
  customer_status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    sr.vehicle,
    sr.plate,
    case
      when lower(btrim(sr.status)) in ('completed', 'done', 'ready') then 'ready'
      when lower(btrim(sr.status)) in ('in_progress', 'in progress') then 'in_progress'
      when lower(btrim(sr.status)) in ('inspection', 'inspecting') then 'inspection'
      else 'received'
    end as customer_status,
    sr.updated_at
  from public.service_records as sr
  where nullif(btrim(p_customer_code), '') is not null
    and lower(btrim(sr.customer_code)) = lower(btrim(p_customer_code))
  order by sr.updated_at desc nulls last, sr.created_at desc nulls last
  limit 1;
$$;

revoke all on function public.get_customer_vehicle_status(text) from public;
grant execute on function public.get_customer_vehicle_status(text) to anon, authenticated;
