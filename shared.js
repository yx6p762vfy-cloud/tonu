/* ═══════════════════════════════════════════
   tonú Privé — Shared JS
   Annonces · Compte · Premium · UI
   ═══════════════════════════════════════════ */

const SITE = {
  name: 'tonú Privé',
  tagline: 'Rencontres discrètes entre adultes',
  minAge: 18,
};

const PREMIUM_PRICE = 4990;
const PREMIUM_PRICE_DISPLAY = '4 990';

/* ── ANNONCES DÉMO ── */
const ANNONCES_DEMO = [
  {
    id: 'a1',
    title: 'Soirée complice en ville',
    pseudo: 'Amara_28',
    category: 'Rencontre',
    city: 'Abidjan',
    age: 28,
    gender: 'Femme',
    intention: 'Rencontre sérieuse',
    desc: 'Je cherche une connexion authentique, sans pression. Discrétion et respect mutuel. Premier contact par message sur la plateforme.',
    image: 'images/1.jpeg',
    createdAt: '2025-10-18',
    photos: ['images/1.jpeg'],
  },
  {
    id: 'a2',
    title: 'Sortie lounge & conversation',
    pseudo: 'Kofi_Paris',
    category: 'Sortie',
    city: 'Paris',
    age: 34,
    gender: 'Homme',
    intention: 'Sorties',
    desc: 'Envie d\'une soirée chill, bonne musique et échanges sincères. Profils majeurs uniquement, photos récentes appréciées.',
    image: 'images/2.jpeg',
    createdAt: '2025-10-17',
    photos: ['images/2.jpeg'],
  },
  {
    id: 'a3',
    title: 'Échanges libres et respectueux',
    pseudo: 'Lina_Bxl',
    category: 'Discussion',
    city: 'Bruxelles',
    age: 26,
    gender: 'Femme',
    intention: 'Discussion',
    desc: 'Ouverte aux discussions adultes, dans le respect des limites de chacun. Je réponds aux messages premium vérifiés en priorité.',
    image: 'images/3.jpeg',
    createdAt: '2025-10-16',
    photos: ['images/3.jpeg'],
  },
  {
    id: 'a4',
    title: 'Week-end escapade',
    pseudo: 'David_31',
    category: 'Rencontre',
    city: 'Lyon',
    age: 31,
    gender: 'Homme',
    intention: 'Rencontre',
    desc: 'Disponible pour un week-end à deux, hors agitation. Profil discret, je partage plus de détails après prise de contact.',
    image: 'images/2.jpeg',
    createdAt: '2025-10-15',
    photos: ['images/2.jpeg', 'images/3.jpeg'],
  },
  {
    id: 'a5',
    title: 'Couple ouvert — nouvelles rencontres',
    pseudo: 'M&J_ Duo',
    category: 'Couple',
    city: 'Dakar',
    age: 29,
    gender: 'Couple',
    intention: 'Couple',
    desc: 'Couple majeur, curieux et bienveillant. Nous cherchons des profils sincères pour des moments complices.',
    image: 'images/3.jpeg',
    createdAt: '2025-10-14',
    photos: ['images/3.jpeg'],
  },
  {
    id: 'a6',
    title: 'Afterwork & connexion',
    pseudo: 'Nadia_33',
    category: 'Sortie',
    city: 'Montpellier',
    age: 33,
    gender: 'Femme',
    intention: 'Sorties',
    desc: 'Après le travail, j\'aime décompresser autour d\'un verre. Si le feeling passe, on verra la suite ensemble.',
    image: 'images/1.jpeg',
    createdAt: '2025-10-12',
    photos: ['images/1.jpeg'],
  },
];

const CLOTH_COLORS = ['#C8973A', '#EFE8D8', '#3D6E56', '#4D3018', '#EDD98A', '#1A3A2A'];
const BG_GRADS = [
  'linear-gradient(160deg,#1E3D2F,#0A1A10)',
  'linear-gradient(160deg,#2E1A08,#4D3018)',
  'linear-gradient(160deg,#0C0C1C,#1A1A38)',
  'linear-gradient(160deg,#1E1208,#3A2210)',
  'linear-gradient(160deg,#2D5240,#1E3D2F)',
  'linear-gradient(160deg,#0A1E14,#1A3A2A)',
];

