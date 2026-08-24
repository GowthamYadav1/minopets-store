const SHIPPING_FEE = 150;
const FREE_SHIPPING_THRESHOLD = 1000;

function getCartLineMeta(cartKey) {
    const parsed = typeof parseCartKey === 'function'
        ? parseCartKey(cartKey)
        : { productId: cartKey, packKey: null };
    const item = products.find((p) => String(p.id) === String(parsed.productId));
    if (!item) return null;
    const qty = AppState.cart[cartKey] || 0;
    if (!qty) return { cartKey, item, qty: 0, pack: null, unitPrice: 0, lineTotal: 0, fishUnits: 0 };

    if (parsed.packKey && typeof findPackByKey === 'function') {
        const pack = findPackByKey(item, parsed.packKey);
        if (!pack) return null;
        return {
            cartKey,
            item,
            qty,
            pack,
            unitPrice: pack.price,
            lineTotal: pack.price * qty,
            fishUnits: pack.units * qty
        };
    }

    return {
        cartKey,
        item,
        qty,
        pack: null,
        unitPrice: item.price,
        lineTotal: item.price * qty,
        fishUnits: qty
    };
}

function getCartSubtotal() {
    let subtotal = 0;
    for (const key in AppState.cart) {
        const meta = getCartLineMeta(key);
        if (!meta) continue;
        subtotal += meta.lineTotal;
    }
    return subtotal;
}

/** Sum of (MRP − sell) × qty across cart lines. 0 when no MRP savings. */
function getCartMrpSavings() {
    if (typeof savingsAmount !== 'function') return 0;
    let saved = 0;
    for (const key in AppState.cart) {
        const meta = getCartLineMeta(key);
        if (!meta || !meta.qty) continue;
        const mrp = meta.pack ? meta.pack.mrp : meta.item.mrp;
        const perUnit = savingsAmount(meta.unitPrice, mrp);
        if (perUnit) saved += perUnit * meta.qty;
    }
    return saved;
}

function getShippingFee(subtotal, fulfillment) {
    if (!Object.keys(AppState.cart).length) return 0;
    if (fulfillment !== 'Local Delivery') return 0;
    if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
    return SHIPPING_FEE;
}

function updateQty(productId, change) {
    const product = products.find((p) => p.id == productId);
    if (product && typeof productHasPacks === 'function' && productHasPacks(product)) {
        // Pack products use updatePackQty per pack row
        return;
    }

    const max = typeof maxQtyForProduct === 'function' ? maxQtyForProduct(productId) : 999;
    const current = AppState.cart[productId] || 0;

    if (change < 0 && current <= 0) {
        if (typeof syncQtyControls === 'function') syncQtyControls(productId);
        return;
    }
    if (change > 0 && current >= max) {
        if (typeof syncQtyControls === 'function') syncQtyControls(productId);
        updateCartUI(false);
        return;
    }

    if (!AppState.cart[productId]) AppState.cart[productId] = 0;
    AppState.cart[productId] += change;

    if (AppState.cart[productId] <= 0) {
        delete AppState.cart[productId];
    }

    if (typeof syncQtyControls === 'function') syncQtyControls(productId);
    if (typeof syncRelatedStockUI === 'function') syncRelatedStockUI(productId);
    document.querySelectorAll(`[id="qty-${productId}"]`).forEach((el) => {
        el.innerText = AppState.cart[productId] || 0;
    });

    updateCartUI(change > 0);
}

function removeFromCart(cartKeyOrProductId) {
    const key = String(cartKeyOrProductId);
    delete AppState.cart[key];

    const parsed = typeof parseCartKey === 'function' ? parseCartKey(key) : { productId: key, packKey: null };
    if (parsed.packKey && typeof syncPackCardUI === 'function') {
        syncPackCardUI(parsed.productId);
    } else {
        document.querySelectorAll(`[id="qty-${parsed.productId}"]`).forEach((el) => {
            el.innerText = 0;
        });
        if (typeof syncQtyControls === 'function') syncQtyControls(parsed.productId);
    }
    if (typeof syncRelatedStockUI === 'function') syncRelatedStockUI(parsed.productId);
    updateCartUI();
}

