# PromptCraft — Complete Setup Guide
## From Zero to Live in ~30 Minutes

---

## WHAT YOU'VE BUILT
- Chrome extension that injects an "Optimize" button on ChatGPT, Claude, Gemini, etc.
- Backend server that handles AI calls, authentication, usage tracking, and payments
- 3 paid plans + free tier with rate limiting
- Google Sign-In for users
- Stripe payments (Card, UPI, etc.)

---

## STEP 1 — Set Up Supabase Database

1. Go to https://supabase.com and open your project
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"
4. Open the file `supabase/schema.sql` from this project
5. Copy ALL the text and paste it into the SQL editor
6. Click "RUN"
7. You should see "Success. No rows returned"

**Enable Google OAuth in Supabase:**
1. In Supabase dashboard → Authentication → Providers
2. Find "Google" and click it
3. Toggle it ON
4. You'll need a Google Client ID and Secret (Step 2 below)
5. Add this to "Redirect URLs": `https://*.chromiumapp.org/**`

---

## STEP 2 — Google OAuth Setup (for Sign In with Google)

1. Go to https://console.cloud.google.com
2. Create a new project (name it "PromptCraft")
3. Go to "APIs & Services" → "Credentials"
4. Click "Create Credentials" → "OAuth Client ID"
5. Application type: "Chrome Extension"
6. Name: "PromptCraft"
7. Copy your extension ID from Chrome (after loading it — Step 5 first)
8. Get Client ID and Secret
9. Paste Client ID and Secret into Supabase Google provider settings
10. Also paste Client ID into `extension/manifest.json` where it says:
    `"client_id": "PASTE_YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE"`

---

## STEP 3 — Set Up Stripe Products

1. Go to https://dashboard.stripe.com
2. Click "Products" → "Add Product"

**Create 3 products:**

**Product 1 — Starter**
- Name: "PromptCraft Starter"
- Price: $4.99 / month (recurring)
- Copy the Price ID (starts with `price_...`)

**Product 2 — Pro**
- Name: "PromptCraft Pro"
- Price: $12.99 / month (recurring)
- Copy the Price ID

**Product 3 — Unlimited**
- Name: "PromptCraft Unlimited"
- Price: $24.99 / month (recurring)
- Copy the Price ID

4. Paste the 3 Price IDs into `backend/server.js`:
```
const STRIPE_PRICES = {
  starter:   'price_XXXXX',   // paste your starter price ID
  pro:       'price_XXXXX',   // paste your pro price ID
  unlimited: 'price_XXXXX'    // paste your unlimited price ID
};
```

---

## STEP 4 — Get Your Anthropic API Key

1. Go to https://platform.anthropic.com
2. Sign up / sign in
3. Go to "API Keys"
4. Create a new key
5. Copy it (starts with `sk-ant-...`)
6. Add funds to your account ($5-10 is plenty to start)

---

## STEP 5 — Fill In Credentials in Backend

Open `backend/server.js` and fill in these 5 values:

```javascript
const ANTHROPIC_API_KEY    = 'sk-ant-...';           // from Step 4
const SUPABASE_SERVICE_KEY = 'eyJ...';               // NEW rotated key from Supabase
const STRIPE_SECRET_KEY    = 'sk_live_...';          // NEW rotated key from Stripe
const STRIPE_WEBHOOK_SECRET = 'whsec_...';           // from Step 6 below
```

(SUPABASE_URL is already filled with your project URL)

---

## STEP 6 — Deploy Backend to Railway

1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Connect your GitHub account
4. Create a new repository called "promptcraft-backend"
5. Upload ONLY the `backend/` folder contents to that repo
6. Railway will auto-detect and deploy

**After deployment:**
- Copy your Railway URL (looks like: `https://promptcraft-backend.up.railway.app`)
- Paste it into `extension/background.js`:
  ```
  const BACKEND_URL = 'https://your-actual-url.up.railway.app';
  ```

**Set up Stripe Webhook:**
1. In Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. URL: `https://your-railway-url.up.railway.app/api/webhook`
4. Events to listen: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
5. Copy the "Signing secret" (starts with `whsec_...`)
6. Paste into `backend/server.js` as `STRIPE_WEBHOOK_SECRET`
7. Redeploy

---

## STEP 7 — Load Extension in Chrome

1. Open Chrome → go to `chrome://extensions`
2. Turn ON "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `extension/` folder from this project
5. Extension appears in your toolbar — pin it!
6. Copy your Extension ID (shown on the extensions page)
7. Go back to Step 2 and add this ID to Google OAuth settings

---

## STEP 8 — Test Everything

1. Click the PromptCraft icon in Chrome toolbar
2. Click "Continue with Google" — you should sign in
3. Go to https://chatgpt.com
4. Type a rough prompt like: "write me email"
5. You should see the ⚡ Optimize button next to the send button
6. Click it — your prompt should transform!
7. Test the limit: free users get 15/month
8. Test payment: click upgrade → choose a plan → Stripe checkout opens

---

## STEP 9 — Publish to Chrome Web Store

1. Go to https://chrome.google.com/webstore/devconsole
2. Pay one-time $5 developer fee
3. Create a ZIP of the entire `extension/` folder
4. Upload as new extension
5. Fill in description, screenshots, privacy policy
6. Submit for review (takes 3-7 days)

---

## CREDENTIALS CHECKLIST

| What | Where to paste |
|------|---------------|
| Anthropic API Key | `backend/server.js` line 14 |
| Supabase NEW Service Key | `backend/server.js` line 16 |
| Stripe NEW Secret Key | `backend/server.js` line 17 |
| Stripe Webhook Secret | `backend/server.js` line 18 |
| Stripe Price ID (Starter) | `backend/server.js` line 26 |
| Stripe Price ID (Pro) | `backend/server.js` line 27 |
| Stripe Price ID (Unlimited) | `backend/server.js` line 28 |
| Railway URL | `extension/background.js` line 6 |
| Google OAuth Client ID | `extension/manifest.json` line 44 |

---

## COST ESTIMATE (per month)

| Item | Cost |
|------|------|
| Railway backend | Free (500 hrs/mo) |
| Supabase database | Free (up to 50K users) |
| Claude Haiku per optimization | ~$0.001 |
| 1000 optimizations total | ~$1.00 AI cost |
| Stripe fees | 2.9% + 30¢ per transaction |

**Revenue if 100 Pro subscribers:** $1,299/month
**AI cost for 100 Pro users (750 calls each):** ~$75
**Net:** ~$1,224/month

---

## NEED HELP?

If anything breaks, check:
1. Railway logs (in your Railway project → "Deployments" → "View logs")
2. Chrome extension errors (go to chrome://extensions → click "Errors" on your extension)
3. Supabase logs (in Supabase dashboard → "Logs")
