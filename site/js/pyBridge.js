/**
 * Promise that resolves to the initialised Pyodide instance, or null
 * if {@link initPyodide} has not been called yet.
 * @type {Promise<object> | null}
 */
let pyodideReadyPromise = null;

/**
 * Starts loading Pyodide (via the global `loadPyodide()` provided by the
 * CDN script tag in index.html) and returns a Promise that resolves to the
 * ready-to-use Pyodide instance.
 *
 * Calling this function more than once is safe — only the first call
 * triggers the actual load; subsequent calls return the same Promise.
 *
 * @returns {Promise<object>} Resolves to the initialised Pyodide instance.
 */
export function initPyodide() {
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = loadPyodide();
  }
  return pyodideReadyPromise;
}

/**
 * Returns the stored Pyodide readiness Promise created by
 * {@link initPyodide}.
 *
 * @returns {Promise<object>} The same Promise returned by initPyodide().
 * @throws {Error} If initPyodide() has not been called yet.
 */
export function getPyodide() {
  if (!pyodideReadyPromise) {
    throw new Error(
      "Pyodide has not been initialised. Call initPyodide() first."
    );
  }
  return pyodideReadyPromise;
}

/**
 * Loads the projection engine Python source into the Pyodide runtime.
 *
 * Fetches "py/projection.py" (served alongside index.html), then executes
 * its source inside Pyodide so that all Python functions it defines —
 * including `project_from_json` — become available in the global namespace.
 *
 * @returns {Promise<void>}
 */
export async function loadProjectionEngine() {
  const pyodide = await initPyodide();
  const response = await fetch("py/projection.py");
  const source = await response.text();
  pyodide.runPython(source);
}

/**
 * Computes the projected account balance as of a given date by calling
 * the Python `project_from_json` function loaded by
 * {@link loadProjectionEngine}.
 *
 * @param {Array<object>} transactions - Transaction objects (same shape
 *   that storage.js produces).
 * @param {Array<object>} transfers - Transfer objects (same shape that
 *   storage.js produces).
 * @param {number} startingBalance - The account's starting balance.
 * @param {string} asOfDateStr - ISO date string (e.g. "2026-06-01") to
 *   project up to.
 * @param {string} accountId - The account to project for.
 * @param {string} [accountType="asset"] - "asset" or "liability".
 * @returns {Promise<number>} The projected balance as a plain JS number.
 */
export async function getProjectedBalance(transactions, transfers, startingBalance, asOfDateStr, accountId, accountType = "asset") {
  const pyodide = await getPyodide();
  const transactionsJson = JSON.stringify(transactions);
  const transfersJson = JSON.stringify(transfers);
  const projectFromJson = pyodide.globals.get("project_from_json");
  return projectFromJson(transactionsJson, transfersJson, startingBalance, asOfDateStr, accountId, accountType);
}

/**
 * Returns a daily balance series between two dates by calling the Python
 * `balance_series_json` function loaded by {@link loadProjectionEngine}.
 *
 * The Python function returns a JSON string, so this wrapper parses it
 * before returning.
 *
 * @param {Array<object>} transactions - Transaction objects (same shape
 *   that storage.js produces).
 * @param {Array<object>} transfers - Transfer objects (same shape that
 *   storage.js produces).
 * @param {number} startingBalance - The account's starting balance.
 * @param {string} startDateStr - ISO date string for the series start
 *   (e.g. "2026-06-01").
 * @param {string} endDateStr - ISO date string for the series end
 *   (e.g. "2026-12-31").
 * @param {string} accountId - The account to project for.
 * @param {string} [accountType="asset"] - "asset" or "liability".
 * @returns {Promise<Array<{date: string, balance: number}>>} Daily
 *   balance points.
 */
export async function getBalanceSeries(transactions, transfers, startingBalance, startDateStr, endDateStr, accountId, accountType = "asset") {
  const pyodide = await getPyodide();
  const transactionsJson = JSON.stringify(transactions);
  const transfersJson = JSON.stringify(transfers);
  const balanceSeriesJson = pyodide.globals.get("balance_series_json");
  const resultJson = balanceSeriesJson(transactionsJson, transfersJson, startingBalance, startDateStr, endDateStr, accountId, accountType);
  return JSON.parse(resultJson);
}

/**
 * Loads the recurring-detection engine Python source into the Pyodide
 * runtime.
 *
 * Fetches "py/recurring.py" (served alongside index.html), then executes
 * its source inside Pyodide so that all Python functions it defines —
 * including `find_recurring_groups_json` and its helpers — become
 * available in the global namespace.
 *
 * @returns {Promise<void>}
 */
export async function loadRecurringEngine() {
  const pyodide = await initPyodide();
  const response = await fetch("py/recurring.py");
  const source = await response.text();
  pyodide.runPython(source);
}

/**
 * Detects recurring transaction groups by calling the Python
 * `find_recurring_groups_json` function loaded by
 * {@link loadRecurringEngine}.
 *
 * @param {Array<object>} transactions - Transaction objects (same shape
 *   that storage.js produces).
 * @param {number} [tolerancePct=0.063] - Fractional tolerance for amount
 *   matching (e.g. 0.063 = 6.3%).
 * @returns {Promise<Array<{matchedTransactionIds: string[]}>>} Groups of
 *   transaction ids that appear to be recurring.
 */
export async function findRecurringGroups(transactions, tolerancePct = 0.063) {
  const pyodide = await getPyodide();
  const transactionsJson = JSON.stringify(transactions);
  const findRecurringGroupsJson = pyodide.globals.get("find_recurring_groups_json");
  const resultJson = findRecurringGroupsJson(transactionsJson, tolerancePct);
  return JSON.parse(resultJson);
}

