/** Last successful createOrder (for WhatsApp share). */
let lastPlacedOrder = null;

/** Client preview of applied coupon (server recalculates on createOrder). */
let appliedCoupon = null; // { code, amount, discount }

function getAppliedCouponCode() {
    return appliedCoupon?.code || '';
}

function getAppliedCouponDiscount(base) {
    if (!appliedCoupon) return 0;
    const amount = Number(appliedCoupon.amount) || 0;
    const maxBase = Number(base);
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
    const phone = document.getElementById('customer-phone')?.value.trim() || '';
    if (!code) {
        clearAppliedCoupon();
        setCouponMsg('Enter a coupon code.', false);
        return;
    }
    if (!phone || phone.replace(/\D/g, '').length < 10) {
        setCouponMsg('Enter your phone first — coupons are locked to a number.', false);
        return;
    }
    if (!MINO_API?.baseUrl) {
        setCouponMsg('API not configured.', false);
        return;
    }

    const subtotal = typeof getCartSubtotal === 'function' ? getCartSubtotal() : 0;
    const fulfillment = document.getElementById('fulfillment')?.value || '';
    const shipping = typeof getShippingFee === 'function' ? getShippingFee(subtotal, fulfillment) : 0;
    const base = subtotal + shipping;

    const sep = MINO_API.baseUrl.includes('?') ? '&' : '?';
    const url =
        `${MINO_API.baseUrl}${sep}action=validateCoupon` +
        `&token=${encodeURIComponent(MINO_API.token)}` +
        `&origin=${encodeURIComponent(minoStoreOrigin())}` +
        `&code=${encodeURIComponent(code)}` +
        `&phone=${encodeURIComponent(phone)}` +
        `&subtotal=${encodeURIComponent(String(base))}`;

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
            discount: data.discount
        };
        const input = document.getElementById('coupon-code');
        if (input) input.value = data.code;
        setCouponMsg(`Applied −₹${data.discount}/- (${data.code})`, true);
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
    return '';
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
        if (mapsUrl) {
            pickupHint?.classList.remove('hidden');
            if (mapsLink) mapsLink.href = mapsUrl;
        } else {
            pickupHint?.classList.add('hidden');
        }
    } else {
        addressBlock?.classList.add('hidden');
        deliveryHint?.classList.remove('hidden');
        pickupHint?.classList.add('hidden');
    }
    updateCartUI(false);
    updatePlaceOrderButton();
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

/** True when required checkout fields (and cart) are ready to place an order. */
function checkoutRequiredFieldsReady() {
    const hasCart = typeof AppState !== 'undefined' && Object.keys(AppState.cart || {}).length > 0;
    if (!hasCart) return false;

    const name = document.getElementById('customer-name')?.value.trim() || '';
    const phone = document.getElementById('customer-phone')?.value.trim() || '';
    const fulfillmentUi = document.getElementById('fulfillment')?.value || '';
    const address = document.getElementById('customer-address')?.value.trim() || '';
    const pincode = document.getElementById('customer-pincode')?.value.trim() || '';

    if (!name) return false;
    if (!phone || phone.replace(/\D/g, '').length < 10) return false;
    if (!fulfillmentUi || !FULFILLMENT_OPTIONS[fulfillmentUi]) return false;
    if (fulfillmentUi === 'Local Delivery' && (!address || !pincode)) return false;
    return true;
}

let placeOrderInFlight = false;

function updatePlaceOrderButton() {
    const btn = document.getElementById('place-order-btn');
    if (!btn) return;
    const ready = !placeOrderInFlight && checkoutRequiredFieldsReady();
    btn.disabled = !ready;
    btn.classList.toggle('opacity-50', !ready);
    btn.classList.toggle('cursor-not-allowed', !ready);
    btn.classList.toggle('hover:bg-brand-blue-dark', ready);
    btn.classList.toggle('active:scale-[0.98]', ready);
    if (!placeOrderInFlight) btn.textContent = 'Place order';
}

