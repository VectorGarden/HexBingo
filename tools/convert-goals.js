#!/usr/bin/env node
/* ============================================================
   Convert the old HexBingo goal lists into the new format.

     node tools/convert-goals.js <old-goallist-dir> [out-dir]

   e.g.  node tools/convert-goals.js ../old/goallist goals

   Reads every .js file, pulls out the goals, writes goals/<id>.json
   per game, and rewrites goals/index.json to match.
   Nothing is overwritten unless you pass --force.
   ============================================================ */

"use strict";

const fs = require("fs");
const path = require("path");

/* Titles lifted from the <select> in the old index.html, so converted
   files come out with proper names instead of filenames. */
const NAMES = {
  "botw": "Breath of the Wild",
  "botw-mount": "Breath of the Wild [Mount]",
  "botw-hunt": "Breath of the Wild [Hunt]",
  "botw-gp": "Breath of the Wild [Great Plateau]",
  "botw-cute": "Breath of the Wild [Cute]",
  "pkmn-snap": "Pokémon Snap",
  "banjo-tooie": "Banjo-Tooie",
  "battleblock": "BattleBlock Theater",
  "celeste": "Celeste",
  "dark-souls": "Dark Souls",
  "dead-cells": "Dead Cells",
  "dk64": "Donkey Kong 64",
  "ff1": "Final Fantasy 1",
  "harry-potter-2": "Harry Potter 2",
  "hat-in-time": "A Hat in Time",
  "jak-and-daxter": "Jak and Daxter",
  "loz-mm": "Majora's Mask",
  "mmnt": "Mega Man Network Transmission",
  "metroid-zm": "Metroid: Zero Mission",
  "minecraft": "Minecraft",
  "pkmn-redblue": "Pokémon: Red / Blue",
  "pkmn-crystal": "Pokémon: Crystal",
  "pkmn-rubysapphire": "Pokémon: Ruby / Sapphire",
  "pkmn-emerald-rando": "Pokémon: Emerald [Randomizer]",
  "pkmn-platinum": "Pokémon: Platinum",
  "pkmn-lets-go": "Pokémon Lets Go!",
  "rogue-legacy": "Rogue Legacy",
  "loz-ss": "Skyward Sword",
  "sadx": "Sonic Adventure",
  "sa2b": "Sonic Adventure 2 Battle",
  "sa2b-hero": "Sonic Adventure 2 Battle: Hero Story",
  "sa2b-dark": "Sonic Adventure 2 Battle: Dark Story",
  "spelunky": "Spelunky",
  "smw": "Super Mario World",
  "sm64": "Super Mario 64",
  "sms": "Super Mario Sunshine",
  "smo": "Super Mario Odyssey",
  "smo-all-kingdoms": "Super Mario Odyssey [All Kingdoms]",
  "smm2": "Super Mario Maker 2",
  "sotn": "Symphony of the Night",
  "sotn-rando": "Symphony of the Night [Randomizer]",
  "super-metroid": "Super Metroid",
  "loz-tp": "Twilight Princess",
  "loz-ww": "Wind Waker",
  "yooka-laylee": "Yooka Laylee"
};

/* ── parsing ──────────────────────────────────────────────────
   The old files are JavaScript, but we don't eval them — a regex
   pass is safer and tells us plainly what it did or didn't find.
   ------------------------------------------------------------ */

