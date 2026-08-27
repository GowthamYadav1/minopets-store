/** Last successful createOrder (for WhatsApp share). */
let lastPlacedOrder = null;

/** Client preview of applied coupon (server recalculates on createOrder). */
let appliedCoupon = null; // { code, amount, discount, discount_type, percentage, reusable }
let currentCheckoutStep = 1;
let paymentWindowOpened = false;
let paymentConfirming = false;
let razorpayOpenInFlight = false;

function checkoutApiReady() {
    if (typeof minoFunctionsEnabled === 'function' && minoFunctionsEnabled()) return true;
    return !!(MINO_API?.baseUrl && !String(MINO_API.baseUrl).includes('PASTE_'));
}

async function checkoutPost(action, extra) {
    const payload = Object.assign({}, extra || {}, { action });
    if (typeof minoFunctionsEnabled === 'function' && minoFunctionsEnabled() && typeof minoFunctionsPost === 'function') {
        const fn = {
            createOrder: 'createOrder',
            createRazorpayOrder: 'createRazorpayOrder',
            confirmRazorpayPayment: 'confirmRazorpayPayment'
        }[action] || action;
        return minoFunctionsPost(fn, payload);
    }
    payload.token = MINO_API.token;
    payload.origin = minoStoreOrigin();
    const res = await fetch(MINO_API.baseUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    });
    return res.json();
}

function getAppliedCouponCode() {
    return appliedCoupon?.code || '';
}

function getAppliedCouponDiscount(productSubtotal, totalBase) {
    if (!appliedCoupon) return 0;
    const products = Math.max(0, Number(productSubtotal) || 0);
    if (appliedCoupon.discount_type === 'percent') {
        const percentage = Number(appliedCoupon.percentage) || 0;
        return Math.min(products, Math.round(products * percentage / 100));
    }
    const amount = Number(appliedCoupon.amount) || Number(appliedCoupon.discount) || 0;
    const maxBase = Number(totalBase);
    if (!isFinite(maxBase) || maxBase < 0) return 0;
    return Math.min(amount, maxBase);
}

function setCouponMsg(text, ok) {
    const el = document.getElementById('coupon-msg');
    if (!el) return;
    if (!text) {
        el.textContent = '';
        el.classList.add('hidden');
        return;
    }
    el.textContent = text;
    el.classList.remove('hidden', 'text-emerald-700', 'text-red-600');
    el.classList.add(ok ? 'text-emerald-700' : 'text-red-600');
}

function clearAppliedCoupon() {
    appliedCoupon = null;
    setCouponMsg('');
    updateCartUI(false);
}

async function applyCoupon() {
    setCouponMsg('');
    const code = document.getElementById('coupon-code')?.value.trim().toUpperCase() || '';
    const phone = checkoutIdentityPhone();
    if (!code) {
        clearAppliedCoupon();
        setCouponMsg('Enter a coupon code.', false);
        return;
    }
    if (!MINO_API?.baseUrl) {
        setCouponMsg('API not configured.', false);
        return;
    }

    const subtotal = typeof getCartSubtotal === 'function' ? getCartSubtotal() : 0;
    const fulfillment = document.getElementById('fulfillment')?.value || '';
    const shipping = typeof getShippingFee === 'function' ? getShippingFee(subtotal, fulfillment) : 0;

    const sep = MINO_API.baseUrl.includes('?') ? '&' : '?';
    const url =
        `${MINO_API.baseUrl}${sep}action=validateCoupon` +
        `&token=${encodeURIComponent(MINO_API.token)}` +
        `&origin=${encodeURIComponent(minoStoreOrigin())}` +
        `&code=${encodeURIComponent(code)}` +
        `&phone=${encodeURIComponent(phone)}` +
        `&subtotal=${encodeURIComponent(String(subtotal))}` +
        `&total_base=${encodeURIComponent(String(subtotal + shipping))}`;

    try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        const data = await res.json();
        if (!data.ok) {
            appliedCoupon = null;
            setCouponMsg(friendlyCouponError(data), false);
            updateCartUI(false);
            return;
        }
        appliedCoupon = {
            code: data.code,
            amount: data.amount,
            discount: data.discount,
            discount_type: data.discount_type || 'fixed',
            percentage: Number(data.percentage) || 0,
            reusable: Boolean(data.reusable)
        };
        const input = document.getElementById('coupon-code');
        if (input) input.value = data.code;
        const offer = data.discount_type === 'percent'
            ? `${data.percentage}% off`
            : `₹${data.discount}/- off`;
        setCouponMsg(`Applied ${offer} (−₹${data.discount}/-)`, true);
        updateCartUI(false);
    } catch (err) {
        console.error('[checkout] validateCoupon failed', err);
        setCouponMsg('Could not validate coupon. Try again.', false);
    }
}

function friendlyCouponError(data) {
    switch (data?.error) {
        case 'coupon_not_found':
            return 'Coupon not found.';
        case 'coupon_used':
            return 'This coupon was already used.';
        case 'coupon_reserved':
            return 'Coupon is reserved on another pending order.';
        case 'coupon_expired':
            return 'This coupon has expired.';
        case 'coupon_phone_mismatch':
            return 'This coupon is for a different phone number.';
        case 'invalid_phone':
            return 'Enter your phone first — this coupon is locked to a number.';
        case 'coupon_invalid_percentage':
            return 'This coupon has an invalid percentage.';
        case 'coupon_inactive':
            return 'Coupon is not active.';
        default:
            return data?.error || 'Invalid coupon.';
    }
}

function mapFulfillment(uiValue) {
    return uiValue === 'Local Delivery' ? 'local_delivery' : 'pickup';
}

