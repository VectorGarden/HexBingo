/**
 * The in-browser goal editor. Lists you make live in localStorage; Download
 * gives you a file to drop into goals/.
 * @module
 */

import { DIFF, LISTS_KEY } from "../core/constants.js";
import { normalise, parseImport, parseLine, slugify as slug } from "../core/goals.js";
import { lists } from "../app/lists.js";
import { store } from "../app/storage.js";
import { state } from "../app/state.js";

/** @typedef {{onListsChanged: () => void, rebuild: () => void}} EditorHooks */

/** @type {EditorHooks} */
let hooks = { onListsChanged: () => {}, rebuild: () => {} };


let el = {}, current = null, currentId = null, isBuiltin = false, pickedDiff = 3;

function msg(text, isError) {
  el.edMsg.textContent = text || "";
  el.edMsg.classList.toggle("err", !!isError);
  if (text) setTimeout(() => {
    if (el.edMsg.textContent === text) el.edMsg.textContent = "";
  }, 3200);
}

function newId() { return "u_" + Date.now().toString(36); }

/* ── persistence ── */

/* rules and tips are optional and the editor has no UI for them, but they
   ride along through save, duplicate, import and export — dropping them
   silently lost a list's rules the moment you copied it. */
function pack(list, id) {
  const out = { id: id, name: list.name, goals: list.goals };
  if (Array.isArray(list.rules) && list.rules.length) out.rules = list.rules.slice();
  if (Array.isArray(list.tips) && list.tips.length) out.tips = list.tips.slice();
  return out;
}

function saveCurrent() {
  if (!current || isBuiltin) return;
  const map = store.get(LISTS_KEY) || {};
  map[currentId] = pack(current, currentId);
  store.set(LISTS_KEY, map);
  hooks.onListsChanged();
  if (state.listId === currentId) hooks.rebuild();
}

async function loadInto(id) {
  const map = store.get(LISTS_KEY) || {};
  if (map[id]) {
    current = normalise(map[id], id);
    currentId = id;
    isBuiltin = false;
    render();
    return;
  }
  const list = await lists.load(id);
  current = list ? normalise(list, id) : { id, name: "Untitled", goals: [] };
  currentId = id;
  isBuiltin = true;
  render();
}

/* ── list picker ── */

function refreshPicker(select) {
  const map = store.get(LISTS_KEY) || {};
  const customIds = Object.keys(map);
  el.edList.innerHTML = "";

  if (customIds.length) {
    const g = document.createElement("optgroup");
    g.label = "Yours";
    customIds.forEach(id => g.appendChild(new Option(map[id].name || "Untitled", id)));
    el.edList.appendChild(g);
  }
  if (lists.builtin.length) {
    const g = document.createElement("optgroup");
    g.label = "Included (read-only)";
    lists.builtin.forEach(b => g.appendChild(new Option(b.name, b.id)));
    el.edList.appendChild(g);
  }
  const target = select || currentId ||
    (customIds[0] || (lists.builtin[0] && lists.builtin[0].id));
  if (target) { el.edList.value = target; void loadInto(target); }
}

/* ── rendering ── */

function render() {
  if (!current) return;
  el.edName.value = current.name;
  el.edName.disabled = isBuiltin;
  el.edText.disabled = isBuiltin;
  el.edAdd.disabled = isBuiltin;
  el.edDelete.disabled = isBuiltin;
  el.edBulk.disabled = isBuiltin;

  renderTiers();
  renderGoals();

  if (isBuiltin) {
    msg("Included lists are files in goals/ — hit Duplicate to make an editable copy.");
  }
}

function renderTiers() {
  el.edTiers.innerHTML = "";
  for (let d = 1; d <= 5; d++) {
    const n = current.goals.filter(g => g.difficulty === d).length;
    const tier = document.createElement("div");
    tier.className = "tier" + (n < 4 ? " thin" : "");
    tier.innerHTML = "";
    const b = document.createElement("b");
    b.textContent = n;
    const s = document.createElement("span");
    s.textContent = d + " · " + DIFF[d];
    tier.append(b, s);
    tier.title = n < 4
      ? "Thin — boards will repeat goals from this tier"
      : n + " goals at difficulty " + d;
    el.edTiers.appendChild(tier);
  }
}

