const Stripe = require('stripe');
const config = require('../config');
const plans = require('./plans');

let client = null;

function getStripe() {
  if (!config.stripeSecretKey) return null;
  if (!client) client = new Stripe(config.stripeSecretKey);
  return client;
}

function stripeConfigured() {
  return !!(config.stripeSecretKey && plans.list().some((plan) => plan.priceId));
}

module.exports = { getStripe, stripeConfigured };
