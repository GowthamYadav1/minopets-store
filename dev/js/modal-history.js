/**
 * Mobile browser Back closes overlays (policy, PDP, lightbox, filters, cart)
 * instead of leaving the store page. Each open pushes a history entry; UI close
 * pops it; popstate closes the top overlay.
 */

/** Freeze page scroll while overlays are open; restore position on last unlock. */
window.BodyScrollLock = {
    _y: 0,
    _locks: new Set(),

    lock(id, scrollY) {
        if (!id) return;
        if (this._locks.size === 0) {
            const y = scrollY != null ? Number(scrollY) : (window.scrollY || window.pageYOffset || 0);
            this._y = isFinite(y) && y >= 0 ? y : 0;
            document.body.style.top = `-${this._y}px`;
        }
        this._locks.add(id);
        document.documentElement.classList.add(id);
        document.body.classList.add(id);
    },

    /** Remember list position (e.g. before async work) without locking yet. */
    remember(scrollY) {
        const y = scrollY != null ? Number(scrollY) : (window.scrollY || window.pageYOffset || 0);
        if (this._locks.size === 0 && isFinite(y) && y >= 0) this._y = y;
    },

    unlock(id) {
        if (!id || !this._locks.has(id)) {
            document.documentElement.classList.remove(id);
            document.body.classList.remove(id);
            return;
        }
        this._locks.delete(id);
        document.documentElement.classList.remove(id);
        document.body.classList.remove(id);
        if (this._locks.size === 0) {
            const y = this._y || 0;
            document.body.style.top = '';
            // Restore after layout drops position:fixed (same-frame scrollTo often lands at 0)
            const restore = () => {
                window.scrollTo(0, y);
                document.documentElement.scrollTop = y;
                document.body.scrollTop = y;
            };
            restore();
            requestAnimationFrame(() => {
                restore();
                requestAnimationFrame(restore);
            });
        }
    },
};

window.ModalHistory = {
    stack: [],
    suppress: 0,

    top() {
        return this.stack.length ? this.stack[this.stack.length - 1] : null;
    },

    push(id) {
        if (!id || this.top() === id) return;
        this.stack.push(id);
        try {
            history.pushState({ ...(history.state || {}), minoModal: id }, '', location.href);
        } catch (_) {
            /* ignore */
        }
    },

    forget(id) {
        this.stack = this.stack.filter((x) => x !== id);
    },

    /** Close via X / backdrop — remove matching history entry. */
    dismiss(id) {
        if (!id) return;
        if (this.top() !== id) {
            this.forget(id);
            return;
        }
        this.stack.pop();
        this.suppress += 1;
        history.back();
    },

    /** Close several stacked layers in one go (e.g. lightbox + PDP). */
    dismissMany(ids) {
        const set = new Set(ids);
        let n = 0;
        while (this.stack.length && set.has(this.top())) {
            this.stack.pop();
            n += 1;
        }
        ids.forEach((id) => this.forget(id));
        if (n > 0) {
            this.suppress += n;
            history.go(-n);
        }
    },

    /** Close every overlay DOM + clear stack (e.g. before navigateTo). */
    closeAllSilent() {
        const ids = [...this.stack].reverse();
        this.stack = [];
        ids.forEach((id) => this.closeLayer(id));
        try {
            const st = { ...(history.state || {}) };
            delete st.minoModal;
            history.replaceState(st, '', location.href);
        } catch (_) {
            /* ignore */
        }
    },

    handlePopState() {
        if (this.suppress > 0) {
            this.suppress -= 1;
            return true;
        }
        if (!this.stack.length) return false;
        const id = this.stack.pop();
        this.closeLayer(id);
        return true;
    },

    closeLayer(id) {
        const opts = { fromHistory: true };
        if (id === 'lightbox' && typeof closePdpLightbox === 'function') closePdpLightbox(opts);
        else if (id === 'pdp' && typeof closeProductDetail === 'function') closeProductDetail(opts);
        else if (id === 'policy' && typeof closePolicy === 'function') closePolicy(opts);
        else if (id === 'filters' && typeof closeFilterDrawer === 'function') closeFilterDrawer(opts);
        else if (id === 'cart' && typeof closeCartPanel === 'function') closeCartPanel(opts);
        else if (id === 'nav' && typeof closeMobileNav === 'function') closeMobileNav(opts);
        else if (id === 'auth' && typeof closeAuthModal === 'function') closeAuthModal(opts);
        else if (id === 'orders' && typeof closeOrdersPanel === 'function') closeOrdersPanel(opts);
    },
};
