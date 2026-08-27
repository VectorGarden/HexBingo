/**
 * Boot and wiring. Everything below reads state and calls state mutators;
 * nothing here decides a board rule.
 * @module
 */

import { MAX_RADIUS, MIN_RADIUS, RADIUS, REVEAL_KEY, VERSION } from "../core/constants.js";
import { generate } from "../core/generate.js";
import { MISSION, geoFor } from "../core/geometry.js";
import { goalBudget } from "../core/goals.js";
import { isBlackout } from "../core/marks.js";
import { applyMarks, fit, renderBoard, wireBoard } from "./board.js";
import { wireCellMenu, closeCellMenu } from "./cellmenu.js";
import { bindElements, el } from "./dom.js";
import { lists } from "./lists.js";
import { store } from "./storage.js";
import { paintLines, renderRail, wireRail } from "./rail.js";
import {
  clearPins, setBoard, setReveal, state, subscribe, wonLines
} from "./state.js";
import { closeGames, gamesOpen, hasGame, refreshGames, setOnChoose, updateGameLabel, wireGamePicker } from "./picker.js";
import { anySheetOpen, closeAllSheets, closeSheet, openSheet } from "./sheets.js";
import { fanfare } from "./audio.js";
import { onPopState, readUrl, replaceUrl, writeUrl } from "./url.js";
import { initEditor } from "../editor/editor.js";

const ELEMENT_IDS = [
  "board", "cells", "rail", "empty", "notice", "modeSelect", "seedInput",
  "sizeSelect", "sizeField", "revealField", "revealToggle", "generateBtn", "randomBtn",
  "editBtn", "helpBtn", "seedOut", "copyLink", "version", "year",
  "gameButton", "gameLabel", "gamePop", "gameSearch", "gameList", "gameNone",
  "clearPins", "rulesBtn", "rulesList", "completeBtn", "winNote",
  "cellMenu", "cellMenuN", "cellMenuPlus", "cellMenuBlock"
];

function randomSeed() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

/** @param {string} id */
function showEmpty(id) {
  el.empty.hidden = false;
  el.board.hidden = true;
  el.empty.textContent = id
    ? "That list has no goals yet. Open Edit goals to add some."
    : "No goals loaded yet. Open Edit goals to write a list, or add a file to goals/.";
}

/** @param {import("../core/goals.js").GoalList} list */
function renderRules(list) {
  const rules = (list.rules || []).concat(list.tips || []);
  el.rulesBtn.hidden = rules.length === 0;
  el.rulesList.innerHTML = "";
  rules.forEach(line => {
    const li = document.createElement("li");
    li.textContent = line;            // plain text: never innerHTML from a goal file
    el.rulesList.appendChild(li);
  });
}

/** @param {import("../core/goals.js").GoalList} list */
function renderNotice(list) {
  const { need, comfortable } = goalBudget(state.geo.cells.length);
  const have = list.goals.length;
  if (have < need) {
    el.notice.hidden = false;
    el.notice.textContent = "Only " + have + " goals for " + need + " hexes, so some repeat. " +
      "About " + comfortable + " gives a clean board — add more under Edit goals, or pick a smaller size.";
  } else if (have < comfortable) {
    el.notice.hidden = false;
    el.notice.textContent = have + " goals covers " + need + " hexes, but the hard tiers run thin " +
      "and the outer rings flatten out. About " + comfortable + " spreads the difficulty properly.";
  } else {
    el.notice.hidden = true;
  }
}

/**
 * Build a board. Async because the goal list is fetched on demand.
 * @param {string|number} [seed]
 * @param {{history?: "push"|"replace"|"none"}} [opts]
 */
export async function build(seed, opts = {}) {
  closeCellMenu();
  el.winNote.hidden = true;

  const id = state.listId;
  if (!id) { showEmpty(""); return; }

  const list = await lists.load(id);
  if (!list || !list.goals.length) { showEmpty(id); return; }

  const mode = /** @type {"hex"|"mission"} */ (el.modeSelect.value);
  const size = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, parseInt(el.sizeSelect.value, 10) || RADIUS));
  const geo = mode === "mission" ? MISSION : geoFor(size);
  const nextSeed = String(seed || el.seedInput.value.trim() || randomSeed());

  const goals = generate(geo, list, nextSeed);
  if (!goals) { showEmpty(id); return; }

  setBoard({ list, mode, size, seed: nextSeed, goals });

  renderRules(list);
  el.empty.hidden = true;
  el.board.hidden = false;
  el.sizeField.hidden = mode === "mission";
  el.revealField.hidden = mode !== "mission";
  el.seedInput.value = state.seed;
  el.seedOut.textContent = state.seed;
  renderNotice(list);

  const how = opts.history || "push";
  if (how === "push") writeUrl(state);
  else if (how === "replace") replaceUrl(state);
}

/** Past this many, the list of names stops being information. */
const NAMES_SHOWN = 4;

/**
 * @param {string[]} names
 * @returns {string}
 */
