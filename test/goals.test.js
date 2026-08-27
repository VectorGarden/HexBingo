import test from "node:test";
import assert from "node:assert/strict";
import {
  goalBudget, normalise, parseImport, parseLine, slugify
} from "../src/core/goals.js";

test("slugify makes safe ids", () => {
  assert.equal(slugify("Breath of the Wild"), "breath-of-the-wild");
  assert.equal(slugify("Pokémon: Red / Blue"), "pok-mon-red-blue");
  assert.equal(slugify("  --Trim--  "), "trim");
  assert.equal(slugify(""), "");
});

test("normalise clamps difficulty into 1-5", () => {
  const list = normalise({
    name: "x", goals: [
      { text: "over", difficulty: 99 }, { text: "under", difficulty: -4 },
      { text: "fractional", difficulty: 3.4 }, { text: "string", difficulty: "2" }
    ]
  }, "x");
  assert.deepEqual(list.goals.map(g => g.difficulty), [5, 1, 3, 2]);
});

test("normalise treats a missing or zero difficulty as the middle tier", () => {
  // `Number(d) || 3` reads 0 as unspecified rather than clamping it to 1, which
  // is right: 0 is not a tier, so the neutral default beats the easiest one
  const list = normalise({
    name: "x", goals: [
      { text: "absent" }, { text: "zero", difficulty: 0 },
      { text: "junk", difficulty: "abc" }, { text: "null", difficulty: null }
    ]
  }, "x");
  assert.deepEqual(list.goals.map(g => g.difficulty), [3, 3, 3, 3]);
});

test("normalise drops empty goals and trims text", () => {
  const list = normalise({ name: "x", goals: [
    { text: "  keep me  ", difficulty: 1 }, { text: "   ", difficulty: 1 }, { difficulty: 1 }
  ] }, "x");
  assert.equal(list.goals.length, 1);
  assert.equal(list.goals[0].text, "keep me");
});

test("normalise preserves rules and tips", () => {
  // dropping these silently lost a list's Rules button the moment it was copied
  const list = normalise({
    name: "x", goals: [{ text: "a", difficulty: 1 }],
    rules: ["one", "two"], tips: ["three"]
  }, "x");
  assert.deepEqual(list.rules, ["one", "two"]);
  assert.deepEqual(list.tips, ["three"]);
});

test("normalise omits rules and tips when there are none", () => {
  const list = normalise({ name: "x", goals: [{ text: "a", difficulty: 1 }], rules: [] }, "x");
  assert.equal("rules" in list, false);
  assert.equal("tips" in list, false);
});

test("normalise coerces tags to an array of strings", () => {
  const list = normalise({ name: "x", goals: [
    { text: "a", difficulty: 1, tags: ["ok", "", null, 7] },
    { text: "b", difficulty: 1, tags: "nope" },
    { text: "c", difficulty: 1 }
  ] }, "x");
  assert.deepEqual(list.goals[0].tags, ["ok", "7"]);
  assert.deepEqual(list.goals[1].tags, []);
  assert.deepEqual(list.goals[2].tags, []);
});

test("goalBudget wants about 1.3 goals per hex", () => {
  assert.deepEqual(goalBudget(19), { need: 19, comfortable: 25 });
  assert.deepEqual(goalBudget(61), { need: 61, comfortable: 80 });
  assert.deepEqual(goalBudget(7), { need: 7, comfortable: 10 });
});

test("parseLine reads a difficulty prefix", () => {
  assert.deepEqual(parseLine("3 | Beat a Divine Beast", 1),
    { text: "Beat a Divine Beast", difficulty: 3, tags: [] });
  for (const sep of ["|", ":", ".", "-", "–"]) {
    assert.equal(parseLine(`4 ${sep} thing`, 1).difficulty, 4, `separator ${sep}`);
  }
});

test("parseLine falls back to the supplied difficulty", () => {
  assert.equal(parseLine("no prefix here", 2).difficulty, 2);
  assert.equal(parseLine("9 | out of range", 2).difficulty, 2, "only 1-5 count as a prefix");
});

test("parseLine pulls out hash tags", () => {
  const g = parseLine("3 | Beat a Divine Beast #dungeon #boss", 1);
  assert.equal(g.text, "Beat a Divine Beast");
  assert.deepEqual(g.tags, ["dungeon", "boss"]);
});

test("parseLine rejects blank and tag-only lines", () => {
  assert.equal(parseLine("", 3), null);
  assert.equal(parseLine("    ", 3), null);
  assert.equal(parseLine("#justatag", 3), null);
});

test("parseImport reads HexBingo JSON", () => {
  const out = parseImport(JSON.stringify({
    name: "Mine", rules: ["r"], goals: [{ text: "a", difficulty: 2, tags: ["t"] }]
  }));
  assert.equal(out.name, "Mine");
  assert.deepEqual(out.rules, ["r"]);
  assert.equal(out.goals.length, 1);
});

test("parseImport reads a bare array of strings or objects", () => {
  assert.deepEqual(parseImport('["one","two"]').goals,
    [{ text: "one", difficulty: 3, tags: [] }, { text: "two", difficulty: 3, tags: [] }]);
  const objs = parseImport('[{"name":"n","types":["a"]}]').goals;
  assert.equal(objs[0].text, "n");
  assert.deepEqual(objs[0].tags, ["a"]);
});

test("parseImport reads legacy indexed bingoList tiers", () => {
  const legacy = `
    bingoList[5] = [ {name: "Easy thing", types: ["x"]} ];
    bingoList[25] = [ {name: "Hard thing"}, {name: "Also hard"} ];
  `;
  const out = parseImport(legacy);
  assert.equal(out.goals.length, 3);
  // old tiers were 1-25; they map onto 1-5
  assert.equal(out.goals.find(g => g.text === "Easy thing").difficulty, 1);
  assert.equal(out.goals.find(g => g.text === "Hard thing").difficulty, 5);
  assert.deepEqual(out.goals[0].tags, ["x"]);
});

test("parseImport unescapes quotes in legacy names", () => {
  const out = parseImport(`bingoList[5] = [ {name: "The \\"Best\\" Thing"} ];`);
  assert.equal(out.goals[0].text, 'The "Best" Thing');
});

test("parseImport unwraps a HexBingoGoals() call", () => {
  const out = parseImport('HexBingoGoals({"name":"W","goals":[{"text":"a","difficulty":1}]});');
  assert.equal(out.name, "W");
  assert.equal(out.goals.length, 1);
});

test("parseImport falls back to one goal per line", () => {
  const out = parseImport("first thing\n2 | second thing #tag\n\nthird");
  assert.equal(out.goals.length, 3);
  assert.equal(out.goals[1].difficulty, 2);
  assert.deepEqual(out.goals[1].tags, ["tag"]);
});

test("parseImport refuses empty or unreadable input", () => {
  assert.throws(() => parseImport(""), /Nothing to import/);
  assert.throws(() => parseImport("   \n  "), /Nothing to import/);
});
