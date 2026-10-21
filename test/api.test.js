const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const ADMIN_EMAIL = 'admin@test.local';
const ADMIN_PASSWORD = 'AdminTestPassword123!';

let child = null;
let serverLog = '';
let baseUrl = '';
let tmpDir = '';
let uploadsDir = '';
let db = null;

const accounts = {};
let adminToken = '';
let adminId = '';
let adId = '';
let reportedCommentId = '';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Le serveur s'est arrêté pendant le démarrage.\n${serverLog}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // serveur pas encore prêt
    }
    await delay(200);
  }
  throw new Error(`Serveur injoignable après ${timeoutMs} ms.\n${serverLog}`);
}

async function request(pathname, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body = opts.body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: opts.method || 'GET',
    headers,
    body,
  });
  const contentType = res.headers.get('content-type') || '';
  const text = contentType.startsWith('image/') ? '' : await res.text();
  let json = null;
  if (text && contentType.includes('json')) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { res, status: res.status, headers: res.headers, text, json };
}

function expectStatus(result, status, label = '') {
  assert.equal(
    result.status,
    status,
    `${label || 'requête'} — statut ${result.status} au lieu de ${status} : ${result.text.slice(0, 400)}`
  );
}

function expectError(result, status, pattern, label = '') {
  expectStatus(result, status, label);
  assert.ok(result.json?.error, `Réponse JSON avec "error" attendue : ${result.text.slice(0, 300)}`);
  if (pattern) assert.match(result.json.error, pattern, label);
}

async function registerUser(profile) {
  return request('/api/auth/register', {
    method: 'POST',
    body: {
      age: 28,
      password: 'MotDePasse123!',
      acceptTerms: true,
      ...profile,
    },
  });
}

async function login(email, password) {
  return request('/api/auth/login', { method: 'POST', body: { email, password } });
}

async function makeJpeg() {
  const buffer = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 90, b: 140 } },
  })
    .withExif({ IFD0: { Copyright: 'Test Copyright', Software: 'ExifProbe' } })
    .jpeg({ quality: 90 })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  assert.ok(meta.exif, 'le JPEG de test doit contenir des métadonnées EXIF');
  return buffer;
}

function adForm(jpeg, overrides = {}) {
  const fields = {
    title: 'Rencontre test premium',
    description: 'Annonce de test automatisé avec une description suffisamment longue et claire.',
    city: 'Abidjan',
    category: 'Rencontre',
    intention: 'Rencontre sérieuse',
    gender: 'Femme',
    ...overrides,
  };
  const form = new FormData();
  form.append('photos', new Blob([jpeg], { type: 'image/jpeg' }), 'profil.jpg');
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  return form;
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tonu-api-test-'));
  const dataDir = path.join(tmpDir, 'data');
  uploadsDir = path.join(tmpDir, 'uploads');
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    BASE_URL: baseUrl,
    JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123456789abcdef',
    TRUST_PROXY: 'false',
    DATA_DIR: dataDir,
    UPLOADS_DIR: uploadsDir,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    SUPPORT_EMAIL: 'support@test.local',
    SEED_DEMO: 'true',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PRICE_ID: '',
  };

  child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => {
    serverLog += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    serverLog += chunk.toString();
  });

  await waitForHealth();

  db = new Database(path.join(dataDir, 'app.db'));
  db.pragma('busy_timeout = 5000');
});

after(async () => {
  try {
    db?.close();
  } catch {
    // ignore
  }

  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await Promise.race([exited, delay(2000)]);
    }
  }

  if (tmpDir) {
    await fsp.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
});

test('santé, en-têtes de sécurité et fichiers internes non exposés', async () => {
  const health = await request('/api/health');
  expectStatus(health, 200, 'health');
  assert.deepEqual(health.json, { ok: true, service: 'tonu-prive-api' });
  assert.equal(health.headers.get('x-powered-by'), null);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  const csp = health.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.ok(health.headers.get('referrer-policy'));
  assert.match(health.headers.get('permissions-policy') || '', /camera=\(\)/);

  for (const target of [
    '/server/config.js',
    '/server/db.js',
    '/package.json',
    '/data/app.db',
    '/scripts/create-admin.js',
    '/.env',
  ]) {
    const res = await request(target);
    expectStatus(res, 404, target);
    const leaked = ['jwtSecret', 'ADMIN_PASSWORD', '"dependencies"', 'server/config'];
    leaked.forEach((needle) => {
      assert.ok(!res.text.includes(needle), `${target} ne doit pas divulguer « ${needle} »`);
    });
  }

  const api404 = await request('/api/route-inconnue');
  expectStatus(api404, 404, 'API 404');
  assert.equal(api404.json.error, 'Route API introuvable');
});

