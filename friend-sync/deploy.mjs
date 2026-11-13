// One-time setup of the automatic friend updates server on Max's own free Cloudflare account (Claude 2026-11-08, #65).
// Run from the game folder:  node friend-sync/deploy.mjs      (or double-click friend-sync/deploy.cmd)
// 1. Opens the Cloudflare sign-in page so Max can press Allow (wrangler login). No keys are stored in this project.
// 2. Creates the D1 database "anime-bazaar-friends" if it doesn't exist and writes its ID into wrangler.toml.
// 3. Deploys the Worker and writes its https://….workers.dev address into index.html (FRIEND_SYNC_URL).
// Running it again later just redeploys the Worker; the stored friend data is kept.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), game = path.resolve(here, '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx', W = ['--yes', 'wrangler@4'];
const run = (args, capture = false) => { const r = spawnSync(npx, [...W, ...args], { cwd: here, stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', shell: process.platform === 'win32' }); if (r.status !== 0) throw new Error('wrangler ' + args.join(' ') + ' failed'); return r.stdout || ''; };
try {
  try { run(['whoami'], true).includes('not authenticated') && run(['login']); } catch { run(['login']); }
  const tomlPath = path.join(here, 'wrangler.toml'); let toml = fs.readFileSync(tomlPath, 'utf8');
  if (toml.includes('FILL_ME_AFTER_D1_CREATE')) {
    const list = JSON.parse(run(['d1', 'list', '--json'], true) || '[]');
    let db = list.find(d => d.name === 'anime-bazaar-friends');
    if (!db) { run(['d1', 'create', 'anime-bazaar-friends']); db = JSON.parse(run(['d1', 'list', '--json'], true)).find(d => d.name === 'anime-bazaar-friends'); }
    if (!db) throw new Error('Could not find the anime-bazaar-friends database after creating it.');
    toml = toml.replace('FILL_ME_AFTER_D1_CREATE', db.uuid || db.id); fs.writeFileSync(tomlPath, toml);
    console.log('Database ready:', db.uuid || db.id);
  }
  const outText = run(['deploy'], true); process.stdout.write(outText);
  const url = (outText.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i) || [])[0];
  if (!url) throw new Error('Deployed, but could not read the workers.dev address from the output above. Put it into index.html FRIEND_SYNC_URL by hand.');
  const check = await fetch(url).then(r => r.json()).catch(() => null);
  if (!check || check.service !== 'anime-bazaar-friends') console.warn('Warning: the server did not answer as expected yet (new workers.dev addresses can take a minute).');
  const idx = path.join(game, 'index.html'); const html = fs.readFileSync(idx, 'utf8');
  const next = html.replace(/const FRIEND_SYNC_URL=\(window\.FRIEND_SYNC_URL_OVERRIDE\?\?'[^']*'\)/, `const FRIEND_SYNC_URL=(window.FRIEND_SYNC_URL_OVERRIDE??'${url}')`);
  if (next === html && !html.includes(url)) throw new Error('Could not find FRIEND_SYNC_URL in index.html.');
  fs.writeFileSync(idx, next);
  console.log('\nDone. Friend updates server:', url, '\nindex.html now points at it. Publish index.html as usual.');
} catch (e) { console.error('\n' + e.message); process.exitCode = 1; }
