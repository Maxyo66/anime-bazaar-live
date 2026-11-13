// Anime Bazaar automatic friend updates (Claude 2026-11-08, request #65). A Cloudflare Worker with one D1 table.
// No sign-in: each game makes a random public ID and a secret key. The game uploads its own AB2 share code under
// its ID (only with the matching secret), and friends download the newest codes for the IDs they added.
// Stored per ID: the AB2 code (the same profile/boards a player already puts in an invite link), a hash of the
// secret, update time, and a hash of the uploading IP that limits new IDs per day. Nothing else.
const ID = /^[A-Za-z0-9_-]{22}$/, SECRET = /^[A-Za-z0-9_-]{43}$/, CODE = /^AB2:[A-Za-z0-9_-]+$/;
const MAX_CODE = 20000, MAX_BODY = 24000, MAX_IDS = 50, MIN_GAP_MS = 5000, NEW_PER_IP_PER_DAY = 20;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function sha(text) { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }

// store: { get(id), put(row), many(ids), newSince(ipHash, t) }
export async function handle(request, store, now = Date.now()) {
  const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'GET' && !parts.length) return json({ ok: true, service: 'anime-bazaar-friends' });
  if (request.method === 'GET' && parts[0] === 'p' && parts.length === 1) {
    const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter(x => ID.test(x)))].slice(0, MAX_IDS);
    const rows = ids.length ? await store.many(ids) : [];
    return json({ profiles: Object.fromEntries(rows.map(r => [r.id, { code: r.code, updated: r.updated }])) });
  }
  if (request.method === 'PUT' && parts[0] === 'p' && parts.length === 2) {
    const id = parts[1];
    if (!ID.test(id)) return json({ error: 'bad id' }, 400);
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
    let body; try { body = JSON.parse(text) } catch { return json({ error: 'bad json' }, 400) }
    const { secret, code } = body || {};
    if (typeof secret !== 'string' || !SECRET.test(secret) || typeof code !== 'string' || code.length > MAX_CODE || !CODE.test(code)) return json({ error: 'bad body' }, 400);
    const hash = await sha(secret), old = await store.get(id);
    if (old) {
      if (old.secret_hash !== hash) return json({ error: 'not yours' }, 403);
      if (now - old.updated < MIN_GAP_MS) return json({ error: 'slow down' }, 429);
    } else {
      const ipHash = await sha('ip:' + (request.headers.get('CF-Connecting-IP') || 'local'));
      if (await store.newSince(ipHash, now - 864e5) >= NEW_PER_IP_PER_DAY) return json({ error: 'too many new profiles today' }, 429);
      await store.put({ id, secret_hash: hash, code, updated: now, created: now, ip_hash: ipHash });
      return json({ ok: true, updated: now });
    }
    await store.put({ ...old, code, updated: now });
    return json({ ok: true, updated: now });
  }
  return json({ error: 'not found' }, 404);
}

export function d1Store(db) {
  let ready = null;
  const init = () => ready ||= db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, code TEXT NOT NULL, updated INTEGER NOT NULL, created INTEGER NOT NULL, ip_hash TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS profiles_ip ON profiles (ip_hash, created)')]).catch(e => { ready = null; throw e });
  return {
    async get(id) { await init(); return await db.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first() },
    async put(r) { await init(); await db.prepare('INSERT INTO profiles (id, secret_hash, code, updated, created, ip_hash) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code = excluded.code, updated = excluded.updated').bind(r.id, r.secret_hash, r.code, r.updated, r.created, r.ip_hash).run() },
    async many(ids) { await init(); return (await db.prepare(`SELECT id, code, updated FROM profiles WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || [] },
    async newSince(ipHash, t) { await init(); const r = await db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE ip_hash = ? AND created > ?').bind(ipHash, t).first(); return r ? r.n : 0 },
  };
}

export function memoryStore() {
  const m = new Map();
  return {
    rows: m,
    async get(id) { return m.get(id) || null },
    async put(r) { m.set(r.id, { ...r }) },
    async many(ids) { return ids.filter(id => m.has(id)).map(id => { const r = m.get(id); return { id, code: r.code, updated: r.updated } }) },
    async newSince(ipHash, t) { return [...m.values()].filter(r => r.ip_hash === ipHash && r.created > t).length },
  };
}

let shared = null;
export default {
  async fetch(request, env) {
    try { shared ||= d1Store(env.DB); return await handle(request, shared) }
    catch (e) { return json({ error: 'server error' }, 500) }
  },
};
