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
