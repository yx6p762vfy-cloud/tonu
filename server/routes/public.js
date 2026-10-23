const express = require('express');
const db = require('../db');
const config = require('../config');
const { asyncHandler } = require('../lib/http');

const router = express.Router();

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const approved = await db.get("SELECT COUNT(*)::int AS c FROM annonces WHERE status = 'approved'");
    const members = await db.get("SELECT COUNT(*)::int AS c FROM users WHERE email NOT LIKE '%@demo.local'");
    const cities = await db.get(
      "SELECT COUNT(DISTINCT city)::int AS c FROM annonces WHERE status = 'approved'"
    );
    res.json({ annonces: approved.c, members: members.c, cities: cities.c });
  })
);

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