function renderGoals() {
  const filter = el.edFilter.value.trim().toLowerCase();
  el.edGoals.innerHTML = "";

  const rows = current.goals
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => !filter ||
      g.text.toLowerCase().includes(filter) ||
      g.tags.join(" ").toLowerCase().includes(filter))
    .sort((a, b) => a.g.difficulty - b.g.difficulty || a.i - b.i);

  rows.forEach(({ g, i }) => el.edGoals.appendChild(goalRow(g, i)));

  // the board on screen, not a hardcoded 19 — Size goes up to 61
  const need = (state.geo && state.geo.cells.length) || 19;
  const have = current.goals.length;
  el.edCount.textContent = have + " goals" +
    (have < need ? " — the current board needs " + need : "");
}

function goalRow(goal, index) {
  const li = document.createElement("li");

  const diff = document.createElement("button");
  diff.type = "button";
  diff.className = "g-d";
  diff.textContent = goal.difficulty;
  diff.title = DIFF[goal.difficulty] + " — click to cycle";
  diff.style.color = ["", "#8d869d", "#4db8ff", "#4ade80", "#ff9838", "#ff5a5a"][goal.difficulty];
  diff.disabled = isBuiltin;
  diff.addEventListener("click", () => {
    goal.difficulty = goal.difficulty === 5 ? 1 : goal.difficulty + 1;
    saveCurrent();
    renderTiers();
    renderGoals();
  });

  const text = document.createElement("input");
  text.type = "text";
  text.className = "g-t";
  text.value = goal.text;
  text.readOnly = isBuiltin;
  text.addEventListener("change", () => {
    goal.text = text.value.trim();
    const removed = !goal.text;
    if (removed) current.goals.splice(index, 1);
    saveCurrent();
    if (removed) renderTiers();     // a tier just lost a goal
    renderGoals();
  });

  const tags = document.createElement("input");
  tags.type = "text";
  tags.className = "g-tags";
  tags.placeholder = "tags";
  tags.value = goal.tags.join(", ");
  tags.readOnly = isBuiltin;
  tags.title = "Goals sharing a tag are kept off the same line where possible";
  tags.addEventListener("change", () => {
    goal.tags = tags.value.split(",").map(t => t.trim()).filter(Boolean);
    saveCurrent();
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "g-x";
  del.textContent = "×";
  del.setAttribute("aria-label", "Remove goal");
  del.disabled = isBuiltin;
  del.addEventListener("click", () => {
    current.goals.splice(index, 1);
    saveCurrent();
    renderTiers();
    renderGoals();
  });

  li.append(diff, text, tags, del);
  return li;
}

function renderDiffPicker() {
  el.edDiff.innerHTML = "";
  for (let d = 1; d <= 5; d++) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = String(d);
    b.title = DIFF[d];
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(d === pickedDiff));
    b.addEventListener("click", () => { pickedDiff = d; renderDiffPicker(); el.edText.focus(); });
    el.edDiff.appendChild(b);
  }
}

/* ── adding ── */

function addGoals(items) {
  const existing = new Set(current.goals.map(g => g.text.toLowerCase()));
  let added = 0, skipped = 0;
  items.forEach(g => {
    if (!g) return;
    if (existing.has(g.text.toLowerCase())) { skipped++; return; }
    existing.add(g.text.toLowerCase());
    current.goals.push(g);
    added++;
  });
  saveCurrent();
  renderTiers();
  renderGoals();
  return { added, skipped };
}

/* ── import ── */


/* ── wiring ── */

