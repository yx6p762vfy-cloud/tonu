const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const config = require('../config');
const { authRequired, authOptional } = require('../middleware/auth');

const router = express.Router();

/* ── GET /:annonceId — liste des commentaires d'une annonce ── */
router.get('/:annonceId', authOptional, (req, res) => {
  const rows = db.prepare(
    `SELECT c.*, u.pseudo, u.age
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.annonce_id = ?
     ORDER BY c.created_at ASC`
  ).all(req.params.annonceId);

  const comments = rows.map((row) => ({
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    user: {
      pseudo: row.pseudo,
      age: row.age,
    },
    isOwner: req.user && req.user.id === row.user_id,
  }));

  res.json({ comments });
});

/* ── POST /:annonceId — créer un commentaire (auth requis) ── */
router.post('/:annonceId', authRequired, (req, res) => {
  const content = (req.body.content || '').trim();
  if (!content) {
    return res.status(400).json({ error: 'Le commentaire ne peut pas être vide' });
  }
  if (content.length > 500) {
    return res.status(400).json({ error: 'Commentaire trop long (max 500 caractères)' });
  }

  // Vérifier que l'annonce existe
  const annonce = db.prepare('SELECT id FROM annonces WHERE id = ?').get(req.params.annonceId);
  if (!annonce) {
    return res.status(404).json({ error: 'Annonce introuvable' });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO comments (id, annonce_id, user_id, content)
     VALUES (?, ?, ?, ?)`
  ).run(id, req.params.annonceId, req.user.id, content);

  const row = db.prepare(
    `SELECT c.*, u.pseudo, u.age
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.id = ?`
  ).get(id);

  res.status(201).json({
    comment: {
      id: row.id,
      content: row.content,
      createdAt: row.created_at,
      user: {
        pseudo: row.pseudo,
        age: row.age,
      },
      isOwner: true,
    },
  });
});

/* ── DELETE /:annonceId/:commentId — supprimer son commentaire ── */
router.delete('/:annonceId/:commentId', authRequired, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
  if (!comment) {
    return res.status(404).json({ error: 'Commentaire introuvable' });
  }
  if (comment.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'moderator') {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.commentId);
  res.json({ ok: true });
});

module.exports = router;
