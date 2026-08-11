/**
 * Product detail modal (Option 4 hybrid).
 * Gallery + description/details + pack or simple qty controls.
 */

let pdpOpenId = null;
let pdpMedia = [];
let pdpMediaIndex = 0;
let pdpOpenToken = 0;

function getProductDetailBullets(product) {
    if (!product) return [];
    if (Array.isArray(product.details) && product.details.length) {
        return product.details.map(String).filter(Boolean);
    }
    return [];
}

function getComboIncludeLabels(product) {
    if (!product?.isCombo) return [];
    if (!Array.isArray(product?.comboItems) || !product.comboItems.length) return [];
    return product.comboItems
        .map((ci) => (typeof comboItemLabel === 'function' ? comboItemLabel(ci) : String(ci)))
        .filter(Boolean);
}

function buildPdpMedia(product, galleryUrls) {
    const list = [];
    const gallery = Array.isArray(galleryUrls)
        ? galleryUrls
        : (product.image ? [product.image] : []);
    gallery.forEach((src) => {
        if (src) list.push({ type: 'image', src });
    });
    if (product.videoUrl) {
        // Keep original URL; renderProductVideoHtml converts Drive links to embed.
        list.push({ type: 'video', src: String(product.videoUrl).trim() });
    }
    if (!list.length && product.image) {
        list.push({ type: 'image', src: product.image });
    }
    return list;
}

function renderPdpMainMedia({ autoplay = false } = {}) {
    const m = pdpMedia[pdpMediaIndex];
    if (!m) return '<div class="w-full h-full bg-slate-100"></div>';
    if (m.type === 'video') {
        // Stage shows poster; play opens lightbox (YouTube) or Drive on phone-only for Drive links
        return renderPdpVideoStagePoster();
    }
    const sku = products.find((p) => p.id == pdpOpenId)?.sku || '';
    return `<img src="${m.src}" alt="" class="w-full h-full object-cover cursor-zoom-in"
        ${sku ? `data-sku="${String(sku).replace(/"/g, '&quot;')}" data-img-index="${pdpMediaIndex + 1}"` : ''}
        onclick="openPdpLightbox()"
        onerror="typeof handleProductImgError==='function'?handleProductImgError(this):(this.onerror=null)">`;
}

/** Phone-only: Drive iframes break (dark bar). YouTube plays in-page on all sizes. */
function isPhoneVideoViewport() {
    return typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 767px)').matches;
}

/** Poster + play CTA in the PDP stage. */
function renderPdpVideoStagePoster() {
    const poster = (pdpMedia.find((x) => x.type === 'image') || {}).src || '';
    const img = poster
        ? `<img src="${poster}" alt="" class="w-full h-full object-cover" onerror="this.remove()">`
        : '<div class="w-full h-full bg-slate-800"></div>';
    const m = pdpMedia[pdpMediaIndex];
    const isYt = m && typeof youtubeVideoMeta === 'function' && !!youtubeVideoMeta(m.src);
    const phoneDrive = isPhoneVideoViewport() && !isYt
        && typeof googleDriveFileId === 'function'
        && !!googleDriveFileId(m?.src);
    const label = phoneDrive ? 'Play video' : 'Tap to play';
    const aria = phoneDrive ? 'Play video in Google Drive' : 'Play video';
    return `<button type="button" class="pdp-video-stage-btn" onclick="playPdpVideo()" aria-label="${aria}">
        ${img}
        <span class="pdp-video-stage-play" aria-hidden="true">▶</span>
        <span class="pdp-video-stage-label">${label}</span>
    </button>`;
}

/**
 * Entry point for video play from thumb or poster.
 * YouTube/Shorts → in-page lightbox (all devices, vertical for Shorts).
 * Phone + Drive only → open Drive viewer.
 * Else → lightbox.
 */
function playPdpVideo() {
    const m = pdpMedia[pdpMediaIndex];
    if (!m || m.type !== 'video') return;

    const isYt = typeof youtubeVideoMeta === 'function' && youtubeVideoMeta(m.src);
    if (isYt) {
        openPdpLightbox({ autoplay: true });
        return;
    }

    const driveId = typeof googleDriveFileId === 'function' ? googleDriveFileId(m.src) : null;
    if (isPhoneVideoViewport() && driveId) {
        openDriveVideoOnPhone(driveId);
        return;
    }

    openPdpLightbox({ autoplay: true });
}

/** Open Drive’s own player — only dependable path for Drive videos on phones. */
function openDriveVideoOnPhone(driveId) {
    const id = String(driveId || '').trim();
    if (!id) return;
    const viewUrl = `https://drive.google.com/file/d/${id}/view`;

    const opened = window.open(viewUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
        window.location.href = viewUrl;
        return;
    }

    const box = document.getElementById('lightbox-media');
    const lb = document.getElementById('lightbox');
    if (!box || !lb) return;
    box.innerHTML = `<div class="pdp-video-mobile-sheet" onclick="event.stopPropagation()">
        <p class="pdp-video-mobile-sheet-title">Playing in Google Drive</p>
        <p class="pdp-video-mobile-sheet-body">Video opens in a new tab — Drive’s player works reliably on phones. Prefer a YouTube Shorts link in the Sheet for in-page play.</p>
        <a class="pdp-video-mobile-sheet-btn" href="${typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr(viewUrl) : viewUrl}" target="_blank" rel="noopener noreferrer">Open video again</a>
        <button type="button" class="pdp-video-mobile-sheet-close" onclick="closePdpLightbox()">Back to product</button>
    </div>`;
    lb.classList.add('is-open');
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.lock('lightbox-open');
    else document.body.classList.add('lightbox-open');
}

