const express = require('express');
const path = require('path');
const helmet = require('helmet');
const config = require('./config');
const authRoutes = require('./routes/auth');
const annoncesRoutes = require('./routes/annonces');
const adminRoutes = require('./routes/admin');
const commentsRoutes = require('./routes/comments');
const reportsRoutes = require('./routes/reports');
const publicRoutes = require('./routes/public');
const { router: stripeRoutes, stripeWebhookHandler } = require('./routes/stripe');
const { apiLimiter } = require('./middleware/limiters');

const app = express();

app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', ...(config.supabaseUrl ? [config.supabaseUrl] : [])],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
  })
);
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  stripeWebhookHandler
);

app.use('/api', apiLimiter, express.json({ limit: '256kb' }), express.urlencoded({ extended: false, limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'tonu-prive-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/annonces', annoncesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api', publicRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route API introuvable' });
});

app.use(
  express.static(config.publicDir, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (!config.isProduction) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.(css|js)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else if (/\.(jpe?g|png|webp|svg|ico)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
    },
  })
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route introuvable' });
  }
  res.status(404).sendFile(path.join(config.publicDir, '404.html'), (err) => {
    if (err) res.status(404).type('text/plain').send('Page introuvable');
  });
});

app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Requête trop volumineuse' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  console.error('[server]', err);
  res.status(500).json({ error: 'Erreur serveur' });
});

module.exports = app;
