/** Soft throttle token — also stored in Apps Script Properties / LOCAL_SETUP.md */
const MINO_API = {
  baseUrl: 'https://script.google.com/macros/s/AKfycbwmQoC2I8Jonsm2hC6sKdTEg1eVQZB9g1ix-ToWLk4r8uhj42uUQS9_6_eXmyPl3nPqbA/exec',
  token: 'mino_39e10996233d4ad6835620fc',
  stockCacheMs: 60000
};

/** Sent on every API call — must match Config `allowed_origins` in Sheets. */
function minoStoreOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}
