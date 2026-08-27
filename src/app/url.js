/**
 * Board state in the query string.
 *
 * Generating a board pushes an entry, so Back returns to the previous board
 * instead of leaving the site; re-rendering the same board replaces instead,
 * which keeps mode and size flips out of the history stack.
 * @module
 */

/** @typedef {{game: string|null, mode: string|null, size: string|null, seed: string|null}} UrlBoard */

/** @returns {UrlBoard} */
export function readUrl() {
  const p = new URLSearchParams(location.search);
  return { game: p.get("game"), mode: p.get("mode"), size: p.get("size"), seed: p.get("seed") };
}

/**
 * @param {{listId: string|null, mode: string, size: number, seed: string}} board
 * @returns {string}
 */
export function boardQuery(board) {
  return "?" + new URLSearchParams({
    game: String(board.listId), mode: board.mode,
    size: String(board.size), seed: board.seed
  }).toString();
}

/**
 * @param {{listId: string|null, mode: string, size: number, seed: string}} board
 */
export function writeUrl(board) {
  const query = boardQuery(board);
  if (query === location.search) return;
  // a different board is a place you can come back to
  history.pushState(null, "", query);
}

/**
 * @param {{listId: string|null, mode: string, size: number, seed: string}} board
 */
export function replaceUrl(board) {
  const query = boardQuery(board);
  if (query === location.search) return;
  history.replaceState(null, "", query);
}

/**
 * @param {(board: UrlBoard) => void} fn
 */
export function onPopState(fn) {
  window.addEventListener("popstate", () => fn(readUrl()));
}
