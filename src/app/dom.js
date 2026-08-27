/**
 * Element lookup. Views take their nodes from here rather than querying ad hoc.
 * @module
 */

/**
 * @param {string} id
 * @returns {any}
 */
export function $(id) {
  return document.getElementById(id);
}

/** @type {Record<string, any>} */
export const el = {};

/**
 * @param {string[]} ids
 */
export function bindElements(ids) {
  ids.forEach(k => { el[k] = $(k); });
}
