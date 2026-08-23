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
 * @returns {Promise<number>} The projected balance as a plain JS number.
 */
export async function getProjectedBalance(transactions, transfers, startingBalance, asOfDateStr, accountId) {
  const pyodide = await getPyodide();
  const transactionsJson = JSON.stringify(transactions);
  const transfersJson = JSON.stringify(transfers);
  const projectFromJson = pyodide.globals.get("project_from_json");
  return projectFromJson(transactionsJson, transfersJson, startingBalance, asOfDateStr, accountId);
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
 * @returns {Promise<Array<{date: string, balance: number}>>} Daily
 *   balance points.
 */
export async function getBalanceSeries(transactions, transfers, startingBalance, startDateStr, endDateStr, accountId) {
  const pyodide = await getPyodide();
  const transactionsJson = JSON.stringify(transactions);
  const transfersJson = JSON.stringify(transfers);
  const balanceSeriesJson = pyodide.globals.get("balance_series_json");
  const resultJson = balanceSeriesJson(transactionsJson, transfersJson, startingBalance, startDateStr, endDateStr, accountId);
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
