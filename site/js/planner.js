import { initPyodide, loadProjectionEngine, loadBudgetsEngine, loadNetWorthEngine, checkBudgetOverlap, getAmountSpent, getNetWorthSeries } from "./pyBridge.js";
import { getBudgets, saveBudgets, getTransactions, getTransfers, getAccounts, saveAccounts } from "./storage.js";

/**
 * Boots the Pyodide runtime and loads the budgets calculation engine.
 *
 * Once both promises resolve the #engine-status paragraph is hidden,
 * matching the pattern used by app.js for its projection engine.
 *
 * @returns {Promise<void>}
 */
async function initPlanner() {
  try {
    await initPyodide();
    await loadProjectionEngine();
    await loadNetWorthEngine();
    await loadBudgetsEngine();
    document.getElementById("engine-status").style.display = "none";
    await renderBudgets();
    renderUntypedAccounts();
  } catch (err) {
    document.getElementById("engine-status").textContent =
      "Calculation engine failed to load. Try refreshing the page.";
    console.error("Pyodide failed to load:", err);
  }
}

let netWorthChart = null;

/* ---- Untyped accounts migration ---- */

/**
 * Checks for accounts missing a "type" field (created before account
 * types existed) and renders a form to assign one to each. Shows or
 * hides #untyped-accounts-card depending on whether any are found.
 *
 * @returns {void}
 */
function renderUntypedAccounts() {
  const accounts = getAccounts();
  const untyped = accounts.filter((a) => !a.type);
  const card = document.getElementById("untyped-accounts-card");
  const list = document.getElementById("untyped-accounts-list");
  list.innerHTML = "";

  if (untyped.length === 0) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";

  untyped.forEach((account) => {
    const row = document.createElement("div");
    row.className = "form-field";

    const label = document.createElement("label");
    label.textContent = account.name;

    const select = document.createElement("select");
    select.innerHTML = `
      <option value="">Choose type…</option>
      <option value="asset">Asset</option>
      <option value="liability">Liability</option>
    `;
    select.addEventListener("change", () => {
      if (!select.value) return;
      const allAccounts = getAccounts();
      const target = allAccounts.find((a) => a.id === account.id);
      if (target) {
        target.type = select.value;
        saveAccounts(allAccounts);
      }
      renderUntypedAccounts();
    });

    row.append(label, select);
    list.appendChild(row);
  });
}

/* ---- Category custom-field toggle ---- */

document
  .getElementById("budget-category")
  .addEventListener("change", (e) => {
    document.getElementById("budget-category-custom-field").style.display =
      e.target.value === "Other" ? "block" : "none";
  });

/* ---- Budget list rendering ---- */

/**
 * Renders every saved budget into #budget-list, showing its category,
 * limit, amount spent so far, and a progress bar — flagged with
 * warning styling if spending has exceeded the limit.
 *
 * @returns {Promise<void>}
 */
async function renderBudgets() {
  const list = document.getElementById("budget-list");
  list.innerHTML = "";
  const budgets = getBudgets();
  const transactions = getTransactions();
  for (const budget of budgets) {
    const spent = await getAmountSpent(
      budget.category,
      budget.startDate,
      budget.endDate,
      transactions
    );
    const isOverBudget = spent > budget.limit;
    const row = document.createElement("div");
    row.className = isOverBudget ? "budget-row over-budget" : "budget-row";
    const info = document.createElement("div");
    info.className = "budget-info";
    const categorySpan = document.createElement("span");
    categorySpan.className = "budget-category";
    categorySpan.textContent = budget.category;
    const rangeSpan = document.createElement("span");
    rangeSpan.className = "budget-range";
    rangeSpan.textContent = `${budget.startDate} to ${budget.endDate}`;
    const amountSpan = document.createElement("span");
    amountSpan.className = "budget-amount";
    amountSpan.textContent = `$${spent.toFixed(2)} of $${Number(budget.limit).toFixed(2)} spent`;
    info.append(categorySpan, rangeSpan, amountSpan);
    const barTrack = document.createElement("div");
    barTrack.className = "budget-bar-track";
    const barFill = document.createElement("div");
    barFill.className = isOverBudget ? "budget-bar-fill over-budget" : "budget-bar-fill";
    const pct = Math.min((spent / budget.limit) * 100, 100);
    barFill.style.width = `${pct}%`;
    barTrack.appendChild(barFill);
    row.append(info, barTrack);
    list.appendChild(row);
  }
}

