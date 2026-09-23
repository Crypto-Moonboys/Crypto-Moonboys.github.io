#!/usr/bin/env node

const assert = require("node:assert/strict");
const {
  findQueueItem,
  validateQueueItem,
  validatePromotionTarget,
  buildSpritesheetPayload
} = require("./generate-moonpet-custom-animation");

function makeQueueItem(overrides = {}) {
  return {
    id: "custom_sleep",
    role: "custom_sleep",
    source_character_name: "MOONBOT PET VISOR V1",
    status: "planned",
    approved: false,
    custom_required: true,
    prompt: "MOONBOT PET VISOR V1 sleeping peacefully in isometric down view, transparent background, no text.",
    output_expectations: {
      frame_count: 25,
      frame_size: 256,
      sheet_size: { w: 1280, h: 1280 }
    },
    promotion_target: {
      sheet_path: "/img/moonpets/moonbot-pet-visor-v1/custom_sleep.png",
      atlas_path: "/img/moonpets/moonbot-pet-visor-v1/custom_sleep.json"
    },
    ...overrides
  };
}

const item = makeQueueItem();
assert.equal(findQueueItem({ items: [item] }, "custom_sleep"), item);
assert.equal(validateQueueItem(item, "custom_sleep"), item);
assert.equal(validatePromotionTarget(item), true);
assert.deepEqual(buildSpritesheetPayload(item), {
  animations: [
    {
      kind: "custom",
      prompt: item.prompt
    }
  ],
  videoTier: "turbo",
  frameCount: 25,
  frameSize: 256,
  removeBg: "ultra"
});

assert.throws(() => validateQueueItem(null, "custom_wave"), /Unknown custom animation id/);
assert.throws(() => validateQueueItem(makeQueueItem({ id: "custom_wave" }), "custom_wave"), /not enabled yet/);
assert.throws(() => validateQueueItem(makeQueueItem({ approved: true }), "custom_sleep"), /approved=false/);
assert.throws(() => validateQueueItem(makeQueueItem({ custom_required: false }), "custom_sleep"), /custom_required=true/);
assert.throws(() => validateQueueItem(makeQueueItem({ role: "attack" }), "custom_sleep"), /rejected attack/);
assert.throws(() => validatePromotionTarget(makeQueueItem({
  promotion_target: {
    sheet_path: "/output/moonpets/custom/custom_sleep.png",
    atlas_path: "/img/moonpets/moonbot-pet-visor-v1/custom_sleep.json"
  }
})), /promotion targets must be under/);

console.log("generate-moonpet-custom-animation tests passed");
