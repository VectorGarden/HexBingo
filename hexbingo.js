/* ============================================================
   HexBingo — core
   ------------------------------------------------------------
   The board is generated, not hardcoded. Change RADIUS and the
   cells, colours and lines all follow. See README for the one
   thing that does NOT follow (line naming).
   ============================================================ */

(function () {
  "use strict";

  const VERSION = "1.0.0";
  const RADIUS = 2;
  const HUES = ["R", "O", "Y", "G", "B", "P"];
  const HUE_NAME = { R: "Red", O: "Orange", Y: "Yellow", G: "Green", B: "Blue", P: "Purple" };
  const DIFF = ["", "Quick", "Easy", "Medium", "Hard", "Grueling"];
  const TAU = Math.PI * 2;
  const SQRT3_2 = 0.8660254037844386;
  const H_RATIO = 1.1547005383792515; // hex height / hex width, pointy-top

  const LISTS_KEY = "hexbingo.lists.v1";
  const BOARDS_KEY = "hexbingo.boards.v1";
  const REVEAL_KEY = "hexbingo.reveal.v1";

  /* ── storage: real localStorage when available, memory when not ── */

  const memory = {};
  const store = {
    get(key) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : (memory[key] || null);
      } catch (e) { return memory[key] || null; }
    },
    set(key, value) {
      memory[key] = value;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode, preview iframe */ }
    }
  };

  /* ── seeded RNG (replaces seedrandom.js) ── */

  function hashSeed(str) {
    let h = 1779033703 ^ String(str).length;
    for (let i = 0; i < String(str).length; i++) {
      h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  function makeRng(seed) {
    let a = hashSeed(seed);
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── geometry ────────────────────────────────────────────────
     Axial coordinates (q, r) with s = -q-r. A cell's ring is
     max(|q|,|r|,|s|). Everything else — colours, lines, pixel
     positions — falls out of that.
     ------------------------------------------------------------ */

  function buildGeometry(radius) {
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
    const norm = a => (((a - start) % TAU) + TAU) % TAU;
    cells.forEach(c => { c.angle = c.ring === 0 ? 0 : norm(Math.atan2(c.y, c.x)); });

    // perimeter: 6·radius cells, six hues in contiguous runs of `radius`
    const perim = cells.filter(c => c.ring === radius).sort((a, b) => a.angle - b.angle);
    perim.forEach((c, i) => {
      c.hue = HUES[Math.floor(i / radius)];
      c.hueIndex = (i % radius) + 1;   // 1..radius within this hue's run
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
    // so endpoints carry their position within the hue run: "R2–G1".
    function nameLines(indexed) {
      lines.forEach(l => {
        const ends = [l.cells[0], l.cells[l.cells.length - 1]]
          .sort((a, b) => (HUES.indexOf(a.hue) - HUES.indexOf(b.hue)) || (a.hueIndex - b.hueIndex));
        l.hues = [ends[0].hue, ends[1].hue];
        l.id = indexed
          ? ends.map(e => e.hue + e.hueIndex).join("-")
          : l.hues.join("");
        l.label = indexed
          ? ends.map(e => e.hue + e.hueIndex).join("·")
          : l.hues.join("");
      });
    }

    nameLines(false);
    if (new Set(lines.map(l => l.id)).size !== lines.length) nameLines(true);

    lines.forEach((l, i) => {
      l.i = i;
      l.cells.forEach(c => c.lines.push(i));
    });

    return {
      radius, cells, lines,
      spanX: 2 * radius + 1,
      spanY: 2 * radius * SQRT3_2 + H_RATIO
    };
  }

  const GEO_CACHE = {};
  function geoFor(radius) {
    return GEO_CACHE[radius] || (GEO_CACHE[radius] = buildGeometry(radius));
  }
  const HEX = geoFor(RADIUS);

  const MISSION = {
    radius: 0,
    cells: Array.from({ length: 5 }, (_, i) => ({
      i, ring: 0, x: 0, y: i - 2, lines: [0],
      c1: HUES[i], c2: HUES[i]
    })),
    lines: [],
    spanX: 1, spanY: 5
  };
  MISSION.lines = [{ i: 0, axis: 0, k: 0, id: "ALL", hues: ["R", "B"], cells: MISSION.cells }];

  /* ── goal lists ─────────────────────────────────────────────── */

  const DEMO = {
    id: "demo",
    name: "Sample list",
    goals: [
      { text: "Open the menu", difficulty: 1, tags: ["misc"] },
      { text: "Talk to three villagers", difficulty: 1, tags: ["npc"] },
      { text: "Pick up a health item", difficulty: 1, tags: ["item"] },
      { text: "Change your equipment", difficulty: 1, tags: ["item"] },
      { text: "Find a hidden chest", difficulty: 2, tags: ["item"] },
      { text: "Beat one mini-boss", difficulty: 2, tags: ["combat"] },
      { text: "Reach the second area", difficulty: 2, tags: ["route"] },
      { text: "Buy something from a shop", difficulty: 2, tags: ["npc"] },
      { text: "Collect 10 currency", difficulty: 2, tags: ["collect"] },
      { text: "Finish a side quest", difficulty: 3, tags: ["npc"] },
      { text: "Clear a dungeon without dying", difficulty: 3, tags: ["combat", "dungeon"] },
      { text: "Reach 50% map completion", difficulty: 3, tags: ["collect"] },
      { text: "Unlock a fast travel point", difficulty: 3, tags: ["route"] },
      { text: "Upgrade a weapon twice", difficulty: 3, tags: ["item"] },
      { text: "Beat two dungeons", difficulty: 4, tags: ["dungeon"] },
      { text: "Collect 30 currency", difficulty: 4, tags: ["collect"] },
      { text: "Max out one stat", difficulty: 4, tags: ["stat"] },
      { text: "Clear the optional area", difficulty: 4, tags: ["route"] },
      { text: "Beat every mini-boss", difficulty: 5, tags: ["combat"] },
      { text: "Reach 100% map completion", difficulty: 5, tags: ["collect"] },
      { text: "Finish every side quest", difficulty: 5, tags: ["npc"] },
      { text: "Beat the game", difficulty: 5, tags: ["route"] }
    ]
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = src;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error("could not load " + src));
      document.head.appendChild(tag);
    });
  }

  const lists = {
    builtin: [],          // {id, name}
    source: null,         // "json" | "bundle" | "none"
    cache: {},            // id -> list
    custom() { return store.get(LISTS_KEY) || {}; },
    saveCustom(map) { store.set(LISTS_KEY, map); },

    all() {
      const custom = this.custom();
      return {
        builtin: this.builtin,
        custom: Object.keys(custom).map(id => ({ id, name: custom[id].name }))
      };
    },

    load(id) {
      const custom = this.custom();
      if (custom[id]) return normalise(custom[id], id);
      return this.cache[id] || null;
    },

    // called by each goals/*.js file at load time
    register(list) {
      const id = list.id || slugify(list.name) || ("list" + this.builtin.length);
      if (!this.builtin.some(b => b.id === id)) {
        this.builtin.push({ id, name: list.name || id });
      }
      this.cache[id] = normalise(list, id);
      return id;
    },

    ensure() {
      if (!this.builtin.length) this.register(DEMO);
    },

    /* JSON is the source of truth. Over http(s) we fetch it straight from
       goals/. Off the filesystem fetch is blocked, and goals/bundle.js will
       already have registered the same data via HexBingoGoals(). Fetched data
       wins when both are present, so the bundle can go stale without breaking
       a hosted copy. */
    async loadJson() {
      let manifest;
      try {
        const res = await fetch("goals/index.json", { cache: "no-cache" });
        if (!res.ok) throw new Error(res.status);
        manifest = await res.json();
      } catch (e) {
        // fetch is blocked on file://; pull in the generated bundle instead.
        // Doing it here rather than with a static tag means a hosted copy never
        // downloads it.
        try {
          await loadScript("goals/bundle.js");
          this.source = this.builtin.length ? "bundle" : "none";
        } catch (err) {
          this.source = "none";
        }
        return false;
      }

      await Promise.all(manifest.map(async entry => {
        try {
          const file = entry.file || (entry.id + ".json");
          const res = await fetch("goals/" + file, { cache: "no-cache" });
          if (!res.ok) throw new Error(res.status);
          const data = await res.json();
          this.register({
            id: entry.id,
            name: entry.name || data.name || entry.id,
            goals: data.goals,
            rules: data.rules,
            tips: data.tips
          });
        } catch (e) {
          console.warn("HexBingo: couldn't load goal list " + entry.id, e);
        }
      }));

      this.source = "json";
      return true;
    }
  };

  function slugify(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function normalise(list, id) {
    const goals = (list.goals || []).map(g => ({
      text: String(g.text || "").trim(),
      difficulty: Math.min(5, Math.max(1, Math.round(Number(g.difficulty) || 3))),
      tags: Array.isArray(g.tags) ? g.tags.filter(Boolean).map(String) : []
    })).filter(g => g.text);
    const out = { id: id || list.id, name: list.name || "Untitled", goals };
    if (Array.isArray(list.rules) && list.rules.length) out.rules = list.rules.map(String);
    if (Array.isArray(list.tips) && list.tips.length) out.tips = list.tips.map(String);
    return out;
  }

  /* ── board generation ───────────────────────────────────────── */

  function generate(geo, list, seed) {
    const rng = makeRng(seed + "|" + list.id + "|" + geo.cells.length);
    const goals = list.goals;
    if (!goals.length) return null;

    // shorter lines carry harder goals, and line length falls off with ring,
    // so target difficulty is simply a function of ring.
    const span = Math.max(1, geo.radius);
    const targets = geo.cells.map(c => {
      const base = geo.radius === 0
        ? 1 + c.i          // mission column: a straight 1→5 ramp
        : 1.15 + (c.ring / span) * 3.2;
      return Math.min(5, Math.max(1, base + (rng() - 0.5) * 0.9));
    });

    // hardest first — high-difficulty goals are the scarce resource
    const order = geo.cells.map((c, i) => i).sort((a, b) => targets[b] - targets[a]);

    const placed = new Array(geo.cells.length).fill(null);
    const used = new Set();

    order.forEach(ci => {
      const cell = geo.cells[ci];
      const nearby = [];
      cell.lines.forEach(li => geo.lines[li].cells.forEach(o => {
        if (placed[o.i]) nearby.push(placed[o.i]);
      }));

      const pick = allowUsed => {
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

    return placed;
  }

  /* ── app ────────────────────────────────────────────────────── */

  const el = {};
  const state = {
    geo: HEX,
    mode: "hex",
    size: RADIUS,
    reveal: false,
    pinned: new Set(),
    listId: null,
    list: null,
    seed: "",
    goals: [],
    marks: []
  };

  function $(id) { return document.getElementById(id); }

  function boardKey() {
    return [state.listId, state.mode, state.size, state.seed].join("|");
  }

  function saveMarks() {
    const all = store.get(BOARDS_KEY) || {};
    all[boardKey()] = state.marks;
    const keys = Object.keys(all);
    if (keys.length > 40) delete all[keys[0]];
    store.set(BOARDS_KEY, all);
  }

  function loadMarks(n) {
    const all = store.get(BOARDS_KEY) || {};
    const saved = all[boardKey()];
    if (Array.isArray(saved) && saved.length === n) return saved;
    return Array.from({ length: n }, () => ({ status: "open", progress: 0 }));
  }

  function lengthClass(text) {
    const n = text.length;
    if (n <= 26) return "len-s";
    if (n <= 46) return "len-m";
    if (n <= 72) return "len-l";
    return "len-xl";
  }

  function hueVar(h) { return h === "free" ? "var(--free)" : "var(--" + h + ")"; }

  /* ── rendering ── */

  function renderBoard() {
    const geo = state.geo;
    el.board.dataset.mode = state.mode;
    el.cells.innerHTML = "";

    state.goals.forEach((goal, i) => {
      const cell = geo.cells[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell " + lengthClass(goal.text);
      btn.dataset.i = i;
      btn.style.setProperty("--x", cell.x);
      btn.style.setProperty("--y", cell.y);
      btn.style.setProperty("--c1", hueVar(cell.c1));
      btn.style.setProperty("--c2", hueVar(cell.c2));
      btn.setAttribute("aria-pressed", "false");

      const fill = document.createElement("span");
      fill.className = "cell-fill";

      const text = document.createElement("span");
      text.className = "cell-text";
      text.textContent = goal.text;

      btn.append(fill, text);

      if (state.mode === "mission") {
        const lock = document.createElement("span");
        lock.className = "cell-lock";
        lock.textContent = "Locked";
        btn.appendChild(lock);
      }

      el.cells.appendChild(btn);
    });

    renderBands();
    renderRail();
    applyMarks();
    paintLines();
    fit();
  }

  function renderBands() {
    const geo = state.geo;
    el.bands.innerHTML = "";
    el.bands.setAttribute("viewBox",
      [-geo.spanX / 2, -geo.spanY / 2, geo.spanX, geo.spanY].join(" "));
    geo.lines.forEach(line => {
      const a = line.cells[0], b = line.cells[line.cells.length - 1];
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", a.x); ln.setAttribute("y1", a.y);
      ln.setAttribute("x2", b.x); ln.setAttribute("y2", b.y);
      ln.setAttribute("stroke-width", "0.58");
      ln.dataset.line = line.i;
      el.bands.appendChild(ln);
    });
  }

  function renderRail() {
    el.rail.innerHTML = "";
    if (state.mode !== "hex") return;
    const groups = [[], [], []];
    state.geo.lines.forEach(line => groups[line.axis].push(line));

    groups.forEach(group => {
      const g = document.createElement("div");
      g.className = "rail-group";
      group.forEach(line => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.dataset.line = line.i;
        chip.setAttribute("aria-pressed", "false");
        chip.style.setProperty("--c1", hueVar(line.hues[0]));
        chip.style.setProperty("--c2", hueVar(line.hues[1]));
        chip.title = HUE_NAME[line.hues[0]] + " to " + HUE_NAME[line.hues[1]] +
          " · " + line.cells.length + " hexes";

        const dots = document.createElement("span");
        dots.className = "dots";
        line.hues.forEach(h => {
          const dot = document.createElement("i");
          dot.style.background = hueVar(h);
          dots.appendChild(dot);
        });

        const label = document.createElement("span");
        label.textContent = line.label;

        const n = document.createElement("span");
        n.className = "n";
        n.textContent = line.cells.length;

        chip.append(dots, label, n);
        g.appendChild(chip);
      });
      el.rail.appendChild(g);
    });
  }

  function applyMarks() {
    const nodes = el.cells.children;
    state.marks.forEach((mark, i) => {
      const node = nodes[i];
      if (!node) return;
      node.classList.toggle("done", mark.status === "done");
      node.classList.toggle("blocked", mark.status === "blocked");
      node.setAttribute("aria-pressed", mark.status === "done" ? "true" : "false");
      node.querySelector(".cell-fill").style.height =
        (mark.status === "open" ? Math.round(mark.progress * 100) : 0) + "%";
    });

    if (state.mode === "mission") {
      // reveal mode: everything past the first unfinished goal stays sealed
      const gate = state.reveal
        ? state.marks.findIndex(m => m.status !== "done")
        : -1;
      Array.prototype.forEach.call(nodes, (node, i) => {
        const locked = gate !== -1 && i > gate;
        node.classList.toggle("locked", locked);
        node.disabled = locked;
      });
      return;
    }

    if (state.mode !== "hex") return;
    state.geo.lines.forEach(line => {
      const won = line.cells.every(c => state.marks[c.i] && state.marks[c.i].status === "done");
      const chip = el.rail.querySelector('.chip[data-line="' + line.i + '"]');
      if (chip) chip.classList.toggle("won", won);
    });
  }

  function fit() {
    const geo = state.geo;
    const box = el.board.getBoundingClientRect();
    if (!box.width || !box.height) return;

    if (state.mode === "mission") {
      el.board.style.setProperty("--w", "0px");
      return;
    }
    const w = Math.min(box.width / geo.spanX, box.height / geo.spanY);
    el.board.style.setProperty("--w", w + "px");
    el.board.style.setProperty("--gap", Math.max(2, w * 0.032) + "px");
    // keep the rim a roughly constant thickness instead of scaling with the hex
    const rimPx = Math.min(3, Math.max(1.4, w * 0.018));
    el.board.style.setProperty("--rim", 1 - (2 * rimPx) / w);
    el.bands.style.width = (geo.spanX * w) + "px";
    el.bands.style.height = (geo.spanY * w) + "px";
  }

  /* ── interaction ── */

  function setMark(i, patch) {
    Object.assign(state.marks[i], patch);
    applyMarks();
    saveMarks();
  }

  /* Highlighting has two layers: a transient hover and a sticky pin. They're
     painted together so releasing a hover falls back to whatever is pinned
     rather than clearing everything. */

  let hover = { lines: [], traceCells: false };

  function setHover(lines, traceCells) {
    hover = { lines: lines || [], traceCells: !!traceCells };
    paintLines();
  }

  function togglePin(lineIndex) {
    if (state.pinned.has(lineIndex)) state.pinned.delete(lineIndex);
    else state.pinned.add(lineIndex);
    paintLines();
  }

  function clearPins() {
    if (!state.pinned.size) return;
    state.pinned.clear();
    paintLines();
  }

  function paintLines() {
    const active = new Set(state.pinned);
    hover.lines.forEach(i => active.add(i));

    el.bands.querySelectorAll("line").forEach(ln => {
      ln.classList.toggle("lit", active.has(+ln.dataset.line));
    });

    el.rail.querySelectorAll(".chip").forEach(chip => {
      const i = +chip.dataset.line;
      const pinned = state.pinned.has(i);
      chip.classList.toggle("pinned", pinned);
      chip.classList.toggle("lit", hover.lines.indexOf(i) !== -1 && !pinned);
      chip.setAttribute("aria-pressed", String(pinned));
    });

    const pinnedCells = new Set();
    state.pinned.forEach(i => {
      const line = state.geo.lines[i];
      if (line) line.cells.forEach(c => pinnedCells.add(c.i));
    });

    const hoverCells = new Set();
    if (hover.traceCells) {
      hover.lines.forEach(i => {
        const line = state.geo.lines[i];
        if (line) line.cells.forEach(c => hoverCells.add(c.i));
      });
    }

    Array.prototype.forEach.call(el.cells.children, (node, i) => {
      node.classList.toggle("pinned", pinnedCells.has(i));
      node.classList.toggle("traced", hoverCells.has(i));
    });

    // kept in the layout rather than hidden: appearing would reflow the rail and
    // slide the chips out from under the pointer
    el.clearPins.classList.toggle("gone", state.pinned.size === 0);
  }

  function wireBoard() {
    el.cells.addEventListener("click", e => {
      const node = e.target.closest(".cell");
      if (!node) return;
      const i = +node.dataset.i;
      const mark = state.marks[i];
      setMark(i, { status: mark.status === "done" ? "open" : "done", progress: 0 });
    });

    el.cells.addEventListener("contextmenu", e => {
      const node = e.target.closest(".cell");
      if (!node || node.disabled) return;
      e.preventDefault();
      const i = +node.dataset.i;
      const mark = state.marks[i];
      setMark(i, { status: mark.status === "blocked" ? "open" : "blocked", progress: 0 });
    });

    el.cells.addEventListener("wheel", e => {
      const node = e.target.closest(".cell");
      if (!node || node.disabled) return;
      e.preventDefault();
      const i = +node.dataset.i;
      const step = e.deltaY < 0 ? 0.25 : -0.25;
      const next = Math.min(1, Math.max(0, state.marks[i].progress + step));
      setMark(i, { status: next >= 1 ? "done" : "open", progress: next >= 1 ? 0 : next });
    }, { passive: false });

    el.cells.addEventListener("keydown", e => {
      const node = e.target.closest(".cell");
      if (!node) return;
      const i = +node.dataset.i;
      const mark = state.marks[i];
      if (e.key === "+" || e.key === "=" || e.key === "-") {
        e.preventDefault();
        const next = Math.min(1, Math.max(0, mark.progress + (e.key === "-" ? -0.25 : 0.25)));
        setMark(i, { status: next >= 1 ? "done" : "open", progress: next >= 1 ? 0 : next });
      } else if (e.key === "x" || e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setMark(i, { status: mark.status === "blocked" ? "open" : "blocked", progress: 0 });
      }
    });

    el.cells.addEventListener("mouseover", e => {
      const node = e.target.closest(".cell");
      if (!node) return;
      setHover(state.geo.cells[+node.dataset.i].lines, false);
    });
    el.cells.addEventListener("mouseleave", () => setHover([], false));

    el.rail.addEventListener("mouseover", e => {
      const chip = e.target.closest(".chip");
      if (chip) setHover([+chip.dataset.line], true);
    });
    el.rail.addEventListener("mouseleave", () => setHover([], false));
    el.rail.addEventListener("focusin", e => {
      const chip = e.target.closest(".chip");
      if (chip) setHover([+chip.dataset.line], true);
    });
    el.rail.addEventListener("focusout", () => setHover([], false));

    el.rail.addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (chip) togglePin(+chip.dataset.line);
    });
  }

  /* ── game picker ────────────────────────────────────────────
     A plain <select> is a long scroll once there are 45 games, so this is a
     button + filtered listbox. Type to narrow, arrows to move, Enter to pick.
     ------------------------------------------------------------ */

  const games = { items: [], filtered: [], active: -1 };

  function refreshGames() {
    const all = lists.all();
    games.items = all.builtin.map(b => ({ id: b.id, name: b.name, group: "Included" }))
      .concat(all.custom.map(c => ({ id: c.id, name: c.name, group: "Yours" })));

    if (!games.items.some(g => g.id === state.listId)) {
      state.listId = games.items.length ? games.items[0].id : null;
    }
    updateGameLabel();
    if (!el.gamePop.hidden) renderGameList();
  }

  function updateGameLabel() {
    const item = games.items.find(g => g.id === state.listId);
    el.gameLabel.textContent = item ? item.name : "No lists yet";
  }

  function fold(text) {
    // decompose first so "Pokémon" folds to "pokemon" rather than "pok mon"
    return String(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function renderGameList() {
    const query = fold(el.gameSearch.value);
    games.filtered = query
      ? games.items.filter(g => fold(g.name).indexOf(query) !== -1 || fold(g.id).indexOf(query) !== -1)
      : games.items.slice();

    if (games.active >= games.filtered.length) games.active = games.filtered.length - 1;

    el.gameList.innerHTML = "";
    let group = null;
    games.filtered.forEach((item, i) => {
      if (item.group !== group) {
        group = item.group;
        const head = document.createElement("li");
        head.className = "combo-group";
        head.textContent = group;
        head.setAttribute("aria-hidden", "true");
        el.gameList.appendChild(head);
      }
      const li = document.createElement("li");
      li.className = "combo-item" +
        (item.id === state.listId ? " on" : "") +
        (i === games.active ? " active" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(item.id === state.listId));
      li.dataset.id = item.id;
      li.dataset.i = i;
      li.textContent = item.name;
      el.gameList.appendChild(li);
    });

    el.gameNone.hidden = games.filtered.length > 0;
  }

  function scrollActiveIntoView() {
    const node = el.gameList.querySelector(".combo-item.active");
    if (node) node.scrollIntoView({ block: "nearest" });
  }

  function openGames() {
    el.gamePop.hidden = false;
    el.gameButton.setAttribute("aria-expanded", "true");
    el.gameSearch.value = "";
    games.active = Math.max(0, games.items.findIndex(g => g.id === state.listId));
    renderGameList();
    el.gameSearch.focus();
    scrollActiveIntoView();
  }

  function closeGames() {
    el.gamePop.hidden = true;
    el.gameButton.setAttribute("aria-expanded", "false");
  }

  function chooseGame(id) {
    if (!id) return;
    const changed = id !== state.listId;
    state.listId = id;
    updateGameLabel();
    closeGames();
    el.gameButton.focus();
    if (changed) build(el.seedInput.value);
  }

  function wireGamePicker() {
    el.gameButton.addEventListener("click", () => {
      if (el.gamePop.hidden) openGames(); else closeGames();
    });

    el.gameSearch.addEventListener("input", () => {
      games.active = 0;
      renderGameList();
      scrollActiveIntoView();
    });

    el.gameSearch.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!games.filtered.length) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        games.active = (games.active + step + games.filtered.length) % games.filtered.length;
        renderGameList();
        scrollActiveIntoView();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = games.filtered[games.active] || games.filtered[0];
        if (item) chooseGame(item.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeGames();
        el.gameButton.focus();
      }
    });

    el.gameList.addEventListener("click", e => {
      const li = e.target.closest(".combo-item");
      if (li) chooseGame(li.dataset.id);
    });

    el.gameList.addEventListener("mousemove", e => {
      const li = e.target.closest(".combo-item");
      if (li && +li.dataset.i !== games.active) {
        games.active = +li.dataset.i;
        renderGameList();
      }
    });

    document.addEventListener("click", e => {
      if (!el.gamePop.hidden && !e.target.closest(".combo")) closeGames();
    });
  }

  /* ── generate + URL ── */

  function randomSeed() { return String(Math.floor(Math.random() * 900000) + 100000); }

  function build(seed) {
    const id = state.listId;
    if (!id) { el.empty.hidden = false; el.board.hidden = true; return; }

    const list = lists.load(id);
    if (!list || !list.goals.length) {
      el.empty.hidden = false;
      el.board.hidden = true;
      el.empty.innerHTML = "That list has no goals yet. Open <b>Edit goals</b> to add some.";
      return;
    }

    state.listId = id;
    state.list = list;
    state.mode = el.modeSelect.value;
    state.size = Math.max(1, Math.min(4, parseInt(el.sizeSelect.value, 10) || RADIUS));
    state.geo = state.mode === "mission" ? MISSION : geoFor(state.size);
    state.seed = String(seed || el.seedInput.value.trim() || randomSeed());

    const placed = generate(state.geo, list, state.seed);
    state.goals = placed;
    state.marks = loadMarks(placed.length);
    state.pinned.clear();

    const rules = (list.rules || []).concat(list.tips || []);
    el.rulesBtn.hidden = rules.length === 0;
    el.rulesList.innerHTML = "";
    rules.forEach(line => {
      const li = document.createElement("li");
      li.textContent = line;            // plain text: never innerHTML from a goal file
      el.rulesList.appendChild(li);
    });

    el.empty.hidden = true;
    el.board.hidden = false;
    el.sizeField.hidden = state.mode === "mission";
    el.revealField.hidden = state.mode !== "mission";
    el.seedInput.value = state.seed;
    el.seedOut.textContent = state.seed;

    // Boards want roughly 1.3 goals per hex. Below 1.0 goals repeat outright;
    // between 1.0 and 1.3 the hard tiers run dry and the outer rings flatten.
    const need = state.geo.cells.length;
    const comfortable = Math.ceil(need * 1.3);
    const have = list.goals.length;
    if (have < need) {
      el.notice.hidden = false;
      el.notice.textContent = "Only " + have + " goals for " + need + " hexes, so some repeat. " +
        "About " + comfortable + " gives a clean board — add more under Edit goals, or pick a smaller size.";
    } else if (have < comfortable) {
      el.notice.hidden = false;
      el.notice.textContent = have + " goals covers " + need + " hexes, but the hard tiers run thin " +
        "and the outer rings flatten out. About " + comfortable + " spreads the difficulty properly.";
    } else {
      el.notice.hidden = true;
    }

    renderBoard();
    writeUrl();
  }

  function writeUrl() {
    const params = new URLSearchParams({
      game: state.listId, mode: state.mode, size: state.size, seed: state.seed
    });
    history.replaceState(null, "", "?" + params.toString());
  }

  function readUrl() {
    const p = new URLSearchParams(location.search);
    return { game: p.get("game"), mode: p.get("mode"), size: p.get("size"), seed: p.get("seed") };
  }

  /* ── sheets ── */

  function openSheet(id) {
    const sheet = $(id);
    sheet.hidden = false;
    const focusable = sheet.querySelector("select, input, button");
    if (focusable) focusable.focus();
  }
  function closeSheet(id) { $(id).hidden = true; }

  /* ── boot ── */

  async function init() {
    ["board", "cells", "rail", "empty", "notice", "modeSelect", "seedInput",
      "sizeSelect", "sizeField", "revealField", "revealToggle", "generateBtn", "randomBtn",
      "editBtn", "helpBtn", "seedOut", "copyLink", "version", "year",
      "gameButton", "gameLabel", "gamePop", "gameSearch", "gameList", "gameNone",
      "clearPins", "rulesBtn", "rulesList"]
      .forEach(k => { el[k] = $(k); });
    el.bands = document.querySelector(".bands");

    el.version.textContent = VERSION;
    el.year.textContent = new Date().getFullYear();

    await lists.loadJson();
    lists.ensure();
    refreshGames();

    const url = readUrl();
    if (url.game && games.items.some(g => g.id === url.game)) {
      state.listId = url.game;
      updateGameLabel();
    }
    if (url.mode) el.modeSelect.value = url.mode;
    if (url.size) el.sizeSelect.value = url.size;
    if (url.seed) el.seedInput.value = url.seed;

    wireBoard();

    function randomBoard() {
      el.seedInput.value = "";
      build();
    }

    el.randomBtn.addEventListener("click", randomBoard);
    el.generateBtn.addEventListener("click", () => build());
    el.seedInput.addEventListener("keydown", e => { if (e.key === "Enter") build(); });
    el.modeSelect.addEventListener("change", () => build(state.seed || el.seedInput.value));
    el.sizeSelect.addEventListener("change", () => build(state.seed || el.seedInput.value));
    wireGamePicker();

    state.reveal = store.get(REVEAL_KEY) === true;
    el.revealToggle.checked = state.reveal;
    el.revealToggle.addEventListener("change", () => {
      state.reveal = el.revealToggle.checked;
      store.set(REVEAL_KEY, state.reveal);
      applyMarks();
    });

    // "r" anywhere outside a text field rolls a new board
    document.addEventListener("keydown", e => {
      if (e.key !== "r" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (document.querySelector(".sheet:not([hidden])")) return;
      randomBoard();
    });

    el.helpBtn.addEventListener("click", () => openSheet("help"));
    el.rulesBtn.addEventListener("click", () => openSheet("rules"));
    el.clearPins.addEventListener("click", clearPins);
    el.editBtn.addEventListener("click", () => openSheet("editor"));
    document.addEventListener("click", e => {
      const close = e.target.closest("[data-close]");
      if (close) closeSheet(close.dataset.close);
      else if (e.target.classList.contains("sheet")) e.target.hidden = true;
    });
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      const open = document.querySelectorAll(".sheet:not([hidden])");
      if (open.length) { open.forEach(sheet => { sheet.hidden = true; }); return; }
      if (!el.gamePop.hidden) { closeGames(); return; }
      clearPins();
    });

    el.copyLink.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        el.copyLink.textContent = "Link copied";
        setTimeout(() => { el.copyLink.textContent = "Copy board link"; }, 1400);
      } catch (err) {
        el.copyLink.textContent = "Copy failed — select the address bar";
        setTimeout(() => { el.copyLink.textContent = "Copy board link"; }, 2200);
      }
    });

    new ResizeObserver(fit).observe(el.board);
    window.addEventListener("resize", fit);

    build(url.seed);
  }

  /* goals/*.js call this at load time — plain script tags, no fetch, so file:// works */
  window.HexBingoGoals = function (list) { return lists.register(list); };

  /* exposed for editor.js */
  window.HB = {
    VERSION, DIFF, HUES, HEX,
    geoFor, generate, buildGeometry,
    store, lists, normalise, refreshGames,
    LISTS_KEY,
    rebuild: () => build(state.seed),
    state
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
