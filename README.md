# FlowDrive

FlowDrive vehicle inventory and service operations. Inventory uses Supabase `vehicles`; vehicle intake, service history, and status updates use the shared `service_records` table.

## Connect the shared Supabase project

1. Use the team's existing Supabase project, or create one for FlowDrive. The database project is shared across Git branches; branches share records when each is configured with this same project URL and public publishable (anon) key.
2. In the Supabase SQL Editor, run [`supabase/migrations/202609260001_create_vehicles.sql`](supabase/migrations/202609260001_create_vehicles.sql) once.
3. Apply [`supabase/migrations/202609260002_staff_jobs.sql`](supabase/migrations/202609260002_staff_jobs.sql) after the vehicle migration, then [`supabase/migrations/202609260003_canonical_vehicle_workflow.sql`](supabase/migrations/202609260003_canonical_vehicle_workflow.sql), then [`supabase/migrations/202609260004_service_records.sql`](supabase/migrations/202609260004_service_records.sql). These add staff-job vehicle links, private photo storage, and shared service records.
4. Copy the project URL and publishable/anon key from Supabase **Project Settings → API** into [`supabase-config.js`](supabase-config.js). These are browser-safe public values. Never use a `service_role` or secret key in this file.
5. Serve this folder over HTTP (for example `python -m http.server 8000`) and open `/vehicles.html`. The page supports Supabase email/password sign-up and sign-in. Enable email/password auth in the Supabase project.
6. Share the same project URL, public key and migration with teammates so their branches connect to the same vehicle data. Do not create a separate Supabase project per branch.

Vehicle inventory is shared within the project. Service records and their private photos require a trusted `app_metadata.role` of `staff`, `mechanic`, `manager`, or `admin`; only those accounts can read or change customer service records.

## Canonical vehicle service workflow

`public.vehicles.id` is the canonical vehicle identity. Open a vehicle from the recent-vehicles list to view its details and associated service records. Shared service records live in `public.service_records.vehicle_id`; photos for linked records live in the private `vehicle-service-photos` Storage bucket. Managers can optionally select an existing inventory vehicle when assigning a staff job; manual registration/stock-based jobs continue to work as before.

The service-record page keeps IndexedDB as a local cache and migration source. Existing device-only records are not deleted. Use **Import saved records** to copy eligible local records into the shared service-record table, or open a canonical vehicle and use **Link record** to associate one with that inventory vehicle. The link retains the local copy, copies its history, uploads its photo to private storage, and saves the canonical vehicle ID. Records on other devices remain local until imported from those devices. Built-in demo rows are excluded. Use **Delete record** to remove a record from the shared database after confirming; changes are shared across staff browsers. Do not infer a canonical vehicle match from a plate alone because the inventory table has no registration field.

## Shared vehicle data API

Import these functions from `vehicles-api.js` in other browser pages:

```js
import { listVehicles, getVehicle, createVehicle, updateVehicle } from './vehicles-api.js';

const vehicles = await listVehicles();
const vehicle = await getVehicle(vehicleId);
await updateVehicle(vehicleId, { notes: 'Inspection started' });
```

Use `vehicles-api.js` for inventory and auth, and `service-records-api.js` for service intake/history. Both use the same Supabase project configured in `supabase-config.js`.

## Enable Google sign-in for mechanics

The mechanic login page uses Supabase Auth and Google OAuth. Google handles Google-account two-step verification during its own sign-in flow.

1. In Supabase **Project Settings → API**, add the project URL and the browser-safe publishable/anon key to `supabase-config.js`. Do not use a `service_role` key.
2. In Google Cloud Console, configure the consent screen and create an OAuth client of type **Web application**.
3. In that Google OAuth client, add `http://localhost:8000` as an authorized JavaScript origin for local testing. Add your public site origin when deploying.
4. In Google OAuth client settings, add your Supabase callback URL as an authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Supabase displays the exact value in **Authentication → Providers → Google**.
5. In Supabase **Authentication → Providers → Google**, enable Google and paste the Google Client ID and Client Secret.
6. In Supabase **Authentication → URL Configuration**, set the Site URL and add `http://localhost:8000/**` to the allowed Redirect URLs for local development. Add the deployed login URL (including `?next=team-workboard.html`) to the allow list later.
7. Run `python3 -m http.server 8000` from the project folder and open `http://localhost:8000/`; choose **Staff Sign In** to return to the staff queue after Google authentication.

After Google returns the user to FlowDrive, `login.js` restores the Supabase session automatically. Assign approved role claims through Supabase `app_metadata`; the staff-jobs migration uses those claims in its access policies.

## Staff work queue

The public site opens on `index.html`; its product links stay on the public overview. Managers and staff use the same **Staff Sign In** button. After Google authentication, `manager` and `admin` accounts open the capacity workboard; `staff` and `mechanic` accounts open `team-workboard.html`. Both pages require a trusted Supabase `app_metadata.role` claim. Set that claim only for approved company staff. Visitors without an allowed role are returned to the public homepage. Customers do not see staff assignments.

Apply `supabase/migrations/202609260002_staff_jobs.sql` in the Supabase SQL Editor after the vehicle migration. Managers (`manager` or `admin`) can open **Staff assignments** from the capacity workboard, add a car/job, assign or reassign it using the staff member's Google sign-in email, and view the full queue and completed history. Staff see only jobs assigned to their signed-in email. Starting and completing a job saves shared status and timestamps; completed jobs disappear from the staff active list and remain in manager history. The database policies enforce the same manager-versus-assignee visibility.

Add one row per job using the same registration or stock number to group stages. The database holds a wash job while any non-wash job for that car is incomplete, then releases the wash as the final stage. Job statuses sync across signed-in staff browsers through Supabase Realtime. Existing vehicle service records are not automatically converted into assigned jobs.
