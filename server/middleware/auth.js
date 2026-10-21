const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Session invalide' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée ou invalide' });
  }
}

function authOptional(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      req.user = getUserById(payload.sub) || null;
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
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
  return user?.premium_until && new Date(user.premium_until) > new Date();
}

module.exports = { authRequired, authOptional, requireRole, userHasPremium, getUserById };
