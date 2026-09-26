-- Customer code lookup reads only the shared service_records table.
-- Public callers receive customer-visible record data; staff-only fields are removed.
create or replace function public.get_customer_service_records(p_customer_code text)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select record_data - 'phone' - 'email' - 'createdBy'
  from public.service_records
  where nullif(btrim(p_customer_code), '') is not null
    and upper(customer_code) = upper(btrim(p_customer_code))
  order by created_at desc;
$$;

revoke all on function public.get_customer_service_records(text) from public;
grant execute on function public.get_customer_service_records(text) to anon, authenticated;
