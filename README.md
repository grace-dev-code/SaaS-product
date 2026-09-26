# FlowDrive

FlowDrive's vehicle intake prototype. The vehicle form and the other pages use the same Supabase `vehicles` table through the shared functions in `vehicles-api.js`.

## Connect the shared Supabase project

1. Use the team's existing Supabase project, or create one for FlowDrive. The database project is shared across Git branches; branches share records when each is configured with this same project URL and public publishable (anon) key.
2. In the Supabase SQL Editor, run [`supabase/migrations/202609260001_create_vehicles.sql`](supabase/migrations/202609260001_create_vehicles.sql) once.
3. Copy the project URL and publishable/anon key from Supabase **Project Settings → API** into [`supabase-config.js`](supabase-config.js). These are browser-safe public values. Never use a `service_role` or secret key in this file.
4. Serve this folder over HTTP (for example `python -m http.server 8000`) and open `/vehicles.html`. The page supports Supabase email/password sign-up and sign-in. Enable email/password auth in the Supabase project.
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
