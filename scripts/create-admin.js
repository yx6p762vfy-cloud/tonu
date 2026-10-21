#!/usr/bin/env node
/* Crée un administrateur. Usage :
   node scripts/create-admin.js email@exemple.com 'MotDePasseSolide!' [Pseudo]
   ou ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/create-admin.js */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../server/db');

const [emailArg, passwordArg, pseudoArg] = process.argv.slice(2);
const email = (emailArg || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = passwordArg || process.env.ADMIN_PASSWORD || '';
const pseudo = (pseudoArg || 'Admin').trim();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Email invalide.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Le mot de passe doit contenir au moins 12 caractères.');
  process.exit(1);
}
if (pseudo.length < 3 || pseudo.length > 32) {
  console.error('Le pseudo doit contenir entre 3 et 32 caractères.');
  process.exit(1);
}

const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
if (existing) {
  db.prepare(
    "UPDATE users SET role = 'admin', password_hash = ?, banned = 0, updated_at = datetime('now') WHERE id = ?"
  ).run(bcrypt.hashSync(password, 12), existing.id);
  console.log(`Compte existant promu administrateur : ${email}`);
} else {
  const duplicatePseudo = db
    .prepare('SELECT id FROM users WHERE pseudo = ? COLLATE NOCASE')
    .get(pseudo);
  if (duplicatePseudo) {
    console.error('Ce pseudo est déjà utilisé. Choisissez-en un autre.');
    process.exit(1);
  }
  db.prepare(
    `INSERT INTO users (id, email, password_hash, pseudo, age, role, terms_accepted_at, terms_version)
     VALUES (?, ?, ?, ?, 30, 'admin', datetime('now'), '1.0')`
  ).run(crypto.randomUUID(), email, bcrypt.hashSync(password, 12), pseudo);
  console.log(`Administrateur créé : ${email}`);
}
db.close();
