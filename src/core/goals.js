/**
 * Goal list shapes, normalisation and the parsers that feed the editor.
 * @module
 */

/**
 * @typedef {object} Goal
 * @property {string} text
 * @property {number} difficulty 1–5
 * @property {string[]} tags
 */

/**
 * @typedef {object} GoalList
 * @property {string} id
 * @property {string} name
 * @property {Goal[]} goals
 * @property {string[]} [rules]
 * @property {string[]} [tips]
 */

/**
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Coerce anything list-shaped into a {@link GoalList}: difficulties clamped to
 * 1–5, tags forced to strings, empty goals dropped. `rules` and `tips` survive
 * because a list that loses them loses its Rules button.
 * @param {any} list
 * @param {string} [id]
 * @returns {GoalList}
 */
export function normalise(list, id) {
  const goals = (list.goals || []).map((/** @type {any} */ g) => ({
    text: String(g.text || "").trim(),
    difficulty: Math.min(5, Math.max(1, Math.round(Number(g.difficulty) || 3))),
    tags: Array.isArray(g.tags) ? g.tags.filter(Boolean).map(String) : []
  })).filter((/** @type {Goal} */ g) => g.text);

  /** @type {GoalList} */
  const out = { id: id || list.id, name: list.name || "Untitled", goals };
  if (Array.isArray(list.rules) && list.rules.length) out.rules = list.rules.map(String);
  if (Array.isArray(list.tips) && list.tips.length) out.tips = list.tips.map(String);
  return out;
}

/**
 * Boards want roughly 1.3 goals per hex. Below 1.0 goals repeat outright;
 * between 1.0 and 1.3 the hard tiers run dry and the outer rings flatten.
 * @param {number} cells
 * @returns {{need: number, comfortable: number}}
 */
export function goalBudget(cells) {
  return { need: cells, comfortable: Math.ceil(cells * 1.3) };
}

/**
 * One pasted line. A `3 | ` prefix sets difficulty; `#tag` anywhere becomes a tag.
 * @param {string} line
 * @param {number} fallbackDiff
 * @returns {Goal|null}
 */
export function parseLine(line, fallbackDiff) {
  let text = String(line).trim();
  if (!text) return null;
  let difficulty = fallbackDiff;

  const prefix = text.match(/^([1-5])\s*[|:.\-–]\s*(.+)$/);
  if (prefix) { difficulty = +prefix[1]; text = prefix[2]; }

  /** @type {string[]} */
  const tags = [];
  text = text.replace(/#([\w-]+)/g, (_, t) => { tags.push(t); return ""; }).trim();
  if (!text) return null;
  return { text, difficulty, tags };
}

/**
 * Accepts HexBingo JSON, a bare array of goals or strings, a legacy
 * `bingoList[n] = [...]` script, or one goal per line.
 * @param {string} raw
 * @returns {{name: string, goals: Goal[], rules?: string[], tips?: string[]}}
 */
export function parseImport(raw) {
  let trimmed = String(raw).trim();
  if (!trimmed) throw new Error("Nothing to import.");

  // unwrap a legacy goals/*.js file back to its JSON payload
  const wrapped = trimmed.match(/HexBingoGoals\s*\(([\s\S]*)\)\s*;?\s*$/);
  if (wrapped) trimmed = wrapped[1].trim();

  // 1. HexBingo JSON, or a bare array
  try {
    const data = JSON.parse(trimmed);
    if (Array.isArray(data)) {
      return {
        name: "Imported list",
        goals: data.map((/** @type {any} */ g) => typeof g === "string"
          ? { text: g, difficulty: 3, tags: [] }
          : { text: g.text || g.name || "", difficulty: g.difficulty || 3, tags: g.tags || g.types || [] })
      };
    }
    if (data && data.goals) return data;
  } catch (e) { /* not JSON — fall through */ }

  // 2. Legacy SRL / HexBingo goal script: bingoList[n] = [ {name: "...", types: [...]}, ... ]
  /** @type {Goal[]} */
  const goals = [];
  const blockRe = /bingoList\s*\[\s*(\d+)\s*\]\s*=\s*\[([\s\S]*?)\]\s*;/g;
  let block;
  while ((block = blockRe.exec(trimmed)) !== null) {
    const tier = Math.min(5, Math.max(1, Math.ceil(Number(block[1]) / 5)));
    const body = block[2];
    const entryRe = /\{([^{}]*)\}/g;
    let entry;
    while ((entry = entryRe.exec(body)) !== null) {
      const inner = entry[1];
      const nameMatch = inner.match(/name\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/);
      if (!nameMatch) continue;
      const typesMatch = inner.match(/types\s*:\s*\[([^\]]*)\]/);
      const tags = typesMatch
        ? typesMatch[1].split(",").map(t => t.replace(/['"\s]/g, "")).filter(Boolean)
        : [];
      goals.push({
        text: nameMatch[2].replace(/\\(['"\\])/g, "$1"),
        difficulty: tier,
        tags
      });
    }
  }
  if (goals.length) return { name: "Imported list", goals };

  // 3. Last resort: one goal per line
  const lines = trimmed.split("\n").map(l => parseLine(l, 3)).filter(Boolean);
  if (lines.length) return { name: "Imported list", goals: /** @type {Goal[]} */ (lines) };

  throw new Error("Couldn't find any goals in that.");
}
