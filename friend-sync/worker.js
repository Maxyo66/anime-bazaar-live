// Anime Bazaar automatic friend updates (Claude 2026-11-08, request #65). A Cloudflare Worker with one D1 table.
// No sign-in: each game makes a random public ID and a secret key. The game uploads its own AB2 share code under
// its ID (only with the matching secret), and friends download the newest codes for the IDs they added.
// Stored per ID: the AB2 code (the same profile/boards a player already puts in an invite link), a hash of the
// secret, update time, and a hash of the uploading IP that limits new IDs per day. Nothing else.
// Shared rival pool (Claude 2026-11-13, Max): after each finished day a game also uploads that day's board (the same
// snapshot a rival fight uses) under its ID; any game can fetch recent boards for a day and difficulty to fight as rivals.
// One board per player, day, difficulty and hero (newest wins); boards older than 90 days are dropped.
const ID = /^[A-Za-z0-9_-]{22}$/, SECRET = /^[A-Za-z0-9_-]{43}$/, CODE = /^AB2:[A-Za-z0-9_-]+$/;
const MAX_CODE = 20000, MAX_BODY = 24000, MAX_IDS = 50, MIN_GAP_MS = 5000, NEW_PER_IP_PER_DAY = 20;
const BOARD_MAX = 6000, POOL_LIMIT = 40, BOARD_GAP_MS = 2000, BOARD_TTL_MS = 90 * 864e5, DIFFS = ['casual', 'normal', 'hard'];
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
  if (request.method === 'PUT' && parts[0] === 'b' && parts.length === 2) {
    const id = parts[1];
    if (!ID.test(id)) return json({ error: 'bad id' }, 400);
    const text = await request.text();
    if (text.length > BOARD_MAX + 200) return json({ error: 'too large' }, 413);
    let body; try { body = JSON.parse(text) } catch { return json({ error: 'bad json' }, 400) }
    const { secret, board } = body || {};
    const ok = typeof secret === 'string' && SECRET.test(secret) && board && typeof board === 'object' && Number.isInteger(board.day) && board.day >= 1 && board.day <= 30
      && DIFFS.includes(board.diff) && typeof board.heroId === 'string' && /^[a-z0-9_]{1,24}$/.test(board.heroId) && Array.isArray(board.items) && board.items.length <= 10;
    if (!ok) return json({ error: 'bad body' }, 400);
    const prof = await store.get(id);
    if (!prof || prof.secret_hash !== await sha(secret)) return json({ error: 'not yours' }, 403);
    const last = await store.boardLast(id);
    if (last && now - last < BOARD_GAP_MS) return json({ error: 'slow down' }, 429);
    const tag = typeof board.tag === 'string' ? board.tag.replace(/[<>]/g, '').slice(0, 24) : '';
    const clean = JSON.stringify({ ...board, tag, ownerId: id });
    if (clean.length > BOARD_MAX) return json({ error: 'too large' }, 413);
    await store.boardPut({ owner: id, day: board.day, diff: board.diff, hero: board.heroId, board: clean, at: now }, now - BOARD_TTL_MS);
    return json({ ok: true });
  }
  if (request.method === 'GET' && parts[0] === 'pool' && parts.length === 2) {
    const day = Number(parts[1]), diff = url.searchParams.get('diff'), not = url.searchParams.get('not') || '';
    if (!Number.isInteger(day) || day < 1 || day > 30 || !DIFFS.includes(diff)) return json({ error: 'bad request' }, 400);
    const rows = await store.boardList(day, diff, ID.test(not) ? not : '', now - BOARD_TTL_MS, POOL_LIMIT);
    return json({ boards: rows.map(r => { try { return JSON.parse(r.board) } catch { return null } }).filter(Boolean) });
  }
  return json({ error: 'not found' }, 404);
}

export function d1Store(db) {
  let ready = null;
  const init = () => ready ||= db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, code TEXT NOT NULL, updated INTEGER NOT NULL, created INTEGER NOT NULL, ip_hash TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS profiles_ip ON profiles (ip_hash, created)'),
    db.prepare('CREATE TABLE IF NOT EXISTS boards (owner TEXT NOT NULL, day INTEGER NOT NULL, diff TEXT NOT NULL, hero TEXT NOT NULL, board TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (owner, day, diff, hero))'),
    db.prepare('CREATE INDEX IF NOT EXISTS boards_pick ON boards (day, diff, at)')]).catch(e => { ready = null; throw e });
  return {
    async get(id) { await init(); return await db.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first() },
    async put(r) { await init(); await db.prepare('INSERT INTO profiles (id, secret_hash, code, updated, created, ip_hash) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code = excluded.code, updated = excluded.updated').bind(r.id, r.secret_hash, r.code, r.updated, r.created, r.ip_hash).run() },
    async many(ids) { await init(); return (await db.prepare(`SELECT id, code, updated FROM profiles WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || [] },
    async boardLast(owner) { await init(); const r = await db.prepare('SELECT MAX(at) AS t FROM boards WHERE owner = ?').bind(owner).first(); return r ? r.t : 0 },
    async boardPut(r, cutoff) { await init(); await db.batch([db.prepare('INSERT INTO boards (owner, day, diff, hero, board, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner, day, diff, hero) DO UPDATE SET board = excluded.board, at = excluded.at').bind(r.owner, r.day, r.diff, r.hero, r.board, r.at), db.prepare('DELETE FROM boards WHERE at < ?').bind(cutoff)]) },
    async boardList(day, diff, not, cutoff, limit) { await init(); return (await db.prepare('SELECT board FROM boards WHERE day = ? AND diff = ? AND owner != ? AND at >= ? ORDER BY at DESC LIMIT ?').bind(day, diff, not, cutoff, limit).all()).results || [] },
    async newSince(ipHash, t) { await init(); const r = await db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE ip_hash = ? AND created > ?').bind(ipHash, t).first(); return r ? r.n : 0 },
  };
}

export function memoryStore() {
  const m = new Map(), bm = new Map();
  return {
    rows: m, boards: bm,
    async boardLast(owner) { let t = 0; for (const r of bm.values()) if (r.owner === owner) t = Math.max(t, r.at); return t },
    async boardPut(r, cutoff) { bm.set([r.owner, r.day, r.diff, r.hero].join('|'), { ...r }); for (const [k, v] of bm) if (v.at < cutoff) bm.delete(k) },
    async boardList(day, diff, not, cutoff, limit) { return [...bm.values()].filter(r => r.day === day && r.diff === diff && r.owner !== not && r.at >= cutoff).sort((a, b) => b.at - a.at).slice(0, limit).map(r => ({ board: r.board })) },
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
