/**
 * scripts/keycheck.js
 *
 * Scans the project for anything that looks like an API key before you push.
 * Run with:  npm run keycheck
 *
 * Exit code 0 = safe to push, 1 = a secret was found (do NOT push).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.vscode', '.idea', 'dist', 'build']);
const SKIP_FILES = new Set(['.env', '.env.local', 'package-lock.json']);

// Patterns that look like real credentials.
const PATTERNS = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_\-]{30,}/ },
  { name: 'OpenAI-style key', re: /sk-[A-Za-z0-9_\-]{20,}/ },
  { name: 'Anthropic-style key', re: /sk-ant-[A-Za-z0-9_\-]{20,}/ },
  { name: 'Bearer token', re: /Bearer\s+[A-Za-z0-9_\-]{30,}\.[A-Za-z0-9_\-]{10,}/ },
  // An assigned, non-placeholder key value in source code.
  {
    name: 'Assigned API key variable',
    re: /(?:GEMINI_API_KEY|OPENAI_API_KEY|API_KEY|SECRET)\s*[:=]\s*["'][^"'\s]{16,}["']/,
    allow: (line) => /your_|replace|example|placeholder|xxx|todo/i.test(line),
  },
];

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    const file = path.join(dir, entry.name);
    const rel = path.relative(ROOT, file);
    if (SKIP_FILES.has(entry.name)) continue;
    // .env is gitignored, but warn if it exists so nobody force-adds it.
    if (/^\.env(\.|$)/.test(entry.name) && entry.name !== '.env.example') {
      if (entry.name === '.env') {
        console.log(`ℹ  ${rel} exists locally (it is gitignored - make sure it stays that way).`);
      }
      continue;
    }

    let text;
    try {
      const stat = fs.statSync(file);
      if (stat.size > 500 * 1024) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch (_) {
      continue;
    }
    if (text.includes('\u0000')) return; // binary

    text.split(/\r?\n/).forEach((line, i) => {
      for (const p of PATTERNS) {
        if (p.allow && p.allow(line)) continue;
        if (p.re.test(line)) {
          findings.push({ rel, line: i + 1, name: p.name, sample: line.trim().slice(0, 60) });
        }
      }
    });
  }
}

walk(ROOT);

if (findings.length === 0) {
  console.log('✅ No API keys or secrets found in the project. Safe to push.');
  process.exit(0);
}

console.error('❌ POSSIBLE SECRET(S) FOUND - do NOT push yet:\n');
for (const f of findings) {
  console.error(`  ${f.rel}:${f.line}  [${f.name}]`);
  console.error(`      ${f.sample}\n`);
}
console.error('Move the value into .env and reference it with process.env.VARIABLE_NAME.');
process.exit(1);
