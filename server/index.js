const config = require('./config');
const db = require('./db');
const storage = require('./lib/storage');

async function start() {
  config.assertConfig();
  await db.init();
  await storage.ensureBucket().catch((err) => {
    console.warn('[storage] Bucket indisponible :', err.message);
  });

  const app = require('./app');
  const server = app.listen(config.port, () => {
    console.log(`[server] tonú Privé → ${config.baseUrl} (${config.nodeEnv})`);
    if (!config.stripeSecretKey || !config.stripePriceId) {
      console.warn('[config] Stripe non configuré — les paiements sont désactivés');
    }
    if (!config.stripeWebhookSecret) {
      console.warn('[config] STRIPE_WEBHOOK_SECRET manquant — webhooks non signés en développement');
    }
    if (!config.adminEmail || !config.adminPassword) {
      console.warn('[config] Aucun administrateur configuré (ADMIN_EMAIL / ADMIN_PASSWORD)');
    }
    if (!config.storageConfigured()) {
      console.warn('[config] Supabase Storage non configuré — la publication de photos échouera');
    }
    if (config.supportEmail === 'contact@example.com') {
      console.warn('[config] SUPPORT_EMAIL utilise encore la valeur par défaut');
    }
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} reçu — arrêt en cours`);
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    server.close(() => {
      db.close()
        .catch((err) => console.error('[server] Fermeture DB :', err.message))
        .finally(() => process.exit(0));
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

module.exports = start();
