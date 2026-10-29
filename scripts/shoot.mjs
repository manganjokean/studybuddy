/**
 * scripts/shoot.mjs  -  UI verification + report screenshots
 *
 * Drives the real app in headless Chromium and captures the four figures
 * used in the LaTeX report. By default the /api/agent call is INTERCEPTED
 * and answered with canned payloads, so the UI can be verified even when no
 * API key is configured. Pass --real to exercise the live agent instead.
 *
 *   node scripts/shoot.mjs           # mock mode (writes report/figures/*.png)
 *   node scripts/shoot.mjs --real    # calls the real Gemini agent
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIGURES = path.join(ROOT, 'report', 'figures');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const REAL = process.argv.includes('--real');

mkdirSync(FIGURES, { recursive: true });

/* ------------------------------ fixtures ------------------------------ */

const FIXTURES = {
  quiz: {
    text: "I've put together a 5-question quiz on the causes of World War 1 at medium difficulty — answer each one and you'll get an explanation straight away. Good luck!",
    trace: [
      { tool: 'generateQuiz', args: '5 questions on "Causes of World War 1" (medium)', ok: true },
    ],
    results: {
      generateQuiz: {
        topic: 'Causes of World War 1',
        difficulty: 'medium',
        questions: [
          {
            question: 'Which event is often considered the immediate trigger of World War 1?',
            options: [
              'The invasion of Poland',
              'The assassination of Archduke Franz Ferdinand',
              'The sinking of the Lusitania',
              'The Russian Revolution',
            ],
            answer: 1,
            explanation:
              'The assassination in Sarajevo on 28 June 1914 set off the chain of alliances that led to war.',
          },
          {
            question: 'The system of alliances that escalated the conflict in 1914 was centred on two blocks. Which pair formed the Triple Alliance?',
            options: [
              'Germany, Austria-Hungary and Italy',
              'Britain, France and Spain',
              'Russia and the Ottoman Empire',
              'The United States and Japan',
            ],
            answer: 0,
            explanation:
              'The Triple Alliance linked Germany, Austria-Hungary and Italy; the Triple Entente linked France, Russia and Britain.',
          },
          {
            question: 'Which naval arms race is cited as a major source of tension before 1914?',
            options: ['The arms race between Britain and the Ottoman Empire', 'The arms race between France and Russia', 'The naval arms race between Britain and Germany', 'The arms race between Italy and Austria-Hungary'],
            answer: 2,
            explanation:
              'The Anglo-German naval race, triggered by Germany\'s Battle Fleet plans, strained relations badly.',
          },
          {
            question: 'What was the July Crisis?',
            options: [
              'A summer heatwave that affected troop movements',
              'The diplomatic breakdown after the Sarajevo assassination',
              'The first use of tanks at the Somme',
              'A financial crash in Berlin',
            ],
            answer: 1,
            explanation:
              'The July Crisis was the five weeks of ultimatums and mobilisations that followed the assassination.',
          },
          {
            question: 'Which country\'s mobilisation plan is often described as having a timetable that was hard to stop once started?',
            options: ['France', 'Germany', 'Belgium', 'Italy'],
            answer: 1,
            explanation:
              'Germany\'s Schlieffen Plan required rapid mobilisation through Belgium, leaving little room for diplomacy.',
          },
        ],
      },
    },
  },

  cards: {
    text: 'Here are 6 flashcards on JavaScript array methods — click any card to flip it and use Shuffle when you want a different order.',
    trace: [{ tool: 'generateFlashcards', args: '6 cards on "JavaScript array methods"', ok: true }],
    results: {
      generateFlashcards: {
        topic: 'JavaScript array methods',
        cards: [
          { front: 'What does map() return?', back: 'A new array with the callback applied to every element. The original array is unchanged.' },
          { front: 'filter() vs reduce()', back: 'filter keeps elements matching a test; reduce folds the array into a single value.' },
          { front: 'What does forEach() return?', back: 'undefined. It only runs a side effect for each element — it does not build an array.' },
          { front: 'Syntax of reduce()', back: 'arr.reduce((accumulator, current, index, array) => nextAcc, initialValue)' },
          { front: 'How does sort() sort by default?', back: 'Lexicographically as strings, which is why numeric sorts need (a, b) => a - b.' },
          { front: 'What is a callback function?', back: 'A function passed to another function to be run later, e.g. the test function given to filter().' },
        ],
      },
    },
  },

  explain: {
    text: 'Recursion explained at beginner level — the key idea is that a function solves a big problem by asking a smaller version of itself, until it hits a base case.',
    trace: [{ tool: 'explainConcept', args: 'concept: recursion (beginner)', ok: true }],
    results: {
      explainConcept: {
        concept: 'recursion',
        level: 'beginner',
        explanation: [
          '## Simple definition',
          'Recursion is when a function calls itself to solve a smaller piece of the same problem.',
          '',
          '## How it works',
          '- A base case stops the recursion and returns a simple value',
          '- A recursive case breaks the problem down and calls itself',
          '- Each call works on a smaller input until the base case is reached',
          '',
          '## Real-world example',
          'Opening a set of Russian dolls: you keep opening the next smaller doll until you reach the smallest one that will not open (the base case).',
          '',
          '## Remember this',
          'No base case = infinite recursion = stack overflow. Always define the exit first.',
        ].join('\n'),
      },
    },
  },
};

