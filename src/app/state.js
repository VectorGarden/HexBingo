/**
 * The single mutable app state, and the only place it changes.
 *
 * Views subscribe; they never mutate. Every board rule lives in core/marks.js,
 * so this module is just plumbing between the model and whoever is listening.
 * @module
 */

import { RADIUS } from "../core/constants.js";
import { MISSION, geoFor } from "../core/geometry.js";
import * as marksModel from "../core/marks.js";
import { loadMarks, saveMarks } from "./boards.js";

/** @typedef {import("../core/geometry.js").Geometry} Geometry */
/** @typedef {import("../core/goals.js").Goal} Goal */
/** @typedef {import("../core/goals.js").GoalList} GoalList */
/** @typedef {import("../core/marks.js").Mark} Mark */

/**
 * @typedef {object} AppState
 * @property {Geometry} geo
 * @property {"hex"|"mission"} mode
 * @property {number} size
 * @property {boolean} reveal
 * @property {Set<number>} pinned
 * @property {string|null} listId
 * @property {GoalList|null} list
 * @property {string} seed
 * @property {Goal[]} goals
 * @property {Mark[]} marks
 */

/** @type {AppState} */
export const state = {
  geo: geoFor(RADIUS),
  mode: "hex",
  size: RADIUS,
  reveal: false,
  pinned: new Set(),
  listId: null,
  list: null,
  seed: "",
  goals: [],
  marks: []
};

/** @typedef {"board"|"marks"|"pins"|"reveal"} ChangeKind */

/** @type {Set<(kind: ChangeKind) => void>} */
const listeners = new Set();

/**
 * @param {(kind: ChangeKind) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** @param {ChangeKind} kind */
export function notify(kind) {
  listeners.forEach(fn => fn(kind));
}

/** The identity of the board currently on screen. */
function boardId() {
  return { listId: state.listId, mode: state.mode, size: state.size, seed: state.seed };
}

/**
 * Swap in a freshly generated board.
 * @param {{list: GoalList, mode: "hex"|"mission", size: number, seed: string, goals: Goal[]}} next
 */
export function setBoard(next) {
  state.list = next.list;
  state.listId = next.list.id;
  state.mode = next.mode;
  state.size = next.size;
  state.seed = next.seed;
  state.geo = next.mode === "mission" ? MISSION : geoFor(next.size);
  state.goals = next.goals;
  state.marks = loadMarks(boardId(), next.goals.length);
  state.pinned.clear();
  notify("board");
}

/**
 * @param {(marks: Mark[]) => Mark[]} fn a pure transform from core/marks.js
 */
function mutate(fn) {
  state.marks = fn(state.marks);
  saveMarks(boardId(), state.marks);
  notify("marks");
}

/** @param {number} i */
export function toggleDone(i) { mutate(m => marksModel.toggleDone(m, i)); }

/** @param {number} i */
export function toggleBlocked(i) { mutate(m => marksModel.toggleBlocked(m, i)); }

/**
 * @param {number} i
 * @param {number} delta
 */
export function stepProgress(i, delta) { mutate(m => marksModel.stepProgress(m, i, delta)); }

/** @returns {import("../core/geometry.js").Line[]} */
export function wonLines() { return marksModel.wonLines(state.geo, state.marks); }

/** @param {boolean} on */
export function setReveal(on) {
  state.reveal = on;
  notify("reveal");
}

/** @param {number} lineIndex */
export function togglePin(lineIndex) {
  if (state.pinned.has(lineIndex)) state.pinned.delete(lineIndex);
  else state.pinned.add(lineIndex);
  notify("pins");
}

export function clearPins() {
  if (!state.pinned.size) return;
  state.pinned.clear();
  notify("pins");
}