function setPlaceOrderBusy(busy) {
    const btn = document.getElementById('place-order-btn');
    if (!btn) return;
    placeOrderInFlight = !!busy;
    btn.textContent = busy ? 'Placing order…' : 'Place order';
    btn.classList.toggle('opacity-70', busy);
    btn.classList.toggle('cursor-wait', busy);
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
            updatePlaceOrderButton();
        });
    });
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
    setCheckoutError('');
    if (!checkoutRequiredFieldsReady()) {
        updatePlaceOrderButton();
        return;
    }
    if (!MINO_API?.baseUrl || String(MINO_API.baseUrl).includes('PASTE_')) {
        setCheckoutError('Order API not configured.');
        return;
    }

    const name = document.getElementById('customer-name')?.value.trim() || '';
    const phone = document.getElementById('customer-phone')?.value.trim() || '';
    const fulfillmentUi = document.getElementById('fulfillment')?.value || '';
    const address = document.getElementById('customer-address')?.value.trim() || '';
    const pincode = document.getElementById('customer-pincode')?.value.trim() || '';

    const payload = {
        token: MINO_API.token,
        origin: minoStoreOrigin(),
        action: 'createOrder',
        customer_name: name,
        customer_phone: phone,
        fulfillment: mapFulfillment(fulfillmentUi),
        address,
        pincode,
        items: buildCartItemsPayload(),
        coupon_code: appliedCoupon?.code || document.getElementById('coupon-code')?.value.trim() || ''
    };

    setPlaceOrderBusy(true);
    try {
        const res = await fetch(MINO_API.baseUrl, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.ok) {
            setCheckoutError(friendlyOrderError(data));
            if (data.error === 'insufficient_stock' && typeof loadStock === 'function') {
                await loadStock(true);
                if (typeof renderCurrentView === 'function') renderCurrentView();
                updateCartUI(false);
            }
            return;
        }

        lastPlacedOrder = data;
        if (data.stock && AppState) {
            AppState.stock = data.stock;
            AppState.stockLoadedAt = Date.now();
            if (typeof applyStockToProducts === 'function') applyStockToProducts();
            if (typeof persistStockCache === 'function') persistStockCache();
        }

        clearCartAfterOrder();
        clearAppliedCoupon();
        const couponInput = document.getElementById('coupon-code');
        if (couponInput) couponInput.value = '';
        showCheckoutSuccess(data);
    } catch (err) {
        console.error('[checkout] createOrder failed', err);
        setCheckoutError('Network error placing order. Check connection and try again.');
    } finally {
        setPlaceOrderBusy(false);
    }
}

function clearCartAfterOrder() {
    const keys = Object.keys(AppState.cart);
    const productIds = new Set();
    keys.forEach((key) => {
        const parsed = typeof parseCartKey === 'function' ? parseCartKey(key) : { productId: key };
        productIds.add(String(parsed.productId));
    });
    AppState.cart = {};
    productIds.forEach((pid) => {
        document.querySelectorAll(`[id="qty-${pid}"]`).forEach((el) => { el.innerText = 0; });
        if (typeof syncQtyControls === 'function') syncQtyControls(pid);
        if (typeof syncPackCardUI === 'function') syncPackCardUI(pid);
    });
    updateCartUI(false);
}

