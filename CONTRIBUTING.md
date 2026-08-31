# Contributing to finance-tracker

Thanks for your interest in contributing! finance-tracker is a fully static personal
finance tracker — no backend, no build step, no server. It runs a real Python
forecasting engine in the browser via Pyodide/WebAssembly, alongside vanilla
JavaScript for the UI. There are several ways to help, not all of which require
writing code:

- **Report bugs** — open an issue describing what happened.
- **Suggest features** — open an issue describing the idea and the problem it solves.
- **Improve documentation** — typo fixes, clearer setup steps, missing explanations.
- **Submit code changes** — see the full workflow below.

## Project structure

Knowing where things live before you start makes a fork much easier to navigate:

- `site/py/` — Python logic, run in-browser via Pyodide.
  - `projection.py` — balance forecasting/projection engine.
  - `recurring.py` — rule-based recurring-charge detection.
- `site/js/` — JavaScript. Vanilla ES modules, no framework.
  - `app.js` — main orchestration: rendering, event wiring, state flow.
  - `storage.js` — all localStorage reads/writes.
  - `pyBridge.js` — the JS↔Python bridge into Pyodide.
  - `aiSuggestions.js` — optional AI-assisted recurring detection (Groq, BYOK).
- `site/index.html` / `site/css/style.css` — markup and styling.
- `docs/` — README images/screenshots.

**Architectural rule to follow:** Python owns calculation (balances, projections,
recurrence detection). JavaScript owns state and UI. Try not to blur that line —
e.g. don't reimplement date-math or balance logic in JS if Python already does it;
call into Python via `pyBridge.js` instead.

## Getting set up locally

No build step and no package manager needed — it's static files served directly.

1. Fork the repository, then clone your fork:

```bash
git clone https://github.com/<your-username>/finance-tracker.git
cd finance-tracker
```

2. Serve the `site/` folder with any local static server, for example:

```bash
cd site
python -m http.server 8000
```

3. Open `http://localhost:8000` in your browser. Pyodide loads on page start — give
   it a few seconds on first load.
4. Create a branch for your change:

```bash
git checkout -b your-feature-name
```

## Making changes

- **Style:** match the existing code's conventions in whichever file you're editing —
  naming patterns, comment style, and function structure should feel consistent with
  the surrounding code rather than introducing a new style.
- **Keep Python and JS decoupled.** If you're adding a calculation, it likely belongs
  in `site/py/`, exposed to JS through `pyBridge.js`, not written directly in `app.js`.
- **Small, focused commits** with clear messages are easier to review than one large
  commit bundling unrelated changes.

## Testing your change

There's no automated test suite yet, so correctness is checked by hand — take this
seriously, especially for anything touching money:

1. **Predict before you run.** For any change to balances, projections, or recurring
   detection, hand-calculate what the expected output should be *before* running your
   code, so you have something real to check against.
2. **Test in the actual UI**, not just in isolation — add real transactions/transfers
   through the interface and confirm the displayed balances match your prediction.
3. **Check edge cases** relevant to your change — e.g. month-end dates for anything
   touching recurrence (Python's `add_one_month` clamps short months, don't
   reintroduce drift), or account filtering if you touch transfers/projections.
4. If your change is JS-only UI work, manually click through the affected flow
   (create/edit/delete, etc.) rather than assuming it works.

## Opening a pull request

1. Push your branch and open a PR against `main`.
2. Write a clear description: what changed, why, and how you tested it.
3. Every PR is reviewed by both a human maintainer and two automated bots (Claude
   Code Review and Codex) — expect comments and be ready to iterate; this is normal,
   not a sign something's wrong.
4. Once approved and any review feedback is addressed, a maintainer will merge.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating,
you're expected to uphold it.

## Questions

Open an issue and tag it as a question. Keeping it public means the answer helps
future contributors too, not just you.
