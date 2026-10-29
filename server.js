require('dotenv').config();

const path = require('path');
const express = require('express');

// The route handlers live in ./api so they can be deployed to Vercel as
// serverless functions. Mounting the same modules here keeps local
// development and production running identical code.
const agentHandler = require('./api/agent');
const healthHandler = require('./api/health');
const { MODEL, KEY_PRESENT } = require('./agent');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------ routes ------------------------------ */

app.get('/api/health', (req, res) => healthHandler(req, res));
app.post('/api/agent', (req, res) => agentHandler(req, res));

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
  console.log(`Model: ${MODEL} | API key configured: ${KEY_PRESENT ? 'yes' : 'NO (set GEMINI_API_KEY)'}`);
  if (!KEY_PRESENT) console.warn('WARNING: agent calls will fail until GEMINI_API_KEY is set.');
});
