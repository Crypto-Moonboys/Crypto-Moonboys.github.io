"use strict";

function normalizePrompt(prompt) {
  return String(prompt || "").trim();
}

function matchAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifyOwnerCommand(prompt) {
  const text = normalizePrompt(prompt);
  const lower = text.toLowerCase();
  if (!text) {
    return {
      intent: "unknown",
      confidence: "low",
      toolPath: "",
      nextAction: "Ask for an owner command.",
      requiresSandbox: false,
      requiresApproval: false
    };
  }

  const rules = [
    {
      intent: "capability",
      confidence: "high",
      toolPath: "hermes/capabilities",
      nextAction: "Return deterministic Hermes identity/capability grounding.",
      requiresSandbox: false,
      requiresApproval: false,
      patterns: [
        /^(who are you|what are you|do you know what you are|what tools do you have|what can you do)/iu,
        /\b(can you edit\/create websites?|can you websearch)\b/iu,
        /^read all your files,\s*understand the power you have to solve,\s*fix and create,\s*and how,\s*and why/iu
      ]
    },
    {
      intent: "repo_audit",
      confidence: "high",
      toolPath: "repo/audit",
      nextAction: "Run structured code audit over indexed files and report findings.",
      requiresSandbox: false,
      requiresApproval: false,
      patterns: [/\b(read repo for code bugs|scan repo for bugs|check repo health|audit codebase|find broken files)\b/iu]
    },
    {
      intent: "repo_search",
      confidence: "high",
      toolPath: "repo/search",
      nextAction: "Run repository index search.",
      requiresSandbox: false,
      requiresApproval: false,
      patterns: [/\b(search the repo|repo search|find in repo)\b/iu]
    },
    {
      intent: "file_read",
      confidence: "medium",
      toolPath: "file/read",
      nextAction: "Read an explicit path-like file target.",
      requiresSandbox: false,
      requiresApproval: false,
      patterns: [/^read\s+/iu]
    },
    {
      intent: "website_build",
      confidence: "high",
      toolPath: "swarm/pipeline",
      nextAction: "Create website swarm plan and execution pipeline.",
      requiresSandbox: true,
      requiresApproval: false,
      patterns: [/\b(rebuild the whole website|fix admin page|fix the admin page|website|site)\b/iu]
    },
    {
      intent: "game_build",
      confidence: "high",
      toolPath: "swarm/pipeline",
      nextAction: "Create Bomber Royale build plan and pipeline.",
      requiresSandbox: true,
      requiresApproval: false,
      patterns: [/\b(build my 2 player bomber royale game|build my 2-player bomber royale game|bomber royale|block-?topia|colyseus)\b/iu]
    },
    {
      intent: "test_run",
      confidence: "high",
      toolPath: "command/run",
      nextAction: "Prepare approved test execution path.",
      requiresSandbox: false,
      requiresApproval: true,
      patterns: [/\b(run tests?|npm test|test run)\b/iu]
    },
    {
      intent: "websearch",
      confidence: "high",
      toolPath: "webcrawl/*",
      nextAction: "Route to webcrawl search/fetch actions.",
      requiresSandbox: false,
      requiresApproval: false,
      patterns: [/\b(websearch|search web|find new updates|crawl|rss|fetch url)\b/iu]
    },
    {
      intent: "image_generation",
      confidence: "high",
      toolPath: "images/generate",
      nextAction: "Route to image generation with owner approval gate.",
      requiresSandbox: false,
      requiresApproval: true,
      patterns: [/\b(create an image|make an image|stencil|pixel art)\b/iu]
    },
    {
      intent: "animation_code",
      confidence: "high",
      toolPath: "swarm/pipeline",
      nextAction: "Create animation code generation plan.",
      requiresSandbox: true,
      requiresApproval: false,
      patterns: [/\b(animated canvas|sprite|tile animation|animation code)\b/iu]
    },
    {
      intent: "sandbox_job",
      confidence: "high",
      toolPath: "jobs/create",
      nextAction: "Create sandbox job proposal.",
      requiresSandbox: true,
      requiresApproval: false,
      patterns: [/\b(create a sandbox job|sandbox job)\b/iu]
    },
    {
      intent: "pr_workflow",
      confidence: "high",
      toolPath: "github/pr-workflow",
      nextAction: "Route into GitHub PR and review workflow.",
      requiresSandbox: false,
      requiresApproval: true,
      patterns: [/\b(create pr|pull request|copilot review|request(?:\s+pr)?\s+review|ask copilot to review|review this pr)\b/iu]
    },
    {
      intent: "deploy",
      confidence: "medium",
      toolPath: "command/run",
      nextAction: "Prepare deployment command plan with approval.",
      requiresSandbox: false,
      requiresApproval: true,
      patterns: [/\b(deploy|vps|pm2|nginx)\b/iu]
    },
    {
      intent: "memory_skills_settings",
      confidence: "high",
      toolPath: "skills/runtime/repos",
      nextAction: "Return skills/runtime/memory/profile/repo capabilities.",
      requiresSandbox: false,
      requiresApproval: false,
      patterns: [/\b(show skills|load runtime map|show registered repos|memory|settings|profile)\b/iu]
    },
    {
      intent: "brain_npc",
      confidence: "medium",
      toolPath: "brain/api",
      nextAction: "Route to Brain integration path.",
      requiresSandbox: false,
      requiresApproval: false,
      patterns: [/\b(brain|npc)\b/iu]
    }
  ];

  for (const rule of rules) {
    if (matchAny(lower, rule.patterns)) {
      return {
        intent: rule.intent,
        confidence: rule.confidence,
        toolPath: rule.toolPath,
        nextAction: rule.nextAction,
        requiresSandbox: rule.requiresSandbox,
        requiresApproval: rule.requiresApproval
      };
    }
  }

  return {
    intent: "unknown",
    confidence: "low",
    toolPath: "",
    nextAction: "Fallback to Hermes chat with capability grounding.",
    requiresSandbox: false,
    requiresApproval: false
  };
}

module.exports = {
  classifyOwnerCommand
};
