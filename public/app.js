/* =====================================================================
   StudyBuddy - app.js
   Client-side logic: talks to POST /api/agent, animates the agent's plan,
   and renders the interactive quiz / flashcards / explanation artefacts.
   ===================================================================== */

/* --------------------------- configuration --------------------------- */
// Filled in after the GitHub repo and the live deployment exist.
const CONFIG = {
  REPO_URL: 'https://github.com/REPLACE_ME/studybuddy', // TODO: real repo URL
  REPORT_URL: 'https://github.com/REPLACE_ME/studybuddy/blob/main/report/StudyBuddy-Report.pdf', // TODO: real report URL
};

const STORAGE_KEY = 'studybuddy.scores';

/* ------------------------------ utilities ---------------------------- */

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 5200);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- state ------------------------------- */

const state = {
  busy: false,
  history: [], // conversation context sent to the agent
  results: {}, // { generateQuiz, generateFlashcards, explainConcept }
  quiz: null,
  quizIndex: 0,
  quizScore: 0,
  answered: false,
};

/* ---------------------------- health check --------------------------- */

async function checkHealth() {
  const badge = $('statusBadge');
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.ok && data.hasKey) {
      badge.textContent = `● ${data.model} online`;
      badge.className = 'badge badge--ok';
    } else {
      badge.textContent = '● API key missing';
      badge.className = 'badge badge--warn';
      toast('Server is running but GEMINI_API_KEY is not set.');
    }
  } catch (_) {
    badge.textContent = '● offline';
    badge.className = 'badge badge--warn';
  }
}

/* ------------------------------ ask agent ---------------------------- */

function buildMessage() {
  const source = $('sourceInput').value.trim();
  if (!source) {
    toast('Type a topic or paste some notes first.');
    $('sourceInput').focus();
    return null;
  }

  const intent = $('intentSelect').value;
  const difficulty = $('difficultySelect').value;
  const count = $('countSelect').value;

  if (intent === 'quiz')
    return `Create a quiz with ${count} ${difficulty} questions from this: ${source}`;
  if (intent === 'cards') return `Create ${count} flashcards from this: ${source}`;
  if (intent === 'explain') return `Explain this at a ${difficulty} level: ${source}`;
  // auto: let the agent choose the tool itself
  return source;
}

function setBusy(busy) {
  state.busy = busy;
  const btn = $('askBtn');
  btn.disabled = busy;
  btn.classList.toggle('is-loading', busy);
  btn.querySelector('.btn-label').textContent = busy ? 'Agent working…' : 'Run agent';
}

function renderPendingTrace() {
  const box = $('traceBox');
  box.classList.remove('hidden', 'is-done');
  $('traceStep').textContent = 'working…';
  $('traceList').innerHTML = `
    <li class="pending">
      <span class="trace-icon">🧠</span>
      <span><span class="trace-tool">plan</span>
      <span class="trace-args"> — analysing your request and choosing tools…</span></span>
    </li>`;
  $('narration').classList.add('hidden');
}

async function askAgent() {
  if (state.busy) return;
  const message = buildMessage();
  if (!message) return;

  setBusy(true);
  renderPendingTrace();
  $('emptyState').classList.add('hidden');

  try {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: state.history }),
    });

    let data;
    try {
      data = await res.json();
    } catch (_) {
      throw new Error('The server returned an unreadable response.');
    }

    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);

    await renderTrace(data.trace || []);
    renderNarration(data.text);
    renderResults(data.results || {});

    state.history.push({ role: 'user', text: message }, { role: 'assistant', text: data.text });
    state.history = state.history.slice(-8); // keep context small
  } catch (err) {
    toast(err.message || 'Something went wrong. Please try again.');
    if ($('traceList').children.length === 0) {
      $('traceBox').classList.add('hidden');
    }
    if (!state.results.generateQuiz && !state.results.generateFlashcards && !state.results.explainConcept) {
      $('emptyState').classList.remove('hidden');
    }
  } finally {
    setBusy(false);
  }
}

/* --------------------------- trace rendering ------------------------- */

const TOOL_META = {
  generateQuiz: { icon: '📝', label: 'generateQuiz' },
  generateFlashcards: { icon: '🃏', label: 'generateFlashcards' },
  explainConcept: { icon: '💡', label: 'explainConcept' },
};

