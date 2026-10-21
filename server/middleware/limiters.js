const { rateLimit } = require('express-rate-limit');

function limiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: message },
  });
}

module.exports = {
  apiLimiter: limiter({
    windowMs: 15 * 60 * 1000,
    limit: 1500,
    message: 'Trop de requêtes. Réessayez dans quelques minutes.',
  }),
  authLimiter: limiter({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: 'Trop de tentatives. Réessayez dans 15 minutes.',
  }),
  commentLimiter: limiter({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    message: 'Trop de commentaires envoyés. Patientez un instant.',
  }),
  reportLimiter: limiter({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    message: 'Trop de signalements envoyés. Réessayez plus tard.',
  }),
  publishLimiter: limiter({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    message: 'Trop de publications. Réessayez plus tard.',
  }),
  checkoutLimiter: limiter({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    message: 'Trop de tentatives de paiement. Réessayez plus tard.',
  }),
};
