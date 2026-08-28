#!/usr/bin/env node
/**
 * Fill in missing goal tags.
 *
 *   node tools/generate-tags.js            # report what would change
 *   node tools/generate-tags.js --write    # write it
 *
 * Tags exist so board generation can push near-duplicate goals apart — without
 * them a single line happily becomes "8 Heart Pieces / 12 Heart Pieces". They
 * only do that work when several goals share one, so a phrase is only worth
 * tagging if it recurs.
 *
 * This never touches a goal that already has tags. Most lists were tagged by
 * hand and that vocabulary is better than anything derived from the text; the
 * gaps are lists imported from sources that carried no tags at all.
 *
 * Tags are lowercase throughout the repo. Case used to vary and it silently
 * split families — banjo-tooie carried `jiggies` on 34 goals and `Jiggies` on
 * one, and those two never pushed each other apart.
 */

import fs from "node:fs";
import path from "node:path";

const GOALS_DIR = "goals";
const WRITE = process.argv.includes("--write");

/** Words carrying no grouping signal: verbs of doing, articles, quantities. */
const STOP = new Set(`a an the and or of in on at to for with without from into
beat get got collect complete finish clear kill defeat obtain do does done make
have has all any one two three four five six seven eight nine ten your you their
it its as by is are be no not than then that this these those each every
same time times use used using go goes went reach reaches enough least most
new own only other another both few more much some such very while during
after before over under up down out off again once single first second third
level levels part parts item items thing things area areas place places
run runs game games play plays player start end different best total entire
whole various multiple several specific certain given chosen random unique
which who whom whose when where what how bring brings brought come comes came
take takes taken put puts give gives given keep keeps let lets back next last
way ways none nothing anything everything someone anyone everyone yourself
itself where there here also just still even yet ever never always`
  .split(/\s+/));

const NUMBERISH = /^(\d+|[ivxlc]+)$/i;

/**
 * Fold a plural onto its singular so "golden hat" and "golden hats" count as
 * the same family. Left alone below four letters, and for -ss words, which are
 * usually singular already (boss, glass).
 * @param {string} w
 */
function singular(w) {
  return (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) ? w.slice(0, -1) : w;
}

/**
 * The 1- and 2-word phrases a goal contributes.
 * @param {string} text
 * @returns {Set<string>}
 */
function phrases(text) {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9'\- ]+/g, " ")
    .replace(/'s\b/g, "")                       // Marin's groups with Marin
    .split(/\s+/)
    .map(w => w.replace(/^'+|'+$/g, ""))
    .filter(w => w && !NUMBERISH.test(w));

  const keep = words.map(w => (STOP.has(w) || w.length < 3) ? null : singular(w));
  const out = new Set();
  for (let i = 0; i < keep.length; i++) {
    if (!keep[i]) continue;
    out.add(keep[i]);
    if (keep[i + 1]) out.add(keep[i] + " " + keep[i + 1]);
  }
  return out;
}

/**
 * Tags derived from what recurs across a list.
 * @param {{text: string}[]} goals
 * @param {{minShare?: number, maxPerGoal?: number}} [opts]
 * @returns {string[][]} one array per goal, in order
 */
export function derivedTags(goals, { minShare = 2, maxPerGoal = 3 } = {}) {
  const perGoal = goals.map(g => phrases(g.text));

  /** @type {Map<string, number>} */
  const shared = new Map();
  perGoal.forEach(set => set.forEach(p => shared.set(p, (shared.get(p) || 0) + 1)));

  // a phrase only one goal uses cannot push anything apart
  const useful = new Set([...shared].filter(([, n]) => n >= minShare).map(([p]) => p));

  // drop a single word when a phrase containing it is exactly as common —
  // "Star Coins" says more than "Star" and covers the same goals
  for (const p of [...useful]) {
    if (!p.includes(" ")) continue;
    for (const w of p.split(" ")) if (shared.get(w) === shared.get(p)) useful.delete(w);
  }

  return perGoal.map(set => {
    const hits = [...set].filter(p => useful.has(p));
    // most specific first, then most widely shared
    hits.sort((a, b) =>
      b.split(" ").length - a.split(" ").length || (shared.get(b) || 0) - (shared.get(a) || 0));
    /** @type {string[]} */
    const chosen = [];
    for (const h of hits) {
      if (chosen.length >= maxPerGoal) break;
      if (chosen.some(c => c.includes(h) || h.includes(c))) continue;
      chosen.push(h);
    }
    return chosen;      // already lowercase; the repo keeps one casing throughout
  });
}

/**
 * Tags the list already uses that this goal's text plainly contains. Reusing
 * the curated vocabulary keeps a filled-in goal grouped with its neighbours
 * instead of starting a parallel one.
 * @param {string} text
 * @param {string[]} vocabulary
 * @returns {string[]}
 */
export function matchExisting(text, vocabulary) {
  const hay = " " + text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ") + " ";
  return vocabulary
    .map(t => t.toLowerCase())
    .filter(tag => {
      const t = tag.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();
      return t.length >= 3 && hay.includes(" " + t + " ");
    })
    .slice(0, 3);
}

const manifest = JSON.parse(fs.readFileSync(path.join(GOALS_DIR, "index.json"), "utf8"));
let changedLists = 0, changedGoals = 0;

for (const entry of manifest) {
  const file = path.join(GOALS_DIR, entry.file || entry.id + ".json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));

  const gaps = data.goals.filter((/** @type {any} */ g) => !(g.tags || []).length);
  if (!gaps.length) continue;

  const derived = derivedTags(data.goals);

  // Filling a gap grows the list's vocabulary, which can then match a goal the
  // previous pass left alone — so keep going until nothing moves. Without this
  // the result depends on how many times you happen to run it.
  let filled = 0, reused = 0, moved = true;
  while (moved) {
    moved = false;
    const vocabulary = [...new Set(data.goals.flatMap((/** @type {any} */ g) => g.tags || []))];
    data.goals.forEach((/** @type {any} */ g, /** @type {number} */ i) => {
      if ((g.tags || []).length) return;
      const existing = matchExisting(g.text, vocabulary);
      const tags = existing.length ? existing : derived[i];
      if (!tags.length) return;
      g.tags = tags;
      filled++;
      moved = true;
      if (existing.length) reused++;
    });
  }

  if (!filled) continue;
  changedLists++;
  changedGoals += filled;
  console.log(`  ${entry.name.slice(0, 32).padEnd(34)} ${String(gaps.length).padStart(4)} untagged  ->  ` +
    `${String(filled).padStart(4)} filled (${reused} from its own vocabulary)`);

  if (WRITE) fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

console.log(`\n${changedGoals} goals across ${changedLists} lists` + (WRITE ? " — written." : " — dry run, pass --write."));