async function renderTrace(trace) {
  const box = $('traceBox');
  const list = $('traceList');
  box.classList.remove('hidden');
  list.innerHTML = '';

  if (!trace.length) {
    list.innerHTML =
      '<li class="ok"><span class="trace-icon">💬</span><span class="trace-args">Answered directly — no tools needed.</span></li>';
    box.classList.add('is-done');
    $('traceStep').textContent = 'complete';
    return;
  }

  for (const [i, step] of trace.entries()) {
    const meta = TOOL_META[step.tool] || { icon: '⚙️', label: step.tool };
    const li = document.createElement('li');
    li.className = step.ok ? 'ok' : 'err';
    li.innerHTML = `
      <span class="trace-icon">${meta.icon}</span>
      <span>
        <span class="trace-tool">${esc(meta.label)}</span>
        <span class="trace-args"> — ${esc(step.ok ? step.args || 'running…' : step.error || 'failed')}</span>
      </span>`;
    list.appendChild(li);
    $('traceStep').textContent = `step ${i + 1} of ${trace.length}`;
    await sleep(340);
  }

  box.classList.add('is-done');
  $('traceStep').textContent = 'complete';
}

function renderNarration(text) {
  const el = $('narration');
  if (!text) {
    el.classList.add('hidden');
    return;
  }
  el.innerHTML = `<span class="avatar">🎓</span><div>${esc(text)}</div>`;
  el.classList.remove('hidden');
}

/* -------------------------- results & tabs --------------------------- */

const TAB_ORDER = ['quiz', 'cards', 'explain'];

function renderResults(results) {
  state.results = results;

  const available = TAB_ORDER.filter((t) => {
    if (t === 'quiz') return Boolean(results.generateQuiz);
    if (t === 'cards') return Boolean(results.generateFlashcards);
    return Boolean(results.explainConcept);
  });

  if (!available.length) {
    $('tabs').classList.add('hidden');
    TAB_ORDER.forEach((t) => $(`${t}View`).classList.add('hidden'));
    $('emptyState').classList.remove('hidden');
    return;
  }

  $('emptyState').classList.add('hidden');
  $('tabs').classList.remove('hidden');

  document.querySelectorAll('.tab').forEach((btn) => {
    const on = available.includes(btn.dataset.tab);
    btn.classList.toggle('hidden', !on);
    btn.classList.toggle('is-active', btn.dataset.tab === available[0]);
  });

  TAB_ORDER.forEach((t) => $(`${t}View`).classList.add('hidden'));
  activateTab(available[0]);
}

function activateTab(name) {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === name);
  });
  TAB_ORDER.forEach((t) => $(`${t}View`).classList.toggle('hidden', t !== name));

  if (name === 'quiz' && state.results.generateQuiz) startQuiz(state.results.generateQuiz);
  if (name === 'cards' && state.results.generateFlashcards) {
    renderCards(state.results.generateFlashcards);
  }
  if (name === 'explain' && state.results.explainConcept) {
    renderExplanation(state.results.explainConcept.explanation);
  }
}

/* -------------------------------- quiz -------------------------------- */

function startQuiz(quiz) {
  state.quiz = quiz;
  state.quizIndex = 0;
  state.quizScore = 0;
  state.answered = false;

  $('quizTitle').textContent = `${quiz.topic || 'Quiz'}${quiz.difficulty ? ' · ' + quiz.difficulty : ''}`;
  $('quizResult').classList.add('hidden');
  $('quizBody').classList.remove('hidden');
  renderQuestion();
}

function renderQuestion() {
  const quiz = state.quiz;
  const q = quiz.questions[state.quizIndex];
  state.answered = false;

  $('quizProgress').textContent = `Question ${state.quizIndex + 1} / ${quiz.questions.length}`;
  $('questionText').textContent = q.question;
  $('feedback').className = 'feedback hidden';
  $('feedback').textContent = '';
  $('nextBtn').classList.add('hidden');

  const list = $('optionsList');
  list.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option';
    btn.innerHTML = `<span class="key">${String.fromCharCode(65 + i)}</span><span>${esc(opt)}</span>`;
    btn.addEventListener('click', () => answer(i));
    list.appendChild(btn);
  });
}

function answer(choice) {
  if (state.answered) return;
  state.answered = true;

  const q = state.quiz.questions[state.quizIndex];
  const buttons = [...$('optionsList').children];

  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) btn.classList.add('is-correct');
    else if (i === choice) btn.classList.add('is-wrong');
  });

  const correct = choice === q.answer;
  if (correct) state.quizScore++;

  const fb = $('feedback');
  fb.className = `feedback ${correct ? 'good' : 'bad'}`;
  fb.innerHTML = correct
    ? `<strong>✅ Correct!</strong> ${esc(q.explanation || '')}`
    : `<strong>❌ Not quite.</strong> The answer is <strong>${esc(
        q.options[q.answer]
      )}</strong>. ${esc(q.explanation || '')}`;

  $('nextBtn').classList.remove('hidden');
  $('nextBtn').textContent =
    state.quizIndex === state.quiz.questions.length - 1 ? 'See results →' : 'Next question →';
}

