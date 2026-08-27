/**
 * The searchable game picker. A plain <select> is a long scroll once there are
 * 45 games, so this is a button plus a filtered listbox.
 * @module
 */

import { el } from "./dom.js";
import { lists } from "./lists.js";
import { state } from "./state.js";

/** @type {{items: {id: string, name: string, group: string}[], filtered: any[], active: number}} */
const games = { items: [], filtered: [], active: -1 };

/** @type {(id: string) => void} */
let onChoose = () => {};

/** @param {(id: string) => void} fn */
export function setOnChoose(fn) { onChoose = fn; }

export function refreshGames() {
  const all = lists.all();
  games.items = all.builtin.map(b => ({ id: b.id, name: b.name, group: "Included" }))
    .concat(all.custom.map(c => ({ id: c.id, name: c.name, group: "Yours" })));

  if (!games.items.some(g => g.id === state.listId)) {
    state.listId = games.items.length ? games.items[0].id : null;
  }
  updateGameLabel();
  if (!el.gamePop.hidden) renderGameList();
}

/** @param {string} id */
export function hasGame(id) {
  return games.items.some(g => g.id === id);
}

export function updateGameLabel() {
  const item = games.items.find(g => g.id === state.listId);
  el.gameLabel.textContent = item ? item.name : "No lists yet";
}

/**
 * Decompose first so "Pokémon" folds to "pokemon" rather than "pok mon".
 * @param {string} text
 */
function fold(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function renderGameList() {
  const query = fold(el.gameSearch.value);
  games.filtered = query
    ? games.items.filter(g => fold(g.name).indexOf(query) !== -1 || fold(g.id).indexOf(query) !== -1)
    : games.items.slice();

  if (games.active >= games.filtered.length) games.active = games.filtered.length - 1;

  el.gameList.innerHTML = "";
  let group = null;
  games.filtered.forEach((/** @type {any} */ item, /** @type {number} */ i) => {
    if (item.group !== group) {
      group = item.group;
      const head = document.createElement("li");
      head.className = "combo-group";
      head.textContent = group;
      head.setAttribute("aria-hidden", "true");
      el.gameList.appendChild(head);
    }
    const li = document.createElement("li");
    li.className = "combo-item" +
      (item.id === state.listId ? " on" : "") +
      (i === games.active ? " active" : "");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(item.id === state.listId));
    li.id = "gameOpt" + i;
    li.dataset.id = item.id;
    li.dataset.i = String(i);
    li.textContent = item.name;
    el.gameList.appendChild(li);
  });

  // Arrow keys move a class; without this the move is silent to a screen
  // reader, because focus stays in the search box the whole time.
  const active = games.filtered[games.active] ? "gameOpt" + games.active : null;
  if (active) el.gameSearch.setAttribute("aria-activedescendant", active);
  else el.gameSearch.removeAttribute("aria-activedescendant");

  el.gameNone.hidden = games.filtered.length > 0;
}

function scrollActiveIntoView() {
  const node = el.gameList.querySelector(".combo-item.active");
  if (node) node.scrollIntoView({ block: "nearest" });
}

function openGames() {
  el.gamePop.hidden = false;
  el.gameButton.setAttribute("aria-expanded", "true");
  el.gameSearch.value = "";
  games.active = Math.max(0, games.items.findIndex(g => g.id === state.listId));
  renderGameList();
  el.gameSearch.focus();
  scrollActiveIntoView();
}

export function closeGames() {
  el.gamePop.hidden = true;
  el.gameButton.setAttribute("aria-expanded", "false");
  el.gameSearch.removeAttribute("aria-activedescendant");
}

export function gamesOpen() {
  return !el.gamePop.hidden;
}

/** @param {string} id */
function chooseGame(id) {
  if (!id) return;
  const changed = id !== state.listId;
  state.listId = id;
  updateGameLabel();
  closeGames();
  el.gameButton.focus();
  if (changed) onChoose(id);
}

export function wireGamePicker() {
  el.gameButton.addEventListener("click", () => {
    if (el.gamePop.hidden) openGames(); else closeGames();
  });

  el.gameSearch.addEventListener("input", () => {
    games.active = 0;
    renderGameList();
    scrollActiveIntoView();
  });

  el.gameSearch.addEventListener("keydown", (/** @type {any} */ e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!games.filtered.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      games.active = (games.active + step + games.filtered.length) % games.filtered.length;
      renderGameList();
      scrollActiveIntoView();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = games.filtered[games.active] || games.filtered[0];
      if (item) chooseGame(item.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeGames();
      el.gameButton.focus();
    }
  });

  el.gameList.addEventListener("click", (/** @type {any} */ e) => {
    const li = e.target.closest(".combo-item");
    if (li) chooseGame(li.dataset.id);
  });

  el.gameList.addEventListener("mousemove", (/** @type {any} */ e) => {
    const li = e.target.closest(".combo-item");
    if (li && +li.dataset.i !== games.active) {
      games.active = +li.dataset.i;
      renderGameList();
    }
  });

  document.addEventListener("click", (/** @type {any} */ e) => {
    if (!el.gamePop.hidden && !e.target.closest(".combo")) closeGames();
  });
}
