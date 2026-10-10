/* Local-only portable creator memory editor; no automatic network or storage. */
(function (root) {
  "use strict";
  const M = root.SPARKY_CREATOR_MEMORY;
  const doc = root.document;
  if (!M || !doc) return;
  const $ = (id) => doc.getElementById(id);
  const mount = $("creator-memory-studio");
  if (!mount) return;
  const fields = Array.from(mount.querySelectorAll("[data-memory-field]"));
  const status = $("memory-status");
  const fileInput = $("memory-import-file");
  const preview = $("memory-handoff-preview");
  const details = $("memory-handoff-details");
  const scopeIndex = "https://cryptomoonboys.com/moonboy-canon-index.json";
  let record = M.create({ kind: "creative-project" });
  let dirty = false;
  // Do not infer "new" from blank fields: an imported project can be blank.
  let pristineNewProject = true;
  let latestActivity = "creative-project";
  let generation = 0;

  function updateStatus(message, error = false) {
    status.textContent = message;
    status.setAttribute("data-error", error ? "true" : "false");
  }
  function clearPreview() {
    generation += 1;
    preview.value = "";
    details.open = false;
  }
  function modified(message = "Unsaved changes. Download project JSON to preserve them.") {
    dirty = true;
    pristineNewProject = false;
    clearPreview();
    updateStatus(message);
  }
  function draw() {
    fields.forEach((input) => {
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
      const heading = doc.createElement("strong");
      heading.textContent = title + " (" + record[key].length + ")";
      const small = doc.createElement("small");
      small.textContent = hint;
      section.append(heading, small);
      record[key].forEach((entry, index) => {
        const row = doc.createElement("div");
        row.className = "memory-entry";
        const label = doc.createElement("span");
        label.textContent = entry.text || entry.event ||
          (entry.url ? entry.title + " — " + entry.url : entry.label + " — " + entry.reference);
        const remove = doc.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", "Remove " + key + " entry " + (index + 1));
        remove.addEventListener("click", () => {
          record[key].splice(index, 1);
          draw();
          modified("Entry removed. Download JSON to save the change.");
        });
        row.append(label, remove);
        section.appendChild(row);
      });
      list.appendChild(section);
    }
  }

  fields.forEach((input) => input.addEventListener("input", () => {
    const [category, key] = input.dataset.memoryField.split(".");
    const previous = record[category][key];
    const oldIndex = record.canon.source_index;
    record[category][key] = input.value;
    if (category === "canon" && key === "scope") {
      record.canon.source_index = input.value === "moonboys" ? scopeIndex : "";
    }
    try {
      M.serialize(record);
    } catch (_) {
      record[category][key] = previous;
      record.canon.source_index = oldIndex;
      input.value = previous;
      updateStatus("Project size limit reached. Shorten an entry before editing further.", true);
      return;
    }
    modified();
  }));

  function entryFromInput(kind, value) {
    const time = new Date().toISOString();
    if (kind === "decisions" || kind === "ideas" || kind === "proofs") {
      if (value.length > 2000) throw new Error("This field has a 2,000-character limit.");
      if (kind === "decisions") return { text: value, approved_at: time, source: "Creator approval in Studio" };
      if (kind === "ideas") return { text: value, created_at: time };
      return { text: value, reference: "", status: "unverified" };
    }
    if (kind === "history") {
      if (value.length > 500) throw new Error("History notes are limited to 500 characters.");
      return { event: value, date: time };
    }
    const divider = value.indexOf("|");
    const prefix = divider >= 0 ? value.slice(0, divider).trim() : "";
    const suffix = (divider >= 0 ? value.slice(divider + 1) : value).trim();
    if (!suffix) throw new Error("Enter a non-empty reference after the | separator.");
    if (kind === "assets") {
      if (prefix.length > 160 || suffix.length > 1000)
        throw new Error("Artwork name must be at most 160 characters and file reference at most 1,000.");
      return { label: prefix || "Asset", reference: suffix, status: "reference-only" };
    }
    if (kind === "sources") {
      let url;
      try {
        url = new URL(suffix);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid scheme");
      } catch (_) {
        throw new Error("Enter a full http(s) source URL, optionally preceded by a title and |.");
      }
      const title = prefix || (url.href.length <= 160 ? url.href : "Source link");
      if (title.length > 160 || url.href.length > 2048)
        throw new Error("Source title must be at most 160 characters and the full URL at most 2,048.");
      return { title, url: url.href, category: "external-reference" };
    }
    throw new Error("Unknown entry type.");
  }

  function addEntry(kind) {
    const input = $("memory-add-" + kind);
    const value = input.value.trim();
    if (!value) return updateStatus("Enter an item first.", true);
    if (!Object.prototype.hasOwnProperty.call(record, kind) || !Array.isArray(record[kind]))
      return updateStatus("Unknown entry type.", true);
    if (record[kind].length >= 100) return updateStatus("Maximum 100 items per section.", true);
    let entry;
    try {
      entry = entryFromInput(kind, value);
      record[kind].push(entry);
      // Validate the actual normalised clone as well as the proposed raw item.
      // No successful Add can result in a silently clipped/dropped export.
      const normalised = M.normalise(record);
      const saved = normalised[kind][normalised[kind].length - 1];
      if (normalised[kind].length !== record[kind].length || !saved ||
          (kind === "sources" && (saved.url !== entry.url || saved.title !== entry.title)) ||
          (kind === "assets" && (saved.reference !== entry.reference || saved.label !== entry.label)) ||
          (kind === "history" && saved.event !== entry.event) ||
          (["decisions", "ideas", "proofs"].includes(kind) && saved.text !== entry.text)) {
        throw new Error("The entry would change during export. Check its length and characters.");
      }
      M.serialize(record);
    } catch (error) {
      // Only a new entry was added above; leave existing work unchanged.
      if (entry && record[kind][record[kind].length - 1] === entry) record[kind].pop();
      return updateStatus(error.message, true);
    }
    input.value = "";
    draw();
    modified("Entry added. Download JSON to preserve it.");
  }

  mount.querySelectorAll("[data-memory-add]").forEach((button) =>
    button.addEventListener("click", () => addEntry(button.dataset.memoryAdd))
  );
  function download(content, filename, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = doc.createElement("a");
    link.href = url;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("memory-new").addEventListener("click", () => {
    if (dirty && !root.confirm("Discard unsaved edits? Export your current JSON first if you need it.")) return;
    record = M.create({ kind: latestActivity, scope: latestActivity === "moonboy" ? "moonboys" : "independent" });
    dirty = false;
    pristineNewProject = true;
    clearPreview();
    draw();
    updateStatus("New project started. Download JSON to save it.");
  });
  $("memory-export-json").addEventListener("click", () => {
    try {
      download(M.serialize(record), M.filename(record, "json"), "application/json");
      dirty = false;
      updateStatus("JSON downloaded. Further edits will require a new download.");
    } catch (error) { updateStatus(error.message, true); }
  });
  $("memory-export-md").addEventListener("click", () => {
    try {
      download(M.markdown(record), M.filename(record, "md"), "text/markdown");
      updateStatus("Readable Markdown downloaded. Keep the JSON to re-import.");
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
      if (dirty && !root.confirm("Replace current unsaved project with " +
        (imported.project.title || "this imported project") + "?")) return;
      record = imported;
      dirty = false;
      pristineNewProject = false;
      clearPreview();
      draw();
      updateStatus("Imported locally. Referenced artwork files are not attached.");
    } catch (error) { updateStatus(error.message, true); }
  });
  $("memory-copy-handoff").addEventListener("click", async () => {
    clearPreview();
    const generationAtCopy = generation;
    try {
      const handoff = M.handoff(record);
      preview.value = handoff;
      details.open = true;
      if (!root.navigator?.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await root.navigator.clipboard.writeText(handoff);
      if (generationAtCopy === generation)
        updateStatus("AI handoff copied. Paste it into your AI chat. No private data was put in a link.");
    } catch (error) {
      if (preview.value && generationAtCopy === generation) {
        preview.focus();
        preview.select();
        updateStatus("Clipboard unavailable. Manually copy the selected handoff text.");
      } else if (generationAtCopy === generation) updateStatus(error.message, true);
    }
  });
  root.addEventListener("sparky-activity-change", (event) => {
    latestActivity = event.detail?.id || "creative-project";
    $("memory-current-activity").textContent = event.detail?.title || "Creative project";
    if (!pristineNewProject) return;
    record.project.kind = latestActivity;
    record.canon.scope = latestActivity === "moonboy" ? "moonboys" : "independent";
    record.canon.source_index = record.canon.scope === "moonboys" ? scopeIndex : "";
    clearPreview();
    draw();
    updateStatus("Activity selected for the new project. Download JSON to keep this selection.");
    dirty = true;
  });
  draw();
  updateStatus("Nothing is uploaded or saved automatically. Download JSON to keep your project.");
})(window);
