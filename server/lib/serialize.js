const path = require('path');
const config = require('../config');
const storage = require('./storage');

function isoDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function isoDateTime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace('T', ' ').slice(0, 16);
}

function photoUrl(fileName) {
  if (!fileName) return null;
  if (fileName.startsWith('images/')) return `/${fileName}`;
  if (/^https?:\/\//i.test(fileName)) return fileName;
  return storage.publicUrl(path.basename(fileName));
}

function mapAnnonceRow(row, photos, user, baseUrl, extra = {}) {
  const urls = photos.map((p) => photoUrl(p.file_name)).filter(Boolean);
  return {
    id: row.id,
    title: row.title,
    pseudo: user?.pseudo || 'Membre',
    category: row.category,
    city: row.city,
    age: user?.age ?? null,
    gender: row.gender || '—',
    intention: row.intention,
    desc: row.description,
    image: urls[0] || null,
    photos: urls,
    createdAt: isoDate(row.created_at),
    updatedAt: isoDateTime(row.updated_at),
    status: row.status,
    rejectionReason: row.rejection_reason || null,
    userPosted: !!user && !String(user.id).startsWith('demo-'),
    authorId: row.user_id,
    commentCount: extra.commentCount ?? 0,
  };
}

function mapUserPublic(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    pseudo: u.pseudo,
    age: u.age,
    role: u.role,
    premiumUntil: u.premium_until,
    hasPremium: !!u.premium_until && new Date(u.premium_until) > new Date(),
    stripeCustomerId: u.stripe_customer_id ? true : false,
    createdAt: u.created_at,
  };
}

module.exports = { photoUrl, mapAnnonceRow, mapUserPublic, isoDate, isoDateTime };
