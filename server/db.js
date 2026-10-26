const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('./config');

let pool = null;
let pgliteServer = null;

// Convertit les marqueurs « ? » (habitude SQLite) en « $1, $2, … » (Postgres).
function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function bindClient(client) {
  return {
    async get(sql, params) {
      const res = await client.query(toPgSql(sql), params || []);
      return res.rows[0] || null;
    },
    async all(sql, params) {
      const res = await client.query(toPgSql(sql), params || []);
      return res.rows;
    },
    async run(sql, params) {
      const res = await client.query(toPgSql(sql), params || []);
      return { changes: res.rowCount };
    },
  };
}

async function get(sql, params) {
  return bindClient(pool).get(sql, params);
}

async function all(sql, params) {
  return bindClient(pool).all(sql, params);
}

async function run(sql, params) {
  return bindClient(pool).run(sql, params);
}

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(bindClient(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // la connexion est déjà rompue
    }
    throw err;
  } finally {
    client.release();
  }
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    pseudo TEXT NOT NULL,
    age INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','moderator')),
    plan TEXT,
    premium_until TIMESTAMPTZ,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    banned BOOLEAN NOT NULL DEFAULT FALSE,
    terms_accepted_at TIMESTAMPTZ,
    terms_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS annonces (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    city TEXT NOT NULL,
    category TEXT NOT NULL,
    intention TEXT NOT NULL,
    gender TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,
    moderated_at TIMESTAMPTZ,
    moderated_by TEXT REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS annonce_photos (
    id TEXT PRIMARY KEY,
    annonce_id TEXT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    annonce_id TEXT NOT NULL REFERENCES annonces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    annonce_id TEXT REFERENCES annonces(id) ON DELETE CASCADE,
    comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
    reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    CHECK (annonce_id IS NOT NULL OR comment_id IS NOT NULL)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(email))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pseudo_unique ON users (LOWER(pseudo))`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_annonces_status ON annonces(status)`,
  `CREATE INDEX IF NOT EXISTS idx_annonces_user ON annonces(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_annonces_created ON annonces(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_annonce ON comments(annonce_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`,
  `CREATE INDEX IF NOT EXISTS idx_reports_annonce ON reports(annonce_id)`,
];

async function migrate() {
  for (const statement of STATEMENTS) {
    await pool.query(statement);
  }
}

const DEMOS = [
  ['a1', 'Soirée complice en ville', 'Amara_28', 'Rencontre', 'Abidjan', 28, 'Femme', 'Rencontre sérieuse', 'images/1.jpeg'],
  ['a2', 'Sortie lounge & conversation', 'Kofi_Paris', 'Sortie', 'Paris', 34, 'Homme', 'Sorties', 'images/2.jpeg'],
  ['a3', 'Échanges libres et respectueux', 'Lina_Bxl', 'Discussion', 'Bruxelles', 26, 'Femme', 'Discussion', 'images/3.jpeg'],
  ['a4', 'Week-end escapade', 'David_31', 'Rencontre', 'Lyon', 31, 'Homme', 'Rencontre', 'images/4.jpeg'],
  ['a5', 'Couple ouvert — nouvelles rencontres', 'M&J Duo', 'Couple', 'Dakar', 29, 'Couple', 'Couple', 'images/5.jpeg'],
  ['a6', 'Afterwork & connexion', 'Nadia_33', 'Sortie', 'Montpellier', 33, 'Femme', 'Sorties', 'images/6.jpeg'],
];

async function seedDemoAnnonces() {
  if (!config.seedDemo) return;
  await run(
    `UPDATE users SET plan = COALESCE(plan, 'golden'), premium_until = now() + interval '10 years'
     WHERE id LIKE 'demo-%' AND (premium_until IS NULL OR premium_until < now())`
  );
  const row = await get('SELECT COUNT(*)::int AS c FROM annonces');
  if (row.c > 0) return;

  await tx(async (t) => {
    for (let i = 0; i < DEMOS.length; i++) {
      const [id, title, pseudoName, cat, city, memberAge, gender, intention, img] = DEMOS[i];
      const userId = `demo-${id}`;
      const existing = await t.get('SELECT id FROM users WHERE id = ?', [userId]);
      if (!existing) {
        await t.run(
          `INSERT INTO users (id, email, password_hash, pseudo, age, role, plan, premium_until)
           VALUES (?, ?, ?, ?, ?, 'user', 'golden', now() + interval '10 years')`,
          [userId, `${id}@demo.local`, bcrypt.hashSync('unused', 10), pseudoName, memberAge]
        );
      }
      await t.run(
        `INSERT INTO annonces (id, user_id, title, description, city, category, intention, gender, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', now() - make_interval(days => ?))`,
        [
          id,
          userId,
          title,
          `Annonce de démonstration — ${title}. Profil majeur, respect et discrétion.`,
          city,
          cat,
          intention,
          gender,
          i,
        ]
      );
      await t.run(
        `INSERT INTO annonce_photos (id, annonce_id, file_name, sort_order)
         VALUES (?, ?, ?, 0)`,
        [`${id}-ph`, id, img]
      );
    }
  });
  console.log('[seed] Annonces de démonstration créées');
}

async function seedAdmin() {
  if (!config.adminEmail || !config.adminPassword) return;
  const row = await get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (row) return;
  await run(
    `INSERT INTO users (id, email, password_hash, pseudo, age, role, terms_accepted_at, terms_version)
     VALUES (?, ?, ?, ?, ?, 'admin', now(), ?)`,
    [
      crypto.randomUUID(),
      config.adminEmail,
      bcrypt.hashSync(config.adminPassword, 12),
      'Admin',
      30,
      config.termsVersion,
    ]
  );
  console.log(`[seed] Compte admin créé : ${config.adminEmail}`);
}

async function init() {
  if (pool) return;
  if (config.databaseUrl) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 5,
      connectionTimeoutMillis: 10_000,
    });
  } else {
    // Développement/test sans DATABASE_URL : Postgres embarqué (PGlite) persisté sur le disque.
    const { PGlite } = require('@electric-sql/pglite');
    const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
    const dir = path.join(config.rootDir, 'data', 'pglite');
    fs.mkdirSync(dir, { recursive: true });
    const pglite = new PGlite(dir);
    pgliteServer = new PGLiteSocketServer({ db: pglite, port: 0, host: '127.0.0.1', maxConnections: 8 });
    await pgliteServer.start();
    // getServerConn() renvoie « host:port » sous forme de chaîne.
    const connStr = pgliteServer.getServerConn();
    const sep = connStr.lastIndexOf(':');
    pool = new Pool({
      host: connStr.slice(0, sep),
      port: Number(connStr.slice(sep + 1)),
      user: 'postgres',
      password: 'postgres',
      database: 'postgres',
      max: 5,
      connectionTimeoutMillis: 10_000,
    });
    console.log('[db] Postgres embarqué (PGlite) pour le développement');
  }
  await migrate();
  await seedAdmin();
  await seedDemoAnnonces();
}

async function close() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end().catch(() => {});
  }
  if (pgliteServer) {
    const s = pgliteServer;
    pgliteServer = null;
    await s.stop().catch(() => {});
  }
}

module.exports = { init, close, get, all, run, tx };
