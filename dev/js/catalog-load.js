/**
 * Catalog from Sheets (getCatalog) with localStorage cache.
 * products.js is offline fallback only when the API is unset or fetch fails.
 */

const CATALOG_CACHE_KEY = 'mino_catalog_cache_v7';
/** How long a cached catalog may be used for instant first paint (API still refreshes in background). */
const CATALOG_HYDRATE_MAX_MS_DEFAULT = 7 * 24 * 60 * 60 * 1000; // 7 days

function isCatalogApiConfigured() {
    return !!(MINO_API?.baseUrl && !String(MINO_API.baseUrl).includes('PASTE_'));
}

function catalogCacheMs() {
    return MINO_API?.catalogCacheMs || MINO_API?.stockCacheMs || 60000;
}

function catalogHydrateMaxMs() {
    return MINO_API?.catalogHydrateMaxMs || CATALOG_HYDRATE_MAX_MS_DEFAULT;
}

function isCatalogPending() {
    return typeof AppState !== 'undefined' && AppState.catalogSource === 'pending';
}

function readCatalogCacheRaw() {
    try {
        let raw = localStorage.getItem(CATALOG_CACHE_KEY);
        if (raw) return raw;
        // Migrate older session-only cache so reloads keep last Sheet catalog
        raw = sessionStorage.getItem(CATALOG_CACHE_KEY);
        if (raw) {
            localStorage.setItem(CATALOG_CACHE_KEY, raw);
            sessionStorage.removeItem(CATALOG_CACHE_KEY);
            return raw;
        }
    } catch {
        /* private mode / blocked storage */
    }
    return null;
}

function writeCatalogCacheRaw(json) {
    try {
        localStorage.setItem(CATALOG_CACHE_KEY, json);
        sessionStorage.removeItem(CATALOG_CACHE_KEY);
    } catch {
        try {
            sessionStorage.setItem(CATALOG_CACHE_KEY, json);
        } catch {
            /* ignore */
        }
    }
}

/** Deep-ish clone of the products.js seed (API failure / offline only). */
function snapshotFallbackProducts() {
    if (typeof products === 'undefined' || !Array.isArray(products)) return [];
    try {
        return JSON.parse(JSON.stringify(products));
    } catch {
        return products.slice();
    }
}

const PRODUCTS_FALLBACK = snapshotFallbackProducts();

function replaceProductsList(list) {
    if (typeof products === 'undefined' || !Array.isArray(products) || !Array.isArray(list)) return;
    products.splice(0, products.length, ...list);
}

/** Prefer Sheet image when it already matches this sku; otherwise default to -01.jpg (png via onerror). */
function syncImageFromSku(product) {
    if (!product?.sku) return product;
    const sku = String(product.sku).trim();
    if (product.image && String(product.image).includes(sku)) return product;
    if (typeof productImageUrl === 'function') {
        product.image = productImageUrl(sku, 1) || product.image;
    }
    return product;
}

function normalizeCatalogProduct(raw) {
    if (!raw || raw.id == null) return null;
    const idNum = Number(raw.id);
    const id = Number.isFinite(idNum) && String(idNum) === String(raw.id).trim() ? idNum : raw.id;
    const available = raw.available != null ? Number(raw.available) : null;
    const product = {
        id,
        name: String(raw.name || ''),
        description: String(raw.description || ''),
        price: Number(raw.price) || 0,
        category: String(raw.category || ''),
        subcategory: String(raw.subcategory || ''),
        image: String(raw.image || ''),
        inStock: raw.inStock != null ? !!raw.inStock : (available == null ? true : available > 0),
        onSale: !!raw.onSale,
        isCombo: !!raw.isCombo,
        filters: raw.filters && typeof raw.filters === 'object' ? raw.filters : {}
    };
    const mrpNum = Number(raw.mrp);
    if (Number.isFinite(mrpNum) && mrpNum > product.price) product.mrp = mrpNum;
    if (raw.sku) product.sku = String(raw.sku).trim();
    if (raw.videoUrl) product.videoUrl = String(raw.videoUrl).trim();
    if (product.isCombo && Array.isArray(raw.comboItems)) {
        product.comboItems = normalizeCatalogComboItems(raw.comboItems);
    }
    if (product.isCombo && Array.isArray(raw.components) && raw.components.length) {
        product.components = normalizeCatalogComponents(raw.components);
    } else if (product.isCombo && product.comboItems?.length) {
        const fromItems = comboItemsToComponents(product.comboItems);
        if (fromItems.length) product.components = fromItems;
    }
    const packs = (typeof normalizePackOptions === 'function')
        ? normalizePackOptions(raw.packOptions || raw.pack_options)
        : (Array.isArray(raw.packOptions) ? raw.packOptions : []);
    if (packs.length) {
        product.packOptions = packs;
    } else {
        // Sheet missing pack_options_json → keep products.js fallback packs for same id
        const fb = PRODUCTS_FALLBACK.find((p) => String(p.id) === String(id));
        if (fb?.packOptions?.length) {
            product.packOptions = (typeof normalizePackOptions === 'function')
                ? normalizePackOptions(fb.packOptions)
                : fb.packOptions;
        }
    }
    const details = normalizeProductDetails(raw.details || raw.details_json);
    if (details.length) {
        product.details = details;
    } else {
        const fb = PRODUCTS_FALLBACK.find((p) => String(p.id) === String(id));
        if (fb?.details?.length) product.details = fb.details.map(String);
    }
    if (available != null && !Number.isNaN(available)) product.available = available;
    return syncImageFromSku(product);
}

