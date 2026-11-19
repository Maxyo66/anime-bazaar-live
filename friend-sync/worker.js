// Anime Bazaar automatic friend updates (Claude 2026-11-08, request #65). A Cloudflare Worker with one D1 table.
// No sign-in: each game makes a random public ID and a secret key. The game uploads its own AB2 share code under
// its ID (only with the matching secret), and friends download the newest codes for the IDs they added.
// Stored per ID: the AB2 code (the same profile/boards a player already puts in an invite link), a hash of the
// secret, update time, and a hash of the uploading IP that limits new IDs per day. Nothing else.
// Shared rival pool (Claude 2026-11-13, Max): after each finished day a game also uploads that day's board (the same
// snapshot a rival fight uses) under its ID; any game can fetch recent boards for a day and difficulty to fight as rivals.
// One board per player, day, difficulty and hero (newest wins); boards older than 90 days are dropped.
// Anonymous run stats (Claude 2026-11-14, Max): when a run ends the game sends a short summary under a random run ID
// (hero, difficulty, result, final board, fights won/lost, hidden pairs). No player ID, name or IP is stored (only a
// hashed IP for a daily limit). GET /stats returns totals only, for balancing (?diff= and ?since= filter them). Runs older than 180 days are dropped.
const ID = /^[A-Za-z0-9_-]{22}$/, SECRET = /^[A-Za-z0-9_-]{43}$/, CODE = /^AB2:[A-Za-z0-9_-]+$/;
const MAX_CODE = 20000, MAX_BODY = 24000, MAX_IDS = 50, MIN_GAP_MS = 5000, NEW_PER_IP_PER_DAY = 20;
const BOARD_MAX = 6000, POOL_LIMIT = 40, BOARD_GAP_MS = 2000, BOARD_TTL_MS = 90 * 864e5, DIFFS = ['casual', 'normal', 'hard'];
const RID = /^[A-Za-z0-9_-]{16,32}$/, RUN_MAX = 40000, RUNS_PER_IP_PER_DAY = 40, RUN_TTL_MS = 180 * 864e5, KINDS = ['pvp', 'monster', 'elite', 'boss', 'calamity', 'trial', 'other'];
const str = (v, n) => typeof v === 'string' && v.length && v.length <= n && /^[^<>]*$/.test(v);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
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
  if (request.method === 'POST' && parts[0] === 'run' && parts.length === 1) {
    const text = await request.text();
    if (text.length > RUN_MAX) return json({ error: 'too large' }, 413);
    let r; try { r = JSON.parse(text) } catch { return json({ error: 'bad json' }, 400) }
    const ok = r && RID.test(r.rid || '') && str(r.hero, 24) && DIFFS.includes(r.diff) && ['win', 'loss'].includes(r.result) && Number.isInteger(r.day) && r.day >= 1 && r.day <= 40
      && Number.isInteger(r.wins) && r.wins >= 0 && r.wins <= 40 && Number.isInteger(r.losses) && r.losses >= 0 && r.losses <= 40 && Array.isArray(r.items) && r.items.length <= 12
      && Array.isArray(r.fights) && r.fights.length <= 120 && Array.isArray(r.pairs || []) && (r.pairs || []).length <= 30;
    if (!ok) return json({ error: 'bad body' }, 400);
    const items = r.items.filter(i => i && str(i.id, 40) && Number.isInteger(i.tier) && i.tier >= 0 && i.tier <= 6).map(i => ({ id: i.id, tier: i.tier }));
    const fights = r.fights.filter(f => f && Number.isInteger(f.day) && f.day >= 1 && f.day <= 40 && KINDS.includes(f.kind) && str(f.foe, 60) && typeof f.won === 'boolean');
    const pairs = [...new Set((r.pairs || []).filter(x => str(x, 40)))];
    if (await store.runGet(r.rid)) return json({ ok: true, dup: true });
    const ipHash = await sha('run:' + (request.headers.get('CF-Connecting-IP') || 'local'));
    if (await store.runsSince(ipHash, now - 864e5) >= RUNS_PER_IP_PER_DAY) return json({ error: 'too many runs today' }, 429);
    await store.runPut({ rid: r.rid, at: now, hero: r.hero, diff: r.diff, result: r.result, day: r.day, wins: r.wins, losses: r.losses, ip_hash: ipHash }, items, fights, pairs, now - RUN_TTL_MS);
    return json({ ok: true });
  }
  if (request.method === 'GET' && parts[0] === 'stats' && parts.length === 1) {
    // ?since=YYYY-MM-DD (UTC) or a ms timestamp counts only runs finished from then on, e.g. after a balance patch.
    const diff = url.searchParams.get('diff'), sinceRaw = url.searchParams.get('since') || '';
    const since = /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) ? Date.parse(sinceRaw + 'T00:00:00Z') : /^\d{10,15}$/.test(sinceRaw) ? Number(sinceRaw) : NaN;
    return json(await store.stats(DIFFS.includes(diff) ? diff : null, Math.max(now - RUN_TTL_MS, Number.isFinite(since) ? since : 0)));
  }
  return json({ error: 'not found' }, 404);
}

