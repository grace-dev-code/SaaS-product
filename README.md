# FlowDrive

FlowDrive is a vehicle service workspace for employees and customers. Employees create and update service records, add inspection findings, and keep work moving. Customers use a private access code to follow service progress and pickup readiness.

The app is built with plain HTML, CSS, and browser JavaScript, with Supabase for shared data and authentication. The `/api` endpoints are serverless functions intended for Vercel. There is no npm install or build step in this repository.

## Main user journeys

- **Landing page:** [`index.html`](index.html) explains the employee and customer journeys.
- **Customer status:** Open [`car-information.html?view=customer`](car-information.html?view=customer) and enter the access code provided by the service team. A code can show associated vehicles when customer contact details match. The customer lookup uses a restricted database function and does not expose phone numbers, email addresses, or staff-only inspection reports.
- **Employee workspace:** Select **Employee sign in** on the landing page. Employees sign in with Google through Supabase Auth and are sent to [`car-information.html`](car-information.html), where they manage service records and updates.
- **Vehicle inventory intake:** [`vehicles.html`](vehicles.html) is a separate authenticated intake page for VIN-based vehicle inventory. It uses the `vehicles` table, which is distinct from workshop service records.

## Run a local preview

From the project root, start a local web server:

```powershell
py -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000). On localhost, the service-record page uses a browser-local test workspace with sample data. The sample customer codes are `FN-DEMO-482`, `FN-DEMO-731`, `FN-DEMO-205`, and `FN-DEMO-619`. This local data is not shared with Supabase or other browsers.

The local static server does not run the `/api` serverless functions. Use a Vercel deployment or Vercel’s local development server to try AI photo analysis and voice-note summaries.

## Supabase setup

The app connects to the team’s shared Supabase project. In the Supabase SQL Editor, apply these migrations in order if they have not already been applied:

1. [`202609260001_create_vehicles.sql`](supabase/migrations/202609260001_create_vehicles.sql) — vehicle inventory and its authenticated workspace policies.
2. [`202609260002_create_service_records.sql`](supabase/migrations/202609260002_create_service_records.sql) — workshop service records, staff policies, Realtime, and the initial customer lookup function.
3. [`202609260003_align_records_and_archive.sql`](supabase/migrations/202609260003_align_records_and_archive.sql) — searchable service fields, legacy data backfill, record archive, and the allowlisted customer response.
4. [`202609260005_hide_internal_inspection_data.sql`](supabase/migrations/202609260005_hide_internal_inspection_data.sql) — ensures staff-only inspection reports are excluded from customer responses.
5. [`202609270001_link_customer_vehicle_lookup.sql`](supabase/migrations/202609270001_link_customer_vehicle_lookup.sql) — lets a customer access code show other records associated with matching customer identity details.

The migrations are intended for the shared project and should be applied once. Check the project’s migration history before running them manually.

The browser uses a Supabase project URL and publishable (anon) key. The module-based pages read them from [`supabase-config.js`](supabase-config.js); the service-record and customer page also has matching constants near the top of [`car-information.js`](car-information.js). Keep those values aligned if the project changes. Publishable keys are designed for browser use; never put a `service_role` key or other secret in client-side files.

### Employee Google sign-in

1. Enable Google under Supabase **Authentication → Providers** and configure a Google OAuth web client.
2. Add the Supabase callback URL shown in the provider settings to the Google OAuth client’s authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Set the Supabase **Site URL** and add the local and deployed `login.html` URLs under **Authentication → URL Configuration → Redirect URLs**. For local preview, use `http://localhost:8000/login.html`.
4. Open `login.html` to sign in. After successful authentication, FlowDrive redirects employees to the service-record workspace.

## AI features and deployment

Deploy the project to Vercel to run the serverless endpoints in [`api/`](api/):

- `POST /api/analyze-vehicle-inspection` analyses up to four categorized vehicle photos and returns a structured report for employee review. It requires a signed-in employee and `OPENAI_API_KEY` in the Vercel project’s server-side environment variables. The optional `OPENAI_VISION_MODEL` defaults to `gpt-4.1-mini`.
- `POST /api/summarize-voice-note` transcribes an employee recording and summarizes it into the selected service field. It also requires an employee session and `OPENAI_API_KEY`. Optional model settings are `OPENAI_TRANSCRIPTION_MODEL` (default `gpt-4o-mini-transcribe`) and `OPENAI_VOICE_SUMMARY_MODEL` (default `gpt-4.1-mini`). Recordings are limited to 2 MB and are not stored as service records.

Set API keys only as server-side Vercel environment variables. Do not add them to `supabase-config.js`, `car-information.js`, or any other browser code. See [README-AI-INSPECTION.md](README-AI-INSPECTION.md) and [README-AI-VOICE.md](README-AI-VOICE.md) for feature-specific details and limitations.

AI photo findings are visual observations for staff review, not a mechanical diagnosis. Photos cannot confirm internal engine health or accurately measure tyre tread depth.

## Data and access notes

- Authenticated employees share one workspace in the configured Supabase project. Current RLS policies are not dealership- or tenant-specific.
- Customers access only the allowlisted result returned by `get_customer_service_records`; they do not receive direct access to the service-record table or private contact fields.
- The service-record page imports non-sample records from its older browser IndexedDB into Supabase on an employee’s first signed-in load, skipping records already present. Local preview data remains browser-local.
- [`service-records.html`](service-records.html) is a legacy IndexedDB prototype, and [`dashboard.html`](dashboard.html) is a local-storage workboard demo. They are not the shared Supabase service-record workspace.

## Project files

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `flowdrive-theme.css` | Public landing page and shared visual theme |
| `car-information.html`, `car-information.js`, `car-information.css` | Employee service records and customer status portal |
| `login.html`, `login.js`, `login.css` | Employee Google sign-in |
| `vehicles.html`, `vehicles.js`, `vehicles-api.js` | Authenticated vehicle inventory intake and Supabase helpers |
| `api/` | Vercel serverless AI endpoints |
| `supabase/migrations/` | Database schema, policies, customer lookup, and archive functions |
| `favicon.svg` | FlowDrive browser-tab icon |

Other implementation notes are in [`README-supabase-integration.md`](README-supabase-integration.md), [`README-AI-INSPECTION.md`](README-AI-INSPECTION.md), and [`README-AI-VOICE.md`](README-AI-VOICE.md).
