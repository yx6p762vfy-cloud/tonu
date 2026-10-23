const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { asyncHandler } = require('../lib/http');

async function getUserById(id) {
  return db.get('SELECT * FROM users WHERE id = ?', [id]);
}

async function readUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return (await getUserById(payload.sub)) || null;
  } catch {
    return null;
  }
}

const authRequired = asyncHandler(async (req, res, next) => {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  const user = await readUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Session expirée ou invalide' });
  }
  if (user.banned) {
    return res.status(403).json({ error: 'Compte suspendu. Contactez le support.', code: 'banned' });
  }
  req.user = user;
  next();
});

const authOptional = asyncHandler(async (req, _res, next) => {
  const user = await readUser(req);
  req.user = user && !user.banned ? user : null;
  next();
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
}

function userHasPremium(user) {
  return !!user?.premium_until && new Date(user.premium_until) > new Date();
}

module.exports = { authRequired, authOptional, requireRole, userHasPremium, getUserById };
