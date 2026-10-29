/**
 * Vercel serverless function: POST /api/agent
 *
 * This is the SAME handler the local Express server mounts (see server.js),
 * so local development and the deployed site run one identical code path.
 * Vercel auto-parses JSON bodies into req.body and provides res.status() /
 * res.json() helpers; Express provides both natively.
 */

require('dotenv').config();

const { runAgent, KEY_PRESENT } = require('../agent');

/**
 * Vercel's `req.body` is a lazy getter that THROWS on malformed JSON.
 * Express parses the body earlier and reports it through its error
 * middleware, so this is a no-op locally.
 */
function safeBody(req) {
  try {
    return req.body;
  } catch (_) {
    return undefined;
  }
}

module.exports = async function agentHandler(req, res) {
  if (req.method && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const body = safeBody(req);
  const { message, history } = body || {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Please provide a message.' });
  }
  if (message.length > 8000) {
    return res.status(413).json({ error: 'That input is too long (max 8000 characters).' });
  }
  if (!KEY_PRESENT) {
    return res.status(500).json({
      error:
        'The server is missing its GEMINI_API_KEY. Set it in your host environment (Vercel: Project -> Settings -> Environment Variables).',
    });
  }

  try {
    const result = await runAgent(message.trim(), Array.isArray(history) ? history : []);
    return res.status(200).json(result);
  } catch (err) {
    // Technical detail stays in the server log / function logs only.
    console.error('[agent error]', err.message);
    return res
      .status(err.status || 500)
      .json({ error: err.message || 'The agent failed. Please retry.' });
  }
};
