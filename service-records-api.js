import { supabase } from './vehicles-api.js';

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Check supabase-config.js.');
  }
  return supabase;
}

async function fromDatabase(row) {
  let photo = row.photo || '';
  if (row.photo_path) {
    const { data, error } = await requireClient().storage.from('vehicle-service-photos').createSignedUrl(row.photo_path, 3600);
    if (error) throw error;
    photo = data.signedUrl;
  }
  return {
    id: row.id,
    databaseId: row.id,
    plate: row.plate,
    vehicle: row.vehicle || '',
    customer: row.customer_name || '',
    phone: row.customer_phone || '',
    email: row.customer_email || '',
    customerCode: row.customer_code || '',
    request: row.request || '',
    summaryTitle: row.summary_title || '',
    photo,
    photoPath: row.photo_path || null,
    services: Array.isArray(row.services) ? row.services : [],
    status: row.status || 'not_started',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    vehicleId: row.vehicle_id || null,
    sourceLocalId: row.source_local_id || null,
    syncedToServiceRecords: Boolean(row.source_local_id),
    cloudRecord: true,
  };
}

function toDatabase(record) {
  return {
    id: record.databaseId || record.id,
    plate: record.plate,
    vehicle: record.vehicle || null,
    customer_name: record.customer || null,
    customer_phone: record.phone || null,
    customer_email: record.email || null,
    customer_code: record.customerCode || null,
    request: record.request || null,
    summary_title: record.summaryTitle || null,
    photo: record.photoPath ? null : record.photo || null,
    photo_path: record.photoPath || null,
    services: record.services || [],
    status: record.status || 'not_started',
    vehicle_id: record.vehicleId || null,
    source_local_id: record.sourceLocalId || null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export async function listServiceRecords(vehicleId = null) {
  let query = requireClient()
    .from('service_records')
    .select('*')
    .order('created_at', { ascending: false });
  if (vehicleId) query = query.eq('vehicle_id', vehicleId);
  const { data, error } = await query;
  if (error) throw error;
  return Promise.all(data.map(fromDatabase));
}

export async function saveServiceRecord(record) {
  const client = requireClient();
  const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
  record.databaseId ||= isUuid(record.id) ? record.id : crypto.randomUUID();
  let photoPath = record.photoPath || null;
  if (record.vehicleId && !photoPath && record.photo?.startsWith('data:')) {
    const response = await fetch(record.photo);
    const image = await response.blob();
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[image.type] || 'img';
    photoPath = `${record.vehicleId}/${record.databaseId}.${extension}`;
    const { error: uploadError } = await client.storage.from('vehicle-service-photos').upload(photoPath, image, {
      contentType: image.type || 'image/jpeg', upsert: true,
    });
    if (uploadError) throw uploadError;
    record.photoPath = photoPath;
  }
  const { data, error } = await client
    .from('service_records')
    .upsert(toDatabase(record), { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return await fromDatabase(data);
}

export async function deleteServiceRecord(id) {
  const client = requireClient();
  const { data: record, error: readError } = await client.from('service_records').select('photo_path').eq('id', id).maybeSingle();
  if (readError) throw readError;
  const { error } = await client
    .from('service_records')
    .delete()
    .eq('id', id);
  if (error) throw error;
  if (record?.photo_path) {
    const { error: storageError } = await client.storage.from('vehicle-service-photos').remove([record.photo_path]);
    if (storageError) console.warn('Service record deleted, but its private photo could not be removed.', storageError);
  }
}
