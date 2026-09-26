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
  const { data, error } = await requireClient().from('vehicles').select('*').eq('record_type', 'inventory').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getVehicle(id) {
  const { data, error } = await requireClient().from('vehicles').select('*').eq('record_type', 'inventory').eq('id', id).single();
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
    .select('id,plate,customer_code,record_data,created_by')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row.record_data,
    id: row.id,
    plate: row.plate,
    customerCode: row.customer_code,
    createdBy: row.created_by,
  }));
}

export async function saveServiceRecord(record) {
  const client = requireClient();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user) throw new Error('Sign in to save service records to the shared workspace.');

  const recordData = { ...record };
  delete recordData.createdBy;
  delete recordData.showAllEvents;
  const { error } = await client.from('service_records').upsert({
    id: record.id,
    plate: record.plate,
    customer_code: record.customerCode,
    record_data: recordData,
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