test('inscription : validations, doublons et rôles initiaux', async () => {
  const base = {
    email: 'user1@test.local',
    pseudo: 'Amara_Test',
    age: 28,
    password: 'MotDePasse123!',
    acceptTerms: true,
  };

  const invalid = [
    [{ ...base, email: 'pas-un-email' }, /email/i],
    [{ ...base, email: 'weak@test.local', password: 'court' }, /mot de passe/i],
    [{ ...base, email: 'minor@test.local', age: 17 }, /18/],
    [{ ...base, email: 'pseudo@test.local', pseudo: '<script>' }, /pseudo/i],
    [{ ...base, email: 'terms@test.local', acceptTerms: false }, /CGU/i],
  ];
  for (const [payload, pattern] of invalid) {
    const res = await request('/api/auth/register', { method: 'POST', body: payload });
    expectError(res, 400, pattern, 'inscription invalide');
  }

  const first = await registerUser(base);
  expectStatus(first, 201, 'inscription user1');
  assert.ok(first.json.token);
  assert.equal(first.json.user.email, 'user1@test.local');
  assert.equal(first.json.user.role, 'user');
  assert.equal(first.json.user.hasPremium, false);
  assert.equal(first.json.user.email.includes('@'), true);
  accounts.user1 = {
    id: first.json.user.id,
    token: first.json.token,
    email: base.email,
    password: base.password,
    pseudo: base.pseudo,
  };

  const duplicateEmail = await registerUser({ ...base, email: 'USER1@test.local', pseudo: 'Autre_Pseudo' });
  expectError(duplicateEmail, 409, /existe déjà/i, 'email en doublon');

  const user2 = await registerUser({
    email: 'user2@test.local',
    pseudo: 'Kofi_Test',
    age: 34,
    password: 'MotDePasse456!',
  });
  expectStatus(user2, 201, 'inscription user2');
  accounts.user2 = {
    id: user2.json.user.id,
    token: user2.json.token,
    email: 'user2@test.local',
    password: 'MotDePasse456!',
    pseudo: 'Kofi_Test',
  };

  const duplicatePseudo = await registerUser({
    email: 'user4@test.local',
    pseudo: 'amara_test',
    age: 30,
  });
  expectError(duplicatePseudo, 409, /pseudo/i, 'pseudo en doublon (insensible à la casse)');

  const user3 = await registerUser({
    email: 'user3@test.local',
    pseudo: 'Lina_Test',
    age: 26,
    password: 'MotDePasse789!',
  });
  expectStatus(user3, 201, 'inscription user3');
  accounts.user3 = {
    id: user3.json.user.id,
    token: user3.json.token,
    email: 'user3@test.local',
    password: 'MotDePasse789!',
    pseudo: 'Lina_Test',
  };
});

test('connexion et session', async () => {
  const wrong = await login(accounts.user1.email, 'MauvaisMotDePasse!');
  expectError(wrong, 401, /incorrect/i, 'mauvais mot de passe');

  const ok = await login(accounts.user1.email, accounts.user1.password);
  expectStatus(ok, 200, 'connexion user1');
  assert.equal(ok.json.user.pseudo, accounts.user1.pseudo);
  assert.ok(ok.json.token);

  const me = await request('/api/auth/me', { token: ok.json.token });
  expectStatus(me, 200, 'session user1');
  assert.equal(me.json.user.email, accounts.user1.email);
  assert.equal(me.json.user.hasPremium, false);

  expectError(await request('/api/auth/me'), 401, /authentification/i, 'session anonyme');
  expectError(
    await request('/api/auth/me', { token: 'token.invalide.xyz' }),
    401,
    /session/i,
    'jeton falsifié'
  );
});

