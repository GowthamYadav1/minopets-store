function getAvailableStock(productId) {
    if (!AppState.stock || AppState.stock[String(productId)] === undefined) return null;
    return AppState.stock[String(productId)];
}

function isStockApiConfigured() {
    return !!(MINO_API?.baseUrl && !String(MINO_API.baseUrl).includes('PASTE_'));
}

/**
 * Linked combo components for shared stock math.
 * Prefers product.components from API; falls back to combo_items with product_id.
 */
function getLinkedComponents(product) {
    if (!product) return [];

    const fromComponents = Array.isArray(product.components) ? product.components : [];
    if (fromComponents.length) {
        return fromComponents
            .map((c) => {
                const qty = Math.floor(Number(c.qty)) || 0;
                const productId = c.productId != null ? String(c.productId).trim()
                    : (c.product_id != null ? String(c.product_id).trim() : '');
                if (!productId || qty < 1) return null;
                return { productId, qty };
            })
            .filter(Boolean);
    }

    if (!Array.isArray(product.comboItems)) return [];
    const out = [];
    product.comboItems.forEach((it) => {
        if (!it || typeof it !== 'object') return;
        const qty = Math.floor(Number(it.qty)) || 0;
        if (qty < 1) return;
        let pid = it.product_id != null && it.product_id !== '' ? String(it.product_id).trim() : '';
        if (!pid && it.productId != null && it.productId !== '') pid = String(it.productId).trim();
        if (!pid) return;
        out.push({ productId: pid, qty });
    });
    return out;
}

function productHasLinkedComponents(product) {
    return getLinkedComponents(product).length > 0;
}

/**
 * How many units of a leaf product the cart currently demands
 * (direct packs/qty + linked combo kits).
 * @param {string|number} leafProductId
 * @param {{ skipKey?: string }} [opts] skip one cart key (that line's own demand)
 */
function leafUnitsDemandedInCart(leafProductId, opts = {}) {
    const leaf = String(leafProductId);
    const skipKey = opts.skipKey != null ? String(opts.skipKey) : null;
    let total = 0;

    for (const key of Object.keys(AppState.cart || {})) {
        if (skipKey && key === skipKey) continue;
        const lineQty = AppState.cart[key] || 0;
        if (!lineQty) continue;

        const parsed = typeof parseCartKey === 'function'
            ? parseCartKey(key)
            : { productId: key, packKey: null };
        const pid = String(parsed.productId);
        const product = typeof products !== 'undefined'
            ? products.find((p) => String(p.id) === pid)
            : null;
        if (!product) continue;

        const comps = getLinkedComponents(product);
        if (comps.length) {
            const comp = comps.find((c) => String(c.productId) === leaf);
            if (comp) total += lineQty * comp.qty;
            continue;
        }

        if (pid !== leaf) continue;

        if (parsed.packKey && typeof productHasPacks === 'function' && productHasPacks(product)
            && typeof findPackByKey === 'function') {
            const pack = findPackByKey(product, parsed.packKey);
            if (pack) total += pack.units * lineQty;
        } else if (!parsed.packKey) {
            total += lineQty;
        }
    }
    return total;
}

function remainingLeafStock(leafProductId, opts = {}) {
    const stock = getAvailableStock(leafProductId);
    if (stock === null) return null;
    return Math.max(0, stock - leafUnitsDemandedInCart(leafProductId, opts));
}

function maxLinkedComboKits(productId) {
    const product = typeof products !== 'undefined'
        ? products.find((p) => String(p.id) === String(productId))
        : null;
    const comps = getLinkedComponents(product);
    if (!comps.length) return null;

    let minKits = Infinity;
    for (const c of comps) {
        const rem = remainingLeafStock(c.productId, { skipKey: String(productId) });
        if (rem === null) {
            if (isStockApiConfigured()) {
                return AppState.cart[productId] || 0;
            }
            return product?.inStock ? 99 : 0;
        }
        minKits = Math.min(minKits, Math.floor(rem / c.qty));
    }
    return isFinite(minKits) ? Math.max(0, minKits) : 0;
}

/**
 * Max qty for non-pack products. Pack products use maxPackQtyForLine in packs.js.
 * Linked combos: kits limited by remaining component stock (shared with pack cart lines).
 */
