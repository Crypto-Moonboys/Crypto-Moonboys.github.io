"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { HERMES_DATA_ROOT } = require("./config.js");

const SKILLS_DIR = path.join(HERMES_DATA_ROOT, "skills");

function ensureSkillsDir() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

function parseSkillSections(markdown) {
  const text = String(markdown || "");
  const lines = text.split(/\r?\n/u);
  const sections = {};
  let current = "overview";
  sections[current] = [];
  for (const line of lines) {
    const h = line.match(/^##\s+(.+)$/u);
    if (h) {
      current = h[1].trim().toLowerCase();
      if (!sections[current]) sections[current] = [];
      continue;
    }
    sections[current].push(line);
  }
  const pick = (name) => (sections[name] || []).join("\n").trim();
  return {
    whenToUse: pick("when to use it"),
    filesToInspect: pick("files to inspect"),
    commandsToRun: pick("commands/tests to run"),
    doNotTouch: pick("what not to touch"),
    rollbackNotes: pick("rollback notes"),
    successCriteria: pick("success criteria")
  };
}

function listSkills() {
  ensureSkillsDir();
  const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".skill.md"));
  return files.map((file) => {
    const fullPath = path.join(SKILLS_DIR, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    return {
      id: file.replace(/\.skill\.md$/u, ""),
      file,
      path: fullPath,
      ...parseSkillSections(raw)
    };
  });
}

function getSkillLoaderStatus() {
  const skills = listSkills();
  return {
    ok: true,
    status: "ready",
    loader: "server/hermes/skill-loader.js",
    skillsCount: skills.length,
    skills
  };
}

module.exports = {
  SKILLS_DIR,
  listSkills,
  getSkillLoaderStatus
};