/**
 * Loads the budgets engine Python source into the Pyodide runtime.
 *
 * Fetches "py/budgets.py" (served alongside index.html), then executes
 * its source inside Pyodide so that all Python functions it defines —
 * including `has_overlap_json` — become available in the global namespace.
 *
 * @returns {Promise<void>}
 */
export async function loadBudgetsEngine() {
  const pyodide = await initPyodide();
  const response = await fetch("py/budgets.py");
  const source = await response.text();
  pyodide.runPython(source);
}

/**
 * Checks whether a proposed budget overlaps with any existing budget
 * for the same category by calling the Python `has_overlap_json`
 * function loaded by {@link loadBudgetsEngine}.
 *
 * @param {string} category - The budget category to check.
 * @param {string} startDate - ISO date string for the budget period
 *   start (e.g. "2026-09-01").
 * @param {string} endDate - ISO date string for the budget period
 *   end (e.g. "2026-09-30").
 * @param {Array<object>} existingBudgets - Budget objects (same shape
 *   that storage.js produces).
 * @returns {Promise<boolean>} True if an overlap exists, false otherwise.
 */
export async function checkBudgetOverlap(category, startDate, endDate, existingBudgets) {
  const pyodide = await getPyodide();
  const budgetsJson = JSON.stringify(existingBudgets);
  const hasOverlapJson = pyodide.globals.get("has_overlap_json");
  return hasOverlapJson(category, startDate, endDate, budgetsJson);
}

/**
 * Computes the total amount spent in a category over a date range by
 * calling the Python `amount_spent_json` function loaded by
 * {@link loadBudgetsEngine}.
 *
 * @param {string} category - The budget category to total.
 * @param {string} startDate - ISO date string for the period start
 *   (e.g. "2026-09-01").
 * @param {string} endDate - ISO date string for the period end
 *   (e.g. "2026-09-30").
 * @param {Array<object>} transactions - Transaction objects (same shape
 *   that storage.js produces).
 * @returns {Promise<number>} The total spent as a plain JS number.
 */
export async function getAmountSpent(category, startDate, endDate, transactions) {
  const pyodide = await getPyodide();
  const transactionsJson = JSON.stringify(transactions);
  const amountSpentJson = pyodide.globals.get("amount_spent_json");
  return amountSpentJson(category, startDate, endDate, transactionsJson);
}

/**
 * Loads the net worth engine Python source into the Pyodide runtime.
 *
 * Fetches "py/networth.py" (served alongside index.html), then
 * executes its source inside Pyodide so that net_worth_series_json
 * becomes available in the global namespace. Depends on
 * loadProjectionEngine already having been called, since
 * networth.py calls balance_series and parse_dated_records from
 * projection.py.
 *
 * @returns {Promise<void>}
 */
export async function loadNetWorthEngine() {
  const pyodide = await initPyodide();
  const response = await fetch("py/networth.py");
  const source = await response.text();
  pyodide.runPython(source);
}

/**
 * Computes a net worth trend by calling the Python
 * net_worth_series_json function loaded by {@link loadNetWorthEngine}.
 *
 * @param {Array<object>} accounts - Account objects (same shape that
 *   storage.js produces).
 * @param {Array<object>} transactions - Transaction objects (same
 *   shape that storage.js produces).
 * @param {Array<object>} transfers - Transfer objects (same shape
 *   that storage.js produces).
 * @param {string} startDate - ISO date string for the range start.
 * @param {string} endDate - ISO date string for the range end.
 * @returns {Promise<Array<{date: string, netWorth: number}>>}
 */
export async function getNetWorthSeries(accounts, transactions, transfers, startDate, endDate) {
  const pyodide = await getPyodide();
  const accountsJson = JSON.stringify(accounts);
  const transactionsJson = JSON.stringify(transactions);
  const transfersJson = JSON.stringify(transfers);
  const netWorthSeriesJson = pyodide.globals.get("net_worth_series_json");
  const resultJson = netWorthSeriesJson(accountsJson, transactionsJson, transfersJson, startDate, endDate);
  return JSON.parse(resultJson);
}

/**
 * Loads the debt payoff engine Python source into the Pyodide runtime.
 *
 * Fetches "py/debt.py" (served alongside index.html), then executes
 * its source inside Pyodide so that simulate_payoff_json becomes
 * available in the global namespace.
 *
 * @returns {Promise<void>}
 */
export async function loadDebtEngine() {
  const pyodide = await initPyodide();
  const response = await fetch("py/debt.py");
  const source = await response.text();
  pyodide.runPython(source);
}

/**
 * Simulates a debt payoff plan by calling the Python
 * simulate_payoff_json function loaded by {@link loadDebtEngine}.
 *
 * @param {Array<{id: string, balance: number, interestRate: number,
 *   minimumPaymentPercent: number}>} debts - Debts with their current
 *   (already-computed) balances.
 * @param {string} strategy - "avalanche" or "snowball".
 * @param {number} extraPayment - Additional monthly payment beyond
 *   every debt's minimum.
 * @returns {Promise<{strategy: string, success: boolean, months: number|null, totalInterestPaid: number}>}
 */
export async function simulatePayoff(debts, strategy, extraPayment) {
  const pyodide = await getPyodide();
  const debtsJson = JSON.stringify(debts);
  const simulatePayoffJson = pyodide.globals.get("simulate_payoff_json");
  const resultJson = simulatePayoffJson(debtsJson, strategy, extraPayment);
  return JSON.parse(resultJson);
}