function maxQtyForProduct(productId) {
    const product = typeof products !== 'undefined' ? products.find((x) => x.id == productId) : null;
    if (product && typeof productHasPacks === 'function' && productHasPacks(product)) {
        return 0;
    }

    if (product && productHasLinkedComponents(product)) {
        return maxLinkedComboKits(productId);
    }

    const avail = getAvailableStock(productId);
    if (avail !== null) {
        // Plain product that may also be a combo component — leave room for combo demand
        const usedElsewhere = leafUnitsDemandedInCart(productId, { skipKey: String(productId) });
        return Math.max(0, avail - usedElsewhere);
    }

    if (AppState.stock && AppState.stockLoadedAt) return 0;

    if (isStockApiConfigured()) {
        return AppState.cart[productId] || 0;
    }

    if (!product) return 0;
    return product.inStock ? 99 : 0;
}

/** After stock / cart changes, refresh UIs that share component stock. */
function syncRelatedStockUI(productId) {
    const touched = new Set([String(productId)]);
    const product = typeof products !== 'undefined'
        ? products.find((p) => String(p.id) === String(productId))
        : null;

    if (product && productHasLinkedComponents(product)) {
        getLinkedComponents(product).forEach((c) => touched.add(String(c.productId)));
    }

    if (typeof products !== 'undefined') {
        products.forEach((p) => {
            const comps = getLinkedComponents(p);
            if (!comps.length) return;
            if (comps.some((c) => touched.has(String(c.productId)) || String(p.id) === String(productId))) {
                touched.add(String(p.id));
                comps.forEach((c) => touched.add(String(c.productId)));
            }
        });
    }

    touched.forEach((pid) => {
        const p = products.find((x) => String(x.id) === pid);
        if (p && typeof productHasPacks === 'function' && productHasPacks(p)) {
            if (typeof syncPackCardUI === 'function') syncPackCardUI(pid);
        } else if (typeof syncQtyControls === 'function') {
            syncQtyControls(pid);
            document.querySelectorAll(`[id="qty-${pid}"]`).forEach((el) => {
                el.innerText = AppState.cart[pid] || 0;
            });
        }
    });
}

/** After stock arrives, pull cart lines down to available. */
function clampCartToStock() {
    if (!AppState.cart) return;
    let changed = false;

    // Drop legacy plain productId cart entries for pack products
    for (const key of Object.keys(AppState.cart)) {
        const parsed = typeof parseCartKey === 'function' ? parseCartKey(key) : { productId: key, packKey: null };
        const product = products.find((p) => String(p.id) === String(parsed.productId));
        if (product && typeof productHasPacks === 'function' && productHasPacks(product) && !parsed.packKey) {
            delete AppState.cart[key];
            changed = true;
        }
    }

    for (let pass = 0; pass < 5; pass++) {
        let passChanged = false;
        const productIds = new Set();
        for (const key of Object.keys(AppState.cart)) {
            const parsed = typeof parseCartKey === 'function' ? parseCartKey(key) : { productId: key, packKey: null };
            productIds.add(String(parsed.productId));
        }

        productIds.forEach((pid) => {
            const product = products.find((p) => String(p.id) === String(pid));
            if (product && typeof productHasPacks === 'function' && productHasPacks(product)) {
                if (typeof clampPackCartForProduct === 'function' && clampPackCartForProduct(pid)) {
                    passChanged = true;
                }
                return;
            }
            const max = maxQtyForProduct(pid);
            const qty = AppState.cart[pid] || 0;
            if (qty > max) {
                if (max <= 0) delete AppState.cart[pid];
                else AppState.cart[pid] = max;
                passChanged = true;
            }
        });

        if (!passChanged) break;
        changed = true;
    }

    const productIds = new Set();
    for (const key of Object.keys(AppState.cart)) {
        const parsed = typeof parseCartKey === 'function' ? parseCartKey(key) : { productId: key, packKey: null };
        productIds.add(String(parsed.productId));
    }
    productIds.forEach((pid) => syncRelatedStockUI(pid));

    if (changed && typeof updateCartUI === 'function') updateCartUI(false);
}

