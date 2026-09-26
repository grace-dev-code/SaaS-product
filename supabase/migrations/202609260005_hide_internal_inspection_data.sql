-- Keep the customer-code lookup on the allowlisted public record shape while excluding staff-only inspection photos and reports.
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
