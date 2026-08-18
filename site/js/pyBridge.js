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
