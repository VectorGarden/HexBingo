import test from "node:test";
import assert from "node:assert/strict";
import {
  boardKey, createMarks, fogVisible, isBlackout, pruneBoards, readMarks,
  revealGate, stepProgress, toggleBlocked, toggleDone, wonLines
} from "../src/core/marks.js";
import { buildGeometry, missionGeometry } from "../src/core/geometry.js";

test("a fresh board is all open with no progress", () => {
  const marks = createMarks(19);
  assert.equal(marks.length, 19);
  assert.ok(marks.every(m => m.status === "open" && m.progress === 0));
});

test("transforms do not mutate the array they are given", () => {
  const before = createMarks(3);
  const after = toggleDone(before, 0);
  assert.equal(before[0].status, "open");
  assert.equal(after[0].status, "done");
  assert.notEqual(before, after);
});

test("claiming and releasing a hex", () => {
  let m = createMarks(3);
  m = toggleDone(m, 1);
  assert.equal(m[1].status, "done");
  m = toggleDone(m, 1);
  assert.equal(m[1].status, "open");
});

test("blocking and unblocking a hex", () => {
  let m = createMarks(3);
  m = toggleBlocked(m, 2);
  assert.equal(m[2].status, "blocked");
  m = toggleBlocked(m, 2);
  assert.equal(m[2].status, "open");
});

test("claiming clears any partial progress", () => {
  let m = stepProgress(createMarks(2), 0, 0.5);
  assert.equal(m[0].progress, 0.5);
  m = toggleDone(m, 0);
  assert.equal(m[0].status, "done");
  assert.equal(m[0].progress, 0);
});

test("progress rolls into done at the top and clamps at the bottom", () => {
  let m = createMarks(1);
  m = stepProgress(m, 0, 0.25); assert.equal(m[0].progress, 0.25);
  m = stepProgress(m, 0, 0.25); assert.equal(m[0].progress, 0.5);
  m = stepProgress(m, 0, 0.25); assert.equal(m[0].progress, 0.75);
  m = stepProgress(m, 0, 0.25);
  assert.equal(m[0].status, "done");
  assert.equal(m[0].progress, 0, "done resets progress so a step down starts clean");

  m = createMarks(1);
  m = stepProgress(m, 0, -0.25);
  assert.equal(m[0].progress, 0);
  assert.equal(m[0].status, "open");
});

test("a line is won only when every hex on it is claimed", () => {
  const geo = buildGeometry(2);
  const line = geo.lines[0];
  let marks = createMarks(geo.cells.length);
  assert.equal(wonLines(geo, marks).length, 0);

  line.cells.slice(0, -1).forEach(c => { marks = toggleDone(marks, c.i); });
  assert.equal(wonLines(geo, marks).length, 0, "a partial line does not count");

  marks = toggleDone(marks, line.cells[line.cells.length - 1].i);
  assert.ok(wonLines(geo, marks).some(l => l.i === line.i));

  marks = toggleDone(marks, line.cells[0].i);
  assert.equal(wonLines(geo, marks).some(l => l.i === line.i), false, "releasing un-wins it");
});

test("a blocked hex does not complete a line", () => {
  const geo = buildGeometry(2);
  const line = geo.lines[0];
  let marks = createMarks(geo.cells.length);
  line.cells.forEach(c => { marks = toggleDone(marks, c.i); });
  marks = toggleBlocked(marks, line.cells[0].i);
  assert.equal(wonLines(geo, marks).some(l => l.i === line.i), false);
});

test("mission mode wins on its single five-goal line", () => {
  const geo = missionGeometry();
  let marks = createMarks(5);
  for (let i = 0; i < 4; i++) marks = toggleDone(marks, i);
  assert.equal(wonLines(geo, marks).length, 0);
  marks = toggleDone(marks, 4);
  assert.equal(wonLines(geo, marks).length, 1);
});

test("isBlackout needs every hex claimed", () => {
  let m = createMarks(3);
  assert.equal(isBlackout(m), false);
  m = toggleDone(m, 0);
  m = toggleDone(m, 1);
  assert.equal(isBlackout(m), false, "two of three is not a blackout");
  m = toggleDone(m, 2);
  assert.equal(isBlackout(m), true);
});

test("a blocked goal prevents a blackout even with every line won", () => {
  const geo = buildGeometry(2);
  let marks = createMarks(geo.cells.length);
  geo.cells.forEach(c => { marks = toggleDone(marks, c.i); });
  assert.equal(wonLines(geo, marks).length, geo.lines.length, "every line is won");
  assert.equal(isBlackout(marks), true);

  marks = toggleBlocked(marks, 0);
  assert.equal(isBlackout(marks), false, "one blocked goal is not a full board");
});

test("partial progress does not count towards a blackout", () => {
  let m = createMarks(2);
  m = toggleDone(m, 0);
  m = stepProgress(m, 1, 0.75);
  assert.equal(isBlackout(m), false);
});

test("an empty board is not a blackout", () => {
  assert.equal(isBlackout([]), false);
});

test("revealGate points at the first unfinished goal", () => {
  let m = createMarks(5);
  assert.equal(revealGate(m), 0);
  m = toggleDone(m, 0);
  assert.equal(revealGate(m), 1);
  for (let i = 1; i < 5; i++) m = toggleDone(m, i);
  assert.equal(revealGate(m), -1, "-1 once nothing is left");
});

test("boardKey is stable and distinguishes every field", () => {
  const base = { listId: "botw", mode: "hex", size: 2, seed: "123" };
  assert.equal(boardKey(base), "botw|hex|2|123");
  assert.notEqual(boardKey(base), boardKey({ ...base, seed: "124" }));
  assert.notEqual(boardKey(base), boardKey({ ...base, size: 3 }));
  assert.notEqual(boardKey(base), boardKey({ ...base, mode: "mission" }));
  assert.notEqual(boardKey(base), boardKey({ ...base, listId: "smo" }));
});

