import {
  getTransactions,
  saveTransactions,
  getAccounts,
  saveAccounts,
} from "./storage.js";
import { initPyodide } from "./pyBridge.js";

/**
 * The id of the transaction currently being edited, or null if the form
 * is in "add new" mode.
 * @type {string | null}
 */
let editingId = null;

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
  document.getElementById("dayOfMonth").value =
    tx.dayOfMonth != null ? tx.dayOfMonth : "";

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
  const dayOfMonthRaw = document.getElementById("dayOfMonth").value.trim();

  let dayOfMonth = null;
  if (frequency === "monthly") {
    const parsed = parseInt(dayOfMonthRaw, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 31) {
      alert("Please enter a valid day of month (1–31) for a monthly transaction.");
      return;
    }
    dayOfMonth = parsed;
  }

  const transaction = {
    id: editingId ?? crypto.randomUUID(),
    label,
    category,
    amount,
    direction,
    date,
    accountId: "main",
    frequency,
    dayOfMonth,
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
  e.target.reset();
  editingId = null;
  document.getElementById("cancel-edit-btn").style.display = "none";
  document.querySelector("#transaction-form button[type='submit']").textContent =
    "Add Transaction";
}

/* ------------------------------------------------------------------ */
/*  Bootstrap                                                         */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  initPyodide()
    .then(() => {
      document.getElementById("engine-status").style.display = "none";
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

  renderTransactions();
});
