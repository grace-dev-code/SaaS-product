import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const signInView = document.getElementById('signInView');
const successView = document.getElementById('successView');
const googleButton = document.getElementById('googleButton');
const message = document.getElementById('authMessage');
const signedInMessage = document.getElementById('signedInMessage');

const isConfigured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR_PROJECT_REF') && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}

if (!isConfigured) {
  showMessage('Add your Supabase URL and publishable key to supabase-config.js before signing in.');
  googleButton.disabled = true;
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    signInView.hidden = true;
    successView.hidden = false;
    signedInMessage.textContent = `Signed in as ${session.user.email}.`;
  }

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
      showMessage(error.message);
    }
  });
}