function getPickupMapsUrl() {
    const fromSheet = String(AppState?.storeConfig?.pickup_maps_url || '').trim();
    if (fromSheet && !/REPLACE_WITH/i.test(fromSheet)) return fromSheet;
    const fromApi = String(MINO_API?.pickupMapsUrl || '').trim();
    if (fromApi && !/REPLACE_WITH/i.test(fromApi)) return fromApi;
    return 'https://www.google.com/maps/search/?api=1&query=The+Rameshwaram+Cafe+JP+Nagar';
}

function isStorePickup() {
    return document.getElementById('fulfillment')?.value === 'Store Pickup';
}

function checkoutLastTen(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
}

function checkoutIdentityPhone() {
    const user = typeof minoCurrentUser === 'function' ? minoCurrentUser() : null;
    if (user?.phoneNumber) return checkoutLastTen(user.phoneNumber);
    if (window.minoUserProfile?.phone) return checkoutLastTen(window.minoUserProfile.phone);
    return checkoutLastTen(document.getElementById('customer-phone')?.value);
}

function checkoutIdentityName() {
    const profileName = String(window.minoUserProfile?.name || '').trim();
    if (profileName) return profileName;
    return document.getElementById('customer-name')?.value.trim() || '';
}

function checkoutContactReady() {
    const name = checkoutIdentityName();
    const phone = checkoutIdentityPhone();
    return name.length >= 2 && phone.length === 10;
}

function fillCheckoutIdentityFields() {
    const user = typeof minoCurrentUser === 'function' ? minoCurrentUser() : null;
    const nameEl = document.getElementById('customer-name');
    const phoneEl = document.getElementById('customer-phone');
    const signedInPhone = user?.phoneNumber ? checkoutLastTen(user.phoneNumber) : '';
    if (phoneEl) {
        if (signedInPhone) phoneEl.value = signedInPhone;
        phoneEl.disabled = !!signedInPhone;
        phoneEl.readOnly = !!signedInPhone;
    }
    if (nameEl && user) {
        const profileName = String(window.minoUserProfile?.name || '').trim();
        if (profileName && !nameEl.value.trim()) nameEl.value = profileName;
    }
}

function renderCheckoutIdentity() {
    const contact = document.getElementById('checkout-contact-fields');
    const orderSlot = document.getElementById('checkout-order-contact-slot');
    const addressSlot = document.getElementById('checkout-address-contact-slot');
    const coupon = document.getElementById('checkout-coupon-fields');
    const orderCouponSlot = document.getElementById('checkout-order-coupon-slot');
    const addressCouponSlot = document.getElementById('checkout-address-coupon-slot');
    if (!contact || !orderSlot || !addressSlot || !coupon || !orderCouponSlot || !addressCouponSlot) return;
    const signedIn = typeof minoCurrentUser === 'function' && !!minoCurrentUser();
    const complete = typeof minoProfileComplete === 'function' && minoProfileComplete();
    const delivery = document.getElementById('fulfillment')?.value === 'Local Delivery';
    fillCheckoutIdentityFields();
    contact.classList.toggle('hidden', signedIn && complete);
    if (!(signedIn && complete)) {
        (delivery && !signedIn ? addressSlot : orderSlot).appendChild(contact);
    }
    (delivery && !signedIn ? addressCouponSlot : orderCouponSlot).appendChild(coupon);
    updatePlaceOrderButton();
}

async function syncLoggedInCheckoutProfile() {
    const user = typeof minoCurrentUser === 'function' ? minoCurrentUser() : null;
    if (!user) return { ok: true };
    if (typeof minoProfileComplete === 'function' && minoProfileComplete() && window.minoUserProfile?.name) {
        return { ok: true };
    }
    const name = document.getElementById('customer-name')?.value.trim() || '';
    if (name.replace(/\s+/g, ' ').length < 2) return { ok: false, missingName: true };
    if (typeof minoSaveProfileFromCheckout !== 'function') return { ok: false };
    try {
        const saved = await minoSaveProfileFromCheckout(name);
        return { ok: !!saved };
    } catch (err) {
        console.warn('[checkout] profile', err);
        return { ok: false };
    }
}

function onFulfillmentChange() {
    const fulfillment = document.getElementById('fulfillment')?.value;
    const addressBlock = document.getElementById('checkout-address-fields');
    const deliveryHint = document.getElementById('fulfillment-delivery-hint');
    const pickupHint = document.getElementById('pickup-location-hint');
    const mapsLink = document.getElementById('pickup-maps-link');
    const mapsUrl = getPickupMapsUrl();

    if (fulfillment === 'Local Delivery') {
        addressBlock?.classList.remove('hidden');
        deliveryHint?.classList.remove('hidden');
        pickupHint?.classList.add('hidden');
    } else if (fulfillment === 'Store Pickup') {
        addressBlock?.classList.add('hidden');
        deliveryHint?.classList.add('hidden');
        pickupHint?.classList.remove('hidden');
        if (mapsLink) {
            mapsLink.href = mapsUrl;
            mapsLink.target = '_blank';
            mapsLink.rel = 'noopener noreferrer';
        }
        if (currentCheckoutStep === 2 && !lastPlacedOrder) goCheckoutStep(1);
    } else {
        addressBlock?.classList.add('hidden');
        deliveryHint?.classList.remove('hidden');
        pickupHint?.classList.add('hidden');
    }
    renderCheckoutProgress(currentCheckoutStep);
    renderCheckoutIdentity();
    updateCartUI(false);
    updatePlaceOrderButton();
    if (typeof renderSavedAddresses === 'function') renderSavedAddresses();
}

const FULFILLMENT_OPTIONS = {
    'Store Pickup': { label: 'Self Pickup', note: 'Free' },
    'Local Delivery': { label: 'Home Delivery', note: '₹150' }
};

function getFulfillmentMenu() {
    return document.querySelector('.pack-dd-menu.fulfillment-menu-portal')
        || document.querySelector('#fulfillment-dd .pack-dd-menu');
}

