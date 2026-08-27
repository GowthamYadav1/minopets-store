/**
 * Firebase app bootstrap (compat SDK on the page).
 */
function minoFirebaseConfigured() {
    const cfg = window.MINO_FIREBASE;
    if (!cfg || cfg.enabled === false) return false;
    if (!cfg.apiKey || String(cfg.apiKey).includes('PASTE')) return false;
    return typeof firebase !== 'undefined';
}

function minoFunctionsEnabled() {
    const base = window.MINO_FIREBASE?.functionsBase;
    return minoFirebaseConfigured() && base && !String(base).includes('YOUR_PROJECT') && !String(base).includes('PASTE');
}

function minoFirebaseInit() {
    if (!minoFirebaseConfigured()) return null;
    if (!firebase.apps.length) {
        firebase.initializeApp({
            apiKey: MINO_FIREBASE.apiKey,
            authDomain: MINO_FIREBASE.authDomain,
            projectId: MINO_FIREBASE.projectId,
            storageBucket: MINO_FIREBASE.storageBucket,
            messagingSenderId: MINO_FIREBASE.messagingSenderId,
            appId: MINO_FIREBASE.appId
        });
    }
    return firebase.app();
}

async function minoIdToken() {
    const user = firebase.auth?.()?.currentUser;
    if (!user) return null;
    return user.getIdToken();
}

async function minoFunctionsPost(action, extra) {
    const headers = { 'Content-Type': 'application/json' };
    const token = await minoIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const url = `${MINO_FIREBASE.functionsBase}/${action}`;
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(extra || {})
        });
    } catch (err) {
        throw new Error(`Failed to reach ${action}. Deploy that Cloud Function and check the Functions URL.`);
    }
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`Function ${action} returned ${res.status} (not JSON). Check Functions URL / CORS.`);
    }
}
