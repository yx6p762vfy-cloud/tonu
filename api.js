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
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || res.statusText };
    }
    if (!res.ok) {
      const err = new Error(data?.error || 'Erreur API');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  register(payload) {
    return this.request('/api/auth/register', { method: 'POST', body: payload });
  },

  login(payload) {
    return this.request('/api/auth/login', { method: 'POST', body: payload });
  },

  me() {
    return this.request('/api/auth/me');
  },

  listAnnonces() {
    return this.request('/api/annonces');
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

  deleteAnnonce(id) {
    return this.request(`/api/annonces/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  stripeConfig() {
    return this.request('/api/stripe/config');
  },

  createCheckoutSession(redirect) {
    return this.request('/api/stripe/create-checkout-session', {
      method: 'POST',
      body: { redirect },
    });
  },

  adminPending() {
    return this.request('/api/admin/pending');
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

  listComments(annonceId) {
    return this.request(`/api/comments/${encodeURIComponent(annonceId)}`);
  },

  createComment(annonceId, content) {
    return this.request(`/api/comments/${encodeURIComponent(annonceId)}`, {
      method: 'POST',
      body: { content },
    });
  },

  deleteComment(annonceId, commentId) {
    return this.request(`/api/comments/${encodeURIComponent(annonceId)}/${encodeURIComponent(commentId)}`, {
      method: 'DELETE',
    });
  },
};