function pickFixture(message) {
  const m = message.toLowerCase();
  if (m.includes('flashcard')) return FIXTURES.cards;
  if (m.startsWith('explain') || m.includes('explain this')) return FIXTURES.explain;
  return FIXTURES.quiz;
}

/* -------------------------------- run --------------------------------- */

const checks = [];
const check = (name, ok, extra = '') => {
  checks.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1320, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

if (!REAL) {
  // Healthy status so the badge reads "online" and no warning toast appears.
  await page.route('**/api/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, model: 'gemini-3.8-flash', hasKey: true, service: 'studybuddy' }),
    })
  );

  await page.route('**/api/agent', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const fixture = pickFixture(body.message || '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: fixture.text,
        trace: fixture.trace,
        results: fixture.results,
        model: 'mock',
      }),
    });
  });
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#welcome', { timeout: 10000 });

  // Let any startup toast land, then clear, so it never covers a figure.
  await page.waitForTimeout(600);
  await page
    .waitForFunction(() => !document.getElementById('toast').classList.contains('is-visible'), null, {
      timeout: 8000,
    })
    .catch(() => {});

  check('welcome screen renders', await page.isVisible('.welcome-icon'));
  check(
    'status badge reports server state',
    (await page.textContent('#statusBadge')).trim().length > 3,
    (await page.textContent('#statusBadge')).trim()
  );
  await page.screenshot({ path: path.join(FIGURES, 'app-welcome.png') });

  /* ---- turn 1: quiz ---- */
  await page.fill('#chatInput', 'Quiz me 5 medium questions on the causes of World War 1.');
  await page.press('#chatInput', 'Enter');

  await page.waitForSelector('.artefact .js-question', { timeout: 15000 });
  check('user message appears', (await page.locator('.msg--user').count()) === 1);
  check('agent plan trace appears', (await page.locator('.trace').count()) >= 1);
  check('agent reply appears', await page.isVisible('.msg--assistant .bubble'));
  check('quiz card renders', await page.isVisible('.js-question'));

  await page.screenshot({ path: path.join(FIGURES, 'app-main.png') });

  // Answer the first question correctly (index 1 in the fixture) and verify feedback.
  await page.locator('.js-options .option').nth(1).click();
  await page.waitForSelector('.feedback.good, .feedback.bad');
  const good = await page.isVisible('.feedback.good');
  check('correct answer gives green feedback', good);
  check('wrong options are locked', await page.isDisabled('.js-options .option:nth-child(1)'));

  await page.screenshot({ path: path.join(FIGURES, 'app-quiz.png') });

  // Walk the rest of the quiz to the score screen.
  for (let i = 0; i < 4; i++) {
    await page.click('.js-next');
    await page.waitForSelector('.js-options .option', { timeout: 5000 });
    await page.locator('.js-options .option').nth(0).click();
    await page.waitForSelector('.feedback.good, .feedback.bad');
  }
  await page.click('.js-next');
  await page.waitForSelector('.js-result:not(.hidden)', { timeout: 5000 });
  check('score screen shows a result', (await page.textContent('.js-score')).includes('/'));
  const historyText = await page.textContent('#historyList');
  check('score saved to history panel', historyText.includes('World War 1'), historyText.trim().slice(0, 60));

  /* ---- turn 2: flashcards ---- */
  await page.fill('#chatInput', 'Make flashcards on JavaScript array methods.');
  await page.press('#chatInput', 'Enter');
  await page.waitForSelector('.flip-card', { timeout: 15000 });
  const cardCount = await page.locator('.flip-card').count();
  check('flashcards render', cardCount === 6, `${cardCount} cards`);

  // Flip one card and confirm the transform is applied.
  await page.locator('.flip-card').first().click();
  const flipped = await page.locator('.flip-card.is-flipped').count();
  check('card flips on click', flipped === 1);
  await page.waitForTimeout(750); // let the 3D flip animation settle

  await page.screenshot({ path: path.join(FIGURES, 'app-cards.png') });

  /* ---- turn 3: explanation ---- */
  await page.fill('#chatInput', 'Explain recursion in programming.');
  await page.press('#chatInput', 'Enter');
  await page.waitForSelector('.prose h4', { timeout: 15000 });
  const sections = await page.locator('.prose h4').count();
  check('explanation sections rendered', sections >= 3, `${sections} headings`);
  check('conversation has 3 assistant turns', (await page.locator('.msg--assistant').count()) === 3);

  await page.screenshot({ path: path.join(FIGURES, 'app-explain.png') });

  // Full-page capture for the README / overview.
  await page.screenshot({ path: path.join(FIGURES, 'app-full.png'), fullPage: false });

  check('no JavaScript errors on the page', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));
} catch (err) {
  check('script completed', false, err.message);
  await page.screenshot({ path: path.join(FIGURES, 'app-error.png') }).catch(() => {});
} finally {
  // Chromium occasionally refuses to exit cleanly - never let that hang CI.
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 4000))]);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
