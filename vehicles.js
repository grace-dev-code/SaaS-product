import { createVehicle, listVehicles, supabase, supabaseConfigured } from './vehicles-api.js';

const form = document.querySelector('#vehicle-form');
const message = document.querySelector('#form-message');
const list = document.querySelector('#vehicle-list');
const count = document.querySelector('#vehicle-count');
const submitButton = form.querySelector('button[type="submit"]');
const authPanel = document.querySelector('#auth-panel');
const authForm = document.querySelector('#auth-form');
const authMessage = document.querySelector('#auth-message');
const authToggle = document.querySelector('#auth-toggle');
const authSubmit = document.querySelector('#auth-submit');
const signedInPanel = document.querySelector('#signed-in-panel');
const signedInEmail = document.querySelector('#signed-in-email');
let isSigningUp = false;

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
    </article>`).join('');
}

async function refreshVehicles() {
  const vehicles = await listVehicles();
  renderVehicles(vehicles);
}

function renderAuth(session) {
  authPanel.hidden = !supabaseConfigured || Boolean(session);
  signedInPanel.hidden = !supabaseConfigured || !session;
  if (session) signedInEmail.textContent = `Signed in as ${session.user.email}`;
  submitButton.disabled = !session;
  if (!session) {
    list.innerHTML = '<p class="list-empty">Sign in to load your workspace vehicles.</p>';
    count.textContent = 'Sign in required';
  } else {
    refreshVehicles().catch((error) => {
      showMessage(error.message);
      list.innerHTML = '<p class="list-empty">Could not load vehicles. Check the Supabase setup and access policies.</p>';
    });
  }
}

if (!supabaseConfigured) {
  showMessage('Connect this page to your shared Supabase project to save and load vehicles. See README for setup.', '');
  list.innerHTML = '<p class="list-empty">Set up the shared Supabase project to see vehicle records.</p>';
  count.textContent = 'Setup needed';
} else {
  const { data: { session } } = await supabase.auth.getSession();
  renderAuth(session);
  supabase.auth.onAuthStateChange((_event, nextSession) => renderAuth(nextSession));
  supabase.channel('vehicles-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => refreshVehicles()).subscribe();
}

authToggle.addEventListener('click', () => {
  isSigningUp = !isSigningUp;
  document.querySelector('#auth-title').textContent = isSigningUp ? 'Create your workspace account' : 'Sign in to your workspace';
  document.querySelector('#auth-help').textContent = isSigningUp ? 'Invite your teammates to use the same FlowDrive workspace.' : 'Use your FlowDrive team account to access shared vehicle records.';
  authSubmit.innerHTML = isSigningUp ? 'Create account <b>→</b>' : 'Sign in <b>→</b>';
  authToggle.textContent = isSigningUp ? 'Already have an account? Sign in' : 'Create an account';
  authForm.elements.password.autocomplete = isSigningUp ? 'new-password' : 'current-password';
  authMessage.textContent = '';
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  authMessage.textContent = '';
  const { email, password } = Object.fromEntries(new FormData(authForm).entries());
  try {
    const result = isSigningUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (isSigningUp && !result.data.session) {
      authMessage.textContent = 'Check your email to confirm your account, then sign in.';
    } else {
      authMessage.className = 'form-message success';
      authMessage.textContent = isSigningUp ? 'Account created. You are signed in.' : 'Signed in successfully.';
    }
  } catch (error) {
    authMessage.className = 'form-message';
    authMessage.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

document.querySelector('#sign-out').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) showMessage(error.message);
});

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
