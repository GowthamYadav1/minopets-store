/**
 * Desktop category dropdowns + mobile hamburger drawer (Chewy-style).
 */

const MOBILE_NAV_CHEVRON = `<svg class="mobile-nav-item-chevron" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>`;

/** Side-nav icons cropped from assets/SideNav/SideNavIcons.png */
const MOBILE_NAV_ICONS = {
    Home: '/assets/SideNav/nav-home.png',
    Fish: '/assets/SideNav/nav-fish.png',
    Shrimps: '/assets/SideNav/nav-shrimps.png',
    Plants: '/assets/SideNav/nav-plants.png',
    Accessories: '/assets/SideNav/nav-acc-hero.png',
    Aquarium: '/assets/SideNav/nav-aquarium.png',
    Deals: '/assets/SideNav/nav-deals.png'
};

function mobileNavIconHtml(label, extraClass = '') {
    const src = MOBILE_NAV_ICONS[label];
    if (!src) return '';
    const cls = ['mobile-nav-item-icon', extraClass].filter(Boolean).join(' ');
    return `<img class="${cls}" src="${src}" alt="" width="40" height="40" decoding="async" draggable="false">`;
}

function mobileNavLabelHtml(label) {
    return `<span class="mobile-nav-item-main">${mobileNavIconHtml(label)}<span class="mobile-nav-item-text">${label}</span></span>`;
}

