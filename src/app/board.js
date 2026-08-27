/**
 * The hex board view: builds the cells, paints marks, and handles pointer,
 * wheel and keyboard input. Reads state, calls state mutators, derives nothing.
 * @module
 */

import { PROGRESS_STEP, revealGate } from "../core/marks.js";
import { createGestureState, reduce } from "../core/gestures.js";
import { el } from "./dom.js";
import { state, stepProgress, toggleBlocked, toggleDone, wonLines } from "./state.js";
import { closeCellMenu, openCellMenu } from "./cellmenu.js";
import { paintLines, setHover } from "./rail.js";

const PRESS_MS = 500;       // how long a hold has to last; the drift it may
                            // tolerate is PRESS_SLOP, in core/gestures.js

/** @param {string} text */
function lengthClass(text) {
  const n = text.length;
  if (n <= 26) return "len-s";
  if (n <= 46) return "len-m";
  if (n <= 72) return "len-l";
  return "len-xl";
}

/** @param {string} h */
export function hueVar(h) {
  return h === "free" ? "var(--free)" : "var(--" + h + ")";
}

export function renderCells() {
  const geo = state.geo;
  el.board.dataset.mode = state.mode;
  el.cells.innerHTML = "";

  state.goals.forEach((goal, i) => {
    const cell = geo.cells[i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell " + lengthClass(goal.text);
    btn.dataset.i = String(i);
    btn.style.setProperty("--x", String(cell.x));
    btn.style.setProperty("--y", String(cell.y));
    btn.style.setProperty("--c1", hueVar(cell.c1));
    btn.style.setProperty("--c2", hueVar(cell.c2));
    btn.setAttribute("aria-pressed", "false");

    const fill = document.createElement("span");
    fill.className = "cell-fill";

    const text = document.createElement("span");
    text.className = "cell-text";
    text.textContent = goal.text;

    btn.append(fill, text);

    if (state.mode === "mission") {
      const lock = document.createElement("span");
      lock.className = "cell-lock";
      lock.textContent = "Locked";
      btn.appendChild(lock);
    }

    el.cells.appendChild(btn);
  });
}

export function renderBands() {
  const geo = state.geo;
  el.bands.innerHTML = "";
  el.bands.setAttribute("viewBox",
    [-geo.spanX / 2, -geo.spanY / 2, geo.spanX, geo.spanY].join(" "));
  geo.lines.forEach(line => {
    const a = line.cells[0], b = line.cells[line.cells.length - 1];
    const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
    ln.setAttribute("x1", String(a.x)); ln.setAttribute("y1", String(a.y));
    ln.setAttribute("x2", String(b.x)); ln.setAttribute("y2", String(b.y));
    ln.setAttribute("stroke-width", "0.58");
    ln.dataset.line = String(line.i);
    el.bands.appendChild(ln);
  });
}

/** @param {import("../core/geometry.js").Line[]} won */
function syncComplete(won) {
  const names = won.map(l => l.label || l.id);
  el.completeBtn.disabled = names.length === 0;
  el.completeBtn.classList.toggle("ready", names.length > 0);
  el.completeBtn.title = names.length
    ? (names.length === 1 ? names[0] + " is complete" : names.length + " lines are complete")
    : "Claim every hex on a line to enable this";
  // releasing a hex un-wins the line, so the announcement goes with it
  if (!names.length) el.winNote.hidden = true;
}

export function applyMarks() {
  const nodes = el.cells.children;
  state.marks.forEach((mark, i) => {
    const node = nodes[i];
    if (!node) return;
    node.classList.toggle("done", mark.status === "done");
    node.classList.toggle("blocked", mark.status === "blocked");
    node.setAttribute("aria-pressed", mark.status === "done" ? "true" : "false");
    node.querySelector(".cell-fill").style.height =
      (mark.status === "open" ? Math.round(mark.progress * 100) : 0) + "%";
  });

  const won = wonLines();
  syncComplete(won);

  if (state.mode === "mission") {
    // reveal mode: everything past the first unfinished goal stays sealed
    const gate = state.reveal ? revealGate(state.marks) : -1;
    Array.prototype.forEach.call(nodes, (/** @type {any} */ node, /** @type {number} */ i) => {
      const locked = gate !== -1 && i > gate;
      node.classList.toggle("locked", locked);
      node.disabled = locked;
    });
    return;
  }

  const wonSet = new Set(won.map(l => l.i));
  state.geo.lines.forEach(line => {
    const chip = el.rail.querySelector('.chip[data-line="' + line.i + '"]');
    if (chip) chip.classList.toggle("won", wonSet.has(line.i));
  });
}

export function fit() {
  const geo = state.geo;
  const box = el.board.getBoundingClientRect();
  if (!box.width || !box.height) return;

  if (state.mode === "mission") {
    el.board.style.setProperty("--w", "0px");
    return;
  }
  const w = Math.min(box.width / geo.spanX, box.height / geo.spanY);
  el.board.style.setProperty("--w", w + "px");
  el.board.style.setProperty("--gap", Math.max(2, w * 0.032) + "px");
  // keep the rim a roughly constant thickness instead of scaling with the hex
  const rimPx = Math.min(3, Math.max(1.4, w * 0.018));
  el.board.style.setProperty("--rim", String(1 - (2 * rimPx) / w));
  el.bands.style.width = (geo.spanX * w) + "px";
  el.bands.style.height = (geo.spanY * w) + "px";
}

/* ── input ──────────────────────────────────────────────────
   Touch has neither a right-click nor a wheel, so blocking a goal and nudging
   its progress had no gesture at all. Rather than overload swipe (which fights
   the page scroll) or double-tap (which fights the primary tap), a
   press-and-hold opens a menu holding exactly those two actions.

   Which intent a sequence adds up to lives in core/gestures.js, where it can be
   replayed as data. Everything here is the adapter: turn DOM events into plain
   descriptors, own the clock, and carry out whatever comes back.
   ------------------------------------------------------------ */

let gesture = createGestureState();

/** @type {any} */
let holdTimer = null;
/** @type {{i: number, node: any}|null} */
let pressed = null;

function cancelHold() {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
  pressed = null;
}

/**
 * Feed one event to the reducer and carry out what it decides.
 * @param {import("../core/gestures.js").GestureEvent} event
 * @param {number} [i] the hex the event landed on
 * @param {any} [node]
 */
function dispatch(event, i, node) {
  const { state, action } = reduce(gesture, event);
  gesture = state;

  switch (action) {
    case "claim":
      if (i !== undefined) toggleDone(i);
      break;
    case "block":
      if (i !== undefined) toggleBlocked(i);
      break;
    case "startPress":
      cancelHold();
      if (i === undefined || !node) break;
      pressed = { i, node };
      // the reducer is time-free, so the clock lives here and reports back
      holdTimer = setTimeout(() => { holdTimer = null; dispatch({ type: "hold" }); }, PRESS_MS);
      break;
    case "cancelPress":
      cancelHold();
      break;
    case "openMenu":
      if (pressed) openCellMenu(pressed.i, pressed.node);
      break;
    default:
      break;
  }
}

export function wireBoard() {
  el.cells.addEventListener("click", (/** @type {any} */ e) => {
    const node = e.target.closest(".cell");
    if (!node) return;
    dispatch({ type: "click" }, +node.dataset.i, node);
  });

  el.cells.addEventListener("contextmenu", (/** @type {any} */ e) => {
    const node = e.target.closest(".cell");
    if (!node || node.disabled) return;
    e.preventDefault();
    dispatch({ type: "contextmenu" }, +node.dataset.i, node);
  });

  el.cells.addEventListener("pointerdown", (/** @type {any} */ e) => {
    const node = e.target.closest(".cell");
    // still tell the reducer, so a press on nothing clears the last one
    if (!node || node.disabled) { dispatch({ type: "pointercancel" }); return; }
    dispatch({ type: "pointerdown", pointerType: e.pointerType, x: e.clientX, y: e.clientY },
      +node.dataset.i, node);
  });

  el.cells.addEventListener("pointermove", (/** @type {any} */ e) => {
    dispatch({ type: "pointermove", x: e.clientX, y: e.clientY });
  });
  el.cells.addEventListener("pointerup", () => dispatch({ type: "pointerup" }));
  el.cells.addEventListener("pointercancel", () => dispatch({ type: "pointercancel" }));

  el.cells.addEventListener("wheel", (/** @type {any} */ e) => {
    const node = e.target.closest(".cell");
    if (!node || node.disabled) return;
    e.preventDefault();
    stepProgress(+node.dataset.i, e.deltaY < 0 ? PROGRESS_STEP : -PROGRESS_STEP);
  }, { passive: false });

  el.cells.addEventListener("keydown", (/** @type {any} */ e) => {
    const node = e.target.closest(".cell");
    if (!node) return;
    const i = +node.dataset.i;
    if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      stepProgress(i, e.key === "-" ? -PROGRESS_STEP : PROGRESS_STEP);
    } else if (e.key === "x" || e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      toggleBlocked(i);
    }
  });

  el.cells.addEventListener("mouseover", (/** @type {any} */ e) => {
    const node = e.target.closest(".cell");
    if (!node) return;
    setHover(state.geo.cells[+node.dataset.i].lines, false);
  });
  el.cells.addEventListener("mouseleave", () => setHover([], false));
}

/** Full redraw, for when the board itself changed. */
export function renderBoard() {
  closeCellMenu();          // renderCells() replaces the node it points at
  renderCells();
  renderBands();
  applyMarks();
  paintLines();
  fit();
}
