# HexBingo

Seeded hexagonal bingo boards for speedruns — live at
**[bingo.reizu.dev](https://bingo.reizu.dev)**. Static site: no build step, no
dependencies, no framework.

```
index.html                page structure
hexbingo.css              styles
hexbingo.js               geometry, RNG, board generation, interaction
editor.js                 in-browser goal editor
icon.svg                  primary favicon
favicon.ico               7-size .ico for older browsers and bookmarks
apple-touch-icon.png      iOS home screen
icon-192.png icon-512.png PWA / Android
site.webmanifest          app metadata
goals/index.json          manifest: which lists exist
goals/<game>.json         one file per game (45 included)
goals/bundle.js           generated; offline fallback only
tools/build-bundle.js     regenerates the bundle
tools/convert-goals.js    migrates the old goallist/ files
```

Removed from the old version: jQuery, seedrandom.js, all inline event handlers,
and the 19 hardcoded `<li>` elements.

Goal lists are plain JSON, fetched at runtime. Hosted anywhere that serves
static files, that's all there is to it.

Opening `index.html` straight off disk is the awkward case, because browsers
block `fetch` on `file://`. So `goals/bundle.js` bakes the same JSON into one
script. It is **only** loaded if the fetch fails, injected at runtime rather
than sitting in a `<script>` tag — at 45 lists the bundle is roughly 470 KB,
and a hosted visitor should never pay for it.

Re-run `node tools/build-bundle.js` after editing lists if you work off disk.
If you only ever use a real server, delete `goals/bundle.js` entirely; nothing
breaks.

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
3. If you open the page off disk, `node tools/build-bundle.js`.

### Goal file format

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

-------:|------:|------:|-------------------:|-----------:|
| 1 | 7 | 9 | 9 | 0 |
| 2 | 19 | **15** | **15** | 0 |
| 3 | 37 | 21 | 15 | 6 |
| 4 | 61 | 27 | 15 | 12 |

Cells are `3r² + 3r + 1`; lines are `3(2r+1)`. At radius 2 the line count lands
exactly on C(6,2) = 15, which is why every line gets a clean two-colour name like
`R–G`. That is not a coincidence, it's the design — and it only works at radius 2.
Radius 3 gives 21 lines but still only six edges, so six lines end up sharing a
name with another line.

The code handles this by appending a numeric suffix (`RG`, `RG2`), which runs but
reads badly. A real radius-3 board would need a different naming scheme —
numbered edges (`R2–G1`), or dropping colour-pair names for coordinates.

So the cost, if you ever want it:

- Geometry and lines: **free**, already done.
- Layout and text sizing: **small**, the CSS scales off `--w` and `spanX/spanY`.
- Line naming: **the actual work**, and it's a design decision more than a coding one.
- Difficulty balance: **needs retuning**. The ring→difficulty curve is calibrated
  for three rings and would want re-checking against 21 lines of length 3–7.

---

## Deploying to GitHub Pages

Lives in its own repo, **`reizuseharu/HexBingo`**, published to
**https://bingo.reizu.dev**. Everything needed is already here — no code changes
are required for a project repo, because every internal path is relative. The
site works at a domain root *and* under `reizuseharu.github.io/HexBingo/`, which
is where it'll sit until DNS and the certificate settle.

### Steps

1. **Create the repo** `HexBingo` and push these files to its root on `main`.
2. **Settings → Pages → Source: GitHub Actions.** Not "Deploy from a branch" —
   the included workflow validates the goal files, then publishes.
3. Push once and let the workflow finish. The site should be live at
   `https://reizuseharu.github.io/HexBingo/`.
4. **Settings → Pages → Custom domain: `bingo.reizu.dev`.** Save and wait for the
   DNS check to go green.
5. **Tick "Enforce HTTPS"** once the certificate is issued — up to an hour, and
   the box stays greyed out until then.

### DNS

Your existing record is already right, as long as it targets the **user** host
and not the repo:

```
bingo   CNAME   reizuseharu.github.io.
```

That is the same target for a project repo as for a user site — the repo name
never appears in DNS. GitHub works out which repo owns the domain from the
`CNAME` file in the published artifact.

### Things specific to a separate repo

- **The old `reizuseharu.github.io` keeps serving the old HexBingo** until you
  change it. Two sites, two repos. Empty it, archive it, or point it elsewhere —
  just don't put a `CNAME` for `bingo.reizu.dev` in it too, or the two repos will
  fight over the domain and GitHub will unset it on one of them.
- **Repo name casing matters in URLs.** `HexBingo` gives
  `reizuseharu.github.io/HexBingo/`, and that path is case-sensitive. Irrelevant
  once the custom domain is live.
- **Pushing workflow files needs the right credentials.** If you push with a
  fine-grained PAT it must include the `workflow` permission, or GitHub rejects
  the push with a message about `.github/workflows`. Normal SSH or the CLI is
  fine.
- **Use git rather than the web uploader** for the first push. Drag-and-drop
  handles dot-folders like `.github/` unreliably, and `.nojekyll` is easy to lose.

```
cd HexBingo
git init -b main
git add -A
git commit -m "HexBingo rewrite"
git remote add origin git@github.com:reizuseharu/HexBingo.git
git push -u origin main
```

### What's in the repo for this

| File | Why |
|---|---|
| `CNAME` | Holds `bingo.reizu.dev`. Required in the deploy artifact — with the Actions workflow, GitHub will *not* re-add it for you, so deleting it drops the custom domain on the next deploy. |
| `.nojekyll` | Skips Jekyll processing. Faster builds, and stops it from swallowing any file or folder beginning with `_`. |
| `.github/workflows/pages.yml` | Validates every goal list, then deploys. |
| `404.html` | Themed not-found page. Its "Go to HexBingo" link detects a `*.github.io` project path and adjusts, so it works before and after the domain switch. |
| `og.png`, meta tags | Link preview for Discord, Twitter, Slack. Since the whole point is pasting board links, this matters more than usual. |
| `robots.txt`, `sitemap.xml` | Both reference the live domain. |
| `site.webmanifest` + icons | "Add to home screen" on iOS and Android. |

The canonical URL, `og:url` and `og:image` are absolute and point at
`bingo.reizu.dev`. That's deliberate — they should describe the site's real home,
not whichever URL a crawler happened to reach. If you ever change the domain,
those four lines in `index.html` plus `CNAME`, `robots.txt` and `sitemap.xml` are
the only places it appears.

### The workflow

It runs on every push and does two things:

- **Validates the goal lists.** A malformed JSON file fails silently at runtime —
  that game just disappears from the picker. The build checks every list parses,
  has goals, has difficulties in 1–5, is listed in `goals/index.json`, and that
  no file is orphaned. Any problem fails the build before it ships.
- **Trims what isn't served.** `goals/bundle.js` (~470 KB), `tools/`, and
  `.gitignore` are dropped from the artifact. The bundle only exists for opening
  `index.html` off disk; a hosted visitor fetches the JSON.

That leaves 63 files, about 1.3 MB, almost all of it goal data.

### Checking it worked

- The picker lists 45 games.
- `/goals/index.json` returns JSON — if this 404s, the goals folder didn't deploy.
- Paste a board link into Discord and confirm the preview image appears.

---

## The included lists

All 45 lists from the original site are converted and shipped in `goals/` —
6,213 goals. Difficulty was rescaled from the old 1–25 tiers onto 1–5.

Two are worth a look before you rely on them: **BattleBlock Theater** skews hard
to the easy end (344 of its 574 goals land in tier 1) and **Super Mario World**
skews the other way, because their original tiers didn't spread evenly. Both
play fine, they just won't have a smooth difficulty gradient.

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
- The old `Content-Security-Policy` meta tag is gone. It blocked local scripts
  under `file://`, and there is no inline JS left for it to protect against. If
  you want one back, set it as a real header rather than a meta tag.
- Fonts come from Google Fonts (Barlow Condensed / Semi Condensed). The condensed
  widths are doing real work — hexagons are narrow at top and bottom, so a
  condensed face fits noticeably more text per line. This is the site's only
  third-party request; if the CDN is blocked or slow it falls back to system
  condensed faces and still looks right, but self-host the two families if you'd
  rather not depend on it at all.
- Board state and custom lists use `localStorage` with an in-memory fallback, so
  nothing breaks in private browsing.