/* ---- Budget form submission ---- */

/**
 * Handles submission of the budget-creation form.
 *
 * Validates the date range, checks for overlapping budgets via the
 * Python engine, and — if clean — saves the new budget and resets
 * the form.
 *
 * @param {Event} e
 * @returns {Promise<void>}
 */
async function handleBudgetSubmit(e) {
  e.preventDefault();
  await plannerReadyPromise;
  const categorySelect = document.getElementById("budget-category").value;
  const category =
    categorySelect === "Other"
      ? document.getElementById("budget-category-custom").value.trim()
      : categorySelect;
  const limit = Number(document.getElementById("budget-limit").value);
  const startDate = document.getElementById("budget-start-date").value;
  const endDate = document.getElementById("budget-end-date").value;
  const errorEl = document.getElementById("budget-form-error");
  errorEl.textContent = "";
  if (categorySelect === "Other" && category === "") {
    errorEl.textContent = "Custom category cannot be empty.";
    return;
  }
  if (limit <= 0) {
    errorEl.textContent = "Spending limit must be greater than $0.";
    return;
  }
  if (startDate > endDate) {
    errorEl.textContent = "Start date must be before end date.";
    return;
  }
  const existingBudgets = getBudgets();
  const overlaps = await checkBudgetOverlap(category, startDate, endDate, existingBudgets);
  if (overlaps) {
    errorEl.textContent =
      "This overlaps with an existing budget for the same category. Choose a different date range.";
    return;
  }
  const newBudget = {
    id: crypto.randomUUID(),
    category,
    limit,
    startDate,
    endDate,
  };
  existingBudgets.push(newBudget);
  saveBudgets(existingBudgets);
  await renderBudgets();
  document.getElementById("budget-form").reset();
  document.getElementById("budget-category-custom-field").style.display = "none";
}

document.getElementById("budget-form").addEventListener("submit", handleBudgetSubmit);

/* ---- Net Worth chart ---- */

/**
 * Renders a line chart of net worth over the selected date range.
 * Blocks the calculation (rather than crashing) if any account is
 * still missing a type, since net_worth_series_json requires every
 * account to have one.
 *
 * @returns {Promise<void>}
 */
async function renderNetWorthChart() {
  const startDate = document.getElementById("networth-start-date").value;
  const endDate = document.getElementById("networth-end-date").value;
  const errorEl = document.getElementById("networth-error");
  errorEl.textContent = "";

  if (!startDate || !endDate) {
    errorEl.textContent = "Please select both a start and end date.";
    return;
  }
  if (startDate > endDate) {
    errorEl.textContent = "Start date must be before end date.";
    return;
  }

  const accounts = getAccounts();
  if (accounts.some((a) => !a.type)) {
    errorEl.textContent =
      "Assign a type to every account above before calculating net worth.";
    return;
  }

  const transactions = getTransactions();
  const transfers = getTransfers();

  const series = await getNetWorthSeries(accounts, transactions, transfers, startDate, endDate);

  if (netWorthChart) {
    netWorthChart.destroy();
  }

  const ctx = document.getElementById("networth-chart").getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
  gradient.addColorStop(0, "#12172B");
  gradient.addColorStop(1, "#F0A868");

  netWorthChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: series.map((point) => point.date),
      datasets: [
        {
          label: "Net Worth",
          data: series.map((point) => point.netWorth),
          borderColor: gradient,
          borderWidth: 2.5,
          pointBackgroundColor: "#F0A868",
          pointBorderColor: "#1B2242",
          pointRadius: series.length === 1 ? 5 : 0,
          pointHoverRadius: 5,
          tension: 0.3,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: "#9AA0B4",
            font: { family: "'IBM Plex Mono', monospace", size: 11 },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#9AA0B4",
            font: { family: "'IBM Plex Mono', monospace", size: 10 },
            maxRotation: 45,
          },
          grid: { color: "rgba(244, 241, 234, 0.06)" },
        },
        y: {
          ticks: {
            color: "#9AA0B4",
            font: { family: "'IBM Plex Mono', monospace", size: 10 },
          },
          grid: { color: "rgba(244, 241, 234, 0.06)" },
        },
      },
    },
  });
}

document
  .getElementById("show-networth-chart-btn")
  .addEventListener("click", renderNetWorthChart);

/* ---- Bootstrap ---- */

const plannerReadyPromise = initPlanner();
