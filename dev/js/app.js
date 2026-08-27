const MY_WHATSAPP_NUMBER = '919035559089';
const STORE_BASE = '/dev';

const AppState = {
    cart: {},
    selectedPack: {},
    route: { view: 'home', category: null, subcategory: null },
    search: '',
    facetFilters: {},
    priceRange: { min: null, max: null },
    currentSlide: 0,
    sliderInterval: null,
    sliderPaused: false,
    stock: null,
    stockLoadedAt: 0,
    catalogLoadedAt: 0,
    catalogSource: 'fallback',
    /** Public storefront settings from Sheets Config (via getCatalog). */
    storeConfig: {}
};

function isHomePath(path) {
    if (!path || path === 'home' || path === '.') return true;
    let clean = String(path).replace(/^#+/, '');
    if (clean.startsWith(STORE_BASE)) clean = clean.slice(STORE_BASE.length);
    clean = clean.replace(/^\/+|\/+$/g, '');
    return !clean;
}

function normalizeRoutePath(path) {
    if (isHomePath(path)) return '';
    let clean = String(path).replace(/^#+/, '');
    if (clean.startsWith(STORE_BASE)) clean = clean.slice(STORE_BASE.length);
    return clean.replace(/^\/+|\/+$/g, '');
}

function pathToUrl(routePath) {
    if (!routePath) return STORE_BASE;
    return `${STORE_BASE}/${routePath}`;
}

function getRoutePathFromLocation() {
    let path = location.pathname;
    if (path.startsWith(STORE_BASE)) path = path.slice(STORE_BASE.length);
    return path.replace(/^\/+|\/+$/g, '');
}

function parseRoute() {
    const raw = getRoutePathFromLocation();
    if (!raw) return { view: 'home', category: null, subcategory: null };
    if (raw === 'deals') return { view: 'category', category: '__deals__', subcategory: null };

    const parts = raw.split('/');
    const category = slugToCategory[parts[0]] || null;
    if (!category) return { view: 'home', category: null, subcategory: null };

    const subcategory = parts[1] ? slugToSubcategory(category, parts[1]) : null;
    return { view: 'category', category, subcategory };
}

function migrateLegacyHash() {
    const hashRaw = location.hash.slice(1).replace(/^\/+|\/+$/g, '');
    if (!hashRaw) return false;
    history.replaceState(null, '', pathToUrl(hashRaw));
    return true;
}

/** GitHub Pages: 404.html stashes the deep link, then sends us to /dev/. Restore it. */
function restoreSpaRedirect() {
    try {
        const path = sessionStorage.getItem('mino_spa_redirect');
        if (!path) return false;
        sessionStorage.removeItem('mino_spa_redirect');
        const cur = location.pathname + location.search + location.hash;
        if (path !== cur) {
            history.replaceState(null, '', path);
            return true;
        }
    } catch (_) {
        /* ignore */
    }
    return false;
}

restoreSpaRedirect();

function navigateTo(path) {
    if (typeof ModalHistory !== 'undefined') ModalHistory.closeAllSilent();
    AppState.search = '';
    ['search-input', 'search-input-mobile'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    if (typeof closeMobileSearch === 'function') closeMobileSearch();

    const routePath = normalizeRoutePath(path);
    const url = pathToUrl(routePath);
    const currentPath = location.pathname.replace(/\/$/, '') || STORE_BASE;
    const targetPath = url.replace(/\/$/, '') || STORE_BASE;

    if (currentPath !== targetPath) {
        history.pushState(null, '', url);
    }
    handleRouteChange();
}

function handleRouteChange() {
    if (AppState.search) {
        AppState.route = { view: 'search', category: null, subcategory: null };
    } else {
        AppState.route = parseRoute();
    }
    resetFacetFiltersForCategory();
    renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetFacetFiltersForCategory() {
    const key = AppState.route.category || '';
    if (AppState._filterCategory !== key) {
        AppState.facetFilters = {};
        AppState.priceRange = { min: null, max: null };
        AppState._filterCategory = key;
    }
}

function renderCurrentView() {
    const { view } = AppState.route;
    const heroSection = document.getElementById('hero-section');
    const homeView = document.getElementById('view-home');
    const categoryView = document.getElementById('view-category');
    const searchView = document.getElementById('view-search');

    const isHome = view === 'home';
    const isCategory = view === 'category';
    const isSearch = view === 'search';

    heroSection?.classList.toggle('hidden', !isHome);
    homeView?.classList.toggle('hidden', !isHome);
    categoryView?.classList.toggle('hidden', !isCategory);
    searchView?.classList.toggle('hidden', !isSearch);

    if (isHome) {
        renderHomepage();
        manageHeroVideo(AppState.currentSlide);
    } else {
        pauseHeroVideo();
    }

    if (isCategory) renderCategoryPage();
    if (isSearch) renderSearchPage();
}

function bindSearchInput(el) {
    if (!el || el.dataset.searchBound) return;
    el.dataset.searchBound = '1';
    el.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        AppState.search = q;
        const otherId = el.id === 'search-input' ? 'search-input-mobile' : 'search-input';
        const other = document.getElementById(otherId);
        if (other && other.value !== e.target.value) other.value = e.target.value;
        if (q) {
            AppState.route = { view: 'search', category: null, subcategory: null };
            renderCurrentView();
        } else {
            handleRouteChange();
        }
    });
}

function openMobileSearch() {
    const panel = document.getElementById('mobile-search-panel');
    const toggle = document.getElementById('mobile-search-toggle');
    if (!panel) return;
    if (typeof closeProductDetail === 'function') closeProductDetail();
    panel.hidden = false;
    panel.classList.add('is-open');
    toggle?.classList.add('is-active');
    toggle?.setAttribute('aria-expanded', 'true');
    syncMobileNavHeaderOffset?.();
    const input = document.getElementById('search-input-mobile');
    const desktop = document.getElementById('search-input');
    if (input && desktop && !input.value && desktop.value) input.value = desktop.value;
    setTimeout(() => input?.focus(), 30);
}

function closeMobileSearch() {
    const panel = document.getElementById('mobile-search-panel');
    const toggle = document.getElementById('mobile-search-toggle');
    panel?.classList.remove('is-open');
    if (panel) panel.hidden = true;
    toggle?.classList.remove('is-active');
    toggle?.setAttribute('aria-expanded', 'false');
    syncMobileNavHeaderOffset?.();
}

function toggleMobileSearch() {
    const panel = document.getElementById('mobile-search-panel');
    if (panel?.classList.contains('is-open')) closeMobileSearch();
    else openMobileSearch();
}

let storeLoaderDone = false;

/** Hide the boot loader once listings can show real availability. */
function hideStoreLoader() {
    if (storeLoaderDone) return;
    storeLoaderDone = true;
    const el = document.getElementById('store-loader');
    if (!el) return;
    el.classList.add('is-hidden');
    setTimeout(() => el.remove(), 400);
}

/** True when listings already know their availability, so no loader is needed. */
function storeStockReady() {
    const stockApi = typeof isStockApiConfigured === 'function' ? isStockApiConfigured() : false;
    if (!stockApi) return true;
    return !!(AppState.stock && AppState.stockLoadedAt);
}

async function bootStore() {
    if (typeof categories !== 'undefined') buildCategoryNav();
    initHeroSlider();
    initScrollTop();

    if (typeof initAuth === 'function') initAuth();

    bindSearchInput(document.getElementById('search-input'));
    bindSearchInput(document.getElementById('search-input-mobile'));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMobileSearch();
    });

    window.addEventListener('popstate', () => {
        if (typeof ModalHistory !== 'undefined' && ModalHistory.handlePopState()) {
            return;
        }
        AppState.search = '';
        ['search-input', 'search-input-mobile'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        closeMobileSearch();
        handleRouteChange();
    });

    migrateLegacyHash();
    // Instant paint from local cache when available. Avoid flashing stale products.js
    // while waiting on Apps Script (cold start is often 2–3s).
    const hadCache = typeof hydrateCatalogFromCache === 'function' && hydrateCatalogFromCache();
    if (typeof hydrateStockFromCache === 'function') hydrateStockFromCache();

    if (!hadCache && typeof isCatalogApiConfigured === 'function' && isCatalogApiConfigured()) {
        if (typeof replaceProductsList === 'function') replaceProductsList([]);
        AppState.catalogSource = 'pending';
    }

    handleRouteChange();

    // Repeat visits paint from cache with known stock — no need to stall behind the loader.
    if (hadCache && storeStockReady()) hideStoreLoader();
    const loaderSafety = setTimeout(hideStoreLoader, 8000);

    const afterRemote = () => {
        renderCurrentView();
        if (typeof updateCartUI === 'function') updateCartUI(false);
        clearTimeout(loaderSafety);
        hideStoreLoader();
    };

    const catalogPromise = (typeof loadCatalog === 'function')
        ? loadCatalog(true).then((ok) => {
            if (!ok) {
                console.warn('[catalog] using products.js fallback until getCatalog works. Check: Apps Script redeploy + console Network getCatalog.');
            }
            return ok;
        })
        : Promise.resolve(false);

    catalogPromise.then((catalogOk) => {
        const firebaseStock = typeof minoFunctionsEnabled === 'function' && minoFunctionsEnabled();
        // Firebase is the live stock source. Sheets stock is used only by the
        // legacy non-Firebase flow.
        if (typeof loadStock === 'function' && (firebaseStock || !catalogOk)) {
            return loadStock(firebaseStock).then((ok) => {
                if (!ok) {
                    console.warn('[stock] live refresh failed; keeping the last known stock.');
                }
                afterRemote();
            });
        }
        afterRemote();
    }).catch((err) => {
        console.error('[boot] catalog/stock load failed', err);
        afterRemote();
    });
}

function initScrollTop() {
    const btn = document.getElementById('scroll-top');
    if (!btn) return;
    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootStore);
} else {
    bootStore();
}