function normalizeProductDetails(raw) {
    if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
    if (raw == null || raw === '') return [];
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
            } catch { /* fall through */ }
        }
        return trimmed.split(/\n|•|;/).map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

/** combo_items: strings or {label, product_id, qty} — stock link uses product_id only */
function normalizeCatalogComboItems(list) {
    if (!Array.isArray(list)) return [];
    return list.map((it) => {
        if (it == null) return null;
        if (typeof it === 'string' || typeof it === 'number') {
            const label = String(it).trim();
            return label || null;
        }
        if (typeof it === 'object') {
            const qty = Math.floor(Number(it.qty)) || 0;
            const label = String(it.label || it.name || '').trim();
            const productId = it.product_id != null && it.product_id !== ''
                ? String(it.product_id).trim()
                : (it.productId != null && it.productId !== '' ? String(it.productId).trim() : '');
            if (!label && !productId) return null;
            if (qty > 0 && productId) {
                return {
                    label: label || `#${productId} ×${qty}`,
                    qty,
                    product_id: productId
                };
            }
            return label || productId;
        }
        return null;
    }).filter(Boolean);
}

function normalizeCatalogComponents(list) {
    if (!Array.isArray(list)) return [];
    return list.map((c) => {
        if (!c || typeof c !== 'object') return null;
        const qty = Math.floor(Number(c.qty)) || 0;
        const productId = c.product_id != null && c.product_id !== ''
            ? String(c.product_id).trim()
            : (c.productId != null ? String(c.productId).trim() : '');
        if (!productId || qty < 1) return null;
        return { productId, qty, label: String(c.label || '').trim() };
    }).filter(Boolean);
}

function comboItemsToComponents(comboItems) {
    return normalizeCatalogComponents(
        (comboItems || []).filter((it) => it && typeof it === 'object' && (it.product_id || it.productId))
    );
}

function comboItemLabel(item) {
    if (item == null) return '';
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    if (typeof item === 'object') return String(item.label || item.name || item.sku || '').trim();
    return '';
}

function applyCatalogProducts(list, source = 'sheets') {
    const normalized = (list || []).map(normalizeCatalogProduct).filter(Boolean);
    if (!normalized.length) return false;
    replaceProductsList(normalized);
    // Resolve sku → product_id on components now that all products exist
    products.forEach((p) => {
        if (Array.isArray(p.components) && p.components.length) {
            p.components = normalizeCatalogComponents(p.components);
        } else if (Array.isArray(p.comboItems)) {
            const fromItems = comboItemsToComponents(p.comboItems);
            if (fromItems.length) p.components = fromItems;
        }
        if (p.isCombo && Array.isArray(p.comboItems) && p.comboItems.some((it) => it && typeof it === 'object' && (it.product_id || it.productId))) {
            if (!p.components?.length) {
                console.warn('[catalog] linked combo has no resolved components — check combo_items product_id:', p.id, p.name, p.comboItems);
            }
        }
    });
    AppState.catalogLoadedAt = Date.now();
    AppState.catalogSource = source;
    if (typeof applyStockToProducts === 'function') applyStockToProducts();
    return true;
}

function applyStoreConfig(config) {
    if (typeof AppState === 'undefined') return;
    if (!config || typeof config !== 'object') {
        AppState.storeConfig = AppState.storeConfig || {};
        return;
    }
    AppState.storeConfig = {
        ...(AppState.storeConfig || {}),
        ...config
    };
    if (typeof onFulfillmentChange === 'function') onFulfillmentChange();
}

