const express = require('express');
const db = require('../db');
const config = require('../config');

const router = express.Router();

router.get('/stats', (_req, res) => {
  const approved = db.prepare("SELECT COUNT(*) AS c FROM annonces WHERE status = 'approved'").get().c;
  const members = db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE email NOT LIKE '%@demo.local'")
    .get().c;
  const cities = db
    .prepare("SELECT COUNT(DISTINCT city) AS c FROM annonces WHERE status = 'approved'")
    .get().c;
  res.json({ annonces: approved, members, cities });
});

router.get('/meta', (_req, res) => {
  res.json({
    siteName: 'tonú Privé',
    minAge: config.minAge,
    supportEmail: config.supportEmail,
    termsVersion: config.termsVersion,
    termsUpdatedAt: config.termsUpdatedAt,
  });
});

module.exports = router;
