/* ═══════════════════════════════════════════
   tonú Privé — Shared JS
   Annonces · Compte · Premium · UI
   ═══════════════════════════════════════════ */

const SITE = {
  name: 'tonú Privé',
  tagline: 'Rencontres discrètes entre adultes',
  minAge: 18,
};

const CLOTH_COLORS = ['#8B5CF6', '#D8D2EA', '#3B2A5A', '#5A1E3A', '#C9B3FF', '#23163A'];
const BG_GRADS = [
  'linear-gradient(160deg,#241043,#0B0714)',
  'linear-gradient(160deg,#3A0F26,#160711)',
  'linear-gradient(160deg,#0C0C1C,#1A1A38)',
  'linear-gradient(160deg,#2A0E1E,#3A1226)',
  'linear-gradient(160deg,#2A1748,#1A0F2E)',
  'linear-gradient(160deg,#180A2E,#2A0F3A)',
];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function safeRedirect(value, fallback = 'index.html') {
  if (!value) return fallback;
  try {
    const url = new URL(String(value), window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    const rel = `${url.pathname.replace(/^\/+/, '')}${url.search}${url.hash}`;
    return rel || fallback;
  } catch {
    return fallback;
  }
}

function currentPath() {
  return safeRedirect(`${window.location.pathname}${window.location.search}${window.location.hash}`, 'index.html');
}

function formatDate(value) {
  if (!value) return '';
  let str = String(value);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) str = `${str.replace(' ', 'T')}Z`;
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(status) {
  return { pending: 'En attente', approved: 'Publiée', rejected: 'Refusée' }[status] || status;
}

function getProductBg(idx) { return BG_GRADS[idx % BG_GRADS.length]; }
function getProductCloth(idx) { return CLOTH_COLORS[idx % CLOTH_COLORS.length]; }

/* ── CACHE ANNONCES ── */
let _annoncesCache = null;

function getAllAnnonces() {
  return _annoncesCache || [];
}

function findAnnonce(id) {
  return getAllAnnonces().find((a) => a.id === id) || null;
}

async function fetchAllAnnonces(force = false) {
  if (_annoncesCache && !force) return _annoncesCache;
  const { annonces } = await API.listAnnonces({ limit: 24 });
  _annoncesCache = annonces;
  return annonces;
}

/* ── AUTH ── */
const AUTH = {
  _user: null,

  currentUser() { return this._user; },
  isLoggedIn() { return !!this._user; },
  hasPremium() { return !!this._user?.hasPremium; },
  isStaff() { return !!this._user && ['admin', 'moderator'].includes(this._user.role); },

  async refresh() {
    if (!API.getToken()) {
      this._user = null;
      return null;
    }
    try {
      const { user } = await API.me();
      this._user = user;
      return user;
    } catch (err) {
      if (err.status === 401 || err.status === 403) API.setToken(null);
      this._user = null;
      return null;
    }
  },

  async register({ email, password, pseudo, age, acceptTerms }) {
    try {
      const data = await API.register({ email, password, pseudo, age: Number(age), acceptTerms });
      API.setToken(data.token);
      this._user = data.user;
      return { ok: true };
    } catch (err) {
      return { ok: false, msg: err.message || 'Inscription impossible' };
    }
  },

  async login(email, password) {
    try {
      const data = await API.login({ email, password });
      API.setToken(data.token);
      this._user = data.user;
      return { ok: true };
    } catch (err) {
      return { ok: false, msg: err.message || 'Connexion impossible' };
    }
  },

  logout() {
    API.setToken(null);
    this._user = null;
    this.updateNavLabel();
  },

  async updateProfile(payload) {
    const { user } = await API.updateProfile(payload);
    this._user = user;
    this.updateNavLabel();
    return user;
  },

  updateNavLabel() {
    const user = this.currentUser();
    const label = user ? user.pseudo : 'Compte';
    document.querySelectorAll('.nav-account-label').forEach((el) => {
      el.textContent = user && user.hasPremium ? `${label} · Premium` : label;
    });
    document.querySelectorAll('.nav-publish-hint').forEach((el) => {
      el.style.display = this.hasPremium() ? 'none' : 'inline';
    });
    document.querySelectorAll('.nav-admin-link').forEach((el) => {
      el.style.display = this.isStaff() ? '' : 'none';
    });
  },
};

async function bootApp() {
  await AUTH.refresh();
  AUTH.updateNavLabel();
  try {
    await fetchAllAnnonces(true);
  } catch (err) {
    if (err.status !== 401) {
      showToast(err.message || 'Serveur indisponible — réessayez', 'error');
    }
  }
}

/* ── NAVIGATION ── */
function initNav() {
  const nav = document.querySelector('.main-nav');
  const prog = document.getElementById('scroll-prog');

  const onScroll = () => {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
    if (prog) {
      const max = document.body.scrollHeight - window.innerHeight;
      prog.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0})`;
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const ham = document.getElementById('ham-btn');
  const mob = document.getElementById('mob-overlay');
  if (ham && mob) {
    const toggle = (open) => {
      ham.classList.toggle('open', open);
      mob.classList.toggle('open', open);
      ham.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    };
    ham.setAttribute('aria-expanded', 'false');
    ham.addEventListener('click', () => toggle(!mob.classList.contains('open')));
    mob.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggle(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mob.classList.contains('open')) toggle(false);
    });
  }
  AUTH.updateNavLabel();
}

let revealObserver = null;
let revealScheduled = false;

function revealPassedElements() {
  const limit = window.innerHeight * 0.95;
  document.querySelectorAll('.reveal:not(.vis)').forEach((el) => {
    if (el.getBoundingClientRect().top < limit) {
      el.classList.add('vis');
      revealObserver?.unobserve(el);
    }
  });
}

function queueRevealPass() {
  if (revealScheduled) return;
  revealScheduled = true;
  requestAnimationFrame(() => {
    revealScheduled = false;
    revealPassedElements();
  });
}

function initReveal() {
  const elements = document.querySelectorAll('.reveal:not(.vis)');
  if (!('IntersectionObserver' in window)) {
    elements.forEach((el) => el.classList.add('vis'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('vis');
          revealObserver.unobserve(entry.target);
        }
      }),
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' }
    );
    window.addEventListener('scroll', queueRevealPass, { passive: true });
    window.addEventListener('resize', queueRevealPass, { passive: true });
  }
  elements.forEach((el) => revealObserver.observe(el));
  revealPassedElements();
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `sw-toast ${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  const icon = document.createElement('span');
  icon.className = 'ti';
  icon.textContent = type === 'success' ? '✓' : '✕';
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(icon, text);
  document.body.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3600);
}

/* ── DIALOGUES ── */
function modalShell(title) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="modal-close" aria-label="Fermer">✕</button>
      </div>
      <div class="modal-body"></div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('open'));
  const close = () => {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector('.modal-close').addEventListener('click', () => {
    overlay.dispatchEvent(new CustomEvent('modal-cancel'));
    close();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.dispatchEvent(new CustomEvent('modal-cancel'));
      close();
    }
  });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' && overlay.isConnected) {
      overlay.dispatchEvent(new CustomEvent('modal-cancel'));
      close();
      document.removeEventListener('keydown', onKey);
    }
  });
  return { overlay, body: overlay.querySelector('.modal-body'), close };
}