function updateCartUI(justAdded = false) {
    const cartItemsContainer = document.getElementById('cart-items');
    let totalItems = 0;
    let itemsHtml = '';

    for (const key of Object.keys(AppState.cart)) {
        const meta = getCartLineMeta(key);
        if (!meta || !meta.qty) continue;
        const { item, qty, pack, unitPrice, lineTotal, fishUnits, cartKey } = meta;
        const max = pack && typeof maxPackQtyForLine === 'function'
            ? maxPackQtyForLine(item.id, pack.key)
            : (typeof maxQtyForProduct === 'function' ? maxQtyForProduct(item.id) : 999);
        const atMax = qty >= max && max > 0;
        const plusDisabled = max <= 0 || qty >= max;
        totalItems += qty;
        const eachLabel = pack
            ? `${pack.label} · ₹${unitPrice}/- · ${fishUnits} fish`
            : `₹${unitPrice}/- each`;
        const thumb = typeof productMainImage === 'function' ? productMainImage(item) : (item.image || '');
        const thumbFallback = (item.image || '').replace(/"/g, '&quot;');
        const minusFn = pack
            ? `updatePackQty(${item.id}, '${pack.key.replace(/'/g, "\\'")}', -1)`
            : `updateQty(${item.id}, -1)`;
        const plusFn = pack
            ? `updatePackQty(${item.id}, '${pack.key.replace(/'/g, "\\'")}', 1)`
            : `updateQty(${item.id}, 1)`;
        const removeArg = pack ? `'${cartKey.replace(/'/g, "\\'")}'` : String(item.id);
        itemsHtml += `
            <div class="cart-line-item">
                <div class="flex items-start gap-3">
                    <div class="cart-line-thumb flex-shrink-0 overflow-hidden rounded-lg bg-[#F8FAFC] border border-brand-blue/10">
                        <img src="${thumb}" alt=""
                            class="w-14 h-14 object-cover"
                            loading="lazy" decoding="async"
                            ${item.sku ? `data-sku="${String(item.sku).replace(/"/g, '&quot;')}" data-img-index="1"` : ''}
                            onerror="typeof handleProductImgError==='function'?handleProductImgError(this):(this.onerror=null)"
                            data-fallback="${thumbFallback}">
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <p class="font-semibold text-brand-blue text-sm leading-snug">${item.name}${pack ? ` · ${pack.label}` : ''}</p>
                                <p class="text-gray-400 text-xs mt-0.5">${eachLabel}</p>
                                <p class="text-xs font-semibold text-brand-coral mt-1 ${atMax ? '' : 'hidden'}">${atMax ? (pack ? `Max ${max} packs` : `Only ${max} left`) : ''}</p>
                            </div>
                            <button type="button" onclick="removeFromCart(${removeArg})" class="cart-remove-btn" aria-label="Remove ${item.name}" title="Remove">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                        <div class="flex items-center justify-between mt-2.5">
                            <div class="cart-qty-controls">
                                <button type="button" onclick="${minusFn}" class="cart-qty-btn" aria-label="Decrease quantity">−</button>
                                <span class="cart-qty-value">${qty}</span>
                                <button type="button" onclick="${plusFn}"
                                    class="cart-qty-btn cart-qty-btn--plus ${plusDisabled ? 'opacity-40 cursor-not-allowed' : ''}"
                                    aria-label="Increase quantity"
                                    ${plusDisabled ? 'disabled aria-disabled="true"' : ''}>+</button>
                            </div>
                            <span class="font-bold text-brand-blue text-sm">₹${lineTotal}/-</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    cartItemsContainer.innerHTML = itemsHtml || '<p class="text-gray-400 italic text-sm py-4 text-center">Your cart is empty.</p>';

    const subtotal = getCartSubtotal();
    const fulfillment = document.getElementById('fulfillment')?.value || '';
    const shipping = getShippingFee(subtotal, fulfillment);
    const discount = (typeof getAppliedCouponDiscount === 'function')
        ? getAppliedCouponDiscount(subtotal + shipping)
        : 0;
    const total = Math.max(0, subtotal + shipping - discount);

    document.getElementById('cart-subtotal').innerText = subtotal;
    document.getElementById('cart-total').innerText = total;

    const mrpSavings = getCartMrpSavings();
    const mrpSavingsRow = document.getElementById('cart-mrp-savings-row');
    const mrpSavingsEl = document.getElementById('cart-mrp-savings');
    if (mrpSavings > 0) {
        mrpSavingsRow?.classList.remove('hidden');
        mrpSavingsRow?.classList.add('flex');
        if (mrpSavingsEl) mrpSavingsEl.innerText = mrpSavings;
    } else {
        mrpSavingsRow?.classList.add('hidden');
        mrpSavingsRow?.classList.remove('flex');
        if (mrpSavingsEl) mrpSavingsEl.innerText = '0';
    }

    const discountRow = document.getElementById('cart-discount-row');
    const discountEl = document.getElementById('cart-discount');
    const couponLabel = document.getElementById('cart-coupon-label');
    if (discount > 0) {
        discountRow?.classList.remove('hidden');
        discountRow?.classList.add('flex');
        if (discountEl) discountEl.innerText = discount;
        if (couponLabel && typeof getAppliedCouponCode === 'function') {
            couponLabel.innerText = getAppliedCouponCode() || '';
        }
    } else {
        discountRow?.classList.add('hidden');
        discountRow?.classList.remove('flex');
        if (discountEl) discountEl.innerText = '0';
    }

    const shippingRow = document.getElementById('cart-shipping-row');
    const shippingValue = document.getElementById('cart-shipping-value');
    const shippingHint = document.getElementById('cart-shipping-hint');

    if (totalItems > 0 && fulfillment === 'Local Delivery') {
        shippingRow?.classList.remove('hidden');
        shippingRow?.classList.add('flex');
        if (shipping === 0) {
            shippingValue.innerHTML = '<span class="text-emerald-600 font-semibold">FREE</span>';
            shippingHint?.classList.remove('hidden');
            shippingHint.innerText = `Free delivery on orders ₹${FREE_SHIPPING_THRESHOLD}+`;
        } else {
            shippingValue.innerHTML = `<span class="text-gray-700 font-semibold">₹${shipping}/-</span>`;
            const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
            shippingHint?.classList.remove('hidden');
            shippingHint.innerText = `Add ₹${remaining}/- more for free delivery`;
        }
    } else {
        shippingRow?.classList.add('hidden');
        shippingRow?.classList.remove('flex');
        shippingHint?.classList.add('hidden');
        if (shippingHint) shippingHint.innerText = '';
    }

    const badge = document.getElementById('cart-badge');
    const mobileBar = document.getElementById('mobile-cart-bar');
    document.getElementById('mobile-cart-count').innerText = totalItems;
    const noun = document.getElementById('mobile-cart-noun');
    if (noun) noun.innerText = totalItems === 1 ? 'item' : 'items';

    if (totalItems > 0) {
        badge.innerText = totalItems;
        badge.classList.remove('hidden');
        badge.classList.add('badge-pulse');
        mobileBar.classList.remove('hidden');
        document.getElementById('scroll-top')?.classList.add('above-cart');
        if (justAdded) {
            badge.classList.remove('badge-pop');
            void badge.offsetWidth;
            badge.classList.add('badge-pop');
        }
    } else {
        badge.classList.add('hidden');
        badge.classList.remove('badge-pulse', 'badge-pop');
        mobileBar.classList.add('hidden');
        document.getElementById('scroll-top')?.classList.remove('above-cart');
    }

    if (typeof updatePlaceOrderButton === 'function') updatePlaceOrderButton();
}