function restoreFulfillmentMenu() {
    const root = document.getElementById('fulfillment-dd');
    const menu = getFulfillmentMenu();
    if (!root || !menu) return;
    menu.classList.remove('is-open', 'fulfillment-menu-portal');
    menu.style.top = '';
    menu.style.bottom = '';
    menu.style.left = '';
    menu.style.width = '';
    menu.style.display = '';
    if (menu.parentElement !== root) root.appendChild(menu);
}

function positionFulfillmentMenu() {
    const root = document.getElementById('fulfillment-dd');
    const trigger = document.getElementById('fulfillment-trigger');
    const menu = getFulfillmentMenu();
    if (!root || !trigger || !menu) return;

    // Escape cart-panel transform + overflow so the menu is visible
    menu.classList.add('fulfillment-menu-portal');
    if (menu.parentElement !== document.body) document.body.appendChild(menu);

    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const width = Math.max(rect.width, 160);
    menu.style.left = `${Math.min(rect.left, window.innerWidth - width - 8)}px`;
    menu.style.width = `${width}px`;

    const menuHeight = Math.min(menu.scrollHeight || 120, window.innerHeight * 0.4);
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const openUp = spaceBelow < menuHeight && rect.top > spaceBelow;

    if (openUp) {
        menu.style.top = 'auto';
        menu.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
        menu.style.bottom = 'auto';
        menu.style.top = `${rect.bottom + gap}px`;
    }
    menu.classList.add('is-open');
}

