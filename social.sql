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
ALTER TABLE alternateme_threads ADD COLUMN IF NOT EXISTS needs_intro boolean NOT NULL DEFAULT false;
ALTER TABLE alternateme_threads ADD COLUMN IF NOT EXISTS intro_sender text;
ALTER TABLE alternateme_pairs ADD COLUMN IF NOT EXISTS intro_a text, ADD COLUMN IF NOT EXISTS intro_b text;
UPDATE alternateme_threads t SET needs_intro=true
WHERE listing_id IS NULL AND state='open' AND intro_sender IS NULL AND NOT EXISTS(SELECT 1 FROM alternateme_messages m WHERE m.thread_id=t.id);
UPDATE alternateme_threads t SET state='pending',intro_sender=m.sender,question=m.body FROM
 (SELECT DISTINCT ON(thread_id) thread_id,sender,body FROM alternateme_messages ORDER BY thread_id,id) m
WHERE t.id=m.thread_id AND t.listing_id IS NULL AND t.state='open' AND t.intro_sender IS NULL
 AND NOT EXISTS(SELECT 1 FROM alternateme_messages r WHERE r.thread_id=t.id AND r.sender<>m.sender);
UPDATE alternateme_pairs p SET intro_a=coalesce(intro_a,(SELECT CASE WHEN t.listing_id IS NULL THEN 'match' ELSE t.listing_id::text END FROM alternateme_threads t WHERE t.pair_id=p.id AND coalesce(t.requester,t.intro_sender)=p.a AND t.state IN ('pending','closed') ORDER BY t.id LIMIT 1)),
 intro_b=coalesce(intro_b,(SELECT CASE WHEN t.listing_id IS NULL THEN 'match' ELSE t.listing_id::text END FROM alternateme_threads t WHERE t.pair_id=p.id AND coalesce(t.requester,t.intro_sender)=p.b AND t.state IN ('pending','closed') ORDER BY t.id LIMIT 1))
 WHERE EXISTS(SELECT 1 FROM alternateme_threads t WHERE t.pair_id=p.id AND t.state IN ('pending','closed'));
