/**
 * Copy to api-config.js (gitignored) after Apps Script deploy:
 *   cp dev/js/api-config.example.js dev/js/api-config.js
 * Fill baseUrl + token from docs/private/LOCAL_SETUP.md — never commit real values.
 */
const MINO_API = {
  baseUrl: 'PASTE_WEB_APP_URL_HERE',
  token: 'PASTE_TOKEN_HERE',
  stockCacheMs: 60000,
  catalogCacheMs: 60000,
  /** Instant first paint from localStorage (API still refreshes in background). Default 7 days. */
  catalogHydrateMaxMs: 604800000
};

function minoStoreOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}
