// ================================================================
// PromptCraft — Content Script
// Injects "Optimize" button into LLM text boxes
// Supports: ChatGPT, Claude, Gemini, Perplexity, Grok, Copilot
// ================================================================

// Platform detection configs
const PLATFORMS = {
  'chatgpt.com': {
    textareaSelector:   '#prompt-textarea',
    buttonAreaSelector: '[data-testid="send-button"]',
    isContentEditable:  true,
    insertPosition:     'before' // insert our button before send button
  },
  'chat.openai.com': {
    textareaSelector:   '#prompt-textarea',
    buttonAreaSelector: '[data-testid="send-button"]',
    isContentEditable:  true,
    insertPosition:     'before'
  },
  'claude.ai': {
    textareaSelector:   '[contenteditable="true"]',
    buttonAreaSelector: '[aria-label="Send message"]',
    isContentEditable:  true,
    insertPosition:     'before'
  },
  'gemini.google.com': {
    textareaSelector:   '.ql-editor, [contenteditable="true"]',
    buttonAreaSelector: '[aria-label="Send message"], .send-button',
    isContentEditable:  true,
    insertPosition:     'before'
  },
  'perplexity.ai': {
    textareaSelector:   'textarea',
    buttonAreaSelector: '[aria-label="Submit"]',
    isContentEditable:  false,
    insertPosition:     'before'
  },
  'www.perplexity.ai': {
    textareaSelector:   'textarea',
    buttonAreaSelector: '[aria-label="Submit"]',
    isContentEditable:  false,
    insertPosition:     'before'
  },
  'grok.x.com': {
    textareaSelector:   'textarea, [contenteditable="true"]',
    buttonAreaSelector: '[aria-label="Send"], button[type="submit"]',
    isContentEditable:  true,
    insertPosition:     'before'
  },
  'copilot.microsoft.com': {
    textareaSelector:   'textarea, [contenteditable="true"]',
    buttonAreaSelector: '[aria-label="Submit"]',
    isContentEditable:  true,
    insertPosition:     'before'
  }
};

// ================================================================
// GET TEXTAREA TEXT
// ================================================================
function getPromptText(element, isContentEditable) {
  if (isContentEditable) {
    return element.innerText || element.textContent || '';
  }
  return element.value || '';
}

// ================================================================
// SET TEXTAREA TEXT
// Works with React-powered textboxes (ChatGPT, Claude, etc.)
// ================================================================
function setPromptText(element, text, isContentEditable) {
  element.focus();

  if (isContentEditable) {
    // Select all existing text
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);

    // Replace with optimized text
    document.execCommand('insertText', false, text);

    // Fallback if execCommand doesn't work
    if (!element.innerText.includes(text.slice(0, 20))) {
      element.innerText = text;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    }
  } else {
    // Regular textarea — use React's native setter to trigger re-render
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(element, text);
    } else {
      element.value = text;
    }
    element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// ================================================================
// SHOW TOAST NOTIFICATION
// ================================================================
function showToast(message, type = 'success') {
  // Remove existing toast
  const existing = document.querySelector('.pc-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `pc-toast pc-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add('pc-toast--visible'), 10);

  // Remove after 3s
  setTimeout(() => {
    toast.classList.remove('pc-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ================================================================
// CREATE THE OPTIMIZE BUTTON
// ================================================================
function createOptimizeButton() {
  const btn = document.createElement('button');
  btn.className = 'pc-optimize-btn';
  btn.id = 'pc-optimize-btn';
  btn.setAttribute('type', 'button');
  btn.setAttribute('title', 'Optimize prompt with PromptCraft');

  btn.innerHTML = `
    <svg class="pc-btn-icon pc-icon-normal" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
    <svg class="pc-btn-icon pc-icon-loading" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 11-6.219-8.56"/>
    </svg>
    <svg class="pc-btn-icon pc-icon-done" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    <span class="pc-btn-text">Optimize</span>
  `;

  return btn;
}

// ================================================================
// HANDLE BUTTON CLICK
// ================================================================
async function handleOptimizeClick(btn, textarea, isContentEditable) {
  const prompt = getPromptText(textarea, isContentEditable).trim();

  if (!prompt) {
    showToast('Type a prompt first!', 'warning');
    return;
  }

  // Set loading state
  btn.classList.add('pc-loading');
  btn.disabled = true;

  // Send to background script to optimize
  const response = await chrome.runtime.sendMessage({
    action: 'optimize',
    prompt: prompt
  });

  btn.classList.remove('pc-loading');
  btn.disabled = false;

  if (response.success) {
    // Inject optimized prompt back into textbox
    setPromptText(textarea, response.optimized, isContentEditable);
    btn.classList.add('pc-done');
    showToast('Prompt optimized!', 'success');
    setTimeout(() => btn.classList.remove('pc-done'), 2500);

  } else if (response.error === 'not_logged_in') {
    showToast('Sign in to use PromptCraft', 'warning');
    chrome.runtime.sendMessage({ action: 'open_popup' });

  } else if (response.error === 'limit_reached') {
    showToast('Monthly limit reached — upgrade to continue', 'upgrade');
    // Open popup to show upgrade
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'open_popup' });
    }, 800);

  } else {
    showToast('Something went wrong. Try again.', 'error');
  }
}

// ================================================================
// INJECT BUTTON INTO PAGE
// ================================================================
function injectButton(hostname) {
  // Don't inject twice
  if (document.getElementById('pc-optimize-btn')) return;

  const config = PLATFORMS[hostname];
  if (!config) return;

  const textarea   = document.querySelector(config.textareaSelector);
  const sendButton = document.querySelector(config.buttonAreaSelector);

  if (!textarea || !sendButton) return;

  const btn = createOptimizeButton();

  // Insert before the send button
  sendButton.parentNode.insertBefore(btn, sendButton);

  // Click handler
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleOptimizeClick(btn, textarea, config.isContentEditable);
  });
}

// ================================================================
// WATCH FOR DOM CHANGES (SPA navigation — ChatGPT resets UI on new chat)
// ================================================================
function startObserver(hostname) {
  const observer = new MutationObserver(() => {
    if (!document.getElementById('pc-optimize-btn')) {
      injectButton(hostname);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree:   true
  });
}

// ================================================================
// INIT
// ================================================================
function init() {
  const hostname = window.location.hostname;
  const platform = Object.keys(PLATFORMS).find(p => hostname.includes(p));

  if (!platform) return;

  // Try injecting now
  injectButton(platform);

  // Keep trying as page loads (SPAs are slow)
  const retryInterval = setInterval(() => {
    if (document.getElementById('pc-optimize-btn')) {
      clearInterval(retryInterval);
    } else {
      injectButton(platform);
    }
  }, 1000);

  // Stop retrying after 30 seconds
  setTimeout(() => clearInterval(retryInterval), 30000);

  // Watch for SPA navigation
  startObserver(platform);
}

// Run when page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