function setPdpMedia(index) {
    if (!pdpMedia.length) return;
    pdpMediaIndex = Math.max(0, Math.min(index, pdpMedia.length - 1));
    const stage = document.getElementById('pdp-stage');
    const isVideo = pdpMedia[pdpMediaIndex]?.type === 'video';
    if (stage) {
        stage.innerHTML = renderPdpMainMedia({ autoplay: isVideo });
    }
    document.querySelectorAll('#pdp-thumbs .thumb').forEach((t, i) => {
        t.classList.toggle('is-active', i === pdpMediaIndex);
    });

    if (isVideo) {
        playPdpVideo();
    } else {
        closePdpLightbox();
    }
}

function openPdpLightbox(opts = {}) {
    const m = pdpMedia[pdpMediaIndex];
    if (!m) return;
    const box = document.getElementById('lightbox-media');
    const lb = document.getElementById('lightbox');
    if (!box || !lb) return;

    // Phones: only divert Drive (not YouTube) to external player
    if (m.type === 'video' && isPhoneVideoViewport()) {
        const isYt = typeof youtubeVideoMeta === 'function' && youtubeVideoMeta(m.src);
        const driveId = typeof googleDriveFileId === 'function' ? googleDriveFileId(m.src) : null;
        if (!isYt && driveId) {
            openDriveVideoOnPhone(driveId);
            return;
        }
    }

    if (m.type === 'video') {
        if (typeof renderProductVideoHtml === 'function') {
            box.innerHTML = renderProductVideoHtml(m.src, 'pdp-video', { autoplay: true, lightbox: true });
            if (typeof bindPdpVideoLoading === 'function') bindPdpVideoLoading(box);
            if (typeof tryStartPdpVideo === 'function') tryStartPdpVideo(box);
        } else {
            box.innerHTML = `<video src="${m.src}" controls autoplay playsinline webkit-playsinline class="pdp-video" style="width:100%;max-height:88vh"></video>`;
        }
    } else {
        box.innerHTML = `<img src="${m.src}" alt="">`;
    }
    lb.classList.add('is-open');
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.lock('lightbox-open');
    else document.body.classList.add('lightbox-open');
    if (typeof ModalHistory !== 'undefined') ModalHistory.push('lightbox');
}

function closePdpLightbox(opts = {}) {
    const lb = document.getElementById('lightbox');
    const box = document.getElementById('lightbox-media');
    const wasOpen = lb?.classList.contains('is-open');
    if (lb) lb.classList.remove('is-open');
    if (box) box.innerHTML = '';
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.unlock('lightbox-open');
    else document.body.classList.remove('lightbox-open');
    if (wasOpen && !opts.fromHistory && typeof ModalHistory !== 'undefined') {
        ModalHistory.dismiss('lightbox');
    }
}