function toggleFulfillmentMenu(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const root = document.getElementById('fulfillment-dd');
    if (!root) return;
    const willOpen = !root.classList.contains('is-open');

    // Close other pack menus without tearing down fulfillment yet
    document.querySelectorAll('.pack-dd.is-open').forEach((el) => {
        if (el.id === 'fulfillment-dd') return;
        el.classList.remove('is-open', 'pack-dd-up');
        const menu = el.querySelector('.pack-dd-menu');
        if (menu) {
            menu.style.top = '';
            menu.style.bottom = '';
            menu.style.left = '';
            menu.style.width = '';
        }
        el.querySelector('.pack-dd-trigger')?.setAttribute('aria-expanded', 'false');
    });

    const trigger = document.getElementById('fulfillment-trigger');
    if (willOpen) {
        root.classList.add('is-open');
        positionFulfillmentMenu();
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
    } else {
        restoreFulfillmentMenu();
        root.classList.remove('is-open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
}

function setFulfillmentValue(value, event) {
    if (event) event.stopPropagation();
    const opts = FULFILLMENT_OPTIONS[value];
    if (!opts) return;

    const input = document.getElementById('fulfillment');
    if (input) input.value = value;

    const display = document.getElementById('fulfillment-display');
    if (display) {
        display.innerHTML = `<span class="pack-dd-name">${opts.label}</span>`;
    }

    document.querySelectorAll('.pack-dd-menu.fulfillment-menu-portal .pack-dd-option, #fulfillment-dd .pack-dd-option').forEach((btn) => {
        const active = btn.getAttribute('data-fulfillment') === value;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (typeof closeAllPackMenus === 'function') closeAllPackMenus();
    restoreFulfillmentMenu();
    document.getElementById('fulfillment-dd')?.classList.remove('is-open');

    const trigger = document.getElementById('fulfillment-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');

    onFulfillmentChange();
}

function setCheckoutError(msg) {
    const el = document.getElementById('checkout-error');
    if (!el) return;
    if (!msg) {
        el.textContent = '';
        el.classList.add('hidden');
        return;
    }
    el.textContent = msg;
    el.classList.remove('hidden');
}

function setCheckoutOrderError(msg) {
    const el = document.getElementById('checkout-order-error');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
}

function checkoutOrderStepReady() {
    const hasCart = typeof AppState !== 'undefined' && Object.keys(AppState.cart || {}).length > 0;
    if (!hasCart) return false;
    const fulfillmentUi = document.getElementById('fulfillment')?.value || '';
    if (!FULFILLMENT_OPTIONS[fulfillmentUi]) return false;
    return fulfillmentUi === 'Store Pickup' ? checkoutContactReady() : true;
}

function checkoutAddressStepReady() {
    const fulfillmentUi = document.getElementById('fulfillment')?.value || '';
    if (fulfillmentUi === 'Store Pickup') return true;
    const address = document.getElementById('customer-address')?.value.trim() || '';
    const pincode = document.getElementById('customer-pincode')?.value.trim() || '';
    return fulfillmentUi === 'Local Delivery'
        && checkoutContactReady()
        && !!address
        && /^\d{6}$/.test(pincode);
}

/** True when every value needed to reserve the order is present. */
function checkoutRequiredFieldsReady() {
    return checkoutOrderStepReady() && checkoutAddressStepReady();
}

function renderCheckoutProgress(step) {
    const pickup = isStorePickup();
    document.getElementById('checkout-stepper')?.classList.toggle('is-pickup', pickup);
    const logical = Math.max(1, Math.min(4, Number(step) || 1));
    const currentVisual = pickup
        ? (logical <= 1 ? 1 : logical === 4 ? 3 : 2)
        : logical;
    document.querySelectorAll('[data-checkout-progress]').forEach((item) => {
        const itemStep = Number(item.dataset.checkoutProgress);
        const visual = pickup
            ? (itemStep === 1 ? 1 : itemStep === 3 ? 2 : itemStep === 4 ? 3 : 0)
            : itemStep;
        if (!visual) return;
        const dot = item.querySelector('.checkout-progress-dot');
        item.classList.toggle('is-active', visual === currentVisual);
        item.classList.toggle('is-complete', visual < currentVisual);
        if (dot) dot.textContent = visual < currentVisual ? '✓' : String(visual);
    });
    const fill = document.getElementById('checkout-progress-fill');
    if (fill) fill.style.width = `${((currentVisual - 1) / (pickup ? 2 : 3)) * 100}%`;
}

function showCheckoutPanel(id, visualStep) {
    document.querySelectorAll('#cart-panel-scroll > .checkout-step, #checkout-form > .checkout-step')
        .forEach((panel) => panel.classList.remove('is-active'));
    document.getElementById(id)?.classList.add('is-active');
    currentCheckoutStep = visualStep;
    renderCheckoutProgress(visualStep);
    const back = document.getElementById('checkout-back-btn');
    if (back) back.classList.toggle('hidden', visualStep === 1 || visualStep >= 3);
    document.getElementById('cart-panel-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof closeAddressSuggestions === 'function') closeAddressSuggestions();
}

function goCheckoutStep(step) {
    const n = Math.max(1, Math.min(4, Number(step) || 1));
    const ids = {
        1: 'checkout-step-order',
        2: 'checkout-step-address',
        3: 'checkout-step-payment',
        4: 'checkout-success'
    };
    showCheckoutPanel(ids[n], n);
    if (n === 2 && typeof renderSavedAddresses === 'function') renderSavedAddresses();
    updatePlaceOrderButton();
}

async function continueFromOrderStep() {
    setCheckoutOrderError('');
    const synced = await syncLoggedInCheckoutProfile();
    if (!synced.ok) {
        setCheckoutOrderError(synced.missingName
            ? 'Enter your name to continue.'
            : 'Could not save your name. Try again.');
        updatePlaceOrderButton();
        return;
    }
    if (!checkoutOrderStepReady()) {
        setCheckoutOrderError(isStorePickup()
            ? 'Enter your name, a valid 10-digit phone number, and select fulfillment.'
            : 'Select a fulfillment method.');
        updatePlaceOrderButton();
        return;
    }
    if (isStorePickup()) {
        placeOrder();
        return;
    }
    goCheckoutStep(2);
}

function continueToAddress() {
    continueFromOrderStep();
}

function returnToCheckoutForm() {
    goCheckoutStep(isStorePickup() ? 1 : 2);
}

function previousCheckoutStep() {
    if (currentCheckoutStep === 2 && !lastPlacedOrder) goCheckoutStep(1);
}

let placeOrderInFlight = false;

function updatePlaceOrderButton() {
    const btn = document.getElementById('place-order-btn');
    const addressBtn = document.getElementById('checkout-address-btn');
    const orderReady = checkoutOrderStepReady();
    const paymentReady = !placeOrderInFlight && checkoutRequiredFieldsReady();
    if (addressBtn) {
        addressBtn.disabled = placeOrderInFlight || !orderReady;
        addressBtn.innerHTML = placeOrderInFlight
            ? 'Preparing payment…'
            : (isStorePickup()
                ? 'Continue to payment <span>→</span>'
                : 'Continue to address <span>→</span>');
    }
    if (btn) {
        btn.disabled = !paymentReady;
        if (!placeOrderInFlight) btn.innerHTML = 'Continue to payment <span>→</span>';
    }
}

function setPlaceOrderBusy(busy) {
    const btn = document.getElementById('place-order-btn');
    placeOrderInFlight = !!busy;
    if (btn) btn.textContent = busy ? 'Preparing payment…' : 'Continue to payment';
    updatePlaceOrderButton();
}

function initCheckoutFormValidation() {
    const ids = ['customer-name', 'customer-phone', 'customer-address', 'customer-pincode'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.dataset.checkoutBound) return;
        el.dataset.checkoutBound = '1';
        el.addEventListener('input', () => {
            setCheckoutError('');
            setCheckoutOrderError('');
            updatePlaceOrderButton();
        });
    });
    const nameEl = document.getElementById('customer-name');
    if (nameEl && !nameEl.dataset.profileSyncBound) {
        nameEl.dataset.profileSyncBound = '1';
        nameEl.addEventListener('blur', () => {
            if (typeof minoCurrentUser === 'function' && minoCurrentUser()) {
                syncLoggedInCheckoutProfile();
            }
        });
    }
    if (typeof initAddressAutocomplete === 'function') initAddressAutocomplete();
    renderCheckoutIdentity();
    updatePlaceOrderButton();
}

function buildCartItemsPayload() {
    const items = [];
    for (const key in AppState.cart) {
        const meta = typeof getCartLineMeta === 'function' ? getCartLineMeta(key) : null;
        if (!meta || !meta.qty) continue;
        if (meta.pack) {
            items.push({
                product_id: String(meta.item.id),
                qty: meta.fishUnits,
                pack_key: meta.pack.key,
                pack_qty: meta.qty,
                pack_label: meta.pack.label
            });
        } else {
            items.push({ product_id: String(meta.item.id), qty: meta.qty });
        }
    }
    return items;
}

function friendlyOrderError(data) {
    if (!data || !data.error) return 'Could not place order. Try again.';
    switch (data.error) {
        case 'unauthorized':
            return 'Store API token rejected. Check api-config.js.';
        case 'origin_not_allowed':
        case 'missing_origin':
            return 'Store API blocked this site origin. Add it to Config allowed_origins in Sheets.';
        case 'profile_incomplete':
            return 'Enter your name to continue.';
        case 'auth_invalid':
        case 'auth_required':
            return 'Your session expired. Sign in again.';
        case 'invalid_phone':
            return 'Enter a valid 10-digit phone number.';
        case 'invalid_name':
            return 'Please enter your name.';
        case 'address_required':
            return 'Address and pincode are required for delivery.';
        case 'empty_cart':
            return 'Your cart is empty.';
        case 'busy_retry':
            return 'Server busy — wait a moment and try again.';
        case 'insufficient_stock': {
            const name = products.find((p) => String(p.id) === String(data.product_id))?.name || `Item ${data.product_id}`;
            return `${name}: only ${data.available} left (you asked for ${data.requested}).`;
        }
        case 'unknown_product':
            return 'One of the items is no longer available.';
        case 'coupon_not_found':
        case 'coupon_used':
        case 'coupon_reserved':
        case 'coupon_expired':
        case 'coupon_phone_mismatch':
        case 'coupon_inactive':
            return friendlyCouponError(data);
        default:
            return String(data.error);
    }
}

async function placeOrder() {
    if (placeOrderInFlight) return;
    setCheckoutError('');
    setCheckoutOrderError('');
    const synced = await syncLoggedInCheckoutProfile();
    if (!synced.ok) {
        setCheckoutOrderError(synced.missingName
            ? 'Enter your name to continue.'
            : 'Could not save your name. Try again.');
        goCheckoutStep(1);
        return;
    }
    if (!checkoutRequiredFieldsReady()) {
        if (isStorePickup()) {
            setCheckoutOrderError('Enter your name, a valid 10-digit phone number, and select fulfillment.');
            goCheckoutStep(1);
        } else {
            setCheckoutError('Enter your contact details, delivery address, and a valid 6-digit pincode.');
            goCheckoutStep(2);
        }
        updatePlaceOrderButton();
        return;
    }
    if (!checkoutApiReady()) {
        setCheckoutError('Order API not configured.');
        return;
    }

    const completeProfile = typeof minoProfileComplete === 'function' && minoProfileComplete();
    const name = completeProfile
        ? (window.minoUserProfile?.name || checkoutIdentityName())
        : checkoutIdentityName();
    const phone = completeProfile
        ? (window.minoUserProfile?.phone || checkoutIdentityPhone())
        : checkoutIdentityPhone();
    const fulfillmentUi = document.getElementById('fulfillment')?.value || '';
    const address = document.getElementById('customer-address')?.value.trim() || '';
    const pincode = document.getElementById('customer-pincode')?.value.trim() || '';

    const payload = {
        customer_name: name,
        customer_phone: phone,
        fulfillment: mapFulfillment(fulfillmentUi),
        address: fulfillmentUi === 'Store Pickup' ? '' : address,
        pincode: fulfillmentUi === 'Store Pickup' ? '' : pincode,
        items: buildCartItemsPayload(),
        coupon_code: appliedCoupon?.code || document.getElementById('coupon-code')?.value.trim() || ''
    };
    const geo = fulfillmentUi === 'Store Pickup'
        ? null
        : (typeof minoPickedAddressGeo === 'function' ? minoPickedAddressGeo() : null);
    if (geo) payload.geo = geo;

    const cartSnapshot = Object.assign({}, AppState.cart);
    setPlaceOrderBusy(true);
    try {
        const data = await checkoutPost('createOrder', payload);
        if (!data.ok) {
            returnToCheckoutForm();
            const err = friendlyOrderError(data);
            if (isStorePickup()) setCheckoutOrderError(err);
            else setCheckoutError(err);
            if ((data.error === 'insufficient_stock' || data.error === 'insufficient_stock') && typeof loadStock === 'function') {
                await loadStock(true);
                if (typeof renderCurrentView === 'function') renderCurrentView();
                updateCartUI(false);
            }
            return;
        }

        lastPlacedOrder = {
            ...data,
            customer_name: name,
            customer_phone: phone,
            cart_snapshot: cartSnapshot,
            cart_cleared: false
        };
        if (data.stock && AppState) {
            AppState.stock = data.stock;
            AppState.stockLoadedAt = Date.now();
            if (typeof applyStockToProducts === 'function') applyStockToProducts();
            if (typeof persistStockCache === 'function') persistStockCache();
        }

        if (typeof saveCheckoutAddressForUser === 'function') {
            saveCheckoutAddressForUser().catch(() => {});
        }

        goCheckoutStep(3);
        await startRazorpayPayment();
    } catch (err) {
        console.error('[checkout] createOrder failed', err);
        returnToCheckoutForm();
        const networkMsg = 'Network error placing order. Check connection and try again.';
        if (isStorePickup()) setCheckoutOrderError(networkMsg);
        else setCheckoutError(networkMsg);
    } finally {
        setPlaceOrderBusy(false);
    }
}

function clearCartAfterOrder(snapshot) {
    const ordered = snapshot && typeof snapshot === 'object' ? snapshot : AppState.cart;
    const keys = Object.keys(ordered);
    const productIds = new Set();
    keys.forEach((key) => {
        const parsed = typeof parseCartKey === 'function' ? parseCartKey(key) : { productId: key };
        productIds.add(String(parsed.productId));
        const remaining = Number(AppState.cart[key] || 0) - Number(ordered[key] || 0);
        if (remaining > 0) AppState.cart[key] = remaining;
        else delete AppState.cart[key];
    });
    productIds.forEach((pid) => {
        if (typeof syncQtyControls === 'function') syncQtyControls(pid);
        if (typeof syncPackCardUI === 'function') syncPackCardUI(pid);
    });
    updateCartUI(false);
}

function checkoutEscape(text) {
    const el = document.createElement('div');
    el.textContent = String(text || '');
    return el.innerHTML;
}

function showCheckoutSuccess(data) {
    const order = Object.assign({}, lastPlacedOrder || {}, data || {});
    lastPlacedOrder = order;
    const idEl = document.getElementById('success-order-id');
    const totalEl = document.getElementById('success-order-total');
    const untilEl = document.getElementById('success-order-until');
    if (idEl) idEl.textContent = order.order_id || '';
    if (totalEl) totalEl.textContent = order.total != null ? order.total : '';
    const nameEl = document.getElementById('success-customer-name');
    if (nameEl) nameEl.textContent = String(order.customer_name || 'Customer').split(/\s+/)[0];
    const dateEl = document.getElementById('success-order-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
    const subtotalEl = document.getElementById('success-order-subtotal');
    if (subtotalEl) subtotalEl.textContent = order.subtotal != null ? order.subtotal : 0;
    const shippingEl = document.getElementById('success-order-shipping');
    if (shippingEl) shippingEl.textContent = order.shipping != null ? order.shipping : 0;
    const itemsEl = document.getElementById('success-order-items');
    if (itemsEl) {
        itemsEl.innerHTML = (order.items || []).map((item) => `
            <div class="checkout-confirm-item">
                <span><strong>${checkoutEscape(item.name || 'Item')}</strong><small>Qty: ${Number(item.pack_qty || item.qty) || 1}</small></span>
                <strong>₹${Number(item.line_total || 0)}/-</strong>
            </div>
        `).join('');
    }
    const discWrap = document.getElementById('success-discount-wrap');
    if (discWrap) {
        if (order.discount > 0) {
            discWrap.classList.remove('hidden');
            const dEl = document.getElementById('success-order-discount');
            if (dEl) dEl.textContent = order.discount;
        } else {
            discWrap.classList.add('hidden');
        }
    }
    if (untilEl) {
        try {
            untilEl.textContent = order.reserved_until
                ? new Date(order.reserved_until).toLocaleString()
                : '—';
        } catch {
            untilEl.textContent = order.reserved_until || '—';
        }
    }
    goCheckoutStep(4);
}

function shareOrderBillOnWhatsApp() {
    const order = lastPlacedOrder;
    if (!order) return;
    const itemLines = (order.items || []).map((item) => {
        const qty = Number(item.pack_qty || item.qty) || 1;
        return `• ${qty}x ${item.name || item.product_id || 'Item'}`;
    });
    const lines = [
        `Hi ${order.customer_name || 'there'}! ✅ Payment confirmed.`,
        '',
        `Order ID: ${order.order_id || ''}`,
        'Items:',
        ...itemLines,
        '',
        `Subtotal: ₹${Number(order.subtotal || 0)}/-`,
        `Shipping: ₹${Number(order.shipping || 0)}/-`,
    ];
    if (Number(order.discount || 0) > 0) {
        lines.push(`Coupon${order.coupon_code ? ` (${order.coupon_code})` : ''}: −₹${Number(order.discount)}/-`);
    }
    lines.push(`Total paid: ₹${Number(order.total || 0)}/-`);
    lines.push(`Fulfillment: ${order.fulfillment === 'local_delivery' ? 'Local Delivery' : 'Store Pickup'}`);
    lines.push('');
    lines.push("We'll prepare your order shortly. Reply here if you have questions.");
    lines.push('— Mino Pets');
    const phone = String(order.customer_phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
}

let razorpayScriptPromise = null;

function loadRazorpayScript() {
    if (window.Razorpay) return Promise.resolve();
    if (razorpayScriptPromise) return razorpayScriptPromise;
    razorpayScriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
            razorpayScriptPromise = null;
            reject(new Error('razorpay_script_failed'));
        };
        document.head.appendChild(s);
    });
    return razorpayScriptPromise;
}

function razorpayPrefill() {
    const name =
        lastPlacedOrder?.customer_name ||
        checkoutIdentityName() ||
        '';
    const raw =
        lastPlacedOrder?.customer_phone ||
        checkoutIdentityPhone() ||
        '';
    const digits = String(raw).replace(/\D/g, '');
    const contact = digits.length >= 10 ? digits.slice(-10) : digits;
    return { name, contact };
}

function friendlyRazorpayStartError(err, data) {
    const code = String(data?.error || err?.message || '').trim();
    const rzpDesc = String(
        data?.razorpay?.error?.description ||
        data?.razorpay?.error?.code ||
        ''
    ).trim();

    if (/UrlFetchApp|external_request|permission to call/i.test(code)) {
        return 'Apps Script needs external URL permission. In the script editor: Run authorizeExternalRequests → Allow → Deploy New version.';
    }
    if (code === 'razorpay_script_failed') {
        return 'Could not load Razorpay checkout (blocked network/adblock?). Try another browser.';
    }
    if (/failed to fetch|networkerror|load failed/i.test(code)) {
        return 'Could not reach the payment server (network or CORS). If you have not uploaded the new shop files, Pay now still uses the old path. Or add this site origin to ALLOWED_ORIGINS and redeploy Functions.';
    }
    if (code === 'razorpay_disabled') {
        return 'Razorpay is off in Config. Set razorpay_enabled = TRUE and redeploy.';
    }
    if (code === 'hold_expired' || code === 'invalid_order_status' || code === 'order_not_pending') {
        return 'This stock reservation has expired. Close checkout, add the items again, and start a new order.';
    }
    if (code === 'payment_not_captured') {
        return 'Razorpay has not confirmed a captured payment yet. If money was debited, wait a moment and check payment status.';
    }
    if (code === 'unknown_action') {
        return 'Apps Script is outdated — paste latest Code.gs and Deploy → New version.';
    }
    if (code === 'origin_not_allowed') {
        return 'This site origin is not in Config allowed_origins.';
    }
    if (code === 'unauthorized') {
        return 'Store API token mismatch — check api-config.js vs Script Properties.';
    }
    if (code.includes('razorpay_http_401') || /authentication failed|invalid key/i.test(rzpDesc + code)) {
        return 'Razorpay keys rejected (401). Re-run setRazorpayCredentials with Test Key ID + Secret, then redeploy.';
    }
    if (code.includes('razorpay_http_400') || rzpDesc) {
        return `Razorpay error: ${rzpDesc || code}. Check Test mode keys.`;
    }
    if (code && code !== 'razorpay_order_failed') {
        return `Could not start Razorpay (${code}). Tap Pay now to try again.`;
    }
    return 'Could not start Razorpay. Tap Pay now to try again.';
}

const PAYMENT_FAILURE_DEFAULT_HTML = 'We couldn\'t complete your payment.<br>Your order is still reserved, so you can try again.';

function showPaymentFailure(message, canRestart = false) {
    const messageEl = document.getElementById('payment-failure-message');
    if (messageEl) {
        if (message) messageEl.textContent = message;
        else messageEl.innerHTML = PAYMENT_FAILURE_DEFAULT_HTML;
    }
    const untilEl = document.getElementById('failure-hold-until');
    let heldUntil = '';
    if (lastPlacedOrder?.reserved_until) {
        try {
            heldUntil = new Date(lastPlacedOrder.reserved_until).toLocaleString('en-IN');
        } catch {
            heldUntil = String(lastPlacedOrder.reserved_until);
        }
    }
    if (untilEl) untilEl.textContent = heldUntil;
    // An expired hold has nothing left to count down.
    document.getElementById('failure-hold-card')?.classList.toggle('hidden', canRestart || !heldUntil);
    document.getElementById('checkout-restart-btn')?.classList.toggle('hidden', !canRestart);
    document.querySelectorAll('#checkout-payment-failure .checkout-primary-btn, #checkout-payment-failure .checkout-secondary-btn')
        .forEach((button) => {
            if (button.id !== 'checkout-restart-btn') button.classList.toggle('hidden', canRestart);
        });
    showCheckoutPanel('checkout-payment-failure', 3);
}

function restartExpiredCheckout() {
    lastPlacedOrder = null;
    paymentWindowOpened = false;
    paymentConfirming = false;
    razorpayOpenInFlight = false;
    goCheckoutStep(1);
}

/**
 * Back out of a failed payment: release the stock hold server-side so the items
 * are sellable again, then reopen the form with the cart intact.
 */
async function cancelOrderAndEdit() {
    if (paymentConfirming || razorpayOpenInFlight) return;
    const btn = document.getElementById('checkout-edit-order-btn');
    const orderId = lastPlacedOrder?.order_id;
    if (!orderId) {
        restartExpiredCheckout();
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Releasing your items…';
    }
    try {
        const data = await checkoutPost('cancelOrder', {
            order_id: orderId,
            cancel_token: lastPlacedOrder?.cancel_token || ''
        });
        if (data?.error === 'order_already_paid') {
            if (data.stock && AppState) {
                AppState.stock = data.stock;
                AppState.stockLoadedAt = Date.now();
                if (typeof applyStockToProducts === 'function') applyStockToProducts();
                if (typeof persistStockCache === 'function') persistStockCache();
            }
            await confirmRazorpayPayment();
            return;
        }
        if (data?.stock && AppState) {
            AppState.stock = data.stock;
            AppState.stockLoadedAt = Date.now();
            if (typeof applyStockToProducts === 'function') applyStockToProducts();
            if (typeof persistStockCache === 'function') persistStockCache();
            if (typeof renderCurrentView === 'function') renderCurrentView();
        }
    } catch (err) {
        console.warn('[checkout] cancelOrder failed; hold will expire on its own', err);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Back to order details';
        }
    }
    lastPlacedOrder = null;
    paymentWindowOpened = false;
    paymentConfirming = false;
    razorpayOpenInFlight = false;
    setCheckoutError('');
    setCheckoutOrderError('');
    returnToCheckoutForm();
    updateCartUI(false);
}

async function startRazorpayPayment() {
    if (!lastPlacedOrder?.order_id) return;
    if (razorpayOpenInFlight || paymentConfirming) return;
    razorpayOpenInFlight = true;
    const errEl = document.getElementById('razorpay-status-err');
    const msgEl = document.getElementById('razorpay-status-msg');
    const btn = document.getElementById('razorpay-pay-btn');
    errEl?.classList.add('hidden');
    msgEl?.classList.add('hidden');
    showCheckoutPanel('checkout-step-payment', 3);

    if (!checkoutApiReady()) {
        showPaymentFailure('Payment service is not configured. Please contact Mino Pets.');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Opening checkout…';
    }

    let lastData = null;
    try {
        await loadRazorpayScript();
        const data = await checkoutPost('createRazorpayOrder', {
            order_id: lastPlacedOrder.order_id,
            cancel_token: lastPlacedOrder.cancel_token || ''
        });
        if (!data) throw new Error('Failed to fetch');
        lastData = data;
        if (data.already && (data.paid || data.status === 'paid')) {
            showPaymentConfirmed(data);
            return;
        }
        if (!data.ok || !data.razorpay_order_id || !data.key_id) {
            throw new Error(data.error || 'razorpay_order_failed');
        }

        lastPlacedOrder.razorpay_order_id = data.razorpay_order_id;
        if (data.reserved_until) lastPlacedOrder.reserved_until = data.reserved_until;
        if (data.razorpay_paid) {
            await confirmRazorpayPayment({
                order_id: lastPlacedOrder.order_id,
                razorpay_order_id: data.razorpay_order_id
            });
            return;
        }
        const prefill = razorpayPrefill();
        const rzp = new window.Razorpay({
            key: data.key_id,
            amount: data.amount_paisa,
            currency: data.currency || 'INR',
            name: 'Mino Pets',
            description: lastPlacedOrder.order_id,
            order_id: data.razorpay_order_id,
            prefill,
            notes: { mino_order_id: lastPlacedOrder.order_id },
            theme: { color: '#004B93' },
            async handler(response) {
                paymentConfirming = true;
                paymentWindowOpened = false;
                try {
                    await confirmRazorpayPayment({
                        order_id: lastPlacedOrder.order_id,
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature,
                        _confirmClaimed: true
                    });
                } finally {
                    razorpayOpenInFlight = false;
                }
            },
            modal: {
                ondismiss() {
                    window.setTimeout(() => {
                        if (!paymentWindowOpened || paymentConfirming) return;
                        paymentWindowOpened = false;
                        razorpayOpenInFlight = false;
                        showPaymentFailure('Payment was cancelled before completion. Your order is still reserved, so you can try again.');
                    }, 400);
                }
            }
        });
        rzp.on('payment.failed', (resp) => {
            paymentWindowOpened = false;
            razorpayOpenInFlight = false;
            const desc = resp?.error?.description || 'Payment failed.';
            showPaymentFailure(`${desc} No amount was confirmed; you can try again.`);
        });
        paymentWindowOpened = true;
        rzp.open();
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Pay now';
        }
    } catch (err) {
        console.error('[checkout] createRazorpayOrder failed', err, lastData);
        paymentWindowOpened = false;
        const canRestart = ['hold_expired', 'invalid_order_status', 'order_not_pending']
            .includes(String(lastData?.error || err?.message || ''));
        showPaymentFailure(friendlyRazorpayStartError(err, lastData), canRestart);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Pay now';
        }
    } finally {
        if (!paymentWindowOpened) razorpayOpenInFlight = false;
    }
}

