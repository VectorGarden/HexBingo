/* ============================================================
   HexBingo — goal editor
   Lists you make live in the browser. Download the JSON and drop
   it in goals/ when you want it shipped with the site.
   ============================================================ */

(function () {
  "use strict";

  let HB, el = {}, current = null, currentId = null, isBuiltin = false, pickedDiff = 3;

  function $(id) { return document.getElementById(id); }

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
    const map = HB.store.get(HB.LISTS_KEY) || {};
    map[currentId] = pack(current, currentId);
    HB.store.set(HB.LISTS_KEY, map);
    HB.refreshGames();
    if (HB.state.listId === currentId) HB.rebuild();
  }

  function loadInto(id) {
    const map = HB.store.get(HB.LISTS_KEY) || {};
    if (map[id]) {
      current = HB.normalise(map[id], id);
      currentId = id;
      isBuiltin = false;
      render();
      return;
    }
    const list = HB.lists.load(id);
    current = list ? HB.normalise(list, id) : { id, name: "Untitled", goals: [] };
    currentId = id;
    isBuiltin = true;
    render();
  }

  /* ── list picker ── */

  function refreshPicker(select) {
    const map = HB.store.get(HB.LISTS_KEY) || {};
    const customIds = Object.keys(map);
    el.edList.innerHTML = "";

    if (customIds.length) {
      const g = document.createElement("optgroup");
      g.label = "Yours";
      customIds.forEach(id => g.appendChild(new Option(map[id].name || "Untitled", id)));
      el.edList.appendChild(g);
    }
    if (HB.lists.builtin.length) {
      const g = document.createElement("optgroup");
      g.label = "Included (read-only)";
      HB.lists.builtin.forEach(b => g.appendChild(new Option(b.name, b.id)));
      el.edList.appendChild(g);
    }
    const target = select || currentId ||
      (customIds[0] || (HB.lists.builtin[0] && HB.lists.builtin[0].id));
    if (target) { el.edList.value = target; loadInto(target); }
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
      s.textContent = d + " · " + HB.DIFF[d];
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

    el.edCount.textContent = current.goals.length + " goals" +
      (current.goals.length < 19 ? " — a hex board needs 19" : "");
  }

  function goalRow(goal, index) {
    const li = document.createElement("li");

    const diff = document.createElement("button");
    diff.type = "button";
    diff.className = "g-d";
    diff.textContent = goal.difficulty;
    diff.title = HB.DIFF[goal.difficulty] + " — click to cycle";
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
      if (!goal.text) { current.goals.splice(index, 1); }
      saveCurrent();
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
      b.textContent = d;
      b.title = HB.DIFF[d];
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(d === pickedDiff));
      b.addEventListener("click", () => { pickedDiff = d; renderDiffPicker(); el.edText.focus(); });
      el.edDiff.appendChild(b);
    }
  }

  /* ── adding ── */

  function parseLine(line, fallbackDiff) {
    let text = line.trim();
    if (!text) return null;
    let difficulty = fallbackDiff;

    const prefix = text.match(/^([1-5])\s*[|:.\-–]\s*(.+)$/);
    if (prefix) { difficulty = +prefix[1]; text = prefix[2]; }

    const tags = [];
    text = text.replace(/#([\w-]+)/g, (_, t) => { tags.push(t); return ""; }).trim();
    if (!text) return null;
    return { text, difficulty, tags };
  }

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

  function parseImport(raw) {
    let trimmed = raw.trim();
    if (!trimmed) throw new Error("Nothing to import.");

    // unwrap an exported goals/*.js file back to its JSON payload
    const wrapped = trimmed.match(/HexBingoGoals\s*\(([\s\S]*)\)\s*;?\s*$/);
    if (wrapped) trimmed = wrapped[1].trim();

    // 1. HexBingo JSON, or a bare array
    try {
      const data = JSON.parse(trimmed);
      if (Array.isArray(data)) {
        return {
          name: "Imported list",
          goals: data.map(g => typeof g === "string"
            ? { text: g, difficulty: 3, tags: [] }
            : { text: g.text || g.name || "", difficulty: g.difficulty || 3, tags: g.tags || g.types || [] })
        };
      }
      if (data && data.goals) return data;
    } catch (e) { /* not JSON — fall through */ }

    // 2. Legacy SRL / HexBingo goal script: bingoList[n] = [ {name: "...", types: [...]}, ... ]
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
    if (lines.length) return { name: "Imported list", goals: lines };

    throw new Error("Couldn't find any goals in that.");
  }

  /* ── wiring ── */

  function wire() {
    el.edList.addEventListener("change", () => loadInto(el.edList.value));

    el.edName.addEventListener("change", () => {
      current.name = el.edName.value.trim() || "Untitled";
      saveCurrent();
      refreshPicker(currentId);
    });

    el.edNew.addEventListener("click", () => {
      const id = newId();
      const map = HB.store.get(HB.LISTS_KEY) || {};
      map[id] = { id, name: "New list", goals: [] };
      HB.store.set(HB.LISTS_KEY, map);
      HB.refreshGames();
      currentId = id;
      refreshPicker(id);
      el.edName.focus();
      el.edName.select();
    });

    el.edDuplicate.addEventListener("click", () => {
      if (!current) return;
      const id = newId();
      const map = HB.store.get(HB.LISTS_KEY) || {};
      map[id] = pack({
        name: current.name + " copy",
        goals: current.goals.map(g => ({ ...g, tags: [...g.tags] })),
        rules: current.rules,
        tips: current.tips
      }, id);
      HB.store.set(HB.LISTS_KEY, map);
      HB.refreshGames();
      currentId = id;
      refreshPicker(id);
      msg("Copied — this one is editable.");
    });

    el.edDelete.addEventListener("click", () => {
      if (isBuiltin || !current) return;
      if (!confirm('Delete "' + current.name + '"? This can\'t be undone.')) return;
      const map = HB.store.get(HB.LISTS_KEY) || {};
      delete map[currentId];
      HB.store.set(HB.LISTS_KEY, map);
      HB.refreshGames();
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
      const list = HB.normalise(parsed, id);
      const map = HB.store.get(HB.LISTS_KEY) || {};
      map[id] = pack(list, id);
      HB.store.set(HB.LISTS_KEY, map);
      HB.refreshGames();
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

  function slug(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "goals";
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

  function init() {
    HB = window.HB;
    if (!HB) { setTimeout(init, 40); return; }

    ["edList", "edName", "edNew", "edDuplicate", "edDelete", "edTiers", "edText", "edDiff",
      "edAdd", "edFilter", "edCount", "edBulk", "edImport", "edExport", "edCopy", "edGoals",
      "edPaste", "edPasteBox", "edPasteCancel", "edPasteGo", "edImportBox", "edImportArea",
      "edFile", "edImportCancel", "edImportGo", "edMsg"]
      .forEach(k => { el[k] = $(k); });

    renderDiffPicker();
    wire();

    // open on whatever game is on the board, not whichever list sorts first
    $("editBtn").addEventListener("click", () => {
      if (!current) refreshPicker(HB.state.listId);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
