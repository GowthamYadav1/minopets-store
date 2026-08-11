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
 * Parse YouTube / Shorts URLs.
 * Shorts → vertical (9:16) player. watch / youtu.be / embed → landscape unless marked.
 * @returns {{ id: string, vertical: boolean }|null}
 */
function youtubeVideoMeta(url) {
    const s = String(url || '').trim();
    if (!s || !/youtu\.?be|youtube\.com/i.test(s)) return null;

    let id = null;
    let vertical = false;

    let m = s.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/i);
    if (m) {
        id = m[1];
        vertical = true;
    }
    if (!id) {
        m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
        if (m) id = m[1];
    }
    if (!id) {
        m = s.match(/youtube\.com\/(?:embed|live|v)\/([a-zA-Z0-9_-]{6,})/i);
        if (m) id = m[1];
    }
    if (!id) {
        m = s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/i);
        if (m) id = m[1];
    }
    if (!id) return null;

    // Allow Sheet to force vertical: …&vertical=1 or …#vertical
    if (/[?&#]vertical=1\b/i.test(s) || /[?&#]aspect=vertical\b/i.test(s)) {
        vertical = true;
    }
    return { id, vertical };
}

function youtubeEmbedSrc(videoId, { autoplay = false } = {}) {
    const id = String(videoId || '').trim();
    if (!id) return '';
    const params = new URLSearchParams({
        playsinline: '1',
        rel: '0',
        modestbranding: '1'
    });
    if (autoplay) {
        params.set('autoplay', '1');
        // Mobile autoplay policies usually require mute; user can unmute in player
        params.set('mute', '1');
    }
    return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${params.toString()}`;
}

/**
 * Normalize product video_url for the PDP player.
 * Prefer YouTube/Shorts (best on mobile). Drive kept as fallback (phone opens Drive app/site).
 * Direct .mp4 / CDN URLs stay as native <video>.
 * @returns {{ mode: 'iframe'|'video', src: string, provider?: string, youtubeId?: string, vertical?: boolean, driveId?: string, viewUrl?: string }|null}
 */
function normalizeProductVideo(url, { autoplay = false } = {}) {
    const raw = String(url || '').trim();
    if (!raw) return null;

    const yt = youtubeVideoMeta(raw);
    if (yt) {
        return {
            mode: 'iframe',
            provider: 'youtube',
            youtubeId: yt.id,
            vertical: yt.vertical,
            src: youtubeEmbedSrc(yt.id, { autoplay }),
            viewUrl: yt.vertical
                ? `https://www.youtube.com/shorts/${yt.id}`
                : `https://www.youtube.com/watch?v=${yt.id}`
        };
    }

    const driveId = googleDriveFileId(raw);
    if (driveId) {
        const preview = `https://drive.google.com/file/d/${driveId}/preview`;
        return {
            mode: 'iframe',
            provider: 'drive',
            src: autoplay ? `${preview}?autoplay=1` : preview,
            driveId,
            viewUrl: `https://drive.google.com/file/d/${driveId}/view`
        };
    }
    return { mode: 'video', provider: 'file', src: raw };
}

function escapeHtmlAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** YouTube / Shorts lightbox — vertical frame for Shorts. */
function renderYoutubeLightboxHtml(media, { autoplay = true } = {}) {
    const id = media?.youtubeId || '';
    if (!id) return '';
    const vertical = !!media.vertical;
    const src = youtubeEmbedSrc(id, { autoplay });
    const viewUrl = media.viewUrl
        || (vertical ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`);
    return `<div class="pdp-video-lightbox${vertical ? ' is-vertical' : ''}">
        <div class="pdp-video-wrap is-youtube${vertical ? ' is-vertical' : ''} is-lightbox" data-video-loading="1" data-video-url="${escapeHtmlAttr(viewUrl)}">
            <div class="pdp-video-loading" aria-live="polite">
                <span class="pdp-video-spinner" aria-hidden="true"></span>
                <span class="pdp-video-loading-text">Loading video…</span>
            </div>
            <iframe
                class="pdp-video"
                src="${escapeHtmlAttr(src)}"
                title="Product video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                loading="eager"
                referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>
    </div>`;
}

/**
 * Dedicated Drive lightbox player — full 16:9 frame + fallback link.
 * Do not use lh3 / native <video> for Drive (broken on iOS/Android WebViews).
 */
function renderDriveLightboxHtml(driveId, { autoplay = true } = {}) {
    const id = String(driveId || '').trim();
    if (!id) return '';
    const preview = `https://drive.google.com/file/d/${id}/preview${autoplay ? '?autoplay=1' : ''}`;
    const viewUrl = `https://drive.google.com/file/d/${id}/view`;
    return `<div class="pdp-video-lightbox">
        <div class="pdp-video-wrap is-drive is-lightbox" data-video-loading="1" data-video-url="${escapeHtmlAttr(viewUrl)}">
            <div class="pdp-video-loading" aria-live="polite">
                <span class="pdp-video-spinner" aria-hidden="true"></span>
                <span class="pdp-video-loading-text">Loading video…</span>
            </div>
            <iframe
                class="pdp-video"
                src="${escapeHtmlAttr(preview)}"
                title="Product video"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowfullscreen
                loading="eager"
                referrerpolicy="no-referrer-when-downgrade"></iframe>
            <div class="pdp-video-popout-mask" aria-hidden="true"></div>
        </div>
        <a class="pdp-video-fallback" href="${escapeHtmlAttr(viewUrl)}" target="_blank" rel="noopener noreferrer"
            onclick="event.stopPropagation()">Open in Google Drive</a>
    </div>`;
}

/** Markup for PDP / lightbox video (YouTube, Drive, or native video). */
function renderProductVideoHtml(url, className = '', { autoplay = false, lightbox = false } = {}) {
    const media = typeof normalizeProductVideo === 'function'
        ? normalizeProductVideo(url, { autoplay })
        : null;
    if (!media) return '';

    if (media.provider === 'youtube' && media.youtubeId) {
        return renderYoutubeLightboxHtml(media, { autoplay: true });
    }

    // Lightbox + Drive → dedicated full-frame player
    if (lightbox && media.driveId) {
        return renderDriveLightboxHtml(media.driveId, { autoplay: true });
    }

    const cls = className ? ` class="${escapeHtmlAttr(className)}"` : '';
    let src = media.src;
    if (media.mode === 'iframe' && autoplay && !/[?&]autoplay=/.test(src)) {
        src += (src.includes('?') ? '&' : '?') + 'autoplay=1';
    }
    const srcAttr = escapeHtmlAttr(src);
    const isDrive = media.provider === 'drive';
    const originalUrlAttr = ` data-video-url="${escapeHtmlAttr(url)}"`;
    const player = media.mode === 'iframe'
        ? `<iframe src="${srcAttr}"${cls} title="Product video" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="eager"></iframe>`
        : `<video src="${srcAttr}"${cls} controls playsinline webkit-playsinline preload="${autoplay ? 'auto' : 'metadata'}"${autoplay ? ' autoplay' : ''}></video>`;
    const popoutMask = isDrive
        ? '<div class="pdp-video-popout-mask" aria-hidden="true"></div>'
        : '';
    return `<div class="pdp-video-wrap${isDrive ? ' is-drive' : ''}" data-video-loading="1"${originalUrlAttr}>
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
            setTimeout(finish, 1800);
        } else if (player) {
            if (player.readyState >= 2) finish();
            else {
                player.addEventListener('loadeddata', finish, { once: true });
                player.addEventListener('canplay', finish, { once: true });
                player.addEventListener('error', finish, { once: true });
            }
            setTimeout(finish, 8000);
        } else {
            finish();
        }
    });
}

/**
 * Start playback for native <video> only (CDN/mp4).
 * YouTube / Drive use iframe — no play() call.
 */
function tryStartPdpVideo(root = document) {
    const wrap = root.querySelector?.('.pdp-video-wrap') || null;
    if (wrap?.classList.contains('is-drive') || wrap?.classList.contains('is-youtube')) return;
    const video = (wrap || root).querySelector?.('video.pdp-video, video');
    if (!video) return;

    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => {
            video.addEventListener('canplay', () => {
                video.play()?.catch?.(() => {});
            }, { once: true });
        });
    }
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
