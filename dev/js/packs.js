/**
 * Sheet-configurable pack / option rows.
 * Fish & Shrimps: pack sizes sharing piece stock (units = fish/shrimp count).
 * Aquarium: option rows (e.g. Tank only / With cabinet) with units:1 and shared stock.
 *
 * Fish example:
 * [{"key":"pair","label":"1 Pair","units":2,"price":42},{"key":"six","label":"6 Fish","units":6,"price":120}]
 *
 * Aquarium example:
 * [{"key":"tank","label":"Tank only","units":1,"price":8900},{"key":"cabinet","label":"With cabinet","units":1,"price":12900}]
 */

const PACK_CATEGORIES = new Set(['Fish', 'Shrimps', 'Aquarium']);

function packUnitLabel(product) {
    if (product?.category === 'Shrimps') return 'shrimp';
    if (product?.category === 'Aquarium') return 'unit';
    return 'fish';
}

/** True when packs are size/qty packs (units > 1), not 1:1 option rows. */
function packsUsePiecePricing(product) {
    return getProductPackOptions(product).some((p) => p.units > 1);
}

function normalizePackOptions(raw) {
    if (!Array.isArray(raw) || !raw.length) return [];
    const out = [];
    const seen = new Set();
    raw.forEach((p) => {
        if (!p || typeof p !== 'object') return;
        const units = Math.floor(Number(p.units));
        const price = Number(p.price);
        if (!isFinite(units) || units < 1 || !isFinite(price) || price < 0) return;
        let key = String(p.key || `u${units}`).trim();
        if (!key || seen.has(key)) key = `u${units}`;
        if (seen.has(key)) return;
        seen.add(key);
        const entry = {
            key,
            label: String(p.label || `Option ${units}`).trim() || `Option ${units}`,
            units,
            price,
            hint: p.hint ? String(p.hint) : ''
        };
        const packMrp = Number(p.mrp);
        if (Number.isFinite(packMrp) && packMrp > price) entry.mrp = packMrp;
        out.push(entry);
    });
    // Piece packs: sort by units. Option rows (all units 1): keep Sheet order.
    if (out.some((p) => p.units > 1)) {
        out.sort((a, b) => a.units - b.units || a.label.localeCompare(b.label));
    }
    return out;
}

function getProductPackOptions(product) {
    if (!product) return [];
    if (product.category && !PACK_CATEGORIES.has(product.category)) return [];
    return normalizePackOptions(product.packOptions || product.pack_options || []);
}

function productHasPacks(product) {
    return getProductPackOptions(product).length > 0;
}

function packCartKey(productId, packKey) {
    return `${productId}::${packKey}`;
}

function parseCartKey(key) {
    const s = String(key);
    const i = s.indexOf('::');
    if (i < 0) return { productId: s, packKey: null };
    return { productId: s.slice(0, i), packKey: s.slice(i + 2) };
}

function findPackByKey(product, packKey) {
    return getProductPackOptions(product).find((p) => p.key === packKey) || null;
}

function fromPackPrice(product) {
    const packs = getProductPackOptions(product);
    if (!packs.length) return product.price;
    return Math.min(...packs.map((p) => p.price));
}

function getProductFishStock(productId) {
    const product = products.find((p) => p.id == productId);
    const avail = typeof getAvailableStock === 'function'
        ? getAvailableStock(productId)
        : (product?.available ?? (product?.inStock ? 999 : 0));
    if (avail === null) return null;
    return Math.max(0, avail);
}

/** Fish already in cart for this product (all pack lines). */
function fishUnitsInCartForProduct(productId, exceptPackKey = null) {
    const product = products.find((p) => p.id == productId);
    if (!product || !productHasPacks(product)) {
        return AppState.cart[productId] || 0;
    }
    let total = 0;
    for (const key of Object.keys(AppState.cart || {})) {
        const parsed = parseCartKey(key);
        if (String(parsed.productId) !== String(productId) || !parsed.packKey) continue;
        if (exceptPackKey && parsed.packKey === exceptPackKey) continue;
        const pack = findPackByKey(product, parsed.packKey);
        const qty = AppState.cart[key] || 0;
        if (pack && qty) total += pack.units * qty;
    }
    return total;
}

function getPackQty(productId, packKey) {
    return AppState.cart[packCartKey(productId, packKey)] || 0;
}