async function openProductDetail(productId) {
    const product = products.find((p) => p.id == productId);
    if (!product) return;

    const token = ++pdpOpenToken;
    pdpOpenId = product.id;
    pdpMediaIndex = 0;

    // Only include image files that exist (-01, -02, -03… stop at first gap).
    const gallery = typeof resolveProductGalleryUrls === 'function'
        ? await resolveProductGalleryUrls(product)
        : (product.image ? [product.image] : []);
    if (token !== pdpOpenToken) return;

    pdpMedia = buildPdpMedia(product, gallery);

    const hasPacks = typeof productHasPacks === 'function' && productHasPacks(product);
    const available = typeof getAvailableStock === 'function'
        ? getAvailableStock(product.id)
        : (product.available ?? null);
    const unit = typeof packUnitLabel === 'function' ? packUnitLabel(product) : 'fish';
    const bullets = getProductDetailBullets(product);
    const includes = getComboIncludeLabels(product);

    let buySection = '';
    if (hasPacks) {
        const inStock = available == null
            ? true
            : available > 0 && getProductPackOptions(product).some((p) => available >= p.units);
        buySection = inStock
            ? `<h3 class="pdp-section-title text-base font-bold text-brand-blue mb-1">Choose pack</h3>
               <p id="pack-from-${product.id}" class="text-xs text-slate-400 mb-1.5">${available != null ? `${available} ${unit} in stock · options share stock` : 'Options'}</p>
               ${typeof renderPackOptionsHtml === 'function' ? renderPackOptionsHtml(product, available) : ''}`
            : `<p class="text-brand-coral font-bold text-base">Out of Stock</p>`;
    } else {
        const max = typeof maxQtyForProduct === 'function' ? maxQtyForProduct(product.id) : (product.inStock ? 999 : 0);
        const qty = AppState.cart[product.id] || 0;
        const inStock = max > 0;
        const top = typeof renderPriceBTopHtml === 'function'
            ? renderPriceBTopHtml(product.price, product.mrp)
            : `<span class="price-solo">₹${product.price}/-</span>`;
        const save = typeof renderPriceBSaveHtml === 'function'
            ? renderPriceBSaveHtml(product.price, product.mrp)
            : '';
        buySection = inStock
            ? `<div class="pdp-price-b pdp-buy-simple">
                   <div class="buy-row buy-row-pdp">
                       ${top}
                       <div class="stepper flex-shrink-0">
                           <button type="button" data-minus-id="${product.id}" onclick="updateQty(${product.id}, -1)"
                               class="qty-minus-btn step-btn minus ${qty <= 0 ? 'is-disabled' : ''}"
                               ${qty <= 0 ? 'disabled' : ''} aria-label="Decrease quantity">−</button>
                           <span id="qty-${product.id}" class="step-qty font-bold text-brand-blue">${qty}</span>
                           <span id="pdp-simple-qty-${product.id}" class="hidden">${qty}</span>
                           <button type="button" data-plus-id="${product.id}" onclick="updateQty(${product.id}, 1)"
                               class="qty-plus-btn step-btn plus ${qty >= max ? 'is-disabled' : ''}"
                               ${qty >= max ? 'disabled' : ''} aria-label="Increase quantity">+</button>
                       </div>
                   </div>
                   ${save}
                   <div class="price-b-tax">Inclusive of all taxes</div>
               </div>`
            : `<p class="text-brand-coral font-bold text-sm">Out of Stock</p>`;
    }

    const thumbs = pdpMedia.map((m, i) => `
        <button type="button" class="thumb ${i === 0 ? 'is-active' : ''} ${m.type === 'video' ? 'thumb-video' : ''}"
            onclick="setPdpMedia(${i})" aria-label="${m.type === 'video' ? 'Play video' : 'View photo ' + (i + 1)}">
            ${m.type === 'video'
                ? `<img src="${(pdpMedia.find((x) => x.type === 'image') || {}).src || ''}" class="w-full h-full object-cover" alt="">`
                : `<img src="${m.src}" class="w-full h-full object-cover" alt=""
                    onerror="typeof handleProductImgError==='function'?handleProductImgError(this):(this.onerror=null)">`}
        </button>`).join('');

    const descHtml = product.description
        ? `<p class="pdp-desc text-base text-slate-600 mt-4 leading-relaxed">${product.description}</p>`
        : '';
    const includesHtml = includes.length ? `
        <h3 class="pdp-section-title text-base font-bold text-brand-blue mt-4 mb-1.5">Includes</h3>
        <ul class="detail-list pdp-detail-list mb-3">${includes.map((d) => `<li>${d}</li>`).join('')}</ul>
    ` : '';
    const detailsHtml = bullets.length ? `
        <h3 class="pdp-section-title text-base font-bold text-brand-blue mt-4 mb-1.5">Details</h3>
        <ul class="detail-list pdp-detail-list mb-4">${bullets.map((d) => `<li>${d}</li>`).join('')}</ul>
    ` : '';

    document.getElementById('pdp-body').innerHTML = `
        <div class="grid lg:grid-cols-2 gap-4 lg:gap-5 items-start">
            <div class="min-w-0">
                <div id="pdp-stage" class="rounded-xl overflow-hidden bg-slate-100 border border-slate-200 aspect-[4/3]">
                    ${renderPdpMainMedia()}
                </div>
                ${pdpMedia.length > 1 ? `
                    <div id="pdp-thumbs" class="flex gap-2 mt-2.5 overflow-x-auto pb-1">${thumbs}</div>
                    <p class="text-xs text-slate-400 mt-1.5">Tap a photo to enlarge · tap video to play</p>
                ` : ''}
            </div>
            <div class="min-w-0 pdp-info">
                <h2 class="pdp-title text-2xl sm:text-[1.75rem] font-bold text-brand-blue leading-snug">${product.name}</h2>
                <div class="mt-3">${buySection}</div>
                ${descHtml}
                ${includesHtml}
                ${detailsHtml}
                <button type="button" onclick="closeProductDetail()"
                    class="mt-3 w-full py-3 rounded-xl bg-brand-blue text-white font-bold text-base">Continue shopping</button>
            </div>
        </div>`;

    if (typeof bindPdpVideoLoading === 'function') {
        bindPdpVideoLoading(document.getElementById('pdp-stage'));
    }

    const pdp = document.getElementById('pdp');
    const backdrop = document.getElementById('pdp-backdrop');
    pdp.classList.add('is-open');
    backdrop.classList.add('is-open');
    pdp.setAttribute('aria-hidden', 'false');
    pdp.dataset.pid = String(product.id);
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.lock('pdp-open');
    else document.body.classList.add('pdp-open');
    document.querySelector('#pdp .pdp-scroll')?.scrollTo?.(0, 0);
    document.getElementById('pdp')?.scrollTo?.(0, 0);

    if (hasPacks && typeof syncPackCardUI === 'function') syncPackCardUI(product.id);
    if (!hasPacks && typeof syncQtyControls === 'function') syncQtyControls(product.id);
    if (typeof ModalHistory !== 'undefined') ModalHistory.push('pdp');
}

