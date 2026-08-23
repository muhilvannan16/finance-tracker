import {
  getTransactions,
  saveTransactions,
  getAccounts,
  saveAccounts,
  getTransfers,
  saveTransfers,
  getHandledRecurringIds,
  saveHandledRecurringIds,
} from "./storage.js";
import { loadProjectionEngine, getProjectedBalance, getBalanceSeries, loadRecurringEngine, findRecurringGroups } from "./pyBridge.js";
import { detectRecurringWithAI } from "./aiSuggestions.js";

export const AI_API_KEY_STORAGE_KEY = "finance-tracker:aiApiKey";

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
 * Promise that resolves once the recurring-detection engine
 * (recurring.py) has finished loading. Set in the DOMContentLoaded
 * listener, independent of engineReadyPromise (projection.py).
 * @type {Promise<void> | null}
 */
let recurringEngineReadyPromise = null;

/**
 * The active Chart.js instance for the balance chart, or null if no
 * chart is currently rendered.
 * @type {object | null}
 */
let balanceChart = null;

/**
 * The id of the transfer currently being edited, or null if the form
 * is in "add new" mode.
 * @type {string | null}
 */
let editingTransferId = null;

/**
 * Recurring-charge suggestions currently pending user action (accept
 * or dismiss). Each item has the shape
 * { normalizedLabel, matchedTransactionIds, confidence }. Removal from
 * this array is done by reference equality (the exact object instance),
 * not by id, since suggestions are only ever populated once per
 * detection run and never rebuilt mid-session.
 * @type {Array<{normalizedLabel: string, matchedTransactionIds: string[],
 *   confidence: number}>}
 */
let pendingRecurringSuggestions = [];

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
 * Populates #account-selector with an <option> per account.
 * Preserves the current selection if the selected account still exists.
 *
 * @returns {void}
 */
function renderAccountSelector() {
  const selector = document.getElementById("account-selector");
  const previousValue = selector.value;
  const accounts = getAccounts();

  selector.innerHTML = "";
  accounts.forEach((acct) => {
    const opt = document.createElement("option");
    opt.value = acct.id;
    opt.textContent = acct.name;
    selector.appendChild(opt);
  });

  if (accounts.some((a) => a.id === previousValue)) {
    selector.value = previousValue;
  }
}

/**
 * Renders every stored account into the #account-list container,
 * showing name and starting balance.
 *
 * @returns {void}
 */
function renderAccountList() {
  const list = document.getElementById("account-list");
  list.innerHTML = "";

  const accounts = getAccounts();

  accounts.forEach((acct) => {
    const row = document.createElement("div");
    row.className = "account-row";

    const info = document.createElement("div");
    info.className = "account-info";

    const nameSpan = document.createElement("span");
    nameSpan.className = "acct-name";
    nameSpan.textContent = acct.name;

    const balSpan = document.createElement("span");
    balSpan.className = "acct-balance";
    const sign = acct.startingBalance < 0 ? "-" : "";
    balSpan.textContent = `Starting: ${sign}$${Math.abs(acct.startingBalance).toFixed(2)}`;

    info.append(nameSpan, balSpan);
    row.appendChild(info);
    list.appendChild(row);
  });
}

/**
 * Populates #tx-account with an <option> per account, matching
 * renderAccountSelector's logic.
 *
 * @returns {void}
 */
function renderTxAccountOptions() {
  const selector = document.getElementById("tx-account");
  const previousValue = selector.value;
  const accounts = getAccounts();

  selector.innerHTML = "";
  accounts.forEach((acct) => {
    const opt = document.createElement("option");
    opt.value = acct.id;
    opt.textContent = acct.name;
    selector.appendChild(opt);
  });

  if (accounts.some((a) => a.id === previousValue)) {
    selector.value = previousValue;
  }
}

/**
 * Handles the account-form submit event.
 *
 * Reads name and starting balance, builds an account object, appends it
 * to the accounts array, persists, re-renders all account-related UI,
 * and resets the form.
 *
 * @param {SubmitEvent} e
 * @returns {void}
 */
function handleAccountFormSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("account-name").value.trim();
  const startingBalance = Number(
    document.getElementById("account-starting-balance").value
  );

  const account = {
    id: crypto.randomUUID(),
    name,
    startingBalance,
  };

  const accounts = getAccounts();
  accounts.push(account);
  saveAccounts(accounts);

  renderAccountList();
  renderAccountSelector();
  renderTxAccountOptions();
  renderTransferAccountOptions();
  e.target.reset();
}

/**
 * Returns the starting balance, all transactions, all transfers, and
 * the account id for the account currently selected in #account-selector.
 *
 * @returns {{ startingBalance: number, transactions: Array, transfers: Array,
 *   accountId: string }} The selected account's context for projection
 *   calculations.
 */
function getSelectedAccountContext() {
  const selectedId = document.getElementById("account-selector").value;
  const account = getAccounts().find((a) => a.id === selectedId);
  const startingBalance = account ? account.startingBalance : 0;
  const transactions = getTransactions();
  const transfers = getTransfers();
  return { startingBalance, transactions, transfers, accountId: selectedId };
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
  const accounts = getAccounts();

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

    const accountMatch = accounts.find((a) => a.id === tx.accountId);
    const accountSpan = document.createElement("span");
    accountSpan.className = "tx-account";
    accountSpan.textContent = accountMatch ? accountMatch.name : tx.accountId;

    info.append(labelSpan, categorySpan, accountSpan, dateSpan);

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
  document.getElementById("tx-account").value = tx.accountId;
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
  const accountId = document.getElementById("tx-account").value;

  const transaction = {
    id: editingId ?? crypto.randomUUID(),
    label,
    category,
    amount,
    direction,
    date,
    accountId,
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

    const { startingBalance, transactions, transfers, accountId } = getSelectedAccountContext();

    const balance = await getProjectedBalance(
      transactions,
      transfers,
      startingBalance,
      todayStr,
      accountId
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

    const { startingBalance, transactions, transfers, accountId } = getSelectedAccountContext();

    const balance = await getProjectedBalance(
      transactions,
      transfers,
      startingBalance,
      dateValue,
      accountId
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

    const { startingBalance, transactions, transfers, accountId } = getSelectedAccountContext();

    const series = await getBalanceSeries(
      transactions,
      transfers,
      startingBalance,
      todayStr,
      dateValue,
      accountId
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
/*  Transfer helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Populates a single <select> element with one <option> per account.
 *
 * @param {HTMLSelectElement} selector - The <select> to populate.
 * @param {Account[]} accounts - The accounts to list.
 * @returns {void}
 */
function populateAccountSelect(selector, accounts) {
  const previousValue = selector.value;
  selector.innerHTML = "";

  accounts.forEach((acct) => {
    const opt = document.createElement("option");
    opt.value = acct.id;
    opt.textContent = acct.name;
    selector.appendChild(opt);
  });

  if (accounts.some((a) => a.id === previousValue)) {
    selector.value = previousValue;
  }
}

/**
 * Populates both #from-account and #to-account dropdowns,
 * then applies the cross-disable constraint.
 *
 * @returns {void}
 */
function renderTransferAccountOptions() {
  const accounts = getAccounts();
  const fromSelect = document.getElementById("from-account");
  const toSelect = document.getElementById("to-account");
  populateAccountSelect(fromSelect, accounts);
  populateAccountSelect(toSelect, accounts);
  if (toSelect.value === fromSelect.value) {
    const alternative = accounts.find((a) => a.id !== fromSelect.value);
    if (alternative) {
      toSelect.value = alternative.id;
    }
  }
  updateTransferAccountConstraints();
}

/**
 * Disables the currently selected "from" account in the "to" dropdown
 * and vice-versa, so the user cannot pick the same account for both.
 *
 * @returns {void}
 */
function updateTransferAccountConstraints() {
  const fromSelect = document.getElementById("from-account");
  const toSelect = document.getElementById("to-account");
  const fromVal = fromSelect.value;
  const toVal = toSelect.value;

  Array.from(fromSelect.options).forEach((opt) => {
    opt.disabled = opt.value === toVal;
  });
  Array.from(toSelect.options).forEach((opt) => {
    opt.disabled = opt.value === fromVal;
  });
}

/**
 * Renders every stored transfer into the #transfer-list container.
 *
 * @returns {void}
 */
function renderTransfers() {
  const list = document.getElementById("transfer-list");
  list.innerHTML = "";

  const transfers = getTransfers();
  const accounts = getAccounts();

  transfers.forEach((tr) => {
    const row = document.createElement("div");
    row.className = "transfer-row";

    const info = document.createElement("div");
    info.className = "transfer-info";

    const fromAcct = accounts.find((a) => a.id === tr.fromAccountId);
    const toAcct = accounts.find((a) => a.id === tr.toAccountId);
    const accountsSpan = document.createElement("span");
    accountsSpan.className = "transfer-accounts";
    accountsSpan.textContent =
      `${fromAcct ? fromAcct.name : tr.fromAccountId} → ${toAcct ? toAcct.name : tr.toAccountId}`;

    const dateSpan = document.createElement("span");
    dateSpan.className = "transfer-date";
    dateSpan.textContent = tr.date;

    info.append(accountsSpan, dateSpan);

    const amountSpan = document.createElement("span");
    amountSpan.className = "transfer-amount";
    amountSpan.textContent = `$${Number(tr.amount).toFixed(2)}`;

    const actions = document.createElement("div");
    actions.className = "transfer-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn-edit";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => handleTransferEdit(tr.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => handleTransferDelete(tr.id));

    actions.append(editBtn, deleteBtn);
    row.append(info, amountSpan, actions);
    list.appendChild(row);
  });
}

/**
 * Populates the transfer form with an existing transfer's values
 * so the user can edit it in place.
 *
 * @param {string} id - The id of the transfer to edit.
 * @returns {void}
 */
function handleTransferEdit(id) {
  const transfers = getTransfers();
  const tr = transfers.find((t) => t.id === id);
  if (!tr) return;

  document.getElementById("from-account").value = tr.fromAccountId;
  document.getElementById("to-account").value = tr.toAccountId;
  document.getElementById("transfer-amount").value = tr.amount;
  document.getElementById("transfer-date").value = tr.date;
  editingTransferId = id;

  updateTransferAccountConstraints();
  document.getElementById("cancel-transfer-edit-btn").style.display = "inline-block";
  document.querySelector("#transfer-form button[type='submit']").textContent =
    "Update Transfer";
}

/**
 * Removes a transfer from storage and re-renders.
 *
 * @param {string} id - The id of the transfer to delete.
 * @returns {void}
 */
function handleTransferDelete(id) {
  const transfers = getTransfers().filter((t) => t.id !== id);
  saveTransfers(transfers);
  if (id === editingTransferId) {
    handleCancelTransferEdit();
  }
  renderTransfers();
  renderCurrentBalance();
  document.getElementById("projected-balance-display").textContent = "";
  if (balanceChart) {
    balanceChart.destroy();
    balanceChart = null;
  }
}

/**
 * Resets the transfer form back to "add new" mode.
 *
 * @returns {void}
 */
function handleCancelTransferEdit() {
  document.getElementById("transfer-form").reset();
  editingTransferId = null;
  document.getElementById("transfer-form-error").textContent = "";
  document.getElementById("cancel-transfer-edit-btn").style.display = "none";
  document.querySelector("#transfer-form button[type='submit']").textContent =
    "Add Transfer";
  updateTransferAccountConstraints();
}

/**
 * Handles the transfer-form submit event.
 *
 * Validates that from and to accounts differ, then either updates an
 * existing transfer or appends a new one. Persists, re-renders, resets
 * the form, and clears editing state.
 *
 * @param {SubmitEvent} e
 * @returns {void}
 */
function handleTransferFormSubmit(e) {
  e.preventDefault();

  const errorEl = document.getElementById("transfer-form-error");
  errorEl.textContent = "";

  const fromAccountId = document.getElementById("from-account").value;
  const toAccountId = document.getElementById("to-account").value;
  const amount = Number(document.getElementById("transfer-amount").value);
  const date = document.getElementById("transfer-date").value;

  if (fromAccountId === toAccountId) {
    errorEl.textContent = "From and To accounts must be different.";
    return;
  }

  const transfer = {
    id: editingTransferId ?? crypto.randomUUID(),
    fromAccountId,
    toAccountId,
    amount,
    date,
  };

  const transfers = getTransfers();

  if (editingTransferId) {
    const idx = transfers.findIndex((t) => t.id === editingTransferId);
    if (idx !== -1) {
      transfers[idx] = transfer;
    }
  } else {
    transfers.push(transfer);
  }

  saveTransfers(transfers);
  renderTransfers();
  renderCurrentBalance();
  document.getElementById("projected-balance-display").textContent = "";
  if (balanceChart) {
    balanceChart.destroy();
    balanceChart = null;
  }
  e.target.reset();
  editingTransferId = null;
  document.getElementById("cancel-transfer-edit-btn").style.display = "none";
  document.querySelector("#transfer-form button[type='submit']").textContent =
    "Add Transfer";
  updateTransferAccountConstraints();
}

/* ------------------------------------------------------------------ */
/*  Recurring-suggestion handlers                                     */
/* ------------------------------------------------------------------ */

/**
 * Runs the full recurring-charge detection pipeline: loads handled ids,
 * filters to unhandled transactions, runs the rule-based Pyodide engine,
 * then sends leftovers to the AI detector. Merges both result sets into
 * pendingRecurringSuggestions and re-renders.
 *
 * @returns {Promise<void>}
 */
async function runRecurringDetection() {
  await recurringEngineReadyPromise;

  const transactions = getTransactions();
  const handledSet = new Set(getHandledRecurringIds());
  const unhandledTransactions = transactions.filter((t) => !handledSet.has(t.id));

  const ruleGroups = await findRecurringGroups(unhandledTransactions);

  const ruleSuggestions = ruleGroups.map((group) => {
    const firstMatch = unhandledTransactions.find(
      (t) => t.id === group.matchedTransactionIds[0]
    );
    return {
      normalizedLabel: firstMatch ? firstMatch.label : "Unknown",
      matchedTransactionIds: group.matchedTransactionIds,
      confidence: 1.0,
      source: "rule",
    };
  });

  const claimedByRules = new Set(
    ruleSuggestions.flatMap((s) => s.matchedTransactionIds)
  );

  function isWithinLastSixMonths(dateStr) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    return new Date(dateStr) >= cutoff;
  }

  const leftovers = unhandledTransactions.filter(
    (t) => !claimedByRules.has(t.id) && isWithinLastSixMonths(t.date)
  );

  const aiResult = await detectRecurringWithAI(leftovers);
  const aiSuggestions = aiResult.suggestions.map((s) => ({
    ...s,
    source: "ai",
  }));

  pendingRecurringSuggestions = [...ruleSuggestions, ...aiSuggestions];
  renderRecurringSuggestions();
}

/**
 * Renders the current pendingRecurringSuggestions list into the
 * #recurring-suggestions-list container. Clears existing content, shows
 * an empty-state message when no suggestions are pending, and otherwise
 * builds one .suggestion-banner per suggestion with Dismiss/Accept buttons.
 * @returns {void}
 */
function renderRecurringSuggestions() {
  const list = document.getElementById("recurring-suggestions-list");
  list.innerHTML = "";

  if (pendingRecurringSuggestions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "suggestion-empty";
    empty.textContent = "No recurring charges detected right now.";
    list.appendChild(empty);
    return;
  }

  for (const suggestion of pendingRecurringSuggestions) {
    const banner = document.createElement("div");
    banner.className = "suggestion-banner";

    const info = document.createElement("div");
    info.className = "suggestion-info";

    const label = document.createElement("span");
    label.className = "suggestion-label";
    label.textContent = suggestion.normalizedLabel;

    const meta = document.createElement("span");
    meta.className = "suggestion-meta";
    const matchCount = suggestion.matchedTransactionIds.length;
    if (suggestion.source === "rule") {
      meta.textContent = matchCount + " matching transactions";
    } else {
      const pct = Math.round(suggestion.confidence * 100);
      meta.textContent =
        matchCount + " matching transactions · " + pct + "% confidence · Suggested by AI";
    }

    info.appendChild(label);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "suggestion-actions";

    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "btn-secondary";
    dismissBtn.textContent = "Dismiss";
    dismissBtn.addEventListener("click", () => {
      handleDismissRecurringSuggestion(suggestion);
    });

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "btn-primary";
    acceptBtn.textContent = "Accept";
    acceptBtn.addEventListener("click", () => {
      handleAcceptRecurringSuggestion(suggestion);
    });

    actions.appendChild(dismissBtn);
    actions.appendChild(acceptBtn);

    banner.appendChild(info);
    banner.appendChild(actions);
    list.appendChild(banner);
  }
}

/**
 * Accepts a recurring-charge suggestion: creates a new monthly
 * transaction based on the latest matched transaction, marks all
 * matched ids as handled, removes the suggestion from the pending
 * list, and re-renders.
 *
 * @param {{normalizedLabel: string, matchedTransactionIds: string[],
 *   confidence: number}} suggestion
 * @returns {void}
 */
function handleAcceptRecurringSuggestion(suggestion) {
  const { matchedTransactionIds } = suggestion;

  const transactions = getTransactions();
  const matched = transactions.filter((t) => matchedTransactionIds.includes(t.id));

  if (matched.length < 2) {
    console.warn(
      "Recurring suggestion is stale (matched transactions were deleted or modified); removing it.",
      suggestion
    );
    pendingRecurringSuggestions = pendingRecurringSuggestions.filter((s) => s !== suggestion);
    renderRecurringSuggestions();
    return;
  }

  const latest = matched.reduce((a, b) => (b.date > a.date ? b : a));

  const newTransaction = {
    id: crypto.randomUUID(),
    label: latest.label,
    category: latest.category,
    amount: latest.amount,
    direction: latest.direction,
    date: latest.date,
    accountId: latest.accountId,
    frequency: "monthly",
  };

  transactions.push(newTransaction);
  saveTransactions(transactions);

  const handledIds = getHandledRecurringIds();
  saveHandledRecurringIds([...handledIds, ...matchedTransactionIds]);

  pendingRecurringSuggestions = pendingRecurringSuggestions.filter(
    (s) => s !== suggestion
  );

  renderTransactions();
  renderCurrentBalance();
  document.getElementById("projected-balance-display").textContent = "";
  if (balanceChart) {
    balanceChart.destroy();
    balanceChart = null;
  }
  renderRecurringSuggestions();
}

/**
 * Dismisses a recurring-charge suggestion: marks all matched ids as
 * handled without creating any transaction, removes the suggestion
 * from the pending list, and re-renders the suggestion banners only.
 *
 * @param {{normalizedLabel: string, matchedTransactionIds: string[],
 *   confidence: number}} suggestion
 * @returns {void}
 */
function handleDismissRecurringSuggestion(suggestion) {
  const { matchedTransactionIds } = suggestion;

  const handledIds = getHandledRecurringIds();
  saveHandledRecurringIds([...handledIds, ...matchedTransactionIds]);

  pendingRecurringSuggestions = pendingRecurringSuggestions.filter(
    (s) => s !== suggestion
  );

  renderRecurringSuggestions();
}

/* ------------------------------------------------------------------ */
/*  AI Settings helpers                                               */
/* ------------------------------------------------------------------ */

/**
 * Reads the saved API key from localStorage and updates the AI Settings
 * card status text and Remove Key button visibility accordingly.
 *
 * @returns {void}
 */
function renderAiKeyStatus() {
  const key = localStorage.getItem(AI_API_KEY_STORAGE_KEY);
  const status = document.getElementById("ai-status");
  const removeBtn = document.getElementById("remove-ai-key-btn");

  if (!key) {
    status.textContent =
      "No AI features are enabled — add a Groq API key to use AI-assisted recurring detection";
    removeBtn.style.display = "none";
  } else {
    status.textContent = "✓ AI features enabled";
    removeBtn.style.display = "inline-block";
  }
}

/**
 * Toggles the API key input between password and plain-text visibility
 * and updates the toggle button label to match.
 *
 * @returns {void}
 */
function handleToggleKeyVisibility() {
  const input = document.getElementById("ai-api-key-input");
  const btn = document.getElementById("toggle-key-visibility");

  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
}

/**
 * Validates and saves the API key entered in #ai-api-key-input to
 * localStorage. Shows an inline error if the input is empty.
 *
 * @returns {void}
 */
function handleSaveAiKey() {
  const input = document.getElementById("ai-api-key-input");
  const errorEl = document.getElementById("ai-key-error");
  const trimmed = input.value.trim();

  if (!trimmed) {
    errorEl.textContent = "Please enter an API key before saving.";
    return;
  }

  errorEl.textContent = "";
  localStorage.setItem(AI_API_KEY_STORAGE_KEY, trimmed);
  input.value = "";
  renderAiKeyStatus();
}

/**
 * Shows the remove-key confirmation modal.
 *
 * @returns {void}
 */
function handleShowRemoveKeyModal() {
  document.getElementById("remove-key-modal").style.display = "flex";
}

/**
 * Hides the remove-key confirmation modal without taking action.
 *
 * @returns {void}
 */
function handleCancelRemoveKey() {
  document.getElementById("remove-key-modal").style.display = "none";
}

/**
 * Removes the saved API key from localStorage, closes the modal,
 * and refreshes the AI status display.
 *
 * @returns {void}
 */
function handleConfirmRemoveKey() {
  localStorage.removeItem(AI_API_KEY_STORAGE_KEY);
  document.getElementById("remove-key-modal").style.display = "none";
  renderAiKeyStatus();
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

  recurringEngineReadyPromise = loadRecurringEngine();
  recurringEngineReadyPromise
    .then(() => {
      document.getElementById("check-recurring-btn").disabled = false;
    })
    .catch((err) => {
      console.error("Recurring-detection engine failed to load:", err);
    });

  seedDefaultAccount();
  renderAccountList();
  renderAccountSelector();
  renderTxAccountOptions();
  renderTransferAccountOptions();
  renderTransfers();
  renderAiKeyStatus();

  const form = document.getElementById("transaction-form");
  form.addEventListener("submit", handleFormSubmit);

  document.getElementById("transfer-form")
    .addEventListener("submit", handleTransferFormSubmit);

  document.getElementById("cancel-transfer-edit-btn")
    .addEventListener("click", handleCancelTransferEdit);

  document.getElementById("from-account")
    .addEventListener("change", updateTransferAccountConstraints);

  document.getElementById("to-account")
    .addEventListener("change", updateTransferAccountConstraints);

  document.getElementById("account-form")
    .addEventListener("submit", handleAccountFormSubmit);

  document.getElementById("cancel-edit-btn")
    .addEventListener("click", handleCancelEdit);

  document.getElementById("account-selector")
    .addEventListener("change", () => {
      renderCurrentBalance();
      document.getElementById("projected-balance-display").textContent = "";
      if (balanceChart) {
        balanceChart.destroy();
        balanceChart = null;
      }
    });

  document.getElementById("calculate-projection-btn")
    .addEventListener("click", renderProjectedBalance);

  document.getElementById("show-chart-btn")
    .addEventListener("click", renderBalanceChart);

  document.getElementById("toggle-key-visibility")
    .addEventListener("click", handleToggleKeyVisibility);

  document.getElementById("save-ai-key-btn")
    .addEventListener("click", handleSaveAiKey);

  document.getElementById("remove-ai-key-btn")
    .addEventListener("click", handleShowRemoveKeyModal);

  document.getElementById("cancel-remove-key-btn")
    .addEventListener("click", handleCancelRemoveKey);

  document.getElementById("confirm-remove-key-btn")
    .addEventListener("click", handleConfirmRemoveKey);

  document.getElementById("check-recurring-btn")
    .addEventListener("click", runRecurringDetection);

  renderTransactions();
});
