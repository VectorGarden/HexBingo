# HexBingo

Seeded hexagonal bingo boards for speedruns — live at
**[bingo.reizu.dev](https://bingo.reizu.dev)**. Static site: no build step, no
dependencies, no framework.

```
index.html                page structure
hexbingo.css              styles

src/core/                 pure logic, no DOM — this is what the tests cover
  constants.js              shared values
  rng.js                    seeded RNG
  geometry.js               cells, colours and lines from a radius
  generate.js               which goal lands on which hex
  goals.js                  normalising, and the import parsers
  marks.js                  the board model: claim, block, progress, wins
  demo.js                   fallback list when goals/ can't be reached

src/app/                  the browser half
  main.js                   boot and wiring
  state.js                  the one mutable state, and the only place it changes
  storage.js                localStorage with an in-memory fallback
  boards.js                 saved progress, keyed by list+mode+size+seed
  lists.js                  the manifest, and lists fetched on demand
  board.js rail.js          the board and the line rail
  cellmenu.js               the press-and-hold menu
  picker.js sheets.js       the game picker and the modal sheets
  audio.js url.js dom.js    fanfare, history, element lookup

src/editor/editor.js      in-browser goal editor

goals/index.json          manifest: which lists exist
goals/<game>.json         one file per game (45 included)
goals/schema.json         what a goal file must look like
tools/validate-goals.js   checks every list against it
tools/convert-goals.js    migrates the old goallist/ files
test/                     node --test, no framework
```

No build step and no runtime dependencies. `index.html` loads one ES module and
the browser resolves the rest. The `devDependencies` in `package.json` are for
checking the code, never for shipping it.

**It needs a server** — ES modules and `fetch` are both blocked on `file://`.
Any static server will do:

```
npm run serve      # or: python3 -m http.server 8000, npx serve, …
```

---

## Working on it

```
npm install        # devDependencies: TypeScript and node types
npm run check      # validate goal files, run the tests, type-check
```

- **`npm test`** runs `node --test test/` — no framework, no config. Everything
  in `src/core/` is pure, so it is tested directly: geometry invariants at every
  radius, RNG determinism, the difficulty curve, the legacy import formats, and
  the board rules. Needs Node 18 or newer.
- **`npm run validate`** checks every goal list against `goals/schema.json`. A
  malformed file fails silently at runtime — that game just disappears from the
  picker — so this is the gate that catches it.
- **`npm run typecheck`** runs TypeScript over the JSDoc annotations with
  `--noEmit`. There is no TypeScript in the source and nothing is compiled; it
  reads the comments and checks the JavaScript as-is.

- **`npm run build`** assembles `_site/`, exactly what a deploy publishes.

All three checks run on every push and pull request
(`.github/workflows/checks.yml`), and again as the gate in front of the deploy
(`.github/workflows/deploy.yml`). A red check means the live site does not move.

---

## Adding goals

Click **Edit goals**. Everything happens in the browser:

- Type a goal, pick a difficulty 1–5, press Enter.
- **Paste many** takes one goal per line. A `3 | ` prefix sets difficulty, a
  `#tag` anywhere in the line becomes a tag:
  ```
  3 | Beat a Divine Beast #dungeon #boss
  Cook any meal
  ```
  Lines with no prefix use whichever difficulty button is selected.
- **Import** reads HexBingo JSON *or* a legacy `bingoList[n] = [...]` script
  from the old goal lists. Old difficulty 1–25 maps onto 1–5.
- **Download** gives you a ready-to-commit file.

Lists you create live in the browser (localStorage), so you can build and test a
list without touching the repo. To ship one:

1. Download it and drop it in `goals/`.
2. Add one line to `goals/index.json`:
   ```json
   { "id": "your-game", "name": "Your Game", "file": "your-game.json" }
   ```
3. Run `npm run validate` to check it before you push. CI does the same.

### Goal file format

`goals/schema.json` is the authority, and `npm run validate` checks every file
against it.

```json
{
  "name": "Breath of the Wild",
  "rules": ["Optional. Shown behind a Rules button when present."],
  "goals": [
    { "text": "Cook any meal",       "difficulty": 1, "tags": ["cook"] },
    { "text": "Free a Divine Beast", "difficulty": 4, "tags": ["divine", "boss"] }
  ]
}
```

`rules` and `tips` are optional arrays of plain-text lines, carried over from
the old `bingoRules` / `bingoTips` variables. They render as text, never as
HTML, so a goal file can't inject markup into the page.

The importer accepts this, a bare array of goals or strings, and legacy
`bingoList` scripts.

`difficulty` is 1–5. `tags` are optional — goals sharing a tag are pushed apart so
one line doesn't turn into "collect 10 / collect 30 / collect 80".

Aim for at least four goals per difficulty. The editor flags tiers that are thin,
because a thin tier means boards start repeating themselves.

---

## How the board works

The board is generated from axial coordinates rather than hardcoded. A cell at
`(q, r)` has `s = -q-r`, and its ring is `max(|q|, |r|, |s|)`.

- **Colours.** The 12 perimeter cells are sorted by angle and given the six hues
  in runs of two. Inner cells blend the two hues whose runs they sit between.
  The centre is the free-ish space.
- **Lines.** Three axes × five offsets = 15 lines. Each line is named by the hues
  of its two endpoints.
- **Difficulty.** Line length falls off with ring, so a cell's target difficulty
  is a function of its ring alone: centre ≈ 1, middle ring ≈ 2.8, outer ring ≈ 4.3.
  Goals are placed hardest-first, since high-difficulty goals are the scarce
  resource.

This reproduces the old hardcoded board exactly — all 19 cell colour classes and
all 15 line names come out identical.

---

## Board size

The **Size** dropdown offers 7, 19, 37 and 61 hexes. 19 is the classic board and
the default. Everything is generated from the radius, so the cells, colours,
lines and layout all follow.

| radius | cells | lines | line lengths | labels |
|-------:|------:|------:|--------------|--------|
| 1 | 7 | 9 | 2–3 | `R–G` |
| 2 | 19 | 15 | 3–5 | `R–G` |
| 3 | 37 | 21 | 4–7 | `R1·G1` |
| 4 | 61 | 27 | 5–9 | `R1·G1` |

Cells are `3r² + 3r + 1`; lines are `3(2r+1)`.

**Why the labels change.** At radius 2 there are exactly 15 lines and exactly
C(6,2) = 15 hue pairs, so every line gets a unique two-colour name. That is the
original design and it only works at radius 1 and 2. Past that there are more
lines than pairs — radius 3 has 21 lines for 15 pairs — so endpoints carry their
position within the hue run and lines read `R1·G1` instead of `R–G`. The classic
labels are untouched at the default size.

**Goal lists need to scale with the board.** Aim for about 1.3 goals per hex:

| size | minimum | comfortable |
|-----:|--------:|------------:|
| 7 | 7 | 10 |
| 19 | 19 | 25 |
| 37 | 37 | 49 |
| 61 | 61 | 80 |

Below the minimum, goals repeat (never twice on the same line, but they do
recur). Between minimum and comfortable, the hard tiers run dry and the outer
rings flatten — a 61-hex board on a 40-goal list produces a non-monotonic
difficulty curve. The page warns you in both cases.

---

## Deploying to GitHub Pages

Lives in **`VectorGarden/HexBingo`**, published to **https://bingo.reizu.dev**.
Every internal path is relative, so the site works at a domain root *and* under
`vectorgarden.github.io/HexBingo/` — hosting it elsewhere needs no code changes.

### How it is set up

**Settings → Pages → Source: GitHub Actions.** `.github/workflows/deploy.yml`
runs on every push to `main`: it validates the goal lists, runs the tests and
type-checks, assembles the artifact, publishes it, then fetches the live URLs
back to confirm they are there. A failure at any of those steps means the
previous version stays up.

DNS is one record, pointing at the **owner** host rather than the repo:

```
bingo   CNAME   vectorgarden.github.io.
```

The repo name never appears in DNS — GitHub works out which repo owns the domain
from the `CNAME` file in the published artifact. "Enforce HTTPS" is on and the
certificate renews on its own.

### What gets published

`tools/build-site.js` copies an explicit allowlist into `_site/`. Run it
yourself with `npm run build`.

The artifact **is** the site, which changes two things from the old branch
deploy. Anything left out is a 404 rather than merely absent from the repo, and
a missing `CNAME` silently drops the custom domain on the next deploy — so the
script refuses to build if any required file is missing, and checks that `CNAME`
still looks like a domain.

Left out, because nothing fetches them: `test/`, `tools/`, `.github/`,
`README.md`, `package*.json`, `jsconfig.json`. That trims roughly 90 KB off a
1.4 MB repo — worth doing for tidiness, but it is not why the deploy moved.

Jekyll no longer runs at all, so there is no `.nojekyll` and no file or folder
beginning with `_` to worry about.

### What is in the repo for this

| File | Why |
|---|---|
| `CNAME` | Holds `bingo.reizu.dev`. It must reach the artifact or the custom domain is dropped, which is why the build script checks for it. |
| `404.html` | Themed not-found page. Its "Go to HexBingo" link detects a `*.github.io` project path and adjusts, so it works on both URLs. |
| `og.png`, meta tags | Link preview for Discord, Twitter, Slack. Since the whole point is pasting board links, this matters more than usual. |
| `robots.txt`, `sitemap.xml` | Both reference the live domain. |
| `site.webmanifest` + icons | "Add to home screen" on iOS and Android. |

The canonical URL, `og:url` and `og:image` are absolute and point at
`bingo.reizu.dev`. That is deliberate — they should describe the site's real
home, not whichever URL a crawler happened to reach. If the domain ever changes,
those four lines in `index.html` plus `CNAME`, `robots.txt` and `sitemap.xml`
are the only places it appears.

### Pushing

```
git clone git@github.com:VectorGarden/HexBingo.git
cd HexBingo
git add -A
git commit -m "..."
git push
```

Pushing changes under `.github/workflows/` with a fine-grained PAT needs the
`workflow` permission, or GitHub rejects the push. Normal SSH or the CLI is fine.

### Checking it worked

- The picker lists 45 games.
- `/goals/index.json` returns JSON — if this 404s, the goals folder didn't deploy.
- Paste a board link into Discord and confirm the preview image appears.

---

## The included lists

49 lists ship in `goals/` — 6,692 goals.

The original 45 were converted from the old site, with difficulty rescaled from
its 1–25 tiers onto 1–5. Two are worth a look before you rely on them:
**BattleBlock Theater** skews hard to the easy end (344 of its 574 goals land in
tier 1) and **Super Mario World** skews the other way, because their original
tiers didn't spread evenly. Both play fine, they just won't have a smooth
difficulty gradient.

### Not yet tiered

Four lists came across from the Trello board, which records goal text but no
difficulty, so every goal in them currently sits at 3:

| List | Goals |
|---|---:|
| A Link to the Past | 128 |
| Link's Awakening | 106 |
| New Super Mario Bros. Wii | 101 |
| Tony Hawk's Underground | 144 |

They generate and play, but the board's difficulty gradient does nothing until
they are tiered — the centre hex will be no easier than the rim. Open **Edit
goals**, duplicate the list, and use the per-goal difficulty button to spread
them; `npm run validate` warns about thin tiers until you do.

### Planned

Written but not yet ready, or waiting on goals being drafted:

- **Super Smash Bros. Ultimate** — 24 goals drafted, below the 25 a 19-hex board
  wants, so it needs more before it is worth shipping.
- **Ocarina of Time** — tracked, no goals written yet.
- Backlog with nothing drafted: Banjo-Kazooie, Oracle of Ages, Oracle of
  Seasons, Minish Cap, A Link Between Worlds, Digimon World DS, Digimon World
  Dawn/Dusk, Super Mario 3D World, Super Mario 3D Land, Donkey Kong Country
  Returns: Tropical Freeze, Enter the Gungeon, Captain Toad: Treasure Tracker,
  Shovel Knight, Rayman Legends, Duck Game, Darksiders, Mega Man Zero
  Collection, Mega Man ZX + Advent.

**Pokémon Stadium** was cancelled. Around 58 goals exist for it, but it is not
shipping.

---

## Migrating other goal lists

The old `goallist/*.js` files use a different format. The converter handles it:

```
node tools/convert-goals.js ../old-repo/goallist goals
```

It reads every file, writes `goals/<id>.json` per game, and updates
`goals/index.json` to match. It also prints a per-game difficulty spread —
anything lopsided means the old tiers didn't map cleanly and is worth a look.
Existing files are left alone unless you pass `--force`.

It understands four old shapes: `var bingoList = [null, [...], [...]]` parsed as
real JSON (what the original site actually uses), `bingoList[n] = [...]` indexed
tiers, a nested array that isn't valid JSON, and a flat pile of `{name: ...}`
objects. It balances brackets rather than regex-matching to the end of the file,
so trailing `bingoRules` / `bingoTips` declarations don't trip it up.
Game titles come from the old `<select>`, so files come out properly named.
Anything it can't parse is reported rather than silently skipped.

---

## Playing

- Click a hex to claim it, click again to release.
- Right-click to block a goal you don't want.
- Scroll on a hex, or press <kbd>+</kbd>/<kbd>−</kbd>, for partial progress.
- **On touch**, tap to claim and press-and-hold for the rest. Neither
  right-click nor the wheel exists there, so blocking and partial progress live
  in a small menu the hold opens. Holding is deliberately the only new gesture:
  a swipe would fight the page scroll and a double-tap would fight the tap.
- Hover a hex to see its three lines light up across the board.
- **Random board** rolls a new seed. **Use this seed** rebuilds from the seed box.
  Pressing <kbd>r</kbd> anywhere outside a text field rolls a new board.
- The **Game** picker is searchable — click it and type. Arrows move, Enter picks,
  Esc closes. Matching ignores case, punctuation and accents, so `pokemon` finds
  `Pokémon: Crystal`, and it matches file ids too, so `sotn` works.
- Hovering a hex lights its three lines across the board **and** highlights those
  three chips in the rail below, each ringed in its own line colour.
- **Click a chip to pin that line.** It stays lit after the pointer leaves, the
  chip gets a coloured ring and its hexes get a bright border. Pin as many as you
  like; click again to unpin, <kbd>Esc</kbd> or **Clear pinned** to drop them all.
  Pins reset when you generate a new board.
- **Complete** stays disabled until a line is actually finished — every hex on
  it claimed. Once one is, the button lights up, and pressing it names the line
  and plays a short fanfare. In Mission mode the single five-goal column is the
  line, so the same button covers it.
- A **Rules** button appears when the current list ships rules.
- **Mission** mode has a **One at a time** toggle: only the next unfinished goal
  is readable, the rest show as Locked until you get there. The setting sticks
  between sessions.
- **Copy board link** puts game, mode, size and seed in the URL.

Progress is saved per seed, so a refresh mid-run doesn't lose your board.

---

## Notes

- Icons are generated from the same six-wedge design: `icon.svg` is the primary,
  `favicon.ico` carries 16/24/32/48/64/128/256 px for browsers that ignore SVG
  favicons, and the PNGs plus `site.webmanifest` cover iOS and Android home
  screens. Delete the old `favicon.ico` from the original repo — this replaces it.
- The old `Content-Security-Policy` meta tag is gone — it blocked local scripts
  under `file://`. `index.html` has no inline JS at all; `404.html` has one small
  inline `<script>`, so a policy would need a hash for it. A meta tag is the only
  option while the site is served by a branch deploy, since that cannot set
  response headers.
- Fonts come from Google Fonts (Barlow Condensed / Semi Condensed). The condensed
  widths are doing real work — hexagons are narrow at top and bottom, so a
  condensed face fits noticeably more text per line. This is the site's only
  third-party request; if the CDN is blocked or slow it falls back to system
  condensed faces and still looks right, but self-host the two families if you'd
  rather not depend on it at all.
- Board state and custom lists use `localStorage` with an in-memory fallback, so
  nothing breaks in private browsing.
- The win fanfare is synthesised with the Web Audio API rather than shipped as a
  file — four oscillators playing a major arpeggio. That keeps the site free of
  binary assets, and it only ever fires from a real click, which is the gesture
  browsers require before an `AudioContext` may make noise. If audio is
  unavailable the button still works and simply stays silent.
