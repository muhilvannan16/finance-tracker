import { initPyodide, loadBudgetsEngine, checkBudgetOverlap, getAmountSpent } from "./pyBridge.js";
import { getBudgets, saveBudgets, getTransactions } from "./storage.js";

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
    await loadBudgetsEngine();
    document.getElementById("engine-status").style.display = "none";
    await renderBudgets();
  } catch (err) {
    document.getElementById("engine-status").textContent =
      "Calculation engine failed to load. Try refreshing the page.";
    console.error("Pyodide failed to load:", err);
  }
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

/* ---- Bootstrap ---- */

const plannerReadyPromise = initPlanner();
