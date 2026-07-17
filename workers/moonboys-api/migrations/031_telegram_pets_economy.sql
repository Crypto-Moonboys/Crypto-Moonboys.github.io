-- Crypto Moonboys Pets economy: in-game currencies and equipped upgrades.

ALTER TABLE telegram_pet_profiles
  ADD COLUMN moon_gold INTEGER NOT NULL DEFAULT 0 CHECK (moon_gold >= 0);

ALTER TABLE telegram_pet_profiles
  ADD COLUMN moon_crystals INTEGER NOT NULL DEFAULT 0 CHECK (moon_crystals >= 0);

ALTER TABLE telegram_pet_profiles
  ADD COLUMN style_tokens INTEGER NOT NULL DEFAULT 0 CHECK (style_tokens >= 0);

ALTER TABLE telegram_pet_profiles
  ADD COLUMN equipped_food TEXT;

ALTER TABLE telegram_pet_profiles
  ADD COLUMN equipped_toy TEXT;

ALTER TABLE telegram_pet_profiles
  ADD COLUMN equipped_outfit TEXT;
