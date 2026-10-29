/**
 * server.js - StudyBuddy web server
 *
 * Express serves the static front end from ./public and exposes a single
 * API route, POST /api/agent, which runs the AI agent (see agent.js).
 *
 * SECURITY: the Gemini API key is read from process.env only. It is never
 * sent to the browser and never written to source control.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const { runAgent, MODEL } = require('./agent');

const app = express();
const PORT = process.env.PORT || 3000;
// Treat an empty or untouched placeholder value as "not configured".
const RAW_KEY = (process.env.GEMINI_API_KEY || '').trim();
const HAS_KEY = RAW_KEY.length > 20 && !/^your_/i.test(RAW_KEY);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------ routes ------------------------------ */

// Lightweight health endpoint - used by the UI badge and by Render's logs.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: HAS_KEY, service: 'studybuddy' });
});

// Main agent endpoint.
app.post('/api/agent', async (req, res) => {
  const { message, history } = req.body || {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Please provide a message.' });
  }
  if (message.length > 8000) {
    return res.status(413).json({ error: 'That input is too long (max 8000 characters).' });
  }
  if (!HAS_KEY) {
    return res.status(500).json({
      error:
        'The server is missing its GEMINI_API_KEY. Set it in the environment (Render dashboard -> Environment).',
    });
  }

  try {
    const result = await runAgent(message.trim(), Array.isArray(history) ? history : []);
    res.json(result);
  } catch (err) {
    // Log the technical detail server-side only; return a clean message to the client.
    console.error('[agent error]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'The agent failed. Please retry.' });
  }
});

// Anything else that is not an API call falls back to the SPA.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ------------------------------ errors ------------------------------ */

app.use((err, _req, res, _next) => {
  // Malformed JSON in the request body - client's fault, not ours.
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  console.error('[server error]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`StudyBuddy running on http://localhost:${PORT}`);
  console.log(`Model: ${MODEL} | API key configured: ${HAS_KEY ? 'yes' : 'NO (set GEMINI_API_KEY)'}`);
  if (!HAS_KEY) console.warn('WARNING: agent calls will fail until GEMINI_API_KEY is set.');
});
