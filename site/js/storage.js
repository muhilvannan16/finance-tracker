/**
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {string} label
 * @property {string} category
 * @property {number} amount
 * @property {"income" | "expense"} direction
 * @property {string} date
 * @property {string} accountId
 * @property {"none" | "monthly" | string} frequency
 */

/**
 * @typedef {Object} Transfer
 * @property {string} id
 * @property {string} fromAccountId
 * @property {string} toAccountId
 * @property {number} amount
 * @property {string} date
 */

/**
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} name
 * @property {number} startingBalance
 */

const TRANSACTIONS_KEY = "finance-tracker:transactions";
const ACCOUNTS_KEY = "finance-tracker:accounts";
const TRANSFERS_KEY = "finance-tracker:transfers";
const HANDLED_RECURRING_KEY = "finance-tracker:handledRecurringGroups";

/**
 * Reads the transactions list from localStorage.
 *
 * Retrieves the value stored under the "finance-tracker:transactions" key,
 * parses it as JSON, and returns the resulting array. If the key does not
 * exist or the stored value is not valid JSON, returns an empty array.
 *
 * @returns {Transaction[]} The stored transactions, or an empty array if
 *   none are found or the data is corrupt.
 */
export function getTransactions() {
  const raw = localStorage.getItem(TRANSACTIONS_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists the given transactions array to localStorage.
 *
 * Serialises the array as JSON and writes it to the
 * "finance-tracker:transactions" key, replacing any previous value.
 *
 * @param {Transaction[]} transactions - The full list of transactions to store.
 * @returns {void}
 */
export function saveTransactions(transactions) {
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
}

/**
 * Reads the accounts list from localStorage.
 *
 * Retrieves the value stored under the "finance-tracker:accounts" key,
 * parses it as JSON, and returns the resulting array. If the key does not
 * exist or the stored value is not valid JSON, returns an empty array.
 *
 * @returns {Account[]} The stored accounts, or an empty array if none are
 *   found or the data is corrupt.
 */
export function getAccounts() {
  const raw = localStorage.getItem(ACCOUNTS_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists the given accounts array to localStorage.
 *
 * Serialises the array as JSON and writes it to the
 * "finance-tracker:accounts" key, replacing any previous value.
 *
 * @param {Account[]} accounts - The full list of accounts to store.
 * @returns {void}
 */
export function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/**
 * Reads the transfers list from localStorage.
 *
 * Retrieves the value stored under the "finance-tracker:transfers" key,
 * parses it as JSON, and returns the resulting array. If the key does not
 * exist or the stored value is not valid JSON, returns an empty array.
 *
 * @returns {Transfer[]} The stored transfers, or an empty array if none are
 *   found or the data is corrupt.
 */
export function getTransfers() {
  const raw = localStorage.getItem(TRANSFERS_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists the given transfers array to localStorage.
 *
 * Serialises the array as JSON and writes it to the
 * "finance-tracker:transfers" key, replacing any previous value.
 *
 * @param {Transfer[]} transfers - The full list of transfers to store.
 * @returns {void}
 */
export function saveTransfers(transfers) {
  localStorage.setItem(TRANSFERS_KEY, JSON.stringify(transfers));
}

/**
 * Reads the handled recurring ids list from localStorage.
 *
 * Retrieves the value stored under the "finance-tracker:handledRecurringGroups"
 * key, parses it as JSON, and returns the resulting array. If the key does
 * not exist or the stored value is not valid JSON, returns an empty array.
 *
 * @returns {string[]} The ids of transactions that have already been handled
 *   (accepted or dismissed) by the recurring-suggestion feature, so they're
 *   excluded from future detection passes, or an empty array if none are
 *   found or the data is corrupt.
 */
export function getHandledRecurringIds() {
  const raw = localStorage.getItem(HANDLED_RECURRING_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists the given handled recurring ids array to localStorage.
 *
 * Serialises the array as JSON and writes it to the
 * "finance-tracker:handledRecurringGroups" key, replacing any previous value.
 *
 * @param {string[]} ids - The full list of handled transaction ids to store.
 * @returns {void}
 */
export function saveHandledRecurringIds(ids) {
  localStorage.setItem(HANDLED_RECURRING_KEY, JSON.stringify(ids));
}
