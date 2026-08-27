/**
 * Modal sheets.
 *
 * aria-modal alone tells a screen reader the page is blocked but does nothing
 * about Tab, which used to walk straight out of the dialog into the header
 * behind it. Marking the rest of the body inert handles both, and restoring
 * focus on close puts the caret back on the button that opened the sheet.
 * @module
 */

import { $ } from "./dom.js";
import { closeCellMenu } from "./cellmenu.js";

/** @type {any} */
let sheetOpener = null;

/** @param {string} id */
export function openSheet(id) {
  const sheet = $(id);
  if (!sheet.hidden) return;
  closeCellMenu();
  sheetOpener = document.activeElement;
  sheet.hidden = false;
  Array.prototype.forEach.call(document.body.children, (/** @type {any} */ node) => {
    if (node === sheet || node.hasAttribute("inert")) return;
    node.setAttribute("inert", "");
    node.dataset.sheetInert = "1";
  });
  const focusable = sheet.querySelector("select, input, button");
  if (focusable) focusable.focus();
}

/** @param {string} id */
export function closeSheet(id) {
  const sheet = $(id);
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;

  // another sheet may still be up; only lift inert once the last one closes
  if (!document.querySelector(".sheet:not([hidden])")) {
    document.querySelectorAll("[data-sheet-inert]").forEach((/** @type {any} */ node) => {
      node.removeAttribute("inert");
      delete node.dataset.sheetInert;
    });
    const opener = sheetOpener;
    sheetOpener = null;
    if (opener && document.contains(opener) && !opener.closest("[inert]")) opener.focus();
  }
}

export function closeAllSheets() {
  document.querySelectorAll(".sheet:not([hidden])")
    .forEach((/** @type {any} */ sheet) => closeSheet(sheet.id));
}

export function anySheetOpen() {
  return !!document.querySelector(".sheet:not([hidden])");
}
