import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

export const supabaseConfigured = !SUPABASE_URL.includes('YOUR_PROJECT_ID') && !SUPABASE_ANON_KEY.includes('YOUR_');
export const supabase = supabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function requireClient() {
  if (!supabase) throw new Error('Add your Supabase project URL and publishable key in supabase-config.js.');
  return supabase;
}

// Shared helpers for every page that reads or updates vehicles.
export async function listVehicles() {
  const { data, error } = await requireClient().from('vehicles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getVehicle(id) {
  const { data, error } = await requireClient().from('vehicles').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createVehicle(vehicle) {
  const { data, error } = await requireClient().from('vehicles').insert(vehicle).select().single();
  if (error) throw error;
  return data;
}

export async function updateVehicle(id, changes) {
  const { data, error } = await requireClient().from('vehicles').update(changes).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Workshop records have a different shape from vehicle inventory, but share this project/session.
export async function listServiceRecords() {
  const { data, error } = await requireClient()
    .from('service_records')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...(row.record_data || {}),
    id: String(row.id), plate: row.plate, vehicle: row.vehicle,
    customer: row.customer_name, phone: row.customer_phone, email: row.customer_email,
    customerCode: row.customer_code, request: row.request, summaryTitle: row.summary_title,
    photo: row.photo, services: row.services || [], status: row.status,
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export async function saveServiceRecord(record) {
  const client = requireClient();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user) throw new Error('Sign in to save service records to the shared workspace.');

  const { error } = await client.from('service_records').upsert({
    id: record.id,
    plate: record.plate,
    vehicle: record.vehicle || null,
    customer_name: record.customer || null,
    customer_phone: record.phone || null,
    customer_email: record.email || null,
    customer_code: record.customerCode || null,
    request: record.request || null,
    summary_title: record.summaryTitle || null,
    photo: record.photo || null,
    services: record.services || [],
    status: record.status || 'not_started',
    created_by: record.createdBy || session.user.id,
  }, { onConflict: 'id' });
  if (error) throw error;
  record.createdBy ||= session.user.id;
}

export async function getCustomerServiceRecords(customerCode) {
  const { data, error } = await requireClient().rpc('get_customer_service_records', {
    p_customer_code: customerCode,
  });
  if (error) throw error;
  return data || [];
}