function getProductBg(idx) { return BG_GRADS[idx % BG_GRADS.length]; }
function getProductCloth(idx) { return CLOTH_COLORS[idx % CLOTH_COLORS.length]; }

/** @deprecated — compat listing legacy */
const PRODUCTS = ANNONCES_DEMO;

let _annoncesCache = null;
let _apiOnline = true;

function getAllAnnonces() {
  return _annoncesCache || [];
}

function findAnnonce(id) {
  return getAllAnnonces().find((a) => a.id === id);
}

async function fetchAllAnnonces(force = false) {
  if (_annoncesCache && !force) return _annoncesCache;
  try {
    const { annonces } = await API.listAnnonces();
    _annoncesCache = annonces;
    _apiOnline = true;
    return annonces;
  } catch (e) {
    _apiOnline = false;
    if (!_annoncesCache) _annoncesCache = [...ANNONCES_DEMO];
    throw e;
  }
}

/* ── AUTH (API + JWT) ── */
const AUTH = {
  _user: null,

  currentUser() {
    return this._user;
  },

  isLoggedIn() {
    return !!this._user;
  },

  hasPremium() {
    return !!this._user?.hasPremium;
  },

  async refresh() {
    if (!API.getToken()) {
      this._user = null;
      return null;
    }
    try {
      const { user } = await API.me();
      this._user = user;
      return user;
    } catch {
      API.setToken(null);
      this._user = null;
      return null;
    }
  },

  async register({ email, password, pseudo, age }) {
    try {
      const data = await API.register({ email, password, pseudo, age: Number(age) });
      API.setToken(data.token);
      this._user = data.user;
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e.message || 'Inscription impossible' };
    }
  },

  async login(email, password) {
    try {
      const data = await API.login({ email, password });
      API.setToken(data.token);
      this._user = data.user;
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e.message || 'Connexion impossible' };
    }
  },

  logout() {
    API.setToken(null);
    this._user = null;
    this.updateNavLabel();
  },

  updateNavLabel() {
    const el = document.querySelector('.nav-account-label');
    const u = this.currentUser();
    if (el) {
      el.textContent = u ? (this.hasPremium() ? `${u.pseudo} · Premium` : u.pseudo) : 'Compte';
    }
    const pub = document.querySelector('.nav-publish-hint');
    if (pub) pub.style.display = this.hasPremium() ? 'none' : 'inline';
    const adminLink = document.getElementById('nav-admin-link');
    if (adminLink) {
      adminLink.style.display =
        u && (u.role === 'admin' || u.role === 'moderator') ? 'flex' : 'none';
    }
  },
};

async function bootApp() {
  await AUTH.refresh();
  AUTH.updateNavLabel();
  try {
    await fetchAllAnnonces(true);
  } catch {
    showToast('API hors ligne — données de démo affichées', 'error');
  }
}

/* ── NAVIGATION ── */
/* ── NAV ── */
function initNav() {
  const nav = document.querySelector('.main-nav');
  window.addEventListener(
    'scroll',
    () => {
      if (!nav) return;
      nav.classList.toggle('scrolled', scrollY > 10);
      const prog = document.getElementById('scroll-prog');
      if (prog) prog.style.transform = `scaleX(${scrollY / (document.body.scrollHeight - innerHeight)})`;
    },
    { passive: true }
  );

  const ham = document.getElementById('ham-btn');
  const mob = document.getElementById('mob-overlay');
  if (ham && mob) {
    ham.addEventListener('click', () => {
      ham.classList.toggle('open');
      mob.classList.toggle('open');
      document.body.style.overflow = mob.classList.contains('open') ? 'hidden' : '';
    });
    mob.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => {
        ham.classList.remove('open');
        mob.classList.remove('open');
        document.body.style.overflow = '';
      })
    );
  }
  AUTH.updateNavLabel();
}