let _cartScrollY = 0;

function lockBodyScroll() {
    _cartScrollY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add('cart-open');
    document.body.classList.add('cart-open');
    document.body.style.top = `-${_cartScrollY}px`;
}

function unlockBodyScroll() {
    document.documentElement.classList.remove('cart-open');
    document.body.classList.remove('cart-open');
    document.body.style.top = '';
    window.scrollTo(0, _cartScrollY);
}

function toggleCart() {
    const panel = document.getElementById('cart-panel');
    const overlay = document.getElementById('cart-overlay');
    if (panel.classList.contains('hidden')) {
        if (typeof closeProductDetail === 'function') closeProductDetail();
        if (typeof closeMobileNav === 'function') closeMobileNav({ fromHistory: true });
        panel.classList.remove('hidden');
        overlay.classList.remove('hidden');
        lockBodyScroll();
        setTimeout(() => panel.classList.remove('translate-x-full'), 10);
        if (typeof ModalHistory !== 'undefined') ModalHistory.push('cart');
    } else {
        closeCartPanel();
    }
}

function closeCartPanel(opts = {}) {
    const panel = document.getElementById('cart-panel');
    const overlay = document.getElementById('cart-overlay');
    if (!panel || panel.classList.contains('hidden')) return;
    panel.classList.add('translate-x-full');
    overlay?.classList.add('hidden');
    unlockBodyScroll();
    setTimeout(() => panel.classList.add('hidden'), 300);
    if (!opts.fromHistory && typeof ModalHistory !== 'undefined') {
        ModalHistory.dismiss('cart');
    }
}

