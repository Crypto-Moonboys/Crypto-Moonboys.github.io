/* Local-only creator memory editor for the public SPARKY Studio. */
(function (root) {
  "use strict";
  const M = root.SPARKY_CREATOR_MEMORY;
  const doc = root.document;
  if (!M || !doc) return;
  const $ = id => doc.getElementById(id);
  const mount = $("creator-memory-studio");
  if (!mount) return;
  const fields = Array.from(mount.querySelectorAll("[data-memory-field]"));
  const status = $("memory-status");
  const fileInput = $("memory-import-file");
  const preview = $("memory-handoff-preview");
  let record = M.create({ kind: "creative-project" });
  let dirty = false;
  let latestActivity = "creative-project";

  function updateStatus(message, error = false) {
    status.textContent = message;
    status.setAttribute("data-error", error ? "true" : "false");
  }
  function draw() {
    fields.forEach(input => {
      const [category, key] = input.dataset.memoryField.split(".");
      input.value = record[category][key] || "";
    });
    const list = $("memory-entries");
    list.replaceChildren();
    const sections = [
      ["decisions", "Approved decisions", "Creator-approved, not independently verified"],
      ["ideas", "Unapproved ideas", "Proposals and experiments"],
      ["sources", "Source links", "References are not automatically trusted"],
      ["assets", "Artwork and file references", "Referenced files are not bundled"],
      ["proofs", "Unverified proof notes", "Documented assertions, not automatic proof"],
      ["history", "History notes", "Imported entries are user-supplied; review before sharing"]
    ];
    for (const [key, title, hint] of sections) {
      const section = doc.createElement("div");
      const heading = doc.createElement("strong"); heading.textContent = title + " (" + record[key].length + ")";
      const small = doc.createElement("small"); small.textContent = hint;
      section.append(heading, small);
      record[key].forEach((entry, index) => {
        const row = doc.createElement("div"); row.className = "memory-entry";
        const label = doc.createElement("span");
        label.textContent = entry.text || entry.event || (entry.url ? entry.title + " — " + entry.url : entry.label + " — " + entry.reference);
        const remove = doc.createElement("button");
        remove.type = "button"; remove.textContent = "Remove";
        remove.setAttribute("aria-label", "Remove " + key + " entry " + (index + 1));
        remove.addEventListener("click", () => {
          record[key].splice(index, 1); dirty = true; draw(); updateStatus("Entry removed. Export JSON to save the change.");
        });
        row.append(label, remove); section.appendChild(row);
      });
      list.appendChild(section);
    }
  }
  fields.forEach(input => input.addEventListener("input", () => {
    const [category, key] = input.dataset.memoryField.split(".");
    const previous = record[category][key];
    const oldIndex = record.canon.source_index;
    record[category][key] = input.value;
    if (category === "canon" && key === "scope") {
      record.canon.source_index = input.value === "moonboys" ? "https://cryptomoonboys.com/moonboy-canon-index.json" : "";
    }
    try {
      M.serialize(record);
    } catch (error) {
      record[category][key] = previous;
      record.canon.source_index = oldIndex;
      input.value = previous;
      updateStatus("Project size limit reached. Download your current JSON or shorten an entry.", true);
      return;
    }
    dirty = true;
  }));
  function addEntry(kind) {
    const input = $("memory-add-" + kind);
    const value = input.value.trim();
    if (!value) return updateStatus("Enter an item first.", true);
    if (record[kind].length >= 100) return updateStatus("Maximum 100 items per section.", true);
    const snapshot = JSON.stringify(record);
    const now = new Date().toISOString();
    if (kind === "history") record.history.push({ event: value, date: now });
    if (kind === "decisions") record.decisions.push({ text: value, approved_at: now, source: "Creator approval in Studio" });
    if (kind === "ideas") record.ideas.push({ text: value, created_at: now });
    if (kind === "proofs") record.proofs.push({ text: value, reference: "", status: "unverified" });
    if (kind === "sources") {
      const parts = value.split("|").map(x => x.trim());
      const url = parts.length > 1 ? parts.slice(1).join("|") : parts[0];
      const title = parts.length > 1 ? parts[0] : url;
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad scheme");
        record.sources.push({ title, url: parsed.href, category: "external-reference" });
      } catch (_) { return updateStatus("Use a full http(s) source URL, optionally preceded by a title and |.", true); }
    }
    if (kind === "assets") {
      const parts = value.split("|").map(x => x.trim());
      const reference = parts.length > 1 ? parts.slice(1).join("|") : parts[0];
      record.assets.push({ label: parts.length > 1 ? parts[0] : "Asset", reference, status: "reference-only" });
    }
    try {
      M.serialize(record);
    } catch (error) {
      record = JSON.parse(snapshot);
      updateStatus("Project is too large to export. Item not added; shorten it or remove older items.", true);
      return;
    }
    input.value = ""; dirty = true; draw(); updateStatus("Added to this session. Download JSON to preserve it.");
  }
  mount.querySelectorAll("[data-memory-add]").forEach(button => button.addEventListener("click", () => addEntry(button.dataset.memoryAdd)));
  function download(content, filename, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = doc.createElement("a"); link.href = url; link.download = filename;
    doc.body.appendChild(link); link.click(); link.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("memory-new").addEventListener("click", () => {
    if (dirty && !root.confirm("Discard unsaved edits? Export your current JSON first if you need it.")) return;
    record = M.create({ kind: latestActivity, scope: latestActivity === "moonboy" ? "moonboys" : "independent" });
    dirty = false; draw(); updateStatus("New project started. Give it a name and download JSON to save.");
  });
  $("memory-export-json").addEventListener("click", () => {
    try {
      download(M.serialize(record), M.filename(record, "json"), "application/json");
      dirty = false; updateStatus("JSON downloaded. This is your re-importable project record.");
    } catch (error) { updateStatus(error.message, true); }
  });
  $("memory-export-md").addEventListener("click", () => {
    try {
      download(M.markdown(record), M.filename(record, "md"), "text/markdown");
      updateStatus("Markdown downloaded for reading; keep JSON for re-import.");
    } catch (error) { updateStatus(error.message, true); }
  });
  $("memory-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    if (file.size > M.MAX_BYTES) return updateStatus("File exceeds 256 KB.", true);
    try {
      const imported = M.parse(await file.text());
      M.serialize(imported);
      if (dirty && !root.confirm("Replace current unsaved project with " + (imported.project.title || "this imported project") + "?")) return;
      record = imported; dirty = false; draw();
      updateStatus("Imported locally. Files referenced in the pack are not attached. Export JSON after edits.");
    } catch (error) { updateStatus(error.message, true); }
  });
  $("memory-copy-handoff").addEventListener("click", async () => {
    preview.value = "";
    try {
      const text = M.handoff(record);
      preview.value = text; $("memory-handoff-details").open = true;
      if (!root.navigator?.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await root.navigator.clipboard.writeText(text);
      updateStatus("AI handoff copied. Paste into ChatGPT or another AI. No private data was added to a link.");
    } catch (error) {
      if (preview.value) {
        preview.focus(); preview.select();
        updateStatus("Clipboard unavailable. Copy the selected text manually; paste it into your AI chat.");
      } else updateStatus(error.message, true);
    }
  });
  $("memory-copy-handoff").addEventListener("keydown", () => { preview.value = ""; });
  root.addEventListener("sparky-activity-change", event => {
    latestActivity = event.detail?.id || "creative-project";
    $("memory-current-activity").textContent = event.detail?.title || "Creative project";
    if (!dirty && !record.project.title && record.decisions.length === 0 && record.ideas.length === 0) {
      record.project.kind = latestActivity;
      record.canon.scope = latestActivity === "moonboy" ? "moonboys" : "independent";
      record.canon.source_index = latestActivity === "moonboy" ? "https://cryptomoonboys.com/moonboy-canon-index.json" : "";
      draw();
    }
  });
  draw();
  updateStatus("Nothing is uploaded or saved automatically. Download the JSON to keep your work.");
})(window);