export function d1Store(db) {
  let ready = null;
  const init = () => ready ||= db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, code TEXT NOT NULL, updated INTEGER NOT NULL, created INTEGER NOT NULL, ip_hash TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS profiles_ip ON profiles (ip_hash, created)'),
    db.prepare('CREATE TABLE IF NOT EXISTS boards (owner TEXT NOT NULL, day INTEGER NOT NULL, diff TEXT NOT NULL, hero TEXT NOT NULL, board TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (owner, day, diff, hero))'),
    db.prepare('CREATE INDEX IF NOT EXISTS boards_pick ON boards (day, diff, at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS runs (rid TEXT PRIMARY KEY, at INTEGER NOT NULL, hero TEXT NOT NULL, diff TEXT NOT NULL, result TEXT NOT NULL, day INTEGER NOT NULL, wins INTEGER NOT NULL, losses INTEGER NOT NULL, ip_hash TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS runs_ip ON runs (ip_hash, at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS run_items (rid TEXT NOT NULL, item TEXT NOT NULL, tier INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS run_items_rid ON run_items (rid)'),
    db.prepare('CREATE TABLE IF NOT EXISTS run_fights (rid TEXT NOT NULL, day INTEGER NOT NULL, kind TEXT NOT NULL, foe TEXT NOT NULL, won INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS run_fights_rid ON run_fights (rid)'),
    db.prepare('CREATE TABLE IF NOT EXISTS run_pairs (rid TEXT NOT NULL, pair TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS run_pairs_rid ON run_pairs (rid)')]).catch(e => { ready = null; throw e });
  return {
    async get(id) { await init(); return await db.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first() },
    async put(r) { await init(); await db.prepare('INSERT INTO profiles (id, secret_hash, code, updated, created, ip_hash) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code = excluded.code, updated = excluded.updated').bind(r.id, r.secret_hash, r.code, r.updated, r.created, r.ip_hash).run() },
    async many(ids) { await init(); return (await db.prepare(`SELECT id, code, updated FROM profiles WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || [] },
    async boardLast(owner) { await init(); const r = await db.prepare('SELECT MAX(at) AS t FROM boards WHERE owner = ?').bind(owner).first(); return r ? r.t : 0 },
    async boardPut(r, cutoff) { await init(); await db.batch([db.prepare('INSERT INTO boards (owner, day, diff, hero, board, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner, day, diff, hero) DO UPDATE SET board = excluded.board, at = excluded.at').bind(r.owner, r.day, r.diff, r.hero, r.board, r.at), db.prepare('DELETE FROM boards WHERE at < ?').bind(cutoff)]) },
    async boardList(day, diff, not, cutoff, limit) { await init(); return (await db.prepare('SELECT board FROM boards WHERE day = ? AND diff = ? AND owner != ? AND at >= ? ORDER BY at DESC LIMIT ?').bind(day, diff, not, cutoff, limit).all()).results || [] },
    async runGet(rid) { await init(); return await db.prepare('SELECT rid FROM runs WHERE rid = ?').bind(rid).first() },
    async runsSince(ipHash, t) { await init(); const r = await db.prepare('SELECT COUNT(*) AS n FROM runs WHERE ip_hash = ? AND at > ?').bind(ipHash, t).first(); return r ? r.n : 0 },
    async runPut(r, items, fights, pairs, cutoff) { await init();
      const old = 'SELECT rid FROM runs WHERE at < ?';
      // D1 allows 100 bound values per statement and 50 statements per request: insert rows in blocks
      const multi = (into, rows) => { const out = [], per = Math.max(1, Math.floor(100 / ((rows[0] || [1]).length))); for (let i = 0; i < rows.length; i += per) { const part = rows.slice(i, i + per); out.push(db.prepare(`INSERT INTO ${into} VALUES ${part.map(x => '(' + x.map(() => '?').join(', ') + ')').join(', ')}`).bind(...part.flat())) } return out };
      await db.batch([
        db.prepare('INSERT INTO runs (rid, at, hero, diff, result, day, wins, losses, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(r.rid, r.at, r.hero, r.diff, r.result, r.day, r.wins, r.losses, r.ip_hash),
        ...multi('run_items (rid, item, tier)', items.map(i => [r.rid, i.id, i.tier])),
        ...multi('run_fights (rid, day, kind, foe, won)', fights.map(f => [r.rid, f.day, f.kind, f.foe, f.won ? 1 : 0])),
        ...multi('run_pairs (rid, pair)', pairs.map(x => [r.rid, x])),
        ...['run_items', 'run_fights', 'run_pairs'].map(t => db.prepare(`DELETE FROM ${t} WHERE rid IN (${old})`).bind(cutoff)),
        db.prepare('DELETE FROM runs WHERE at < ?').bind(cutoff)]) },
    async stats(diff, cutoff) { await init();
      const w = diff ? 'r.at >= ? AND r.diff = ?' : 'r.at >= ?', a = diff ? [cutoff, diff] : [cutoff];
      const q = async (sql) => (await db.prepare(sql).bind(...a).all()).results || [];
      return {
        runs: (await q(`SELECT COUNT(*) AS runs, SUM(r.result = 'win') AS wins FROM runs r WHERE ${w}`))[0] || { runs: 0, wins: 0 },
        heroes: await q(`SELECT r.hero, r.diff, COUNT(*) AS runs, SUM(r.result = 'win') AS wins, ROUND(AVG(r.day), 1) AS avgDay, ROUND(AVG(r.wins), 1) AS avgWins FROM runs r WHERE ${w} GROUP BY r.hero, r.diff ORDER BY runs DESC`),
        items: await q(`SELECT i.item, COUNT(DISTINCT i.rid) AS runs, COUNT(DISTINCT CASE WHEN r.result = 'win' THEN i.rid END) AS wins, ROUND(AVG(i.tier), 2) AS avgTier FROM run_items i JOIN runs r ON r.rid = i.rid WHERE ${w} GROUP BY i.item ORDER BY runs DESC LIMIT 400`),
        foes: await q(`SELECT f.kind, f.foe, COUNT(*) AS fights, SUM(f.won) AS won, ROUND(AVG(f.day), 1) AS avgDay FROM run_fights f JOIN runs r ON r.rid = f.rid WHERE ${w} GROUP BY f.kind, f.foe ORDER BY fights DESC LIMIT 300`),
        pairs: await q(`SELECT p.pair, COUNT(DISTINCT p.rid) AS runs, COUNT(DISTINCT CASE WHEN r.result = 'win' THEN p.rid END) AS wins FROM run_pairs p JOIN runs r ON r.rid = p.rid WHERE ${w} GROUP BY p.pair ORDER BY runs DESC LIMIT 300`),
        endDays: await q(`SELECT r.day, COUNT(*) AS runs FROM runs r WHERE ${w} AND r.result = 'loss' GROUP BY r.day ORDER BY r.day`),
      } },
    async newSince(ipHash, t) { await init(); const r = await db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE ip_hash = ? AND created > ?').bind(ipHash, t).first(); return r ? r.n : 0 },
  };
}

export function memoryStore() {
  const m = new Map(), bm = new Map(), rm = new Map();
  return {
    rows: m, boards: bm, runs: rm,
    async runGet(rid) { return rm.get(rid) || null },
    async runsSince(ipHash, t) { return [...rm.values()].filter(x => x.ip_hash === ipHash && x.at > t).length },
    async runPut(r, items, fights, pairs, cutoff) { rm.set(r.rid, { ...r, items, fights, pairs }); for (const [k, v] of rm) if (v.at < cutoff) rm.delete(k) },
    async stats(diff, cutoff) { const rs = [...rm.values()].filter(r => r.at >= cutoff && (!diff || r.diff === diff)), won = r => r.result === 'win';
      const group = (rows, key) => { const g = new Map(); for (const x of rows) { const k = key(x); if (!g.has(k)) g.set(k, []); g.get(k).push(x) } return g };
      const heroes = [...group(rs, r => r.hero + '|' + r.diff)].map(([k, v]) => ({ hero: k.split('|')[0], diff: k.split('|')[1], runs: v.length, wins: v.filter(won).length, avgDay: Math.round(v.reduce((a, r) => a + r.day, 0) / v.length * 10) / 10, avgWins: Math.round(v.reduce((a, r) => a + r.wins, 0) / v.length * 10) / 10 }));
      const items = [...group(rs.flatMap(r => [...new Set(r.items.map(i => i.id))].map(id => ({ id, r }))), x => x.id)].map(([k, v]) => ({ item: k, runs: v.length, wins: v.filter(x => won(x.r)).length }));
      const foes = [...group(rs.flatMap(r => r.fights), f => f.kind + '|' + f.foe)].map(([k, v]) => ({ kind: k.split('|')[0], foe: k.slice(k.indexOf('|') + 1), fights: v.length, won: v.filter(f => f.won).length }));
      const pairs = [...group(rs.flatMap(r => r.pairs.map(p => ({ p, r }))), x => x.p)].map(([k, v]) => ({ pair: k, runs: v.length, wins: v.filter(x => won(x.r)).length }));
      return { runs: { runs: rs.length, wins: rs.filter(won).length }, heroes, items, foes, pairs, endDays: [...group(rs.filter(r => !won(r)), r => r.day)].map(([day, v]) => ({ day, runs: v.length })) } },
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
