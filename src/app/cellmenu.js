/**
 * The press-and-hold menu: the touch home for Block and partial progress,
 * which have no gesture of their own on a phone.
 * @module
 */

import { PROGRESS_STEP } from "../core/marks.js";
import { el } from "./dom.js";
import { state, stepProgress, toggleBlocked } from "./state.js";

export function syncCellMenu() {
  const i = +el.cellMenu.dataset.i;
  const mark = state.marks[i];
  if (!mark) return;
  el.cellMenuN.textContent = mark.status === "done"
    ? "Done"
    : Math.round(mark.progress * 100) + "%";
  el.cellMenuBlock.textContent = mark.status === "blocked" ? "Unblock" : "Block";
}

/**
 * @param {number} i
 * @param {any} node the hex the menu belongs to
 */
export function openCellMenu(i, node) {
  const menu = el.cellMenu;
  menu.dataset.i = String(i);
  menu.hidden = false;
  syncCellMenu();

  // measured after unhiding, so the flip-above test uses the real height
  const cell = node.getBoundingClientRect();
  const box = menu.getBoundingClientRect();
  const left = cell.left + cell.width / 2 - box.width / 2;
  let top = cell.bottom + 8;
  if (top + box.height > window.innerHeight - 8) top = cell.top - box.height - 8;
  menu.style.left = Math.min(Math.max(8, left), window.innerWidth - box.width - 8) + "px";
  menu.style.top = Math.min(Math.max(8, top), window.innerHeight - box.height - 8) + "px";

  node.classList.add("menued");
  el.cellMenuPlus.focus({ preventScroll: true });

  // Dismiss on the next pointerdown, not on click: the click that ends the
  // opening press lands several hundred ms later and would shut the menu
  // before a finger could reach it. This press's pointerdown is already
  // spent, so the next one is always a genuinely new interaction.
  document.addEventListener("pointerdown", outsideCellMenu, true);
}

export function closeCellMenu() {
  if (!el.cellMenu || el.cellMenu.hidden) return;
  const node = el.cells.children[+el.cellMenu.dataset.i];
  const hadFocus = el.cellMenu.contains(document.activeElement);
  el.cellMenu.hidden = true;
  document.removeEventListener("pointerdown", outsideCellMenu, true);
  if (node) {
    node.classList.remove("menued");
    // only chase focus back if it was ours to begin with
    if (hadFocus && !node.disabled) node.focus({ preventScroll: true });
  }
}

/** @param {any} e */
function outsideCellMenu(e) {
  if (!e.target.closest(".cellmenu")) closeCellMenu();
}

export function wireCellMenu() {
  el.cellMenu.addEventListener("click", (/** @type {any} */ e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const i = +el.cellMenu.dataset.i;
    if (button.dataset.act === "block") { toggleBlocked(i); closeCellMenu(); return; }
    stepProgress(i, button.dataset.act === "plus" ? PROGRESS_STEP : -PROGRESS_STEP);
    syncCellMenu();
  });
  // the menu is pinned to viewport coordinates, so anything that moves the
  // board underneath it invalidates the position
  window.addEventListener("resize", closeCellMenu);
  window.addEventListener("scroll", closeCellMenu, true);
}
