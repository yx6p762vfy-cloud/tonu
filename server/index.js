const express = require('express');
const path = require('path');
const config = require('./config');
const authRoutes = require('./routes/auth');
const annoncesRoutes = require('./routes/annonces');
const adminRoutes = require('./routes/admin');
const { router: stripeRoutes, stripeWebhookHandler } = require('./routes/stripe');

const app = express();

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(config.uploadsDir));
app.use(express.static(config.rootDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'tonú-privé-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/annonces', annoncesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stripe', stripeRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

app.listen(config.port, () => {
  console.log(`tonú Privé → ${config.baseUrl}`);
  if (!config.stripeSecretKey) {
    console.warn('[config] STRIPE_SECRET_KEY manquant — paiements désactivés');
  }
});
