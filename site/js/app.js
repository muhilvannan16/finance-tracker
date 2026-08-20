import {
  getTransactions,
  saveTransactions,
  getAccounts,
  saveAccounts,
} from "./storage.js";
import { loadProjectionEngine, getProjectedBalance, getBalanceSeries } from "./pyBridge.js";

/**
 * The id of the transaction currently being edited, or null if the form
 * is in "add new" mode.
 * @type {string | null}
 */
let editingId = null;

/**
 * Promise that resolves once the projection engine (Pyodide + Python
 * source) has finished loading. Set in the DOMContentLoaded listener.
 * @type {Promise<void> | null}
 */
let engineReadyPromise = null;

/**
 * The active Chart.js instance for the balance chart, or null if no
 * chart is currently rendered.
 * @type {object | null}
 */
let balanceChart = null;

/**
 * Ensures a default "Main" account exists in storage.
 *
 * Reads the accounts array — if it is empty, creates a single account
 * with id "main", name "Main", and a zero starting balance, then persists
 * it. If accounts already exist, does nothing.
 *
 * @returns {void}
 */
function seedDefaultAccount() {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    saveAccounts([{ id: "main", name: "Main", startingBalance: 0 }]);
  }
}

/**
 * Renders every stored transaction into the #transaction-list container.
 *
 * Clears the container first, then creates one row per transaction showing
 * label, category, date, and a colour-coded signed amount. Each row
 * includes Edit and Delete buttons wired to {@link handleEdit} and
 * {@link handleDelete}.
 *
 * @returns {void}
 */
function renderTransactions() {
  const list = document.getElementById("transaction-list");
  list.innerHTML = "";

  const transactions = getTransactions();

  transactions.forEach((tx) => {
    const row = document.createElement("div");
    row.className = "transaction-row";

    const info = document.createElement("div");
    info.className = "transaction-info";

    const labelSpan = document.createElement("span");
    labelSpan.className = "tx-label";
    labelSpan.textContent = tx.label;

    const categorySpan = document.createElement("span");
    categorySpan.className = "tx-category";
    categorySpan.textContent = tx.category;

    const dateSpan = document.createElement("span");
    dateSpan.className = "tx-date";
    dateSpan.textContent = tx.date;

    info.append(labelSpan, categorySpan, dateSpan);

    const amountSpan = document.createElement("span");
    const isIncome = tx.direction === "income";
    amountSpan.className = isIncome ? "tx-amount income" : "tx-amount expense";
    const prefix = isIncome ? "+" : "−";
    amountSpan.textContent = `${prefix}$${Number(tx.amount).toFixed(2)}`;

    const actions = document.createElement("div");
    actions.className = "transaction-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn-edit";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => handleEdit(tx.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => handleDelete(tx.id));

    actions.append(editBtn, deleteBtn);
    row.append(info, amountSpan, actions);
    list.appendChild(row);
  });
}

/**
 * Populates the transaction form with an existing transaction's values
 * so the user can edit it in place.
 *
 * @param {string} id - The id of the transaction to edit.
 * @returns {void}
 */
function handleEdit(id) {
  const transactions = getTransactions();
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return;

  document.getElementById("label").value = tx.label;
  document.getElementById("category").value = tx.category;
  document.getElementById("amount").value = tx.amount;
  document.getElementById("direction").value = tx.direction;
  document.getElementById("date").value = tx.date;
  document.getElementById("frequency").value = tx.frequency;
  editingId = id;

  document.getElementById("cancel-edit-btn").style.display = "inline-block";
  document.querySelector("#transaction-form button[type='submit']").textContent =
    "Update Transaction";
}

/**
 * Resets the form back to "add new" mode, clearing all fields, hiding
 * the cancel button, and restoring the submit button label.
 *
 * @returns {void}
 */
function handleCancelEdit() {
  document.getElementById("transaction-form").reset();
  editingId = null;
  document.getElementById("cancel-edit-btn").style.display = "none";
  document.querySelector("#transaction-form button[type='submit']").textContent =
    "Add Transaction";
}

/**
 * Removes a transaction from storage and re-renders the list.
 *
 * @param {string} id - The id of the transaction to delete.
 * @returns {void}
 */
function handleDelete(id) {
  const transactions = getTransactions().filter((t) => t.id !== id);
  saveTransactions(transactions);
  renderTransactions();
  renderCurrentBalance();
  document.getElementById("projected-balance-display").textContent = "";
  if (balanceChart) {
    balanceChart.destroy();
    balanceChart = null;
  }
}

/**
 * Handles the transaction-form submit event.
 *
 * Reads every form field, builds a transaction object, and either replaces
 * an existing transaction (when editing) or appends a new one. Persists
 * the updated array, re-renders, resets the form, and clears the editing
 * state.
 *
 * @param {SubmitEvent} e
 * @returns {void}
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const label = document.getElementById("label").value.trim();
  const category = document.getElementById("category").value.trim();
  const amount = Number(document.getElementById("amount").value);
  const direction = document.getElementById("direction").value;
  const date = document.getElementById("date").value;
  const frequency = document.getElementById("frequency").value;

  const transaction = {
    id: editingId ?? crypto.randomUUID(),
    label,
    category,
    amount,
    direction,
    date,
    accountId: "main",
    frequency,
  };

  const transactions = getTransactions();

  if (editingId) {
    const idx = transactions.findIndex((t) => t.id === editingId);
    if (idx !== -1) {
      transactions[idx] = transaction;
    }
  } else {
    transactions.push(transaction);
  }

  saveTransactions(transactions);
  renderTransactions();
  renderCurrentBalance();
  document.getElementById("projected-balance-display").textContent = "";
  if (balanceChart) {
    balanceChart.destroy();
    balanceChart = null;
  }
  e.target.reset();
  editingId = null;
  document.getElementById("cancel-edit-btn").style.display = "none";
  document.querySelector("#transaction-form button[type='submit']").textContent =
    "Add Transaction";
}

/**
 * Computes the projected balance as of today and displays it in the
 * #current-balance element. Waits for the projection engine to be ready
 * before running.
 *
 * @returns {Promise<void>}
 */
