/**
 * Board geometry. The board is generated, not hardcoded: change the radius and
 * the cells, colours and lines all follow.
 *
 * Axial coordinates (q, r) with s = -q-r. A cell's ring is max(|q|,|r|,|s|).
 * Everything else — colours, lines, pixel positions — falls out of that.
 * @module
 */

import { HUES, TAU, SQRT3_2, H_RATIO } from "./constants.js";

/**
 * @typedef {object} Cell
 * @property {number} q
 * @property {number} r
 * @property {number} s
 * @property {number} i      index in row-major order
 * @property {number} ring
 * @property {number} x      unit-hex coordinates, centre at 0,0
 * @property {number} y
 * @property {number} angle
 * @property {number[]} lines indices into Geometry.lines
 * @property {string} [hue]      perimeter cells only
 * @property {number} [hueIndex] position within that hue's run, 1-based
 * @property {string} c1     gradient start hue, or "free" for the centre
 * @property {string} c2
 */

/**
 * @typedef {object} Line
 * @property {number} i
 * @property {number} axis   0, 1 or 2
 * @property {number} k
 * @property {Cell[]} cells
 * @property {string[]} hues endpoint hues
 * @property {string} id
 * @property {string} label
 */

/**
 * @typedef {object} Geometry
 * @property {number} radius
 * @property {Cell[]} cells
 * @property {Line[]} lines
 * @property {number} spanX
 * @property {number} spanY
 */

/**
 * @param {number} radius
 * @returns {Geometry}
 */
export function buildGeometry(radius) {
  /** @type {any[]} */
  const cells = [];
  for (let q = -radius; q <= radius; q++) {
    const lo = Math.max(-radius, -radius - q);
    const hi = Math.min(radius, radius - q);
    for (let r = lo; r <= hi; r++) cells.push({ q, r, s: -q - r });
  }

  cells.forEach(c => {
    c.ring = Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.s));
    c.x = c.q + c.r / 2;
    c.y = c.r * SQRT3_2;
    c.lines = [];
  });

  // row-major so index order matches the original hex1…hex19
  cells.sort((a, b) => (a.r - b.r) || (a.q - b.q));
  cells.forEach((c, i) => { c.i = i; });

  // angles measured from the top-left perimeter corner, going clockwise
  const anchor = cells.find(c => c.q === 0 && c.r === -radius);
  const start = Math.atan2(anchor.y, anchor.x);
  const norm = (/** @type {number} */ a) => (((a - start) % TAU) + TAU) % TAU;
  cells.forEach(c => { c.angle = c.ring === 0 ? 0 : norm(Math.atan2(c.y, c.x)); });

  // perimeter: 6·radius cells, six hues in contiguous runs of `radius`
  const perim = cells.filter(c => c.ring === radius).sort((a, b) => a.angle - b.angle);
  perim.forEach((c, i) => {
    c.hue = HUES[Math.floor(i / radius)];
    c.hueIndex = (i % radius) + 1;
    c.c1 = c.hue;
    c.c2 = c.hue;
  });

  // a hue's "centre" is the mean angle of its perimeter run
  const centers = HUES.map((_, k) => {
    const run = perim.slice(k * radius, (k + 1) * radius);
    return run.reduce((sum, c) => sum + c.angle, 0) / run.length;
  });

  // inner rings blend the two hues whose centres they sit between
  cells.filter(c => c.ring > 0 && c.ring < radius).forEach(c => {
    let k = 5;
    for (let j = 0; j < 6; j++) {
      const lo = centers[j];
      const hi = j === 5 ? centers[0] + TAU : centers[j + 1];
      const a = (j === 5 && c.angle < centers[5]) ? c.angle + TAU : c.angle;
      if (a >= lo && a < hi) { k = j; break; }
    }
    c.c1 = HUES[k];
    c.c2 = HUES[(k + 1) % 6];
  });

  const centre = cells.find(c => c.ring === 0);
  if (centre) { centre.c1 = "free"; centre.c2 = "free"; }

  // three axes, 2·radius+1 lines each
  const axes = [{ key: "q", along: "r" }, { key: "r", along: "q" }, { key: "s", along: "q" }];
  /** @type {any[]} */
  const lines = [];
  axes.forEach((ax, ai) => {
    for (let k = -radius; k <= radius; k++) {
      const run = cells.filter(c => c[ax.key] === k).sort((a, b) => a[ax.along] - b[ax.along]);
      if (run.length < 2) continue;
      lines.push({ axis: ai, k, cells: run });
    }
  });

  // A line is named by the hues of its two endpoints. At radius 1 and 2 the
  // line count is at most C(6,2)=15, so bare hue pairs are unique and you get
  // the classic "R–G" labels. Past that there are more lines than hue pairs,
  // so endpoints carry their position within the hue run: "R2·G1".
  function nameLines(/** @type {boolean} */ indexed) {
    lines.forEach(l => {
      const ends = [l.cells[0], l.cells[l.cells.length - 1]]
        .sort((a, b) => (HUES.indexOf(a.hue) - HUES.indexOf(b.hue)) || (a.hueIndex - b.hueIndex));
      l.hues = [ends[0].hue, ends[1].hue];
      l.id = indexed ? ends.map(e => e.hue + e.hueIndex).join("-") : l.hues.join("");
      l.label = indexed ? ends.map(e => e.hue + e.hueIndex).join("·") : l.hues.join("");
    });
  }

  nameLines(false);
  if (new Set(lines.map(l => l.id)).size !== lines.length) nameLines(true);

  lines.forEach((l, i) => {
    l.i = i;
    l.cells.forEach((/** @type {any} */ c) => c.lines.push(i));
  });

  return {
    radius, cells, lines,
    spanX: 2 * radius + 1,
    spanY: 2 * radius * SQRT3_2 + H_RATIO
  };
}

/** @type {Record<number, Geometry>} */
const GEO_CACHE = {};

/**
 * Geometry is deterministic, so it is built once per radius and reused.
 * @param {number} radius
 * @returns {Geometry}
 */
export function geoFor(radius) {
  return GEO_CACHE[radius] || (GEO_CACHE[radius] = buildGeometry(radius));
}

/**
 * Mission mode: a five-goal column. Modelled as a geometry with a single line
 * so that "every cell on a line is done" answers both modes.
 * @returns {Geometry}
 */
export function missionGeometry() {
  const cells = Array.from({ length: 5 }, (_, i) => ({
    i, q: 0, r: i - 2, s: 2 - i, ring: 0, angle: 0,
    x: 0, y: i - 2, lines: [0], c1: HUES[i], c2: HUES[i]
  }));
  const lines = [{ i: 0, axis: 0, k: 0, id: "ALL", label: "ALL", hues: ["R", "B"], cells }];
  return { radius: 0, cells, lines, spanX: 1, spanY: 5 };
}

/** Built once; mission mode has no variants. */
export const MISSION = missionGeometry();