function winMessage(names) {
  if (names.length === 1) return "Bingo! " + names[0] + " is complete.";
  const shown = names.slice(0, NAMES_SHOWN);
  const rest = names.length - shown.length;
  // a finished 61-hex board wins 27 lines at once, and naming them all filled
  // the banner with three lines of ids nobody reads
  return "Bingo! " + names.length + " lines complete: " + shown.join(", ") +
    (rest ? " and " + rest + " more." : ".");
}

function announceWin() {
  const won = wonLines();
  if (!won.length) return;              // disabled already, but don't trust the DOM
  el.winNote.hidden = false;
  const goals = state.geo.cells.length;
  el.winNote.textContent = state.mode === "mission"
    ? "Mission complete — all " + goals + " goals."
    : isBlackout(state.marks)
      // clearing the whole board outranks whichever lines it happened to win
      ? "Blackout! Every one of the " + goals + " goals."
      : winMessage(won.map(l => l.label || l.id));
  fanfare();
}

async function init() {
  bindElements(ELEMENT_IDS);
  el.bands = document.querySelector(".bands");

  el.version.textContent = VERSION;
  el.year.textContent = String(new Date().getFullYear());

  // views redraw from state; they never decide what changed
  subscribe(kind => {
    if (kind === "board") { renderRail(); renderBoard(); }
    else if (kind === "marks") applyMarks();
    else if (kind === "reveal") applyMarks();
    else if (kind === "pins") paintLines();
  });

  await lists.loadManifest();
  lists.ensure();
  refreshGames();

  const url = readUrl();
  if (url.game && hasGame(url.game)) {
    state.listId = url.game;
    updateGameLabel();
  }
  if (url.mode) el.modeSelect.value = url.mode;
  if (url.size) el.sizeSelect.value = url.size;
  if (url.seed) el.seedInput.value = url.seed;

  wireBoard();
  wireRail();
  wireCellMenu();
  wireGamePicker();
  setOnChoose(() => build(el.seedInput.value));
  initEditor({ onListsChanged: refreshGames, rebuild: () => build(state.seed, { history: "replace" }) });

  function randomBoard() {
    el.seedInput.value = "";
    build();
  }

  el.randomBtn.addEventListener("click", randomBoard);
  el.generateBtn.addEventListener("click", () => build());
  el.seedInput.addEventListener("keydown", (/** @type {any} */ e) => { if (e.key === "Enter") build(); });
  // mode and size restyle the same board, so they replace rather than stack
  el.modeSelect.addEventListener("change", () => build(state.seed || el.seedInput.value, { history: "replace" }));
  el.sizeSelect.addEventListener("change", () => build(state.seed || el.seedInput.value, { history: "replace" }));

  setReveal(store.get(REVEAL_KEY) === true);
  el.revealToggle.checked = state.reveal;
  el.revealToggle.addEventListener("change", () => {
    setReveal(el.revealToggle.checked);
    store.set(REVEAL_KEY, state.reveal);
  });

  // "r" anywhere outside a text field rolls a new board
  document.addEventListener("keydown", (/** @type {any} */ e) => {
    if (e.key !== "r" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (anySheetOpen()) return;
    randomBoard();
  });

  el.helpBtn.addEventListener("click", () => openSheet("help"));
  el.rulesBtn.addEventListener("click", () => openSheet("rules"));
  el.editBtn.addEventListener("click", () => openSheet("editor"));
  el.clearPins.addEventListener("click", clearPins);
  el.completeBtn.addEventListener("click", announceWin);

  document.addEventListener("click", (/** @type {any} */ e) => {
    const close = e.target.closest("[data-close]");
    if (close) closeSheet(close.dataset.close);
    else if (e.target.classList.contains("sheet")) closeSheet(e.target.id);
  });

  document.addEventListener("keydown", (/** @type {any} */ e) => {
    if (e.key !== "Escape") return;
    if (!el.cellMenu.hidden) { closeCellMenu(); return; }
    if (anySheetOpen()) { closeAllSheets(); return; }
    if (gamesOpen()) { closeGames(); return; }
    clearPins();
  });

  el.copyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      el.copyLink.textContent = "Link copied";
      setTimeout(() => { el.copyLink.textContent = "Copy board link"; }, 1400);
    } catch (err) {
      el.copyLink.textContent = "Copy failed — select the address bar";
      setTimeout(() => { el.copyLink.textContent = "Copy board link"; }, 2200);
    }
  });

  // Back and Forward move between boards rather than off the site
  onPopState(board => {
    if (board.game && hasGame(board.game)) { state.listId = board.game; updateGameLabel(); }
    if (board.mode) el.modeSelect.value = board.mode;
    if (board.size) el.sizeSelect.value = board.size;
    el.seedInput.value = board.seed || "";
    build(board.seed || undefined, { history: "none" });
  });

  new ResizeObserver(fit).observe(el.board);
  window.addEventListener("resize", fit);

  // the first board is where you arrived, not somewhere you navigated to
  await build(url.seed || undefined, { history: "replace" });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
