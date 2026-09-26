import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts/download-moonpet-front-action-pack.js"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/moonpet-art-factory.yml"), "utf8");
const auditSource = fs.readFileSync(path.join(root, "scripts/audit-moonpet-front-action-pack.js"), "utf8");
const module = await import("./download-moonpet-front-action-pack.js");
const eggManifest = JSON.parse(fs.readFileSync(path.join(root, "data/moonpet-eggyone-stage0-assets.json"), "utf8"));

assert.deepEqual(Object.keys(module.default.REQUIRED_ROLES).sort(), ["front_dance", "front_fight", "front_victory"]);
assert.equal(module.default.CHARACTERS.length, 10);
const eggyone = module.default.CHARACTERS.find((character) => character.name === "EGGYONE");
assert.ok(eggyone, "EGGYONE must be present");
assert.deepEqual(module.default.rolesForCharacter(eggyone), ["front_dance", "front_victory"]);
assert.ok(module.default.CHARACTERS.filter((character) => character.name !== "EGGYONE")
  .every((character) => module.default.rolesForCharacter(character).length === 3));
assert.doesNotMatch(source, /generateBottyFrontAnimations|parseGeneratorArgs|regenerat(?:e|ing)|generating missing/i);
assert.doesNotMatch(source, /method\s*:\s*["']POST["']|\/characters\/.*\/spritesheets/);
assert.match(source, /expected one current sheet/);
assert.match(source, /local_approved_asset/);
assert.match(source, /29 AutoSprite sheets \+ 1 local approved asset/);
assert.match(source, /source_png_path: LOCAL_EGGYONE_FRONT_FIGHT\.source_png_path/);
assert.match(source, /contactEntries\.push\(contactSheetEntryForLocalEggyoneFrontFight\(\)\)/,
  'EGGYONE contact sheet must include pinned local front_fight alongside downloaded actions');
assert.match(source, /requiredContactRoles = character\.name === "EGGYONE" \? Object\.keys\(REQUIRED_ROLES\) : requiredRoles/,
  'contact-sheet build must fail when any required action panel is missing');
assert.equal(module.default.contactSheetEntryForLocalEggyoneFrontFight().id, 'front_fight');
assert.equal(module.default.contactSheetEntryForLocalEggyoneFrontFight().output_png_path, 'img/moonpets/eggyone/front_fight.png');
const eggContactEntries = await module.default.buildContactEntriesForCharacter(eggyone, eggManifest.character_id, [
  { id: 'front_dance', output_png_path: 'tmp/front_dance.png' },
  { id: 'front_victory', output_png_path: 'tmp/front_victory.png' },
]);
assert.deepEqual(eggContactEntries.map((entry) => entry.id).sort(), ['front_dance', 'front_fight', 'front_victory'],
  'EGGYONE pipeline contact-sheet inputs must include dance, victory, and pinned local front_fight');
assert.match(workflow, /- approve-front-actions/);
assert.match(workflow, /if: \$\{\{ env\.FACTORY_PHASE == 'approve-front-actions' \}\}/);
assert.match(workflow, /audit-moonpet-front-action-pack\.js --approve-visual-review --write/);
assert.doesNotMatch(workflow, /elif \[ "\$FACTORY_PHASE" = "download-existing-front-actions" \]; then[\s\S]*front_action_pack/s);
assert.match(auditSource, /review_status: options\.approve \? "approved_visual_review" : asset\.review_status/);
assert.match(auditSource, /if \(options\.approve && failures\.length === 0\)/);
assert.match(auditSource, /validateLocalEggyoneFrontFightAsset/);
assert.match(auditSource, /expected 29 AutoSprite \+ 1 local approved assets/);

console.log("Moonpet front action downloader is strict and generation-free.");
