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
