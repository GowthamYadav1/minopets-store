/**
 * SKU image convention (flat files under /assets/products/):
 *   {SKU}-01.jpg|.png  → main card image (default)
 *   {SKU}-02.jpg|.png  → hover swap / gallery (optional)
 *   {SKU}-03.jpg|.png … → extra PDP gallery images (optional)
 *
 * Example: sku MINO-FISH-NET → /assets/products/MINO-FISH-NET-01.png
 */

const PRODUCT_IMAGE_BASE = '/assets/products';
const PRODUCT_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
/** Max -01…-NN slots to probe for the PDP gallery. */
const PRODUCT_GALLERY_MAX = 12;

function productImageUrl(sku, index = 1, ext = 'jpg') {
    if (!sku) return null;
    const n = String(index).padStart(2, '0');
    const e = String(ext || 'jpg').replace(/^\./, '').toLowerCase();
    return `${PRODUCT_IMAGE_BASE}/${String(sku).trim()}-${n}.${e}`;
}

function extensionFromPath(path) {
    const m = String(path || '').match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : null;
}

function preferredImageExt(product) {
    const fromImage = extensionFromPath(product?.image);
    if (fromImage && PRODUCT_IMAGE_EXTS.includes(fromImage === 'jpeg' ? 'jpg' : fromImage)) {
        return fromImage === 'jpeg' ? 'jpg' : fromImage;
    }
    return 'jpg';
}

/** Main image: prefer Sheet image if it matches sku; else {sku}-01.jpg (png tried via onerror). */
function productMainImage(product) {
    if (!product) return '';
    if (product.sku) {
        if (product.image && String(product.image).includes(String(product.sku).trim())) {
            return product.image;
        }
        return productImageUrl(product.sku, 1, preferredImageExt(product)) || product.image || '';
    }
    return product.image || '';
}

/**
 * Card hover candidates: [-01, -02]. Missing -02 is fine — hover probes before swap.
 * For the PDP gallery (only existing files, including -03+), use resolveProductGalleryUrls.
 */
function productGalleryUrls(product) {
    if (!product?.sku) {
        return product?.image ? [product.image] : [];
    }
    const ext = preferredImageExt(product);
    return [
        productImageUrl(product.sku, 1, ext),
        productImageUrl(product.sku, 2, ext),
    ];
}

/**
 * Resolve gallery images that actually exist: -01, -02, -03… until the first gap.
 * Avoids broken -02 thumbs when only -01 is present, and includes -03+.
 */
async function resolveProductGalleryUrls(product) {
    if (!product) return [];
    if (!product.sku) {
        return product.image ? [product.image] : [];
    }

    const ext = preferredImageExt(product);
    const found = [];

    for (let i = 1; i <= PRODUCT_GALLERY_MAX; i++) {
        const candidates = [];
        if (i === 1 && product.image && String(product.image).includes(String(product.sku).trim())) {
            candidates.push(product.image);
        }
        candidates.push(productImageUrl(product.sku, i, ext));
        for (const e of PRODUCT_IMAGE_EXTS) {
            if (e !== ext) candidates.push(productImageUrl(product.sku, i, e));
        }
        const ok = await resolveFirstExisting(candidates);
        if (!ok) break;
        if (!found.includes(ok)) found.push(ok);
    }

    if (!found.length && product.image) found.push(product.image);
    return found;
}

/**
 * img onerror: try other extensions for the same SKU slot, then data-fallback.
 * Usage: data-sku="MINO-FISH-NET" data-img-index="1"
 */
function handleProductImgError(img) {
    if (!img) return;
    const sku = img.dataset.sku;
    const index = Number(img.dataset.imgIndex || 1) || 1;
    const tried = new Set((img.dataset.extTried || '').split(',').filter(Boolean));

    if (sku) {
        const currentExt = extensionFromPath(img.getAttribute('src') || '');
        if (currentExt) tried.add(currentExt === 'jpeg' ? 'jpg' : currentExt);

        for (const ext of PRODUCT_IMAGE_EXTS) {
            if (tried.has(ext)) continue;
            tried.add(ext);
            img.dataset.extTried = [...tried].join(',');
            img.src = productImageUrl(sku, index, ext);
            return;
        }
    }

    img.onerror = null;
    if (img.dataset.fallback) img.src = img.dataset.fallback;
    img.classList.add('loaded');
}

