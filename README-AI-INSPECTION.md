# AI vehicle photo inspection

The signed-in mechanic intake collects up to four categorized photos (exterior, tyres, engine bay, and physical condition/damage). After the employee selects **Analyse photos**, the Vercel function `/api/analyze-vehicle-inspection` verifies their Supabase session and sends the photos to OpenAI Responses API using `gpt-4.1-mini` by default. The report is structured JSON with visible condition observations and cautious recommendations for Inspection, Mechanical, Tyres, Body Shop, or Detailing.

Inspection photos and reports are stored in `service_records.record_data.inspectionReports` alongside the service record. The customer-code RPC removes that field from its response, so internal photos and reports stay staff-only. Authenticated staff can review reports on the mechanic service-record detail and explicitly add recommendations to the shared service work plan. Photos-only inspections can be saved when AI analysis is unavailable.

## Deployment setup

1. Apply `supabase/migrations/202609260003_customer_portal_service_records.sql` if the customer-code lookup RPC is not already installed, then apply `supabase/migrations/202609260005_hide_internal_inspection_data.sql` to keep internal inspection reports out of customer responses. Both use the existing `service_records` table and its `customer_code`.
2. Add `OPENAI_API_KEY` to the Vercel project’s server-side Environment Variables for the Preview and Production environments that should support analysis. Never add it to `supabase-config.js`, a `VITE_` variable, or browser code.
3. Optionally set `OPENAI_VISION_MODEL`; the default is `gpt-4.1-mini`.
4. Deploy the branch through Vercel. The endpoint requires a valid Supabase employee sign-in and limits a report to four compressed photos.

The report is an internal recommendation for staff review. Still images cannot confirm internal engine health or accurately measure tyre tread depth; the report calls for a diagnostic scan or tread-gauge measurement where needed. Department recommendations become service items only after a mechanic selects **Add to [department] work plan**. Do not photograph people or unrelated documents.
