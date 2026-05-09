"use strict";

const https = require("node:https");

function getGithubToken() {
  return String(process.env.GITHUB_TOKEN || "").trim();
}

function ensureToken() {
  const token = getGithubToken();
  if (!token) {
    throw new Error("Missing required server secret: GITHUB_TOKEN");
  }
  return token;
}

function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const token = ensureToken();
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      hostname: "api.github.com",
      path,
      method,
      headers: {
        "User-Agent": "hermes-operator",
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {})
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const json = raw ? JSON.parse(raw) : {};
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(json);
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${json.message || raw || "request failed"}`));
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function listRepos() {
  return githubRequest("GET", "/user/repos?per_page=100");
}

async function createPullRequest(owner, repo, head, base, title, body = "") {
  return githubRequest("POST", `/repos/${owner}/${repo}/pulls`, { title, head, base, body });
}

async function commentOnPr(owner, repo, issueNumber, body) {
  return githubRequest("POST", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body });
}

async function requestReview(owner, repo, pullNumber, reviewers = []) {
  return githubRequest("POST", `/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, { reviewers });
}

async function readReviewComments(owner, repo, pullNumber) {
  return githubRequest("GET", `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`);
}

module.exports = {
  getGithubToken,
  listRepos,
  createPullRequest,
  commentOnPr,
  requestReview,
  readReviewComments
};