function extractObjects(body) {
  const out = [];
  const re = /\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const inner = m[1];
    const name = inner.match(/\bname\s*:\s*(["'`])((?:\\.|(?!\1).)*)\1/);
    if (!name) continue;
    const types = inner.match(/\btypes\s*:\s*\[([^\]]*)\]/);
    out.push({
      text: name[2].replace(/\\(['"`\\])/g, "$1").trim(),
      tags: types
        ? types[1].split(",").map(t => t.replace(/["'`\s]/g, "")).filter(Boolean)
        : []
    });
  }
  return out;
}

/* Pull one `var <name> = <literal>` out of the source by balancing brackets.
   The obvious regex breaks on the many files that declare bingoRules and
   bingoTips after the list. */
function extractLiteral(source, varName) {
  const at = source.indexOf("var " + varName);
  if (at < 0) return null;
  const eq = source.indexOf("=", at);
  if (eq < 0) return null;

  let i = eq + 1;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (i >= source.length) return null;

  if (source[i] === "`" || source[i] === '"' || source[i] === "'") {
    const quote = source[i];
    let j = i + 1;
    while (j < source.length) {
      if (source[j] === "\\") { j += 2; continue; }
      if (source[j] === quote) return source.slice(i + 1, j);
      j++;
    }
    return null;
  }

  const open = source[i];
  if (open !== "[" && open !== "{") return null;
  const close = open === "[" ? "]" : "}";

  let depth = 0, inString = false, escaped = false;
  for (let j = i; j < source.length; j++) {
    const ch = source[j];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return source.slice(i, j + 1);
  }
  return null;
}

/* The rules blocks are small fragments of HTML. Flatten them to plain lines so
   the page can render them as text and never touch innerHTML. */
function htmlToLines(html) {
  if (!html) return [];
  return String(html)
    .replace(/<\s*(li|p|br|tr|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function parse(source) {
  const tiers = [];   // [{ tier, goals: [...] }]

  // form A: var bingoList = [null, [...tier 1...], [...tier 2...]] — real JSON
  const literal = extractLiteral(source, "bingoList");
  if (literal && literal[0] === "[") {
    try {
      const data = JSON.parse(literal);
      data.forEach((group, i) => {
        if (!Array.isArray(group)) return;   // index 0 is usually null padding
        const goals = group
          .filter(g => g && (g.name || g.text))
          .map(g => ({
            text: String(g.name || g.text).trim(),
            tags: Array.isArray(g.types) ? g.types.filter(Boolean).map(String)
                : Array.isArray(g.tags) ? g.tags.filter(Boolean).map(String) : []
          }));
        if (goals.length) tiers.push({ tier: i, goals });
      });
      if (tiers.length) return tiers;
    } catch (e) { /* not JSON after all, fall through */ }
  }

  // form B: bingoList[12] = [ ... ];
  const indexed = /bingoList\s*\[\s*(\d+)\s*\]\s*=\s*\[([\s\S]*?)\]\s*;/g;
  let m;
  while ((m = indexed.exec(source)) !== null) {
    tiers.push({ tier: Number(m[1]), goals: extractObjects(m[2]) });
  }

  // form C: bingoList = [ [ ... ], [ ... ] ] that wasn't valid JSON
  if (!tiers.length) {
    const whole = source.match(/bingoList\s*=\s*\[([\s\S]*)\]\s*;/);
    if (whole) {
      const groups = whole[1].match(/\[[^[\]]*(?:\{[^{}]*\}[^[\]]*)*\]/g) || [];
      groups.forEach((g, i) => tiers.push({ tier: i + 1, goals: extractObjects(g) }));
    }
  }

  // form D: no tiers at all, just a pile of objects
  if (!tiers.length) {
    const flat = extractObjects(source);
    if (flat.length) tiers.push({ tier: 3, goals: flat });
  }

  return tiers.filter(t => t.goals.length);
}

/* Old lists use 1–25 (SRL convention); some use 1–5 already. Scale to 1–5
   based on what the file actually contains rather than assuming. */
function scaler(tiers) {
  const max = Math.max(...tiers.map(t => t.tier), 1);
  if (max <= 5) return n => Math.min(5, Math.max(1, n));
  return n => Math.min(5, Math.max(1, Math.ceil((n / max) * 5)));
}

/* ── main ─────────────────────────────────────────────────── */

function main() {
  const args = process.argv.slice(2).filter(a => a !== "--force");
  const force = process.argv.includes("--force");
  const srcDir = args[0];
  const outDir = args[1] || "goals";

  if (!srcDir) {
    console.error("Usage: node tools/convert-goals.js <old-goallist-dir> [out-dir] [--force]");
    process.exit(1);
  }
  if (!fs.existsSync(srcDir)) {
    console.error("No such directory: " + srcDir);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith(".js")).sort();
  if (!files.length) {
    console.error("No .js files in " + srcDir);
    process.exit(1);
  }

  const tags = [];
  const report = [];
  let converted = 0, skipped = 0;

  files.forEach(file => {
    const id = path.basename(file, ".js");
    const name = NAMES[id] || id;
    const outPath = path.join(outDir, id + ".json");

    if (fs.existsSync(outPath) && !force) {
      report.push([name, "exists, left alone", ""]);
      skipped++;
      tags.push({ id, name, file: id + ".json" });
      return;
    }

    const source = fs.readFileSync(path.join(srcDir, file), "utf8");
    const tiers = parse(source);
    if (!tiers.length) {
      report.push([name, "NO GOALS FOUND", "check by hand"]);
      skipped++;
      return;
    }

    const toTier = scaler(tiers);
    const seen = new Set();
    const goals = [];
    tiers.forEach(t => t.goals.forEach(g => {
      const key = g.text.toLowerCase();
      if (!g.text || seen.has(key)) return;
      seen.add(key);
      goals.push({ text: g.text, difficulty: toTier(t.tier), tags: g.tags });
    }));

    const spread = [1, 2, 3, 4, 5].map(d => goals.filter(g => g.difficulty === d).length);
    const out = { name, goals };
    const rules = htmlToLines(extractLiteral(source, "bingoRules"));
    const tips = htmlToLines(extractLiteral(source, "bingoTips"));
    if (rules.length) out.rules = rules;
    if (tips.length) out.tips = tips;
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

    converted++;
    tags.push({ id, name, file: id + ".json" });
    report.push([name, goals.length + " goals", spread.join("/")]);
  });

  const pad = n => (s) => String(s).padEnd(n);
  const w = Math.max(...report.map(r => r[0].length));
  console.log("\n" + pad(w)("GAME") + "  " + pad(18)("RESULT") + "SPREAD 1/2/3/4/5");
  console.log("-".repeat(w + 20 + 16));
  report.forEach(r => console.log(pad(w)(r[0]) + "  " + pad(18)(r[1]) + r[2]));

  // the manifest is what the page reads, so keep it in step automatically
  const manifestPath = path.join(outDir, "index.json");
  let manifest = [];
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (e) { manifest = []; }
  }
  tags.forEach(entry => {
    const existing = manifest.find(m => m.id === entry.id);
    if (existing) { existing.name = entry.name; existing.file = entry.file; }
    else manifest.push(entry);
  });
  manifest.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log("\n" + converted + " converted, " + skipped + " skipped.");
  console.log("Updated " + manifestPath + " — " + manifest.length + " lists.\n");
  console.log("If you open the page over file://, refresh the offline bundle too:");
  console.log("  node tools/build-bundle.js " + outDir + "\n");
  console.log("Then spot-check a few — especially any list whose spread looks");
  console.log("lopsided, since that means the old difficulty tiers didn't map");
  console.log("cleanly onto 1-5.\n");
}

main();
