/* Client API — même origine que le serveur Express */
const API = {
  tokenKey: 'tonu_jwt',

  getToken() {
    return localStorage.getItem(this.tokenKey);
  },

  setToken(token) {
    if (token) localStorage.setItem(this.tokenKey, token);
    else localStorage.removeItem(this.tokenKey);
  },

  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body === 'object') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    const res = await fetch(path, { ...options, headers, body });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || res.statusText };
    }
    if (!res.ok) {
      const err = new Error(data?.error || 'Erreur API');
      err.status = res.status;
      err.code = data?.code;
      err.data = data;
      throw err;
    }
    return data;
  },

  /* ── Auth / compte ── */
  register(payload) {
    return this.request('/api/auth/register', { method: 'POST', body: payload });
  },
  login(payload) {
    return this.request('/api/auth/login', { method: 'POST', body: payload });
  },
  me() {
    return this.request('/api/auth/me');
  },
  updateProfile(payload) {
    return this.request('/api/auth/me', { method: 'PATCH', body: payload });
  },
  changePassword(payload) {
    return this.request('/api/auth/me/password', { method: 'POST', body: payload });
  },
  async exportData() {
    const res = await fetch('/api/auth/me/export', {
      headers: { Authorization: `Bearer ${this.getToken()}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Export impossible');
    }
    return res.text();
  },
  deleteAccount(password) {
    return this.request('/api/auth/me', { method: 'DELETE', body: { password } });
  },

  /* ── Annonces ── */
  listAnnonces(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.set(key, value);
    });
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.request(`/api/annonces${suffix}`);
  },
  getAnnonce(id) {
    return this.request(`/api/annonces/${encodeURIComponent(id)}`);
  },
  myAnnonces() {
    return this.request('/api/annonces/mine');
  },
  createAnnonce(formData) {
    return this.request('/api/annonces', { method: 'POST', body: formData });
  },
  updateAnnonce(id, formData) {
    return this.request(`/api/annonces/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: formData,
    });
  },
  deleteAnnonce(id) {
    return this.request(`/api/annonces/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  /* ── Commentaires ── */
  listComments(annonceId) {
    return this.request(`/api/comments/${encodeURIComponent(annonceId)}`);
  },
  createComment(annonceId, content, parentId = null) {
    return this.request(`/api/comments/${encodeURIComponent(annonceId)}`, {
      method: 'POST',
      body: { content, parentId },
    });
  },
  deleteComment(annonceId, commentId) {
    return this.request(
      `/api/comments/${encodeURIComponent(annonceId)}/${encodeURIComponent(commentId)}`,
      { method: 'DELETE' }
    );
  },

  /* ── Signalements ── */
  reportContent(payload) {
    return this.request('/api/reports', { method: 'POST', body: payload });
  },

  /* ── Stripe ── */
  stripeConfig() {
    return this.request('/api/stripe/config');
  },
  createCheckoutSession(plan, redirect) {
    return this.request('/api/stripe/create-checkout-session', {
      method: 'POST',
      body: { plan, redirect },
    });
  },
  sessionStatus(sessionId) {
    return this.request(`/api/stripe/session-status?session_id=${encodeURIComponent(sessionId)}`);
  },

  /* ── Public ── */
  stats() {
    return this.request('/api/stats');
  },
  meta() {
    return this.request('/api/meta');
  },

  /* ── Admin ── */
  adminStats() {
    return this.request('/api/admin/stats');
  },
  adminAnnonces(status = 'pending', page = 1) {
    return this.request(`/api/admin/annonces?status=${encodeURIComponent(status)}&page=${page}`);
  },
  adminApprove(id) {
    return this.request(`/api/admin/annonces/${encodeURIComponent(id)}/approve`, { method: 'POST' });
  },
  adminReject(id, reason) {
    return this.request(`/api/admin/annonces/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: { reason },
    });
  },
  adminReports(status = 'open') {
    return this.request(`/api/admin/reports?status=${encodeURIComponent(status)}`);
  },
  adminResolveReport(id, action, note) {
    return this.request(`/api/admin/reports/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: { action, note },
    });
  },
  adminUsers(q = '', page = 1) {
    const qs = new URLSearchParams({ page });
    if (q) qs.set('q', q);
    return this.request(`/api/admin/users?${qs}`);
  },
  adminBanUser(id, banned) {
    return this.request(`/api/admin/users/${encodeURIComponent(id)}/ban`, {
      method: 'POST',
      body: { banned },
    });
  },
};