async function confirmRazorpayPayment(opts = {}) {
    const orderId = opts.order_id || lastPlacedOrder?.order_id;
    if (!orderId) return { ok: false };
    if (paymentConfirming && !opts._confirmClaimed) return { ok: false, error: 'confirm_in_progress' };

    const errEl = document.getElementById('razorpay-status-err');
    const msgEl = document.getElementById('razorpay-status-msg');
    const checkBtn = document.getElementById('razorpay-check-btn');
    errEl?.classList.add('hidden');

    if (!checkoutApiReady()) {
        return { ok: false };
    }
    paymentConfirming = true;

    if (msgEl) {
        msgEl.textContent = 'Confirming payment…';
        msgEl.classList.remove('hidden');
    }
    if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.textContent = 'Checking…';
    }

    let confirmData = null;
    try {
        const body = {
            order_id: orderId,
            cancel_token: lastPlacedOrder?.cancel_token || ''
        };
        const rzpOrder = opts.razorpay_order_id || lastPlacedOrder?.razorpay_order_id;
        if (rzpOrder) body.razorpay_order_id = rzpOrder;
        if (opts.razorpay_payment_id) body.razorpay_payment_id = opts.razorpay_payment_id;
        if (opts.razorpay_signature) body.razorpay_signature = opts.razorpay_signature;

        const data = await checkoutPost('confirmRazorpayPayment', body);
        confirmData = data;

        if (data.ok && (data.paid || data.status === 'paid')) {
            showPaymentConfirmed(data);
            return data;
        }
        if (data.ok && !data.paid) {
            showPaymentFailure(`Payment is still ${data.razorpay_state || 'pending'}. If money was debited, wait a moment and check again.`);
            return data;
        }
        throw new Error(data.error || 'confirm_failed');
    } catch (err) {
        console.error('[checkout] confirmRazorpayPayment failed', err);
        const code = String(confirmData?.error || err?.message || '');
        const canRestart = ['hold_expired', 'invalid_order_status', 'order_not_pending']
            .includes(code);
        const message = canRestart
            ? 'This stock reservation has expired. Return to your cart to start a new checkout.'
            : 'We could not confirm the payment yet. If money was debited, use “I paid — check status” before retrying.';
        showPaymentFailure(message, canRestart);
        msgEl?.classList.add('hidden');
        return { ok: false };
    } finally {
        paymentConfirming = false;
        if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.textContent = 'Check payment status';
        }
    }
}