test('annonces publiques : filtres, recherche, pagination et détail', async () => {
  const list = await request('/api/annonces');
  expectStatus(list, 200, 'listing');
  assert.ok(list.json.annonces.length >= 6, 'les annonces de démonstration sont visibles');
  assert.ok(list.json.annonces.every((a) => a.status === 'approved'));
  assert.ok(list.json.annonces.every((a) => a.image && /^\/(images|uploads)\//.test(a.image)));
  assert.equal(list.json.pagination.page, 1);

  const cat = await request('/api/annonces?cat=Rencontre');
  expectStatus(cat, 200, 'filtre catégorie');
  assert.ok(cat.json.annonces.length >= 1);
  assert.ok(cat.json.annonces.every((a) => a.category === 'Rencontre'));

  expectError(
    await request('/api/annonces?cat=Inexistante'),
    400,
    /catégorie/i,
    'catégorie inconnue'
  );

  const search = await request(`/api/annonces?q=${encodeURIComponent('Soirée')}`);
  expectStatus(search, 200, 'recherche');
  assert.ok(search.json.annonces.some((a) => a.id === 'a1'));

  const gender = await request('/api/annonces?gender=Femme');
  expectStatus(gender, 200, 'filtre genre');
  assert.ok(gender.json.annonces.length >= 1);
  assert.ok(gender.json.annonces.every((a) => a.gender === 'Femme'));

  const paged = await request('/api/annonces?page=2&limit=2');
  expectStatus(paged, 200, 'pagination');
  assert.equal(paged.json.pagination.page, 2);
  assert.equal(paged.json.pagination.limit, 2);
  assert.ok(paged.json.annonces.length <= 2);

  const detail = await request('/api/annonces/a1');
  expectStatus(detail, 200, 'détail public');
  assert.equal(detail.json.annonce.id, 'a1');
  assert.equal(detail.json.annonce.image, '/images/1.jpeg');
  assert.equal(detail.json.annonce.status, 'approved');
  assert.ok(detail.json.annonce.photos.length >= 1);

  expectError(await request('/api/annonces/inconnue'), 404, /introuvable/i, 'détail inconnu');
});

test('commentaires : compte obligatoire, création et suppression contrôlée', async () => {
  const payload = { content: 'Très belle annonce, au plaisir d’échanger avec vous.' };

  expectError(
    await request('/api/comments/a1', { method: 'POST', body: payload }),
    401,
    /authentification/i,
    'commentaire anonyme'
  );

  const created = await request('/api/comments/a1', {
    method: 'POST',
    token: accounts.user1.token,
    body: payload,
  });
  expectStatus(created, 201, 'création commentaire');
  assert.equal(created.json.comment.content, payload.content);
  assert.equal(created.json.comment.isOwner, true);
  assert.equal(created.json.comment.user.pseudo, accounts.user1.pseudo);
  const commentId = created.json.comment.id;

  const asOwner = await request('/api/comments/a1', { token: accounts.user1.token });
  expectStatus(asOwner, 200, 'lecture commentaires connecté');
  const mine = asOwner.json.comments.find((c) => c.id === commentId);
  assert.ok(mine);
  assert.equal(mine.canDelete, true);

  const asVisitor = await request('/api/comments/a1');
  expectStatus(asVisitor, 200, 'lecture commentaires anonyme');
  const seen = asVisitor.json.comments.find((c) => c.id === commentId);
  assert.ok(seen);
  assert.equal(seen.isOwner, false);
  assert.equal(seen.canDelete, false);

  expectError(
    await request(`/api/comments/a1/${commentId}`, { method: 'DELETE', token: accounts.user2.token }),
    403,
    /refusé/i,
    'suppression par un tiers'
  );

  const removed = await request(`/api/comments/a1/${commentId}`, {
    method: 'DELETE',
    token: accounts.user1.token,
  });
  expectStatus(removed, 200, 'suppression par le propriétaire');

  const afterRemoval = await request('/api/comments/a1');
  assert.ok(!afterRemoval.json.comments.some((c) => c.id === commentId));
});

test('publication : Premium requis, image traitée et EXIF supprimé', async () => {
  const draft = {
    title: 'Rencontre test premium',
    description: 'Annonce de test automatisé avec une description suffisamment longue et claire.',
    city: 'Abidjan',
    category: 'Rencontre',
    intention: 'Rencontre sérieuse',
    gender: 'Femme',
  };

  const gated = await request('/api/annonces', {
    method: 'POST',
    token: accounts.user1.token,
    body: draft,
  });
  expectError(gated, 402, /premium/i, 'publication sans abonnement');

  const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const granted = db
    .prepare('UPDATE users SET premium_until = ? WHERE email = ?')
    .run(until, accounts.user1.email);
  assert.equal(granted.changes, 1, 'abonnement de test accordé');

  const me = await request('/api/auth/me', { token: accounts.user1.token });
  assert.equal(me.json.user.hasPremium, true);

  const noPhoto = await request('/api/annonces', {
    method: 'POST',
    token: accounts.user1.token,
    body: draft,
  });
  expectError(noPhoto, 400, /photo/i, 'publication sans photo');

  const badForm = new FormData();
  badForm.append('photos', new Blob([Buffer.from('ceci n’est pas une image')], { type: 'image/png' }), 'faux.png');
  Object.entries(draft).forEach(([key, value]) => badForm.append(key, value));
  const badImage = await request('/api/annonces', {
    method: 'POST',
    token: accounts.user1.token,
    body: badForm,
  });
  expectError(badImage, 400, /invalide|corrompue/i, 'fichier non image');

  const jpeg = await makeJpeg();
  const created = await request('/api/annonces', {
    method: 'POST',
    token: accounts.user1.token,
    body: adForm(jpeg),
  });
  expectStatus(created, 201, 'création annonce');
  adId = created.json.annonce.id;
  assert.equal(created.json.annonce.status, 'pending');
  assert.equal(created.json.annonce.rejectionReason, null);
  assert.equal(created.json.annonce.photos.length, 1);

  const photoUrl = created.json.annonce.photos[0];
  assert.match(photoUrl, /^\/uploads\/[0-9a-f-]+\.jpg$/i, 'URL de photo relative');
  const photoPath = path.join(uploadsDir, path.basename(photoUrl));
  assert.ok(fs.existsSync(photoPath), 'le fichier traité existe sur le disque');

  const meta = await sharp(photoPath).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.ok(meta.width <= 1600 && meta.height <= 1600);
  assert.equal(meta.exif, undefined, 'les métadonnées EXIF doivent être supprimées');

  const photoRes = await request(photoUrl);
  expectStatus(photoRes, 200, 'service de la photo');
  assert.match(photoRes.headers.get('content-type') || '', /image\/jpeg/);
  assert.match(photoRes.headers.get('cache-control') || '', /immutable/);

  const publicList = await request(`/api/annonces?q=${encodeURIComponent('Rencontre test premium')}`);
  assert.ok(!publicList.json.annonces.some((a) => a.id === adId), 'une annonce en attente reste privée');

  expectError(await request(`/api/annonces/${adId}`), 404, /introuvable/i, 'détail anonyme en attente');
  expectError(
    await request(`/api/annonces/${adId}`, { token: accounts.user2.token }),
    404,
    /introuvable/i,
    'détail par un tiers en attente'
  );

  const owner = await request(`/api/annonces/${adId}`, { token: accounts.user1.token });
  expectStatus(owner, 200, 'détail par le propriétaire');
  assert.equal(owner.json.annonce.status, 'pending');

  const mine = await request('/api/annonces/mine', { token: accounts.user1.token });
  expectStatus(mine, 200, 'mes annonces');
  assert.ok(mine.json.annonces.some((a) => a.id === adId && a.status === 'pending'));

  expectError(
    await request(`/api/annonces/${adId}`, {
      method: 'PATCH',
      token: accounts.user2.token,
      body: { title: 'Titre pirate' },
    }),
    403,
    /refusé/i,
    'modification par un tiers'
  );
});

test('administration : modération, rôles, suspensions et protections', async () => {
  const loginAdmin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  expectStatus(loginAdmin, 200, 'connexion admin');
  assert.equal(loginAdmin.json.user.role, 'admin');
  adminToken = loginAdmin.json.token;
  adminId = loginAdmin.json.user.id;

  expectError(
    await request('/api/admin/stats', { token: accounts.user1.token }),
    403,
    /refusé/i,
    'console admin réservée'
  );
  expectError(await request('/api/admin/stats'), 401, /authentification/i, 'console admin anonyme');

  const stats = await request('/api/admin/stats', { token: adminToken });
  expectStatus(stats, 200, 'statistiques admin');
  assert.ok(stats.json.pending >= 1);
  assert.ok(stats.json.approved >= 6);
  assert.ok(stats.json.users >= 4);
  assert.ok(stats.json.premium >= 1);

  const pending = await request('/api/admin/annonces?status=pending', { token: adminToken });
  expectStatus(pending, 200, 'file de modération');
  const queued = pending.json.annonces.find((a) => a.id === adId);
  assert.ok(queued, 'l’annonce en attente est dans la file');
  assert.equal(queued.authorEmail, accounts.user1.email);
  assert.ok(queued.reportCount >= 0);

  const approve = await request(`/api/admin/annonces/${adId}/approve`, {
    method: 'POST',
    token: adminToken,
  });
  expectStatus(approve, 200, 'approbation');

  const publicDetail = await request(`/api/annonces/${adId}`);
  expectStatus(publicDetail, 200, 'annonce approuvée visible');
  assert.equal(publicDetail.json.annonce.status, 'approved');

  const edit = await request(`/api/annonces/${adId}`, {
    method: 'PATCH',
    token: accounts.user1.token,
    body: { title: 'Titre modifié après approbation' },
  });
  expectStatus(edit, 200, 'modification par le propriétaire');
  assert.equal(edit.json.annonce.status, 'pending', 'une modification repasse en modération');
  assert.equal(edit.json.annonce.title, 'Titre modifié après approbation');
  assert.equal(edit.json.annonce.rejectionReason, null);

  expectError(
    await request(`/api/admin/annonces/${adId}/reject`, {
      method: 'POST',
      token: adminToken,
      body: { reason: 'no' },
    }),
    400,
    /motif/i,
    'refus sans motif suffisant'
  );

  const reApprove = await request(`/api/admin/annonces/${adId}/approve`, {
    method: 'POST',
    token: adminToken,
  });
  expectStatus(reApprove, 200, 'seconde approbation');

  const reject = await request(`/api/admin/annonces/${adId}/reject`, {
    method: 'POST',
    token: adminToken,
    body: { reason: 'Photo non conforme aux règles de la communauté' },
  });
  expectStatus(reject, 200, 'refus motivé');

  const ownerView = await request(`/api/annonces/${adId}`, { token: accounts.user1.token });
  expectStatus(ownerView, 200, 'annonce refusée visible par son auteur');
  assert.equal(ownerView.json.annonce.status, 'rejected');
  assert.match(ownerView.json.annonce.rejectionReason, /Photo non conforme/);

  const mineAfterReject = await request('/api/annonces/mine', { token: accounts.user1.token });
  const rejected = mineAfterReject.json.annonces.find((a) => a.id === adId);
  assert.equal(rejected.status, 'rejected');
  assert.ok(rejected.rejectionReason);

  const finalApprove = await request(`/api/admin/annonces/${adId}/approve`, {
    method: 'POST',
    token: adminToken,
  });
  expectStatus(finalApprove, 200, 'remise en ligne');

  db.prepare("UPDATE users SET role = 'moderator' WHERE email = ?").run(accounts.user3.email);
  const modLogin = await login(accounts.user3.email, accounts.user3.password);
  expectStatus(modLogin, 200, 'connexion modérateur');
  assert.equal(modLogin.json.user.role, 'moderator');
  accounts.user3.token = modLogin.json.token;

  const modStats = await request('/api/admin/stats', { token: accounts.user3.token });
  expectStatus(modStats, 200, 'accès modérateur aux statistiques');
  expectError(
    await request(`/api/admin/users/${accounts.user2.id}/ban`, {
      method: 'POST',
      token: accounts.user3.token,
      body: { banned: true },
    }),
    403,
    /refusé/i,
    'suspension réservée aux admins'
  );

  expectError(
    await request(`/api/admin/users/${adminId}/ban`, {
      method: 'POST',
      token: adminToken,
      body: { banned: true },
    }),
    400,
    /administrateur|vous/i,
    'auto-suspension impossible'
  );

  const ban = await request(`/api/admin/users/${accounts.user2.id}/ban`, {
    method: 'POST',
    token: adminToken,
    body: { banned: true },
  });
  expectStatus(ban, 200, 'suspension user2');

  expectError(
    await request('/api/auth/me', { token: accounts.user2.token }),
    403,
    /suspendu/i,
    'jeton suspendu bloqué'
  );
  const bannedLogin = await login(accounts.user2.email, accounts.user2.password);
  expectError(bannedLogin, 403, /suspendu/i, 'connexion suspendue');
  assert.equal(bannedLogin.json.code, 'banned');

  const unban = await request(`/api/admin/users/${accounts.user2.id}/ban`, {
    method: 'POST',
    token: adminToken,
    body: { banned: false },
  });
  expectStatus(unban, 200, 'levée de suspension');
  const relogin = await login(accounts.user2.email, accounts.user2.password);
  expectStatus(relogin, 200, 'reconnexion après levée');
  accounts.user2.token = relogin.json.token;

  expectError(
    await request('/api/auth/me', {
      method: 'DELETE',
      token: adminToken,
      body: { password: ADMIN_PASSWORD },
    }),
    400,
    /dernier compte administrateur/i,
    'suppression du dernier admin impossible'
  );
});

test('signalements : motifs, propriété du contenu et doublons', async () => {
  const comment = await request('/api/comments/a1', {
    method: 'POST',
    token: accounts.user1.token,
    body: { content: 'Commentaire à signaler pour la modération de test.' },
  });
  expectStatus(comment, 201, 'commentaire à signaler');
  reportedCommentId = comment.json.comment.id;

  expectError(
    await request('/api/reports', {
      method: 'POST',
      body: { annonceId: 'a1', reason: 'contenu_illegal' },
    }),
    401,
    /authentification/i,
    'signalement anonyme'
  );

  expectError(
    await request('/api/reports', {
      method: 'POST',
      token: accounts.user2.token,
      body: { annonceId: 'a1', reason: 'motif_inconnu' },
    }),
    400,
    /motif/i,
    'motif invalide'
  );

  expectError(
    await request('/api/reports', {
      method: 'POST',
      token: accounts.user1.token,
      body: { annonceId: adId, reason: 'spam' },
    }),
    400,
    /votre propre annonce/i,
    'auto-signalement d’annonce'
  );

  expectError(
    await request('/api/reports', {
      method: 'POST',
      token: accounts.user1.token,
      body: { commentId: reportedCommentId, reason: 'spam' },
    }),
    400,
    /votre propre commentaire/i,
    'auto-signalement de commentaire'
  );

  const commentReport = await request('/api/reports', {
    method: 'POST',
    token: accounts.user2.token,
    body: { commentId: reportedCommentId, reason: 'harcelement', details: 'Propos insistants.' },
  });
  expectStatus(commentReport, 201, 'signalement de commentaire');

  expectError(
    await request('/api/reports', {
      method: 'POST',
      token: accounts.user2.token,
      body: { commentId: reportedCommentId, reason: 'harcelement' },
    }),
    409,
    /déjà signalé/i,
    'doublon de signalement'
  );

  const adReport = await request('/api/reports', {
    method: 'POST',
    token: accounts.user2.token,
    body: { annonceId: 'a1', reason: 'arnaque', details: 'Demande de paiement hors site.' },
  });
  expectStatus(adReport, 201, 'signalement d’annonce');
});

test('traitement des signalements : résolution et suppression du commentaire', async () => {
  const open = await request('/api/admin/reports?status=open', { token: adminToken });
  expectStatus(open, 200, 'liste des signalements ouverts');

  const adReport = open.json.reports.find(
    (r) => r.targetType === 'annonce' && r.annonceId === 'a1' && r.reason === 'arnaque'
  );
  const commentReport = open.json.reports.find(
    (r) => r.targetType === 'comment' && r.commentId === reportedCommentId
  );
  assert.ok(adReport, 'signalement d’annonce présent');
  assert.ok(commentReport, 'signalement de commentaire présent');
  assert.equal(commentReport.reasonLabel, 'Harcèlement');

  expectError(
    await request(`/api/admin/reports/${adReport.id}/resolve`, {
      method: 'POST',
      token: adminToken,
      body: { action: 'invalide' },
    }),
    400,
    /action/i,
    'action de résolution invalide'
  );

  const resolve = await request(`/api/admin/reports/${adReport.id}/resolve`, {
    method: 'POST',
    token: adminToken,
    body: { action: 'resolved', note: 'Annonce vérifiée, aucun manquement.' },
  });
  expectStatus(resolve, 200, 'résolution du signalement');

  const resolved = await request('/api/admin/reports?status=resolved', { token: adminToken });
  const resolvedAd = resolved.json.reports.find((r) => r.id === adReport.id);
  assert.ok(resolvedAd);
  assert.equal(resolvedAd.status, 'resolved');
  assert.match(resolvedAd.adminNote, /Annonce vérifiée/);

  const deleteComment = await request(`/api/comments/a1/${reportedCommentId}`, {
    method: 'DELETE',
    token: adminToken,
  });
  expectStatus(deleteComment, 200, 'suppression du commentaire signalé');

  const comments = await request('/api/comments/a1');
  assert.ok(!comments.json.comments.some((c) => c.id === reportedCommentId));

  const allReports = await request('/api/admin/reports?status=all', { token: adminToken });
  assert.ok(!allReports.json.reports.some((r) => r.id === commentReport.id), 'le signalement lié est supprimé');
});

test('compte : export RGPD, modification et suppression définitive', async () => {
  const exported = await request('/api/auth/me/export', { token: accounts.user3.token });
  expectStatus(exported, 200, 'export des données');
  assert.match(exported.headers.get('content-disposition') || '', /attachment/i);
  const data = JSON.parse(exported.text);
  assert.equal(data.account.email, accounts.user3.email);
  assert.ok(Array.isArray(data.annonces));
  assert.ok(Array.isArray(data.comments));
  assert.ok(Array.isArray(data.reports));
  assert.ok(data.exportedAt);

  const update = await request('/api/auth/me', {
    method: 'PATCH',
    token: accounts.user3.token,
    body: { pseudo: 'Lina_Nouveau' },
  });
  expectStatus(update, 200, 'modification du profil');
  assert.equal(update.json.user.pseudo, 'Lina_Nouveau');
  assert.equal(accounts.user3.pseudo, 'Lina_Test');

  expectError(
    await request('/api/auth/me', {
      method: 'PATCH',
      token: accounts.user3.token,
      body: { age: 12 },
    }),
    400,
    /18/,
    'âge invalide'
  );

  expectError(
    await request('/api/auth/me', {
      method: 'DELETE',
      token: accounts.user3.token,
      body: { password: 'MauvaisMotDePasse!' },
    }),
    401,
    /mot de passe/i,
    'suppression avec mauvais mot de passe'
  );

  const removed = await request('/api/auth/me', {
    method: 'DELETE',
    token: accounts.user3.token,
    body: { password: accounts.user3.password },
  });
  expectStatus(removed, 200, 'suppression du compte');

  expectError(
    await request('/api/auth/me', { token: accounts.user3.token }),
    401,
    /session/i,
    'jeton révoqué après suppression'
  );
  expectError(
    await login(accounts.user3.email, accounts.user3.password),
    401,
    /incorrect/i,
    'connexion après suppression'
  );
});

test('Stripe non configuré : dégradation propre sans paiement', async () => {
  const configRes = await request('/api/stripe/config');
  expectStatus(configRes, 200, 'configuration Stripe');
  assert.equal(configRes.json.configured, false);
  assert.equal(configRes.json.price, null);

  expectError(
    await request('/api/stripe/create-checkout-session', {
      method: 'POST',
      token: accounts.user2.token,
      body: { redirect: 'publier.html' },
    }),
    503,
    /configuré/i,
    'checkout sans Stripe'
  );

  expectError(
    await request('/api/stripe/portal', { method: 'POST', token: accounts.user2.token }),
    503,
    /configuré/i,
    'portail sans Stripe'
  );

  const webhook = await request('/api/stripe/webhook', {
    method: 'POST',
    body: { id: 'evt_test', type: 'checkout.session.completed', data: { object: {} } },
  });
  expectStatus(webhook, 503, 'webhook sans Stripe');
  assert.match(webhook.text, /Stripe non configuré/);
});
