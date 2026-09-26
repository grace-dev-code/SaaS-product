import { supabase, supabaseConfigured } from './vehicles-api.js';

const signInView = document.getElementById('signInView');
const successView = document.getElementById('successView');
const googleButton = document.getElementById('googleButton');

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
  signInView.hidden = true;
  successView.hidden = false;
  successView.querySelector('.intro').textContent = `Signed in as ${user.email}. Your Google account has been verified.`;
  window.location.replace('car-information.html');
}

if (!supabaseConfigured) {
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
      options: { redirectTo: `${window.location.origin}/login.html` },
    });
    if (error) {
      googleButton.disabled = false;
      googleButton.innerHTML = '<span class="google-g">G</span> Continue with Google';
      showSignInError(error.message);
    }
  });
}
