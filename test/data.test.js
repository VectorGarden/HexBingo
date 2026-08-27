/**
 * The shipped goal data, checked against the same rules the site relies on at
 * runtime. A malformed list would otherwise just vanish from the picker.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalise, goalBudget } from "../src/core/goals.js";
import { generate } from "../src/core/generate.js";
import { buildGeometry } from "../src/core/geometry.js";

const GOALS_DIR = "goals";
const manifest = JSON.parse(fs.readFileSync(path.join(GOALS_DIR, "index.json"), "utf8"));

/** @param {any} entry */
function fileFor(entry) {
  return path.join(GOALS_DIR, entry.file || entry.id + ".json");
}

test("the manifest is a non-empty array of unique kebab-case ids", () => {
  assert.ok(Array.isArray(manifest) && manifest.length > 0);
  const ids = manifest.map((/** @type {any} */ e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id in index.json");
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test("every listed file exists and is valid JSON", () => {
  for (const entry of manifest) {
    const file = fileFor(entry);
    assert.ok(fs.existsSync(file), `missing ${file}`);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, "utf8")), `bad JSON in ${file}`);
  }
});

test("no goal file is orphaned", () => {
  const referenced = new Set(manifest.map((/** @type {any} */ e) => path.basename(fileFor(e))));
  const onDisk = fs.readdirSync(GOALS_DIR)
    .filter(f => f.endsWith(".json") && f !== "index.json" && !f.endsWith("schema.json"));
  for (const f of onDisk) assert.ok(referenced.has(f), `${f} is not listed in index.json`);
});

test("every goal has text and an integer difficulty in 1-5", () => {
  for (const entry of manifest) {
    const data = JSON.parse(fs.readFileSync(fileFor(entry), "utf8"));
    assert.ok(Array.isArray(data.goals) && data.goals.length > 0, `${entry.id} has no goals`);
    data.goals.forEach((/** @type {any} */ g, /** @type {number} */ i) => {
      assert.ok(typeof g.text === "string" && g.text.trim(), `${entry.id} goal ${i}: empty text`);
      assert.ok(Number.isInteger(g.difficulty) && g.difficulty >= 1 && g.difficulty <= 5,
        `${entry.id} goal ${i}: difficulty ${g.difficulty}`);
      if (g.tags !== undefined) {
        assert.ok(Array.isArray(g.tags), `${entry.id} goal ${i}: tags is not an array`);
      }
    });
  }
});

test("rules and tips, where present, are arrays of strings", () => {
  for (const entry of manifest) {
    const data = JSON.parse(fs.readFileSync(fileFor(entry), "utf8"));
    for (const key of ["rules", "tips"]) {
      if (data[key] === undefined) continue;
      assert.ok(Array.isArray(data[key]), `${entry.id}: ${key} is not an array`);
      assert.ok(data[key].every((/** @type {any} */ r) => typeof r === "string"),
        `${entry.id}: ${key} holds a non-string`);
    }
  }
});

test("every shipped list survives normalise with its goals intact", () => {
  for (const entry of manifest) {
    const data = JSON.parse(fs.readFileSync(fileFor(entry), "utf8"));
    const list = normalise({ ...data, id: entry.id }, entry.id);
    assert.equal(list.goals.length, data.goals.length,
      `${entry.id} lost goals in normalise`);
    if (data.rules) assert.deepEqual(list.rules, data.rules, `${entry.id} lost its rules`);
  }
});

test("every shipped list can fill the default board", () => {
  const geo = buildGeometry(2);
  for (const entry of manifest) {
    const data = JSON.parse(fs.readFileSync(fileFor(entry), "utf8"));
    const list = normalise({ ...data, id: entry.id }, entry.id);
    const placed = generate(geo, list, "smoke");
    assert.ok(placed, `${entry.id} generated nothing`);
    assert.equal(placed.length, geo.cells.length, `${entry.id} left hexes empty`);
  }
});

test("every shipped list clears the minimum for the default board", () => {
  const { need } = goalBudget(buildGeometry(2).cells.length);
  for (const entry of manifest) {
    const data = JSON.parse(fs.readFileSync(fileFor(entry), "utf8"));
    assert.ok(data.goals.length >= need,
      `${entry.id} has ${data.goals.length} goals, below the ${need} a 19-hex board wants`);
  }
});
