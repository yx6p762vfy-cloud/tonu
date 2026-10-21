const express = require('express');
const db = require('../db');
const config = require('../config');
const { authRequired, userHasPremium } = require('../middleware/auth');
const { checkoutLimiter } = require('../middleware/limiters');
const validation = require('../lib/validation');
const {
  getStripe,
  stripeConfigured,
  subscriptionPeriodEnd,
  subscriptionGrantsAccess,
} = require('../lib/stripe');

const router = express.Router();

const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

let priceCache = { at: 0, data: null };

async function getPriceInfo() {
  if (!stripeConfigured()) return null;
  if (priceCache.data && Date.now() - priceCache.at < 60_000) return priceCache.data;

  const stripe = getStripe();
  const price = await stripe.prices.retrieve(config.stripePriceId, { expand: ['product'] });
  const zeroDecimal = ZERO_DECIMAL_CURRENCIES.has(price.currency);
  const amount = zeroDecimal ? price.unit_amount : price.unit_amount / 100;
  const currency = price.currency.toUpperCase();
  let formatted;
  try {
    formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
  } catch {
    formatted = `${amount} ${currency}`;
  }
  const INTERVAL_LABELS = { day: 'jour', week: 'semaine', month: 'mois', year: 'an' };
  const INTERVAL_PLURALS = { day: 'jours', week: 'semaines', month: 'mois', year: 'ans' };
  const interval = price.recurring?.interval || null;
  const intervalCount = price.recurring?.interval_count || null;
  const intervalLabel = interval
    ? intervalCount > 1
      ? `${intervalCount} ${INTERVAL_PLURALS[interval]}`
      : INTERVAL_LABELS[interval]
    : null;
  const period = intervalLabel ? ` / ${intervalLabel}` : '';

  const data = {
    amount,
    currency,
    interval,
    intervalCount,
    intervalLabel,
    productName: typeof price.product === 'object' ? price.product.name : null,
    priceLabel: formatted,
    label: `${formatted}${period}`,
  };
  priceCache = { at: Date.now(), data };
  return data;
}

router.get('/config', async (_req, res) => {
  try {
    const price = await getPriceInfo();
    res.json({ configured: stripeConfigured(), price });
  } catch (err) {
    console.error('[stripe] Lecture du prix impossible :', err.message);
    res.json({
      configured: stripeConfigured(),
      price: null,
      error: 'Tarif Stripe indisponible pour le moment',
    });
  }
});

router.post('/create-checkout-session', authRequired, checkoutLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !config.stripePriceId) {
    return res.status(503).json({ error: 'Stripe n’est pas encore configuré sur le serveur' });
  }
  if (userHasPremium(req.user)) {
    return res.status(409).json({ error: 'Votre abonnement Premium est déjà actif' });
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
      db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, req.user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: req.user.id,
      line_items: [{ price: config.stripePriceId, quantity: 1 }],
      success_url: `${config.baseUrl}/premium.html?success=1&redirect=${encodeURIComponent(target)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.baseUrl}/premium.html?canceled=1`,
      metadata: { userId: req.user.id },
      subscription_data: { metadata: { userId: req.user.id } },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[stripe] Checkout impossible :', err.message);
    res.status(502).json({ error: 'Impossible d’ouvrir le paiement Stripe. Réessayez.' });
  }
});

router.post('/portal', authRequired, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe n’est pas configuré' });
  if (!req.user.stripe_customer_id) {
    return res.status(400).json({ error: 'Aucun abonnement Stripe associé à ce compte' });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripe_customer_id,
      return_url: `${config.baseUrl}/compte.html`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] Portail client impossible :', err.message);
    res.status(502).json({ error: 'Portail Stripe indisponible. Activez-le dans votre dashboard Stripe.' });
  }
});

router.get('/session-status', authRequired, async (req, res) => {
  const stripe = getStripe();
  const sessionId = validation.text(req.query.session_id, 200);
  if (!stripe || !sessionId) return res.status(400).json({ error: 'session_id requis' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
    const owner = session.metadata?.userId || session.client_reference_id;
    if (owner !== req.user.id) return res.status(403).json({ error: 'Session invalide' });

    res.json({
      status: session.status,
      paymentStatus: session.payment_status,
      subscriptionStatus: typeof session.subscription === 'object'
        ? session.subscription?.status
        : null,
    });
  } catch (err) {
    console.error('[stripe] Statut session impossible :', err.message);
    res.status(502).json({ error: 'Session Stripe introuvable' });
  }
});

function findUserForSubscription(subscription) {
  const userId = subscription.metadata?.userId;
  if (userId) return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;
  if (!customerId) return null;
  return db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(customerId);
}

function applySubscription(subscription) {
  const user = findUserForSubscription(subscription);
  if (!user) {
    console.warn('[stripe] Abonnement sans utilisateur rattaché :', subscription.id);
    return;
  }

  if (subscriptionGrantsAccess(subscription)) {
    const periodEnd = subscriptionPeriodEnd(subscription)
      || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    db.prepare(
      'UPDATE users SET premium_until = ?, stripe_subscription_id = ? WHERE id = ?'
    ).run(periodEnd.toISOString(), subscription.id, user.id);
  } else {
    db.prepare(
      `UPDATE users SET premium_until = datetime('now'),
       stripe_subscription_id = CASE WHEN stripe_subscription_id = ? THEN NULL ELSE stripe_subscription_id END
       WHERE id = ?`
    ).run(subscription.id, user.id);
  }
}

function revokeSubscription(subscription) {
  const user = findUserForSubscription(subscription);
  if (!user) return;
  db.prepare(
    `UPDATE users SET premium_until = datetime('now'),
     stripe_subscription_id = CASE WHEN stripe_subscription_id = ? THEN NULL ELSE stripe_subscription_id END
     WHERE id = ?`
  ).run(subscription.id, user.id);
}

function stripeWebhookHandler(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(503).send('Stripe non configuré');

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
      console.warn('[stripe] Webhook non signé accepté (développement uniquement)');
    }
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const seen = db.prepare('SELECT id FROM stripe_events WHERE id = ?').get(event.id);
  if (seen) return res.json({ received: true, duplicate: true });

  (async () => {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          applySubscription(sub);
          const userId = session.metadata?.userId || session.client_reference_id;
          if (userId && session.customer) {
            const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
            db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, userId);
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        applySubscription(event.data.object);
        break;
      case 'customer.subscription.deleted':
        revokeSubscription(event.data.object);
        break;
      default:
        break;
    }

    db.prepare('INSERT OR IGNORE INTO stripe_events (id, type) VALUES (?, ?)').run(
      event.id,
      event.type
    );
  })()
    .then(() => res.json({ received: true }))
    .catch((err) => {
      console.error('[stripe webhook]', err);
      res.status(500).json({ error: 'Webhook handler failed' });
    });
}

module.exports = { router, stripeWebhookHandler };
