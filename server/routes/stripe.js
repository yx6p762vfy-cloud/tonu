const express = require('express');
const Stripe = require('stripe');
const db = require('../db');
const config = require('../config');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function getStripe() {
  if (!config.stripeSecretKey) return null;
  return new Stripe(config.stripeSecretKey);
}

function extendPremium(userId, untilDate) {
  db.prepare('UPDATE users SET premium_until = ? WHERE id = ?').run(untilDate.toISOString(), userId);
}

router.get('/config', (_req, res) => {
  res.json({
    configured: !!(config.stripeSecretKey && config.stripePriceId),
    priceDisplay: 'Abonnement mensuel',
  });
});

router.post('/create-checkout-session', authRequired, async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !config.stripePriceId) {
    return res.status(503).json({ error: 'Stripe non configuré (voir .env)' });
  }

  let customerId = req.user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: req.user.email,
      metadata: { userId: req.user.id },
    });
    customerId = customer.id;
    db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, req.user.id);
  }

  const redirect = (req.body.redirect || '/premium.html?success=1').replace(/^\//, '');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: config.stripePriceId, quantity: 1 }],
    success_url: `${config.baseUrl}/${redirect}${redirect.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/premium.html?canceled=1`,
    metadata: { userId: req.user.id },
    subscription_data: {
      metadata: { userId: req.user.id },
    },
  });

  res.json({ url: session.url, sessionId: session.id });
});

router.get('/session-status', authRequired, async (req, res) => {
  const stripe = getStripe();
  const sessionId = req.query.session_id;
  if (!stripe || !sessionId) {
    return res.status(400).json({ error: 'session_id requis' });
  }
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.userId !== req.user.id) {
    return res.status(403).json({ error: 'Session invalide' });
  }
  res.json({
    status: session.status,
    paymentStatus: session.payment_status,
  });
});

async function handleSubscription(subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;
  const periodEnd = new Date(subscription.current_period_end * 1000);
  db.prepare('UPDATE users SET stripe_subscription_id = ?, premium_until = ? WHERE id = ?').run(
    subscription.id,
    periodEnd.toISOString(),
    userId
  );
}

function stripeWebhookHandler(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(503).send('Stripe not configured');

  let event;
  try {
    if (config.stripeWebhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripeWebhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
      console.warn('[stripe] Webhook sans STRIPE_WEBHOOK_SECRET — dev seulement');
    }
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const seen = db.prepare('SELECT id FROM stripe_events WHERE id = ?').get(event.id);
  if (seen) return res.json({ received: true, duplicate: true });
  db.prepare('INSERT INTO stripe_events (id, type) VALUES (?, ?)').run(event.id, event.type);

  (async () => {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await handleSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await handleSubscription(event.data.object);
        break;
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (userId) {
          db.prepare(
            `UPDATE users SET premium_until = datetime('now'), stripe_subscription_id = NULL WHERE id = ?`
          ).run(userId);
        }
        break;
      }
      default:
        break;
    }
  })()
    .then(() => res.json({ received: true }))
    .catch((e) => {
      console.error('[stripe webhook]', e);
      res.status(500).json({ error: 'Webhook handler failed' });
    });
}

module.exports = { router, stripeWebhookHandler };
