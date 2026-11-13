# Automatic friend updates (Claude 2026-11-08, request #65)

A tiny Cloudflare Worker + D1 database on Max's own free Cloudflare account. No sign-in for players.

- Each browser profile makes a random public ID and a secret key (kept only in that browser).
- After each finished day the game uploads its AB2 share code (the same profile, stats and last 12 boards an invite link already contains) under its ID. Only the matching secret can change it.
- Invite links now carry the public ID. Friends added from such a link download the newest code when the game opens, when the tab comes back into view, and on the Players/Share screens (at most once a minute). A code is only accepted if it belongs to the same profile (gid).
- If the server is down or not set up, everything works exactly like plain invite links.
- Stored per ID: the AB2 code, a SHA-256 of the secret, times, and a SHA-256 of the uploader's IP (limits new IDs to 20 per address per day). No emails, accounts, Ryo or saves beyond the share code.

Free tier is far more than enough (100k requests/day, 100k D1 writes/day).

## One-time setup (Windows)

1. Max: create a free account at https://dash.cloudflare.com/sign-up (any email).
2. Double-click `friend-sync\deploy.cmd` (needs Node.js), or run `node friend-sync/deploy.mjs` from the game folder.
   A Cloudflare page opens: press **Allow**. On a brand-new account wrangler may ask to pick a workers.dev subdomain: any name works.
3. The script creates the database, deploys the Worker and writes its address into `index.html` (`FRIEND_SYNC_URL`). Publish `index.html` as usual.

Re-running `deploy.mjs` only redeploys the Worker; stored data is kept. Tests: `tests/friend_sync.cjs` runs the real request handler (in memory and on SQLite through a D1 shim) behind two browsers.
