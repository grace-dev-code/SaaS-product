# Shared service records database

`car-information.html` now uses the existing Supabase project configured in `supabase-config.js`.
Staff need to sign in through the existing `login.html` flow. Service records are stored in a
dedicated `public.service_records` table in the same project; the vehicle inventory `vehicles`
table stays unchanged because it requires a VIN and has a different data shape.

## Apply the schema

In the Supabase SQL Editor, run
[`202609260002_create_service_records.sql`](supabase/migrations/202609260002_create_service_records.sql).
Then run [`202609260003_align_records_and_archive.sql`](supabase/migrations/202609260003_align_records_and_archive.sql).
It backfills existing JSON records into the customer-facing fields, corrects the customer-code
lookup result, creates the `deleted` archive table, and installs the atomic archive function used
when staff delete a service record. The customer lookup returns service progress and history without
phone or email fields and does not grant anonymous access to the underlying table.

After the migration is applied and the Vercel deployment includes the updated files:

- Staff records load from and save to Supabase. Changes from other signed-in staff refresh through
  Supabase Realtime.
- The customer page looks up service records by customer code through the restricted SQL function.
- Non-sample records from the old browser IndexedDB that are not already in Supabase are copied on
  the first signed-in load. Sample/demo rows are skipped. The app then reads and writes service
  records through Supabase.
- Vehicle photos are resized and compressed before being stored in the JSON record.

The existing browser-safe publishable key in `supabase-config.js` is used. Do not place a
`service_role` or secret key in browser code.

