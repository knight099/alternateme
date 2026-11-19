ALTER TABLE alternateme_profiles
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS languages text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS show_hometown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS housing jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS habits jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interests jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS prompts jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS profile_draft jsonb,
  ADD COLUMN IF NOT EXISTS profile_activity timestamptz NOT NULL DEFAULT now();
