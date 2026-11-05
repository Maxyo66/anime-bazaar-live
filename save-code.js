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

  return Object.freeze({ encode, decode });
})();

if (typeof module === 'object' && module.exports) module.exports = BazaarSaveCode;
if (typeof globalThis !== 'undefined') globalThis.BazaarSaveCode = BazaarSaveCode;
