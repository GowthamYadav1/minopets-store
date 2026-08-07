/**
 * Design B pricing helpers — sell · MRP · % OFF · You save.
 * MRP optional: if missing or ≤ sell, show sell only.
 */

function parseMoneyAmount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/** MRP only when strictly above sell (else null). */
function effectiveMrp(sell, mrp) {
    const s = Number(sell) || 0;
    const m = parseMoneyAmount(mrp);
    if (m == null || m <= s) return null;
    return m;
}

function discountPercent(sell, mrp) {
    const m = effectiveMrp(sell, mrp);
    if (m == null) return null;
    const pct = Math.round((1 - (Number(sell) || 0) / m) * 100);
    return pct > 0 ? pct : null;
}

function savingsAmount(sell, mrp) {
    const m = effectiveMrp(sell, mrp);
    if (m == null) return null;
    const save = Math.round(m - (Number(sell) || 0));
    return save > 0 ? save : null;
}

function formatInrAmount(n) {
    return Math.round(Number(n) || 0).toLocaleString('en-IN');
}

function escapePriceHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Card / PDP top row: sell · optional MRP · optional OFF */
function renderPriceBTopHtml(sell, mrp, opts = {}) {
    const from = !!opts.from;
    const compact = !!opts.compact;
    const m = effectiveMrp(sell, mrp);
    const pct = discountPercent(sell, mrp);
    const amount = formatInrAmount(sell);
    const sellLabel = from
        ? `From ₹${amount}${compact ? '' : '/-'}`
        : `₹${amount}${compact ? '' : '/-'}`;
    let html = `<div class="price-b-top">
        <span class="price-b-sell">${sellLabel}</span>`;
    if (m != null) {
        html += `<span class="price-b-mrp"><s>₹${formatInrAmount(m)}</s></span>`;
        if (pct != null) html += `<span class="price-b-off">${pct}% OFF</span>`;
    }
    html += `</div>`;
    return html;
}

/**
 * Product card pricing (matches demo):
 * Line 1: sell · MRP   (+ stepper beside this block)
 * Line 2: OFF badge
 */
function renderPriceBCardHtml(sell, mrp) {
    const m = effectiveMrp(sell, mrp);
    const pct = discountPercent(sell, mrp);
    let html = `<div class="price-b">
        <div class="price-b-main">
            <span class="price-b-sell">₹${formatInrAmount(sell)}/-</span>`;
    if (m != null) {
        html += `<span class="price-b-mrp"><s>₹${formatInrAmount(m)}</s></span>`;
    }
    html += `</div>`;
    if (pct != null) {
        html += `<span class="price-b-off">${pct}% OFF</span>`;
    }
    html += `</div>`;
    return html;
}

function renderPriceBSaveHtml(sell, mrp, opts = {}) {
    const save = savingsAmount(sell, mrp);
    if (save == null) return '';
    const label = opts.from
        ? `You save from ₹${formatInrAmount(save)}`
        : `You save ₹${formatInrAmount(save)}`;
    return `<div class="price-b-save">${label}</div>`;
}

/** Closed pack dropdown label: name | sell · optional MRP (no OFF). */
function renderPackCardLabelHtml(pack) {
    if (!pack) return '';
    const m = effectiveMrp(pack.price, pack.mrp);
    let html = `<span class="pack-dd-name">${escapePriceHtml(pack.label)}</span>`
        + `<span class="pack-dd-sep" aria-hidden="true">|</span>`
        + `<span class="pack-dd-sell">₹${formatInrAmount(pack.price)}</span>`;
    if (m != null) {
        html += `<span class="pack-dd-mrp"><s>₹${formatInrAmount(m)}</s></span>`;
    }
    return html;
}

/** PDP pack row price column. */
function renderPackRowPriceBHtml(pack) {
    const m = effectiveMrp(pack.price, pack.mrp);
    let html = `<div class="pack-row-price-b"><span class="sell">₹${formatInrAmount(pack.price)}</span>`;
    if (m != null) {
        html += `<span class="mrp"><s>₹${formatInrAmount(m)}</s></span>`;
    }
    html += `</div>`;
    return html;
}

function renderPackRowOffBadge(pack) {
    const pct = discountPercent(pack.price, pack.mrp);
    return pct != null ? ` <span class="price-b-off">${pct}% OFF</span>` : '';
}
