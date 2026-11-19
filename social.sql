CREATE TABLE IF NOT EXISTS alternateme_pairs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  a text COLLATE "C" NOT NULL REFERENCES alternateme_profiles(id) ON DELETE CASCADE,
  b text COLLATE "C" NOT NULL REFERENCES alternateme_profiles(id) ON DELETE CASCADE,
  a_vote text CHECK (a_vote IN ('like','pass')),
  b_vote text CHECK (b_vote IN ('like','pass')),
  a_block boolean NOT NULL DEFAULT false,
  b_block boolean NOT NULL DEFAULT false,
  connected boolean NOT NULL DEFAULT false,
  CHECK (a < b), UNIQUE(a,b)
);
CREATE INDEX IF NOT EXISTS alternateme_pairs_b ON alternateme_pairs(b);
CREATE TABLE IF NOT EXISTS alternateme_threads (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pair_id bigint NOT NULL REFERENCES alternateme_pairs(id) ON DELETE CASCADE,
  listing_id integer REFERENCES alternateme_listings(id) ON DELETE CASCADE,
  requester text REFERENCES alternateme_profiles(id) ON DELETE CASCADE,
  question text CHECK (length(question) BETWEEN 1 AND 2000),
  state text NOT NULL CHECK (state IN ('pending','open','closed')),
  CHECK ((listing_id IS NULL AND requester IS NULL) OR (listing_id IS NOT NULL AND requester IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS alternateme_threads_match ON alternateme_threads(pair_id) WHERE listing_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS alternateme_threads_listing ON alternateme_threads(listing_id,requester) WHERE listing_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS alternateme_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id bigint NOT NULL REFERENCES alternateme_threads(id) ON DELETE CASCADE,
  sender text NOT NULL REFERENCES alternateme_profiles(id) ON DELETE CASCADE,
  token uuid NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(thread_id,sender,token)
);
CREATE INDEX IF NOT EXISTS alternateme_messages_history ON alternateme_messages(thread_id,id);
CREATE TABLE IF NOT EXISTS alternateme_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporter text NOT NULL REFERENCES alternateme_profiles(id) ON DELETE CASCADE,
  subject text NOT NULL REFERENCES alternateme_profiles(id) ON DELETE CASCADE,
  context text NOT NULL,
  reviewed_at timestamptz,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter <> subject)
);
