-- A customer access code can now show the customer's other vehicles by matching
-- the contact details already attached to one or more records for that code.
-- Keep the public response allowlisted and put exact-code records first.
create or replace function public.get_customer_service_records(p_customer_code text)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with normalized_records as (
    select
      sr.*,
      case
        when length(regexp_replace(coalesce(nullif(trim(sr.customer_phone), ''), sr.record_data ->> 'phone', ''), '[^0-9]', '', 'g')) >= 9
          then right(regexp_replace(coalesce(nullif(trim(sr.customer_phone), ''), sr.record_data ->> 'phone', ''), '[^0-9]', '', 'g'), 9)
        else nullif(regexp_replace(coalesce(nullif(trim(sr.customer_phone), ''), sr.record_data ->> 'phone', ''), '[^0-9]', '', 'g'), '')
      end as phone_key,
      nullif(lower(trim(coalesce(nullif(trim(sr.customer_email), ''), sr.record_data ->> 'email', ''))), '') as email_key
    from public.service_records sr
  ),
  anchors as (
    select * from normalized_records
    where nullif(trim(p_customer_code), '') is not null
      and upper(customer_code) = upper(trim(p_customer_code))
  ),
  related as (
    select candidate.*
    from normalized_records candidate
    where exists (
      select 1 from anchors anchor
      where candidate.id = anchor.id
         or (candidate.email_key is not null and candidate.email_key = anchor.email_key)
         or (candidate.phone_key is not null and length(candidate.phone_key) >= 7 and candidate.phone_key = anchor.phone_key)
    )
  )
  select jsonb_build_object(
    'id', id,
    'plate', plate,
    'vehicle', coalesce(vehicle, record_data ->> 'vehicle'),
    'customer', coalesce(customer_name, record_data ->> 'customer'),
    'customerCode', customer_code,
    'request', coalesce(request, record_data ->> 'request'),
    'summaryTitle', coalesce(summary_title, record_data ->> 'summaryTitle'),
    'photo', coalesce(photo, record_data ->> 'photo'),
    'photoNotUpdated', case
      when jsonb_typeof(record_data -> 'photoNotUpdated') = 'boolean' then record_data -> 'photoNotUpdated'
      else 'false'::jsonb
    end,
    'services', case
      when services <> '[]'::jsonb then services
      when jsonb_typeof(record_data -> 'services') = 'array' and jsonb_array_length(record_data -> 'services') > 0 then record_data -> 'services'
      when record_data ? 'service' then jsonb_build_array(jsonb_build_object(
        'id', coalesce(record_data ->> 'id', id) || '-service',
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
  from related
  order by case when upper(customer_code) = upper(trim(p_customer_code)) then 0 else 1 end,
           created_at desc;
$$;

revoke all on function public.get_customer_service_records(text) from public;
grant execute on function public.get_customer_service_records(text) to anon, authenticated;
