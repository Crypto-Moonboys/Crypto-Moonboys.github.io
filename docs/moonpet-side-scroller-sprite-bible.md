# Moonpet Side-Scroller Sprite Bible

This document converts the attached `Crypto Moonboys Pets - Side-Scroller Sprite Bible V1.0` artwork into production rules for Moonpet gameplay assets.

## Base Character

The base Moonbot is a glossy white cyber pet with a large rounded helmet/head, small soft body, rounded arms, chunky feet, and a black glass visor with pink LED eyes. The primary gameplay silhouette is side-view. Side-left and side-right are production poses; front and back are reference poses only.

The body should feel like a cute collectible pet mascot: simple, readable, high contrast, game ready, and expressive without becoming realistic or overly detailed.

## Production Rules

- Current runtime direction is 2D side-scroller.
- All gameplay animations must be side-view compatible.
- Use left/right sprite logic; mirror where appropriate.
- Do not build new down-facing/isometric gameplay assets for the current runtime.
- Old isometric sheets are reference only.
- Generate, review, promote, then integrate.
- Keep every sheet consistent in size, frame count, framing, ground line, and silhouette.

## Face / Visor Expressions

Expressions live on the black visor and should remain readable in side-view:

- Default: pink LED dot eyes.
- Happy: curved smiling LED eyes.
- Excited: energetic curved LED eyes.
- Sad: low/downturned pink LEDs.
- Angry: sharp angled pink LEDs.
- Sleepy: relaxed half-lidded LEDs.
- Love: heart-shaped LED eyes.
- Surprised: alert/exclamation-style expression.
- Cool: flat confident visor expression.
- Wink: one eye closed, one bright eye.
- Glitch: broken pixel streaks and scanline noise.

Expressions must work for both left-facing and right-facing sprites.

## Animation States

The first side-scroller queue covers:

- Idle: calm breathing or small idle bounce.
- Walk: readable side-view walk cycle.
- Run: faster side-view stride with motion clarity.
- Jump: upward hop with squash/stretch allowed.
- Eat: snack or food interaction while staying side-view.
- Sleep: curled side-view sleeping pose with subtle breathing.
- Play: toy/ball interaction while staying on the side-view ground line.
- Clean: bubbles or cleaning motion, no background.
- Train: non-combat exercise motion such as small dumbbells.
- Hurt: dizzy or stunned side-view pet state.

The old `attack` direction remains rejected for the previous isometric pack and is not part of this side-scroller base plan.

## Outfits / Bodies

Outfits must keep the same side-view silhouette and proportions:

- Default
- Street/Graff
- Cyber
- Astro
- Hoodie
- Punk
- Gold
- Zombie
- Samurai
- Ape
- Robot
- Bee

Clothing and bodies should read clearly in profile and should not hide the visor or break the chunky-foot silhouette.

## Hats / Headwear

Headwear must fit the round Moonbot helmet in side-view:

- Snapback
- Bucket
- Beanie
- Hood
- Astro helmet
- Crown
- Horns
- Mohawk
- Bandana
- Headphones
- Goggles
- None

Accessories should align to the side-view head angle and preserve the clean outline.

## Accessories

Side-view accessories can attach to hand, back, neck, or miscellaneous slots:

- Spray can
- Skateboard
- Backpack
- Sling bag
- Chain
- Tag
- Camera
- Boombox
- Pet drone
- Wings
- Cape
- None

Accessories should not add background scenery or text to the sprite sheet.

## Traits / Elements

Elemental themes can affect aura, VFX, accent color, and rarity styling:

- Fire
- Water
- Earth
- Air
- Electric
- Shadow
- Light
- Crystal
- Neon
- Galaxy
- Toxic
- Ice

Element effects must stay modular and should not change the base body proportions.

## Rarity Frames

Rarity frames use neon UI borders:

- Common: white
- Uncommon: green
- Rare: blue
- Epic: magenta/purple
- Legendary: gold

Frames are UI assets, not gameplay animation frames.

## Side-View Environments

Environment examples are gameplay background direction only:

- Rooftop platform for idle.
- Safe house for sleep.
- City streets for play.
- Food stop for eat.

Backgrounds should remain separate from character sprite sheets. Character sheets should stay transparent where possible.

## Consistency Rules

Across all sprites:

- Preserve the glossy white body and black visor with pink LEDs.
- Keep side-view profile readability.
- Use a consistent ground line.
- Keep frame size at 256x256 and sheet size at 1280x1280 for the planned 25-frame format.
- Keep the Moonbot centered and full-body inside each frame.
- Avoid text, scenery, and embedded UI inside character sprite sheets.
- Keep side-left/right gameplay compatible; mirror right-facing sprites when feasible.
