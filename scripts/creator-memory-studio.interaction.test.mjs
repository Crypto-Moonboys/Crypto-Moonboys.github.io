import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Blob } from "node:buffer";
import { TextEncoder } from "node:util";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function studio() {
  const downloads = [];
  const blobs = new Map();
  const copied = [];
  const listeners = new Map();
  let shouldFailClipboard = false;
  let allowConfirm = true;
  let nextBlob = 0;
  class FakeElement {
    constructor(tag = "div", id = "") {
      this.tagName = tag;
      this.id = id;
      this.dataset = {};
      this.children = [];
      this.value = "";
      this.files = [];
      this.open = false;
      this.textContent = "";
      this.attrs = {};
      this.listeners = new Map();
    }
    addEventListener(event, fn) { this.listeners.set(event, fn); }
    trigger(event, details = {}) {
      return this.listeners.get(event)?.({ target: this, ...details });
    }
    click() {
      if (this.tagName === "a") {
        downloads.push({ filename: this.download, blob: blobs.get(this.href) });
        return;
      }
      return this.trigger("click");
    }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); return node; }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    remove() {}
    focus() { this.focused = true; }
    select() { this.selected = true; }
  }
  const ids = [
    "creator-memory-studio", "memory-status", "memory-import-file",
    "memory-handoff-preview", "memory-handoff-details", "memory-entries",
    "memory-current-activity", "memory-new", "memory-import",
    "memory-export-json", "memory-export-md", "memory-copy-handoff"
  ];
  const kinds = ["decisions", "ideas", "sources", "assets", "proofs", "history"];
  const fields = [
    "project.title", "project.kind", "project.summary", "project.next_action",
    "identity.voice", "identity.visual_style", "identity.themes", "identity.boundaries",
    "canon.scope", "canon.notes"
  ].map((name) => {
    const el = new FakeElement("input");
    el.dataset.memoryField = name;
    return el;
  });
  const addButtons = kinds.map((kind) => {
    const b = new FakeElement("button");
    b.dataset.memoryAdd = kind;
    return b;
  });
  const nodes = Object.fromEntries(ids.map((id) => [id, new FakeElement("div", id)]));
  kinds.forEach((kind) => {
    nodes["memory-add-" + kind] = new FakeElement("input");
  });
  nodes["creator-memory-studio"].querySelectorAll = (selector) =>
    selector === "[data-memory-field]" ? fields :
    selector === "[data-memory-add]" ? addButtons : [];
  const document = {
    getElementById: (id) => nodes[id] || null,
    createElement: (tag) => new FakeElement(tag),
    body: new FakeElement("body")
  };
  class TestURL extends URL {
    static createObjectURL(blob) {
      const key = "blob:test/" + ++nextBlob;
      blobs.set(key, blob);
      return key;
    }
    static revokeObjectURL() {}
  }
  const window = {
    document,
    navigator: { clipboard: { writeText: async (text) => {
      if (shouldFailClipboard) throw new Error("blocked clipboard");
      copied.push(text);
    } } },
    confirm: () => allowConfirm,
    setTimeout: (fn) => fn(),
    addEventListener: (name, handler) => listeners.set(name, handler),
    emit: (name, detail) => listeners.get(name)?.({ detail })
  };
  const context = { window, URL: TestURL, TextEncoder, Blob };
  vm.runInNewContext(read("js/creator-memory.js"), context, { filename: "creator-memory.js" });
  vm.runInNewContext(read("js/creator-memory-studio.js"), context, { filename: "creator-memory-studio.js" });

  const M = window.SPARKY_CREATOR_MEMORY;
  const byField = (name) => fields.find((field) => field.dataset.memoryField === name);
  const add = (kind, value) => {
    nodes["memory-add-" + kind].value = value;
    return addButtons[kinds.indexOf(kind)].click();
  };
  const exportJSON = async () => {
    nodes["memory-export-json"].click();
    const last = downloads.at(-1);
    assert.ok(last?.filename.endsWith(".json"), "Expected a saved JSON download");
    return JSON.parse(await last.blob.text());
  };
  const importJSON = async (pack) => {
    const content = JSON.stringify(pack);
    nodes["memory-import-file"].files = [{
      size: Buffer.byteLength(content),
      text: async () => content
    }];
    await nodes["memory-import-file"].trigger("change");
  };
  return {
    M, fields, byField, nodes, window, downloads, copied, add, exportJSON, importJSON,
    setClipboardFails: (flag) => { shouldFailClipboard = flag; },
    setConfirm: (flag) => { allowConfirm = flag; }
  };
}

test("activity events affect only pristine new projects, never imported blank projects", async () => {
  const s = studio();
  s.window.emit("sparky-activity-change", { id: "moonboy", title: "Create Moonboy" });
  let pack = await s.exportJSON();
  assert.equal(pack.canon.scope, "moonboys");

  const imported = s.M.create({ title: "", kind: "custom", scope: "other" });
  imported.project.summary = "An intentionally untitled imported world";
  imported.identity.visual_style = "Clouds";
  await s.importJSON(imported);
  s.window.emit("sparky-activity-change", { id: "moonboy", title: "Create Moonboy" });
  pack = await s.exportJSON();
  assert.equal(pack.project.kind, "custom");
  assert.equal(pack.canon.scope, "other");
  assert.equal(pack.project.summary, "An intentionally untitled imported world");
  assert.equal(pack.identity.visual_style, "Clouds");
});

