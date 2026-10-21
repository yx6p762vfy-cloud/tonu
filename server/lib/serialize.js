const path = require('path');

function photoUrl(fileName) {
  if (!fileName) return null;
  if (fileName.startsWith('images/')) return `/${fileName}`;
  if (/^https?:\/\//i.test(fileName)) return fileName;
  return `/uploads/${path.basename(fileName)}`;
}

function mapAnnonceRow(row, photos, user, baseUrl, extra = {}) {
  const urls = photos.map((p) => photoUrl(p.file_name, baseUrl)).filter(Boolean);
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
    createdAt: row.created_at?.slice(0, 10) || row.created_at,
    updatedAt: row.updated_at || null,
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

module.exports = { photoUrl, mapAnnonceRow, mapUserPublic };
