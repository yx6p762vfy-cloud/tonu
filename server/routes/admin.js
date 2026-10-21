const express = require('express');
const db = require('../db');
const config = require('../config');
const { authRequired, requireRole } = require('../middleware/auth');
const { mapAnnonceRow } = require('../lib/serialize');

const router = express.Router();

router.use(authRequired, requireRole('admin', 'moderator'));

function pendingList() {
  const rows = db
    .prepare(`SELECT * FROM annonces WHERE status = 'pending' ORDER BY created_at ASC`)
    .all();
  return rows.map((row) => {
    const photos = db
      .prepare('SELECT * FROM annonce_photos WHERE annonce_id = ? ORDER BY sort_order')
      .all(row.id);
    const user = db.prepare('SELECT id, pseudo, age, email FROM users WHERE id = ?').get(row.user_id);
    return {
      ...mapAnnonceRow(row, photos, user, config.baseUrl),
      authorEmail: user?.email,
    };
  });
}

router.get('/pending', (_req, res) => {
  res.json({ annonces: pendingList() });
});

router.post('/annonces/:id/approve', (req, res) => {
  const row = db.prepare('SELECT id FROM annonces WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Annonce introuvable' });
  db.prepare(
    `UPDATE annonces SET status = 'approved', rejection_reason = NULL,
     moderated_at = datetime('now'), moderated_by = ? WHERE id = ?`
  ).run(req.user.id, req.params.id);
  res.json({ ok: true });
});

router.post('/annonces/:id/reject', (req, res) => {
  const reason = (req.body.reason || 'Contenu non conforme').trim();
  const row = db.prepare('SELECT id FROM annonces WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Annonce introuvable' });
  db.prepare(
    `UPDATE annonces SET status = 'rejected', rejection_reason = ?,
     moderated_at = datetime('now'), moderated_by = ? WHERE id = ?`
  ).run(reason, req.user.id, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
