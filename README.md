# 🎓 StudyBuddy — AI Study Coach Agent

> An AI agent that turns your notes into quizzes, flashcards and clear explanations.

**Live app:** _deployed on Vercel — see below_
**Report (PDF):** [report/main.pdf](report/main.pdf)

---

## About

StudyBuddy is a web application built for the *Web Client-Side Programming* course. It combines a
hand-built front end with an **AI agent** running on Node.js/Express and the Google Gemini API.

Unlike a plain chatbot, StudyBuddy runs an **agentic loop**: the model receives a set of tool
declarations, decides which tool to call, the server executes it, and the result is fed back to
the model until a final answer is produced.

### Tools the agent can call

| Tool | What it does |
| --- | --- |
| `generateQuiz` | Builds a multiple-choice quiz (question, 4 options, correct index, explanation) |
| `generateFlashcards` | Turns material into front/back revision cards |
| `explainConcept` | Explains a topic at beginner / intermediate / advanced level |

### Features

- 💬 **Chat interface** — message thread with typing indicator and follow-up context
- 🧠 Agent plan trace — watch the agent choose and call its tools live
- 📝 Interactive quiz with instant feedback and scoring (rendered inline in the chat)
- 🃏 Flip-card flashcards with shuffle
- 💡 Structured explanations
- 📊 Quiz history saved in `localStorage`
- 📱 Responsive, no front-end framework (vanilla HTML/CSS/JS)

## Tech stack

- **Front end:** HTML5, CSS3 (custom properties, 3D transforms), vanilla ES6 JavaScript
- **Back end:** Node.js, Express
- **AI:** Google Gemini API (`gemini-3.8-flash`) via REST — function calling for tool use
- **Deployment:** Vercel (static site + serverless functions)
- **Report:** LaTeX (compiled to PDF)

## Run locally

```bash
npm install
cp .env.example .env      # then paste your Gemini API key into .env
npm start                 # http://localhost:3000
```

## 🔐 API key security

**The API key is never committed to GitHub.**

1. `.env` is listed in `.gitignore` from the very first commit.
2. The server reads it with `process.env.GEMINI_API_KEY` — it is never sent to the browser.
3. On Vercel, the key is pasted into **Settings → Environment Variables** only.
4. Before every push: `npm run keycheck` scans all source files for leaked credentials.

`.env.example` is committed with placeholder values only.

## Project structure

```
├── server.js            Express server for local dev (mounts ./api)
├── agent.js             Agent loop, tool schemas and tool implementations
├── api/
│   ├── agent.js         POST /api/agent — Vercel function + Express route
│   └── health.js        GET /api/health — Vercel function + Express route
├── vercel.json          Vercel config: static output, 30s function limit
├── scripts/keycheck.js  Pre-push secret scanner
├── scripts/shoot.mjs    Headless UI test + report screenshots (Playwright)
├── public/
│   ├── index.html       Chat layout: thread, composer, artefact cards
│   ├── styles.css       Theming, bubbles, quiz UI, 3D flip cards, responsive
│   └── app.js           Client logic: fetch, trace animation, quiz, storage
├── report/              LaTeX report, compiled PDF and figures/
└── .env.example         Placeholder environment variables
```

## Deploy (Vercel)

The two handlers in `api/` are the **same modules** the local Express server mounts, so
local dev and production run identical code.

1. Push the repository to GitHub.
2. On [vercel.com](https://vercel.com): **Add New → Project** → import the repo
   (framework preset **Other** — `vercel.json` already declares `public/` as the static output).
3. **Settings → Environment Variables** → add `GEMINI_API_KEY` (secret value, never in git).
4. **Deploy** → the site is live at `https://studybuddy-XXXX.vercel.app`.
5. Locally, `npm start` runs the same handlers through Express.

## Author

_student name / student ID / course_
