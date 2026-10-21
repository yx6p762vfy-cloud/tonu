require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');

const rootDir = path.join(__dirname, '..');
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
  stripeSecretKey,
  stripeWebhookSecret,
  stripePriceId: process.env.STRIPE_PRICE_ID || '',
  supportEmail: (process.env.SUPPORT_EMAIL || 'contact@example.com').trim(),
  rootDir,
  publicDir: path.join(rootDir, 'public'),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(rootDir, 'data')),
  uploadsDir: path.resolve(process.env.UPLOADS_DIR || path.join(rootDir, 'uploads')),
  minAge: 18,
  maxPhotos: 3,
  maxUploadBytes: int(process.env.MAX_UPLOAD_BYTES, 8 * 1024 * 1024),
  maxAdsPerUser: int(process.env.MAX_ADS_PER_USER, 10),
  seedDemo: bool(process.env.SEED_DEMO, !isProduction),
  termsVersion: process.env.TERMS_VERSION || '1.0',
  termsUpdatedAt: '2026-10-21',
  allowedRedirects: ['publier.html', 'premium.html', 'compte.html', 'product.html'],
};

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
}

module.exports = config;
module.exports.assertConfig = assertConfig;
