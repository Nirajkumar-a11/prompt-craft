// ================================================================
// PromptCraft — Background Service Worker
// Handles: Authentication, API calls, Storage
// ================================================================

// 🔑 FILL THIS IN — your Railway backend URL after deployment
const BACKEND_URL = 'PASTE_YOUR_RAILWAY_URL_HERE'; // e.g. https://promptcraft-backend.up.railway.app

// Supabase config for Google OAuth
const SUPABASE_URL    = 'https://aafxffnrjgumvrhewusj.supabase.co';
const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhZnhmZm5yamd1bXZyaGV3dXNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjkzNDgsImV4cCI6MjA5MDc0NTM0OH0.dAFHBtmUjqL2YPUwZz4SOojglgt39vWM3J9EwZXchxs';

// ================================================================
// GOOGLE OAUTH SIGN IN
// ================================================================
async function signInWithGoogle() {
  try {
    // Step 1: Get OAuth URL from Supabase
    const redirectUri = chrome.identity.getRedirectURL('auth');

    const response = await fetch(`${SUPABASE_URL}/auth/v1/authorize?` + new URLSearchParams({
      provider:     'google',
      redirect_to:  redirectUri,
      access_type:  'offline',
      prompt:       'consent'
    }), {
      headers: { apikey: SUPABASE_ANON }
    });

    // Build full OAuth URL
    const oauthUrl = `${SUPABASE_URL}/auth/v1/authorize?` + new URLSearchParams({
      provider:    'google',
      redirect_to: redirectUri
    });

    // Step 2: Launch Chrome's OAuth popup
    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: oauthUrl, interactive: true },
        (url) => {
          if (chrome.runtime.lastError || !url) {
            reject(chrome.runtime.lastError || new Error('Auth failed'));
          } else {
            resolve(url);
          }
        }
      );
    });

    // Step 3: Parse tokens from redirect URL
    const urlObj   = new URL(responseUrl);
    const fragment = new URLSearchParams(urlObj.hash.substring(1));
    const query    = new URLSearchParams(urlObj.search);

    const accessToken  = fragment.get('access_token')  || query.get('access_token');
    const refreshToken = fragment.get('refresh_token') || query.get('refresh_token');

    if (!accessToken) throw new Error('No access token received');

    // Step 4: Get user info from Supabase
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    const user = await userRes.json();

    // Step 5: Store session
    const session = { accessToken, refreshToken, user };
    await chrome.storage.local.set({ session });

    return { success: true, user };

  } catch (err) {
    console.error('Google Sign-In Error:', err);
    return { success: false, error: err.message };
  }
}

// ================================================================
// SIGN OUT
// ================================================================
async function signOut() {
  await chrome.storage.local.remove(['session']);
  return { success: true };
}

// ================================================================
// GET CURRENT SESSION
// ================================================================
async function getSession() {
  const data = await chrome.storage.local.get('session');
  return data.session || null;
}

// ================================================================
// GET USER STATUS (plan, usage)
// ================================================================
async function getUserStatus() {
  const session = await getSession();
  if (!session) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/api/status`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token: session.accessToken })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ================================================================
// OPTIMIZE PROMPT — Core feature
// ================================================================
async function optimizePrompt(prompt) {
  const session = await getSession();

  if (!session) {
    return { success: false, error: 'not_logged_in' };
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/optimize`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        token:  session.accessToken,
        prompt: prompt
      })
    });

    const data = await res.json();

    if (res.status === 429) {
      return { success: false, error: 'limit_reached', data };
    }

    if (res.status === 401) {
      // Token expired — clear session
      await chrome.storage.local.remove(['session']);
      return { success: false, error: 'not_logged_in' };
    }

    if (!res.ok) {
      return { success: false, error: 'server_error' };
    }

    return { success: true, optimized: data.optimized, usage: data.usage };

  } catch (err) {
    return { success: false, error: 'network_error' };
  }
}

// ================================================================
// CREATE STRIPE CHECKOUT
// ================================================================
async function createCheckout(plan) {
  const session = await getSession();
  if (!session) return { success: false, error: 'not_logged_in' };

  try {
    const res = await fetch(`${BACKEND_URL}/api/checkout`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        token: session.accessToken,
        plan
      })
    });

    const data = await res.json();
    if (data.url) {
      // Open Stripe checkout in a new tab
      chrome.tabs.create({ url: data.url });
      return { success: true };
    }
    return { success: false, error: 'checkout_failed' };

  } catch (err) {
    return { success: false, error: 'network_error' };
  }
}

// ================================================================
// MESSAGE LISTENER — receives messages from popup & content scripts
// ================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {

      case 'sign_in':
        sendResponse(await signInWithGoogle());
        break;

      case 'sign_out':
        sendResponse(await signOut());
        break;

      case 'get_session':
        sendResponse(await getSession());
        break;

      case 'get_status':
        sendResponse(await getUserStatus());
        break;

      case 'optimize':
        sendResponse(await optimizePrompt(message.prompt));
        break;

      case 'checkout':
        sendResponse(await createCheckout(message.plan));
        break;

      default:
        sendResponse({ error: 'unknown_action' });
    }
  })();

  return true; // Keep channel open for async response
});
