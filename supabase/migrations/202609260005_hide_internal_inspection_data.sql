-- Inspection data lives inside service_records.record_data but remains staff-only.
-- Keep it out of responses returned by the public customer-code lookup.
create or replace function public.get_customer_service_records(p_customer_code text)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select record_data - 'phone' - 'email' - 'createdBy' - 'inspectionReports'
  from public.service_records
  where upper(customer_code) = upper(trim(p_customer_code))
  order by created_at desc;
$$;

revoke all on function public.get_customer_service_records(text) from public;
grant execute on function public.get_customer_service_records(text) to anon, authenticated;
