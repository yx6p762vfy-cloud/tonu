const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { randomUUID } = require('crypto');
const db = require('../db');
const config = require('../config');
const { authRequired, authOptional, userHasPremium } = require('../middleware/auth');
const { mapAnnonceRow } = require('../lib/serialize');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 3 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Format image non supporté'), ok);
  },
});

function attachPhotosAndUser(row, baseUrl) {
  const photos = db
    .prepare('SELECT * FROM annonce_photos WHERE annonce_id = ? ORDER BY sort_order')
    .all(row.id);
  const user = db.prepare('SELECT id, pseudo, age FROM users WHERE id = ?').get(row.user_id);
  return mapAnnonceRow(row, photos, user, baseUrl);
}

/* ── GET / — liste des annonces approuvées avec filtres ── */
router.get('/', (_req, res) => {
  const cat = (_req.query.cat || '').trim();
  const city = (_req.query.city || '').trim();
  const gender = (_req.query.gender || '').trim();
  const page = Math.max(1, parseInt(_req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(_req.query.limit) || 20));
  const offset = (page - 1) * limit;

  // Construction dynamique de la requête
  const conditions = ["a.status = 'approved'"];
  const params = [];

  if (cat) {
    conditions.push('LOWER(a.category) = LOWER(?)');
    params.push(cat);
  }
  if (city) {
    conditions.push('LOWER(a.city) LIKE LOWER(?)');
    params.push(`%${city}%`);
  }
  if (gender) {
    conditions.push('LOWER(a.gender) = LOWER(?)');
    params.push(gender);
  }

  const where = conditions.join(' AND ');

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM annonces a WHERE ${where}`)
    .get(...params).c;

  const rows = db
    .prepare(
      `SELECT a.* FROM annonces a
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const annonces = rows.map((row) => attachPhotosAndUser(row, config.baseUrl));

  res.json({
    annonces,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/* ── GET /mine — annonces de l'utilisateur connecté ── */
router.get('/mine', authRequired, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM annonces WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  const annonces = rows.map((row) => {
    const photos = db
      .prepare('SELECT * FROM annonce_photos WHERE annonce_id = ? ORDER BY sort_order')
      .all(row.id);
    return mapAnnonceRow(row, photos, req.user, config.baseUrl);
  });
  res.json({ annonces });
});

/* ── GET /:id — détail d'une annonce ── */
router.get('/:id', authOptional, (req, res) => {
  const row = db.prepare('SELECT * FROM annonces WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Annonce introuvable' });
  const isOwner = req.user && req.user.id === row.user_id;
  const isStaff = req.user && ['admin', 'moderator'].includes(req.user.role);
  if (row.status !== 'approved' && !isOwner && !isStaff) {
    return res.status(404).json({ error: 'Annonce introuvable' });
  }
  res.json({ annonce: attachPhotosAndUser(row, config.baseUrl) });
});

/* ── POST / — créer une annonce (Premium requis) ── */
router.post('/', authRequired, upload.array('photos', 3), (req, res) => {
  if (!userHasPremium(req.user)) {
    // Nettoyer les fichiers uploadés si refus
    (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(402).json({ error: 'Abonnement Premium requis pour publier' });
  }
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ error: 'Au moins une photo est requise' });
  }

  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const city = (req.body.city || '').trim();
  const category = (req.body.category || '').trim();
  const intention = (req.body.intention || '').trim();
  const gender = (req.body.gender || '—').trim();

  if (!title || !description || !city || !category || !intention) {
    files.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  // Validation catégorie
  const validCategories = ['Rencontre', 'Sortie', 'Discussion', 'Couple'];
  if (!validCategories.includes(category)) {
    files.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(400).json({ error: 'Catégorie invalide' });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO annonces (id, user_id, title, description, city, category, intention, gender, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).run(id, req.user.id, title, description, city, category, intention, gender);

  const insertPhoto = db.prepare(
    `INSERT INTO annonce_photos (id, annonce_id, file_name, sort_order) VALUES (?, ?, ?, ?)`
  );
  files.forEach((f, i) => {
    insertPhoto.run(randomUUID(), id, f.filename, i);
  });

  const newRow = db.prepare('SELECT * FROM annonces WHERE id = ?').get(id);
  res.status(201).json({
    annonce: attachPhotosAndUser(newRow, config.baseUrl),
    message: 'Annonce soumise — en attente de modération',
  });
});

/* ── DELETE /:id — supprimer une annonce ── */
router.delete('/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM annonces WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Annonce introuvable' });
  const isOwner = row.user_id === req.user.id;
  const isStaff = ['admin', 'moderator'].includes(req.user.role);
  if (!isOwner && !isStaff) return res.status(403).json({ error: 'Accès refusé' });

  const photos = db.prepare('SELECT file_name FROM annonce_photos WHERE annonce_id = ?').all(row.id);
  photos.forEach((p) => {
    if (p.file_name && !p.file_name.startsWith('images/')) {
      fs.unlink(path.join(config.uploadsDir, p.file_name), () => {});
    }
  });
  db.prepare('DELETE FROM annonces WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

/* ── Gestion erreurs Multer ── */
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.message === 'Format image non supporté') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
