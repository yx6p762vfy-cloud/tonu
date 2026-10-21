const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'app.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function addColumn(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      pseudo TEXT NOT NULL,
      age INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin','moderator')),
      premium_until TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      banned INTEGER NOT NULL DEFAULT 0,
      terms_accepted_at TEXT,
      terms_version TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS annonces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      city TEXT NOT NULL,
      category TEXT NOT NULL,
      intention TEXT NOT NULL,
      gender TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      rejection_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      moderated_at TEXT,
      moderated_by TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS annonce_photos (
      id TEXT PRIMARY KEY,
      annonce_id TEXT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      annonce_id TEXT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      annonce_id TEXT REFERENCES annonces(id) ON DELETE CASCADE,
      comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
      reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
      admin_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      CHECK (annonce_id IS NOT NULL OR comment_id IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_annonces_status ON annonces(status);
    CREATE INDEX IF NOT EXISTS idx_annonces_user ON annonces(user_id);
    CREATE INDEX IF NOT EXISTS idx_annonces_created ON annonces(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_annonce ON comments(annonce_id);
    CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_reports_annonce ON reports(annonce_id);
  `);

  // Colonnes ajoutées après la première version du schéma.
  addColumn('users', 'banned', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('users', 'terms_accepted_at', 'TEXT');
  addColumn('users', 'terms_version', 'TEXT');
  addColumn('users', 'updated_at', 'TEXT');
  addColumn('annonces', 'updated_at', 'TEXT');

  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pseudo_unique ON users(pseudo COLLATE NOCASE)');
  } catch (err) {
    console.warn('[db] Index unique pseudo non créé :', err.message);
  }
}

function seedDemoAnnonces() {
  if (!config.seedDemo) return;
  const count = db.prepare('SELECT COUNT(*) AS c FROM annonces').get().c;
  if (count > 0) return;

  const demos = [
    ['a1', 'Soirée complice en ville', 'Amara_28', 'Rencontre', 'Abidjan', 28, 'Femme', 'Rencontre sérieuse', 'images/1.jpeg'],
    ['a2', 'Sortie lounge & conversation', 'Kofi_Paris', 'Sortie', 'Paris', 34, 'Homme', 'Sorties', 'images/2.jpeg'],
    ['a3', 'Échanges libres et respectueux', 'Lina_Bxl', 'Discussion', 'Bruxelles', 26, 'Femme', 'Discussion', 'images/3.jpeg'],
    ['a4', 'Week-end escapade', 'David_31', 'Rencontre', 'Lyon', 31, 'Homme', 'Rencontre', 'images/4.jpeg'],
    ['a5', 'Couple ouvert — nouvelles rencontres', 'M&J Duo', 'Couple', 'Dakar', 29, 'Couple', 'Couple', 'images/5.jpeg'],
    ['a6', 'Afterwork & connexion', 'Nadia_33', 'Sortie', 'Montpellier', 33, 'Femme', 'Sorties', 'images/6.jpeg'],
  ];

  const insertAnnonce = db.prepare(`
    INSERT INTO annonces (id, user_id, title, description, city, category, intention, gender, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', datetime('now', ?))
  `);
  const insertPhoto = db.prepare(`
    INSERT INTO annonce_photos (id, annonce_id, file_name, sort_order)
    VALUES (?, ?, ?, 0)
  `);

  const seed = db.transaction(() => {
    demos.forEach(([id, title, pseudoName, cat, city, memberAge, gender, intention, img], i) => {
      const userId = `demo-${id}`;
      if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
        db.prepare(
          `INSERT INTO users (id, email, password_hash, pseudo, age, role)
           VALUES (?, ?, ?, ?, ?, 'user')`
        ).run(userId, `${id}@demo.local`, bcrypt.hashSync('unused', 10), pseudoName, memberAge);
      }
      insertAnnonce.run(
        id,
        userId,
        title,
        `Annonce de démonstration — ${title}. Profil majeur, respect et discrétion.`,
        city,
        cat,
        intention,
        gender,
        `-${i} days`
      );
      insertPhoto.run(`${id}-ph`, id, img);
    });
  });
  seed();
  console.log('[seed] Annonces de démonstration créées');
}

function seedAdmin() {
  if (!config.adminEmail || !config.adminPassword) return;
  const row = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (row) return;
  const { randomUUID } = require('crypto');
  db.prepare(
    `INSERT INTO users (id, email, password_hash, pseudo, age, role, terms_accepted_at, terms_version)
     VALUES (?, ?, ?, ?, ?, 'admin', datetime('now'), ?)`
  ).run(
    randomUUID(),
    config.adminEmail,
    bcrypt.hashSync(config.adminPassword, 12),
    'Admin',
    30,
    config.termsVersion
  );
  console.log(`[seed] Compte admin créé : ${config.adminEmail}`);
}

migrate();
seedAdmin();
seedDemoAnnonces();

module.exports = db;