function nextQuestion() {
  if (state.quizIndex < state.quiz.questions.length - 1) {
    state.quizIndex++;
    renderQuestion();
  } else {
    showResult();
  }
}

function showResult() {
  const total = state.quiz.questions.length;
  const score = state.quizScore;
  const pct = Math.round((score / total) * 100);

  $('quizBody').classList.add('hidden');
  $('quizResult').classList.remove('hidden');
  $('scoreValue').textContent = `${score}/${total}`;
  document.querySelector('.score-ring').style.setProperty('--pct', `${pct}%`);

  let headline;
  if (pct === 100) headline = '🏆 Perfect score!';
  else if (pct >= 80) headline = '🌟 Excellent work!';
  else if (pct >= 60) headline = '👍 Good effort!';
  else headline = '💪 Keep practising!';

  $('scoreHeadline').textContent = headline;
  $('scoreDetail').textContent = `${pct}% — saved to your history in this browser.`;
  saveScore(state.quiz.topic || 'Quiz', score, total);
}

/* --------------------------- score history --------------------------- */

function loadScores() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function saveScore(topic, score, total) {
  const scores = loadScores();
  scores.unshift({ topic, score, total, date: new Date().toLocaleDateString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, 12)));
  renderHistory();
}

function renderHistory() {
  const list = $('historyList');
  const scores = loadScores();

  if (!scores.length) {
    list.innerHTML =
      '<li class="history-empty">No quizzes finished yet — your results will be saved in this browser.</li>';
    return;
  }

  list.innerHTML = scores
    .map(
      (s) =>
        `<li><strong>${esc(s.topic)}</strong> — ${s.score}/${s.total} · ${esc(s.date)}</li>`
    )
    .join('');
}

/* ----------------------------- flashcards ---------------------------- */

function renderCards(deck) {
  $('cardsTitle').textContent = deck.topic || 'Flashcards';
  paintCards(deck.cards);
}

function paintCards(cards) {
  const grid = $('cardsGrid');
  grid.innerHTML = '';
  cards.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'flip-card';
    el.innerHTML = `
      <div class="flip-inner">
        <div class="flip-face flip-front"><span class="flip-label">front</span><span>${esc(c.front)}</span></div>
        <div class="flip-face flip-back"><span class="flip-label">back</span><span>${esc(c.back)}</span></div>
      </div>`;
    el.addEventListener('click', () => el.classList.toggle('is-flipped'));
    grid.appendChild(el);
  });
}

function shuffleCards() {
  const deck = state.results.generateFlashcards;
  if (!deck) return;
  const cards = [...deck.cards];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  paintCards(cards);
}

/* ---------------------------- explanation ---------------------------- */

/** Converts the model's `## heading` / `- bullet` markdown-lite into HTML. */
function renderExplanation(text) {
  const lines = String(text).split('\n');
  let html = '';
  let inList = false;

  const inline = (s) =>
    esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<strong>$1</strong>');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('## ')) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<h4>${inline(line.slice(3))}</h4>`;
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`;
    } else {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<p>${inline(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';

  $('explainBody').innerHTML = html;
}

/* ------------------------------ wiring -------------------------------- */

function resetOutput() {
  $('tabs').classList.add('hidden');
  TAB_ORDER.forEach((t) => $(`${t}View`).classList.add('hidden'));
  $('traceBox').classList.add('hidden');
  $('narration').classList.add('hidden');
  $('emptyState').classList.remove('hidden');
  state.results = {};
  state.history = [];
}

function init() {
  $('repoLink').href = CONFIG.REPO_URL;
  $('reportLink').href = CONFIG.REPORT_URL;
  $('footerLinks').innerHTML = `Live app · <a href="${esc(
    window.location.origin
  )}">studybuddy</a> · <a href="${esc(CONFIG.REPO_URL)}" target="_blank" rel="noopener">GitHub repository</a> · <a href="${esc(
    CONFIG.REPORT_URL
  )}" target="_blank" rel="noopener">Project report (PDF)</a>`;

  $('askBtn').addEventListener('click', askAgent);
  $('nextBtn').addEventListener('click', nextQuestion);
  $('retryBtn').addEventListener('click', () => startQuiz(state.quiz));
  $('newBtn').addEventListener('click', resetOutput);
  $('shuffleBtn').addEventListener('click', shuffleCards);
  $('clearHistory').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
  });

  document.querySelectorAll('.tab').forEach((btn) =>
    btn.addEventListener('click', () => activateTab(btn.dataset.tab))
  );

  document.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      $('sourceInput').value = chip.dataset.example;
      $('sourceInput').focus();
    })
  );

  // Ctrl/Cmd + Enter runs the agent from the textarea.
  $('sourceInput').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') askAgent();
  });

  renderHistory();
  checkHealth();
}

document.addEventListener('DOMContentLoaded', init);
