const config = require('./config');
const app = require('./app');
const db = require('./db');

config.assertConfig();

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
  const hasAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!hasAdmin) {
    console.warn('[config] Aucun compte administrateur en base — lancez npm run admin:create');
  }
  if (config.supportEmail === 'contact@example.com') {
    console.warn('[config] SUPPORT_EMAIL utilise encore la valeur par défaut');
  }
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} reçu — arrêt en cours`);
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  server.close(() => {
    try {
      db.close();
    } catch (err) {
      console.error('[server] Fermeture DB :', err.message);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = server;
