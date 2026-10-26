const express = require('express');
const db = require('../db');
const config = require('../config');
const plans = require('../lib/plans');
const { authRequired } = require('../middleware/auth');
const { checkoutLimiter } = require('../middleware/limiters');
const { asyncHandler } = require('../lib/http');
const validation = require('../lib/validation');
const { getStripe, stripeConfigured } = require('../lib/stripe');

const router = express.Router();

const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

const priceCache = new Map();

async function getPlanPrice(plan) {
  const cached = priceCache.get(plan.key);
  if (cached && Date.now() - cached.at < 60_000) return cached.data;

  const stripe = getStripe();
  const price = await stripe.prices.retrieve(plan.priceId);
  const zeroDecimal = ZERO_DECIMAL_CURRENCIES.has(price.currency);
  const amount = zeroDecimal ? price.unit_amount : price.unit_amount / 100;
  const currency = price.currency.toUpperCase();
  let priceLabel;
  try {
    priceLabel = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
  } catch {
    priceLabel = `${amount} ${currency}`;
  }

  const data = { amount, currency, priceLabel };
  priceCache.set(plan.key, { at: Date.now(), data });
  return data;
}

router.get('/config', async (_req, res) => {
  const list = await Promise.all(
    plans.list().map(async (plan) => {
      const base = plans.publicPlan(plan);
      if (!base.available) return base;
      try {
        const price = await getPlanPrice(plan);
        return { ...base, priceLabel: price.priceLabel, amount: price.amount, currency: price.currency };
      } catch (err) {
        console.error(`[paiement] Tarif ${plan.key} illisible :`, err.message);
        return { ...base, available: false };
      }
    })
  );
  res.json({ configured: stripeConfigured(), plans: list });
});

router.post(
  '/create-checkout-session',
  authRequired,
  checkoutLimiter,
  asyncHandler(async (req, res) => {
    const stripe = getStripe();
    const plan = plans.findPlan(validation.text(req.body.plan, 20));
    if (!stripe || !plan || !plan.priceId) {
      return res.status(503).json({ error: 'Le paiement n’est pas encore disponible sur le site' });
    }

    const target = validation.checkoutRedirect(req.body.redirect);

    try {
      let customerId = req.user.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user.email,
          name: req.user.pseudo,
          metadata: { userId: req.user.id },
        });
        customerId = customer.id;
        await db.run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, req.user.id]);
      }

      const metadata = { userId: req.user.id, plan: plan.key };
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        client_reference_id: req.user.id,
        line_items: [{ price: plan.priceId, quantity: 1 }],
        payment_intent_data: { metadata },
        success_url: `${config.baseUrl}/premium.html?success=1&plan=${plan.key}&redirect=${encodeURIComponent(target)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.baseUrl}/premium.html?canceled=1`,
        metadata,
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err) {
      console.error('[paiement] Ouverture du paiement impossible :', err.message);
      res.status(502).json({ error: 'Impossible d’ouvrir le paiement. Réessayez.' });
    }
  })
);

router.get(
  '/session-status',
  authRequired,
  asyncHandler(async (req, res) => {
    const stripe = getStripe();
    const sessionId = validation.text(req.query.session_id, 200);
    if (!stripe || !sessionId) return res.status(400).json({ error: 'session_id requis' });

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const owner = session.metadata?.userId || session.client_reference_id;
      if (owner !== req.user.id) return res.status(403).json({ error: 'Session invalide' });

      res.json({
        status: session.status,
        paymentStatus: session.payment_status,
        plan: session.metadata?.plan || null,
      });
    } catch (err) {
      console.error('[paiement] Statut de session illisible :', err.message);
      res.status(502).json({ error: 'Paiement introuvable' });
    }
  })
);

async function grantPlan(userId, planKey) {
  const plan = plans.findPlan(planKey);
  if (!plan) {
    console.warn('[paiement] Offre inconnue :', planKey);
    return;
  }
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    console.warn('[paiement] Achat sans utilisateur rattaché :', userId);
    return;
  }

  const now = Date.now();
  const currentEnd = user.premium_until ? new Date(user.premium_until).getTime() : 0;
  const base = Math.max(now, currentEnd);
  const until = new Date(base + plan.durationDays * 24 * 60 * 60 * 1000);
  const currentPlan = currentEnd > now ? plans.findPlan(user.plan) : null;
  const keepCurrent = currentPlan && currentPlan.priority > plan.priority;
  const nextPlan = keepCurrent ? currentPlan.key : plan.key;

  await db.run('UPDATE users SET plan = ?, premium_until = ? WHERE id = ?', [
    nextPlan,
    until.toISOString(),
    user.id,
  ]);
}

async function applyCheckoutSession(session) {
  if (session.payment_status !== 'paid') return;
  const userId = session.metadata?.userId || session.client_reference_id;
  if (!userId) return;
  await grantPlan(userId, session.metadata?.plan);

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (customerId) {
    await db.run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, userId]);
  }
}

function stripeWebhookHandler(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(503).send('Paiement non configuré');

  let event;
  try {
    if (config.stripeWebhookSecret) {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        config.stripeWebhookSecret
      );
    } else if (config.isProduction) {
      return res.status(503).send('Webhook secret manquant');
    } else {
      event = JSON.parse(req.body.toString());
      console.warn('[paiement] Webhook non signé accepté (développement uniquement)');
    }
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  (async () => {
    const claimed = await db.get(
      'INSERT INTO stripe_events (id, type) VALUES (?, ?) ON CONFLICT (id) DO NOTHING RETURNING id',
      [event.id, event.type]
    );
    if (!claimed) return { duplicate: true };

    try {
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        await applyCheckoutSession(event.data.object);
      }
    } catch (err) {
      await db.run('DELETE FROM stripe_events WHERE id = ?', [event.id]);
      throw err;
    }
    return {};
  })()
    .then(({ duplicate }) => res.json({ received: true, duplicate: !!duplicate }))
    .catch((err) => {
      console.error('[paiement webhook]', err);
      res.status(500).json({ error: 'Webhook handler failed' });
    });
}

module.exports = { router, stripeWebhookHandler, grantPlan };