function hydrateCatalogFromCache() {
    try {
        const raw = readCatalogCacheRaw();
        if (!raw) return false;
        const cached = JSON.parse(raw);
        if (!Array.isArray(cached?.products) || !cached.at) return false;
        if (Date.now() - cached.at > catalogHydrateMaxMs()) return false;
        if (!applyCatalogProducts(cached.products, 'cache')) return false;
        AppState.catalogLoadedAt = cached.at;
        if (cached.config) applyStoreConfig(cached.config);
        if (cached.stock && typeof AppState !== 'undefined') {
            AppState.stock = cached.stock;
            AppState.stockLoadedAt = cached.at;
            if (typeof applyStockToProducts === 'function') applyStockToProducts();
            if (typeof clampCartToStock === 'function') clampCartToStock();
        }
        console.log('[catalog] hydrated from local cache', products.length, 'items');
        return true;
    } catch {
        return false;
    }
}

function persistCatalogCache(list, stock, config) {
    writeCatalogCacheRaw(JSON.stringify({
        products: list,
        stock: stock || null,
        config: config || (typeof AppState !== 'undefined' ? AppState.storeConfig : null) || null,
        at: Date.now()
    }));
}

function clearCatalogCache() {
    try {
        localStorage.removeItem(CATALOG_CACHE_KEY);
    } catch { /* ignore */ }
    try {
        sessionStorage.removeItem(CATALOG_CACHE_KEY);
    } catch { /* ignore */ }
}

/**
 * Fetch catalog (+ stock) from Apps Script.
 * @param {boolean} force skip in-memory TTL (boot should pass true)
 * @returns {Promise<boolean>} true if Sheet catalog applied
 */
async function loadCatalog(force = false) {
    if (!isCatalogApiConfigured()) {
        console.warn('[catalog] MINO_API not set — using products.js fallback');
        AppState.catalogSource = 'fallback';
        return false;
    }

    const now = Date.now();
    const cacheMs = catalogCacheMs();
    if (
        !force
        && AppState.catalogLoadedAt
        && (now - AppState.catalogLoadedAt) < cacheMs
        && AppState.catalogSource === 'sheets'
        && products.length
    ) {
        return true;
    }

    const sep = MINO_API.baseUrl.includes('?') ? '&' : '?';
    const url = `${MINO_API.baseUrl}${sep}action=getCatalog&token=${encodeURIComponent(MINO_API.token)}&origin=${encodeURIComponent(minoStoreOrigin())}`;

    try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        const data = await res.json();
        if (!data.ok) {
            const err = data.error || 'getCatalog failed';
            if (err === 'unknown_action') {
                throw new Error('unknown_action — redeploy Apps Script with getCatalog from Code.gs.md (new version)');
            }
            throw new Error(err);
        }
        if (!Array.isArray(data.products) || !data.products.length) {
            throw new Error('empty_catalog');
        }

        if (!applyCatalogProducts(data.products, 'sheets')) throw new Error('normalize_failed');

        if (data.config) applyStoreConfig(data.config);

        if (data.stock && typeof data.stock === 'object') {
            AppState.stock = data.stock;
            AppState.stockLoadedAt = Date.now();
            if (typeof applyStockToProducts === 'function') applyStockToProducts();
            if (typeof clampCartToStock === 'function') clampCartToStock();
            if (typeof persistStockCache === 'function') persistStockCache();
        }

        // Persist normalized list (sku → image already synced)
        persistCatalogCache(products.map((p) => ({ ...p })), data.stock || null, data.config || null);

        const sample = products.find((p) => p.sku) || products[0];
        console.log(
            '[catalog] loaded from Sheets',
            products.length,
            'items | source=',
            AppState.catalogSource,
            sample ? `| e.g. id=${sample.id} sku=${sample.sku || '(none)'} image=${sample.image}` : ''
        );
        return true;
    } catch (err) {
        console.error('[catalog] fetch failed — still on', AppState.catalogSource || 'fallback', err);
        // Keep last good cache/list if we already painted from it; only fall back when empty/pending
        if ((!products.length || AppState.catalogSource === 'pending') && PRODUCTS_FALLBACK.length) {
            replaceProductsList(PRODUCTS_FALLBACK);
            AppState.catalogSource = 'fallback';
        }
        return false;
    }
}

function restoreProductsFallback() {
    if (PRODUCTS_FALLBACK.length) {
        replaceProductsList(JSON.parse(JSON.stringify(PRODUCTS_FALLBACK)));
        AppState.catalogSource = 'fallback';
    }
}