function showPaymentConfirmed(data) {
    if (lastPlacedOrder && !lastPlacedOrder.cart_cleared) {
        clearCartAfterOrder(lastPlacedOrder.cart_snapshot);
        clearAppliedCoupon();
        const couponInput = document.getElementById('coupon-code');
        if (couponInput) couponInput.value = '';
        lastPlacedOrder.cart_cleared = true;
    }
    if (lastPlacedOrder) lastPlacedOrder.status = 'paid';

    const msgEl = document.getElementById('razorpay-status-msg');
    const errEl = document.getElementById('razorpay-status-err');
    errEl?.classList.add('hidden');

    if (data.stock && typeof AppState !== 'undefined') {
        AppState.stock = data.stock;
        AppState.stockLoadedAt = Date.now();
        if (typeof applyStockToProducts === 'function') applyStockToProducts();
        if (typeof persistStockCache === 'function') persistStockCache();
    }
    showCheckoutSuccess(data);
}

function resetCheckoutForm() {
    lastPlacedOrder = null;
    paymentWindowOpened = false;
    paymentConfirming = false;
    razorpayOpenInFlight = false;
    setCheckoutError('');
    setCheckoutOrderError('');
    goCheckoutStep(1);
    renderCheckoutIdentity();
    updatePlaceOrderButton();
}

