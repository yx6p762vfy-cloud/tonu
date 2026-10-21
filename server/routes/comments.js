const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');
const { commentLimiter } = require('../middleware/limiters');
const validation = require('../lib/validation');

const router = express.Router();

function findAnnonce(id) {
  return db.prepare('SELECT id, user_id, status FROM annonces WHERE id = ?').get(id);
}

function canAccess(annonce, user) {
  if (annonce.status === 'approved') return true;
  if (!user) return false;
  return user.id === annonce.user_id || ['admin', 'moderator'].includes(user.role);
}

function mapComment(row, user) {
  const isStaff = !!user && ['admin', 'moderator'].includes(user.role);
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    user: { pseudo: row.pseudo, age: row.age },
    isOwner: !!user && user.id === row.user_id,
    canDelete: !!user && (user.id === row.user_id || isStaff),
  };
}

/* ── GET /:annonceId ── */
router.get('/:annonceId', authOptional, (req, res) => {
  const annonce = findAnnonce(req.params.annonceId);
  if (!annonce) return res.status(404).json({ error: 'Annonce introuvable' });
  if (!canAccess(annonce, req.user)) return res.status(404).json({ error: 'Annonce introuvable' });

  const rows = db
    .prepare(
      `SELECT c.*, u.pseudo, u.age
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.annonce_id = ?
       ORDER BY c.created_at ASC
       LIMIT 200`
    )
    .all(req.params.annonceId);

  res.json({ comments: rows.map((row) => mapComment(row, req.user)) });
});

/* ── POST /:annonceId — compte requis ── */
router.post('/:annonceId', authRequired, commentLimiter, (req, res) => {
  const annonce = findAnnonce(req.params.annonceId);
  if (!annonce) return res.status(404).json({ error: 'Annonce introuvable' });
  if (annonce.status !== 'approved') {
    return res.status(403).json({ error: 'Cette annonce n’est pas encore publiée' });
  }

  const content = validation.commentContent(req.body.content);
  if (!content) {
    return res.status(400).json({ error: 'Commentaire trop court (2 caractères minimum)' });
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO comments (id, annonce_id, user_id, content) VALUES (?, ?, ?, ?)'
  ).run(id, annonce.id, req.user.id, content);

  const row = db
    .prepare(
      `SELECT c.*, u.pseudo, u.age
       FROM comments c JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`
    )
    .get(id);

  res.status(201).json({ comment: mapComment(row, req.user) });
});

/* ── DELETE /:annonceId/:commentId ── */
router.delete('/:annonceId/:commentId', authRequired, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
  if (!comment || comment.annonce_id !== req.params.annonceId) {
    return res.status(404).json({ error: 'Commentaire introuvable' });
  }
  const isStaff = req.user.role === 'admin' || req.user.role === 'moderator';
  if (comment.user_id !== req.user.id && !isStaff) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  res.json({ ok: true });
});

module.exports = router;
