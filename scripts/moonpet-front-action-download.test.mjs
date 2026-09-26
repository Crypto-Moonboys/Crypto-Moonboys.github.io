import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts/download-moonpet-front-action-pack.js"), "utf8");
const module = await import("./download-moonpet-front-action-pack.js");

assert.deepEqual(Object.keys(module.default.REQUIRED_ROLES).sort(), ["front_dance", "front_fight", "front_victory"]);
assert.equal(module.default.CHARACTERS.length, 10);
assert.ok(module.default.CHARACTERS.every((character) => module.default.rolesForCharacter(character).length === 3));
assert.doesNotMatch(source, /generateBottyFrontAnimations|parseGeneratorArgs|regenerat(?:e|ing)|generating missing/i);
assert.doesNotMatch(source, /method\s*:\s*["']POST["']|\/characters\/.*\/spritesheets/);
assert.match(source, /expected one current sheet/);

console.log("Moonpet front action downloader is strict and generation-free.");
