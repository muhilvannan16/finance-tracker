# finance-tracker

![Deploy Status](https://github.com/muhilvannan16/finance-tracker/actions/workflows/deploy.yml/badge.svg)

A forward-looking expense tracker with a real Python forecasting engine running entirely in your browser.

**[Live Demo →](https://muhilvannan16.github.io/finance-tracker/)**

## What it does

Most expense trackers only look backward — what did you spend, where did it go. finance-tracker is built around the opposite question: **where is your money headed?**

- Add, edit, and delete transactions — one-time or monthly recurring
- See your current balance, recalculated live on every change
- Project your balance forward to any future date
- Visualize the projected trend as an interactive chart

## What makes it distinctive

This is a genuinely static site — no backend server, no database. It's deployed as plain files on GitHub Pages. But the actual forecasting logic isn't written in JavaScript: it's real Python, running client-side via [Pyodide](https://pyodide.org/), a full CPython interpreter compiled to WebAssembly. The browser downloads and boots an actual Python runtime, and the app hands it real transaction data to crunch.

A few of the harder problems this engine solves correctly:

- **Recurring transactions anchor to their own start date** — a bill dated the 15th recurs on the 15th of every month after that, with no separate "recurrence day" field to keep in sync.
- **Short months are handled without drifting.** A transaction dated the 31st correctly lands on the 28th in February — but unlike a naive "step forward one month at a time" approach, the next checkpoint (March) correctly bounces back to the 31st instead of getting permanently stuck at 28 for the rest of the year.
- **Every calculation was verified by hand before being trusted** — predicted values were worked out manually and checked against real output at every stage of development, not just assumed correct from reading the code.

## Tech stack

- **Frontend:** Vanilla JavaScript (ES modules), HTML, CSS — no framework, no build step, no bundler
- **Forecasting engine:** Python, running client-side via Pyodide (WebAssembly)
- **Storage:** Browser `localStorage` — all data stays on your device, nothing is sent anywhere
- **Charting:** [Chart.js](https://www.chartjs.org/)
- **Deployment:** GitHub Actions → GitHub Pages (auto-deploys on every push to `main`)

## How data flows

User action (add/edit/delete a transaction)
│
▼
storage.js ────────────── reads/writes localStorage
│
▼
app.js ─────────────────── builds a JS array of transactions
│
▼
pyBridge.js ─────────────── JSON.stringify's it, crosses into Python
│
▼
projection.py ───────────── parses JSON, does real date math,
│ returns a plain number or JSON series
▼
app.js ─────────────────── renders the result (balance / chart)


JS owns state, storage, and the DOM. Python owns pure calculation — no side effects, no storage access, no DOM. Everything that crosses the boundary between them does so as plain JSON, which also solves the "JS has no date type that matches Python's" problem for free.

## Project structure

finance-tracker/
├── .github/workflows/deploy.yml # CI/CD — builds and deploys to GitHub Pages
└── site/
├── index.html
├── css/
│ └── style.css
├── js/
│ ├── app.js # UI logic, event handlers, rendering
│ ├── storage.js # localStorage persistence layer
│ └── pyBridge.js # Pyodide loading + JS↔Python bridge
└── py/
└── projection.py # Forecasting engine (pure Python)


## Running it locally

No build step required — just a local static file server, since ES modules need to be served over HTTP rather than opened directly as a file.

```bash
git clone https://github.com/muhilvannan16/finance-tracker.git
cd finance-tracker/site
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Possible future directions

- A weighted **Financial Health Score**, scoring spending consistency, savings rate, and category diversity
- Multiple accounts with transfers between them
- Structured category management instead of free text
- Natural-language transaction entry ("lunch with friends 15 bucks")

## License

This project is licensed under the [MIT License](LICENSE).
