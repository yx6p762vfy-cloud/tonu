const Stripe = require('stripe');
const config = require('../config');

let client = null;

function getStripe() {
  if (!config.stripeSecretKey) return null;
  if (!client) client = new Stripe(config.stripeSecretKey);
  return client;
}

function stripeConfigured() {
  return !!(config.stripeSecretKey && config.stripePriceId);
}

function subscriptionPeriodEnd(subscription) {
  const raw = subscription?.current_period_end
    || subscription?.items?.data?.[0]?.current_period_end;
  return raw ? new Date(raw * 1000) : null;
}

function subscriptionGrantsAccess(subscription) {
  return ['active', 'trialing', 'past_due'].includes(subscription?.status);
}

module.exports = { getStripe, stripeConfigured, subscriptionPeriodEnd, subscriptionGrantsAccess };
