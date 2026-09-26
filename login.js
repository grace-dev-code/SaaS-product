import { supabase, supabaseConfigured } from './vehicles-api.js';

const signInView = document.getElementById('signInView');
const successView = document.getElementById('successView');
const googleButton = document.getElementById('googleButton');
const requestedNext = new URLSearchParams(window.location.search).get('next');
let requestedReturn;
try { requestedReturn = new URL(requestedNext || 'car-information.html', window.location.href); } catch { requestedReturn = new URL('car-information.html', window.location.href); }
const requestedVehicleId = requestedReturn.searchParams.get('vehicleId');
const isVehicleReturn = requestedReturn.pathname.endsWith('/car-information.html') && /^[0-9a-f-]{36}$/i.test(requestedVehicleId || '');
const nextPage = requestedNext === 'team-workboard.html' ? 'team-workboard.html' : isVehicleReturn ? `car-information.html?vehicleId=${encodeURIComponent(requestedVehicleId)}` : 'car-information.html';
const signInReturnUrl = new URL('login.html', window.location.href);
if (requestedNext === 'team-workboard.html' || isVehicleReturn) signInReturnUrl.searchParams.set('next', nextPage);
const staffRoles = new Set(['staff', 'mechanic', 'manager', 'admin']);

function showSignInError(message) {
  const existing = document.getElementById('authError');
  if (existing) existing.remove();
  const error = document.createElement('p');
  error.id = 'authError';
  error.className = 'auth-error';
  error.textContent = message;
  googleButton.insertAdjacentElement('afterend', error);
}

function showSignedInUser(user) {
  const role = String(user.app_metadata?.role || '').toLowerCase();
  if (!staffRoles.has(role)) {
    showSignInError('This account does not have staff access. Contact your dealership admin.');
    return;
  }
  signInView.hidden = true;
  successView.hidden = false;
  successView.querySelector('.intro').textContent = `Signed in as ${user.email}. Your Google account has been verified.`;
  const destination = nextPage === 'team-workboard.html' && ['manager', 'admin'].includes(role) ? 'dashboard.html' : nextPage;
  window.location.replace(new URL(destination, window.location.href));
}

if (window.location.protocol === 'file:') {
  googleButton.disabled = true;
  showSignInError('Google sign-in needs an HTTP page. Open http://localhost:8000/ and choose Staff Sign In.');
} else if (!supabaseConfigured) {
  googleButton.disabled = true;
  showSignInError('Add your Supabase Project URL and publishable key to supabase-config.js to enable Google sign-in.');
} else {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) showSignedInUser(session.user);

  googleButton.addEventListener('click', async () => {
    googleButton.disabled = true;
    googleButton.textContent = 'Connecting to Google…';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: signInReturnUrl.href },
    });
    if (error) {
      googleButton.disabled = false;
      googleButton.innerHTML = '<span class="google-g">G</span> Continue with Google';
      showSignInError(error.message);
    }
  });
}
