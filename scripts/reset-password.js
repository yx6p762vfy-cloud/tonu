#!/usr/bin/env node
/* Réinitialise un mot de passe. Usage :
   node scripts/reset-password.js email@exemple.com 'NouveauMotDePasse!'
   ou RESET_EMAIL=... RESET_PASSWORD=... node scripts/reset-password.js */
const bcrypt = require('bcryptjs');
const db = require('../server/db');

const [emailArg, passwordArg] = process.argv.slice(2);
const email = (emailArg || process.env.RESET_EMAIL || '').trim().toLowerCase();
const password = passwordArg || process.env.RESET_PASSWORD || '';

if (!email) {
  console.error('Email requis.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Le mot de passe doit contenir au moins 8 caractères.');
  process.exit(1);
}

async function main() {
  await db.init();

  const user = await db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
  if (!user) {
    console.error('Aucun compte trouvé avec cet email.');
    process.exitCode = 1;
    return;
  }

  await db.run(
    'UPDATE users SET password_hash = ?, updated_at = now() WHERE id = ?',
    [bcrypt.hashSync(password, 12), user.id]
  );
  console.log(`Mot de passe réinitialisé pour : ${email}`);
}

main()
  .catch((err) => {
    console.error('Erreur :', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
