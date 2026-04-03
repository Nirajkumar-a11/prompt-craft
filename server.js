const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const app = express();

// Stripe webhook needs raw body — must be before express.json()
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(cors({ origin: '*' }));

// ================================================================
// 🔑 CREDENTIALS — YOU WILL FILL THESE IN
// ================================================================
const ANTHROPIC_API_KEY   = 'PASTE_YOUR_ANTHROPIC_KEY_HERE';
const SUPABASE_URL        = 'https://aafxffnrjgumvrhewusj.supabase.co';
const SUPABASE_SERVICE_KEY = 'PASTE_YOUR_NEW_SUPABASE_SERVICE_ROLE_KEY_HERE';
const STRIPE_SECRET_KEY   = 'PASTE_YOUR_NEW_STRIPE_SECRET_KEY_HERE';
const STRIPE_WEBHOOK_SECRET = 'PASTE_YOUR_STRIPE_WEBHOOK_SECRET_HERE';
const PORT = process.env.PORT || 3000;

// ================================================================
// 💳 STRIPE PRICE IDs — Fill after creating products in Stripe
// ================================================================
const STRIPE_PRICES = {
  starter:   'PASTE_STARTER_PRICE_ID_HERE',   // $4.99/mo
  pro:       'PASTE_PRO_PRICE_ID_HERE',        // $12.99/mo
  unlimited: 'PASTE_UNLIMITED_PRICE_ID_HERE'  // $24.99/mo
};

// ================================================================
// 📊 PLAN LIMITS
// ================================================================
const PLAN_LIMITS = {
  free:      15,
  starter:   200,
  pro:       750,
  unlimited: 999999
};

// ================================================================
// 🤖 SYSTEM PROMPT — The core engine that transforms prompts
// ================================================================
const SYSTEM_PROMPT = `You are an elite prompt engineer with 10+ years of experience crafting prompts that extract maximum performance from AI language models.

Your task: Transform the user's rough, unstructured input into a masterfully crafted, expert-level prompt.

Apply these principles:
1. Add a clear role or persona at the start when it improves output quality (e.g. "You are an expert...")
2. Break complex requests into clear numbered steps or requirements
3. Specify the desired output format, length, or structure when it helps
4. Eliminate vague words — replace them with precise, specific instructions
5. Add relevant constraints and edge cases the user may not have thought of
6. Include examples inline only when they would dramatically improve AI understanding
7. Make the intent 100% unambiguous

CRITICAL OUTPUT RULE: Return ONLY the optimized prompt text. 
- No explanations
- No "Here is your optimized prompt:" 
- No preamble or postscript
- Just the raw, ready-to-use prompt`;

// ================================================================
// CLIENTS
// ================================================================
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabase  = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const stripe    = new Stripe(STRIPE_SECRET_KEY);

// ================================================================
// HELPER — Verify user token from extension
// ================================================================
async function verifyUser(token) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ================================================================
// GET USER PROFILE + USAGE
// ================================================================
async function getUserData(userId) {
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('usage').select('count').eq('user_id', userId).eq('month', currentMonth).single()
  ]);

  const plan  = profile?.plan || 'free';
  const count = usage?.count  || 0;
  const limit = PLAN_LIMITS[plan];

  return { profile, plan, count, limit, currentMonth };
}

// ================================================================
// ROUTE: Health check
// ================================================================
app.get('/', (req, res) => {
  res.json({ status: 'PromptCraft API running', version: '1.0.0' });
});

// ================================================================
// ROUTE: Optimize a prompt
// ================================================================
app.post('/api/optimize', async (req, res) => {
  try {
    const { token, prompt } = req.body;

    if (!token || !prompt?.trim()) {
      return res.status(400).json({ error: 'Missing token or prompt' });
    }

    // Auth check
    const user = await verifyUser(token);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    // Usage check
    const { plan, count, limit, currentMonth } = await getUserData(user.id);

    if (count >= limit) {
      return res.status(429).json({
        error:   'limit_reached',
        plan,
        count,
        limit
      });
    }

    // Call Claude Haiku — fast and cost-effective
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: `Optimize this prompt:\n\n${prompt}` }]
    });

    const optimized = response.content[0].text.trim();

    // Increment usage count in DB
    await supabase.rpc('increment_usage', {
      p_user_id: user.id,
      p_month:   currentMonth
    });

    res.json({
      optimized,
      usage: { count: count + 1, limit, plan }
    });

  } catch (err) {
    console.error('Optimize error:', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// ================================================================
// ROUTE: Get user status (plan, usage, profile)
// ================================================================
app.post('/api/status', async (req, res) => {
  try {
    const { token } = req.body;
    const user = await verifyUser(token);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { profile, plan, count, limit } = await getUserData(user.id);

    res.json({
      plan,
      count,
      limit,
      user: {
        email:      profile?.email      || user.email,
        full_name:  profile?.full_name  || '',
        avatar_url: profile?.avatar_url || ''
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

// ================================================================
// ROUTE: Create Stripe checkout session
// ================================================================
app.post('/api/checkout', async (req, res) => {
  try {
    const { token, plan } = req.body;
    if (!STRIPE_PRICES[plan]) return res.status(400).json({ error: 'Invalid plan' });

    const user = await verifyUser(token);
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { profile } = await getUserData(user.id);

    // Get or create Stripe customer
    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    profile?.email || user.email,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;
      await supabase.from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ['card'],
      line_items:           [{ price: STRIPE_PRICES[plan], quantity: 1 }],
      mode:                 'subscription',
      success_url:          'https://promptcraft.app/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:           'https://promptcraft.app/cancel',
      allow_promotion_codes: true,
      metadata:             { user_id: user.id, plan }
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ================================================================
// ROUTE: Stripe webhook — handles subscription events
// ================================================================
app.post('/api/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Stripe event:', event.type);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId  = session.metadata.user_id;
      const plan    = session.metadata.plan;
      if (userId) {
        await supabase.from('profiles').update({
          plan,
          stripe_subscription_id: session.subscription,
          subscription_status:    'active'
        }).eq('id', userId);
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      // Renewal — keep subscription active
      const invoice = event.data.object;
      await supabase.from('profiles')
        .update({ subscription_status: 'active' })
        .eq('stripe_subscription_id', invoice.subscription);
      break;
    }

    case 'customer.subscription.deleted':
    case 'invoice.payment_failed': {
      const sub = event.data.object;
      await supabase.from('profiles')
        .update({ plan: 'free', subscription_status: 'inactive' })
        .eq('stripe_subscription_id', sub.id || sub.subscription);
      break;
    }
  }

  res.json({ received: true });
});

// ================================================================
// START SERVER
// ================================================================
app.listen(PORT, () => {
  console.log(`PromptCraft backend running on port ${PORT}`);
});
