// ================================================================
// PromptCraft — Popup Script
// ================================================================

// Supported LLM platforms
const SUPPORTED_SITES = [
  'chatgpt.com', 'chat.openai.com', 'claude.ai',
  'gemini.google.com', 'perplexity.ai', 'grok.x.com',
  'copilot.microsoft.com'
];

// ================================================================
// SCREEN MANAGEMENT
// ================================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.style.display = 'none';
  });
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

// ================================================================
// PLAN BADGE
// ================================================================
function setPlanBadge(plan) {
  const badge = document.getElementById('plan-badge');
  if (!badge) return;

  const labels = {
    free:      'Free',
    starter:   'Starter',
    pro:       'Pro',
    unlimited: 'Unlimited'
  };

  badge.textContent  = labels[plan] || 'Free';
  badge.className    = `plan-badge badge-${plan || 'free'}`;
}

// ================================================================
// USAGE BAR
// ================================================================
function setUsageBar(count, limit, plan) {
  const bar  = document.getElementById('usage-bar');
  const text = document.getElementById('usage-text');
  if (!bar || !text) return;

  const isUnlimited = plan === 'unlimited';
  const pct = isUnlimited ? 5 : Math.min((count / limit) * 100, 100);

  bar.style.width = `${pct}%`;
  text.textContent = isUnlimited
    ? `${count} optimizations (unlimited)`
    : `${count} / ${limit} optimizations`;

  bar.className = 'usage-bar-fill';
  if (!isUnlimited) {
    if (pct >= 100) bar.classList.add('full');
    else if (pct >= 75) bar.classList.add('warn');
  }
}

// ================================================================
// LOAD MAIN DASHBOARD
// ================================================================
async function loadDashboard() {
  showScreen('screen-loading');

  // Get status from backend
  const status = await chrome.runtime.sendMessage({ action: 'get_status' });

  if (!status || status.error === 'unauthorized') {
    await chrome.runtime.sendMessage({ action: 'sign_out' });
    showScreen('screen-auth');
    return;
  }

  // Set user info
  const nameEl  = document.getElementById('user-name');
  const emailEl = document.getElementById('user-email');
  const avatar  = document.getElementById('user-avatar');

  if (nameEl)  nameEl.textContent  = status.user?.full_name || status.user?.email?.split('@')[0] || 'User';
  if (emailEl) emailEl.textContent = status.user?.email || '';

  // Set avatar
  if (avatar && status.user?.avatar_url) {
    avatar.innerHTML = `<img src="${status.user.avatar_url}" alt="avatar" />`;
  } else if (avatar && status.user?.full_name) {
    avatar.textContent = status.user.full_name[0].toUpperCase();
  }

  setPlanBadge(status.plan);
  setUsageBar(status.count, status.limit, status.plan);

  // Check if we're on a supported site
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const hostname = tab?.url ? new URL(tab.url).hostname : '';
  const supported = SUPPORTED_SITES.some(s => hostname.includes(s));

  const statusCard = document.getElementById('status-card');
  const statusText = document.getElementById('status-text');
  const statusDot  = statusCard?.querySelector('.status-dot');

  if (statusCard && statusText) {
    if (supported) {
      statusText.textContent = `Active on ${hostname}`;
      statusDot?.classList.add('active');
    } else {
      statusText.textContent = 'Go to ChatGPT, Claude, Gemini...';
      statusDot?.classList.remove('active');
    }
  }

  // Show upgrade section if not unlimited
  const upgradeSection = document.getElementById('upgrade-section');
  if (upgradeSection) {
    upgradeSection.style.display = status.plan !== 'unlimited' ? 'block' : 'none';
  }

  // Update free plan button on pricing if on free
  updatePricingCurrent(status.plan);

  showScreen('screen-main');
}

// ================================================================
// UPDATE PRICING SCREEN — mark current plan
// ================================================================
function updatePricingCurrent(currentPlan) {
  document.querySelectorAll('.btn-plan[data-plan]').forEach(btn => {
    if (btn.dataset.plan === currentPlan) {
      btn.textContent = 'Current Plan';
      btn.disabled    = true;
      btn.className   = 'btn-plan btn-plan-outline';
    }
  });
}

// ================================================================
// INIT
// ================================================================
async function init() {
  showScreen('screen-loading');

  // Check if user is logged in
  const session = await chrome.runtime.sendMessage({ action: 'get_session' });

  if (!session || !session.accessToken) {
    showScreen('screen-auth');
    return;
  }

  await loadDashboard();
}

// ================================================================
// EVENT LISTENERS
// ================================================================
document.addEventListener('DOMContentLoaded', () => {

  // Google Sign In
  document.getElementById('btn-google-login')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-google-login');
    if (btn) {
      btn.textContent = 'Signing in...';
      btn.disabled    = true;
    }

    const result = await chrome.runtime.sendMessage({ action: 'sign_in' });

    if (result?.success) {
      await loadDashboard();
    } else {
      if (btn) {
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
          </svg>
          Continue with Google`;
        btn.disabled = false;
      }
      alert('Sign in failed. Please try again.');
    }
  });

  // Sign Out
  document.getElementById('btn-signout')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'sign_out' });
    showScreen('screen-auth');
  });

  // Open upgrade screen
  document.getElementById('btn-upgrade')?.addEventListener('click', () => {
    showScreen('screen-upgrade');
  });

  // Back from upgrade
  document.getElementById('btn-back-from-upgrade')?.addEventListener('click', () => {
    showScreen('screen-main');
  });

  // Plan purchase buttons
  document.querySelectorAll('.btn-plan[data-plan]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const plan = btn.dataset.plan;
      if (!plan) return;

      btn.textContent = 'Redirecting...';
      btn.disabled    = true;

      const result = await chrome.runtime.sendMessage({
        action: 'checkout',
        plan:   plan
      });

      if (!result?.success) {
        btn.textContent = `Get ${plan.charAt(0).toUpperCase() + plan.slice(1)}`;
        btn.disabled = false;
        alert('Could not open checkout. Please try again.');
      } else {
        // Close popup — Stripe opens in new tab
        window.close();
      }
    });
  });

  // Start init
  init();
});
