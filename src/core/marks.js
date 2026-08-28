/**
 * The board model: what state each hex is in, and every rule for changing it.
 * Pure — no DOM, no storage. The view reads these results; it never derives
 * them itself, so mouse, keyboard and touch cannot drift apart.
 * @module
 */

/** @typedef {import("./geometry.js").Geometry} Geometry */
/** @typedef {import("./geometry.js").Line} Line */

/**
 * @typedef {object} Mark
 * @property {"open"|"done"|"blocked"} status
 * @property {number} progress 0–1, only meaningful while open
 */

export const PROGRESS_STEP = 0.25;

/**
 * @param {number} n
 * @returns {Mark[]}
 */
export function createMarks(n) {
  return Array.from({ length: n }, () => ({ status: "open", progress: 0 }));
}

/**
 * @param {Mark[]} marks
 * @param {number} i
 * @param {Partial<Mark>} patch
 * @returns {Mark[]} a new array; the original is untouched
 */
export function setMark(marks, i, patch) {
  return marks.map((m, k) => (k === i ? { ...m, ...patch } : m));
}

/**
 * @param {Mark[]} marks
 * @param {number} i
 * @returns {Mark[]}
 */
export function toggleDone(marks, i) {
  const status = marks[i].status === "done" ? "open" : "done";
  return setMark(marks, i, { status, progress: 0 });
}

/**
 * @param {Mark[]} marks
 * @param {number} i
 * @returns {Mark[]}
 */
export function toggleBlocked(marks, i) {
  const status = marks[i].status === "blocked" ? "open" : "blocked";
  return setMark(marks, i, { status, progress: 0 });
}

/**
 * Progress rolls into "done" when it reaches the top, and resets to 0 there so
 * a later step down starts from a clean edge.
 * @param {Mark[]} marks
 * @param {number} i
 * @param {number} delta
 * @returns {Mark[]}
 */
export function stepProgress(marks, i, delta) {
  const next = Math.min(1, Math.max(0, marks[i].progress + delta));
  return setMark(marks, i, {
    status: next >= 1 ? "done" : "open",
    progress: next >= 1 ? 0 : next
  });
}

/**
 * A line is won when every hex on it is claimed. Mission mode has exactly one
 * line covering all five goals, so this carries both modes.
 * @param {Geometry} geo
 * @param {Mark[]} marks
 * @returns {Line[]}
 */
export function wonLines(geo, marks) {
  return geo.lines.filter(line =>
    line.cells.length &&
    line.cells.every(c => marks[c.i] && marks[c.i].status === "done"));
}

/**
 * Every hex claimed — a blackout, in bingo terms.
 *
 * Distinct from winning every line: a blocked goal is not done, so a board
 * carrying one never blacks out even when all its lines are complete.
 * @param {Mark[]} marks
 * @returns {boolean}
 */
export function isBlackout(marks) {
  return marks.length > 0 && marks.every(m => m.status === "done");
}

/**
 * Fog: which hexes you can see.
 *
 * The centre starts visible and every hex you claim uncovers the ones touching
 * it, so the board opens out as you play rather than being readable up front.
 *
 * Only claiming reveals. Blocking a goal does not, which makes blocking a real
 * decision in this mode — a hex you reject is one you cannot expand through.
 * Visibility is derived from the marks rather than remembered, so it needs
 * nothing stored and cannot drift out of step; the cost is that releasing a
 * claim closes the fog back over its neighbours.
 * @param {Geometry} geo
 * @param {Mark[]} marks
 * @returns {boolean[]} one per cell, in cell order
 */
export function fogVisible(geo, marks) {
  return geo.cells.map(c =>
    c.ring === 0 ||
    marks[c.i]?.status === "done" ||
    c.neighbours.some(n => marks[n] && marks[n].status === "done"));
}

/**
 * Mission reveal mode seals everything past the first unfinished goal.
 * @param {Mark[]} marks
 * @returns {number} index of the first unfinished goal, or -1 if all are done
 */
export function revealGate(marks) {
  return marks.findIndex(m => m.status !== "done");
}

/**
 * @param {{listId: string|null, mode: string, size: number, seed: string}} board
 * @returns {string}
 */
export function boardKey(board) {
  return [board.listId, board.mode, board.size, board.seed].join("|");
}

/**
 * @param {any} entry
 * @returns {number}
 */
function stamp(entry) {
  return (entry && entry.t) || 0;
}

/**
 * Drop the least-recently-touched saved boards, never the one being played.
 *
 * Reassigning an existing key does not move its position in `Object.keys`, so
 * pruning by insertion order could delete the board it had just saved. Entries
 * from before timestamps existed sort as 0 and go first, which self-heals.
 * @param {Record<string, any>} all
 * @param {string} currentKey
 * @param {number} limit
 * @returns {Record<string, any>} the same object, pruned in place
 */
export function pruneBoards(all, currentKey, limit) {
  const others = Object.keys(all).filter(k => k !== currentKey);
  const excess = others.length - (limit - 1);
  if (excess > 0) {
    others
      .sort((a, b) => stamp(all[a]) - stamp(all[b]))
      .slice(0, excess)
      .forEach(k => { delete all[k]; });
  }
  return all;
}

/**
 * Saved entries are `{t, marks}`. Older builds stored a bare array.
 * @param {any} entry
 * @param {number} n expected length
 * @returns {Mark[]|null}
 */
export function readMarks(entry, n) {
  const saved = Array.isArray(entry) ? entry : (entry && entry.marks);
  return (Array.isArray(saved) && saved.length === n) ? saved : null;
}
