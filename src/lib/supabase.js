import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../supabase-config.js';

const url = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT_ID') && !key.includes('YOUR_'));
export const supabase = supabaseConfigured ? createClient(url, key) : null;

export async function findCustomerServiceRecord(accessCode) {
  if (!supabase) throw new Error('Vehicle status lookup is not configured yet.');
  const { data, error } = await supabase.rpc('get_customer_vehicle_status', {
    p_customer_code: accessCode.trim(),
  });
  if (error) throw error;
  return data?.[0] ?? null;
}