/** Max packs of this type, given other packs + linked combo demand already in cart. */
function maxPackQtyForLine(productId, packKey) {
    const product = products.find((p) => p.id == productId);
    if (!product) return 0;
    const pack = findPackByKey(product, packKey);
    if (!pack) return 0;

    const stock = getProductFishStock(productId);
    if (stock === null) {
        if (typeof isStockApiConfigured === 'function' && isStockApiConfigured()) {
            return getPackQty(productId, packKey);
        }
        return product.inStock ? Math.floor(99 / pack.units) : 0;
    }

    const usedElsewhere = typeof leafUnitsDemandedInCart === 'function'
        ? leafUnitsDemandedInCart(productId, { skipKey: packCartKey(productId, packKey) })
        : fishUnitsInCartForProduct(productId, packKey);
    const remainingForThis = Math.max(0, stock - usedElsewhere);
    return Math.floor(remainingForThis / pack.units);
}

function updatePackQty(productId, packKey, change) {
    const product = products.find((p) => p.id == productId);
    if (!product || !productHasPacks(product)) return;
    const pack = findPackByKey(product, packKey);
    if (!pack) return;

    const key = packCartKey(productId, packKey);
    const max = maxPackQtyForLine(productId, packKey);
    const current = AppState.cart[key] || 0;

    if (change < 0 && current <= 0) {
        syncPackCardUI(productId);
        if (typeof syncRelatedStockUI === 'function') syncRelatedStockUI(productId);
        return;
    }
    if (change > 0 && current >= max) {
        syncPackCardUI(productId);
        if (typeof syncRelatedStockUI === 'function') syncRelatedStockUI(productId);
        if (typeof updateCartUI === 'function') updateCartUI(false);
        return;
    }

    const next = current + change;
    if (next <= 0) delete AppState.cart[key];
    else AppState.cart[key] = next;

    syncPackCardUI(productId);
    if (typeof syncRelatedStockUI === 'function') syncRelatedStockUI(productId);
    if (typeof updateCartUI === 'function') updateCartUI(change > 0);
}

function removePackLine(productId, packKey) {
    delete AppState.cart[packCartKey(productId, packKey)];
    syncPackCardUI(productId);
    if (typeof syncRelatedStockUI === 'function') syncRelatedStockUI(productId);
    if (typeof updateCartUI === 'function') updateCartUI(false);
}

function clampPackCartForProduct(productId) {
    const product = products.find((p) => p.id == productId);
    if (!product || !productHasPacks(product)) return false;
    let changed = false;
    for (const pack of getProductPackOptions(product)) {
        const key = packCartKey(productId, pack.key);
        const qty = AppState.cart[key] || 0;
        if (!qty) continue;
        const max = maxPackQtyForLine(productId, pack.key);
        if (qty > max) {
            if (max <= 0) delete AppState.cart[key];
            else AppState.cart[key] = max;
            changed = true;
        }
    }
    return changed;
}

