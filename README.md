# AlternateMe

One account can search for flats or flatmates and publish housing listings. The Search/Post switch remembers the last mode across sign-ins. Edit your shared profile to opt into flatmate discovery.

## Run locally

Use Node.js 24 or newer. From this directory run `npm ci`, then `npm start` (builds the React client and starts Fastify) and open http://127.0.0.1:3000. React uses the same-origin Fastify JSON API. The server creates a local SQLite database. Set `DB_PATH` to change its location and `PORT` to change the port. Use `COOKIE_SECURE=1` behind HTTPS.

Create an account, open Post, publish a room and switch to Search to find it. To try flatmate discovery, enable it in My profile and search from a second account. Photo galleries, compatibility scoring and chat are planned in the [implementation plan](docs/superpowers/plans/2026-11-19-flat-and-flatmate-search.md).

## Neon on Vercel

Vercel builds the React client in `public` and routes API requests to the Fastify function in `api/index.mjs`. Production uses Neon Auth email/password sessions, Postgres profiles and listings, a private `assets` bucket for profile portraits, and the `profileprompts` Neon Function for introduction ideas. The SQLite server remains available for offline development. Existing SQLite accounts require separate migration before a production cutover.

Deploy the checked-in Neon policy to the linked production branch with the Neon CLI, then apply `schema.sql` to that database. Set these server-side variables on the corresponding Vercel environment before deploying.

| Neon environment | Vercel environment |
| --- | --- |
| DATABASE_URL, NEON_AUTH_BASE_URL, NEON_BRANCH_ID, NEON_FUNCTION_HOST_SUFFIX | Same names |
| AWS_ENDPOINT_URL_S3 | NEON_STORAGE_ENDPOINT |
| AWS_REGION | NEON_STORAGE_REGION |
| AWS_ACCESS_KEY_ID | NEON_STORAGE_ACCESS_KEY |
| AWS_SECRET_ACCESS_KEY | NEON_STORAGE_SECRET_KEY |

Keep preview data and credentials scoped to their own branch. Test registration, email verification, sign-in, publishing a room, changing modes, uploading a JPEG and requesting introduction prompts. The Neon policy also declares the authorized AI Gateway for future use.
