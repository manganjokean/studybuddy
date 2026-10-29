/* =====================================================================
   StudyBuddy - app.js
   Chat-first client: sends messages to POST /api/agent, renders the
   conversation, animates the agent's tool-call trace, and builds the
   interactive artefacts (quiz, flashcards, explanation) inline in the
   thread. Scores persist in localStorage.
   ===================================================================== */

/* --------------------------- configuration --------------------------- */
// Filled in after the GitHub repo and the live deployment exist.
const CONFIG = {
  REPO_URL: 'https://github.com/manganjokean/studybuddy', // TODO: confirm
  REPORT_URL: 'https://github.com/manganjokean/studybuddy/blob/main/report/StudyBuddy-Report.pdf', // TODO: confirm
};

const STORAGE_KEY = 'studybuddy.scores';
const MAX_INPUT = 8000;

/* ------------------------------ utilities ---------------------------- */

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Create a DOM element from an HTML string. */
function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let toastTimer;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 5200);
}

function scrollToBottom(smooth = true) {
  const box = $('messages');
  box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

/* ------------------------------- state ------------------------------- */

const state = {
  busy: false,
  history: [], // conversation context sent with every request
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

/* --------------------------- conversation ---------------------------- */

function hideWelcome() {
  $('welcome').classList.add('hidden');
}

function addUserMessage(text) {
  const node = el(`<div class="msg msg--user"><div class="bubble">${esc(text)}</div></div>`);
  $('messages').appendChild(node);
  return node;
}

/**
 * Append a pending assistant turn. Returns handles so the caller can
 * replace the typing indicator with the plan trace, the reply and any
 * generated artefacts.
 */
function addAssistantTurn() {
  const node = el(`
    <div class="msg msg--assistant">
      <div class="avatar">🎓</div>
      <div class="msg-body">
        <div class="bubble typing"><i></i><i></i><i></i></div>
      </div>
    </div>`);
  $('messages').appendChild(node);

  const body = node.querySelector('.msg-body');
  const typing = node.querySelector('.typing');

  return {
    node,
    /** Replace the typing dots with the agent's reply. */
    setReply(text, isError = false) {
      const bubble = el(
        `<div class="bubble${isError ? ' is-error' : ''}">${esc(text)}</div>`
      );
      if (typing) typing.replaceWith(bubble);
      else body.appendChild(bubble);
      scrollToBottom();
    },
    /** Insert the plan trace above the reply; resolves when reveal finishes. */
    addTrace(trace) {
      const built = buildTrace(trace);
      body.insertBefore(built.node, body.firstChild);
      return built.done;
    },
    addArtefact(child) {
      body.appendChild(child);
      scrollToBottom();
    },
  };
}

function setBusy(busy) {
  state.busy = busy;
  const btn = $('sendBtn');
  btn.disabled = busy;
  btn.classList.toggle('is-loading', busy);
}

/* ---------------------------- agent trace ---------------------------- */

const TOOL_META = {
  generateQuiz: { icon: '📝', label: 'generateQuiz' },
  generateFlashcards: { icon: '🃏', label: 'generateFlashcards' },
  explainConcept: { icon: '💡', label: 'explainConcept' },
};

function buildTrace(trace) {
  const node = el(`
    <div class="trace">
      <div class="trace-head">
        <span class="pulse-dot" aria-hidden="true"></span>
        <h4>Agent plan</h4>
        <span class="trace-step"></span>
      </div>
      <ol class="trace-list"></ol>
    </div>`);
  const list = node.querySelector('.trace-list');
  const step = node.querySelector('.trace-step');

  if (!trace || !trace.length) {
    list.innerHTML =
      '<li class="ok"><span class="trace-icon">💬</span><span class="trace-args">Answered directly — no tools needed.</span></li>';
    node.classList.add('is-done');
    step.textContent = 'complete';
    return { node, done: Promise.resolve() };
  }

  // Reveal the tool calls one by one so the agent visibly "thinks".
  const done = (async () => {
    for (const [i, item] of trace.entries()) {
      const meta = TOOL_META[item.tool] || { icon: '⚙️', label: item.tool };
      const li = el(`
        <li class="${item.ok ? 'ok' : 'err'}">
          <span class="trace-icon">${meta.icon}</span>
          <span>
            <span class="trace-tool">${esc(meta.label)}</span>
            <span class="trace-args"> — ${esc(
              item.ok ? item.args || 'running…' : item.error || 'failed'
            )}</span>
          </span>
        </li>`);
      list.appendChild(li);
      step.textContent = `step ${i + 1} of ${trace.length}`;
      scrollToBottom();
      await sleep(330);
    }
    node.classList.add('is-done');
    step.textContent = 'complete';
    scrollToBottom();
  })();

  return { node, done };
}

/* -------------------------- artefact: quiz --------------------------- */

function buildQuizCard(quiz) {
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const node = el(`
    <div class="artefact">
      <div class="artefact-head">
        <h3>📝 Quiz</h3><span class="tag">quiz</span>
      </div>
      <div class="quiz-meta">
        <span class="pill js-title"></span>
        <span class="pill pill--ghost js-progress"></span>
      </div>
      <div class="js-play">
        <div class="question-card">
          <p class="question-text js-question"></p>
          <div class="options js-options"></div>
          <div class="feedback js-feedback hidden"></div>
          <div class="quiz-actions"><button class="btn btn--primary js-next hidden" type="button">Next question →</button></div>
        </div>
      </div>
      <div class="quiz-result js-result hidden">
        <div class="score-ring"><span class="js-score"></span></div>
        <h3 class="js-headline"></h3>
        <p class="hint js-detail"></p>
        <div class="btn-row"><button class="btn btn--ghost js-retry" type="button">Retry quiz</button></div>
      </div>
    </div>`);

  const q = {
    title: node.querySelector('.js-title'),
    progress: node.querySelector('.js-progress'),
    play: node.querySelector('.js-play'),
    question: node.querySelector('.js-question'),
    options: node.querySelector('.js-options'),
    feedback: node.querySelector('.js-feedback'),
    next: node.querySelector('.js-next'),
    result: node.querySelector('.js-result'),
    scoreRing: node.querySelector('.score-ring'),
    score: node.querySelector('.js-score'),
    headline: node.querySelector('.js-headline'),
    detail: node.querySelector('.js-detail'),
    retry: node.querySelector('.js-retry'),
  };

  let index = 0;
  let score = 0;
  let answered = false;

  function renderQuestion() {
    const item = questions[index];
    if (!item) return showResult();
    answered = false;

    q.title.textContent = `${quiz.topic || 'Quiz'}${quiz.difficulty ? ' · ' + quiz.difficulty : ''}`;
    q.progress.textContent = `Question ${index + 1} / ${questions.length}`;
    q.question.textContent = item.question;
    q.feedback.className = 'feedback js-feedback hidden';
    q.feedback.textContent = '';
    q.next.classList.add('hidden');

    q.options.innerHTML = '';
    (item.options || []).forEach((opt, i) => {
      const btn = el(
        `<button type="button" class="option"><span class="key">${String.fromCharCode(
          65 + i
        )}</span><span>${esc(opt)}</span></button>`
      );
      btn.addEventListener('click', () => answer(i));
      q.options.appendChild(btn);
    });
  }

  function answer(choice) {
    if (answered) return;
    answered = true;

    const item = questions[index];
    [...q.options.children].forEach((btn, i) => {
      btn.disabled = true;
      if (i === item.answer) btn.classList.add('is-correct');
      else if (i === choice) btn.classList.add('is-wrong');
    });

    const correct = choice === item.answer;
    if (correct) score++;

    q.feedback.className = `feedback js-feedback ${correct ? 'good' : 'bad'}`;
    q.feedback.innerHTML = correct
      ? `<strong>✅ Correct!</strong> ${esc(item.explanation || '')}`
      : `<strong>❌ Not quite.</strong> The answer is <strong>${esc(
          item.options[item.answer]
        )}</strong>. ${esc(item.explanation || '')}`;

    q.next.classList.remove('hidden');
    q.next.textContent =
      index === questions.length - 1 ? 'See results →' : 'Next question →';
    scrollToBottom();
  }

  function showResult() {
    const total = questions.length;
    const pct = total ? Math.round((score / total) * 100) : 0;

    q.play.classList.add('hidden');
    q.result.classList.remove('hidden');
    q.score.textContent = `${score}/${total}`;
    q.scoreRing.style.setProperty('--pct', `${pct}%`);

    let headline;
    if (pct === 100) headline = '🏆 Perfect score!';
    else if (pct >= 80) headline = '🌟 Excellent work!';
    else if (pct >= 60) headline = '👍 Good effort!';
    else headline = '💪 Keep practising!';

    q.headline.textContent = headline;
    q.detail.textContent = `${pct}% — saved to your history in this browser.`;
    saveScore(quiz.topic || 'Quiz', score, total);
    scrollToBottom();
  }

  function restart() {
    index = 0;
    score = 0;
    q.result.classList.add('hidden');
    q.play.classList.remove('hidden');
    renderQuestion();
  }

  q.next.addEventListener('click', () => {
    if (index < questions.length - 1) {
      index++;
      renderQuestion();
    } else {
      showResult();
    }
  });
  q.retry.addEventListener('click', restart);

  renderQuestion();
  return node;
}

/* ------------------------ artefact: flashcards ----------------------- */

function buildCardsDeck(deck) {
  const node = el(`
    <div class="artefact">
      <div class="artefact-head">
        <h3>🃏 Flashcards</h3><span class="tag">deck</span>
        <span class="spacer"></span>
        <button class="btn btn--tiny js-shuffle" type="button">🔀 Shuffle</button>
      </div>
      <div class="js-deck cards-grid"></div>
      <p class="hint center">Click a card to flip it.</p>
    </div>`);

  const deckBox = node.querySelector('.js-deck');

  function paint(cards) {
    deckBox.innerHTML = '';
    cards.forEach((c) => {
      const card = el(`
        <div class="flip-card">
          <div class="flip-inner">
            <div class="flip-face flip-front"><span class="flip-label">front</span><span>${esc(
              c.front
            )}</span></div>
            <div class="flip-face flip-back"><span class="flip-label">back</span><span>${esc(
              c.back
            )}</span></div>
          </div>
        </div>`);
      card.addEventListener('click', () => card.classList.toggle('is-flipped'));
      deckBox.appendChild(card);
    });
  }

  paint(deck.cards || []);

  node.querySelector('.js-shuffle').addEventListener('click', () => {
    const cards = [...(deck.cards || [])];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    paint(cards);
  });

  return node;
}

/* ----------------------- artefact: explanation ----------------------- */

/** Converts the model's `## heading` / `- bullet` markdown-lite into HTML. */
function buildExplanation(payload) {
  const text = typeof payload === 'string' ? payload : payload?.explanation || '';
  const node = el(`
    <div class="artefact">
      <div class="artefact-head"><h3>💡 Explanation</h3><span class="tag">notes</span></div>
      <div class="prose js-prose"></div>
    </div>`);

  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<strong>$1</strong>');

  let html = '';
  let inList = false;

  for (const raw of String(text).split('\n')) {
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

  node.querySelector('.js-prose').innerHTML = html || '<p class="hint">No explanation returned.</p>';
  return node;
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
      '<li class="history-empty">No quizzes finished yet — results are saved in this browser.</li>';
    return;
  }
  list.innerHTML = scores
    .map(
      (s) =>
        `<li><strong>${esc(s.topic)}</strong> — ${s.score}/${s.total} · ${esc(s.date)}</li>`
    )
    .join('');
}

/* ----------------------------- ask agent ----------------------------- */

/** Turn the composer contents into the instruction sent to the agent. */
function buildMessage(text) {
  const intent = $('intentSelect').value;
  const difficulty = $('difficultySelect').value;
  const count = $('countSelect').value;

  if (intent === 'quiz')
    return `Create a quiz with ${count} ${difficulty} questions from this: ${text}`;
  if (intent === 'cards') return `Create ${count} flashcards from this: ${text}`;
  if (intent === 'explain') return `Explain this at a ${difficulty} level: ${text}`;
  return text; // auto: the agent picks its own tool
}

async function postAgent(message, history) {
  let res;
  try {
    res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
  } catch (_) {
    throw new Error('Could not reach the server. Is it still running?');
  }

  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error('The server returned an unreadable response.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

async function sendMessage(raw) {
  const text = String(raw || '').trim();
  if (!text || state.busy) return;

  if (text.length > MAX_INPUT) {
    toast(`That's too long — please keep it under ${MAX_INPUT} characters.`);
    return;
  }

  hideWelcome();
  addUserMessage(text);
  const turn = addAssistantTurn();
  scrollToBottom();

  const input = $('chatInput');
  input.value = '';
  autoResize();

  const message = buildMessage(text);
  setBusy(true);

  try {
    const data = await postAgent(message, state.history);

    const trace = Array.isArray(data.trace) ? data.trace : [];
    if (trace.length) await turn.addTrace(trace);

    turn.setReply(data.text || 'Done.');

    renderArtefacts(turn, data.results || {});

    state.history.push(
      { role: 'user', text: message },
      { role: 'assistant', text: data.text || '' }
    );
    if (state.history.length > 8) state.history = state.history.slice(-8);
  } catch (err) {
    turn.setReply(`⚠️ ${err.message}`, true);
    toast(err.message);
  } finally {
    setBusy(false);
    scrollToBottom();
    input.focus();
  }
}

function renderArtefacts(turn, results) {
  const queue = [];
  if (results.generateQuiz) queue.push(() => buildQuizCard(results.generateQuiz));
  if (results.generateFlashcards) queue.push(() => buildCardsDeck(results.generateFlashcards));
  if (results.explainConcept) queue.push(() => buildExplanation(results.explainConcept));

  queue.forEach((make, i) => {
    if (i === 0) turn.addArtefact(make());
    else setTimeout(() => turn.addArtefact(make()), 260 * i);
  });
}

/* ------------------------------ composer ----------------------------- */

function autoResize() {
  const input = $('chatInput');
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 170)}px`;
}

function newChat() {
  state.history = [];
  document
    .querySelectorAll('.msg')
    .forEach((n) => n.remove());
  $('welcome').classList.remove('hidden');
  $('chatInput').value = '';
  autoResize();
  $('chatInput').focus();
}

function init() {
  $('repoLink').href = CONFIG.REPO_URL;
  $('reportLink').href = CONFIG.REPORT_URL;
  $('footerLinks').innerHTML = `Live app · <a href="${esc(
    window.location.origin
  )}" target="_blank" rel="noopener">studybuddy</a> · <a href="${esc(
    CONFIG.REPO_URL
  )}" target="_blank" rel="noopener">GitHub repository</a> · <a href="${esc(
    CONFIG.REPORT_URL
  )}" target="_blank" rel="noopener">Project report (PDF)</a>`;

  // Composer
  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage($('chatInput').value);
  });

  const input = $('chatInput');
  input.addEventListener('input', autoResize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  // Welcome example chips
  document.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      input.value = chip.dataset.example;
      autoResize();
      input.focus();
    })
  );

  // Header + history
  $('newChatBtn').addEventListener('click', newChat);
  $('clearHistory').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
  });

  renderHistory();
  checkHealth();
  autoResize();
  input.focus();
}

document.addEventListener('DOMContentLoaded', init);
