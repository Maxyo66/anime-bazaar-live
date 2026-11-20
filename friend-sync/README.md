# Automatic friend updates and shared rival pool

This Cloudflare Worker and D1 database power the live game's online features. Players do not need accounts.

## Friend updates
- Each browser profile has a random public ID and a secret that stays in that browser. A matching secret is required to update that profile's AB2 share code.
- Friends added through invite links receive updated profiles and boards automatically when the game checks in.
- A server outage leaves the game’s local profiles, saved boards, and manual invite codes available.

## Shared rival pool
- After each finished day, the game uploads that board with the profile's public player tag, day, difficulty, hero and items.
- The game can fetch up to 40 recent boards for the same day and difficulty. It filters out the current player's own ID; no friend invite is needed to enter the common pool.
- A player has one current board for each day, difficulty and hero; a newer upload replaces it. Pool boards expire after 90 days.
- Board uploads are limited to one per profile every two seconds and each board is capped at 6 KB. Invalid values and oversized boards are rejected by the Worker.

The Worker uses the existing anime-bazaar-friends D1 database and its boards table. CREATE TABLE IF NOT EXISTS initializes the table without deleting friend records. The live Worker has already been updated; do not rerun deployment unless changing server code. Worker endpoint checks and the two-browser regression test do not create live rival records.

Tests: tests/friend_sync.cjs and tests/global_pool.cjs.

## Anonymous run stats (#87)

- When the Settings > Privacy switch is on (default), a completed non-Daily run can send a summary for game balancing. It contains hero, difficulty, result, day, wins/losses, final item build, fights and hidden pairs. Rival player names are removed.
- The summary has a random run ID and does not include the player name, profile ID or friend-sync ID. The server stores only a hash of the IP address for a limit of 40 submissions per day; run records expire after 180 days.
- The totals are shown on the private admin panel's Balance tab (the public stats.html page was retired on 2026-11-19). GET /stats itself stays open: it returns aggregate totals only, never individual run records.
- Filters: `/stats?diff=hard` limits to one difficulty, and `/stats?since=2026-11-19` counts only runs finished on or after that date (UTC), so balance reports can skip runs from before a patch. The admin Balance tab has a matching "Runs since" date box.

## Private player list (admin)

- `/admin` on the Worker is a private page for Max with two tabs. Balance: the run stats totals (heroes, items, foes, pairs, end days) with difficulty and runs-since filters. Players: every stored friend-sync profile (player name, runs, titles, best runs, dailies, achievements) with first seen and last played, sortable to see who plays the most and who is best. Click a player for their per-hero records.
- It reads only what the profiles table already holds; nothing new is collected. Run stats stay anonymous and are not linked to players.
- Locked by a Worker secret: `npx wrangler secret put ADMIN_KEY` (run in friend-sync/, paste a long random key, at least 16 characters). Without the secret, `/admin` answers 404. The page asks for the key once and can remember it in that browser.
- Settings > Privacy tells players their profile is visible to the developer.

Test: tests/admin_panel.cjs.
