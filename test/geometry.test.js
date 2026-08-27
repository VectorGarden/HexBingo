import test from "node:test";
import assert from "node:assert/strict";
import { buildGeometry, geoFor, missionGeometry } from "../src/core/geometry.js";
import { HUES } from "../src/core/constants.js";

const RADII = [1, 2, 3, 4];

test("cell and line counts follow the radius formulas", () => {
  for (const r of RADII) {
    const geo = buildGeometry(r);
    assert.equal(geo.cells.length, 3 * r * r + 3 * r + 1, `cells at radius ${r}`);
    assert.equal(geo.lines.length, 3 * (2 * r + 1), `lines at radius ${r}`);
  }
});

test("every cell satisfies q + r + s === 0 and ring === max(|q|,|r|,|s|)", () => {
  for (const r of RADII) {
    for (const c of buildGeometry(r).cells) {
      assert.equal(c.q + c.r + c.s, 0);
      assert.equal(c.ring, Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.s)));
      assert.ok(c.ring <= r);
    }
  }
});

test("line ids are unique at every radius", () => {
  // radius 3+ has more lines than hue pairs, so naming falls back to indexed
  // endpoints; a collision here would make two chips indistinguishable
  for (const r of RADII) {
    const geo = buildGeometry(r);
    const ids = geo.lines.map(l => l.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate line id at radius ${r}`);
  }
});

test("radius 1 and 2 keep the classic two-letter labels", () => {
  for (const r of [1, 2]) {
    for (const line of buildGeometry(r).lines) {
      assert.match(line.label, /^[ROYGBP]{2}$/, `radius ${r} label ${line.label}`);
    }
  }
});

test("radius 3 and 4 switch to indexed labels", () => {
  for (const r of [3, 4]) {
    for (const line of buildGeometry(r).lines) {
      assert.match(line.label, /^[ROYGBP]\d·[ROYGBP]\d$/, `radius ${r} label ${line.label}`);
    }
  }
});

test("the perimeter carries six hues in equal contiguous runs", () => {
  for (const r of RADII) {
    const geo = buildGeometry(r);
    const perim = geo.cells.filter(c => c.ring === r);
    assert.equal(perim.length, 6 * r);
    for (const hue of HUES) {
      assert.equal(perim.filter(c => c.hue === hue).length, r, `run length for ${hue}`);
    }
  }
});

test("the centre is the free space", () => {
  const geo = buildGeometry(2);
  const centre = geo.cells.find(c => c.ring === 0);
  assert.equal(centre.c1, "free");
  assert.equal(centre.c2, "free");
});

test("every cell knows exactly the lines that contain it", () => {
  for (const r of RADII) {
    const geo = buildGeometry(r);
    for (const cell of geo.cells) {
      for (const li of cell.lines) {
        assert.ok(geo.lines[li].cells.includes(cell), "cell claims a line it is not on");
      }
      const containing = geo.lines.filter(l => l.cells.includes(cell));
      assert.equal(cell.lines.length, containing.length);
    }
  }
});

test("line lengths stay within the documented bounds", () => {
  const expected = { 1: [2, 3], 2: [3, 5], 3: [4, 7], 4: [5, 9] };
  for (const r of RADII) {
    const lens = buildGeometry(r).lines.map(l => l.cells.length);
    assert.equal(Math.min(...lens), expected[r][0], `min line length at radius ${r}`);
    assert.equal(Math.max(...lens), expected[r][1], `max line length at radius ${r}`);
  }
});

test("geoFor caches by radius", () => {
  assert.equal(geoFor(2), geoFor(2));
  assert.notEqual(geoFor(2), geoFor(3));
});

test("mission geometry is one line over five goals", () => {
  const geo = missionGeometry();
  assert.equal(geo.cells.length, 5);
  assert.equal(geo.lines.length, 1);
  assert.equal(geo.lines[0].cells.length, 5);
  assert.equal(geo.radius, 0);
});
