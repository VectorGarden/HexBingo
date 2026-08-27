#!/usr/bin/env node
/**
 * Assemble the directory that gets published.
 *
 *   node tools/build-site.js [outDir]
 *
 * With a branch deploy the whole repo was the site. Under GitHub Actions the
 * artifact *is* the site, so anything missing here is a 404 — and a missing
 * CNAME silently drops the custom domain on the next deploy. Hence an explicit
 * allowlist that fails loudly rather than a copy of whatever happens to exist.
 */

import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "_site";

/** Every one of these must exist, or the deploy is not shippable. */
const REQUIRED = [
  "index.html",
  "404.html",
  "hexbingo.css",
  "CNAME",              // drop this and the custom domain goes with it
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  "favicon.ico",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "og.png"
];

/** Directories copied whole. */
const DIRS = ["src", "goals"];

/** Kept out: nothing here is fetched by a visitor. */
const EXCLUDED = ["test", "tools", "node_modules", ".github", "README.md",
  "package.json", "package-lock.json", "jsconfig.json", ".gitignore"];

/**
 * @param {string} from
 * @param {string} to
 * @returns {number} files copied
 */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) n += copyDir(src, dst);
    else { fs.copyFileSync(src, dst); n++; }
  }
  return n;
}

/**
 * @param {string} dir
 * @returns {number} bytes
 */
function sizeOf(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(p) : fs.statSync(p).size;
  }
  return total;
}

const missing = REQUIRED.filter(f => !fs.existsSync(f))
  .concat(DIRS.filter(d => !fs.existsSync(d)));
if (missing.length) {
  console.error("Refusing to build — missing:\n  " + missing.join("\n  "));
  process.exit(1);
}

// CNAME is the one whose absence fails silently in production rather than here
const cname = fs.readFileSync("CNAME", "utf8").trim();
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cname)) {
  console.error("CNAME does not look like a domain: " + JSON.stringify(cname));
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let files = 0;
for (const f of REQUIRED) { fs.copyFileSync(f, path.join(outDir, f)); files++; }
for (const d of DIRS) files += copyDir(d, path.join(outDir, d));

for (const name of EXCLUDED) {
  if (fs.existsSync(path.join(outDir, name))) {
    console.error("Excluded path leaked into the artifact: " + name);
    process.exit(1);
  }
}

const kb = Math.round(sizeOf(outDir) / 1024);
console.log(`${outDir}: ${files} files, ${kb} KB — serving ${cname}`);