function syncQtyControls(productId) {
    const product = products.find((p) => p.id == productId);
    if (product && typeof productHasPacks === 'function' && productHasPacks(product)) {
        if (typeof syncPackCardUI === 'function') syncPackCardUI(productId);
        return;
    }

    const max = maxQtyForProduct(productId);
    const qty = AppState.cart[productId] || 0;
    const atMax = max <= 0 || qty >= max;
    const atZero = qty <= 0;
    const showCartHint = qty > 0 && qty >= max && max > 0;

    document.querySelectorAll(`[data-plus-id="${productId}"]`).forEach((plusBtn) => {
        plusBtn.disabled = atMax;
        plusBtn.classList.toggle('is-disabled', atMax);
        plusBtn.setAttribute('aria-disabled', atMax ? 'true' : 'false');
    });

    document.querySelectorAll(`[data-minus-id="${productId}"]`).forEach((minusBtn) => {
        minusBtn.disabled = atZero;
        minusBtn.classList.toggle('is-disabled', atZero);
        minusBtn.setAttribute('aria-disabled', atZero ? 'true' : 'false');
    });

    const cardHint = document.getElementById(`stock-hint-${productId}`);
    if (cardHint) {
        const avail = getAvailableStock(productId);
        const lowStock = avail !== null && avail <= 5 && max > 0;
        const atCap = qty > 0 && qty >= max && max > 0;
        if (max <= 0) {
            cardHint.textContent = '';
            cardHint.className = 'stock-hint text-xs text-gray-400 hidden';
        } else if (lowStock) {
            cardHint.textContent = `Only ${avail} left`;
            cardHint.className = 'stock-hint text-xs font-semibold text-brand-coral';
            cardHint.classList.remove('hidden');
        } else if (atCap) {
            cardHint.textContent = `Only ${max} left`;
            cardHint.className = 'stock-hint text-xs font-semibold text-brand-coral';
            cardHint.classList.remove('hidden');
        } else {
            cardHint.textContent = '';
            cardHint.className = 'stock-hint text-xs text-gray-400 hidden';
        }
    }

    const cartHint = document.getElementById(`cart-stock-hint-${productId}`);
    if (cartHint) {
        if (showCartHint) {
            cartHint.textContent = `Only ${max} left`;
            cartHint.classList.remove('hidden');
        } else {
            cartHint.textContent = '';
            cartHint.classList.add('hidden');
        }
    }
}

function applyStockToProducts() {
    if (!AppState.stock || typeof products === 'undefined') return;
    products.forEach((p) => {
        const avail = AppState.stock[String(p.id)];
        if (avail === undefined) return;
        p.available = avail;
        p.inStock = avail > 0;
    });
}

const STOCK_CACHE_KEY = 'mino_stock_cache_v1';

function hydrateStockFromCache() {
    try {
        const raw = sessionStorage.getItem(STOCK_CACHE_KEY);
        if (!raw) return false;
        const cached = JSON.parse(raw);
        if (!cached?.stock || !cached.at) return false;
        const maxAge = (MINO_API?.stockCacheMs || 60000) * 5;
        if (Date.now() - cached.at > maxAge) return false;
        AppState.stock = cached.stock;
        AppState.stockLoadedAt = cached.at;
        applyStockToProducts();
        clampCartToStock();
        console.log('[stock] hydrated from session cache');
        return true;
    } catch {
        return false;
    }
}

function persistStockCache() {
    try {
        sessionStorage.setItem(STOCK_CACHE_KEY, JSON.stringify({
            stock: AppState.stock,
            at: AppState.stockLoadedAt
        }));
    } catch {
        /* ignore quota / private mode */
    }
}

async function loadStock(force = false) {
    if (!MINO_API?.baseUrl || String(MINO_API.baseUrl).includes('PASTE_')) {
        console.warn('[stock] MINO_API.baseUrl not set — using products.js inStock only');
        return false;
    }

    const now = Date.now();
    const cacheMs = MINO_API.stockCacheMs || 60000;
    if (!force && AppState.stockLoadedAt && (now - AppState.stockLoadedAt) < cacheMs && AppState.stock) {
        return true;
    }

    const sep = MINO_API.baseUrl.includes('?') ? '&' : '?';
    const url = `${MINO_API.baseUrl}${sep}action=getStock&token=${encodeURIComponent(MINO_API.token)}&origin=${encodeURIComponent(minoStoreOrigin())}`;

    try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'getStock failed');

        AppState.stock = data.stock || {};
        AppState.stockLoadedAt = Date.now();
        applyStockToProducts();
        clampCartToStock();
        persistStockCache();
        console.log('[stock] loaded', Object.keys(AppState.stock).length, 'skus', AppState.stock);
        return true;
    } catch (err) {
        console.error('[stock] fetch failed — qty capped until stock loads. Check Config allowed_origins + console.', err);
        return false;
    }
}
