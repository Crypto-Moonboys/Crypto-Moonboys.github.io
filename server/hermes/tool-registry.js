"use strict";

const TOOL_REGISTRY = Object.freeze([
  Object.freeze({ key: "repo_files", label: "repo/files", routes: ["/api/hermes/repos", "/api/hermes/files/list", "/api/hermes/files/read", "/api/hermes/index/search"] }),
  Object.freeze({ key: "github", label: "github", routes: ["/api/hermes/github/repos", "/api/hermes/github/clone-register", "/api/hermes/github/branch", "/api/hermes/github/commit", "/api/hermes/github/push", "/api/hermes/github/pr", "/api/hermes/github/pr/comment", "/api/hermes/github/pr/request-review", "/api/hermes/github/pr/comments"] }),
  Object.freeze({ key: "patch", label: "patch", routes: ["/api/hermes/patch/preview", "/api/hermes/patch/apply", "/api/hermes/patch/rollback"] }),
  Object.freeze({ key: "command", label: "command", routes: ["/api/hermes/command/run", "/api/hermes/command/queue"] }),
  Object.freeze({ key: "webcrawl", label: "websearch/webcrawl", routes: ["/api/hermes/webcrawl/search", "/api/hermes/webcrawl/find-updates", "/api/hermes/webcrawl/fetch", "/api/hermes/webcrawl/crawl", "/api/hermes/webcrawl/rss"] }),
  Object.freeze({ key: "image_generation", label: "image generation", routes: ["/api/hermes/images/generate"] }),
  Object.freeze({ key: "animated_canvas", label: "animated canvas/code generation", routes: ["/api/hermes/chat", "/api/hermes/patch/preview"] }),
  Object.freeze({ key: "memory", label: "memory", routes: ["/api/hermes/memory", "/api/hermes/memory/merge"] }),
  Object.freeze({ key: "skills", label: "skills", routes: ["/api/hermes/skills"] }),
  Object.freeze({ key: "jobs", label: "jobs", routes: ["/api/hermes/jobs", "/api/hermes/jobs/create", "/api/hermes/jobs/:id/run", "/api/hermes/jobs/:id/test", "/api/hermes/jobs/:id/repair", "/api/hermes/jobs/:id/create-pr"] }),
  Object.freeze({ key: "brain", label: "brain", routes: ["/api/brain/status", "/api/brain/chat", "/api/brain/model"] })
]);

function getToolRegistry() {
  return TOOL_REGISTRY.map((item) => ({ ...item, routes: item.routes.slice() }));
}

function listToolLabels() {
  return TOOL_REGISTRY.map((item) => item.label);
}

module.exports = {
  TOOL_REGISTRY,
  getToolRegistry,
  listToolLabels
};
