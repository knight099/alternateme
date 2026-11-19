CREATE TABLE IF NOT EXISTS alternateme_photos (
 id uuid PRIMARY KEY,
 profile_id text REFERENCES alternateme_profiles(id) ON DELETE CASCADE,
 listing_id integer REFERENCES alternateme_listings(id) ON DELETE CASCADE,
 slot smallint NOT NULL CHECK (slot BETWEEN 0 AND 5),
 position integer NOT NULL,
 backend text NOT NULL CHECK (backend IN ('database','s3')),
 jpeg bytea CHECK (octet_length(jpeg) <= 1500000),
 CHECK (num_nonnulls(profile_id,listing_id) = 1),
 CHECK ((backend = 'database') = (jpeg IS NOT NULL)),
 UNIQUE(profile_id,slot),
 UNIQUE(listing_id,slot)
);
