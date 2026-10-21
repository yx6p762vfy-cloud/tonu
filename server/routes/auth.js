const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('../db');
const config = require('../config');
const { authRequired } = require('../middleware/auth');
const { mapUserPublic } = require('../lib/serialize');

const router = express.Router();

router.post('/register', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const pseudo = (req.body.pseudo || '').trim();
  const age = Number(req.body.age);

  if (!email || !password || !pseudo) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe trop court (min. 6 caractères)' });
  }
  if (age < config.minAge) {
    return res.status(400).json({ error: `Réservé aux ${config.minAge}+` });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Compte déjà existant' });

  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, pseudo, age, role)
     VALUES (?, ?, ?, ?, ?, 'user')`
  ).run(id, email, bcrypt.hashSync(password, 12), pseudo, age);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  res.status(201).json({ token, user: mapUserPublic(user) });
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  res.json({ token, user: mapUserPublic(user) });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: mapUserPublic(req.user) });
});

module.exports = router;