function syncPackCardUI(productId) {
    const product = products.find((p) => p.id == productId);
    if (!product || !productHasPacks(product)) return;

    const stock = getProductFishStock(productId);
    const stockN = stock == null ? 999 : stock;
    const inCartFish = fishUnitsInCartForProduct(productId);
    const unit = packUnitLabel(product);
    const selectedKey = getSelectedPackKey(productId);
    const selectedPack = findPackByKey(product, selectedKey);

    getProductPackOptions(product).forEach((pack) => {
        const qty = getPackQty(productId, pack.key);
        const max = maxPackQtyForLine(productId, pack.key);
        const canHaveAny = max > 0 || qty > 0;
        document.querySelectorAll(`[data-pack-row="${productId}::${pack.key}"]`).forEach((row) => {
            row.classList.toggle('is-selected', qty > 0);
            row.classList.toggle('is-disabled', !canHaveAny && qty === 0);
        });

        document.querySelectorAll(`[id="pack-qty-${productId}-${pack.key}"]`).forEach((qtyEl) => {
            qtyEl.textContent = String(qty);
        });

        document.querySelectorAll(`[data-pack-minus="${productId}::${pack.key}"]`).forEach((minus) => {
            const atZero = qty <= 0;
            minus.disabled = atZero;
            minus.classList.toggle('is-disabled', atZero);
        });
        document.querySelectorAll(`[data-pack-plus="${productId}::${pack.key}"]`).forEach((plus) => {
            const atMax = qty >= max;
            plus.disabled = atMax;
            plus.classList.toggle('is-disabled', atMax);
        });

        document.querySelectorAll(`[id="pack-sub-${productId}-${pack.key}"]`).forEach((sub) => {
            const piecePricing = packsUsePiecePricing(product);
            const per = Math.round((pack.price / pack.units) * 10) / 10;
            const save = typeof savingsAmount === 'function' ? savingsAmount(pack.price, pack.mrp) : null;
            const saveTxt = save != null
                ? `You save ₹${typeof formatInrAmount === 'function' ? formatInrAmount(save) : save}`
                : '';
            if (qty > 0) {
                sub.textContent = piecePricing
                    ? `${qty} in cart · ${pack.units * qty} ${unit}`
                    : `${qty} in cart`;
            } else if (max <= 0) {
                sub.textContent = stockN < pack.units
                    ? `Need ${pack.units} ${unit}`
                    : `Only ${stockN - inCartFish} ${unit} left`;
            } else if (pack.hint) {
                sub.textContent = pack.hint;
            } else if (piecePricing && saveTxt) {
                sub.textContent = `~₹${per} per ${unit} · ${saveTxt}`;
            } else if (piecePricing) {
                sub.textContent = `~₹${per} per ${unit}`;
            } else {
                sub.textContent = saveTxt;
            }
        });

        document.querySelectorAll(`[data-pack-option="${productId}::${pack.key}"]`).forEach((opt) => {
            const disabled = max <= 0 && qty === 0;
            opt.disabled = disabled;
            opt.classList.toggle('is-active', pack.key === selectedKey);
            opt.classList.toggle('is-disabled', disabled);
        });
    });

    if (selectedPack) {
        const selQty = getPackQty(productId, selectedKey);
        const selMax = maxPackQtyForLine(productId, selectedKey);
        document.querySelectorAll(`[id="pack-card-label-${productId}"]`).forEach((el) => {
            el.innerHTML = typeof renderPackCardLabelHtml === 'function'
                ? renderPackCardLabelHtml(selectedPack)
                : `${selectedPack.label} · ₹${selectedPack.price}`;
        });
        document.querySelectorAll(`[id="pack-card-qty-${productId}"]`).forEach((el) => {
            el.textContent = String(selQty);
        });
        document.querySelectorAll(`[data-pack-card-minus="${productId}"]`).forEach((btn) => {
            btn.disabled = selQty <= 0;
            btn.classList.toggle('is-disabled', selQty <= 0);
            btn.setAttribute('onclick', `updatePackQty(${productId}, '${selectedKey.replace(/'/g, "\\'")}', -1)`);
        });
        document.querySelectorAll(`[data-pack-card-plus="${productId}"]`).forEach((btn) => {
            btn.disabled = selQty >= selMax;
            btn.classList.toggle('is-disabled', selQty >= selMax);
            btn.setAttribute('onclick', `updatePackQty(${productId}, '${selectedKey.replace(/'/g, "\\'")}', 1)`);
        });
    }

    document.querySelectorAll(`[id="pack-from-${productId}"]`).forEach((fromEl) => {
        if (stockN <= 0) fromEl.textContent = 'Out of stock';
        else if (inCartFish > 0) fromEl.textContent = `${inCartFish}/${stockN} ${unit} in cart`;
        else fromEl.textContent = `${stockN} ${unit} in stock · options share stock`;
    });

    document.querySelectorAll(`[id="pack-hint-${productId}"]`).forEach((hint) => {
        const parts = [];
        getProductPackOptions(product).forEach((pack) => {
            const qty = getPackQty(productId, pack.key);
            if (qty > 0) parts.push(`${qty}× ${pack.label}`);
        });
        if (!parts.length) {
            hint.textContent = packsUsePiecePricing(product)
                ? 'Add any mix of packs · Inclusive of all taxes'
                : 'Choose an option · Inclusive of all taxes';
        } else {
            const totalInr = getProductPackOptions(product).reduce((sum, pack) => {
                return sum + pack.price * getPackQty(productId, pack.key);
            }, 0);
            hint.textContent = packsUsePiecePricing(product)
                ? `${parts.join(' + ')} = ${inCartFish} ${unit} · ₹${totalInr}/-`
                : `${parts.join(' + ')} · ₹${totalInr}/-`;
        }
    });

    if (typeof refreshOpenProductDetail === 'function') {
        refreshOpenProductDetail(productId);
    }
}

