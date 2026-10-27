const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');
const { commentLimiter } = require('../middleware/limiters');
const { asyncHandler } = require('../lib/http');
const validation = require('../lib/validation');

const router = express.Router();

function findAnnonce(id) {
  return db.get('SELECT id, user_id, status FROM annonces WHERE id = ?', [id]);
}

function canAccess(annonce, user) {
  if (annonce.status === 'approved') return true;
  if (!user) return false;
  return user.id === annonce.user_id || ['admin', 'moderator'].includes(user.role);
}

function mapComment(row, user, annonce) {
  const isStaff = !!user && ['admin', 'moderator'].includes(user.role);
  const isPublisher = !!annonce && row.user_id === annonce.user_id;
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    parentId: row.parent_id || null,
    user: { pseudo: row.pseudo, age: row.age },
    isOwner: !!user && user.id === row.user_id,
    isPublisher,
    canReply: !!user && !!annonce && user.id === annonce.user_id && !row.parent_id && row.user_id !== user.id,
    canDelete: !!user && (user.id === row.user_id || isStaff),
  };
}

/* ── GET /:annonceId ── */
router.get(
  '/:annonceId',
  authOptional,
  asyncHandler(async (req, res) => {
    const annonce = await findAnnonce(req.params.annonceId);
    if (!annonce) return res.status(404).json({ error: 'Annonce introuvable' });
    if (!canAccess(annonce, req.user)) return res.status(404).json({ error: 'Annonce introuvable' });

    const rows = await db.all(
      `SELECT c.*, u.pseudo, u.age
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.annonce_id = ?
       ORDER BY c.created_at ASC
       LIMIT 200`,
      [req.params.annonceId]
    );

    const byId = new Map();
    rows.forEach((row) => {
      const comment = mapComment(row, req.user, annonce);
      comment.replies = [];
      byId.set(comment.id, comment);
    });

    const threads = [];
    rows.forEach((row) => {
      const comment = byId.get(row.id);
      const parent = row.parent_id ? byId.get(row.parent_id) : null;
      if (parent && !parent.parentId) parent.replies.push(comment);
      else threads.push(comment);
    });

    res.json({ comments: threads });
  })
);

/* ── POST /:annonceId — compte requis ── */
router.post(
  '/:annonceId',
  authRequired,
  commentLimiter,
  asyncHandler(async (req, res) => {
    const annonce = await findAnnonce(req.params.annonceId);
    if (!annonce) return res.status(404).json({ error: 'Annonce introuvable' });
    if (annonce.status !== 'approved') {
      return res.status(403).json({ error: 'Cette annonce n’est pas encore publiée' });
    }

    const content = validation.commentContent(req.body.content);
    if (!content) {
      return res.status(400).json({ error: 'Commentaire trop court (2 caractères minimum)' });
    }

    const parentId = validation.text(req.body.parentId, 64) || null;
    if (parentId) {
      if (req.user.id !== annonce.user_id) {
        return res.status(403).json({ error: 'Seul l’auteur de l’annonce peut répondre aux commentaires' });
      }
      const parent = await db.get('SELECT id, annonce_id, parent_id FROM comments WHERE id = ?', [parentId]);
      if (!parent || parent.annonce_id !== annonce.id) {
        return res.status(404).json({ error: 'Commentaire introuvable' });
      }
      if (parent.parent_id) {
        return res.status(400).json({ error: 'Impossible de répondre à une réponse' });
      }
    }

    const id = randomUUID();
    await db.run('INSERT INTO comments (id, annonce_id, user_id, content, parent_id) VALUES (?, ?, ?, ?, ?)', [
      id,
      annonce.id,
      req.user.id,
      content,
      parentId,
    ]);

    const row = await db.get(
      `SELECT c.*, u.pseudo, u.age
       FROM comments c JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      [id]
    );

    res.status(201).json({ comment: mapComment(row, req.user, annonce) });
  })
);

/* ── DELETE /:annonceId/:commentId ── */
router.delete(
  '/:annonceId/:commentId',
  authRequired,
  asyncHandler(async (req, res) => {
    const comment = await db.get('SELECT * FROM comments WHERE id = ?', [req.params.commentId]);
    if (!comment || comment.annonce_id !== req.params.annonceId) {
      return res.status(404).json({ error: 'Commentaire introuvable' });
    }
    const isStaff = req.user.role === 'admin' || req.user.role === 'moderator';
    if (comment.user_id !== req.user.id && !isStaff) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    await db.tx(async (t) => {
      await t.run('DELETE FROM comments WHERE parent_id = ?', [comment.id]);
      await t.run('DELETE FROM comments WHERE id = ?', [comment.id]);
    });
    res.json({ ok: true });
  })
);

module.exports = router;