function showCheckoutSuccess(data) {
    document.getElementById('cart-active-summary')?.classList.add('hidden');
    document.getElementById('checkout-form')?.classList.add('hidden');
    const success = document.getElementById('checkout-success');
    success?.classList.remove('hidden');
    const idEl = document.getElementById('success-order-id');
    const totalEl = document.getElementById('success-order-total');
    const untilEl = document.getElementById('success-order-until');
    if (idEl) idEl.textContent = data.order_id || '';
    if (totalEl) totalEl.textContent = data.total != null ? data.total : '';
    const discWrap = document.getElementById('success-discount-wrap');
    if (discWrap) {
        if (data.discount > 0) {
            discWrap.classList.remove('hidden');
            const dEl = document.getElementById('success-order-discount');
            if (dEl) dEl.textContent = data.discount;
        } else {
            discWrap.classList.add('hidden');
        }
    }
    if (untilEl) {
        try {
            untilEl.textContent = data.reserved_until
                ? new Date(data.reserved_until).toLocaleString()
                : '—';
        } catch {
            untilEl.textContent = data.reserved_until || '—';
        }
    }

    const pay = data.pay || {};
    const upiEl = document.getElementById('pay-upi-id');
    const nameEl = document.getElementById('pay-upi-name');
    const linkEl = document.getElementById('pay-upi-link');
    const qrEl = document.getElementById('pay-upi-qr');
    if (upiEl) upiEl.textContent = pay.upi_id || '—';
    if (nameEl) nameEl.textContent = pay.payee_name || 'Mino Pets';

    if (linkEl) {
        if (pay.upi_uri) {
            linkEl.href = pay.upi_uri;
            linkEl.classList.remove('hidden');
            linkEl.classList.add('block');
        } else {
            linkEl.classList.add('hidden');
            linkEl.classList.remove('block');
        }
    }

    if (qrEl && pay.upi_uri) {
        qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(pay.upi_uri)}`;
        qrEl.classList.remove('hidden');
    } else if (qrEl) {
        qrEl.classList.add('hidden');
        qrEl.removeAttribute('src');
    }

    const phonePeOn = !!(pay.phonepe_enabled || AppState?.storeConfig?.phonepe_enabled);
    configurePayUiMode(phonePeOn);

    document.getElementById('pay-report-msg')?.classList.add('hidden');
    document.getElementById('pay-report-err')?.classList.add('hidden');
    document.getElementById('phonepe-status-msg')?.classList.add('hidden');
    document.getElementById('phonepe-status-err')?.classList.add('hidden');
    const reportBtn = document.getElementById('report-paid-btn');
    if (reportBtn) {
        reportBtn.disabled = false;
        reportBtn.textContent = 'I have paid';
        reportBtn.classList.remove('opacity-60', 'cursor-not-allowed', 'hidden');
    }
    const ppBtn = document.getElementById('phonepe-pay-btn');
    if (ppBtn) {
        ppBtn.disabled = false;
        ppBtn.textContent = 'Pay with PhonePe';
    }
}

/** PhonePe primary + UPI fallback, or UPI-only. */
function configurePayUiMode(phonePeOn) {
    const ppBlock = document.getElementById('pay-phonepe-block');
    const details = document.getElementById('pay-upi-details');
    const summary = document.getElementById('pay-upi-summary');
    const checkBtn = document.getElementById('phonepe-check-btn');
    const reportBtn = document.getElementById('report-paid-btn');

    details?.classList.remove('hidden');
    reportBtn?.classList.remove('hidden');

    if (phonePeOn) {
        ppBlock?.classList.remove('hidden');
        summary?.classList.remove('hidden');
        if (details) details.open = false;
        checkBtn?.classList.add('hidden');
    } else {
        ppBlock?.classList.add('hidden');
        summary?.classList.add('hidden');
        if (details) details.open = true;
        checkBtn?.classList.add('hidden');
    }
}

function phonePeReturnUrl(orderId) {
    const u = new URL(window.location.href);
    u.searchParams.set('phonepe_order', orderId);
    // Drop other pay noise
    u.searchParams.delete('phonepe_state');
    return u.toString();
}

function clearPhonePeQuery() {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('phonepe_order')) return;
    u.searchParams.delete('phonepe_order');
    u.searchParams.delete('phonepe_state');
    window.history.replaceState({}, '', u.pathname + u.search + u.hash);
}

async function startPhonePePayment() {
    if (!lastPlacedOrder?.order_id) return;
    const errEl = document.getElementById('phonepe-status-err');
    const msgEl = document.getElementById('phonepe-status-msg');
    const btn = document.getElementById('phonepe-pay-btn');
    errEl?.classList.add('hidden');
    msgEl?.classList.add('hidden');

    if (!MINO_API?.baseUrl || String(MINO_API.baseUrl).includes('PASTE_')) {
        if (errEl) {
            errEl.textContent = 'API not configured.';
            errEl.classList.remove('hidden');
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Opening PhonePe…';
    }

    try {
        const res = await fetch(MINO_API.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: 'follow',
            body: JSON.stringify({
                token: MINO_API.token,
                origin: minoStoreOrigin(),
                action: 'createPhonePePayment',
                order_id: lastPlacedOrder.order_id,
                redirect_url: phonePeReturnUrl(lastPlacedOrder.order_id)
            })
        });
        const data = await res.json();
        if (data.already && data.status === 'paid') {
            showPhonePePaid(data);
            return;
        }
        if (!data.ok || !data.redirect_url) {
            throw new Error(data.error || 'phonepe_pay_failed');
        }
        if (data.merchant_order_id && lastPlacedOrder) {
            lastPlacedOrder.phonepe_moid = data.merchant_order_id;
        }
        sessionStorage.setItem(
            'mino_phonepe_pending',
            JSON.stringify({
                order_id: lastPlacedOrder.order_id,
                total: lastPlacedOrder.total,
                pay: lastPlacedOrder.pay,
                merchant_order_id: data.merchant_order_id || '',
                reserved_until: lastPlacedOrder.reserved_until
            })
        );
        window.location.href = data.redirect_url;
    } catch (err) {
        console.error('[checkout] createPhonePePayment failed', err);
        if (errEl) {
            errEl.textContent = 'Could not start PhonePe. Use UPI below, or try again.';
            errEl.classList.remove('hidden');
        }
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Pay with PhonePe';
        }
        const details = document.getElementById('pay-upi-details');
        if (details) details.open = true;
    }
}

async function confirmPhonePePayment(opts = {}) {
    const orderId = opts.order_id || lastPlacedOrder?.order_id;
    if (!orderId) return { ok: false };

    const errEl = document.getElementById('phonepe-status-err');
    const msgEl = document.getElementById('phonepe-status-msg');
    const checkBtn = document.getElementById('phonepe-check-btn');
    errEl?.classList.add('hidden');

    if (!MINO_API?.baseUrl || String(MINO_API.baseUrl).includes('PASTE_')) {
        return { ok: false };
    }

    if (msgEl) {
        msgEl.textContent = 'Confirming payment with PhonePe…';
        msgEl.classList.remove('hidden');
    }
    if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.textContent = 'Checking…';
    }

    try {
        const body = {
            token: MINO_API.token,
            origin: minoStoreOrigin(),
            action: 'confirmPhonePePayment',
            order_id: orderId
        };
        if (opts.merchant_order_id || lastPlacedOrder?.phonepe_moid) {
            body.merchant_order_id = opts.merchant_order_id || lastPlacedOrder.phonepe_moid;
        }

        const res = await fetch(MINO_API.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: 'follow',
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (data.ok && (data.paid || data.status === 'paid')) {
            showPaymentConfirmed(data);
            return data;
        }
        if (data.ok && !data.paid) {
            if (msgEl) {
                msgEl.textContent = `Payment not completed yet (${data.phonepe_state || 'PENDING'}). Tap Check status after paying, or use UPI.`;
                msgEl.classList.remove('hidden');
            }
            document.getElementById('phonepe-check-btn')?.classList.remove('hidden');
            const details = document.getElementById('pay-upi-details');
            if (details) details.open = true;
            return data;
        }
        throw new Error(data.error || 'confirm_failed');
    } catch (err) {
        console.error('[checkout] confirmPhonePePayment failed', err);
        if (errEl) {
            errEl.textContent = 'Could not confirm payment yet. Tap Check status, or pay via UPI.';
            errEl.classList.remove('hidden');
        }
        msgEl?.classList.add('hidden');
        document.getElementById('phonepe-check-btn')?.classList.remove('hidden');
        return { ok: false };
    } finally {
        if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.textContent = 'Check payment status';
        }
    }
}

function showPaymentConfirmed(data) {
    clearPhonePeQuery();
    sessionStorage.removeItem('mino_phonepe_pending');
    if (lastPlacedOrder) lastPlacedOrder.status = 'paid';

    const msgEl = document.getElementById('phonepe-status-msg');
    const errEl = document.getElementById('phonepe-status-err');
    const reportMsg = document.getElementById('pay-report-msg');
    errEl?.classList.add('hidden');

    const thanks = data.already
        ? 'Payment already confirmed — thank you!'
        : 'Payment confirmed — order is paid. We’ll prepare your fish.';
    if (msgEl && !document.getElementById('pay-phonepe-block')?.classList.contains('hidden')) {
        msgEl.textContent = thanks;
        msgEl.classList.remove('hidden');
    }
    if (reportMsg) {
        reportMsg.textContent = thanks;
        reportMsg.classList.remove('hidden');
    }

    document.getElementById('phonepe-pay-btn')?.classList.add('hidden');
    document.getElementById('phonepe-check-btn')?.classList.add('hidden');
    document.getElementById('report-paid-btn')?.classList.add('hidden');
    document.getElementById('pay-upi-details')?.classList.add('hidden');

    if (data.stock && typeof AppState !== 'undefined') {
        AppState.stock = data.stock;
        AppState.stockLoadedAt = Date.now();
        if (typeof applyStockToProducts === 'function') applyStockToProducts();
        if (typeof persistStockCache === 'function') persistStockCache();
    }
}

/** @deprecated use showPaymentConfirmed */
function showPhonePePaid(data) {
    showPaymentConfirmed(data);
}

/**
 * After PhonePe redirect: ?phonepe_order=MINO-…
 * Restores checkout success UI and confirms payment with Apps Script.
 */
async function handlePhonePeReturn() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('phonepe_order');
    if (!orderId) return;

    let pending = null;
    try {
        pending = JSON.parse(sessionStorage.getItem('mino_phonepe_pending') || 'null');
    } catch {
        pending = null;
    }

    lastPlacedOrder = {
        order_id: orderId,
        total: pending?.total,
        pay: {
            ...(pending?.pay || {}),
            phonepe_enabled: true
        },
        status: 'pending_payment',
        reserved_until: pending?.reserved_until,
        phonepe_moid: pending?.merchant_order_id || ''
    };

    if (typeof toggleCart === 'function') {
        const drawer = document.getElementById('cart-drawer');
        const open = drawer && !drawer.classList.contains('translate-x-full');
        if (!open) toggleCart();
    }

    showCheckoutSuccess({
        order_id: orderId,
        total: lastPlacedOrder.total,
        reserved_until: lastPlacedOrder.reserved_until,
        pay: lastPlacedOrder.pay,
        discount: 0
    });

    document.getElementById('phonepe-check-btn')?.classList.remove('hidden');

    // PhonePe can lag a second after redirect
    let result = await confirmPhonePePayment({ order_id: orderId, merchant_order_id: lastPlacedOrder.phonepe_moid });
    if (result?.ok && !result.paid && result.phonepe_state === 'PENDING') {
        await new Promise((r) => setTimeout(r, 2000));
        result = await confirmPhonePePayment({ order_id: orderId, merchant_order_id: lastPlacedOrder.phonepe_moid });
    }
}

function copyPayUpi() {
    const upi = document.getElementById('pay-upi-id')?.textContent?.trim();
    if (!upi || upi === '—') return;
    navigator.clipboard?.writeText(upi).then(() => {
        const btn = document.querySelector('#pay-instructions button');
        if (!btn) return;
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = prev; }, 1200);
    }).catch(() => alert(`UPI ID: ${upi}`));
}

async function reportPayment() {
    if (!lastPlacedOrder?.order_id) return;
    const msgEl = document.getElementById('pay-report-msg');
    const errEl = document.getElementById('pay-report-err');
    const btn = document.getElementById('report-paid-btn');
    msgEl?.classList.add('hidden');
    errEl?.classList.add('hidden');

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Reporting…';
    }

    try {
        const res = await fetch(MINO_API.baseUrl, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                token: MINO_API.token,
                origin: minoStoreOrigin(),
                action: 'reportPayment',
                order_id: lastPlacedOrder.order_id
            })
        });
        const data = await res.json();
        if (!data.ok) {
            if (errEl) {
                errEl.textContent = data.error === 'invalid_status'
                    ? `Order cannot be reported (status: ${data.status}).`
                    : (data.error || 'Could not report payment.');
                errEl.classList.remove('hidden');
            }
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'I have paid';
            }
            return;
        }
        lastPlacedOrder.status = data.status || 'payment_reported';
        if (data.paid || data.status === 'paid') {
            showPaymentConfirmed(data);
            return;
        }
        if (msgEl) {
            msgEl.textContent = data.already
                ? 'Payment already reported. We’ll confirm and update you.'
                : 'Thanks — payment reported. We’ll confirm and pack your order.';
            msgEl.classList.remove('hidden');
        }
        if (btn) {
            btn.textContent = 'Payment reported';
            btn.classList.add('opacity-60', 'cursor-not-allowed');
        }
    } catch (err) {
        console.error('[checkout] reportPayment failed', err);
        if (errEl) {
            errEl.textContent = 'Network error. Try again.';
            errEl.classList.remove('hidden');
        }
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'I have paid';
        }
    }
}

function resetCheckoutForm() {
    lastPlacedOrder = null;
    document.getElementById('checkout-success')?.classList.add('hidden');
    document.getElementById('checkout-form')?.classList.remove('hidden');
    document.getElementById('cart-active-summary')?.classList.remove('hidden');
    setCheckoutError('');
    updatePlaceOrderButton();
}

function shareOrderOnWhatsApp() {
    if (!lastPlacedOrder?.order_id) return;
    const upi = lastPlacedOrder.pay?.upi_id || '';
    const lines = [
        `*Order placed — Mino Pets*`,
        `Order ID: ${lastPlacedOrder.order_id}`,
        `Amount: ₹${lastPlacedOrder.total}/-`,
        upi ? `UPI: ${upi}` : '',
        `Status: ${lastPlacedOrder.status || 'pending_payment'}`,
        '',
        'Please confirm payment after I pay.'
    ].filter(Boolean);
    window.open(
        `https://wa.me/${MY_WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`,
        '_blank'
    );
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
        handlePhonePeReturn();
    });
} else {
    initCheckoutFormValidation();
    handlePhonePeReturn();
}
