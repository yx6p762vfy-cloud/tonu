const express = require('express');
const db = require('../db');
const config = require('../config');
const { asyncHandler } = require('../lib/http');

const router = express.Router();

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const approved = await db.get(
      `SELECT COUNT(*)::int AS c FROM annonces a
       JOIN users u ON u.id = a.user_id
       WHERE a.status = 'approved' AND u.premium_until > now()`
    );
    const members = await db.get("SELECT COUNT(*)::int AS c FROM users WHERE email NOT LIKE '%@demo.local'");
    const cities = await db.get(
      `SELECT COUNT(DISTINCT a.city)::int AS c FROM annonces a
       JOIN users u ON u.id = a.user_id
       WHERE a.status = 'approved' AND u.premium_until > now()`
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
