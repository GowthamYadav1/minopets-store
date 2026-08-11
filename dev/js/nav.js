/**
 * Desktop category dropdowns + mobile hamburger drawer (Chewy-style).
 */

const MOBILE_NAV_CHEVRON = `<svg class="mobile-nav-item-chevron" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>`;

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
                <span>${cat}</span>
                ${MOBILE_NAV_CHEVRON}
            </button>
        `).join('');
        body.innerHTML = `
            ${catRows}
            <button type="button" class="mobile-nav-item mobile-nav-item--accent" onclick="mobileNavGo('deals')">
                <span>Deals</span>
                ${MOBILE_NAV_CHEVRON}
            </button>
            <button type="button" class="mobile-nav-item" onclick="mobileNavGo('home')">
                <span>Home</span>
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

    const comboRows = comboSubs.map((sub) => `
        <button type="button" class="mobile-nav-item mobile-nav-item--accent" onclick="mobileNavGo('${slug}/${subcategoryToSlug(sub)}')">
            <span><span class="combo-pill" style="margin-right:0.35rem">COMBO</span>${sub}</span>
            ${MOBILE_NAV_CHEVRON}
        </button>
    `).join('');

    const regRows = regularSubs.map((sub) => `
        <button type="button" class="mobile-nav-item" onclick="mobileNavGo('${slug}/${subcategoryToSlug(sub)}')">
            <span>${sub}</span>
            ${MOBILE_NAV_CHEVRON}
        </button>
    `).join('');

    body.innerHTML = `
        <button type="button" class="mobile-nav-back" onclick="openMobileNavCategory(null)">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
            All departments
        </button>
        <h2 class="mobile-nav-panel-title">${cat}</h2>
        <button type="button" class="mobile-nav-item" onclick="mobileNavGo('${slug}')">
            <span>All ${cat}</span>
            ${MOBILE_NAV_CHEVRON}
        </button>
        ${comboRows}
        ${regRows}
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
    if (mobileNavOpen) syncMobileNavHeaderOffset();
});
