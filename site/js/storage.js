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
 * @property {number} [dayOfMonth]
 */

/**
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} name
 * @property {number} startingBalance
 */

const TRANSACTIONS_KEY = "finance-tracker:transactions";
const ACCOUNTS_KEY = "finance-tracker:accounts";

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
