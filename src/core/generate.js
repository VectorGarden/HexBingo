/**
 * Board generation: which goal lands on which hex.
 * @module
 */

import { makeRng } from "./rng.js";

/** @typedef {import("./geometry.js").Geometry} Geometry */
/** @typedef {import("./goals.js").Goal} Goal */
/** @typedef {import("./goals.js").GoalList} GoalList */

/**
 * Target difficulty for each cell. Shorter lines carry harder goals, and line
 * length falls off with ring, so the target is a function of ring alone.
 * @param {Geometry} geo
 * @param {() => number} rng
 * @returns {number[]}
 */
export function difficultyTargets(geo, rng) {
  const span = Math.max(1, geo.radius);
  return geo.cells.map(c => {
    const base = geo.radius === 0
      ? 1 + c.i                              // mission column: a straight 1→5 ramp
      : 1.15 + (c.ring / span) * 3.2;
    return Math.min(5, Math.max(1, base + (rng() - 0.5) * 0.9));
  });
}

/**
 * Place goals on a board. Deterministic for a given (geometry, list, seed).
 * @param {Geometry} geo
 * @param {GoalList} list
 * @param {string|number} seed
 * @returns {Goal[]|null} null when the list is empty
 */
export function generate(geo, list, seed) {
  const rng = makeRng(seed + "|" + list.id + "|" + geo.cells.length);
  const goals = list.goals;
  if (!goals.length) return null;

  const targets = difficultyTargets(geo, rng);

  // hardest first — high-difficulty goals are the scarce resource
  const order = geo.cells.map((c, i) => i).sort((a, b) => targets[b] - targets[a]);

  /** @type {(Goal|null)[]} */
  const placed = new Array(geo.cells.length).fill(null);
  const used = new Set();

  order.forEach(ci => {
    const cell = geo.cells[ci];
    /** @type {Goal[]} */
    const nearby = [];
    cell.lines.forEach(li => geo.lines[li].cells.forEach(o => {
      const p = placed[o.i];
      if (p) nearby.push(p);
    }));

    const pick = (/** @type {boolean} */ allowUsed) => {
      let best = -1, bestScore = Infinity;
      for (let gi = 0; gi < goals.length; gi++) {
        if (!allowUsed && used.has(gi)) continue;
        const g = goals[gi];
        let score = Math.abs(g.difficulty - targets[ci]) + rng() * 0.35;
        let tagged = false;
        for (let n = 0; n < nearby.length; n++) {
          if (nearby[n] === g) {
            score += 12;              // never repeat a goal on a line with itself
          } else if (!tagged && g.tags.length &&
                     nearby[n].tags.some(t => g.tags.indexOf(t) !== -1)) {
            score += 1.6;
            tagged = true;
          }
        }
        if (score < bestScore) { bestScore = score; best = gi; }
      }
      return best;
    };

    let best = pick(false);
    if (best === -1) {          // more cells than goals: start a fresh pass
      used.clear();
      best = pick(true);
    }
    used.add(best);
    placed[ci] = goals[best];
  });

  return /** @type {Goal[]} */ (placed);
}
