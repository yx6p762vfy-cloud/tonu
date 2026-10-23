const express = require('express');
const db = require('../db');
const config = require('../config');
const { authRequired, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../lib/http');
const { mapAnnonceRow, mapUserPublic } = require('../lib/serialize');
const validation = require('../lib/validation');

const router = express.Router();

router.use(authRequired, requireRole('admin', 'moderator'));

async function adminAnnonceRows(where, params, limit, offset) {
  const rows = await db.all(
    `SELECT a.*, u.pseudo AS author_pseudo, u.age AS author_age, u.email AS author_email,
            (SELECT COUNT(*)::int FROM comments c WHERE c.annonce_id = a.id) AS comment_count,
            (SELECT COUNT(*)::int FROM reports r WHERE r.annonce_id = a.id AND r.status = 'open') AS report_count
     FROM annonces a JOIN users u ON u.id = a.user_id
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const photosMap = new Map();
  if (rows.length) {
    const placeholders = rows.map(() => '?').join(',');
    const photos = await db.all(
      `SELECT * FROM annonce_photos WHERE annonce_id IN (${placeholders}) ORDER BY sort_order`,
      rows.map((r) => r.id)
    );
    photos.forEach((p) => {
      if (!photosMap.has(p.annonce_id)) photosMap.set(p.annonce_id, []);
      photosMap.get(p.annonce_id).push(p);
    });
  }

  return rows.map((row) => ({
    ...mapAnnonceRow(
      row,
      photosMap.get(row.id) || [],
      { id: row.user_id, pseudo: row.author_pseudo, age: row.author_age },
      config.baseUrl,
      { commentCount: row.comment_count }
    ),
    authorEmail: row.author_email,
    reportCount: row.report_count,
  }));
}

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const count = async (sql) => (await db.get(sql)).c;
    res.json({
      pending: await count("SELECT COUNT(*)::int AS c FROM annonces WHERE status = 'pending'"),
      approved: await count("SELECT COUNT(*)::int AS c FROM annonces WHERE status = 'approved'"),
      rejected: await count("SELECT COUNT(*)::int AS c FROM annonces WHERE status = 'rejected'"),
      users: await count('SELECT COUNT(*)::int AS c FROM users'),
      premium: await count('SELECT COUNT(*)::int AS c FROM users WHERE premium_until > now()'),
      openReports: await count("SELECT COUNT(*)::int AS c FROM reports WHERE status = 'open'"),
      comments: await count('SELECT COUNT(*)::int AS c FROM comments'),
    });
  })
);

router.get(
  '/annonces',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || 'pending');
    if (status !== 'all' && !validation.STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const where = status === 'all' ? '1=1' : 'a.status = ?';
    const params = status === 'all' ? [] : [status];
    const total = (await db.get(`SELECT COUNT(*)::int AS c FROM annonces a WHERE ${where}`, params)).c;
    res.json({
      annonces: await adminAnnonceRows(where, params, limit, (page - 1) * limit),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

router.get(
  '/pending',
  asyncHandler(async (_req, res) => {
    res.json({ annonces: await adminAnnonceRows("a.status = 'pending'", [], 200, 0) });
  })
);

router.post(
  '/annonces/:id/approve',
  asyncHandler(async (req, res) => {
    const row = await db.get('SELECT id FROM annonces WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Annonce introuvable' });
    await db.run(
      `UPDATE annonces SET status = 'approved', rejection_reason = NULL,
       moderated_at = now(), moderated_by = ?, updated_at = now()
       WHERE id = ?`,
      [req.user.id, row.id]
    );
    res.json({ ok: true });
  })
);

router.post(
  '/annonces/:id/reject',
  asyncHandler(async (req, res) => {
    const reason = validation.text(req.body.reason, 300);
    if (reason.length < 3) return res.status(400).json({ error: 'Motif du refus requis (3 caractères min.)' });
    const row = await db.get('SELECT id FROM annonces WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Annonce introuvable' });
    await db.run(
      `UPDATE annonces SET status = 'rejected', rejection_reason = ?,
       moderated_at = now(), moderated_by = ?, updated_at = now()
       WHERE id = ?`,
      [reason, req.user.id, row.id]
    );
    res.json({ ok: true });
  })
);

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || 'open');
    if (!['open', 'resolved', 'dismissed', 'all'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }
    const where = status === 'all' ? '1=1' : 'r.status = ?';
    const params = status === 'all' ? [] : [status];

    const rows = await db.all(
      `SELECT r.*, reporter.pseudo AS reporter_pseudo, reporter.email AS reporter_email,
              a.title AS annonce_title, a.user_id AS annonce_owner_id,
              author.pseudo AS annonce_author,
              c.content AS comment_content, c.user_id AS comment_owner_id,
              cauthor.pseudo AS comment_author
       FROM reports r
       JOIN users reporter ON reporter.id = r.reporter_user_id
       LEFT JOIN annonces a ON a.id = r.annonce_id
       LEFT JOIN users author ON author.id = a.user_id
       LEFT JOIN comments c ON c.id = r.comment_id
       LEFT JOIN users cauthor ON cauthor.id = c.user_id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT 200`,
      params
    );

    res.json({
      reports: rows.map((row) => ({
        id: row.id,
        status: row.status,
        reason: row.reason,
        reasonLabel: validation.REPORT_REASONS[row.reason] || row.reason,
        details: row.details,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        adminNote: row.admin_note,
        targetType: row.comment_id ? 'comment' : 'annonce',
        annonceId: row.annonce_id,
        annonceTitle: row.annonce_title,
        annonceAuthor: row.annonce_author,
        commentId: row.comment_id,
        commentContent: row.comment_content,
        commentAuthor: row.comment_author,
        reporter: { pseudo: row.reporter_pseudo, email: row.reporter_email },
      })),
    });
  })
);

router.post(
  '/reports/:id/resolve',
  asyncHandler(async (req, res) => {
    const action = String(req.body.action || 'resolved');
    if (!['resolved', 'dismissed'].includes(action)) {
      return res.status(400).json({ error: 'Action invalide' });
    }
    const note = validation.text(req.body.note, 500);
    const row = await db.get('SELECT id FROM reports WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Signalement introuvable' });

    await db.run(
      `UPDATE reports SET status = ?, admin_note = ?, resolved_at = now(), resolved_by = ?
       WHERE id = ?`,
      [action, note || null, req.user.id, row.id]
    );
    res.json({ ok: true });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const q = validation.text(req.query.q, 80);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const where = q ? "(u.email ILIKE ? ESCAPE '\\' OR u.pseudo ILIKE ? ESCAPE '\\')" : '1=1';
    const params = q ? [`%${q}%`, `%${q}%`] : [];
    const total = (await db.get(`SELECT COUNT(*)::int AS c FROM users u WHERE ${where}`, params)).c;

    const rows = await db.all(
      `SELECT u.*,
              (SELECT COUNT(*)::int FROM annonces a WHERE a.user_id = u.id) AS ad_count,
              (SELECT COUNT(*)::int FROM comments c WHERE c.user_id = u.id) AS comment_count
       FROM users u WHERE ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );

    res.json({
      users: rows.map((row) => ({
        ...mapUserPublic(row),
        banned: !!row.banned,
        adCount: row.ad_count,
        commentCount: row.comment_count,
        stripeSubscribed: !!row.stripe_subscription_id,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

router.post(
  '/users/:id/ban',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const banned = req.body.banned === true || req.body.banned === 'true';
    const target = await db.get('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas vous suspendre vous-même' });
    if (target.role === 'admin') return res.status(400).json({ error: 'Impossible de suspendre un administrateur' });

    await db.run('UPDATE users SET banned = ?, updated_at = now() WHERE id = ?', [banned, target.id]);
    res.json({ ok: true });
  })
);

module.exports = router;