function getSelectedPackKey(productId) {
    const product = products.find((p) => p.id == productId);
    const packs = getProductPackOptions(product);
    if (!packs.length) return null;
    if (!AppState.selectedPack) AppState.selectedPack = {};
    let key = AppState.selectedPack[productId];
    if (!key || !packs.some((p) => p.key === key)) {
        key = packs[0].key;
        AppState.selectedPack[productId] = key;
    }
    return key;
}

function setSelectedPackKey(productId, packKey) {
    if (!AppState.selectedPack) AppState.selectedPack = {};
    AppState.selectedPack[productId] = packKey;
    closeAllPackMenus();
    syncPackCardUI(productId);
}

function getPackMenuForRoot(root) {
    if (!root) return null;
    const pid = root.id?.replace(/^pack-dd-/, '') || '';
    return root.querySelector('.pack-dd-menu')
        || document.querySelector(`.pack-dd-menu.pack-menu-portal[data-pack-menu="${pid}"]`);
}

function restorePackMenu(menu) {
    if (!menu) return;
    const pid = menu.getAttribute('data-pack-menu') || '';
    const root = menu.__packRoot
        || (pid ? document.getElementById(`pack-dd-${pid}`) : null);
    menu.__packRoot = null;
    menu.classList.remove('is-open', 'pack-menu-portal');
    menu.style.top = '';
    menu.style.bottom = '';
    menu.style.left = '';
    menu.style.width = '';
    menu.style.display = '';
    if (root && menu.parentElement !== root) root.appendChild(menu);
}

