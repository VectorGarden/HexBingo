/**
 * The line rail: one chip per line, plus the hover/pin highlighting that ties
 * chips to hexes.
 * @module
 */

import { HUE_NAME } from "../core/constants.js";
import { el } from "./dom.js";
import { state, togglePin } from "./state.js";

/** @param {string} h */
function hueVar(h) {
  return h === "free" ? "var(--free)" : "var(--" + h + ")";
}

export function renderRail() {
  el.rail.innerHTML = "";
  // fog plays on the same lines as hex; only mission has none
  if (state.mode === "mission") return;

  /** @type {import("../core/geometry.js").Line[][]} */
  const groups = [[], [], []];
  state.geo.lines.forEach(line => groups[line.axis].push(line));

  groups.forEach(group => {
    const g = document.createElement("div");
    g.className = "rail-group";
    group.forEach(line => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.line = String(line.i);
      chip.setAttribute("aria-pressed", "false");
      chip.style.setProperty("--c1", hueVar(line.hues[0]));
      chip.style.setProperty("--c2", hueVar(line.hues[1]));
      chip.title = HUE_NAME[line.hues[0]] + " to " + HUE_NAME[line.hues[1]] +
        " · " + line.cells.length + " hexes";

      const dots = document.createElement("span");
      dots.className = "dots";
      line.hues.forEach(h => {
        const dot = document.createElement("i");
        dot.style.background = hueVar(h);
        dots.appendChild(dot);
      });

      const label = document.createElement("span");
      label.textContent = line.label;

      const n = document.createElement("span");
      n.className = "n";
      n.textContent = String(line.cells.length);

      chip.append(dots, label, n);
      g.appendChild(chip);
    });
    el.rail.appendChild(g);
  });
}

/* Highlighting has two layers: a transient hover and a sticky pin. They're
   painted together so releasing a hover falls back to whatever is pinned
   rather than clearing everything. */

/** @type {{lines: number[], traceCells: boolean}} */
let hover = { lines: [], traceCells: false };

/**
 * @param {number[]} lines
 * @param {boolean} traceCells
 */
export function setHover(lines, traceCells) {
  hover = { lines: lines || [], traceCells: !!traceCells };
  paintLines();
}

export function paintLines() {
  const active = new Set(state.pinned);
  hover.lines.forEach(i => active.add(i));

  el.bands.querySelectorAll("line").forEach((/** @type {any} */ ln) => {
    ln.classList.toggle("lit", active.has(+ln.dataset.line));
  });

  el.rail.querySelectorAll(".chip").forEach((/** @type {any} */ chip) => {
    const i = +chip.dataset.line;
    const pinned = state.pinned.has(i);
    chip.classList.toggle("pinned", pinned);
    chip.classList.toggle("lit", hover.lines.indexOf(i) !== -1 && !pinned);
    chip.setAttribute("aria-pressed", String(pinned));
  });

  /** @type {Set<number>} */
  const pinnedCells = new Set();
  state.pinned.forEach(i => {
    const line = state.geo.lines[i];
    if (line) line.cells.forEach(c => pinnedCells.add(c.i));
  });

  /** @type {Set<number>} */
  const hoverCells = new Set();
  if (hover.traceCells) {
    hover.lines.forEach(i => {
      const line = state.geo.lines[i];
      if (line) line.cells.forEach(c => hoverCells.add(c.i));
    });
  }

  Array.prototype.forEach.call(el.cells.children, (/** @type {any} */ node, /** @type {number} */ i) => {
    node.classList.toggle("pinned", pinnedCells.has(i));
    node.classList.toggle("traced", hoverCells.has(i));
  });

  // kept in the layout rather than hidden: appearing would reflow the rail and
  // slide the chips out from under the pointer
  el.clearPins.classList.toggle("gone", state.pinned.size === 0);
}

export function wireRail() {
  el.rail.addEventListener("mouseover", (/** @type {any} */ e) => {
    const chip = e.target.closest(".chip");
    if (chip) setHover([+chip.dataset.line], true);
  });
  el.rail.addEventListener("mouseleave", () => setHover([], false));
  el.rail.addEventListener("focusin", (/** @type {any} */ e) => {
    const chip = e.target.closest(".chip");
    if (chip) setHover([+chip.dataset.line], true);
  });
  el.rail.addEventListener("focusout", () => setHover([], false));
  el.rail.addEventListener("click", (/** @type {any} */ e) => {
    const chip = e.target.closest(".chip");
    if (chip) togglePin(+chip.dataset.line);
  });
}
