const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const config = require('../config');
const { authRequired, authOptional, userHasPremium } = require('../middleware/auth');
const { publishLimiter } = require('../middleware/limiters');
const { asyncHandler } = require('../lib/http');
const { mapAnnonceRow } = require('../lib/serialize');
const validation = require('../lib/validation');
const { upload, saveUploads, deleteFiles, multerErrorResponse } = require('../lib/images');

const router = express.Router();

function likeTerm(value) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

async function photosByAnnonce(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT * FROM annonce_photos WHERE annonce_id IN (${placeholders}) ORDER BY sort_order ASC`,
    ids
  );
  rows.forEach((row) => {
    if (!map.has(row.annonce_id)) map.set(row.annonce_id, []);
    map.get(row.annonce_id).push(row);
  });
  return map;
}

function selectRows(where, params = []) {
  return db.all(
    `SELECT a.*, u.pseudo AS author_pseudo, u.age AS author_age,
            (SELECT COUNT(*)::int FROM comments c WHERE c.annonce_id = a.id) AS comment_count
     FROM annonces a
     JOIN users u ON u.id = a.user_id
     WHERE ${where}`,
    params
  );
}

async function serializeRows(rows) {
  const photos = await photosByAnnonce(rows.map((row) => row.id));
  return rows.map((row) =>
    mapAnnonceRow(
      row,
      photos.get(row.id) || [],
      { id: row.user_id, pseudo: row.author_pseudo, age: row.author_age },
      config.baseUrl,
      { commentCount: row.comment_count }
    )
  );
}

async function getOne(id) {
  const rows = await selectRows('a.id = ?', [id]);
  return rows.length ? (await serializeRows(rows))[0] : null;
}

/* ── GET / — annonces approuvées, filtres, recherche, pagination ── */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const conditions = ["a.status = 'approved'"];
    const params = [];

    const q = validation.text(req.query.q, 80);
    if (q) {
      const term = likeTerm(q);
      conditions.push(
        "(a.title ILIKE ? ESCAPE '\\' OR a.description ILIKE ? ESCAPE '\\' OR a.city ILIKE ? ESCAPE '\\')"
      );
      params.push(term, term, term);
    }

    if (req.query.cat) {
      const cat = validation.oneOf(req.query.cat, validation.CATEGORIES);
      if (!cat) return res.status(400).json({ error: 'Catégorie invalide' });
      conditions.push('a.category = ?');
      params.push(cat);
    }

    const city = validation.text(req.query.city, 60);
    if (city) {
      conditions.push("a.city ILIKE ? ESCAPE '\\'");
      params.push(likeTerm(city));
    }

    if (req.query.gender) {
      const gender = validation.oneOf(req.query.gender, validation.GENDERS);
      if (!gender) return res.status(400).json({ error: 'Genre invalide' });
      conditions.push('LOWER(a.gender) = LOWER(?)');
      params.push(gender);
    }

    const sortMap = {
      recent: 'a.created_at DESC, a.id DESC',
      old: 'a.created_at ASC, a.id ASC',
      city: 'LOWER(a.city) ASC, a.created_at DESC',
      comments: 'comment_count DESC, a.created_at DESC',
    };
    const sort = sortMap[String(req.query.sort || 'recent')] || sortMap.recent;

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(30, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
    const offset = (page - 1) * limit;
    const where = conditions.join(' AND ');

    const total = (await db.get(`SELECT COUNT(*)::int AS c FROM annonces a WHERE ${where}`, params)).c;

    const rows = await db.all(
      `SELECT a.*, u.pseudo AS author_pseudo, u.age AS author_age,
              (SELECT COUNT(*)::int FROM comments c WHERE c.annonce_id = a.id) AS comment_count
       FROM annonces a JOIN users u ON u.id = a.user_id
       WHERE ${where}
       ORDER BY ${sort}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      annonces: await serializeRows(rows),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

/* ── GET /mine — annonces de l'utilisateur connecté ── */
router.get(
  '/mine',
  authRequired,
  asyncHandler(async (req, res) => {
    const rows = await selectRows('a.user_id = ?', [req.user.id]);
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ annonces: await serializeRows(rows) });
  })
);

/* ── GET /:id — détail ── */
router.get(
  '/:id',
  authOptional,
  asyncHandler(async (req, res) => {
    const rows = await selectRows('a.id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Annonce introuvable' });
    const row = rows[0];
    const isOwner = req.user && req.user.id === row.user_id;
    const isStaff = req.user && ['admin', 'moderator'].includes(req.user.role);
    if (row.status !== 'approved' && !isOwner && !isStaff) {
      return res.status(404).json({ error: 'Annonce introuvable' });
    }
    res.json({ annonce: (await serializeRows([row]))[0] });
  })
);