test("editing after download marks changes unsaved and clears private old handoffs", async () => {
  const s = studio();
  const title = s.byField("project.title");
  title.value = "My First Project";
  title.trigger("input");
  assert.match(s.nodes["memory-status"].textContent, /Unsaved changes/);

  await s.exportJSON();
  assert.match(s.nodes["memory-status"].textContent, /JSON downloaded/);
  await s.nodes["memory-copy-handoff"].click();
  assert.ok(s.nodes["memory-handoff-preview"].value.includes("My First Project"));
  assert.equal(s.nodes["memory-handoff-details"].open, true);

  const voice = s.byField("identity.voice");
  voice.value = "Street voice";
  voice.trigger("input");
  assert.match(s.nodes["memory-status"].textContent, /Unsaved changes/);
  assert.equal(s.nodes["memory-handoff-preview"].value, "");
  assert.equal(s.nodes["memory-handoff-details"].open, false);

  s.add("ideas", "Draft piece");
  await s.nodes["memory-copy-handoff"].click();
  assert.ok(s.nodes["memory-handoff-preview"].value.includes("Draft piece"));
  const remove = s.nodes["memory-entries"].children[1].children.find((node) => node.className === undefined ? false : node.className === "memory-entry");
  assert.ok(remove, "Draft idea should render a Remove control");
  remove.children[1].click();
  assert.equal(s.nodes["memory-handoff-preview"].value, "");
  assert.equal(s.nodes["memory-handoff-details"].open, false);
  s.nodes["memory-new"].click();
  const current = await s.exportJSON();
  assert.equal(current.project.title, "");
  assert.equal(current.ideas.length, 0);
});

test("validated composite source and file references cannot silently disappear or shrink", async () => {
  const s = studio();
  s.add("sources", "T".repeat(161) + " | https://example.com/");
  assert.match(s.nodes["memory-status"].textContent, /at most 160/);
  s.add("sources", "Title | https://example.com/" + "z".repeat(2050));
  assert.match(s.nodes["memory-status"].textContent, /at most 160|at most 2,048/);
  s.add("sources", "A source | https://example.com/reference");
  s.add("assets", "Artwork |");
  assert.match(s.nodes["memory-status"].textContent, /non-empty reference/);
  s.add("assets", "Big work | " + "a".repeat(1001));
  assert.match(s.nodes["memory-status"].textContent, /at most 1,000/);
  s.add("assets", "Original | original.png");
  const pack = await s.exportJSON();
  assert.equal(pack.sources.length, 1);
  assert.equal(pack.sources[0].title, "A source");
  assert.equal(pack.sources[0].url, "https://example.com/reference");
  assert.equal(pack.assets.length, 1);
  assert.equal(pack.assets[0].label, "Original");
  assert.equal(pack.assets[0].reference, "original.png");
});

test("import and new project clear stale manual handoff; clipboard fallback stays usable", async () => {
  const s = studio();
  s.byField("project.title").value = "Private Old";
  s.byField("project.title").trigger("input");
  await s.nodes["memory-copy-handoff"].click();
  assert.ok(s.nodes["memory-handoff-preview"].value.includes("Private Old"));
  const pack = s.M.create({ title: "New imported project" });
  s.setConfirm(true);
  await s.importJSON(pack);
  assert.equal(s.nodes["memory-handoff-preview"].value, "");
  assert.equal(s.nodes["memory-handoff-details"].open, false);

  s.setClipboardFails(true);
  await s.nodes["memory-copy-handoff"].click();
  assert.ok(s.nodes["memory-handoff-preview"].value.includes("New imported project"));
  assert.equal(s.nodes["memory-handoff-preview"].selected, true);
  assert.match(s.nodes["memory-status"].textContent, /Clipboard unavailable/);
  s.nodes["memory-new"].click();
  assert.equal(s.nodes["memory-handoff-preview"].value, "");
  assert.equal(s.nodes["memory-handoff-details"].open, false);
});

test("HTML add-rows use one label per input and a sibling button", () => {
  const page = read("gpt-users.html");
  for (const kind of ["decisions", "ideas", "sources", "assets", "proofs", "history"]) {
    const row = page.match(new RegExp('<div class="memory-add-item">([\\s\\S]*?)</div>', "g"))
      ?.find((html) => html.includes('id="memory-add-' + kind + '"'));
    assert.ok(row, "Missing " + kind + " add-row");
    assert.match(row, new RegExp('<label for="memory-add-' + kind + '">[^<]+</label>'));
    assert.match(row, new RegExp('<button[^>]+data-memory-add="' + kind + '"'));
    assert.doesNotMatch(row, /<label[^>]*>[^]*?<button/);
  }
});