function promptDialog({ title, label = '', placeholder = '', confirmLabel = 'Confirmer', required = true }) {
  return new Promise((resolve) => {
    const { overlay, body, close } = modalShell(title);
    body.innerHTML = `
      <form class="modal-form">
        ${label ? `<div class="field"><label>${esc(label)}</label>` : '<div class="field">'}
          <textarea name="value" placeholder="${esc(placeholder)}" maxlength="500" ${required ? 'required' : ''}></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary modal-cancel"><span>Annuler</span></button>
          <button type="submit" class="btn btn-primary"><span>${esc(confirmLabel)}</span></button>
        </div>
      </form>`;
    const input = body.querySelector('textarea');
    const settle = (value) => {
      overlay.removeEventListener('modal-cancel', onCancel);
      close();
      resolve(value);
    };
    const onCancel = () => settle(null);
    overlay.addEventListener('modal-cancel', onCancel);
    body.querySelector('.modal-cancel').addEventListener('click', () => settle(null));
    body.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (required && !value) return;
      settle(value);
    });
    setTimeout(() => input.focus(), 50);
  });
}

function confirmDialog(message, { title = 'Confirmation', confirmLabel = 'Confirmer', danger = false } = {}) {
  return new Promise((resolve) => {
    const { overlay, body, close } = modalShell(title);
    body.innerHTML = `
      <p class="modal-text">${esc(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel"><span>Annuler</span></button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} modal-confirm"><span>${esc(confirmLabel)}</span></button>
      </div>`;
    let done = false;
    const settle = (value) => {
      if (done) return;
      done = true;
      close();
      resolve(value);
    };
    overlay.addEventListener('modal-cancel', () => settle(false));
    body.querySelector('.modal-cancel').addEventListener('click', () => settle(false));
    body.querySelector('.modal-confirm').addEventListener('click', () => settle(true));
  });
}

