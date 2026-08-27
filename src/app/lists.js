/**
 * Goal lists: the manifest, the built-in files, and the ones a user writes.
 *
 * Lists load lazily. `goals/index.json` carries every id and name, which is all
 * the picker and the editor's dropdown need, so a list file is only fetched
 * when a board actually calls for it — one ~12 KB request instead of 45.
 * @module
 */

import { LISTS_KEY } from "../core/constants.js";
import { normalise, slugify } from "../core/goals.js";
import { DEMO } from "../core/demo.js";
import { store } from "./storage.js";

/** @typedef {import("../core/goals.js").GoalList} GoalList */

/** @typedef {{id: string, name: string, file?: string}} ManifestEntry */

/** @type {ManifestEntry[]} */
let builtin = [];

/** @type {Record<string, GoalList>} */
const cache = {};

/** @type {Record<string, Promise<GoalList|null>>} */
const inflight = {};

/** "manifest" once index.json is read, "none" if it could not be. */
let source = /** @type {"manifest"|"none"|null} */ (null);

export const lists = {
  get builtin() { return builtin; },
  get source() { return source; },

  /** @returns {Record<string, any>} */
  custom() { return store.get(LISTS_KEY) || {}; },

  /** @param {Record<string, any>} map */
  saveCustom(map) { store.set(LISTS_KEY, map); },

  /** Everything the picker needs, without loading a single goal. */
  all() {
    const custom = this.custom();
    return {
      builtin,
      custom: Object.keys(custom).map(id => ({ id, name: custom[id].name }))
    };
  },

  /**
   * Synchronous lookup: a custom list, or a built-in already fetched.
   * @param {string} id
   * @returns {GoalList|null}
   */
  peek(id) {
    const custom = this.custom();
    if (custom[id]) return normalise(custom[id], id);
    return cache[id] || null;
  },

  /**
   * Fetch a built-in list if it isn't loaded yet. Concurrent calls for the same
   * id share one request.
   * @param {string} id
   * @returns {Promise<GoalList|null>}
   */
  async load(id) {
    const already = this.peek(id);
    if (already) return already;

    const entry = builtin.find(b => b.id === id);
    if (!entry) return null;
    if (inflight[id]) return inflight[id];

    inflight[id] = (async () => {
      try {
        const file = entry.file || (entry.id + ".json");
        const res = await fetch("goals/" + file);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        cache[id] = normalise({
          id: entry.id,
          name: entry.name || data.name || entry.id,
          goals: data.goals,
          rules: data.rules,
          tips: data.tips
        }, entry.id);
        return cache[id];
      } catch (e) {
        console.warn("HexBingo: couldn't load goal list " + id, e);
        return null;
      } finally {
        delete inflight[id];
      }
    })();

    return inflight[id];
  },

  /**
   * Register a list directly, used by the demo fallback and by imports.
   * @param {any} list
   * @returns {string} the id it was filed under
   */
  register(list) {
    const id = list.id || slugify(list.name) || ("list" + builtin.length);
    if (!builtin.some(b => b.id === id)) builtin.push({ id, name: list.name || id });
    cache[id] = normalise(list, id);
    return id;
  },

  /**
   * Read the manifest. Only ids and names — no goal data crosses the wire here.
   * @returns {Promise<boolean>}
   */
  async loadManifest() {
    try {
      const res = await fetch("goals/index.json");
      if (!res.ok) throw new Error(String(res.status));
      /** @type {ManifestEntry[]} */
      const manifest = await res.json();
      builtin = manifest.map(e => ({ id: e.id, name: e.name || e.id, file: e.file }));
      source = "manifest";
      return true;
    } catch (e) {
      console.warn("HexBingo: couldn't read goals/index.json", e);
      source = "none";
      return false;
    }
  },

  /** Never leave the picker empty. */
  ensure() {
    if (!builtin.length) this.register(DEMO);
  },

  /** Test seam. */
  _reset() {
    builtin = [];
    source = null;
    for (const k of Object.keys(cache)) delete cache[k];
  }
};
