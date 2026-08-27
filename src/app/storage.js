/**
 * localStorage with an in-memory fallback, so private browsing and quota
 * exhaustion degrade instead of breaking.
 * @module
 */

/** @type {Record<string, any>} */
const memory = {};

/** Keys whose last write didn't reach localStorage. */
/** @type {Record<string, boolean>} */
const failed = {};

export const store = {
  /**
   * A failed write leaves localStorage holding the *older* value, so preferring
   * it there would silently roll the change back. Once a key has failed, memory
   * is the truth until a write lands again.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    if (failed[key]) return memory[key] || null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* unavailable, or corrupt JSON */ }
    return memory[key] || null;
  },

  /**
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    memory[key] = value;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      delete failed[key];
    } catch (e) {
      failed[key] = true;   // private mode, preview iframe, or over quota
    }
  }
};