/** Called after cart changes — pack rows already synced in place; refresh simple qty in open PDP. */
function refreshOpenProductDetail(productId) {
    if (pdpOpenId == null || String(pdpOpenId) !== String(productId)) return;
    const pdp = document.getElementById('pdp');
    if (!pdp?.classList.contains('is-open')) return;
    const qtyEl = document.getElementById(`qty-${productId}`);
    if (qtyEl) qtyEl.textContent = String(AppState.cart[productId] || 0);
}

function closeProductDetail(opts = {}) {
    const pdp = document.getElementById('pdp');
    const wasOpen = pdp?.classList.contains('is-open');
    const lb = document.getElementById('lightbox');
    const hadLightbox = lb?.classList.contains('is-open');

    closePdpLightbox({ fromHistory: true });

    const backdrop = document.getElementById('pdp-backdrop');
    if (pdp) {
        pdp.classList.remove('is-open');
        pdp.setAttribute('aria-hidden', 'true');
        delete pdp.dataset.pid;
    }
    if (backdrop) backdrop.classList.remove('is-open');
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.unlock('pdp-open');
    else document.body.classList.remove('pdp-open');
    pdpOpenId = null;
    if (typeof closeAllPackMenus === 'function') closeAllPackMenus();

    if (!wasOpen || opts.fromHistory || typeof ModalHistory === 'undefined') return;
    const layers = [];
    if (hadLightbox) layers.push('lightbox');
    layers.push('pdp');
    ModalHistory.dismissMany(layers);
}

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closePdpLightbox();
    closeProductDetail();
});
