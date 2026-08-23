// NBG London Graffiti Run - Level 1 debug report

const Level1DebugReport = {
  checks: [
    "scene bootstrap",
    "runtime launch",
    "world runtime",
    "player runtime",
    "entity runtime",
    "collision runtime",
    "hud runtime",
    "render composer"
  ],
  run() {
    return this.checks.map((name) => ({
      system: name,
      status: "pending-runtime-test"
    }));
  }
};

export default Level1DebugReport;