/* ── AGE GATE ── */
function initAgeGate() {
  try {
    if (localStorage.getItem('tonu_age_ok') === '1') return;
  } catch { /* stockage indisponible */ }

  const overlay = document.createElement('div');
  overlay.className = 'age-gate';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Confirmation de majorité');
  overlay.innerHTML = `
    <div class="age-gate-box">
      <div class="age-gate-badge">18+</div>
      <h2>Contenu réservé aux adultes</h2>
      <p>${SITE.name} est une plateforme de rencontres entre personnes majeures. En entrant, vous confirmez avoir au moins ${SITE.minAge} ans et accepter les <a href="cgu.html">CGU</a> et la <a href="confidentialite.html">politique de confidentialité</a>.</p>
      <div class="age-gate-actions">
        <button type="button" class="btn btn-primary" id="age-ok"><span>J'ai ${SITE.minAge} ans ou plus</span></button>
        <button type="button" class="btn btn-secondary" id="age-leave"><span>Quitter</span></button>
      </div>
      <p class="age-gate-note">Usage responsable · Modération des annonces · Signalement disponible</p>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  overlay.querySelector('#age-ok').addEventListener('click', () => {
    try { localStorage.setItem('tonu_age_ok', '1'); } catch { /* ignore */ }
    overlay.remove();
    document.body.style.overflow = '';
  });
  overlay.querySelector('#age-leave').addEventListener('click', () => {
    window.location.href = 'https://www.google.com';
  });
}

function loginUrl(redirectTo) {
  return `compte.html?redirect=${encodeURIComponent(safeRedirect(redirectTo || currentPath()))}`;
}

function requireLogin(redirectTo) {
  if (AUTH.isLoggedIn()) return true;
  showToast('Connecte-toi pour continuer', 'error');
  setTimeout(() => { window.location.href = loginUrl(redirectTo); }, 600);
  return false;
}

function requirePremium(redirectTo) {
  if (!requireLogin(redirectTo)) return false;
  if (AUTH.hasPremium()) return true;
  showToast('Abonnement Premium requis pour publier', 'error');
  setTimeout(() => {
    const target = safeRedirect(redirectTo || 'publier.html', 'publier.html');
    window.location.href = `premium.html?redirect=${encodeURIComponent(target)}`;
  }, 700);
  return false;
}

/* ── CARTES ANNONCES ── */
function renderAnnonceCard(a, idx) {
  const imgSrc = a.image || (a.photos && a.photos[0]) || '';
  const imgHTML = imgSrc
    ? `<img src="${esc(imgSrc)}" alt="${esc(a.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const badge = a.status && a.status !== 'approved' ? statusLabel(a.status) : a.category;
  const commentMeta = a.commentCount
    ? `<span class="pc-meta">${a.commentCount} commentaire${a.commentCount > 1 ? 's' : ''}</span>`
    : '';

  return `<a class="pc reveal d${(idx % 4) + 1}" href="product.html?id=${encodeURIComponent(a.id)}">
    <div class="pc-img" style="background:${BG_GRADS[idx % BG_GRADS.length]}">
      ${imgHTML}
      <div class="pc-img-placeholder" style="display:${imgSrc ? 'none' : 'flex'}">
        <div class="pc-cloth" style="background:${CLOTH_COLORS[idx % CLOTH_COLORS.length]}"></div>
      </div>
      <div class="pc-badge">${esc(badge || 'Annonce')}</div>
    </div>
    <div class="pc-info">
      <div class="pc-brand">${esc(a.pseudo)}${a.age ? ` · ${esc(a.age)} ans` : ''}</div>
      <div class="pc-name">${esc(a.title)}</div>
      <div class="pc-meta-row">
        <span class="pc-meta">${esc(a.city)}</span>
        <span class="pc-meta">${esc(a.intention || a.category)}</span>
        ${commentMeta}
      </div>
    </div>
  </a>`;
}

function renderEmptyState(message, { colspan = 1 } = {}) {
  return `<div class="empty-state" style="grid-column:span ${colspan}">${esc(message)}</div>`;
}

