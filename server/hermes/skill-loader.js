"use strict";

function getSkillLoaderStatus() {
  return {
    ok: false,
    status: "missing",
    loader: "server/hermes/skill-loader.js",
    message: "Hermes skills runtime is not implemented yet in this repository."
  };
}

module.exports = {
  getSkillLoaderStatus
};
