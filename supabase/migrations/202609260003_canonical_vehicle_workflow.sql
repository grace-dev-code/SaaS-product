-- Optional canonical link for current staff jobs. Existing registration and
-- stock-number workflows remain valid and are deliberately not auto-backfilled.
alter table public.staff_jobs
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
create index if not exists staff_jobs_vehicle_id_idx on public.staff_jobs (vehicle_id);

-- Private vehicle image storage. Object paths begin with the canonical vehicle id.
insert into storage.buckets (id, name, public)
values ('vehicle-service-photos', 'vehicle-service-photos', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated members can read vehicle service photos" on storage.objects;
create policy "Authenticated members can read vehicle service photos" on storage.objects
for select to authenticated using (
  bucket_id = 'vehicle-service-photos'
  and exists (select 1 from public.vehicles v where v.id::text = (storage.foldername(name))[1])
);
drop policy if exists "Authenticated members can upload vehicle service photos" on storage.objects;
create policy "Authenticated members can upload vehicle service photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'vehicle-service-photos'
  and exists (select 1 from public.vehicles v where v.id::text = (storage.foldername(name))[1])
);
drop policy if exists "Authenticated members can update vehicle service photos" on storage.objects;
create policy "Authenticated members can update vehicle service photos" on storage.objects
for update to authenticated using (
  bucket_id = 'vehicle-service-photos'
  and exists (select 1 from public.vehicles v where v.id::text = (storage.foldername(name))[1])
) with check (
  bucket_id = 'vehicle-service-photos'
  and exists (select 1 from public.vehicles v where v.id::text = (storage.foldername(name))[1])
);
drop policy if exists "Authenticated members can delete vehicle service photos" on storage.objects;
create policy "Authenticated members can delete vehicle service photos" on storage.objects
for delete to authenticated using (
  bucket_id = 'vehicle-service-photos'
  and exists (select 1 from public.vehicles v where v.id::text = (storage.foldername(name))[1])
);