function initReveal() {
  const obs = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add('vis');
    }),
    { threshold: 0.05, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `sw-toast ${type}`;
  t.innerHTML = `<span class="ti">${type === 'success' ? '✓' : '✕'}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 3200);
}

/* ── AGE GATE ── */
function initAgeGate() {
  if (localStorage.getItem('tonu_age_ok') === '1') return;
  const overlay = document.createElement('div');
  overlay.className = 'age-gate';
  overlay.innerHTML = `
    <div class="age-gate-box reveal vis">
      <div class="age-gate-badge">18+</div>
      <h2>Contenu réservé aux adultes</h2>
      <p>${SITE.name} est une plateforme de rencontres entre personnes majeures. En entrant, vous confirmez avoir au moins ${SITE.minAge} ans et acceptez nos conditions d'utilisation.</p>
      <div class="age-gate-actions">
        <button type="button" class="btn btn-primary" id="age-ok"><span>J'ai ${SITE.minAge} ans ou plus</span></button>
        <button type="button" class="btn btn-secondary" id="age-leave"><span>Quitter</span></button>
      </div>
      <p class="age-gate-note">Usage responsable · Modération des annonces · Données hébergées sur le serveur</p>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  overlay.querySelector('#age-ok').addEventListener('click', () => {
    localStorage.setItem('tonu_age_ok', '1');
    overlay.remove();
    document.body.style.overflow = '';
  });
  overlay.querySelector('#age-leave').addEventListener('click', () => {
    window.location.href = 'https://www.google.com';
  });
}

function requireLogin(redirectTo) {
  if (AUTH.isLoggedIn()) return true;
  showToast('Connecte-toi pour continuer', 'error');
  setTimeout(() => {
    window.location.href = `compte.html?redirect=${encodeURIComponent(redirectTo || location.pathname)}`;
  }, 600);
  return false;
}

function requirePremium(redirectTo) {
  if (!requireLogin(redirectTo)) return false;
  if (AUTH.hasPremium()) return true;
  showToast('Abonnement Premium requis pour publier', 'error');
  setTimeout(() => {
    window.location.href = `premium.html?redirect=${encodeURIComponent(redirectTo || 'publier.html')}`;
  }, 700);
  return false;
}

