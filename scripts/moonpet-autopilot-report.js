#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { runMoonpetAutopilotChecks } = require("./moonpet-autopilot-check");

const repoRoot = path.resolve(__dirname, "..");
const reportPath = path.join(repoRoot, "output", "manifests", "moonpet-autopilot-report.json");

function main() {
  const report = runMoonpetAutopilotChecks();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Moonpet autopilot report written to ${path.relative(repoRoot, reportPath).replace(/\\/g, "/")}`);
  console.log(`overall_status=${report.overall_status}`);
  process.exit(report.overall_status === "pass" ? 0 : 1);
}

main();
