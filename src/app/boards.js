/**
 * Saved board progress, keyed by list + mode + size + seed.
 * @module
 */

import { BOARDS_KEY, BOARD_LIMIT } from "../core/constants.js";
import { boardKey, createMarks, pruneBoards, readMarks } from "../core/marks.js";
import { store } from "./storage.js";

/** @typedef {import("../core/marks.js").Mark} Mark */
/** @typedef {{listId: string|null, mode: string, size: number, seed: string}} BoardId */

/**
 * @param {BoardId} board
 * @param {Mark[]} marks
 */
export function saveMarks(board, marks) {
  const all = store.get(BOARDS_KEY) || {};
  const key = boardKey(board);
  all[key] = { t: Date.now(), marks };
  store.set(BOARDS_KEY, pruneBoards(all, key, BOARD_LIMIT));
}

/**
 * @param {BoardId} board
 * @param {number} n
 * @returns {Mark[]} saved progress, or a fresh board
 */
export function loadMarks(board, n) {
  const all = store.get(BOARDS_KEY) || {};
  return readMarks(all[boardKey(board)], n) || createMarks(n);
}
