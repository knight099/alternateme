# AlternateMe

One account can search for flats or flatmates and publish housing listings. The Search/Post switch remembers the last mode across sign-ins. Edit your shared profile to opt into flatmate discovery.

## Run locally

Use Node.js 24 or newer. From this directory run `npm ci`, then `npm start` (builds the React client and starts Fastify) and open http://127.0.0.1:3000. React uses the same-origin Fastify JSON API. The server creates a local SQLite database. Set `DB_PATH` to change its location and `PORT` to change the port. Use `COOKIE_SECURE=1` behind HTTPS.

Create an account, open Post, publish a room and switch to Search to find it. To try flatmate discovery, enable it in My profile and search from a second account. Photo galleries, compatibility scoring and chat are planned in the [implementation plan](docs/superpowers/plans/2026-11-19-flat-and-flatmate-search.md).
