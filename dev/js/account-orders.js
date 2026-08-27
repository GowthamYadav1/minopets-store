/**
 * My orders — Firestore orders where uid == current user.
 */
function openOrdersPanel() {
    const overlay = document.getElementById('orders-overlay');
    const panel = document.getElementById('orders-panel');
    if (!overlay || !panel) return;
    closeAccountMenu();
    overlay.classList.add('open');
    panel.classList.add('open');
    overlay.hidden = false;
    panel.hidden = false;
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.lock('orders-open');
    if (typeof ModalHistory !== 'undefined') ModalHistory.push('orders');
    loadOrdersPanel();
}

function closeOrdersPanel(opts) {
    const overlay = document.getElementById('orders-overlay');
    const panel = document.getElementById('orders-panel');
    const wasOpen = panel?.classList.contains('open');
    overlay?.classList.remove('open');
    panel?.classList.remove('open');
    if (overlay) overlay.hidden = true;
    if (panel) panel.hidden = true;
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.unlock('orders-open');
    if (wasOpen && !opts?.fromHistory && typeof ModalHistory !== 'undefined') {
        ModalHistory.dismiss('orders');
    }
}

function formatOrderDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        return String(iso);
    }
}

async function loadOrdersPanel() {
    const listEl = document.getElementById('orders-list');
    if (!listEl) return;
    const user = typeof minoCurrentUser === 'function' ? minoCurrentUser() : null;
    if (!user) {
        listEl.innerHTML = `
            <p class="text-sm text-gray-500 py-8 text-center">
                <button type="button" class="text-brand-coral font-semibold underline" onclick="closeOrdersPanel(); showAuthModal('login');">Sign in</button>
                to see your orders.
            </p>`;
        return;
    }
    listEl.innerHTML = '<p class="text-sm text-gray-400 py-8 text-center">Loading orders…</p>';
    try {
        const snap = await firebase.firestore()
            .collection('orders')
            .where('uid', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .limit(40)
            .get();
        if (snap.empty) {
            listEl.innerHTML = '<p class="text-sm text-gray-500 py-8 text-center">No orders yet.</p>';
            return;
        }
        const rows = [];
        snap.forEach((doc) => rows.push(doc.data()));
        listEl.innerHTML = rows.map((o) => {
            const items = (o.items || []).map((it) => `${it.name} × ${it.qty}`).join(', ');
            const status = String(o.status || 'pending').replace(/_/g, ' ');
            return `
                <article class="border border-gray-200 rounded-xl p-3">
                    <div class="flex justify-between gap-2 items-start">
                        <p class="font-bold text-brand-blue text-sm">${o.order_id || ''}</p>
                        <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">${status}</span>
                    </div>
                    <p class="text-xs text-gray-400 mt-0.5">${formatOrderDate(o.created_at)}</p>
                    <p class="text-sm text-gray-700 mt-2 leading-snug">${items}</p>
                    <p class="text-sm font-bold text-slate-800 mt-2">₹${o.total}/-</p>
                </article>`;
        }).join('');
    } catch (err) {
        console.warn('[orders]', err);
        listEl.innerHTML = '<p class="text-sm text-red-600 py-8 text-center">Could not load orders. If this is a new project, deploy Firestore indexes.</p>';
    }
}
