const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { reportLimiter } = require('../middleware/limiters');
const validation = require('../lib/validation');

const router = express.Router();

router.post('/', authRequired, reportLimiter, (req, res) => {
  const reason = String(req.body.reason || '');
  if (!validation.REPORT_REASONS[reason]) {
    return res.status(400).json({ error: 'Motif de signalement invalide' });
  }

  let annonceId = validation.text(req.body.annonceId, 64) || null;
  let commentId = validation.text(req.body.commentId, 64) || null;
  if (!annonceId && !commentId) {
    return res.status(400).json({ error: 'Contenu à signaler manquant' });
  }

  let annonce = null;
  let comment = null;

  if (commentId) {
    comment = db.prepare('SELECT id, annonce_id, user_id FROM comments WHERE id = ?').get(commentId);
    if (!comment) return res.status(404).json({ error: 'Commentaire introuvable' });
    annonceId = comment.annonce_id;
    if (comment.user_id === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas signaler votre propre commentaire' });
    }
  }

  annonce = db.prepare('SELECT id, user_id FROM annonces WHERE id = ?').get(annonceId);
  if (!annonce) return res.status(404).json({ error: 'Annonce introuvable' });
  if (!comment && annonce.user_id === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas signaler votre propre annonce' });
  }

  const duplicate = db
    .prepare(
      `SELECT id FROM reports
       WHERE reporter_user_id = ? AND status = 'open'
         AND ((? IS NOT NULL AND comment_id = ?) OR (? IS NULL AND annonce_id = ? AND comment_id IS NULL))`
    )
    .get(req.user.id, commentId, commentId, commentId, annonceId);
  if (duplicate) {
    return res.status(409).json({ error: 'Vous avez déjà signalé ce contenu — il est en cours d’examen' });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO reports (id, annonce_id, comment_id, reporter_user_id, reason, details)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    annonceId,
    commentId,
    req.user.id,
    reason,
    validation.reportDetails(req.body.details) || null
  );

  res.status(201).json({ ok: true, message: 'Signalement transmis à la modération' });
});

module.exports = router;