function wire() {
  el.edList.addEventListener("change", () => void loadInto(el.edList.value));

  el.edName.addEventListener("change", () => {
    current.name = el.edName.value.trim() || "Untitled";
    saveCurrent();
    refreshPicker(currentId);
  });

  el.edNew.addEventListener("click", () => {
    const id = newId();
    const map = store.get(LISTS_KEY) || {};
    map[id] = { id, name: "New list", goals: [] };
    store.set(LISTS_KEY, map);
    hooks.onListsChanged();
    currentId = id;
    refreshPicker(id);
    el.edName.focus();
    el.edName.select();
  });

  el.edDuplicate.addEventListener("click", () => {
    if (!current) return;
    const id = newId();
    const map = store.get(LISTS_KEY) || {};
    map[id] = pack({
      name: current.name + " copy",
      goals: current.goals.map(g => ({ ...g, tags: [...g.tags] })),
      rules: current.rules,
      tips: current.tips
    }, id);
    store.set(LISTS_KEY, map);
    hooks.onListsChanged();
    currentId = id;
    refreshPicker(id);
    msg("Copied — this one is editable.");
  });

  el.edDelete.addEventListener("click", () => {
    if (isBuiltin || !current) return;
    if (!confirm('Delete "' + current.name + '"? This can\'t be undone.')) return;
    const map = store.get(LISTS_KEY) || {};
    delete map[currentId];
    store.set(LISTS_KEY, map);
    hooks.onListsChanged();
    currentId = null;
    refreshPicker();
    msg("List deleted.");
  });

  function submitOne() {
    const parsed = parseLine(el.edText.value, pickedDiff);
    if (!parsed) return;
    const { skipped } = addGoals([parsed]);
    el.edText.value = "";
    el.edText.focus();
    if (skipped) msg("Already in the list.", true);
  }
  el.edAdd.addEventListener("click", submitOne);
  el.edText.addEventListener("keydown", e => { if (e.key === "Enter") submitOne(); });

  el.edFilter.addEventListener("input", renderGoals);

  el.edBulk.addEventListener("click", () => {
    el.edPaste.hidden = !el.edPaste.hidden;
    el.edImportBox.hidden = true;
    if (!el.edPaste.hidden) el.edPasteBox.focus();
  });
  el.edPasteCancel.addEventListener("click", () => { el.edPaste.hidden = true; });
  el.edPasteGo.addEventListener("click", () => {
    const items = el.edPasteBox.value.split("\n").map(l => parseLine(l, pickedDiff)).filter(Boolean);
    const { added, skipped } = addGoals(items);
    el.edPasteBox.value = "";
    el.edPaste.hidden = true;
    msg("Added " + added + " goals" + (skipped ? ", skipped " + skipped + " duplicates" : "") + ".");
  });

  el.edImport.addEventListener("click", () => {
    el.edImportBox.hidden = !el.edImportBox.hidden;
    el.edPaste.hidden = true;
    if (!el.edImportBox.hidden) el.edImportArea.focus();
  });
  el.edImportCancel.addEventListener("click", () => { el.edImportBox.hidden = true; });

  el.edFile.addEventListener("change", () => {
    const file = el.edFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { el.edImportArea.value = String(reader.result); };
    reader.readAsText(file);
  });

  el.edImportGo.addEventListener("click", () => {
    let parsed;
    try { parsed = parseImport(el.edImportArea.value); }
    catch (err) { msg(err.message, true); return; }

    const id = newId();
    const list = normalise(parsed, id);
    const map = store.get(LISTS_KEY) || {};
    map[id] = pack(list, id);
    store.set(LISTS_KEY, map);
    hooks.onListsChanged();
    currentId = id;
    el.edImportArea.value = "";
    el.edImportBox.hidden = true;
    refreshPicker(id);
    msg("Imported " + list.goals.length + " goals.");
  });

  el.edExport.addEventListener("click", () => {
    const name = slug(current.name);
    const blob = new Blob([toFile()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name + ".json";
    document.body.appendChild(a);     // Firefox ignores a click on a detached link
    a.click();
    a.remove();
    // Revoking straight after click() races the download in Firefox and
    // Safari, which may still be reading the blob when the call returns.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    msg("Downloaded. Put it in goals/ and add it to goals/index.json.");
  });

  el.edCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(toFile());
      msg("Copied — paste it into goals/" + slug(current.name) + ".json");
    } catch (e) { msg("Couldn't reach the clipboard — use Download instead.", true); }
  });
}


function toFile() {
  // shape matches goals/<game>.json: name, optional rules/tips, then goals
  const out = { name: current.name };
  if (Array.isArray(current.rules) && current.rules.length) out.rules = current.rules;
  if (Array.isArray(current.tips) && current.tips.length) out.tips = current.tips;
  out.goals = current.goals.map(g => ({ text: g.text, difficulty: g.difficulty, tags: g.tags }));
  return JSON.stringify(out, null, 2) + "\n";
}

/* ── boot ── */

/**
 * @param {EditorHooks} h
 */
export function initEditor(h) {
  hooks = h;

  ["edList", "edName", "edNew", "edDuplicate", "edDelete", "edTiers", "edText", "edDiff",
    "edAdd", "edFilter", "edCount", "edBulk", "edImport", "edExport", "edCopy", "edGoals",
    "edPaste", "edPasteBox", "edPasteCancel", "edPasteGo", "edImportBox", "edImportArea",
    "edFile", "edImportCancel", "edImportGo", "edMsg"]
    .forEach(k => { el[k] = document.getElementById(k); });

  renderDiffPicker();
  wire();

  // open on whatever game is on the board, not whichever list sorts first
  document.getElementById("editBtn").addEventListener("click", () => {
    if (!current) refreshPicker(state.listId);
  });
}
