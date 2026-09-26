# FlowDrive

FlowDrive's vehicle workflow prototype. The root page is a React customer status portal; employee pages remain available at `/login.html`, `/vehicles.html`, `/car-information.html`, `/service-records.html`, and `/dashboard.html`.

## Customer status portal

The React landing page looks up vehicles through the `get_customer_vehicle_status` Supabase RPC. Customers enter the access code shown to employees on the vehicle intake page. The RPC returns only the vehicle label, customer status, public note, estimated completion time, and update time; it does not expose VINs or allow anonymous reads of the employee vehicle table.

After applying the migrations below, employees can update `customer_status` (`received`, `inspection`, `in_progress`, or `ready`), `public_note`, and `estimated_completion_at` on a vehicle row in the shared Supabase project. Share the generated `customer_access_code` with that vehicle's customer.

## Run and deploy the React landing page

Install dependencies with `npm install`, then start locally with `npm run dev`. Vercel uses the included `vercel.json` and Vite configuration; connect the Git repository to Vercel and deploy the `user-side-status-portal` branch or merge it when ready. The existing `supabase-config.js` values are used by default. For Vercel environment configuration, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the same project URL and browser-safe publishable/anon key.

## Connect the shared Supabase project

1. Use the team's existing Supabase project, or create one for FlowDrive. The database project is shared across Git branches; branches share records when each is configured with this same project URL and public publishable (anon) key.
2. In the Supabase SQL Editor, run [`supabase/migrations/202609260001_create_vehicles.sql`](supabase/migrations/202609260001_create_vehicles.sql) and [`supabase/migrations/202609260002_customer_status_portal.sql`](supabase/migrations/202609260002_customer_status_portal.sql) once each.
3. Copy the project URL and publishable/anon key from Supabase **Project Settings → API** into [`supabase-config.js`](supabase-config.js). These are browser-safe public values. Never use a `service_role` or secret key in this file.
4. Sign in at `/login.html` with the approved dealership Google account, then use `/vehicles.html` to add a vehicle and share its customer status code.
5. Share the same project URL, public key and migration with teammates so their branches connect to the same vehicle data. Do not create a separate Supabase project per branch.

The initial RLS policies treat authenticated accounts in this Supabase project as members of one shared workspace: signed-in users can read and update its vehicles, and new records record their creator. If the product later needs multiple dealerships with private inventories, add organization membership and tenant-scoped policies before onboarding those dealerships.

## Shared vehicle data API

Import these functions from `vehicles-api.js` in other browser pages:

```js
import { listVehicles, getVehicle, createVehicle, updateVehicle } from './vehicles-api.js';

const vehicles = await listVehicles();
const vehicle = await getVehicle(vehicleId);
await updateVehicle(vehicleId, { notes: 'Inspection started' });
```

All pages in this app should reuse `vehicles-api.js` and `supabase-config.js` so they read and update the same records and auth session.

## Enable Google sign-in for mechanics

The mechanic login page uses Supabase Auth and Google OAuth. Google handles Google-account two-step verification during its own sign-in flow.

1. In Supabase **Project Settings → API**, add the project URL and the browser-safe publishable/anon key to `supabase-config.js`. Do not use a `service_role` key.
2. In Google Cloud Console, configure the consent screen and create an OAuth client of type **Web application**.
3. In that Google OAuth client, add `http://localhost:8000` as an authorized JavaScript origin for local testing. Add your public site origin when deploying.
4. In Google OAuth client settings, add your Supabase callback URL as an authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Supabase displays the exact value in **Authentication → Providers → Google**.
5. In Supabase **Authentication → Providers → Google**, enable Google and paste the Google Client ID and Client Secret.
6. In Supabase **Authentication → URL Configuration**, set the Site URL and add `http://localhost:8000/login.html` to the allowed Redirect URLs. Add the deployed `https://your-domain/login.html` URL later.
7. Run `python3 -m http.server 8000` from the project folder and open `http://localhost:8000/login.html`.

After Google returns the user to FlowDrive, `login.js` restores the Supabase session automatically. Use the session's user ID for row-level security policies and dealership roles in future protected pages.
