const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('../db');
const config = require('../config');
const { authRequired } = require('../middleware/auth');
const { authLimiter } = require('../middleware/limiters');
const { mapUserPublic } = require('../lib/serialize');
const validation = require('../lib/validation');
const { deleteFiles } = require('../lib/images');
const { getStripe } = require('../lib/stripe');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function findUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

router.post('/register', authLimiter, (req, res) => {
  const email = validation.email(req.body.email);
  const password = validation.password(req.body.password);
  const pseudo = validation.pseudo(req.body.pseudo);
  const age = validation.age(req.body.age);
  const accepted = req.body.acceptTerms === true || req.body.acceptTerms === 'true';

  if (!email) return res.status(400).json({ error: 'Adresse email invalide' });
  if (!password) return res.status(400).json({ error: 'Mot de passe trop court (min. 8 caractères)' });
  if (!pseudo) {
    return res.status(400).json({
      error: 'Pseudo invalide (3 à 32 caractères : lettres, chiffres, espaces, . _ - & \')',
    });
  }
  if (!age) return res.status(400).json({ error: `Âge invalide — réservé aux ${config.minAge}+` });
  if (!accepted) return res.status(400).json({ error: 'Vous devez accepter les CGU et la politique de confidentialité' });

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  }
  if (db.prepare('SELECT id FROM users WHERE pseudo = ? COLLATE NOCASE').get(pseudo)) {
    return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
  }

  const id = randomUUID();
  try {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, pseudo, age, role, terms_accepted_at, terms_version)
       VALUES (?, ?, ?, ?, ?, 'user', datetime('now'), ?)`
    ).run(id, email, bcrypt.hashSync(password, 12), pseudo, age, config.termsVersion);
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'Email ou pseudo déjà utilisé' });
    }
    throw err;
  }

  const user = findUser(id);
  res.status(201).json({ token: signToken(id), user: mapUserPublic(user) });
});

router.post('/login', authLimiter, (req, res) => {
  const email = validation.email(req.body.email);
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  if (user.banned) {
    return res.status(403).json({ error: 'Compte suspendu. Contactez le support.', code: 'banned' });
  }
  res.json({ token: signToken(user.id), user: mapUserPublic(user) });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: mapUserPublic(req.user) });
});

router.patch('/me', authRequired, (req, res) => {
  const updates = {};

  if (req.body.pseudo !== undefined) {
    const pseudo = validation.pseudo(req.body.pseudo);
    if (!pseudo) return res.status(400).json({ error: 'Pseudo invalide (3 à 32 caractères)' });
    const taken = db
      .prepare('SELECT id FROM users WHERE pseudo = ? COLLATE NOCASE AND id != ?')
      .get(pseudo, req.user.id);
    if (taken) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    updates.pseudo = pseudo;
  }

  if (req.body.age !== undefined) {
    const age = validation.age(req.body.age);
    if (!age) return res.status(400).json({ error: `Âge invalide — réservé aux ${config.minAge}+` });
    updates.age = age;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'Aucune modification' });
  }

  const fields = Object.keys(updates).map((key) => `${key} = ?`);
  db.prepare(`UPDATE users SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(
    ...Object.values(updates),
    req.user.id
  );

  res.json({ user: mapUserPublic(findUser(req.user.id)) });
});

router.post('/me/password', authRequired, authLimiter, (req, res) => {
  const current = String(req.body.currentPassword || '');
  const next = validation.password(req.body.newPassword);
  if (!bcrypt.compareSync(current, req.user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  if (!next) return res.status(400).json({ error: 'Nouveau mot de passe trop court (min. 8 caractères)' });
  if (current === next) return res.status(400).json({ error: 'Le nouveau mot de passe doit être différent' });

  db.prepare(
    "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(bcrypt.hashSync(next, 12), req.user.id);
  res.json({ ok: true });
});

router.get('/me/export', authRequired, (req, res) => {
  const userId = req.user.id;
  const annonces = db
    .prepare('SELECT * FROM annonces WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      city: row.city,
      category: row.category,
      intention: row.intention,
      gender: row.gender,
      status: row.status,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
      photos: db
        .prepare('SELECT file_name FROM annonce_photos WHERE annonce_id = ? ORDER BY sort_order')
        .all(row.id)
        .map((p) => p.file_name),
    }));

  const comments = db
    .prepare(
      `SELECT c.content, c.created_at, c.annonce_id
       FROM comments c WHERE c.user_id = ? ORDER BY c.created_at DESC`
    )
    .all(userId);

  const reports = db
    .prepare(
      `SELECT annonce_id, comment_id, reason, details, status, created_at
       FROM reports WHERE reporter_user_id = ? ORDER BY created_at DESC`
    )
    .all(userId);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: mapUserPublic(req.user),
    annonces,
    comments,
    reports,
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mes-donnees-tonu.json"');
  res.send(JSON.stringify(payload, null, 2));
});

router.delete('/me', authRequired, async (req, res) => {
  const password = String(req.body.password || '');
  if (!bcrypt.compareSync(password, req.user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  if (req.user.role === 'admin') {
    const otherAdmins = db
      .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND id != ?")
      .get(req.user.id).c;
    if (!otherAdmins) {
      return res.status(400).json({ error: 'Impossible de supprimer le dernier compte administrateur' });
    }
  }

  const files = db
    .prepare(
      `SELECT p.file_name FROM annonce_photos p
       JOIN annonces a ON a.id = p.annonce_id
       WHERE a.user_id = ?`
    )
    .all(req.user.id)
    .map((row) => row.file_name);

  const stripe = getStripe();
  if (stripe && req.user.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(req.user.stripe_subscription_id);
    } catch (err) {
      console.error('[account] Annulation Stripe impossible :', err.message);
    }
  }

  await deleteFiles(files);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
