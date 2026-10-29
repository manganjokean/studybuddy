/**
 * Vercel serverless function: GET /api/health
 * Reports the configured model and whether a real API key is present.
 * Also mounted by the local Express server.
 */

require('dotenv').config();

const { MODEL, KEY_PRESENT } = require('../agent');

module.exports = function healthHandler(req, res) {
  return res.status(200).json({
    ok: true,
    model: MODEL,
    hasKey: KEY_PRESENT,
    service: 'studybuddy',
    runtime: process.env.VERCEL ? 'vercel' : 'node',
  });
};
