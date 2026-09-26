# Shared vehicle and service database

The staff vehicle inventory and workshop service records now use the same `public.vehicles`
table. Inventory rows use `record_type = 'inventory'`; service rows use `record_type = 'service'`
and keep their workflow payload in `service_record_data`. The service UI stores the registration
plate, customer code, contact details, service items and timeline together on that vehicle row.

## Database migration

Run [`202609260003_store_service_records_in_vehicles.sql`](supabase/migrations/202609260003_store_service_records_in_vehicles.sql)
in the Supabase SQL Editor. It extends the existing table, moves current service rows from the
legacy `service_records` table into `vehicles`, and redirects the customer-code lookup function
to `vehicles`. The old table is retained as a rollback/audit copy; the app no longer reads or
writes to it.

Staff sign in through `login.html`. Customers use the restricted
`get_customer_service_records` function, which omits phone, email and staff creator fields. Local
`file://` or localhost previews use IndexedDB and four demo records; hosted pages use Supabase.
