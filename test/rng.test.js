import test from "node:test";
import assert from "node:assert/strict";
import { hashSeed, makeRng } from "../src/core/rng.js";

test("the same seed always produces the same stream", () => {
  const a = makeRng("123456");
  const b = makeRng("123456");
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test("different seeds diverge", () => {
  const a = makeRng("123456");
  const b = makeRng("123457");
  const left = Array.from({ length: 20 }, a);
  const right = Array.from({ length: 20 }, b);
  assert.notDeepEqual(left, right);
});

test("numeric and string seeds agree when they read the same", () => {
  assert.equal(makeRng(42)(), makeRng("42")());
});

test("values stay in [0, 1)", () => {
  const rng = makeRng("spread");
  for (let i = 0; i < 10000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test("the distribution is not obviously skewed", () => {
  const rng = makeRng("buckets");
  const buckets = new Array(10).fill(0);
  const n = 100000;
  for (let i = 0; i < n; i++) buckets[Math.floor(rng() * 10)]++;
  for (const count of buckets) {
    assert.ok(Math.abs(count - n / 10) < n / 50, `bucket off by too much: ${count}`);
  }
});

test("hashSeed returns a 32-bit unsigned integer", () => {
  for (const seed of ["", "a", "123456", "a much longer seed string"]) {
    const h = hashSeed(seed);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `${seed} -> ${h}`);
  }
});