function preloadImage(url) {
    return new Promise((resolve) => {
        if (!url) {
            resolve(null);
            return;
        }
        const img = new Image();
        img.onload = () => resolve(url);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

/** Extract Google Drive file id from common share / open / uc URLs. */
function googleDriveFileId(url) {
    const s = String(url || '').trim();
    if (!s) return null;
    let m = s.match(/\/(?:file|document)\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return null;
}

/**
 * Normalize product video_url for the PDP player.
 * Drive /view links are not valid <video src> — use Drive preview iframe by default.
 * When autoplay is requested, prefer a native <video> (so thumb-tap can call play()).
 * Direct .mp4 / CDN URLs stay as native <video>.
 * @returns {{ mode: 'iframe'|'video', src: string, drivePreview?: string }|null}
 */
function normalizeProductVideo(url, { autoplay = false } = {}) {
    const raw = String(url || '').trim();
    if (!raw) return null;
    const driveId = googleDriveFileId(raw);
    if (driveId) {
        const preview = `https://drive.google.com/file/d/${driveId}/preview`;
        if (autoplay) {
            // Native <video> so thumb-tap can call play() in the same gesture.
            // lh3 often streams public Drive files; falls back to iframe on error.
            return {
                mode: 'video',
                src: `https://lh3.googleusercontent.com/d/${driveId}`,
                drivePreview: `${preview}?autoplay=1`,
            };
        }
        return { mode: 'iframe', src: preview };
    }
    return { mode: 'video', src: raw };
}

function escapeHtmlAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Markup for PDP / lightbox video (Drive embed or native video). */
function renderProductVideoHtml(url, className = '', { autoplay = false } = {}) {
    const media = typeof normalizeProductVideo === 'function'
        ? normalizeProductVideo(url, { autoplay })
        : null;
    if (!media) return '';
    const cls = className ? ` class="${escapeHtmlAttr(className)}"` : '';
    let src = media.src;
    if (media.mode === 'iframe' && autoplay && !/[?&]autoplay=/.test(src)) {
        src += (src.includes('?') ? '&' : '?') + 'autoplay=1';
    }
    const srcAttr = escapeHtmlAttr(src);
    const isDrive = media.mode === 'iframe';
    const drivePreviewAttr = media.drivePreview
        ? ` data-drive-preview="${escapeHtmlAttr(media.drivePreview)}"`
        : '';
    const originalUrlAttr = ` data-video-url="${escapeHtmlAttr(url)}"`;
    const player = isDrive
        ? `<iframe src="${srcAttr}"${cls} title="Product video" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>`
        : `<video src="${srcAttr}"${cls} controls playsinline preload="${autoplay ? 'auto' : 'metadata'}"${autoplay ? ' autoplay' : ''}></video>`;
    // Drive's pop-out control can't be disabled; cover it so it doesn't open Drive in a new tab.
    const popoutMask = isDrive
        ? '<div class="pdp-video-popout-mask" aria-hidden="true"></div>'
        : '';
    return `<div class="pdp-video-wrap${isDrive ? ' is-drive' : ''}" data-video-loading="1"${drivePreviewAttr}${originalUrlAttr}>
        <div class="pdp-video-loading" aria-live="polite">
            <span class="pdp-video-spinner" aria-hidden="true"></span>
            <span class="pdp-video-loading-text">Loading video…</span>
        </div>
        ${player}
        ${popoutMask}
    </div>`;
}

/** Hide loading overlay once iframe/video is ready (or after timeout). */
function bindPdpVideoLoading(root = document) {
    root.querySelectorAll('.pdp-video-wrap[data-video-loading="1"]').forEach((wrap) => {
        if (wrap.dataset.bound === '1') return;
        wrap.dataset.bound = '1';
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            wrap.classList.add('is-ready');
            wrap.dataset.videoLoading = '0';
        };
        const player = wrap.querySelector('iframe, video');
        if (player?.tagName === 'IFRAME') {
            player.addEventListener('load', finish, { once: true });
        } else if (player) {
            if (player.readyState >= 2) finish();
            else {
                player.addEventListener('loadeddata', finish, { once: true });
                player.addEventListener('error', finish, { once: true });
            }
        } else {
            finish();
            return;
        }
        setTimeout(finish, 12000);
    });
}

/**
 * Start playback after a video thumb tap (user gesture).
 * Call play() immediately in the tap turn — waiting for loadeddata drops the gesture.
 * If a Drive stream URL fails, swap to the Drive preview iframe.
 */
function tryStartPdpVideo(root = document) {
    const wrap = root.querySelector?.('.pdp-video-wrap') || null;
    const video = (wrap || root).querySelector?.('video.pdp-video, video');
    if (!video) return;

    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => {
            const retry = () => {
                video.play()?.catch?.(() => {});
            };
            video.addEventListener('canplay', retry, { once: true });
        });
    }

    const preview = wrap?.dataset?.drivePreview;
    if (!preview || !wrap) return;
    video.addEventListener('error', () => {
        const cls = video.className || 'pdp-video';
        wrap.classList.add('is-drive');
        wrap.dataset.videoLoading = '1';
        wrap.dataset.bound = '0';
        wrap.innerHTML = `
            <div class="pdp-video-loading" aria-live="polite">
                <span class="pdp-video-spinner" aria-hidden="true"></span>
                <span class="pdp-video-loading-text">Loading video…</span>
            </div>
            <iframe src="${escapeHtmlAttr(preview)}" class="${escapeHtmlAttr(cls)}" title="Product video" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
            <div class="pdp-video-popout-mask" aria-hidden="true"></div>`;
        if (typeof bindPdpVideoLoading === 'function') bindPdpVideoLoading(wrap.parentElement || document);
    }, { once: true });
}

async function resolveFirstExisting(urls) {
    for (const url of urls) {
        const ok = await preloadImage(url);
        if (ok) return ok;
    }
    return null;
}

/**
 * Desktop hover: swap -01 → -02 on the whole card (tries jpg/png/webp).
 * Mobile (no hover): stays on -01.
 */
function bindProductImageHover(root = document) {
    const canHover = typeof window.matchMedia === 'function'
        && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!canHover) return;

    root.querySelectorAll('img[data-product-gallery]').forEach((img) => {
        if (img.dataset.galleryBound === '1') return;
        img.dataset.galleryBound = '1';

        let candidates = [];
        try {
            candidates = JSON.parse(img.getAttribute('data-product-gallery') || '[]');
        } catch {
            candidates = [];
        }
        if (!Array.isArray(candidates) || candidates.length < 2) return;

        const card = img.closest('.group') || img;
        const sku = img.dataset.sku || '';
        const mainSrc = candidates[0] || img.src;
        let hoverReady = null;
        let hovering = false;

        const showMain = () => {
            hovering = false;
            if (img.getAttribute('src') !== mainSrc) img.src = mainSrc;
        };

        card.addEventListener('mouseenter', async () => {
            hovering = true;
            if (hoverReady === null) {
                const hoverUrls = [candidates[1]];
                if (sku) {
                    for (const ext of PRODUCT_IMAGE_EXTS) {
                        hoverUrls.push(productImageUrl(sku, 2, ext));
                    }
                }
                hoverReady = await resolveFirstExisting(hoverUrls);
            }
            if (!hovering || !hoverReady) return;
            img.src = hoverReady;
            img.classList.add('loaded');
        });

        card.addEventListener('mouseleave', showMain);
    });
}
