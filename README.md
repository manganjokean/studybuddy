# 🎓 StudyBuddy — AI Study Coach Agent

> An AI agent that turns your notes into quizzes, flashcards and clear explanations.

**Live app:** _deployed on Render — see below_
**Report (PDF):** [report/StudyBuddy-Report.pdf](report/StudyBuddy-Report.pdf)

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

- 🧠 Agent plan trace — watch the agent choose and call its tools live
- 📝 Interactive quiz with instant feedback and scoring
- 🃏 Flip-card flashcards with shuffle
- 💡 Structured explanations
- 📊 Quiz history saved in `localStorage`
- 📱 Responsive, no front-end framework (vanilla HTML/CSS/JS)

## Tech stack

- **Front end:** HTML5, CSS3 (custom properties, 3D transforms), vanilla ES6 JavaScript
- **Back end:** Node.js, Express
- **AI:** Google Gemini API (`gemini-3.8-flash`) via REST — function calling for tool use
- **Deployment:** Render
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
3. On Render, the key is pasted into **Dashboard → Environment** only.
4. Before every push: `npm run keycheck` scans all source files for leaked credentials.

`.env.example` is committed with placeholder values only.

## Project structure

```
├── server.js            Express server + /api/agent endpoint
├── agent.js             Agent loop, tool schemas and tool implementations
├── scripts/keycheck.js  Pre-push secret scanner
├── public/
│   ├── index.html       Application markup
│   ├── styles.css       Styling, quiz UI, flip cards, responsive layout
│   └── app.js           Client logic: fetch, trace animation, quiz, storage
├── report/              LaTeX report + compiled PDF
└── .env.example         Placeholder environment variables
```

## Author

_student name / student ID / course_
