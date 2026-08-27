/**
 * Saved delivery addresses in Firestore: users/{uid}/addresses/{id}
 */
function savedAddressEscape(value) {
    const el = document.createElement('div');
    el.textContent = String(value || '');
    return el.innerHTML;
}

async function loadSavedAddresses() {
    const user = typeof minoCurrentUser === 'function' ? minoCurrentUser() : null;
    if (!user) return [];
    const snap = await firebase.firestore()
        .collection('users').doc(user.uid)
        .collection('addresses')
        .get();
    const list = [];
    snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
    list.sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault));
    return list;
}

async function saveCheckoutAddressForUser() {
    const user = typeof minoCurrentUser === 'function' ? minoCurrentUser() : null;
    if (!user) return;
    const fulfillment = document.getElementById('fulfillment')?.value || '';
    if (fulfillment !== 'Local Delivery') return;
    const profile = window.minoUserProfile?.profileComplete ? window.minoUserProfile : null;
    const name = profile?.name || document.getElementById('customer-name')?.value.trim() || '';
    const phone = profile?.phone || document.getElementById('customer-phone')?.value.trim() || '';
    const address = document.getElementById('customer-address')?.value.trim() || '';
    const pincode = document.getElementById('customer-pincode')?.value.trim() || '';
    if (!address || !pincode) return;
    const col = firebase.firestore().collection('users').doc(user.uid).collection('addresses');
    const existing = await col.get();
    let match = null;
    existing.forEach((doc) => {
        const d = doc.data();
        if (String(d.address || '') === address && String(d.pincode || '') === pincode) match = doc;
    });
    const geo = typeof minoPickedAddressGeo === 'function' ? minoPickedAddressGeo() : null;
    const payload = {
        name,
        phone,
        address,
        pincode,
        geo: geo || null,
        isDefault: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (match) {
        await match.ref.set(payload, { merge: true });
        return;
    }
    const batch = firebase.firestore().batch();
    existing.forEach((doc) => {
        if (doc.data().isDefault) batch.update(doc.ref, { isDefault: false });
    });
    const ref = col.doc();
    batch.set(ref, Object.assign({ createdAt: firebase.firestore.FieldValue.serverTimestamp() }, payload));
    await batch.commit();
}

function applySavedAddressById(id) {
    const addr = (window._minoSavedAddresses || []).find((a) => a.id === id);
    applySavedAddress(addr, { forceAddress: true });
}

function applySavedAddress(addr, opts = {}) {
    if (!addr) return;
    const nameEl = document.getElementById('customer-name');
    const phoneEl = document.getElementById('customer-phone');
    const addrEl = document.getElementById('customer-address');
    const pinEl = document.getElementById('customer-pincode');
    if (nameEl && !nameEl.value.trim() && addr.name) nameEl.value = addr.name;
    if (phoneEl && !phoneEl.value.trim() && addr.phone) {
        phoneEl.value = String(addr.phone).replace(/\D/g, '').slice(-10);
    }
    const applyAddress = !!opts.forceAddress || !addrEl?.value.trim();
    if (addrEl && applyAddress) addrEl.value = addr.address || '';
    if (pinEl && (opts.forceAddress || !pinEl.value.trim())) pinEl.value = addr.pincode || '';
    if (applyAddress && typeof minoSetPickedAddressGeo === 'function') minoSetPickedAddressGeo(addr.geo);
    if (typeof updatePlaceOrderButton === 'function') updatePlaceOrderButton();
}

async function renderSavedAddresses() {
    const wrap = document.getElementById('saved-addresses');
    if (!wrap) return;
    const user = typeof minoCurrentUser === 'function' ? minoCurrentUser() : null;
    if (!user) {
        wrap.classList.add('hidden');
        wrap.innerHTML = '';
        return;
    }
    try {
        const list = await loadSavedAddresses();
        if (!list.length) {
            wrap.classList.add('hidden');
            wrap.innerHTML = '';
            return;
        }
        wrap.classList.remove('hidden');
        window._minoSavedAddresses = list;
        wrap.innerHTML = `
            <p class="text-xs font-semibold text-brand-blue mb-1.5">Saved addresses</p>
            <div class="space-y-1.5">
                ${list.map((a) => `
                    <label class="flex items-start gap-2 rounded-lg border border-gray-200 p-2 cursor-pointer hover:border-brand-blue/40">
                        <input type="radio" name="saved-address" value="${a.id}" ${a.isDefault ? 'checked' : ''}
                            onchange="applySavedAddressById('${a.id}')">
                        <span class="text-sm text-gray-700 leading-snug">
                            <span class="font-medium text-slate-800">${savedAddressEscape(a.name || 'Address')}</span>
                            ${a.isDefault ? '<span class="text-[10px] uppercase tracking-wide text-brand-coral ml-1">Default</span>' : ''}
                            <span class="block text-xs text-gray-500">${savedAddressEscape(a.address)} ${savedAddressEscape(a.pincode)}</span>
                        </span>
                    </label>
                `).join('')}
            </div>
        `;
        const def = list.find((a) => a.isDefault) || list[0];
        applySavedAddress(def);
    } catch (err) {
        console.warn('[addresses]', err);
        wrap.classList.add('hidden');
    }
}
