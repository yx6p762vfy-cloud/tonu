require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const jwtSecret = process.env.JWT_SECRET || '';
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const config = {
  nodeEnv,
  isProduction,
  port: int(process.env.PORT, 3000),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  jwtSecret: jwtSecret || 'dev-only-change-in-production',
  jwtExpiresIn: '7d',
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  databaseUrl: (process.env.DATABASE_URL || '').trim(),
  supabaseUrl,
  supabaseServiceKey,
  storageBucket: (process.env.SUPABASE_BUCKET || 'photos').trim(),
  stripeSecretKey,
  stripeWebhookSecret,
  stripePricePremium: process.env.STRIPE_PRICE_PREMIUM || '',
  stripePriceGolden: process.env.STRIPE_PRICE_GOLDEN || '',
  stripePriceElite: process.env.STRIPE_PRICE_ELITE || '',
  supportEmail: (process.env.SUPPORT_EMAIL || 'contact@example.com').trim(),
  rootDir: require('path').join(__dirname, '..'),
  publicDir: require('path').join(__dirname, '..', 'public'),
  minAge: 18,
  maxPhotos: 3,
  maxUploadBytes: int(process.env.MAX_UPLOAD_BYTES, 8 * 1024 * 1024),
  maxAdsPerUser: int(process.env.MAX_ADS_PER_USER, 10),
  seedDemo: bool(process.env.SEED_DEMO, !isProduction),
  termsVersion: process.env.TERMS_VERSION || '1.0',
  termsUpdatedAt: '2026-10-21',
  allowedRedirects: ['publier.html', 'premium.html', 'compte.html', 'product.html'],
};

function storageConfigured() {
  return !!(config.supabaseUrl && config.supabaseServiceKey && config.storageBucket);
}

function assertConfig() {
  if (!isProduction) return;
  if (!jwtSecret || jwtSecret === 'dev-only-change-in-production' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET manquant ou trop faible (32 caractères minimum en production).');
  }
  if (!/^https:\/\//i.test(config.baseUrl)) {
    throw new Error('BASE_URL doit être une URL HTTPS en production (ex: https://votre-domaine.com).');
  }
  if (stripeSecretKey && !stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET est requis en production dès que Stripe est activé.');
  }
  if (config.adminPassword && config.adminPassword === 'ChangeMeAdmin123!') {
    throw new Error('ADMIN_PASSWORD utilise encore la valeur par défaut.');
  }
  if (config.adminEmail && config.adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD doit contenir au moins 12 caractères en production.');
  }
  if (config.adminPassword && !config.adminEmail) {
    throw new Error('ADMIN_EMAIL est requis lorsque ADMIN_PASSWORD est défini.');
  }
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL est requis en production (chaîne de connexion Postgres Supabase).');
  }
  if (!/^https:\/\//i.test(config.supabaseUrl)) {
    throw new Error('SUPABASE_URL doit être une URL HTTPS en production.');
  }
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY est requis en production (stockage des photos).');
  }
}

module.exports = config;
module.exports.storageConfigured = storageConfigured;
module.exports.assertConfig = assertConfig;
