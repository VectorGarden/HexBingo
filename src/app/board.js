/**
 * The hex board view: builds the cells, paints marks, and handles pointer,
 * wheel and keyboard input. Reads state, calls state mutators, derives nothing.
 * @module
 */

import { PROGRESS_STEP, revealGate } from "../core/marks.js";
import { el } from "./dom.js";
import { state, stepProgress, toggleBlocked, toggleDone, wonLines } from "./state.js";
import { closeCellMenu, openCellMenu } from "./cellmenu.js";
import { paintLines, setHover } from "./rail.js";

const PRESS_MS = 500;
const PRESS_SLOP = 10;      // px of drift still counted as a hold

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
   ------------------------------------------------------------ */

/** @type {{x: number, y: number, timer: any}|null} */
let press = null;
let swallowClick = false;

function endPress() {
  if (press && press.timer) clearTimeout(press.timer);
  press = null;
}

export function wireBoard() {
  el.cells.addEventListener("click", (/** @type {any} */ e) => {
    const node = e.target.closest(".cell");
    if (!node) return;
    if (swallowClick) { swallowClick = false; return; }
    toggleDone(+node.dataset.i);
  });

  el.cells.addEventListener("contextmenu", (/** @type {any} */ e) => {
    const node = e.target.closest(".cell");
    if (!node || node.disabled) return;
    e.preventDefault();
    // Android fires this partway through a long press; there the menu is
    // already on its way, so blocking here too would fire twice.
    if (press || swallowClick) return;
    toggleBlocked(+node.dataset.i);
    // macOS turns a ctrl-click into a context menu *and* an ordinary click, so
    // without this the hex is blocked and then immediately claimed by the click
    // that follows. A plain right-click sends no click at all, and the next
    // pointerdown clears the flag either way.
    swallowClick = true;
  });

  el.cells.addEventListener("pointerdown", (/** @type {any} */ e) => {
    swallowClick = false;
    endPress();
    if (e.pointerType === "mouse") return;      // right-click already covers this
    const node = e.target.closest(".cell");
    if (!node || node.disabled) return;
    const i = +node.dataset.i;
    press = {
      x: e.clientX, y: e.clientY,
      timer: setTimeout(() => {
        swallowClick = true;                     // don't also claim the hex
        if (press) press.timer = null;
        openCellMenu(i, node);
      }, PRESS_MS)
    };
  });

  el.cells.addEventListener("pointermove", (/** @type {any} */ e) => {
    if (!press) return;
    if (Math.abs(e.clientX - press.x) > PRESS_SLOP ||
        Math.abs(e.clientY - press.y) > PRESS_SLOP) endPress();
  });
  el.cells.addEventListener("pointerup", endPress);
  el.cells.addEventListener("pointercancel", () => { endPress(); swallowClick = false; });

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