const MOBILE_NAV_SVG = {
    grid: `<svg class="mobile-nav-card-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>`,
    gift: `<svg class="mobile-nav-card-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8v13M5 12h14v9H5v-9zM4 8h16v4H4V8z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 8c-1.6-2.6-4.2-3-5.2-1.6S6.4 9.4 12 8c1.6-2.6 4.2-3 5.2-1.6S17.6 9.4 12 8z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
    chevron: `<svg class="mobile-nav-card-chevron" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>`
};

/** Shared across categories (All / Combo rows) — from accessories sheet, renamed generic */
const MOBILE_NAV_SHARED_ICONS = {
    all: '/assets/SideNav/nav-icon-all.png',
    combo: '/assets/SideNav/nav-icon-combo.png'
};

/**
 * Categories with illustrated sheet icons.
 * `hero` + per-sub paths; All/Combo use MOBILE_NAV_SHARED_ICONS.
 */
const MOBILE_NAV_CAT_SHEETS = {
    Fish: {
        hero: '/assets/SideNav/nav-fish.png',
        subs: {
            'Barbs & Minnows': '/assets/SideNav/nav-fish-barbs.png',
            'Betta & Gourami': '/assets/SideNav/nav-fish-betta.png',
            'Bottom Feeders': '/assets/SideNav/nav-fish-bottom.png',
            Flowerhorn: '/assets/SideNav/nav-fish-flowerhorn.png',
            Guppy: '/assets/SideNav/nav-fish-guppy.png',
            'Tetras & Rasboras': '/assets/SideNav/nav-fish-tetras.png'
        }
    },
    Plants: {
        hero: '/assets/SideNav/nav-plants.png',
        subs: {
            'Carpet Plants': '/assets/SideNav/nav-plant-carpet.png',
            'Floating Plants': '/assets/SideNav/nav-plant-floating.png',
            'Hardscape Plants': '/assets/SideNav/nav-plant-hardscape.png',
            'Moss & Ferns': '/assets/SideNav/nav-plant-moss.png',
            'Stem Plants': '/assets/SideNav/nav-plant-stem.png',
            'Tissue Culture': '/assets/SideNav/nav-plant-tissue.png'
        }
    },
    Accessories: {
        hero: '/assets/SideNav/nav-acc-hero.png',
        subs: {
            'Aquascape Tools': '/assets/SideNav/nav-acc-tools.png',
            'Filter Media': '/assets/SideNav/nav-acc-media.png',
            'Filters & Pumps': '/assets/SideNav/nav-acc-pump.png',
            Lighting: '/assets/SideNav/nav-acc-light.png',
            'Substrate & Soil': '/assets/SideNav/nav-acc-soil.png'
        }
    },
    Shrimps: {
        hero: '/assets/SideNav/nav-shrimps.png',
        subs: {
            Neocaridina: '/assets/SideNav/nav-shrimp.png'
        }
    },
    Aquarium: {
        hero: '/assets/SideNav/nav-aquarium.png',
        subs: {
            'Imported Aquarium': '/assets/SideNav/nav-aqm-imported.png',
            'Ultra Clear Glass Aquarium': '/assets/SideNav/nav-aqm-ultraclear.png',
            'Wall Hanging': '/assets/SideNav/nav-aqm-wall.png'
        }
    }
};

const MOBILE_NAV_CAT_BLURBS = {
    Fish: 'Explore healthy freshwater fish — from tetras & guppies to flowerhorn.',
    Shrimps: 'Explore our wide range of healthy & vibrant shrimp varieties.',
    Plants: 'Carpet plants, stems, moss, tissue culture & aquascape greens.',
    Accessories: 'Everything you need for a better aquarium experience.',
    Aquarium: 'Wall hanging, ultra-clear glass & imported aquarium sets.'
};

function mobileNavSheetIconHtml(src, extraClass = '') {
    const cls = ['mobile-nav-item-icon', extraClass].filter(Boolean).join(' ');
    return `<img class="${cls}" src="${src}" alt="" width="40" height="40" decoding="async" draggable="false">`;
}

function mobileNavSheetLeadingHtml(src) {
    return `<span class="mobile-nav-card-glyph mobile-nav-card-glyph--sheet">${mobileNavSheetIconHtml(src)}</span>`;
}

function mobileNavSubLeadingHtml(cat, sub) {
    const sheetSub = MOBILE_NAV_CAT_SHEETS[cat]?.subs?.[sub];
    if (sheetSub) return mobileNavSheetLeadingHtml(sheetSub);
    return `<span class="mobile-nav-card-glyph mobile-nav-card-glyph--photo">${mobileNavIconHtml(cat)}</span>`;
}

function mobileNavCardHtml({ label, onclick, kind = 'default', leading, badge }) {
    const combo = kind === 'combo';
    const showBadge = badge === true || (combo && badge !== false);
    return `
        <button type="button" class="mobile-nav-card${combo ? ' mobile-nav-card--combo' : ''}" onclick="${onclick}">
            <span class="mobile-nav-card-leading">
                ${leading}
                ${showBadge ? '<span class="mobile-nav-combo-badge">COMBO</span>' : ''}
            </span>
            <span class="mobile-nav-card-label">${label}</span>
            ${MOBILE_NAV_SVG.chevron}
        </button>`;
}

let mobileNavPanel = 'root'; // 'root' | category name
let mobileNavOpen = false;

function buildCategoryNav() {
    const nav = document.getElementById('category-nav');
    if (!nav) return;

    nav.innerHTML = Object.entries(categories).map(([cat]) => {
        const slug = categoryMeta[cat].slug;
        const subs = orderedSubcategories(cat);
        const comboSubs = subs.filter(isComboSubcategory);
        const regularSubs = subs.filter(name => !isComboSubcategory(name));

        const comboBlock = comboSubs.length ? `
                    <p class="px-4 pt-2 pb-1 text-[10px] uppercase tracking-widest text-brand-coral font-bold">Combo Packs</p>
                    ${comboSubs.map(sub => `
                        <button onclick="navigateTo('${slug}/${subcategoryToSlug(sub)}')" class="nav-combo-item block w-full text-left px-4 py-2.5 text-sm font-semibold text-brand-coral hover:bg-orange-50 transition-colors">
                            <span class="inline-flex items-center gap-2">
                                <span class="combo-pill">COMBO</span>
                                ${sub}
                            </span>
                        </button>
                    `).join('')}
                    <hr class="border-orange-100 my-1">
                ` : '';

        return `
            <li class="nav-dropdown relative">
                <button class="flex items-center gap-1 px-4 py-3 hover:bg-brand-blue-dark transition-colors">
                    ${cat}
                    <svg class="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
                </button>
                <div class="nav-dropdown-menu hidden absolute top-full left-0 bg-white text-gray-800 shadow-xl rounded-b-lg min-w-[220px] py-1 z-50 border border-gray-100">
                    <button onclick="navigateTo('${slug}')" class="block w-full text-left px-4 py-2 text-sm font-semibold text-brand-blue hover:bg-gray-50">All ${cat}</button>
                    <hr class="border-gray-100 my-1">
                    ${comboBlock}
                    ${regularSubs.map(sub => `
                        <button onclick="navigateTo('${slug}/${subcategoryToSlug(sub)}')" class="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 hover:text-brand-coral transition-colors">${sub}</button>
                    `).join('')}
                </div>
            </li>
        `;
    }).join('') + `
        <li><button onclick="navigateTo('deals')" class="px-4 py-3 hover:bg-brand-blue-dark transition-colors text-brand-coral font-semibold">Deals</button></li>
    `;

    renderMobileNavBody();
}

function renderMobileNavBody() {
    const body = document.getElementById('mobile-nav-body');
    if (!body) return;

    if (mobileNavPanel === 'root') {
        const catRows = Object.keys(categories).map((cat) => `
            <button type="button" class="mobile-nav-item" onclick="openMobileNavCategory('${cat.replace(/'/g, "\\'")}')">
                ${mobileNavLabelHtml(cat)}
                ${MOBILE_NAV_CHEVRON}
            </button>
        `).join('');
        body.innerHTML = `
            <button type="button" class="mobile-nav-item" onclick="mobileNavGo('home')">
                ${mobileNavLabelHtml('Home')}
                ${MOBILE_NAV_CHEVRON}
            </button>
            ${catRows}
            <button type="button" class="mobile-nav-item mobile-nav-item--accent" onclick="mobileNavGo('deals')">
                ${mobileNavLabelHtml('Deals')}
                ${MOBILE_NAV_CHEVRON}
            </button>
        `;
        return;
    }

    const cat = mobileNavPanel;
    const slug = categoryMeta[cat]?.slug;
    const subs = orderedSubcategories(cat);
    const comboSubs = subs.filter(isComboSubcategory);
    const regularSubs = subs.filter((name) => !isComboSubcategory(name));
    const blurb = MOBILE_NAV_CAT_BLURBS[cat]
        || categoryMeta[cat]?.description
        || `Browse ${cat.toLowerCase()} for your aquarium.`;
    const sheet = MOBILE_NAV_CAT_SHEETS[cat];
    const useSheet = Boolean(sheet);
    const heroIcon = useSheet
        ? mobileNavSheetIconHtml(sheet.hero, 'mobile-nav-hero-icon')
        : mobileNavIconHtml(cat, 'mobile-nav-hero-icon');
    const heroWrapClass = useSheet
        ? 'mobile-nav-cat-hero-icon-wrap mobile-nav-cat-hero-icon-wrap--sheet'
        : 'mobile-nav-cat-hero-icon-wrap';

    const allCard = mobileNavCardHtml({
        label: `All ${cat}`,
        onclick: `mobileNavGo('${slug}')`,
        leading: useSheet
            ? mobileNavSheetLeadingHtml(MOBILE_NAV_SHARED_ICONS.all)
            : `<span class="mobile-nav-card-glyph">${MOBILE_NAV_SVG.grid}</span>`
    });

    const comboCards = comboSubs.map((sub) => mobileNavCardHtml({
        label: sub,
        onclick: `mobileNavGo('${slug}/${subcategoryToSlug(sub)}')`,
        kind: 'combo',
        badge: useSheet ? false : true,
        leading: useSheet
            ? mobileNavSheetLeadingHtml(MOBILE_NAV_SHARED_ICONS.combo)
            : `<span class="mobile-nav-card-glyph mobile-nav-card-glyph--combo">${MOBILE_NAV_SVG.gift}</span>`
    })).join('');

    const regCards = regularSubs.map((sub) => mobileNavCardHtml({
        label: sub,
        onclick: `mobileNavGo('${slug}/${subcategoryToSlug(sub)}')`,
        leading: mobileNavSubLeadingHtml(cat, sub)
    })).join('');

    body.innerHTML = `
        <div class="mobile-nav-panel">
            <button type="button" class="mobile-nav-back" onclick="openMobileNavCategory(null)">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                All departments
            </button>
            <div class="mobile-nav-cat-hero">
                <div class="${heroWrapClass}">${heroIcon}</div>
                <div class="mobile-nav-cat-hero-copy">
                    <h2 class="mobile-nav-panel-title">${cat}</h2>
                    <p class="mobile-nav-cat-blurb">${blurb}</p>
                </div>
            </div>
            <div class="mobile-nav-card-list">
                ${allCard}
                ${comboCards}
                ${regCards}
            </div>
        </div>
    `;
}

function syncMobileNavHeaderOffset() {
    const header = document.querySelector('header.sticky');
    if (!header) return;
    document.documentElement.style.setProperty('--site-header-h', `${header.offsetHeight}px`);
}

function setMobileNavToggleUI(open) {
    const toggle = document.getElementById('mobile-nav-toggle');
    const iconOpen = document.getElementById('mobile-nav-icon-open');
    const iconClose = document.getElementById('mobile-nav-icon-close');
    toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    iconOpen?.classList.toggle('hidden', open);
    iconClose?.classList.toggle('hidden', !open);
}

function toggleMobileNav() {
    if (mobileNavOpen) closeMobileNav();
    else openMobileNav();
}

function openMobileNavCategory(cat) {
    mobileNavPanel = cat || 'root';
    renderMobileNavBody();
    const body = document.getElementById('mobile-nav-body');
    if (body) body.scrollTop = 0;
}

function mobileNavGo(path) {
    closeMobileNav();
    if (typeof navigateTo === 'function') navigateTo(path);
}

function openMobileNav() {
    const drawer = document.getElementById('mobile-nav-drawer');
    const backdrop = document.getElementById('mobile-nav-backdrop');
    if (!drawer) return;

    syncMobileNavHeaderOffset();
    mobileNavPanel = 'root';
    renderMobileNavBody();
    if (backdrop) {
        backdrop.hidden = false;
        requestAnimationFrame(() => backdrop.classList.add('is-open'));
    }
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    setMobileNavToggleUI(true);
    mobileNavOpen = true;
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.lock('mobile-nav-open');
    else document.body.classList.add('mobile-nav-open');
    if (typeof ModalHistory !== 'undefined') ModalHistory.push('nav');
}

function closeMobileNav(opts = {}) {
    const drawer = document.getElementById('mobile-nav-drawer');
    const backdrop = document.getElementById('mobile-nav-backdrop');
    const wasOpen = mobileNavOpen || drawer?.classList.contains('is-open');

    drawer?.classList.remove('is-open');
    drawer?.setAttribute('aria-hidden', 'true');
    setMobileNavToggleUI(false);
    if (backdrop) {
        backdrop.classList.remove('is-open');
        setTimeout(() => {
            if (!mobileNavOpen) backdrop.hidden = true;
        }, 280);
    }
    mobileNavOpen = false;
    mobileNavPanel = 'root';
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.unlock('mobile-nav-open');
    else document.body.classList.remove('mobile-nav-open');

    if (wasOpen && !opts.fromHistory && typeof ModalHistory !== 'undefined') {
        ModalHistory.dismiss('nav');
    }
}

function renderBreadcrumbs() {
    const el = document.getElementById('breadcrumbs');
    if (!el) return;

    const { category, subcategory } = AppState.route;
    if (!category) {
        el.innerHTML = '';
        return;
    }

    const slug = categoryMeta[category].slug;
    let html = `<button onclick="navigateTo('home')" class="breadcrumb-link">Home</button>`;
    html += `<span class="breadcrumb-sep mx-2">›</span>`;

    if (subcategory) {
        html += `<button onclick="navigateTo('${slug}')" class="breadcrumb-link">${category}</button>`;
        html += `<span class="breadcrumb-sep mx-2">›</span>`;
        html += `<span class="text-brand-blue font-medium">${subcategory}</span>`;
    } else {
        html += `<span class="text-brand-blue font-medium">All ${category}</span>`;
    }

    el.innerHTML = html;
}

function footerFilter(category) {
    const slug = categoryMeta[category]?.slug;
    if (slug) navigateTo(slug);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileNavOpen) closeMobileNav();
});

window.addEventListener('resize', () => {
    if (mobileNavOpen || document.body.classList.contains('pdp-open')) {
        syncMobileNavHeaderOffset();
    }
});