async function renderCurrentBalance() {
  try {
    await engineReadyPromise;

    const now = new Date();
    const todayStr =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");

    const account = getAccounts().find((a) => a.id === "main");
    const startingBalance = account ? account.startingBalance : 0;
    const transactions = getTransactions();

    const balance = await getProjectedBalance(
      transactions,
      startingBalance,
      todayStr
    );

    const el = document.getElementById("current-balance");
    const sign = balance < 0 ? "-" : "";
    el.textContent = `Current balance: ${sign}$${Math.abs(balance).toFixed(2)}`;
    el.classList.remove("balance-updated");
    void el.offsetWidth;
    el.classList.add("balance-updated");
  } catch (err) {
    document.getElementById("current-balance").textContent =
      "Unable to calculate balance.";
    console.error("Balance calculation failed:", err);
  }
}

/**
 * Reads the date from #projection-date, computes the projected balance
 * as of that date, and displays the result in #projected-balance-display.
 * If no date is selected, prompts the user to pick one.
 *
 * @returns {Promise<void>}
 */
async function renderProjectedBalance() {
  const display = document.getElementById("projected-balance-display");
  const dateValue = document.getElementById("projection-date").value;

  if (!dateValue) {
    display.textContent = "Please select a date.";
    return;
  }

  try {
    await engineReadyPromise;

    const account = getAccounts().find((a) => a.id === "main");
    const startingBalance = account ? account.startingBalance : 0;
    const transactions = getTransactions();

    const balance = await getProjectedBalance(
      transactions,
      startingBalance,
      dateValue
    );

    const sign = balance < 0 ? "-" : "";
    display.textContent = `Projected balance as of ${dateValue}: ${sign}$${Math.abs(balance).toFixed(2)}`;
  } catch (err) {
    display.textContent = "Unable to calculate projected balance.";
    console.error("Projection calculation failed:", err);
  }
}

/**
 * Fetches a daily balance series from today to the date selected in
 * #projection-date and renders it as a Chart.js line chart on the
 * #balance-chart canvas. Destroys any previously rendered chart first.
 *
 * @returns {Promise<void>}
 */
async function renderBalanceChart() {
  const dateValue = document.getElementById("projection-date").value;

  if (!dateValue) {
    alert("Please select a date.");
    return;
  }

  try {
    await engineReadyPromise;

    const now = new Date();
    const todayStr =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");
    
    if (dateValue < todayStr) {
      alert("Please select a date today or in the future to see a projection chart.");
      return;
    }  

    const account = getAccounts().find((a) => a.id === "main");
    const startingBalance = account ? account.startingBalance : 0;
    const transactions = getTransactions();

    const series = await getBalanceSeries(
      transactions,
      startingBalance,
      todayStr,
      dateValue
    );

    if (balanceChart) {
      balanceChart.destroy();
    }

    const ctx = document.getElementById("balance-chart").getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
    gradient.addColorStop(0, "#12172B");
    gradient.addColorStop(1, "#F0A868");

    balanceChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: series.map((point) => point.date),
        datasets: [
          {
            label: "Projected Balance",
            data: series.map((point) => point.balance),
            borderColor: gradient,
            borderWidth: 2.5,
            pointBackgroundColor: "#F0A868",
            pointBorderColor: "#1B2242",
            pointRadius: 0,
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
            grid: {
              color: "rgba(244, 241, 234, 0.06)",
            },
          },
          y: {
            ticks: {
              color: "#9AA0B4",
              font: { family: "'IBM Plex Mono', monospace", size: 10 },
            },
            grid: {
              color: "rgba(244, 241, 234, 0.06)",
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("Chart rendering failed:", err);
    alert("Unable to render balance chart.");
  }
}

/* ------------------------------------------------------------------ */
/*  Bootstrap                                                         */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  engineReadyPromise = loadProjectionEngine();
  engineReadyPromise
    .then(() => {
      document.getElementById("engine-status").style.display = "none";
      renderCurrentBalance();
    })
    .catch((err) => {
      document.getElementById("engine-status").textContent =
        "Calculation engine failed to load. Try refreshing the page.";
      console.error("Pyodide failed to load:", err);
    });

  seedDefaultAccount();

  const form = document.getElementById("transaction-form");
  form.addEventListener("submit", handleFormSubmit);

  document.getElementById("cancel-edit-btn")
    .addEventListener("click", handleCancelEdit);

  document.getElementById("calculate-projection-btn")
    .addEventListener("click", renderProjectedBalance);

  document.getElementById("show-chart-btn")
    .addEventListener("click", renderBalanceChart);

  renderTransactions();
});
