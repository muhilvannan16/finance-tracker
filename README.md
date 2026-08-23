# finance-tracker

A personal finance tracker that runs entirely in your browser — multi-account balances, transfers, recurring-charge detection, and a real Python forecasting engine, with zero backend and zero server ever seeing your data.

![Deploy Status](https://github.com/muhilvannan16/finance-tracker/actions/workflows/deploy.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

**[Live Demo →](https://muhilvannan16.github.io/finance-tracker/)**

---

## Table of Contents

- [What Makes This Different](#what-makes-this-different)
- [Features](#features)
- [Screenshot](#screenshot)
- [Tech Stack](#tech-stack)
- [Getting Started / Running Locally](#getting-started--running-locally)
- [Project Structure](#project-structure)
- [AI Features / Privacy Note](#ai-features--privacy-note)
- [License](#license)

---

## What Makes This Different

- **Zero backend.** The whole app is static files — HTML, CSS, JS, and `.py` source — deployed as-is to GitHub Pages. There's no server, no API, no database.
- **A real Python engine, not a JS reimplementation.** Balance projection (`projection.py`) and recurring-charge detection (`recurring.py`) are genuine Python, executed client-side by [Pyodide](https://pyodide.org/) — a full CPython build compiled to WebAssembly — not logic rewritten in JavaScript to look Python-like.
- **Multi-account support with real transfers.** Accounts each have their own starting balance, and transfers move money between them (debiting one account, crediting the other) rather than treating everything as one pooled balance.
- **Two-tier recurring-charge detection.** A deterministic rule-based pass in `recurring.py` groups transactions by label, category, amount tolerance, and ~monthly date spacing; anything left over can optionally be handed to an LLM (via your own Groq API key) to catch charges the strict rules miss — e.g. the same subscription billed under slightly different labels.
- **Careful date math.** Monthly recurrence is anchored to each transaction's own start date (not a separate "day of month" field), and month-length edge cases (e.g. a charge on the 31st landing on Feb 28) are clamped independently per checkpoint so short months don't permanently drag later projections down.

---

## Features

**Transactions**
- Add, edit, and delete transactions with a label, category, amount, direction (income/expense), date, and account
- Support for one-time or monthly-recurring transactions

**Accounts & balances**
- Create multiple accounts, each with its own name and starting balance
- Current balance is recalculated live (via the Python engine) whenever transactions, transfers, or the selected account change

**Transfers**
- Move money between two accounts on a given date, with the UI preventing you from selecting the same account on both sides

**Projection & charting**
- Project the balance of the selected account forward (or backward) to any date
- Render the projected balance as an interactive line chart (Chart.js) from today out to a chosen future date

**Recurring-charge detection**
- Rule-based detection: groups transactions sharing label + category, similar amount (within a configurable tolerance), and a chain of ~monthly gaps (27–33 days) into recurring suggestions — no API key needed
- AI-assisted detection (optional): transactions the rules didn't group are sent to an LLM via the Groq API to catch recurring charges with inconsistent labels
- Accepting a suggestion creates a new monthly transaction one month after the latest match; dismissing or accepting both mark the matched transactions as handled so they aren't re-suggested

**Theme**
- "The Horizon" — a custom dark theme (`site/css/style.css`) built on a navy/card palette with warm amber accents, Fraunces/Manrope/IBM Plex Mono type

---

## Screenshot

<!-- TODO: add a real screenshot of the running app here -->
![screenshot](docs/screenshot.png)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla JavaScript (ES modules), HTML, CSS — no framework, no build step, no bundler |
| **Forecasting & detection engine** | Python, running client-side via [Pyodide](https://pyodide.org/) (WebAssembly) |
| **Storage** | Browser `localStorage` — all transaction/account data stays on your device |
| **Charting** | [Chart.js](https://www.chartjs.org/) |
| **AI (optional)** | [Groq API](https://groq.com/) — bring your own key |
| **Deployment** | GitHub Actions → GitHub Pages (auto-deploys on every push to `main`) |

---

## Getting Started / Running Locally

No build step, no `npm install` — just a local static file server, since ES modules need to be served over HTTP rather than opened directly as a `file://` path.

```bash
git clone https://github.com/muhilvannan16/finance-tracker.git
cd finance-tracker/site
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

---

## Project Structure

```text
finance-tracker/
├── .github/
│   └── workflows/
│       └── deploy.yml        # CI/CD — builds and deploys to GitHub Pages
└── site/
    ├── index.html            # App shell — cards for balance, projection, accounts, transfers, recurring suggestions, transactions
    ├── css/
    │   └── style.css         # "The Horizon" dark theme
    ├── js/
    │   ├── app.js            # UI logic, event handlers, rendering, bootstrap
    │   ├── storage.js        # localStorage persistence layer (transactions, accounts, transfers, handled-recurring ids)
    │   ├── pyBridge.js        # Pyodide loading + JS↔Python bridge for both engines
    │   └── aiSuggestions.js  # Sends leftover transactions to the Groq API for AI-assisted recurring detection
    └── py/
        ├── projection.py     # Balance projection engine (pure Python) — current & future balance, chart series
        └── recurring.py      # Rule-based recurring-charge detection engine (pure Python)
```

---

## AI Features / Privacy Note

AI-assisted recurring-charge detection is **entirely optional** and off by default.

- It only activates if you enter your own [Groq](https://groq.com/) API key in the "AI Settings" card.
- Your key is stored **only in your browser's `localStorage`** — it is never sent anywhere except directly to Groq's API when you use the feature.
- When enabled, transactions left unmatched by the rule-based pass — just their `id`, `label`, `category`, `amount`, and `date` — are sent **directly from your browser to Groq's API**. There is no backend in this project, so no server the developer controls ever sees this data.
- Remove your key at any time from the "AI Settings" card; the app falls back to rule-based detection only.

---

## License

This project is licensed under the [MIT License](LICENSE).
