function getCategoryProducts(category, subcategory = null) {
    return products.filter(p => {
        if (p.category !== category) return false;
        if (subcategory && p.subcategory !== subcategory) return false;
        return true;
    });
}

function getPriceBounds(items) {
    if (!items.length) return { min: 0, max: 1000 };
    const prices = items.map(p => p.price);
    return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Category filter keys, optionally limited by forSubcategories on the definition. */
function filterKeysForView(category) {
    const keys = categoryFilters[category] || [];
    const sub = AppState.route?.subcategory || null;
    return keys.filter((key) => {
        const def = filterDefinitions[key];
        if (!def) return false;
        const only = def.forSubcategories;
        if (!Array.isArray(only) || !only.length) return true;
        // On "All", show scoped filters too so shoppers can narrow by type.
        if (!sub) return true;
        return only.includes(sub);
    });
}

function applyFacetFilters(items) {
    let result = [...items];

    const avail = AppState.facetFilters.availability || [];
    if (avail.length) {
        result = result.filter(p => {
            if (avail.includes('inStock') && p.inStock) return true;
            if (avail.includes('outOfStock') && !p.inStock) return true;
            return false;
        });
    }

    const { min, max } = AppState.priceRange;
    if (min !== null && max !== null) {
        result = result.filter(p => p.price >= min && p.price <= max);
    }

    const category = AppState.route.category;
    const filterKeys = filterKeysForView(category);
    filterKeys.forEach(key => {
        if (key === 'availability' || key === 'price') return;
        const selected = AppState.facetFilters[key] || [];
        if (!selected.length) return;
        result = result.filter(p => {
            const val = p.filters?.[key];
            return val && selected.includes(val);
        });
    });

    return result;
}

function getActiveFilterChips() {
    const chips = [];
    const category = AppState.route.category;
    const filterKeys = filterKeysForView(category);

    filterKeys.forEach(key => {
        const def = filterDefinitions[key];
        if (key === 'price') {
            const { min, max } = AppState.priceRange;
            const bounds = getPriceBounds(getCategoryProducts(category, AppState.route.subcategory));
            if (min !== null && max !== null && (min > bounds.min || max < bounds.max)) {
                chips.push({ key: 'price', label: `₹${min} – ₹${max}`, value: 'price' });
            }
            return;
        }
        (AppState.facetFilters[key] || []).forEach(val => {
            const opt = def.options.find(o => o.value === val);
            chips.push({ key, label: opt?.label || val, value: val });
        });
    });

    return chips;
}

function toggleFacetFilter(key, value) {
    if (!AppState.facetFilters[key]) AppState.facetFilters[key] = [];
    const arr = AppState.facetFilters[key];
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(value);
    renderCategoryPage();
}

function removeFilterChip(key, value) {
    if (key === 'price') {
        AppState.priceRange = { min: null, max: null };
    } else {
        const arr = AppState.facetFilters[key] || [];
        const idx = arr.indexOf(value);
        if (idx >= 0) arr.splice(idx, 1);
    }
    renderCategoryPage();
}

function clearAllFilters() {
    AppState.facetFilters = {};
    AppState.priceRange = { min: null, max: null };
    renderCategoryPage();
}

function setPriceRange(min, max, { refresh = true } = {}) {
    AppState.priceRange = { min, max };
    if (refresh) refreshCategoryFilteredResults();
}

/** Update product list + chips without rebuilding the price slider (keeps drag alive). */
function refreshCategoryFilteredResults() {
    const { category, subcategory } = AppState.route;
    if (!category || category === '__deals__') return;

    const baseItems = getCategoryProducts(category, subcategory);
    const filtered = applyFacetFilters(baseItems);
    renderFilterChips();

    if (subcategory) {
        document.getElementById('subsections-container')?.classList.add('hidden');
        document.getElementById('flat-grid-container')?.classList.remove('hidden');
        renderProductGrid(filtered, 'category-product-list');
    } else {
        document.getElementById('flat-grid-container')?.classList.add('hidden');
        document.getElementById('subsections-container')?.classList.remove('hidden');
        renderSubcategorySections(category, filtered);
    }
}

function isComboProduct(product) {
    return product.isCombo || isComboSubcategory(product.subcategory);
}

function renderProductCard(product) {
    const combo = isComboProduct(product);
    const hasPacks = typeof productHasPacks === 'function' && productHasPacks(product);
    const available = typeof getAvailableStock === 'function' ? getAvailableStock(product.id) : (product.available ?? null);
    const max = hasPacks
        ? 0
        : (typeof maxQtyForProduct === 'function' ? maxQtyForProduct(product.id) : (product.inStock ? 999 : 0));
    const qty = hasPacks ? 0 : (AppState.cart[product.id] || 0);
    const inStock = hasPacks
        ? (available == null
            ? true
            : available > 0 && getProductPackOptions(product).some((p) => available >= p.units))
        : max > 0;
    const atMax = !hasPacks && inStock && qty >= max && max > 0;
    // Low stock: bottom only (top badge overlaps combo/product photos)
    const showLowStockBottom = inStock && available !== null && available <= 5;

    const saleBadge = product.onSale && !combo
        ? `<span class="absolute top-3 left-3 bg-brand-coral text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-sm z-[1]">SALE</span>` : '';
    const comboBadge = combo
        ? `<span class="combo-badge absolute top-3 left-3 z-[1]">COMBO PACK</span>` : '';
    const lowStockBadge = '';

    const typeChip = hasPacks
        ? (product.category === 'Aquarium'
            ? '<span class="type-chip packs">Has options</span>'
            : '<span class="type-chip packs">Has packs</span>')
        : '';

    let buyBlock = '';
    if (!inStock) {
        buyBlock = `<span class="text-brand-coral font-bold px-3 py-1.5 bg-orange-50 border border-brand-coral/20 rounded-lg text-sm text-center">Out of Stock</span>`;
    } else if (hasPacks && typeof renderPackCardBuyRowHtml === 'function') {
        buyBlock = renderPackCardBuyRowHtml(product);
    } else {
        const plusDisabled = atMax;
        const minusDisabled = qty <= 0;
        const showBottomHint = showLowStockBottom || (atMax && qty > 0);
        const bottomText = showLowStockBottom
            ? `Only ${available} left`
            : (atMax && qty > 0 ? `Only ${max} left` : '');
        const priceHtml = typeof renderPriceBCardHtml === 'function'
            ? renderPriceBCardHtml(product.price, product.mrp)
            : (typeof renderPriceBTopHtml === 'function'
                ? renderPriceBTopHtml(product.price, product.mrp)
                : `<span class="price-solo">₹${product.price}/-</span>`);
        buyBlock = `
            <div class="buy-row buy-row-simple">
                <div class="price-b-wrap flex-1 min-w-0">${priceHtml}</div>
                <div class="stepper flex-shrink-0">
                    <button type="button" data-minus-id="${product.id}" onclick="event.stopPropagation(); updateQty(${product.id}, -1)"
                        class="qty-minus-btn step-btn minus ${minusDisabled ? 'is-disabled' : ''}"
                        ${minusDisabled ? 'disabled' : ''} aria-label="Decrease quantity">−</button>
                    <span id="qty-${product.id}" class="step-qty font-bold text-brand-blue">${qty}</span>
                    <button type="button" data-plus-id="${product.id}" onclick="event.stopPropagation(); updateQty(${product.id}, 1)"
                        class="qty-plus-btn step-btn plus ${plusDisabled ? 'is-disabled' : ''}"
                        ${plusDisabled ? 'disabled' : ''} aria-label="Increase quantity">+</button>
                </div>
            </div>
            <p id="stock-hint-${product.id}" class="stock-hint text-[10px] font-semibold text-brand-coral text-center ${showBottomHint ? '' : 'hidden'}">${bottomText}</p>`;
    }

    const subLabel = combo
        ? `<span class="combo-sub-label text-xs font-bold uppercase tracking-wide">${product.subcategory}</span>`
        : `<span class="text-[10px] font-semibold uppercase tracking-wide text-brand-blue/50">${product.subcategory}</span>`;

    const mainImg = typeof productMainImage === 'function' ? productMainImage(product) : (product.image || '');
    const gallery = typeof productGalleryUrls === 'function' ? productGalleryUrls(product) : [mainImg];
    const galleryAttr = gallery.length > 1
        ? `data-product-gallery='${JSON.stringify(gallery).replace(/'/g, '&#39;')}'`
        : '';
    const skuAttr = product.sku
        ? `data-sku="${String(product.sku).replace(/"/g, '&quot;')}" data-img-index="1"`
        : '';

    const includeLabels = combo && typeof getComboIncludeLabels === 'function'
        ? getComboIncludeLabels(product)
        : (combo && Array.isArray(product.comboItems)
            ? product.comboItems.map((ci) => (typeof comboItemLabel === 'function' ? comboItemLabel(ci) : String(ci))).filter(Boolean)
            : []);
    const comboIncludesHtml = includeLabels.length
        ? `<ul class="combo-includes">${includeLabels.map((l) => `<li>${l}</li>`).join('')}</ul>`
        : '';

    return `
        <div class="group product-card ${combo ? 'combo-card' : 'bg-white border-brand-blue/10 hover:border-brand-blue/30'} bg-white rounded-2xl shadow-sm border-2 hover:shadow-lg transition-all duration-300 ease-out flex flex-col h-full ${!inStock ? 'opacity-70' : ''}"
            role="button" tabindex="0"
            aria-label="Open details for ${String(product.name).replace(/"/g, '&quot;')}"
            onclick="if(!event.target.closest('.pack-dd, .stepper, .step-btn, button, a')) openProductDetail(${product.id})"
            onkeydown="if((event.key==='Enter'||event.key===' ')&&!event.target.closest('.pack-dd, .stepper, button')){event.preventDefault();openProductDetail(${product.id})}">
            <div class="relative overflow-hidden flex-shrink-0 rounded-t-[0.9rem] ${combo ? 'bg-gradient-to-br from-orange-50 to-amber-50' : 'bg-[#F8FAFC]'}">
                ${comboBadge}${saleBadge}${lowStockBadge}
                <img src="${mainImg}" alt="${product.name}"
                    loading="lazy" decoding="async"
                    ${skuAttr}
                    ${galleryAttr}
                    class="lazy-product-img product-card-img w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    onload="this.classList.add('loaded')"
                    onerror="typeof handleProductImgError==='function'?handleProductImgError(this):(this.onerror=null)"
                    data-fallback="${(product.image || '').replace(/"/g, '&quot;')}">
            </div>
            <div class="p-3 sm:p-3.5 flex flex-col flex-1 min-h-0 gap-2">
                <div class="flex items-center justify-between gap-2">
                    ${subLabel}
                    ${typeChip}
                </div>
                <h3 class="card-title font-bold text-brand-blue text-sm sm:text-base leading-snug line-clamp-2">${product.name}</h3>
                ${comboIncludesHtml}
                <div class="mt-auto flex flex-col gap-2 flex-shrink-0">
                    ${buyBlock}
                </div>
            </div>
        </div>
    `;
}

function syncPackUIsIn(root) {
    if (!root || typeof productHasPacks !== 'function' || typeof syncPackCardUI !== 'function') return;
    const seen = new Set();
    (typeof products !== 'undefined' ? products : []).forEach((p) => {
        if (!productHasPacks(p) || seen.has(p.id)) return;
        if (root.querySelector?.(`[data-pack-card="${p.id}"], [data-pack-row^="${p.id}::"]`)) {
            seen.add(p.id);
            syncPackCardUI(p.id);
        }
    });
}

function catalogLoadingSkeletonHtml(count = 6) {
    return Array.from({ length: count }, () => `
        <div class="catalog-skel rounded-2xl border border-slate-100 overflow-hidden bg-white" aria-hidden="true">
            <div class="aspect-[4/3] bg-slate-100 catalog-skel-pulse"></div>
            <div class="p-3 space-y-2">
                <div class="h-3 w-1/3 bg-slate-100 rounded catalog-skel-pulse"></div>
                <div class="h-4 w-3/4 bg-slate-100 rounded catalog-skel-pulse"></div>
                <div class="h-8 w-full bg-slate-100 rounded catalog-skel-pulse"></div>
            </div>
        </div>`).join('');
}

function renderProductGrid(items, containerId, noResultsId = 'no-results') {
    const container = document.getElementById(containerId);
    const noResults = document.getElementById(noResultsId);
    if (!container) return;

    if (typeof isCatalogPending === 'function' && isCatalogPending()) {
        noResults?.classList.add('hidden');
        container.innerHTML = catalogLoadingSkeletonHtml(containerId === 'search-product-list' ? 8 : 6);
        return;
    }

    if (!items.length) {
        container.innerHTML = '';
        noResults?.classList.remove('hidden');
        return;
    }
    noResults?.classList.add('hidden');
    container.innerHTML = items.map(renderProductCard).join('');
    if (typeof bindProductImageHover === 'function') bindProductImageHover(container);
    syncPackUIsIn(container);
}

function renderHomepage() {
    renderCategoryCards();
    renderDealsRow();
    renderCombosRow();
}

function renderCategoryCards() {
    const container = document.getElementById('category-cards');
    if (!container) return;

    container.innerHTML = Object.entries(categoryMeta).map(([name, meta]) => `
            <button type="button" role="listitem" onclick="navigateTo('${meta.slug}')"
                class="category-circle" aria-label="Shop ${name}">
                <span class="category-circle-img">
                    <img src="${meta.image}" alt="" loading="lazy"
                        onerror="this.src='https://placehold.co/160x160/004B93/FFFFFF?text=${encodeURIComponent(name)}'">
                </span>
                <span class="category-circle-label">${name}</span>
            </button>
        `).join('');
}

function renderDealsRow() {
    const container = document.getElementById('deals-row');
    if (!container) return;

    if (typeof isCatalogPending === 'function' && isCatalogPending()) {
        container.innerHTML = `<div class="deals-scroll flex gap-4 pb-2">${
            Array.from({ length: 4 }, () => `<div class="flex-shrink-0 w-40 sm:w-52">${catalogLoadingSkeletonHtml(1)}</div>`).join('')
        }</div>`;
        return;
    }

    const deals = products.filter(p => p.onSale).slice(0, 8);
    if (!deals.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No deals right now — check back soon!</p>';
        return;
    }

    container.innerHTML = `<div class="deals-scroll flex gap-4 pb-2">
        ${deals.map(p => `<div class="flex-shrink-0 w-40 sm:w-52">${renderProductCard(p)}</div>`).join('')}
    </div>`;
    if (typeof bindProductImageHover === 'function') bindProductImageHover(container);
    syncPackUIsIn(container);
}

function renderCombosRow() {
    const container = document.getElementById('combos-row');
    if (!container) return;

    if (typeof isCatalogPending === 'function' && isCatalogPending()) {
        container.innerHTML = `<div class="deals-scroll combos-scroll flex items-stretch gap-4 pb-2">${
            Array.from({ length: 3 }, () => `<div class="combo-scroll-item flex-shrink-0 w-44 sm:w-56">${catalogLoadingSkeletonHtml(1)}</div>`).join('')
        }</div>`;
        return;
    }

    const combos = products.filter(p => p.isCombo);
    if (!combos.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm">Combo packs coming soon!</p>';
        return;
    }

    container.innerHTML = `<div class="deals-scroll combos-scroll flex items-stretch gap-4 pb-2">
        ${combos.map(p => `<div class="combo-scroll-item flex-shrink-0 w-44 sm:w-56">${renderProductCard(p)}</div>`).join('')}
    </div>`;
    if (typeof bindProductImageHover === 'function') bindProductImageHover(container);
    syncPackUIsIn(container);
}

function renderSearchPage() {
    const title = document.getElementById('search-title');
    const subtitle = document.getElementById('search-subtitle');
    if (title) title.innerText = 'Search Results';
    if (subtitle) subtitle.innerText = `Results for "${AppState.search}"`;

    const q = AppState.search;
    const filtered = products.filter(p => {
        const haystack = `${p.name} ${p.description} ${p.category} ${p.subcategory}`.toLowerCase();
        return haystack.includes(q);
    });

    renderProductGrid(filtered, 'search-product-list', 'search-no-results');
}

function renderFilterSidebar(category, baseItems) {
    const sidebar = document.getElementById('filter-sidebar');
    if (!sidebar) return;

    const filterKeys = typeof filterKeysForView === 'function'
        ? filterKeysForView(category)
        : (categoryFilters[category] || []);
    const bounds = getPriceBounds(baseItems);
    const priceMin = AppState.priceRange.min ?? bounds.min;
    const priceMax = AppState.priceRange.max ?? bounds.max;

    let html = `<div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-brand-blue">Filters</h3>
        <button onclick="clearAllFilters()" class="text-xs text-brand-coral font-semibold hover:underline">Clear all</button>
    </div>`;

    filterKeys.forEach(key => {
        const def = filterDefinitions[key];
        if (!def) return;

        html += `<div class="filter-group">`;
        html += `<h4 class="text-sm font-semibold text-gray-800 mb-2">${def.label}</h4>`;

        if (def.type === 'checkbox') {
            def.options.forEach(opt => {
                const checked = (AppState.facetFilters[key] || []).includes(opt.value);
                html += `
                    <label class="flex items-center gap-2 py-1 text-sm text-gray-600 cursor-pointer">
                        <input type="checkbox" class="filter-checkbox" ${checked ? 'checked' : ''}
                            onchange="toggleFacetFilter('${key}', '${opt.value.replace(/'/g, "\\'")}')">
                        ${opt.label}
                    </label>
                `;
            });
        }

        if (def.type === 'range') {
            html += `
                <div class="text-xs text-gray-500 mb-1" data-price-label>₹${priceMin} – ₹${priceMax}</div>
                <div class="price-range-track" role="group" aria-label="Price range">
                    <div class="price-range-fill" style="left:${((priceMin - bounds.min) / (bounds.max - bounds.min || 1)) * 100}%; right:${100 - ((priceMax - bounds.min) / (bounds.max - bounds.min || 1)) * 100}%"></div>
                    <input type="range" class="price-range-input" data-price="min" min="${bounds.min}" max="${bounds.max}" value="${priceMin}"
                        step="1" aria-label="Minimum price"
                        onpointerdown="activatePriceHandle(this)" onfocus="activatePriceHandle(this)"
                        oninput="onPriceMinChange(this, ${bounds.min}, ${bounds.max})"
                        onchange="commitPriceRange()" onpointerup="commitPriceRange()" ontouchend="commitPriceRange()">
                    <input type="range" class="price-range-input" data-price="max" min="${bounds.min}" max="${bounds.max}" value="${priceMax}"
                        step="1" aria-label="Maximum price"
                        onpointerdown="activatePriceHandle(this)" onfocus="activatePriceHandle(this)"
                        oninput="onPriceMaxChange(this, ${bounds.min}, ${bounds.max})"
                        onchange="commitPriceRange()" onpointerup="commitPriceRange()" ontouchend="commitPriceRange()">
                </div>
            `;
        }

        html += `</div>`;
    });

    sidebar.innerHTML = html;
}

function activatePriceHandle(el) {
    const track = el.closest('.price-range-track');
    if (!track) return;
    track.querySelectorAll('.price-range-input').forEach((input) => {
        input.classList.toggle('is-active', input === el);
    });
}

function onPriceMinChange(el, boundMin, boundMax) {
    activatePriceHandle(el);
    const track = el.closest('.price-range-track');
    const maxEl = track?.querySelector('[data-price="max"]');
    if (!maxEl) return;
    let min = parseInt(el.value, 10);
    let max = parseInt(maxEl.value, 10);
    if (min > max) { min = max; el.value = min; }
    syncPriceInputs('min', min);
    syncPriceInputs('max', max);
    updateAllPriceFills(min, max, boundMin, boundMax);
    updatePriceLabels(min, max);
    // Keep slider UI live; defer product grid refresh until drag ends (avoids image flicker).
    setPriceRange(min, max, { refresh: false });
}

function onPriceMaxChange(el, boundMin, boundMax) {
    activatePriceHandle(el);
    const track = el.closest('.price-range-track');
    const minEl = track?.querySelector('[data-price="min"]');
    if (!minEl) return;
    let min = parseInt(minEl.value, 10);
    let max = parseInt(el.value, 10);
    if (max < min) { max = min; el.value = max; }
    syncPriceInputs('min', min);
    syncPriceInputs('max', max);
    updateAllPriceFills(min, max, boundMin, boundMax);
    updatePriceLabels(min, max);
    setPriceRange(min, max, { refresh: false });
}

function commitPriceRange() {
    refreshCategoryFilteredResults();
}

function syncPriceInputs(which, value) {
    document.querySelectorAll(`[data-price="${which}"]`).forEach((input) => {
        if (String(input.value) !== String(value)) input.value = value;
    });
}

function updatePriceLabels(min, max) {
    document.querySelectorAll('[data-price-label]').forEach((el) => {
        el.textContent = `₹${min} – ₹${max}`;
    });
}

function updateAllPriceFills(min, max, boundMin, boundMax) {
    const range = boundMax - boundMin || 1;
    const left = `${((min - boundMin) / range) * 100}%`;
    const right = `${100 - ((max - boundMin) / range) * 100}%`;
    document.querySelectorAll('.price-range-fill').forEach((fill) => {
        fill.style.left = left;
        fill.style.right = right;
    });
}

function renderFilterChips() {
    const container = document.getElementById('filter-chips');
    if (!container) return;

    const chips = getActiveFilterChips();
    if (!chips.length) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = chips.map(c => `
        <button onclick="removeFilterChip('${c.key}', '${c.value.replace(/'/g, "\\'")}')"
            class="filter-chip inline-flex items-center gap-1 bg-orange-50 text-brand-coral text-xs font-medium px-2.5 py-1 rounded-full border border-brand-coral/20">
            ${c.label}
            <span aria-hidden="true">×</span>
        </button>
    `).join('');
}

function renderSubcategoryPills(category, activeSub) {
    const container = document.getElementById('subcategory-pills');
    if (!container) return;

    const slug = categoryMeta[category].slug;
    const subs = orderedSubcategories(category);

    let html = `<button onclick="navigateTo('${slug}')"
        class="sub-pill px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${!activeSub ? 'is-active bg-brand-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">All</button>`;

    subs.forEach(sub => {
        const subSlug = subcategoryToSlug(sub);
        const isActive = activeSub === sub;
        const combo = isComboSubcategory(sub);
        const activeClass = isActive ? 'is-active bg-brand-blue text-white' : combo ? 'bg-orange-50 text-brand-coral border border-brand-coral/30 hover:bg-orange-100' : 'bg-gray-100 text-gray-700 hover:bg-gray-200';
        const label = combo ? `🎁 ${sub}` : sub;
        html += `<button onclick="navigateTo('${slug}/${subSlug}')"
            class="sub-pill px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${activeClass}">${label}</button>`;
    });

    container.innerHTML = html;
}

function renderCategoryPage() {
    const { category, subcategory } = AppState.route;
    if (!category) return;

    if (category === '__deals__') {
        renderDealsCategoryPage();
        syncMobileFilterPanel();
        return;
    }

    renderBreadcrumbs();
    renderSubcategoryPills(category, subcategory);

    const title = document.getElementById('category-title');
    const count = document.getElementById('product-count');
    const baseItems = getCategoryProducts(category, subcategory);

    if (title) title.innerText = subcategory || `All ${category}`;
    if (count) {
        count.innerText = (typeof isCatalogPending === 'function' && isCatalogPending())
            ? 'Loading…'
            : `${baseItems.length} products`;
    }

    renderFilterSidebar(category, getCategoryProducts(category, null));
    renderFilterChips();

    const filtered = applyFacetFilters(baseItems);

    if (subcategory) {
        document.getElementById('subsections-container')?.classList.add('hidden');
        document.getElementById('flat-grid-container')?.classList.remove('hidden');
        renderProductGrid(filtered, 'category-product-list');
    } else if (typeof isCatalogPending === 'function' && isCatalogPending()) {
        document.getElementById('subsections-container')?.classList.add('hidden');
        document.getElementById('flat-grid-container')?.classList.remove('hidden');
        renderProductGrid([], 'category-product-list');
    } else {
        document.getElementById('flat-grid-container')?.classList.add('hidden');
        document.getElementById('subsections-container')?.classList.remove('hidden');
        renderSubcategorySections(category, filtered);
    }

    syncMobileFilterPanel();
}

function renderDealsCategoryPage() {
    const title = document.getElementById('category-title');
    const count = document.getElementById('product-count');
    const breadcrumbs = document.getElementById('breadcrumbs');
    if (title) title.innerText = 'Deals';
    if (breadcrumbs) breadcrumbs.innerHTML = `<button onclick="navigateTo('home')" class="breadcrumb-link">Home</button><span class="breadcrumb-sep mx-2">›</span><span class="text-brand-blue font-medium">Deals</span>`;
    document.getElementById('subcategory-pills').innerHTML = '';
    document.getElementById('filter-sidebar').innerHTML = '<p class="text-sm text-gray-500">Showing all items on sale.</p>';
    document.getElementById('filter-chips')?.classList.add('hidden');
    document.getElementById('subsections-container')?.classList.add('hidden');
    document.getElementById('flat-grid-container')?.classList.remove('hidden');
    const deals = products.filter(p => p.onSale);
    if (count) {
        count.innerText = (typeof isCatalogPending === 'function' && isCatalogPending())
            ? 'Loading…'
            : `${deals.length} products`;
    }
    renderProductGrid(deals, 'category-product-list');
}

function renderSubcategorySections(category, filteredItems) {
    const container = document.getElementById('subsections-container');
    if (!container) return;

    const subs = orderedSubcategories(category);

    container.innerHTML = subs.map(sub => {
        const items = filteredItems.filter(p => p.subcategory === sub);
        if (!items.length) return '';

        const combo = isComboSubcategory(sub);
        const headerClass = combo ? 'combo-section-header' : 'subsection-header';
        const catSlug = categoryMeta[category].slug;
        const subSlug = subcategoryToSlug(sub);

        return `
            <section class="mb-10 ${combo ? 'combo-section' : ''}">
                <div class="${headerClass} flex items-center gap-2 pb-2 mb-4">
                    ${combo ? '<span class="combo-pill">COMBO</span>' : ''}
                    <h3 class="text-lg font-bold ${combo ? 'text-brand-coral' : 'text-brand-blue'}">${sub}</h3>
                    <span class="text-xs text-slate-400 font-medium">${items.length} item${items.length === 1 ? '' : 's'}</span>
                    <button type="button" onclick="navigateTo('${catSlug}/${subSlug}')"
                        class="ml-auto text-sm text-brand-coral font-semibold hover:underline flex-shrink-0">View all →</button>
                </div>
                <div class="deals-scroll ${combo ? 'combos-scroll' : ''} flex ${combo ? 'items-stretch' : ''} gap-3 sm:gap-4 pb-2">
                    ${items.map((p) => `
                        <div class="${combo ? 'combo-scroll-item' : ''} flex-shrink-0 w-44 sm:w-52 lg:w-56">
                            ${renderProductCard(p)}
                        </div>
                    `).join('')}
                </div>
            </section>
        `;
    }).join('') || '<p class="text-center text-gray-400 py-12">No products match your filters.</p>';
    if (typeof bindProductImageHover === 'function') bindProductImageHover(container);
    syncPackUIsIn(container);
}

function openFilterDrawer() {
    document.getElementById('filter-drawer')?.classList.add('open');
    document.getElementById('filter-overlay')?.classList.add('open');
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.lock('filters-open');
    else document.body.style.overflow = 'hidden';
    if (typeof ModalHistory !== 'undefined') ModalHistory.push('filters');
}

function closeFilterDrawer(opts = {}) {
    const drawer = document.getElementById('filter-drawer');
    const wasOpen = drawer?.classList.contains('open');
    drawer?.classList.remove('open');
    document.getElementById('filter-overlay')?.classList.remove('open');
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.unlock('filters-open');
    else document.body.style.overflow = '';
    if (wasOpen && !opts.fromHistory && typeof ModalHistory !== 'undefined') {
        ModalHistory.dismiss('filters');
    }
}

function syncMobileFilterPanel() {
    const mobilePanel = document.getElementById('filter-drawer-content');
    const sidebar = document.getElementById('filter-sidebar');
    if (mobilePanel && sidebar) mobilePanel.innerHTML = sidebar.innerHTML;
}
