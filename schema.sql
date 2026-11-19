CREATE TABLE IF NOT EXISTS alternateme_profiles (
  id text PRIMARY KEY, name text NOT NULL, mode text NOT NULL DEFAULT 'search',
  about text NOT NULL DEFAULT '', hometown text NOT NULL DEFAULT '',
  hobbies text NOT NULL DEFAULT '', discoverable boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS alternateme_listings (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner text NOT NULL REFERENCES alternateme_profiles(id),
  title text NOT NULL, area text NOT NULL, rent bigint NOT NULL CHECK (rent > 0),
  currency text NOT NULL, kind text NOT NULL
);
