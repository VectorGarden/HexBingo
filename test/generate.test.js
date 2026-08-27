import test from "node:test";
import assert from "node:assert/strict";
import { difficultyTargets, generate } from "../src/core/generate.js";
import { buildGeometry, missionGeometry } from "../src/core/geometry.js";
import { makeRng } from "../src/core/rng.js";

/**
 * @param {number} n
 * @returns {import("../src/core/goals.js").GoalList}
 */
function listOf(n, id = "test") {
  return {
    id, name: id,
    goals: Array.from({ length: n }, (_, i) => ({
      text: "Goal " + i, difficulty: (i % 5) + 1, tags: []
    }))
  };
}

test("the same seed always produces the same board", () => {
  const geo = buildGeometry(2);
  const list = listOf(40);
  const a = generate(geo, list, "123456");
  const b = generate(geo, list, "123456");
  assert.deepEqual(a.map(g => g.text), b.map(g => g.text));
});

test("different seeds produce different boards", () => {
  const geo = buildGeometry(2);
  const list = listOf(40);
  const a = generate(geo, list, "123456").map(g => g.text);
  const b = generate(geo, list, "654321").map(g => g.text);
  assert.notDeepEqual(a, b);
});

test("every hex gets a goal", () => {
  for (const r of [1, 2, 3, 4]) {
    const geo = buildGeometry(r);
    const placed = generate(geo, listOf(100), "seed");
    assert.equal(placed.length, geo.cells.length);
    assert.ok(placed.every(g => g && typeof g.text === "string"));
  }
});

test("an empty list generates nothing", () => {
  assert.equal(generate(buildGeometry(2), listOf(0), "seed"), null);
});

test("no goal repeats on a single line when the list is big enough", () => {
  const geo = buildGeometry(2);
  const list = listOf(60);
  for (let s = 0; s < 40; s++) {
    const placed = generate(geo, list, "seed" + s);
    for (const line of geo.lines) {
      const texts = line.cells.map(c => placed[c.i].text);
      assert.equal(new Set(texts).size, texts.length,
        `seed ${s}: line ${line.id} repeats a goal`);
    }
  }
});

test("a list shorter than the board still fills every hex", () => {
  const geo = buildGeometry(2);          // 19 hexes
  const list = listOf(10);               // deliberately short
  for (let s = 0; s < 20; s++) {
    const placed = generate(geo, list, "short" + s);
    assert.equal(placed.length, 19);
    assert.ok(placed.every(g => g && g.text));
  }
});

test("goals stop repeating on a line once there are enough to go round", () => {
  // A hex sits on three lines and so has up to eleven line-neighbours. Below
  // about a dozen goals a repeat is arithmetically forced, however hard the
  // placement penalty pushes; at and above the board's own cell count — the
  // point where the page stops warning — it never happens.
  const geo = buildGeometry(2);
  for (const n of [12, 19, 25, 40]) {
    const list = listOf(n);
    for (let s = 0; s < 50; s++) {
      const placed = generate(geo, list, "enough" + s);
      for (const line of geo.lines) {
        const texts = line.cells.map(c => placed[c.i].text);
        assert.equal(new Set(texts).size, texts.length,
          `${n} goals, seed ${s}: line ${line.id} repeats a goal`);
      }
    }
  }
});

test("mean difficulty rises monotonically with ring at every size", () => {
  const list = listOf(200);
  for (const r of [2, 3, 4]) {
    const geo = buildGeometry(r);
    /** @type {Record<number, number[]>} */
    const byRing = {};
    for (let s = 0; s < 40; s++) {
      const placed = generate(geo, list, "curve" + s);
      geo.cells.forEach((c, i) => {
        (byRing[c.ring] = byRing[c.ring] || []).push(placed[i].difficulty);
      });
    }
    const means = Object.keys(byRing).sort((a, b) => +a - +b)
      .map(k => byRing[+k].reduce((a, b) => a + b, 0) / byRing[+k].length);
    for (let i = 1; i < means.length; i++) {
      assert.ok(means[i] > means[i - 1],
        `radius ${r}: ring ${i} (${means[i].toFixed(2)}) is not harder than ring ${i - 1} (${means[i - 1].toFixed(2)})`);
    }
  }
});

test("the centre is the easiest hex and the rim the hardest", () => {
  const geo = buildGeometry(2);
  const list = listOf(200);
  let centre = 0, rim = 0, runs = 40;
  for (let s = 0; s < runs; s++) {
    const placed = generate(geo, list, "ends" + s);
    const c = geo.cells.find(x => x.ring === 0);
    centre += placed[c.i].difficulty;
    const rimCells = geo.cells.filter(x => x.ring === 2);
    rim += rimCells.reduce((sum, x) => sum + placed[x.i].difficulty, 0) / rimCells.length;
  }
  assert.ok(centre / runs < 1.6, `centre averaged ${(centre / runs).toFixed(2)}`);
  assert.ok(rim / runs > 3.8, `rim averaged ${(rim / runs).toFixed(2)}`);
});

test("mission mode ramps 1 to 5 down the column", () => {
  const geo = missionGeometry();
  const targets = difficultyTargets(geo, makeRng("x"));
  for (let i = 1; i < targets.length; i++) {
    assert.ok(targets[i] > targets[i - 1], "mission targets should climb");
  }
});

test("difficulty targets stay inside 1-5", () => {
  for (const r of [1, 2, 3, 4]) {
    const targets = difficultyTargets(buildGeometry(r), makeRng("bounds"));
    assert.ok(targets.every(t => t >= 1 && t <= 5), `radius ${r} target out of range`);
  }
});

test("the board changes with the list even on the same seed", () => {
  const geo = buildGeometry(2);
  const a = generate(geo, listOf(40, "one"), "same").map(g => g.text);
  const b = generate(geo, listOf(40, "two"), "same").map(g => g.text);
  assert.notDeepEqual(a, b, "the list id is part of the seed");
});