/* ── POST / — créer une annonce (Premium requis) ── */
router.post(
  '/',
  authRequired,
  publishLimiter,
  upload.array('photos', config.maxPhotos),
  asyncHandler(async (req, res) => {
    if (!userHasPremium(req.user)) {
      return res.status(402).json({ error: 'Abonnement Premium requis pour publier' });
    }

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Au moins une photo est requise' });

    const title = validation.title(req.body.title);
    const description = validation.description(req.body.description);
    const city = validation.city(req.body.city);
    const category = validation.oneOf(req.body.category, validation.CATEGORIES);
    const intention = validation.oneOf(req.body.intention, validation.INTENTIONS);
    const gender = validation.oneOf(req.body.gender, validation.GENDERS) || 'Autre';

    if (!title) return res.status(400).json({ error: 'Titre invalide (5 à 90 caractères)' });
    if (!description) {
      return res.status(400).json({ error: 'Description trop courte (20 caractères minimum)' });
    }
    if (!city) return res.status(400).json({ error: 'Ville invalide' });
    if (!category) return res.status(400).json({ error: 'Catégorie invalide' });
    if (!intention) return res.status(400).json({ error: 'Intention invalide' });

    const active = await db.get(
      "SELECT COUNT(*)::int AS c FROM annonces WHERE user_id = ? AND status IN ('pending','approved')",
      [req.user.id]
    );
    if (active.c >= config.maxAdsPerUser) {
      return res.status(400).json({
        error: `Limite de ${config.maxAdsPerUser} annonces actives atteinte. Supprimez-en une pour publier.`,
      });
    }

    const savedNames = await saveUploads(files);
    const id = randomUUID();

    try {
      await db.tx(async (t) => {
        await t.run(
          `INSERT INTO annonces (id, user_id, title, description, city, category, intention, gender, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [id, req.user.id, title, description, city, category, intention, gender]
        );
        for (let i = 0; i < savedNames.length; i++) {
          await t.run(
            'INSERT INTO annonce_photos (id, annonce_id, file_name, sort_order) VALUES (?, ?, ?, ?)',
            [randomUUID(), id, savedNames[i], i]
          );
        }
      });
    } catch (err) {
      await deleteFiles(savedNames);
      throw err;
    }

    res.status(201).json({
      annonce: await getOne(id),
      message: 'Annonce soumise — en attente de modération',
    });
  })
);

/* ── PATCH /:id — modifier (repasse en modération pour l'auteur) ── */
router.patch(
  '/:id',
  authRequired,
  publishLimiter,
  upload.array('photos', config.maxPhotos),
  asyncHandler(async (req, res) => {
    const row = await db.get('SELECT * FROM annonces WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Annonce introuvable' });

    const isOwner = row.user_id === req.user.id;
    const isStaff = ['admin', 'moderator'].includes(req.user.role);
    if (!isOwner && !isStaff) return res.status(403).json({ error: 'Accès refusé' });

    const updates = {};
    if (req.body.title !== undefined) {
      const value = validation.title(req.body.title);
      if (!value) return res.status(400).json({ error: 'Titre invalide (5 à 90 caractères)' });
      updates.title = value;
    }
    if (req.body.description !== undefined) {
      const value = validation.description(req.body.description);
      if (!value) return res.status(400).json({ error: 'Description trop courte (20 caractères minimum)' });
      updates.description = value;
    }
    if (req.body.city !== undefined) {
      const value = validation.city(req.body.city);
      if (!value) return res.status(400).json({ error: 'Ville invalide' });
      updates.city = value;
    }
    if (req.body.category !== undefined) {
      const value = validation.oneOf(req.body.category, validation.CATEGORIES);
      if (!value) return res.status(400).json({ error: 'Catégorie invalide' });
      updates.category = value;
    }
    if (req.body.intention !== undefined) {
      const value = validation.oneOf(req.body.intention, validation.INTENTIONS);
      if (!value) return res.status(400).json({ error: 'Intention invalide' });
      updates.intention = value;
    }
    if (req.body.gender !== undefined) {
      const value = validation.oneOf(req.body.gender, validation.GENDERS);
      if (!value) return res.status(400).json({ error: 'Genre invalide' });
      updates.gender = value;
    }

    const files = req.files || [];
    if (!Object.keys(updates).length && !files.length) {
      return res.status(400).json({ error: 'Aucune modification' });
    }

    const savedNames = files.length ? await saveUploads(files) : [];
    const oldPhotos = (
      await db.all('SELECT file_name FROM annonce_photos WHERE annonce_id = ?', [row.id])
    ).map((p) => p.file_name);

    try {
      await db.tx(async (t) => {
        const sets = Object.keys(updates).map((key) => `${key} = ?`);
        sets.push('updated_at = now()');
        const values = [...Object.values(updates)];

        if (!isStaff) {
          sets.push("status = 'pending'", 'rejection_reason = NULL', 'moderated_at = NULL', 'moderated_by = NULL');
        }

        await t.run(`UPDATE annonces SET ${sets.join(', ')} WHERE id = ?`, [...values, row.id]);

        if (savedNames.length) {
          await t.run('DELETE FROM annonce_photos WHERE annonce_id = ?', [row.id]);
          for (let i = 0; i < savedNames.length; i++) {
            await t.run(
              'INSERT INTO annonce_photos (id, annonce_id, file_name, sort_order) VALUES (?, ?, ?, ?)',
              [randomUUID(), row.id, savedNames[i], i]
            );
          }
        }
      });
    } catch (err) {
      await deleteFiles(savedNames);
      throw err;
    }

    if (savedNames.length) await deleteFiles(oldPhotos);

    res.json({
      annonce: await getOne(row.id),
      message: isStaff ? 'Annonce mise à jour' : 'Annonce mise à jour — elle repasse en modération',
    });
  })
);

/* ── DELETE /:id ── */
router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const row = await db.get('SELECT * FROM annonces WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Annonce introuvable' });

    const isOwner = row.user_id === req.user.id;
    const isStaff = ['admin', 'moderator'].includes(req.user.role);
    if (!isOwner && !isStaff) return res.status(403).json({ error: 'Accès refusé' });

    const files = (
      await db.all('SELECT file_name FROM annonce_photos WHERE annonce_id = ?', [row.id])
    ).map((p) => p.file_name);

    await db.run('DELETE FROM annonces WHERE id = ?', [row.id]);
    await deleteFiles(files);
    res.json({ ok: true });
  })
);

router.use((err, _req, res, next) => {
  if (multerErrorResponse(err, res)) return;
  next(err);
});

module.exports = router;
