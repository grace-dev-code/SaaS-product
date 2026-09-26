import { createVehicle, listVehicles, supabase, supabaseConfigured } from './vehicles-api.js';

const form = document.querySelector('#vehicle-form');
const message = document.querySelector('#form-message');
const list = document.querySelector('#vehicle-list');
const count = document.querySelector('#vehicle-count');
const submitButton = form.querySelector('button[type="submit"]');

function showMessage(text, type = '') {
  message.textContent = text;
  message.className = `form-message ${type}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function renderVehicles(vehicles) {
  count.textContent = `${vehicles.length} ${vehicles.length === 1 ? 'vehicle' : 'vehicles'}`;
  if (!vehicles.length) {
    list.innerHTML = '<p class="list-empty">No vehicles yet. Add the first vehicle above.</p>';
    return;
  }
  list.innerHTML = vehicles.map((vehicle) => `
    <article class="vehicle-item">
      <div class="vehicle-item-top"><div><h3>${escapeHtml(vehicle.year)} ${escapeHtml(vehicle.make)} ${escapeHtml(vehicle.model)}${vehicle.trim ? ` ${escapeHtml(vehicle.trim)}` : ''}</h3><p>VIN ····${escapeHtml(vehicle.vin.slice(-4))}</p></div><span class="vehicle-year">${vehicle.mileage == null ? '—' : `${Number(vehicle.mileage).toLocaleString()} km`}</span></div>
      <div class="vehicle-meta"><span>${vehicle.stock_number ? `Stock ${escapeHtml(vehicle.stock_number)}` : 'No stock number'}</span><span>${escapeHtml(vehicle.fuel_type || 'Fuel not set')}</span></div>
      <a class="vehicle-open" href="car-information.html?vehicleId=${encodeURIComponent(vehicle.id)}">Open vehicle record →</a>
    </article>`).join('');
}

async function refreshVehicles() {
  const vehicles = await listVehicles();
  renderVehicles(vehicles);
}

if (!supabaseConfigured) {
  showMessage('Connect this page to your shared Supabase project to save and load vehicles. See README for setup.', '');
  list.innerHTML = '<p class="list-empty">Set up the shared Supabase project to see vehicle records.</p>';
  count.textContent = 'Setup needed';
} else {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.replace('login.html');
  } else {
    refreshVehicles().catch((error) => {
      showMessage(error.message);
      list.innerHTML = '<p class="list-empty">Could not load vehicles. Check the Supabase setup and access policies.</p>';
    });
  }
  supabase.channel('vehicles-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => refreshVehicles()).subscribe();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase || !(await supabase.auth.getSession()).data.session) {
    showMessage('Sign in to your FlowDrive workspace before saving a vehicle.');
    return;
  }

  const values = Object.fromEntries(new FormData(form).entries());
  values.vin = values.vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(values.vin)) {
    form.elements.vin.setCustomValidity('Enter a valid 17-character VIN (I, O and Q are not used).');
    form.elements.vin.reportValidity();
    form.elements.vin.setCustomValidity('');
    return;
  }
  for (const key of ['stock_number', 'trim', 'exterior_color', 'fuel_type', 'transmission', 'notes']) values[key] = values[key]?.trim() || null;
  values.mileage = values.mileage ? Number(values.mileage) : null;
  values.year = Number(values.model_year);
  delete values.model_year;
  values.make = values.make.trim();
  values.model = values.model.trim();

  submitButton.disabled = true;
  submitButton.textContent = 'Saving…';
  showMessage('');
  try {
    await createVehicle(values);
    form.reset();
    showMessage('Vehicle saved to the shared workspace.', 'success');
    await refreshVehicles();
  } catch (error) {
    showMessage(error.code === '23505' ? 'A vehicle with this VIN is already in the workspace.' : error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Save vehicle <b>→</b>';
  }
});
