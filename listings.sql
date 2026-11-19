ALTER TABLE alternateme_listings
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS available date,
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','draft','paused','filled'));
CREATE INDEX IF NOT EXISTS alternateme_listings_open ON alternateme_listings(city,currency,rent,available) WHERE status='open';
CREATE INDEX IF NOT EXISTS alternateme_listings_owner ON alternateme_listings(owner,id DESC);
