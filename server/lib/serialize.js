function photoUrl(fileName, baseUrl) {
  if (!fileName) return null;
  if (fileName.startsWith('images/')) return `/${fileName}`;
  return `${baseUrl}/uploads/${fileName}`;
}

function mapAnnonceRow(row, photos, user, baseUrl) {
  const urls = photos.map((p) => photoUrl(p.file_name, baseUrl));
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
    status: row.status,
    rejectionReason: row.rejection_reason || null,
    userPosted: !!user && !String(user.id).startsWith('demo-'),
    authorId: row.user_id,
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
    hasPremium: u.premium_until && new Date(u.premium_until) > new Date(),
  };
}

module.exports = { photoUrl, mapAnnonceRow, mapUserPublic };
