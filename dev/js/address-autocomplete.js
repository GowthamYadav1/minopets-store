/**
 * Google Places suggestions for the checkout delivery address.
 * Requests go through the Firebase addressSuggest / addressDetails functions so
 * the Maps key never reaches the browser.
 */
const ADDRESS_AC_MIN_CHARS = 3;
const ADDRESS_AC_DEBOUNCE_MS = 300;

let addressAcTimer = null;
let addressAcSeq = 0;
let addressAcSession = '';
let addressAcItems = [];
let addressAcIndex = -1;
let addressAcPicked = null;
let addressAcOff = false;
const addressAcCache = new Map();

function addressAcReady() {
    if (addressAcOff) return false;
    return typeof minoFunctionsEnabled === 'function' && minoFunctionsEnabled();
}

/** One token per typing session; the details call at the end closes it. */
function addressAcSessionToken() {
    if (!addressAcSession) {
        addressAcSession = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
    return addressAcSession;
}

async function addressAcFetch(action, params) {
    const url = new URL(`${MINO_FIREBASE.functionsBase}/${action}`);
    Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
    const res = await fetch(url.toString(), { method: 'GET' });
    return res.json();
}

function addressAcEscape(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

/** A flat/house detail no map result can supply: "#738", "A-12", "302". */
function addressAcHouseToken(text) {
    const token = String(text || '').trim().match(/^#?[\w-]*\d[\w-]*/);
    if (!token) return '';
    return token[0].length <= 12 ? token[0] : '';
}

/** The last comma segment is what the customer is searching for. */
function addressAcParse(value) {
    const parts = String(value || '').replace(/\s+/g, ' ').split(',');
    const last = (parts.pop() || '').trim();
    return { kept: parts.map((s) => s.trim()).filter(Boolean), last };
}

function addressAcQueryFrom(value) {
    const { kept, last } = addressAcParse(value);
    // A bare house number has nothing to look up yet.
    if (!kept.length && last && addressAcHouseToken(last) === last) return '';
    return last.slice(0, 120);
}

/** Replaces only the searched segment, keeping the flat/floor detail typed before it. */
function addressAcMerge(typed, picked) {
    const { kept, last } = addressAcParse(typed);
    const house = addressAcHouseToken(last);
    if (house && !picked.toLowerCase().includes(house.toLowerCase())) kept.push(house);
    return kept.concat(picked).join(', ');
}

function addressAcMenu() {
    return document.getElementById('address-suggestions');
}

/**
 * The cart panel clips its children, so the open menu is moved to <body> and
 * positioned against the field — same trick as the fulfillment dropdown.
 */
function addressAcPositionMenu() {
    const menu = addressAcMenu();
    const input = document.getElementById('customer-address');
    if (!menu || menu.hidden || !input) return;
    if (!input.offsetParent) {
        closeAddressSuggestions();
        return;
    }
    menu.classList.add('addr-ac-portal');
    if (menu.parentElement !== document.body) document.body.appendChild(menu);

    const gap = 4;
    const rect = input.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.width = `${rect.width}px`;

    const height = Math.min(menu.scrollHeight || 120, window.innerHeight * 0.4);
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    if (spaceBelow < height && rect.top > spaceBelow) {
        menu.style.top = 'auto';
        menu.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
        menu.style.bottom = 'auto';
        menu.style.top = `${rect.bottom + gap}px`;
    }
}

function closeAddressSuggestions() {
    const menu = addressAcMenu();
    addressAcItems = [];
    addressAcIndex = -1;
    if (menu) {
        menu.hidden = true;
        menu.innerHTML = '';
        menu.classList.remove('addr-ac-portal');
        menu.removeAttribute('style');
        const host = document.getElementById('address-autocomplete');
        if (host && menu.parentElement !== host) host.appendChild(menu);
    }
    const input = document.getElementById('customer-address');
    input?.setAttribute('aria-expanded', 'false');
    input?.removeAttribute('aria-activedescendant');
}

function addressAcShowNote(text) {
    const menu = addressAcMenu();
    if (!menu) return;
    addressAcItems = [];
    addressAcIndex = -1;
    menu.innerHTML = `<p class="addr-ac-note">${addressAcEscape(text)}</p>`;
    menu.hidden = false;
    addressAcPositionMenu();
}

function renderAddressSuggestions(items) {
    const menu = addressAcMenu();
    if (!menu) return;
    addressAcItems = items || [];
    addressAcIndex = -1;
    if (!addressAcItems.length) {
        addressAcShowNote('No matching address. Type it in full instead.');
        return;
    }
    menu.innerHTML = addressAcItems.map((s, i) => `
        <button type="button" class="addr-ac-item" role="option" aria-selected="false"
            id="addr-ac-opt-${i}" data-index="${i}">
            <span class="addr-ac-main">${addressAcEscape(s.main)}</span>
            ${s.secondary ? `<span class="addr-ac-sub">${addressAcEscape(s.secondary)}</span>` : ''}
        </button>
    `).join('');
    menu.hidden = false;
    addressAcPositionMenu();
    document.getElementById('customer-address')?.setAttribute('aria-expanded', 'true');
}

function highlightAddressSuggestion(index) {
    if (!addressAcItems.length) return;
    const count = addressAcItems.length;
    addressAcIndex = ((index % count) + count) % count;
    const menu = addressAcMenu();
    if (!menu) return;
    menu.querySelectorAll('.addr-ac-item').forEach((el, i) => {
        const on = i === addressAcIndex;
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) el.scrollIntoView({ block: 'nearest' });
    });
    document.getElementById('customer-address')
        ?.setAttribute('aria-activedescendant', `addr-ac-opt-${addressAcIndex}`);
}

async function requestAddressSuggestions(query) {
    if (addressAcCache.has(query)) {
        renderAddressSuggestions(addressAcCache.get(query));
        return;
    }
    const seq = ++addressAcSeq;
    try {
        const data = await addressAcFetch('addressSuggest', {
            q: query,
            session: addressAcSessionToken()
        });
        if (seq !== addressAcSeq) return;
        if (!data?.ok) {
            if (data?.error === 'places_disabled') addressAcOff = true;
            closeAddressSuggestions();
            return;
        }
        const items = Array.isArray(data.suggestions) ? data.suggestions : [];
        addressAcCache.set(query, items);
        renderAddressSuggestions(items);
    } catch (err) {
        if (seq !== addressAcSeq) return;
        console.warn('[address] suggest failed', err);
        closeAddressSuggestions();
    }
}

async function pickAddressSuggestion(index) {
    const picked = addressAcItems[index];
    if (!picked) return;
    const input = document.getElementById('customer-address');
    const fallback = [picked.main, picked.secondary].filter(Boolean).join(', ');
    closeAddressSuggestions();

    let text = fallback;
    try {
        const data = await addressAcFetch('addressDetails', {
            place_id: picked.place_id,
            session: addressAcSessionToken()
        });
        addressAcSession = '';
        if (!data?.ok) throw new Error(data?.error || 'places_failed');
        text = data.address || fallback;
        const pin = document.getElementById('customer-pincode');
        if (pin && data.pincode) pin.value = data.pincode;
        addressAcPicked = (data.lat != null && data.lng != null)
            ? { lat: data.lat, lng: data.lng, place_id: data.place_id || picked.place_id }
            : null;
    } catch (err) {
        console.warn('[address] details failed', err);
        addressAcPicked = null;
    }

    if (input) {
        input.value = addressAcMerge(input.value, text);
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
    if (typeof setCheckoutError === 'function') setCheckoutError('');
    if (typeof updatePlaceOrderButton === 'function') updatePlaceOrderButton();
}

function onAddressInput() {
    // Hand-edited text no longer matches the coordinates we picked.
    addressAcPicked = null;
    clearTimeout(addressAcTimer);
    if (!addressAcReady()) return;
    const query = addressAcQueryFrom(document.getElementById('customer-address')?.value);
    if (query.length < ADDRESS_AC_MIN_CHARS) {
        closeAddressSuggestions();
        return;
    }
    if (!addressAcCache.has(query)) addressAcShowNote('Searching…');
    addressAcTimer = setTimeout(() => requestAddressSuggestions(query), ADDRESS_AC_DEBOUNCE_MS);
}

function onAddressKeydown(e) {
    const menu = addressAcMenu();
    if (e.key === 'Escape') {
        if (menu && !menu.hidden) e.stopPropagation();
        closeAddressSuggestions();
        return;
    }
    if (!menu || menu.hidden || !addressAcItems.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightAddressSuggestion(addressAcIndex + 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightAddressSuggestion(addressAcIndex - 1);
    } else if (e.key === 'Enter' && addressAcIndex >= 0) {
        e.preventDefault();
        pickAddressSuggestion(addressAcIndex);
    }
}

/** Coordinates of the picked suggestion, sent with the order. */
function minoPickedAddressGeo() {
    return addressAcPicked;
}

function minoSetPickedAddressGeo(geo) {
    addressAcPicked = (geo && geo.lat != null && geo.lng != null)
        ? { lat: Number(geo.lat), lng: Number(geo.lng), place_id: geo.place_id || null }
        : null;
}

function initAddressAutocomplete() {
    const input = document.getElementById('customer-address');
    if (!input || input.dataset.addrAcBound) return;
    input.dataset.addrAcBound = '1';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'address-suggestions');
    input.addEventListener('input', onAddressInput);
    input.addEventListener('keydown', onAddressKeydown);
    input.addEventListener('blur', () => setTimeout(closeAddressSuggestions, 150));

    addressAcMenu()?.addEventListener('mousedown', (e) => {
        const btn = e.target.closest('.addr-ac-item');
        if (!btn) return;
        // Keep focus in the field so blur does not close the menu first.
        e.preventDefault();
        pickAddressSuggestion(Number(btn.dataset.index));
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('#address-autocomplete') || e.target.closest('#address-suggestions')) return;
        closeAddressSuggestions();
    });
    document.getElementById('cart-panel-scroll')
        ?.addEventListener('scroll', addressAcPositionMenu, { passive: true });
    window.addEventListener('resize', addressAcPositionMenu);
}