test("pruneBoards never evicts the board being played", () => {
  // the original bug: the current board was written first, so pruning by
  // insertion order deleted the progress it had just saved
  const all = { "current|hex|2|1": { t: 1, marks: [] } };
  for (let i = 0; i < 40; i++) all["filler|hex|2|" + i] = { t: 1000 + i, marks: [] };

  pruneBoards(all, "current|hex|2|1", 40);

  assert.ok("current|hex|2|1" in all, "the current board survived");
  assert.equal(Object.keys(all).length, 40);
});

test("pruneBoards drops the least recently touched, not the first inserted", () => {
  const all = {
    "current|hex|2|1": { t: 9999, marks: [] },
    "stale|hex|2|x": { t: 1, marks: [] },
    "fresh|hex|2|y": { t: 8888, marks: [] }
  };
  for (let i = 0; i < 38; i++) all["pad|hex|2|" + i] = { t: 5000 + i, marks: [] };

  pruneBoards(all, "current|hex|2|1", 40);

  assert.equal("stale|hex|2|x" in all, false, "the oldest went");
  assert.ok("fresh|hex|2|y" in all, "the recent one stayed");
  assert.equal(Object.keys(all).length, 40);
});

test("pruneBoards evicts untimestamped legacy entries first", () => {
  const all = { "cur|hex|2|1": { t: 500, marks: [] }, "legacy|hex|2|1": [] };
  for (let i = 0; i < 39; i++) all["pad|hex|2|" + i] = { t: 1000 + i, marks: [] };
  pruneBoards(all, "cur|hex|2|1", 40);
  assert.equal("legacy|hex|2|1" in all, false);
});

test("pruneBoards leaves a map under the limit alone", () => {
  const all = { a: { t: 1 }, b: { t: 2 } };
  pruneBoards(all, "a", 40);
  assert.deepEqual(Object.keys(all), ["a", "b"]);
});

test("readMarks accepts both the current and the legacy shape", () => {
  const marks = createMarks(3);
  assert.deepEqual(readMarks({ t: 1, marks }, 3), marks);
  assert.deepEqual(readMarks(marks, 3), marks, "pre-timestamp saves were bare arrays");
  assert.equal(readMarks({ t: 1, marks }, 5), null, "a different board size is not reusable");
  assert.equal(readMarks(undefined, 3), null);
  assert.equal(readMarks({}, 3), null);
});

/* ── fog ── */

test("fog starts with only the centre visible", () => {
  const geo = buildGeometry(2);
  const seen = fogVisible(geo, createMarks(geo.cells.length));
  assert.equal(seen.filter(Boolean).length, 1);
  assert.ok(seen[geo.cells.find(c => c.ring === 0).i]);
});

test("claiming a hex uncovers the ones touching it", () => {
  const geo = buildGeometry(2);
  const centre = geo.cells.find(c => c.ring === 0);
  const marks = toggleDone(createMarks(geo.cells.length), centre.i);
  const seen = fogVisible(geo, marks);
  // the centre plus its six neighbours
  assert.equal(seen.filter(Boolean).length, 7);
  for (const n of centre.neighbours) assert.ok(seen[n], `neighbour ${n} should be visible`);
});

test("blocking a hex uncovers nothing", () => {
  const geo = buildGeometry(2);
  const centre = geo.cells.find(c => c.ring === 0);
  const outer = geo.cells.find(c => c.ring === 2);
  let marks = toggleDone(createMarks(geo.cells.length), centre.i);
  const before = fogVisible(geo, marks).filter(Boolean).length;
  marks = toggleBlocked(marks, centre.neighbours[0]);
  assert.equal(fogVisible(geo, marks).filter(Boolean).length, before,
    "a blocked hex is not a way through");
  assert.equal(fogVisible(geo, marks)[outer.i], false);
});

test("releasing a claim closes the fog again", () => {
  const geo = buildGeometry(2);
  const centre = geo.cells.find(c => c.ring === 0);
  let marks = toggleDone(createMarks(geo.cells.length), centre.i);
  assert.equal(fogVisible(geo, marks).filter(Boolean).length, 7);
  marks = toggleDone(marks, centre.i);
  assert.equal(fogVisible(geo, marks).filter(Boolean).length, 1);
});

test("a claimed hex stays visible even with nothing claimed beside it", () => {
  const geo = buildGeometry(2);
  const outer = geo.cells.find(c => c.ring === 2);
  const marks = toggleDone(createMarks(geo.cells.length), outer.i);
  assert.ok(fogVisible(geo, marks)[outer.i]);
});

test("claiming outward eventually uncovers the whole board", () => {
  const geo = buildGeometry(2);
  let marks = createMarks(geo.cells.length);
  // claim whatever is visible, repeatedly, the way a player would
  for (let pass = 0; pass < 10; pass++) {
    const seen = fogVisible(geo, marks);
    geo.cells.forEach(c => { if (seen[c.i] && marks[c.i].status !== "done") marks = toggleDone(marks, c.i); });
  }
  assert.ok(fogVisible(geo, marks).every(Boolean), "no hex should stay unreachable");
});

test("partial progress does not lift the fog", () => {
  const geo = buildGeometry(2);
  const centre = geo.cells.find(c => c.ring === 0);
  const marks = stepProgress(createMarks(geo.cells.length), centre.i, 0.75);
  assert.equal(fogVisible(geo, marks).filter(Boolean).length, 1);
});
