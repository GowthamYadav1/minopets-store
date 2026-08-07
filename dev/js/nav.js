function buildCategoryNav() {
    const nav = document.getElementById('category-nav');
    const mobileNav = document.getElementById('mobile-category-nav');
    if (!nav || !mobileNav) return;

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

    mobileNav.innerHTML = Object.keys(categories).map(cat => {
        const slug = categoryMeta[cat].slug;
        return `<button onclick="navigateTo('${slug}')" class="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">${cat}</button>`;
    }).join('') + `<button onclick="navigateTo('home')" class="px-3 py-1.5 rounded-full bg-brand-coral/80 hover:bg-brand-coral transition-colors">Home</button>`;
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