function sendWhatsAppOrder() {
    const phoneInput = document.getElementById('customer-phone').value.trim();
    const fulfillment = document.getElementById('fulfillment').value;
    if (Object.keys(AppState.cart).length === 0) { alert('Please add items to your cart first!'); return; }
    if (!phoneInput) { alert('Please provide your phone number.'); return; }
    if (!fulfillment) { alert('Please select your fulfillment method.'); return; }

    let orderText = `*New Order Request - Mino Pets*\n----------------------------------\n`;
    const subtotal = getCartSubtotal();
    for (const key in AppState.cart) {
        const meta = getCartLineMeta(key);
        if (!meta || !meta.qty) continue;
        const label = meta.pack
            ? `${meta.qty}x ${meta.item.name} (${meta.pack.label})`
            : `${meta.qty}x ${meta.item.name}`;
        orderText += `▪️ ${label} (${meta.lineTotal}/-)\n`;
        if (meta.item.comboItems?.length) {
            meta.item.comboItems.forEach((ci) => {
                const label = typeof comboItemLabel === 'function' ? comboItemLabel(ci) : String(ci);
                if (label) orderText += `   • ${label}\n`;
            });
        }
    }
    const shipping = getShippingFee(subtotal, fulfillment);
    const total = subtotal + shipping;
    const methodLabel = (typeof FULFILLMENT_OPTIONS !== 'undefined' && FULFILLMENT_OPTIONS[fulfillment]?.label)
        || fulfillment;
    orderText += `----------------------------------\n`;
    orderText += `*Subtotal:* ${subtotal}/-\n`;
    if (fulfillment === 'Local Delivery') {
        orderText += shipping === 0
            ? `*Shipping:* FREE (order ₹${FREE_SHIPPING_THRESHOLD}+)\n`
            : `*Shipping:* ${shipping}/-\n`;
    }
    orderText += `*Total:* ${total}/-\n*Method:* ${methodLabel}\n*Customer Contact:* ${phoneInput}\n\nPlease confirm stock availability and pickup timeline!`;
    window.open(`https://wa.me/${MY_WHATSAPP_NUMBER}?text=${encodeURIComponent(orderText)}`, '_blank');
}
