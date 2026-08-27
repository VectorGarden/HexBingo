#!/usr/bin/env node
/**
 * Validate every goal list against goals/schema.json.
 *
 * A malformed list fails silently at runtime — that game just disappears from
 * the picker — so this runs in CI and fails the build instead.
 *
 *   node tools/validate-goals.js [goalsDir]
 *
 * Deliberately hand-rolled rather than pulling in a JSON Schema library: the
 * subset in use is small, and the site ships no dependencies.
 */

import fs from "node:fs";
import path from "node:path";

const goalsDir = process.argv[2] || "goals";
const manifestPath = path.join(goalsDir, "index.json");

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];

/**
 * @param {boolean} cond
 * @param {string} message
 */
function check(cond, message) {
  if (!cond) errors.push(message);
}

if (!fs.existsSync(manifestPath)) {
  console.error("No manifest at " + manifestPath);
  process.exit(1);
}

/** @type {any} */
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (e) {
  console.error("goals/index.json is not valid JSON: " + (/** @type {Error} */ (e)).message);
  process.exit(1);
}

check(Array.isArray(manifest) && manifest.length > 0, "index.json must be a non-empty array");

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const seen = new Set();
const referenced = new Set();
let totalGoals = 0;

for (const entry of manifest) {
  const where = "index.json entry " + JSON.stringify(entry && entry.id);
  if (!entry || typeof entry !== "object") { errors.push(where + " is not an object"); continue; }

  check(typeof entry.id === "string" && ID_RE.test(entry.id),
    where + ": id must be lowercase kebab-case");
  check(typeof entry.name === "string" && entry.name.length > 0,
    where + ": name is required");
  check(!seen.has(entry.id), where + ": duplicate id");
  seen.add(entry.id);

  const file = entry.file || (entry.id + ".json");
  referenced.add(file);
  const full = path.join(goalsDir, file);
  if (!fs.existsSync(full)) { errors.push(where + ": missing file " + file); continue; }

  /** @type {any} */
  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (e) {
    errors.push(file + ": invalid JSON — " + (/** @type {Error} */ (e)).message);
    continue;
  }

  check(typeof data.name === "string" && data.name.length > 0, file + ": name is required");
  if (data.version !== undefined) {
    check(data.version === 1, file + ": unknown schema version " + data.version);
  }
  for (const key of ["rules", "tips"]) {
    if (data[key] === undefined) continue;
    check(Array.isArray(data[key]) && data[key].every((/** @type {any} */ r) => typeof r === "string"),
      file + ": " + key + " must be an array of strings");
  }

  if (!Array.isArray(data.goals) || data.goals.length === 0) {
    errors.push(file + ": goals must be a non-empty array");
    continue;
  }

  const spread = [0, 0, 0, 0, 0, 0];
  const texts = new Set();
  data.goals.forEach((/** @type {any} */ g, /** @type {number} */ i) => {
    const at = file + " goal " + i;
    if (!g || typeof g !== "object") { errors.push(at + " is not an object"); return; }
    check(typeof g.text === "string" && g.text.trim().length > 0, at + ": text is required");
    check(Number.isInteger(g.difficulty) && g.difficulty >= 1 && g.difficulty <= 5,
      at + ": difficulty must be an integer 1–5, got " + JSON.stringify(g.difficulty));
    if (g.tags !== undefined) {
      check(Array.isArray(g.tags) && g.tags.every((/** @type {any} */ t) => typeof t === "string" && t.length),
        at + ": tags must be an array of non-empty strings");
    }
    for (const key of Object.keys(g)) {
      check(["text", "difficulty", "tags"].includes(key), at + ": unexpected property " + key);
    }
    if (Number.isInteger(g.difficulty) && g.difficulty >= 1 && g.difficulty <= 5) spread[g.difficulty]++;
    const k = String(g.text).trim().toLowerCase();
    if (texts.has(k)) warnings.push(file + ": duplicate goal text " + JSON.stringify(g.text));
    texts.add(k);
  });

  const thin = [];
  for (let d = 1; d <= 5; d++) if (spread[d] < 4) thin.push(d + " (" + spread[d] + ")");
  if (thin.length) warnings.push(file + ": thin difficulty tiers — " + thin.join(", "));

  totalGoals += data.goals.length;
}

for (const file of fs.readdirSync(goalsDir)) {
  if (!file.endsWith(".json")) continue;
  if (file === "index.json" || file.endsWith(".schema.json") || file === "schema.json") continue;
  check(referenced.has(file), file + " is not listed in index.json");
}

for (const w of warnings) console.warn("warn  " + w);
for (const e of errors) console.error("error " + e);

if (errors.length) {
  console.error("\n" + errors.length + " problem(s) — not shippable.");
  process.exit(1);
}
console.log(manifest.length + " lists, " + totalGoals + " goals, " +
  warnings.length + " warning(s). All valid.");
