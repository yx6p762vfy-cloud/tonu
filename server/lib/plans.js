const config = require('../config');

const PLANS = [
  {
    key: 'premium',
    name: 'Premium',
    priceLabel: '20 $',
    durationDays: 14,
    durationLabel: '2 semaines',
    priority: 0,
    recommended: false,
    tagline: 'Pour découvrir la publication.',
    priceId: config.stripePricePremium,
  },
  {
    key: 'golden',
    name: 'Golden',
    priceLabel: '30 $',
    durationDays: 30,
    durationLabel: '1 mois',
    priority: 1,
    recommended: true,
    tagline: 'Le meilleur équilibre durée / visibilité.',
    priceId: config.stripePriceGolden,
  },
  {
    key: 'elite',
    name: 'Elite',
    priceLabel: '40 $',
    durationDays: 60,
    durationLabel: '2 mois',
    priority: 2,
    recommended: false,
    tagline: 'Vos annonces passent devant toutes les autres.',
    priceId: config.stripePriceElite,
  },
];

function list() {
  return PLANS;
}

function findPlan(key) {
  return PLANS.find((plan) => plan.key === key) || null;
}

function publicPlan(plan) {
  return {
    key: plan.key,
    name: plan.name,
    priceLabel: plan.priceLabel,
    durationDays: plan.durationDays,
    durationLabel: plan.durationLabel,
    priority: plan.priority,
    recommended: plan.recommended,
    tagline: plan.tagline,
    available: !!(config.stripeSecretKey && plan.priceId),
  };
}

function publicList() {
  return PLANS.map(publicPlan);
}

function normalizedPlan(key) {
  return findPlan(key)?.key || null;
}

function planLabel(key) {
  return findPlan(key)?.name || null;
}

module.exports = { list, findPlan, publicPlan, publicList, normalizedPlan, planLabel };
