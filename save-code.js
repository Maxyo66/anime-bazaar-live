// AB1 is the existing, versioned profile-share format. Keep its UTF-8/base64
// byte representation stable for saves and codes created by older releases.
const BazaarSaveCode = (() => {
  const PREFIX = 'AB1:';
  const MAX_LENGTH = 80000;

  function toBase64(text) {
    let binary = '';
    for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function fromBase64(encoded) {
    return new TextDecoder().decode(
      Uint8Array.from(atob(encoded), character => character.charCodeAt(0)),
    );
  }

  function encode(payload) {
    return PREFIX + toBase64(JSON.stringify(payload));
  }

  function decode(input) {
    const code = String(input || '').trim().replace(/\s+/g, '');
    if (!code.startsWith(PREFIX) || code.length > MAX_LENGTH) return null;
    try {
      return JSON.parse(fromBase64(code.slice(PREFIX.length)));
    } catch {
      return null;
    }
  }

  // ---- AB2 (Claude 2026-11-08): the same payload, boards packed small, deflated and URL-safe base64. ----
  const PREFIX2 = 'AB2:';
  const b64url = bytes => { let bin = ''; for (const x of bytes) bin += String.fromCharCode(x); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64url = text => { const t = text.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t + '='.repeat((4 - t.length % 4) % 4)), c => c.charCodeAt(0)); };
  async function pipe(bytes, stream) { const w = stream.writable.getWriter(); w.write(bytes).catch(() => {}); w.close().catch(() => {}); return new Uint8Array(await new Response(stream.readable).arrayBuffer()); }
  function packBoard(b) {
    const o = { h: b.heroId, d: b.day, p: b.hp, i: (b.items || []).map(x => [x.id, x.tier, x.bonus || '', x.ench || '', x.slot == null ? '' : x.slot, x.exchangeMode === 'transmute' ? 't' : ''].join(':').replace(/:+$/, '')).join('|') };
    if (b.heroRules && b.heroRules !== 1) o.r = b.heroRules;
    if (b.skills && Object.keys(b.skills).length) o.s = b.skills;
    const c = b.cos || {}; if (c.skin || c.frames || c.themes || c.title) o.c = [c.skin || 0, c.frames || 0, c.themes || 0, c.title || 0];
    return o;
  }
  function unpackBoard(o) {
    const items = String(o.i || '').split('|').filter(Boolean).map(t => { const [id, tier, bonus, ench, slot, m] = t.split(':'); return { id, tier: +tier, bonus: +bonus || 0, ench: ench || null, slot: slot === '' || slot == null ? null : +slot, ...(m === 't' ? { exchangeMode: 'transmute' } : {}) }; });
    const c = Array.isArray(o.c) ? o.c : [];
    return { heroId: o.h, day: o.d, hp: o.p, heroRules: o.r || 1, skills: o.s || {}, items, cos: { skin: c[0] || null, frames: c[1] || null, themes: c[2] || null, title: c[3] || null } };
  }
  const canShort = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  async function encodeShort(payload) {
    if (!canShort()) return encode(payload);
    const { boards, ...rest } = payload;
    const bytes = await pipe(new TextEncoder().encode(JSON.stringify({ ...rest, b: (boards || []).map(packBoard) })), new CompressionStream('deflate-raw'));
    return PREFIX2 + b64url(bytes);
  }
  // Accepts an AB1 code, an AB2 code, or an invite link that contains one.
  async function decodeAny(input) {
    let code = String(input || '').trim().replace(/\s+/g, '');
    const m = code.match(/[#?&]friend=([^&#]+)/); if (m) code = decodeURIComponent(m[1]);
    if (code.startsWith(PREFIX)) return decode(code);
    if (!code.startsWith(PREFIX2) || code.length > MAX_LENGTH || !canShort()) return null;
    try {
      const json = new TextDecoder().decode(await pipe(unb64url(code.slice(PREFIX2.length)), new DecompressionStream('deflate-raw')));
      const { b, ...rest } = JSON.parse(json);
      return { ...rest, boards: Array.isArray(b) ? b.map(unpackBoard) : [] };
    } catch {
      return null;
    }
  }

  return Object.freeze({ encode, decode, encodeShort, decodeAny });
})();

if (typeof module === 'object' && module.exports) module.exports = BazaarSaveCode;
if (typeof globalThis !== 'undefined') globalThis.BazaarSaveCode = BazaarSaveCode;
