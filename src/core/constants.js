/**
 * Values shared by the model and the view. Nothing here touches the DOM.
 * @module
 */

export const VERSION = "2.3.0";

/** Default board radius: 19 hexes, the classic board. */
export const RADIUS = 2;
export const MIN_RADIUS = 1;
export const MAX_RADIUS = 4;

/** @typedef {"R"|"O"|"Y"|"G"|"B"|"P"} Hue */

/** @type {Hue[]} */
export const HUES = ["R", "O", "Y", "G", "B", "P"];

/** @type {Record<string, string>} */
export const HUE_NAME = {
  R: "Red", O: "Orange", Y: "Yellow", G: "Green", B: "Blue", P: "Purple"
};

/** Difficulty names, indexed 1–5; index 0 is unused padding. */
export const DIFF = ["", "Quick", "Easy", "Medium", "Hard", "Grueling"];

export const TAU = Math.PI * 2;
export const SQRT3_2 = 0.8660254037844386;

/** Hex height / hex width, pointy-top. */
export const H_RATIO = 1.1547005383792515;

/** Saved boards kept before the least-recently-used are dropped. */
export const BOARD_LIMIT = 40;

export const LISTS_KEY = "hexbingo.lists.v1";
export const BOARDS_KEY = "hexbingo.boards.v1";
export const REVEAL_KEY = "hexbingo.reveal.v1";
