const config = require('../config');

const CATEGORIES = ['Rencontre', 'Sortie', 'Discussion', 'Couple'];
const INTENTIONS = ['Rencontre', 'Rencontre sérieuse', 'Sorties', 'Discussion', 'Couple'];
const GENDERS = ['Homme', 'Femme', 'Couple', 'Autre'];
const STATUSES = ['pending', 'approved', 'rejected'];
const REPORT_REASONS = {
  contenu_illegal: 'Contenu illégal',
  mineur: 'Personne mineure',
  arnaque: 'Arnaque / fraude',
  harcelement: 'Harcèlement',
  spam: 'Spam / publicité',
  autre: 'Autre',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PSEUDO_RE = /^[\p{L}\p{N} _.\-&']{3,32}$/u;

function text(value, maxLength) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength);
}

function email(value) {
  const normalized = text(value, 254).toLowerCase();
  return EMAIL_RE.test(normalized) ? normalized : null;
}

function password(value) {
  const str = String(value ?? '');
  if (str.length < 8 || str.length > 200) return null;
  return str;
}

function pseudo(value) {
  const str = text(value, 32).replace(/\s+/g, ' ');
  return PSEUDO_RE.test(str) ? str : null;
}

function age(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= config.minAge && n <= 99 ? n : null;
}

function oneOf(value, allowed) {
  const str = text(value, 60);
  return allowed.find((item) => item.toLowerCase() === str.toLowerCase()) || null;
}

function title(value) {
  const str = text(value, 90);
  return str.length >= 5 ? str : null;
}

function description(value) {
  const str = text(value, 1000);
  return str.length >= 20 ? str : null;
}

function city(value) {
  const str = text(value, 60);
  return str.length >= 2 ? str : null;
}

function commentContent(value) {
  const str = text(value, 500);
  return str.length >= 2 ? str : null;
}

function reportDetails(value) {
  return text(value, 1000);
}

function id(value) {
  const str = String(value ?? '');
  return /^[0-9a-f-]{20,40}$/i.test(str) ? str : null;
}

function safeRelativeUrl(value, fallback = 'index.html') {
  if (!value) return fallback;
  let url;
  try {
    url = new URL(String(value), 'https://redirect.invalid/');
  } catch {
    return fallback;
  }
  if (url.origin !== 'https://redirect.invalid') return fallback;
  const rel = `${url.pathname.replace(/^\/+/, '') || 'index.html'}${url.search}${url.hash}`;
  return rel.startsWith('..') ? fallback : rel;
}

function checkoutRedirect(value) {
  const rel = safeRelativeUrl(value, 'publier.html');
  const page = rel.split(/[?#]/)[0];
  return config.allowedRedirects.includes(page) ? rel : 'publier.html';
}

module.exports = {
  CATEGORIES,
  INTENTIONS,
  GENDERS,
  STATUSES,
  REPORT_REASONS,
  text,
  email,
  password,
  pseudo,
  age,
  oneOf,
  title,
  description,
  city,
  commentContent,
  reportDetails,
  id,
  safeRelativeUrl,
  checkoutRedirect,
};