function closeAllPackMenus() {
    document.querySelectorAll('.pack-dd-menu.pack-menu-portal').forEach((menu) => restorePackMenu(menu));
    document.querySelectorAll('.pack-dd.is-open').forEach((el) => {
        if (el.id === 'fulfillment-dd') return;
        el.classList.remove('is-open', 'pack-dd-up');
        const menu = el.querySelector('.pack-dd-menu');
        if (menu) restorePackMenu(menu);
        const trigger = el.querySelector('.pack-dd-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
    if (typeof restoreFulfillmentMenu === 'function') restoreFulfillmentMenu();
    document.getElementById('fulfillment-dd')?.classList.remove('is-open');
}

function positionPackMenu(root) {
    const trigger = root.querySelector('.pack-dd-trigger');
    const menu = getPackMenuForRoot(root);
    if (!trigger || !menu) return;

    const pid = root.id?.replace(/^pack-dd-/, '') || root.getAttribute('data-product-id') || '';
    menu.setAttribute('data-pack-menu', pid);
    menu.__packRoot = root;
    // Escape overflow-x-hidden ancestors (view-category / body) — same as fulfillment portal
    menu.classList.add('pack-menu-portal');
    if (menu.parentElement !== document.body) document.body.appendChild(menu);

    // Show before measuring height so open-up math is accurate
    menu.classList.add('is-open');

    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const width = Math.max(rect.width, 140);
    const vv = window.visualViewport;
    const viewH = vv?.height || window.innerHeight;
    const viewW = vv?.width || window.innerWidth;
    const offsetTop = vv?.offsetTop || 0;
    const offsetLeft = vv?.offsetLeft || 0;

    menu.style.left = `${Math.min(Math.max(8, rect.left + offsetLeft), viewW - width - 8 + offsetLeft)}px`;
    menu.style.width = `${width}px`;

    const menuHeight = Math.min(menu.getBoundingClientRect().height || menu.scrollHeight || 160, viewH * 0.5);
    const spaceBelow = viewH - (rect.bottom - offsetTop) - gap;
    const spaceAbove = (rect.top - offsetTop) - gap;
    const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    if (openUp) {
        const top = Math.max(offsetTop + 8, rect.top + offsetTop - gap - menuHeight);
        menu.style.bottom = 'auto';
        menu.style.top = `${top}px`;
        root.classList.add('pack-dd-up');
    } else {
        menu.style.bottom = 'auto';
        menu.style.top = `${rect.bottom + offsetTop + gap}px`;
        root.classList.remove('pack-dd-up');
    }
}

/**
 * Prefer the clicked card's .pack-dd — never getElementById alone.
 * Sale items are rendered in home Deals AND category grids (duplicate ids);
 * getElementById would position against the hidden deals card (top of screen).
 */
function packDdRootFromEvent(productId, event) {
    const fromEvent = event?.currentTarget?.closest?.('.pack-dd')
        || event?.target?.closest?.('.pack-dd');
    if (fromEvent) return fromEvent;

    // Visible category/grid cards first; skip ancestors with display:none / .hidden
    const nodes = document.querySelectorAll(`[id="pack-dd-${productId}"], .pack-dd[data-product-id="${productId}"]`);
    for (const el of nodes) {
        if (el.id === 'fulfillment-dd') continue;
        if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
        const view = el.closest('#view-home, #view-category, #view-search, #pdp');
        if (view && view.classList.contains('hidden')) continue;
        return el;
    }
    return document.getElementById(`pack-dd-${productId}`);
}

function togglePackMenu(productId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const root = packDdRootFromEvent(productId, event);
    if (!root) return;
    const willOpen = !root.classList.contains('is-open');
    closeAllPackMenus();
    if (willOpen) {
        root.classList.add('is-open');
        const trigger = root.querySelector('.pack-dd-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        positionPackMenu(root);
    }
}

window.addEventListener('resize', () => {
    const open = document.querySelector('.pack-dd.is-open');
    if (open?.id === 'fulfillment-dd' && typeof positionFulfillmentMenu === 'function') {
        positionFulfillmentMenu();
        return;
    }
    if (open) positionPackMenu(open);
});
window.addEventListener('scroll', (e) => {
    if (e.target?.closest?.('.pack-dd-menu')) return;
    if (document.querySelector('.pack-dd.is-open') || document.querySelector('.pack-menu-portal.is-open')
        || document.querySelector('.fulfillment-menu-portal.is-open')) {
        closeAllPackMenus();
    }
}, true);

function escapePackKey(key) {
    return String(key || '').replace(/'/g, "\\'");
}

/** Compact buy row for listing cards: custom dropdown + stepper for selected pack. */
function renderPackCardBuyRowHtml(product) {
    const packs = getProductPackOptions(product);
    if (!packs.length) return '';
    const key = getSelectedPackKey(product.id);
    const pack = findPackByKey(product, key);
    const qty = getPackQty(product.id, key);
    const max = maxPackQtyForLine(product.id, key);

    return `
        <div class="buy-row" data-pack-card="${product.id}">
            <div class="pack-dd" id="pack-dd-${product.id}" data-product-id="${product.id}">
                <button type="button" class="pack-dd-trigger" aria-haspopup="listbox"
                    onclick="togglePackMenu(${product.id}, event)" aria-label="Choose pack">
                    <span class="pack-dd-label" id="pack-card-label-${product.id}">${typeof renderPackCardLabelHtml === 'function' ? renderPackCardLabelHtml(pack) : `${pack.label} · ₹${pack.price}`}</span>
                    <svg class="pack-dd-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <div class="pack-dd-menu" role="listbox">
                    ${packs.map((pk) => {
                        const pQty = getPackQty(product.id, pk.key);
                        const pMax = maxPackQtyForLine(product.id, pk.key);
                        const disabled = pMax <= 0 && pQty === 0;
                        const active = pk.key === key;
                        return `
                            <button type="button" role="option"
                                data-pack-option="${product.id}::${pk.key}"
                                class="pack-dd-option ${active ? 'is-active' : ''}"
                                ${disabled ? 'disabled' : ''}
                                onclick="event.stopPropagation(); setSelectedPackKey(${product.id}, '${escapePackKey(pk.key)}')">
                                <span class="pack-dd-check" aria-hidden="true">✓</span>
                                <span class="pack-dd-option-label">${pk.label}</span>
                                <span class="pack-dd-option-price">₹${pk.price}</span>
                            </button>`;
                    }).join('')}
                </div>
            </div>
            <div class="stepper flex-shrink-0">
                <button type="button" data-pack-card-minus="${product.id}"
                    class="qty-minus-btn step-btn minus ${qty <= 0 ? 'is-disabled' : ''}"
                    ${qty <= 0 ? 'disabled' : ''}
                    onclick="updatePackQty(${product.id}, '${escapePackKey(key)}', -1)"
                    aria-label="Decrease pack quantity">−</button>
                <span id="pack-card-qty-${product.id}" class="step-qty font-bold text-brand-blue">${qty}</span>
                <button type="button" data-pack-card-plus="${product.id}"
                    class="qty-plus-btn step-btn plus ${qty >= max ? 'is-disabled' : ''}"
                    ${qty >= max ? 'disabled' : ''}
                    onclick="updatePackQty(${product.id}, '${escapePackKey(key)}', 1)"
                    aria-label="Increase pack quantity">+</button>
            </div>
        </div>`;
}

/** Compact pack rows for product detail modal (and any full picker). */
function renderPackOptionsHtml(product, available) {
    const packs = getProductPackOptions(product);
    if (!packs.length) return '';
    const stock = available == null ? 999 : Math.max(0, available);
    const unit = packUnitLabel(product);

    return `
        <div class="pack-list" aria-label="Pack sizes for ${product.name}">
            ${packs.map((p) => {
                const qty = getPackQty(product.id, p.key);
                const max = maxPackQtyForLine(product.id, p.key);
                const canHave = max > 0 || qty > 0;
                const piecePricing = packsUsePiecePricing(product);
                const per = Math.round((p.price / p.units) * 10) / 10;
                const save = typeof savingsAmount === 'function' ? savingsAmount(p.price, p.mrp) : null;
                let sub;
                if (qty > 0) {
                    sub = piecePricing ? `${qty} in cart · ${p.units * qty} ${unit}` : `${qty} in cart`;
                } else if (!canHave) {
                    sub = stock < p.units ? `Need ${p.units} ${unit}` : `Not enough ${unit} left`;
                } else if (p.hint) {
                    sub = p.hint;
                } else if (piecePricing && save != null) {
                    sub = `~₹${per} per ${unit} · You save ₹${typeof formatInrAmount === 'function' ? formatInrAmount(save) : save}`;
                } else if (piecePricing) {
                    sub = `~₹${per} per ${unit}`;
                } else if (save != null) {
                    sub = `You save ₹${typeof formatInrAmount === 'function' ? formatInrAmount(save) : save}`;
                } else {
                    sub = '';
                }
                const offBadge = typeof renderPackRowOffBadge === 'function' ? renderPackRowOffBadge(p) : '';
                const priceCol = typeof renderPackRowPriceBHtml === 'function'
                    ? renderPackRowPriceBHtml(p)
                    : `<span class="pack-row-price">₹${p.price}</span>`;
                return `
                    <div data-pack-row="${product.id}::${p.key}"
                        class="pack-row ${qty > 0 ? 'is-selected' : ''} ${!canHave ? 'is-disabled' : ''}">
                        <div class="pack-row-main">
                            <span class="pack-row-label">${p.label}${offBadge}</span>
                            <span id="pack-sub-${product.id}-${p.key}" class="pack-row-sub">${sub}</span>
                        </div>
                        ${priceCol}
                        <div class="stepper">
                            <button type="button" data-pack-minus="${product.id}::${p.key}"
                                class="qty-minus-btn step-btn minus ${qty <= 0 ? 'is-disabled' : ''}"
                                ${qty <= 0 ? 'disabled' : ''}
                                onclick="updatePackQty(${product.id}, '${escapePackKey(p.key)}', -1)"
                                aria-label="Decrease ${p.label}">−</button>
                            <span id="pack-qty-${product.id}-${p.key}" class="step-qty font-bold text-brand-blue">${qty}</span>
                            <button type="button" data-pack-plus="${product.id}::${p.key}"
                                class="qty-plus-btn step-btn plus ${!(max > qty) ? 'is-disabled' : ''}"
                                ${!(max > qty) ? 'disabled' : ''}
                                onclick="updatePackQty(${product.id}, '${escapePackKey(p.key)}', 1)"
                                aria-label="Increase ${p.label}">+</button>
                        </div>
                    </div>`;
            }).join('')}
        </div>
        <p id="pack-hint-${product.id}" class="text-[10px] text-center text-slate-400 mt-1.5">${packsUsePiecePricing(product) ? 'Add any mix of packs · Inclusive of all taxes' : 'Choose an option · Inclusive of all taxes'}</p>`;
}

document.addEventListener('click', (e) => {
    if (e.target.closest('.pack-dd, .pack-dd-menu, .fulfillment-dd')) return;
    if (typeof closeAllPackMenus === 'function') closeAllPackMenus();
});