function buildNavHTML({ activePage = '' } = {}) {
  return `
  <div id="scroll-prog"></div>

  <div class="top-bar">
    <div class="top-bar-marquee">
      <div class="top-bar-marquee-inner">
        <span class="top-bar-item"><span class="dot">✦</span> ${SITE.minAge}+ uniquement · discrétion et respect</span>
        <span class="top-bar-item"><span class="dot">✦</span> Publication avec photos réservée aux membres Premium</span>
        <span class="top-bar-item"><span class="dot">✦</span> Consulter et commenter gratuitement</span>
        <span class="top-bar-item"><span class="dot">✦</span> Paiement sécurisé Stripe</span>
        <span class="top-bar-item"><span class="dot">✦</span> ${SITE.minAge}+ uniquement · discrétion et respect</span>
        <span class="top-bar-item"><span class="dot">✦</span> Publication avec photos réservée aux membres Premium</span>
        <span class="top-bar-item"><span class="dot">✦</span> Consulter et commenter gratuitement</span>
        <span class="top-bar-item"><span class="dot">✦</span> Paiement sécurisé Stripe</span>
      </div>
    </div>
    <div class="top-bar-right">
      <a href="premium.html" class="top-bar-link">Pass Premium</a>
      <a href="faq.html" class="top-bar-link">Aide</a>
    </div>
  </div>

  <nav class="main-nav" id="main-nav">
    <div class="nav-inner">
      <a href="index.html" class="nav-logo" aria-label="${SITE.name} — accueil">
        <img src="TonuIcon.jpeg" alt="${SITE.name}" class="nav-logo-img"/>
      </a>
      <ul class="nav-links">
        <li class="${activePage === 'annonces' ? 'active' : ''}"><a href="product.html">Annonces</a></li>
        <li class="${activePage === 'publier' ? 'active' : ''}">
          <a href="publier.html">Publier <span class="nav-publish-hint">Premium</span></a>
        </li>
        <li class="${activePage === 'premium' ? 'active' : ''}"><a href="premium.html">Premium</a></li>
        <li><a href="product.html?cat=Rencontre">Rencontres</a></li>
        <li><a href="product.html?cat=Sortie">Sorties</a></li>
        <li><a href="product.html?cat=Couple">Couples</a></li>
        <li class="nav-admin-link"><a href="admin.html">Modération</a></li>
      </ul>
      <div class="nav-actions">
        <a href="compte.html" class="nav-action-btn account-btn" title="Mon compte">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
          <span class="nav-account-label">Compte</span>
        </a>
        <button class="ham-btn" id="ham-btn" aria-label="Menu" aria-controls="mob-overlay">
          <span class="ham-line"></span><span class="ham-line"></span><span class="ham-line"></span>
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
      <li class="nav-admin-link"><a href="admin.html">Modération <span>→</span></a></li>
    </ul>
  </div>`;
}

function buildFooterHTML() {
  const year = new Date().getFullYear();
  return `
  <footer>
    <div class="footer-top">
      <div class="footer-col">
        <div class="footer-logo-row">
          <img src="TonuIcon.jpeg" alt="${SITE.name}" class="footer-logo-img"/>
        </div>
        <p class="footer-tagline">${SITE.tagline}. Consultez les annonces gratuitement ; publiez la vôtre avec photos grâce au Pass Premium. Contenu réservé aux personnes majeures.</p>
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
          <li><a href="product.html?cat=Rencontre">Rencontres</a></li>
          <li><a href="product.html?cat=Sortie">Sorties</a></li>
          <li><a href="product.html?cat=Discussion">Discussion</a></li>
          <li><a href="product.html?cat=Couple">Couples</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">Sécurité</div>
        <ul>
          <li><a href="product.html">Signaler un profil</a></li>
          <li><a href="securite.html">Conseils de prudence</a></li>
          <li><a href="faq.html">FAQ</a></li>
          <li><a href="contact.html">Contact</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <div class="footer-col-title">Légal</div>
        <ul>
          <li><a href="mentions-legales.html">Mentions légales</a></li>
          <li><a href="confidentialite.html">Confidentialité</a></li>
          <li><a href="cgu.html">CGU adultes</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span class="footer-copy">© ${year} ${SITE.name}. Réservé aux ${SITE.minAge}+.</span>
      <div class="footer-legal">
        <a href="mentions-legales.html">Mentions légales</a>
        <a href="confidentialite.html">Confidentialité</a>
        <a href="cgu.html">CGU</a>
      </div>
    </div>
  </footer>`;
}

function initShared() {
  initAgeGate();
  initNav();
  initReveal();
}

let _siteMeta = null;
async function getSiteMeta() {
  if (_siteMeta) return _siteMeta;
  try {
    _siteMeta = await API.meta();
  } catch {
    _siteMeta = { supportEmail: 'contact@example.com', minAge: 18 };
  }
  return _siteMeta;
}

async function applySupportEmail() {
  const meta = await getSiteMeta();
  document.querySelectorAll('[data-support-email]').forEach((el) => {
    el.textContent = meta.supportEmail;
  });
  document.querySelectorAll('[data-support-link]').forEach((el) => {
    el.href = `mailto:${meta.supportEmail}`;
  });
}
