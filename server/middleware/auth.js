const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function readUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return getUserById(payload.sub) || null;
  } catch {
    return null;
  }
}

function authRequired(req, res, next) {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  const user = readUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Session expirée ou invalide' });
  }
  if (user.banned) {
    return res.status(403).json({ error: 'Compte suspendu. Contactez le support.', code: 'banned' });
  }
  req.user = user;
  next();
}

function authOptional(req, _res, next) {
  const user = readUser(req);
  req.user = user && !user.banned ? user : null;
  next();
}

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
