require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-in-production',
  jwtExpiresIn: '7d',
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePriceId: process.env.STRIPE_PRICE_ID || '',
  rootDir: path.join(__dirname, '..'),
  dataDir: path.join(__dirname, '..', 'data'),
  uploadsDir: path.join(__dirname, '..', 'uploads'),
  minAge: 18,
  maxUploadBytes: 5 * 1024 * 1024,
};