/* ── ANNONCE CARD ── */
function renderAnnonceCard(a, idx) {
  const imgSrc = a.image || (a.photos && a.photos[0]) || '';
  const imgHTML = imgSrc
    ? `<img src="${imgSrc}" alt="${a.title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const clothHTML = `<div class="pc-cloth" style="background:${CLOTH_COLORS[idx % CLOTH_COLORS.length]};display:${imgSrc ? 'none' : 'block'}"></div>`;
  const badge =
    a.status === 'pending' ? 'En attente' : a.userPosted ? 'Nouveau' : a.category;

  return `<a class="pc reveal d${(idx % 4) + 1}" href="product.html?id=${a.id}">
    <div class="pc-img" style="background:${BG_GRADS[idx % BG_GRADS.length]}">
      ${imgHTML}
      <div class="pc-img-placeholder" style="display:${imgSrc ? 'none' : 'flex'}">${clothHTML}</div>
      <div class="pc-badge">${badge}</div>
    </div>
    <div class="pc-info">
      <div class="pc-brand">${a.pseudo} · ${a.age} ans</div>
      <div class="pc-name">${a.title}</div>
      <div class="pc-meta-row">
        <span class="pc-meta">${a.city}</span>
        <span class="pc-meta">${a.intention || a.category}</span>
      </div>
    </div>
  </a>`;
}

function renderProductCard(p, idx) {
  return renderAnnonceCard(p, idx);
}

function buildNavHTML({ activePage = '' } = {}) {
  return `
  <div id="cur-dot"></div><div id="cur-ring"></div>
  <div id="scroll-prog"></div>

  <div class="top-bar">
    <div class="top-bar-marquee">
      <div class="top-bar-marquee-inner">
        <span class="top-bar-item"><span class="dot">✦</span> ${SITE.minAge}+ uniquement · discrétion garantie</span>
        <span class="top-bar-item"><span class="dot">✦</span> Publier une annonce avec photo — abonnement Premium</span>
        <span class="top-bar-item"><span class="dot">✦</span> Parcourir les annonces gratuitement</span>
        <span class="top-bar-item"><span class="dot">✦</span> Paiement sécurisé Stripe</span>
        <span class="top-bar-item"><span class="dot">✦</span> ${SITE.minAge}+ uniquement · discrétion garantie</span>
        <span class="top-bar-item"><span class="dot">✦</span> Publier une annonce avec photo — abonnement Premium</span>
        <span class="top-bar-item"><span class="dot">✦</span> Parcourir les annonces gratuitement</span>
        <span class="top-bar-item"><span class="dot">✦</span> Paiement sécurisé Stripe</span>
      </div>
    </div>
    <div class="top-bar-right">
      <a href="premium.html" class="top-bar-link">Pass Premium</a>
      <a href="compte.html" class="top-bar-link">Aide</a>
    </div>
  </div>

  <nav class="main-nav" id="main-nav">
    <div class="nav-inner">
      <a href="index.html" class="nav-logo">
        <img src="TonuIcon.jpeg" alt="${SITE.name}" class="nav-logo-img"/>
      </a>
      <ul class="nav-links">
        <li class="${activePage === 'annonces' ? 'active' : ''}">
          <a href="product.html">Annonces</a>
        </li>
        <li class="${activePage === 'publier' ? 'active' : ''}">
          <a href="publier.html">Publier <span class="nav-publish-hint">Premium</span></a>
        </li>
        <li class="${activePage === 'premium' ? 'active' : ''}">
          <a href="premium.html">Premium</a>
        </li>
        <li><a href="product.html?cat=rencontre">Rencontres</a></li>
        <li><a href="product.html?cat=sortie">Sorties</a></li>
        <li><a href="product.html?cat=couple">Couples</a></li>
        <li id="nav-admin-link" style="display:none"><a href="admin.html">Modération</a></li>
      </ul>
      <div class="nav-actions">
        <a href="compte.html" class="nav-action-btn account-btn" title="Mon compte">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
          <span class="nav-account-label">Compte</span>
        </a>
        <button class="ham-btn" id="ham-btn" aria-label="Menu">
          <span class="ham-line"></span>
          <span class="ham-line"></span>
          <span class="ham-line"></span>
        </button>
      </div>
    </div>
  </nav>

  <div class="mob-overlay" id="mob-overlay">
    <ul class="mob-nav-links">
      <li><a href="index.html">Accueil <span>→</span></a></li>
      <li><a href="product.html">Annonces <span>→</span></a></li>
      <li><a href="publier.html">Publier <span>→</span></a></li>
      <li><a href="premium.html">Premium <span>→</span></a></li>
      <li><a href="compte.html">Mon compte <span>→</span></a></li>
    </ul>
  </div>`;
}

function buildFooterHTML() {
  return `
  <footer>
    <div class="footer-top">
      <div class="footer-col">
        <div class="footer-logo-row">
          <img src="TonuIcon.jpeg" alt="${SITE.name}" class="footer-logo-img"/>
        </div>
        <p class="footer-tagline">${SITE.tagline}. Parcourez les annonces gratuitement ; publiez la vôtre avec photos grâce au Pass Premium.</p>
        <div class="footer-social">
          <a href="#" class="fsoc">ig</a>
          <a href="#" class="fsoc">fb</a>
          <a href="#" class="fsoc">x</a>
        </div>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">Plateforme</div>
        <ul>
          <li><a href="product.html">Toutes les annonces</a></li>
          <li><a href="publier.html">Publier une annonce</a></li>
          <li><a href="premium.html">Pass Premium</a></li>
          <li><a href="compte.html">Mon compte</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">Catégories</div>
        <ul>
          <li><a href="product.html?cat=rencontre">Rencontres</a></li>
          <li><a href="product.html?cat=sortie">Sorties</a></li>
          <li><a href="product.html?cat=discussion">Discussion</a></li>
          <li><a href="product.html?cat=couple">Couples</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">Sécurité</div>
        <ul>
          <li><a href="#">Signaler un profil</a></li>
          <li><a href="#">Conseils de prudence</a></li>
          <li><a href="#">FAQ</a></li>
          <li><a href="#">Contact</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">Légal</div>
        <ul>
          <li><a href="#">Mentions légales</a></li>
          <li><a href="#">Confidentialité</a></li>
          <li><a href="#">CGU adultes</a></li>
          <li><a href="#">Cookies</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span class="footer-copy">© 2025 ${SITE.name}. Réservé aux ${SITE.minAge}+.</span>
      <div class="footer-legal">
        <a href="#">Mentions légales</a>
        <a href="#">Confidentialité</a>
        <a href="#">CGU</a>
      </div>
    </div>
  </footer>`;
}

function initShared() {
  initAgeGate();
  initNav();
  initReveal();
}