function finishCheckout() {
    resetCheckoutForm();
    closeCartPanel();
}

/** Thin GET lookup — prefills name/address when Customers sheet has this phone. */
async function lookupCustomerIfPossible() {
    const phoneRaw = document.getElementById('customer-phone')?.value.trim() || '';
    const digits = phoneRaw.replace(/\D/g, '');
    if (digits.length < 10) return;
    if (!MINO_API?.baseUrl || String(MINO_API.baseUrl).includes('PASTE_')) return;

    const sep = MINO_API.baseUrl.includes('?') ? '&' : '?';
    const url = `${MINO_API.baseUrl}${sep}action=lookupCustomer&token=${encodeURIComponent(MINO_API.token)}&origin=${encodeURIComponent(minoStoreOrigin())}&phone=${encodeURIComponent(phoneRaw)}`;

    try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        const data = await res.json();
        if (!data.ok || !data.customer) return;

        const nameEl = document.getElementById('customer-name');
        if (nameEl && !nameEl.value.trim() && data.customer.name) {
            nameEl.value = data.customer.name;
        }
        const addr = data.customer.address || data.customer.addresses?.[0];
        if (addr) {
            const aEl = document.getElementById('customer-address');
            const pEl = document.getElementById('customer-pincode');
            if (aEl && !aEl.value.trim() && addr.address) aEl.value = addr.address;
            if (pEl && !pEl.value.trim() && addr.pincode) pEl.value = addr.pincode;
        }
        updatePlaceOrderButton();
    } catch (err) {
        console.warn('[checkout] lookupCustomer failed', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initCheckoutFormValidation();
    });
} else {
    initCheckoutFormValidation();
}
