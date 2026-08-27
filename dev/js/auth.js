/**
 * Customer identity: phone OTP + Google, one verified phone per account.
 * Firebase Auth phoneNumber is the only trusted customer phone.
 */
const AUTH_PHONE_KEY = 'mino_auth_phone';

let _loginConfirmation = null;
let _profileConfirmation = null;
let _pendingGoogleCredential = null;
let _otpTimer = null;
let _profileOpenRequested = false;
let _showAllSetBanner = false;

window.minoUserProfile = null;

function minoCurrentUser() {
    try { return firebase.auth().currentUser; } catch (_) { return null; }
}

function minoAuthDisplayName(user) {
    return user?.displayName || user?.email || user?.phoneNumber || 'Account';
}

function minoProfileComplete() {
    return !!(minoCurrentUser() && window.minoUserProfile?.profileComplete);
}

function mapAuthError(err) {
    const code = String(err?.code || err?.message || '');
    try { console.error('[mino-auth]', err?.code || '', err?.message || err); } catch (_) { /* ignore */ }
    if (code.includes('too-many-requests')) return 'Too many attempts. Wait a minute and try again.';
    if (code.includes('popup-closed')) return 'Google sign-in was closed.';
    if (code.includes('invalid-phone')) return 'Enter a valid 10-digit Indian mobile number.';
    if (code.includes('invalid-verification-code')) return 'That OTP is not valid.';
    if (code.includes('code-expired')) return 'OTP expired. Request a new one.';
    if (code.includes('operation-not-allowed')) return 'This sign-in method is not enabled right now. Try again shortly.';
    if (isIdentityCollision(err)) {
        return '';
    }
    if (code.includes('provider-already-linked')) return 'Google is already connected.';
    if (code.includes('phone_already_registered')) return 'This number is already registered. Sign in with that number.';
    if (code.includes('phone_not_verified')) return 'One last step — add your mobile number to complete your profile.';
    if (code.includes('invalid_email') || code.includes('invalid-email')) return 'Enter a valid email address, or leave it blank.';
    if (code.includes('phone_change_not_allowed')) return 'Your verified mobile cannot be changed here. Contact Mino Pets support.';
    if (code.includes('account_merge_requires_support')) return 'These sign-in methods belong to different completed accounts. Contact Mino Pets support.';
    if (code.includes('invalid-app-credential') || code.includes('captcha-check-failed')) {
        return 'We could not start phone verification. Reload the page and try again.';
    }
    if (code.includes('unauthorized-domain')) {
        return 'This site is not authorised for login yet. Reload or try again later.';
    }
    if (code.includes('billing-not-enabled') || code.includes('quota-exceeded')) {
        return 'Phone OTP is temporarily unavailable. Try again later.';
    }
    if (code.includes('Failed to fetch') || code.includes('Failed to reach') || code.includes('NetworkError') || code.includes('Load failed')) {
        return 'Could not save your profile. Check your connection and try again.';
    }
    return 'Something went wrong. Try again.';
}

function isIdentityCollision(err) {
    const code = String(err?.code || err?.message || '');
    return code.includes('credential-already-in-use') || code.includes('account-exists-with-different-credential');
}

function authErrorOptions(err) {
    if (!isIdentityCollision(err)) return {};
    return {
        title: 'This email is already linked to another sign-in method.'
    };
}

function setAuthError(id, message, options) {
    const el = document.getElementById(id);
    if (!el) return;
    const title = el.querySelector('[data-auth-error-title]');
    const text = el.querySelector('[data-auth-error-text]') || el;
    if (title) {
        title.textContent = options?.title || '';
        title.classList.toggle('hidden', !options?.title);
    }
    text.textContent = message || '';
    el.classList.toggle('hidden', !message && !options?.title);
    el.querySelectorAll('[data-auth-error-google]').forEach((btn) => {
        btn.classList.toggle('hidden', !options?.google);
    });
    if (id === 'profile-error') {
        const verified = !!minoCurrentUser()?.phoneNumber;
        document.getElementById('profile-hint')?.classList.toggle('hidden', !(!message && !options?.title && !verified));
        updateAllSetBanner(!message && !options?.title);
    }
}

function profileHasEmail() {
    return !!String(document.getElementById('profile-email')?.value || '').trim();
}

function updateGoogleSlot() {
    const verified = !!minoCurrentUser()?.phoneNumber;
    document.getElementById('profile-google-slot')?.classList.toggle('hidden', !verified || profileHasEmail());
}

function updateAllSetBanner(noError) {
    const show = _showAllSetBanner && noError !== false && !!minoCurrentUser()?.phoneNumber && !profileHasEmail();
    document.getElementById('profile-verified-banner')?.classList.toggle('hidden', !show);
}

function wireProfileEmailField() {
    const el = document.getElementById('profile-email');
    if (!el || el.dataset.wired) return;
    el.dataset.wired = '1';
    el.addEventListener('input', () => {
        updateGoogleSlot();
        const errorHidden = document.getElementById('profile-error')?.classList.contains('hidden');
        updateAllSetBanner(errorHidden);
    });
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

function authPhoneE164(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
        : (digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits);
    return ten.length === 10 ? `+91${ten}` : '';
}

function phoneLastTen(raw) {
    return String(raw || '').replace(/\D/g, '').slice(-10);
}

function freshRecaptchaHost() {
    document.getElementById('auth-recaptcha')?.remove();
    const host = document.createElement('div');
    host.id = 'auth-recaptcha';
    host.className = 'auth-recaptcha-slot';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    return host;
}

function clearRecaptcha() {
    try { window._minoRecaptcha?.clear(); } catch (_) { /* ignore */ }
    window._minoRecaptcha = null;
    freshRecaptchaHost();
}

function ensureRecaptcha() {
    if (window._minoRecaptcha) return window._minoRecaptcha;
    window._minoRecaptcha = new firebase.auth.RecaptchaVerifier(freshRecaptchaHost(), {
        size: 'invisible',
        badge: 'bottomright'
    });
    return window._minoRecaptcha;
}

function openAuthShell() {
    const overlay = document.getElementById('auth-overlay');
    const modal = document.getElementById('auth-modal');
    if (!overlay || !modal) return;
    overlay.hidden = false;
    modal.hidden = false;
    overlay.classList.add('open');
    modal.classList.add('open');
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.lock('auth-open');
    if (typeof ModalHistory !== 'undefined') ModalHistory.push('auth');
}

function showAuthModal() {
    if (!minoFirebaseConfigured()) {
        alert('Account login is not configured yet. Add firebase-config.js (see docs/FIREBASE.md).');
        return;
    }
    _profileOpenRequested = false;
    document.getElementById('auth-pane-login')?.classList.remove('hidden');
    document.getElementById('auth-pane-profile')?.classList.add('hidden');
    setAuthError('auth-login-error', '');
    resetLoginOtpUi();
    openAuthShell();
}

function closeAuthModal(options) {
    const overlay = document.getElementById('auth-overlay');
    const modal = document.getElementById('auth-modal');
    const wasOpen = modal?.classList.contains('open');
    overlay?.classList.remove('open');
    modal?.classList.remove('open');
    if (overlay) overlay.hidden = true;
    if (modal) modal.hidden = true;
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.unlock('auth-open');
    if (wasOpen && !options?.fromHistory && typeof ModalHistory !== 'undefined') ModalHistory.dismiss('auth');
    clearRecaptcha();
}

function showProfilePane(profile, forceComplete, options) {
    const user = minoCurrentUser();
    if (!user) return showAuthModal();
    const data = profile || window.minoUserProfile || {};
    _profileOpenRequested = !!forceComplete;
    document.getElementById('auth-pane-login')?.classList.add('hidden');
    document.getElementById('auth-pane-profile')?.classList.remove('hidden');
    const heading = document.getElementById('profile-heading');
    const subtitle = document.getElementById('profile-subtitle');
    const name = document.getElementById('profile-name');
    const email = document.getElementById('profile-email');
    const phone = document.getElementById('profile-phone');
    const verified = !!user.phoneNumber;
    const complete = !!data.profileComplete;
    if (heading) heading.textContent = verified ? 'My Account' : 'Profile';
    if (subtitle) subtitle.textContent = verified
        ? 'Update your details'
        : 'Complete your details to continue shopping';
    if (name) name.value = data.name || user.displayName || '';
    if (email) {
        if (options?.fromGoogle && user.email) email.value = user.email;
        else if (data && Object.prototype.hasOwnProperty.call(data, 'email')) email.value = String(data.email || '');
        else email.value = user.email || '';
    }
    if (phone) {
        phone.value = phoneLastTen(data.phone || user.phoneNumber);
        phone.disabled = verified || complete;
    }
    const saveBtn = document.getElementById('profile-save-btn');
    if (saveBtn) saveBtn.textContent = verified ? 'Save changes' : 'SAVE';
    document.getElementById('profile-phone-row')?.classList.toggle('is-locked', verified || complete);
    document.getElementById('profile-phone-verify')?.classList.toggle('hidden', verified || complete);
    document.getElementById('profile-otp-help')?.classList.toggle('hidden', verified || complete || !document.getElementById('profile-otp-row')?.classList.contains('hidden'));
    updateGoogleSlot();
    setAuthError('profile-error', '');
    openAuthShell();
}

function showMyAccount() {
    closeAccountMenu();
    if (!minoCurrentUser()) return showAuthModal();
    _showAllSetBanner = false;
    showProfilePane(window.minoUserProfile, !minoProfileComplete());
}

function switchAuthMode(mode) {
    if (mode === 'profile') showMyAccount();
    else showAuthModal();
}

function setLoginPhoneLocked(locked) {
    const input = document.getElementById('login-phone');
    if (input) input.disabled = !!locked;
    document.getElementById('login-phone-row')?.classList.toggle('is-locked', !!locked);
    document.getElementById('login-send-otp-btn')?.classList.toggle('hidden', !!locked);
}

function loginOtpBoxes() {
    return [...document.querySelectorAll('#login-otp-boxes .auth-otp-box')];
}

function getLoginOtpCode() {
    const hidden = document.getElementById('login-otp');
    const fromBoxes = loginOtpBoxes().map((el) => String(el.value || '').replace(/\D/g, '')).join('');
    const fromHidden = String(hidden?.value || '').replace(/\D/g, '');
    return (fromBoxes || fromHidden).slice(0, 6);
}

function setLoginOtpCode(code) {
    const digits = String(code || '').replace(/\D/g, '').slice(0, 6);
    loginOtpBoxes().forEach((el, i) => { el.value = digits[i] || ''; });
    const hidden = document.getElementById('login-otp');
    if (hidden) hidden.value = digits;
}

function wireLoginOtpBoxes() {
    const boxes = loginOtpBoxes();
    if (!boxes.length || boxes[0].dataset.wired) return;
    boxes[0].dataset.wired = '1';
    boxes.forEach((el, i) => {
        el.addEventListener('input', () => {
            const raw = String(el.value || '').replace(/\D/g, '');
            if (raw.length > 1) {
                const prefix = boxes.slice(0, i).map((box) => String(box.value || '').replace(/\D/g, '').slice(0, 1)).join('');
                setLoginOtpCode(prefix + raw);
                boxes[Math.min(i + raw.length, 5)]?.focus();
                return;
            }
            el.value = raw.slice(-1);
            setLoginOtpCode(getLoginOtpCode());
            if (raw && boxes[i + 1]) boxes[i + 1].focus();
        });
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Backspace' && !el.value && boxes[i - 1]) {
                boxes[i - 1].value = '';
                boxes[i - 1].focus();
                setLoginOtpCode(getLoginOtpCode());
            }
        });
        el.addEventListener('paste', (event) => {
            event.preventDefault();
            setLoginOtpCode(event.clipboardData?.getData('text') || '');
            boxes[Math.min(getLoginOtpCode().length, 5)]?.focus();
        });
    });
    document.getElementById('login-otp')?.addEventListener('input', (event) => {
        setLoginOtpCode(event.target.value);
    });
}

function resetLoginOtpUi() {
    if (_otpTimer) {
        clearInterval(_otpTimer);
        _otpTimer = null;
    }
    _loginConfirmation = null;
    setLoginPhoneLocked(false);
    document.getElementById('login-otp-row')?.classList.add('hidden');
    document.getElementById('login-otp-hint')?.classList.add('hidden');
    setLoginOtpCode('');
    const timer = document.getElementById('login-resend-timer');
    if (timer) timer.textContent = '(00:30)';
    const resend = document.getElementById('login-resend-btn');
    if (resend) resend.disabled = true;
}

function changeLoginNumber() {
    resetLoginOtpUi();
    clearRecaptcha();
    document.getElementById('login-phone')?.focus();
}

function startOtpTimer(seconds) {
    if (_otpTimer) clearInterval(_otpTimer);
    let left = seconds;
    const button = document.getElementById('login-resend-btn');
    const label = document.getElementById('login-resend-timer');
    if (button) button.disabled = true;
    const tick = () => {
        if (label) label.textContent = left > 0 ? `(00:${String(left).padStart(2, '0')})` : '';
        if (left-- <= 0) {
            clearInterval(_otpTimer);
            _otpTimer = null;
            if (button) button.disabled = false;
        }
    };
    tick();
    _otpTimer = setInterval(tick, 1000);
}

async function sendLoginOtp() {
    setAuthError('auth-login-error', '');
    const phone = authPhoneE164(document.getElementById('login-phone')?.value);
    if (!phone) return setAuthError('auth-login-error', 'Enter a valid 10-digit mobile number.');
    const button = document.getElementById('login-send-otp-btn');
    if (button) button.disabled = true;
    try {
        _loginConfirmation = await firebase.auth().signInWithPhoneNumber(phone, ensureRecaptcha());
        setLoginPhoneLocked(true);
        document.getElementById('login-otp-row')?.classList.remove('hidden');
        const hint = document.getElementById('login-otp-hint');
        const sentText = hint?.querySelector('[data-otp-sent-text]');
        if (sentText) sentText.textContent = `OTP sent to +91 ${phoneLastTen(phone)}`;
        hint?.classList.remove('hidden');
        setLoginOtpCode('');
        startOtpTimer(30);
        wireLoginOtpBoxes();
        loginOtpBoxes()[0]?.focus();
    } catch (err) {
        clearRecaptcha();
        setAuthError('auth-login-error', mapAuthError(err));
    } finally {
        if (button) button.disabled = false;
    }
}

async function submitLogin(event) {
    event?.preventDefault();
    const code = getLoginOtpCode();
    if (!_loginConfirmation) return setAuthError('auth-login-error', 'Request an OTP first.');
    if (code.length !== 6) return setAuthError('auth-login-error', 'Enter the 6-digit OTP.');
    try {
        const result = await _loginConfirmation.confirm(code);
        await linkPendingGoogle(result.user);
        _showAllSetBanner = true;
        await loadUserProfile(result.user, true);
    } catch (err) {
        setAuthError('auth-login-error', mapAuthError(err));
    }
}

async function signInWithGoogle() {
    setAuthError('auth-login-error', '');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        const result = await firebase.auth().signInWithPopup(provider);
        _pendingGoogleCredential = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
        await loadUserProfile(result.user, true);
    } catch (err) {
        if (isIdentityCollision(err)) {
            _pendingGoogleCredential = err.credential
                || (typeof firebase.auth.GoogleAuthProvider.credentialFromError === 'function'
                    ? firebase.auth.GoogleAuthProvider.credentialFromError(err)
                    : null)
                || _pendingGoogleCredential;
            setAuthError('auth-login-error', mapAuthError(err), authErrorOptions(err));
            return;
        }
        setAuthError('auth-login-error', mapAuthError(err));
    }
}

async function finishGoogleLink() {
    const user = minoCurrentUser();
    if (!user) return;
    await user.getIdToken(true);
    const emailEl = document.getElementById('profile-email');
    if (emailEl && !String(emailEl.value || '').trim() && user.email) {
        emailEl.value = user.email;
    }
    await loadUserProfile(user, false);
    showProfilePane(window.minoUserProfile, false, { fromGoogle: true });
    showStoreToast('Google connected', 'ok');
}

function googleEmailFromError(err) {
    return String(err?.customData?.email || err?.email || '').trim().toLowerCase();
}

async function connectGoogleToCurrentUser() {
    const user = minoCurrentUser();
    if (!user) return showAuthModal();
    if (!user.phoneNumber) return showAuthModal();
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        await user.linkWithPopup(provider);
        await finishGoogleLink();
    } catch (err) {
        if (String(err?.code || '').includes('provider-already-linked')) {
            await finishGoogleLink();
            return;
        }
        if (isIdentityCollision(err) && typeof minoFunctionsPost === 'function') {
            try {
                const cred = err.credential
                    || (typeof firebase.auth.GoogleAuthProvider.credentialFromError === 'function'
                        ? firebase.auth.GoogleAuthProvider.credentialFromError(err)
                        : null);
                const released = await minoFunctionsPost('releaseOrphanGoogleUser', {
                    email: googleEmailFromError(err)
                });
                if (released?.ok && released.alreadyOurs) {
                    await finishGoogleLink();
                    return;
                }
                if (released?.ok && released.released) {
                    if (cred) await user.linkWithCredential(cred);
                    else await user.linkWithPopup(provider);
                    await finishGoogleLink();
                    return;
                }
            } catch (_) { /* fall through to the customer message */ }
        }
        setAuthError('profile-error', mapAuthError(err), authErrorOptions(err));
    }
}

async function sendProfileOtp() {
    const user = minoCurrentUser();
    const phone = authPhoneE164(document.getElementById('profile-phone')?.value);
    if (!user) return showAuthModal();
    if (!phone) return setAuthError('profile-error', 'Enter a valid 10-digit mobile number.');
    const button = document.getElementById('profile-send-otp-btn');
    if (button) button.disabled = true;
    try {
        _profileConfirmation = await user.linkWithPhoneNumber(phone, ensureRecaptcha());
        document.getElementById('profile-otp-row')?.classList.remove('hidden');
        document.getElementById('profile-otp-help')?.classList.add('hidden');
        document.getElementById('profile-otp')?.focus();
        setAuthError('profile-error', '');
    } catch (err) {
        clearRecaptcha();
        setAuthError('profile-error', mapAuthError(err), authErrorOptions(err));
    } finally {
        if (button) button.disabled = false;
    }
}

async function confirmProfileOtp() {
    const code = String(document.getElementById('profile-otp')?.value || '').replace(/\D/g, '');
    if (!_profileConfirmation) return setAuthError('profile-error', 'Request an OTP first.');
    if (code.length !== 6) return setAuthError('profile-error', 'Enter the 6-digit OTP.');
    try {
        let result;
        try {
            result = await _profileConfirmation.confirm(code);
        } catch (err) {
            result = await adoptExistingPhoneAccount(err, code);
        }
        await linkPendingGoogle(result.user);
        await result.user.getIdToken(true);
        _showAllSetBanner = true;
        await loadUserProfile(result.user, false);
        showProfilePane(window.minoUserProfile, true);
        if (window._minoNeedsGoogleReconnect) {
            window._minoNeedsGoogleReconnect = false;
            setAuthError('profile-error', 'Phone account recovered. Tap Continue with Google to use Google next time.', { google: true });
        }
    } catch (err) {
        setAuthError('profile-error', mapAuthError(err), authErrorOptions(err));
    }
}

async function adoptExistingPhoneAccount(err, otpCode) {
    if (!isIdentityCollision(err)) throw err;
    const phoneCredential = err.credential
        || (typeof firebase.auth.PhoneAuthProvider.credentialFromError === 'function'
            ? firebase.auth.PhoneAuthProvider.credentialFromError(err)
            : null)
        || (_profileConfirmation?.verificationId
            ? firebase.auth.PhoneAuthProvider.credential(_profileConfirmation.verificationId, otpCode)
            : null);
    if (!phoneCredential) throw err;
    const googleOnlyUser = minoCurrentUser();
    if (googleOnlyUser?.phoneNumber || window.minoUserProfile?.profileComplete) {
        throw new Error('account_merge_requires_support');
    }
    if (googleOnlyUser && !_pendingGoogleCredential) {
        window._minoNeedsGoogleReconnect = true;
    }
    if (googleOnlyUser) await googleOnlyUser.delete();
    return firebase.auth().signInWithCredential(phoneCredential);
}

async function linkPendingGoogle(user) {
    if (!_pendingGoogleCredential || !user) {
        if (!_pendingGoogleCredential) window._minoNeedsGoogleReconnect = window._minoNeedsGoogleReconnect || false;
        return;
    }
    try {
        await user.linkWithCredential(_pendingGoogleCredential);
        _pendingGoogleCredential = null;
        window._minoNeedsGoogleReconnect = false;
    } catch (linkErr) {
        if (String(linkErr?.code || '').includes('provider-already-linked')) {
            _pendingGoogleCredential = null;
            window._minoNeedsGoogleReconnect = false;
            return;
        }
        if (isIdentityCollision(linkErr)) {
            window._minoNeedsGoogleReconnect = true;
            return;
        }
        throw linkErr;
    }
}

async function continueWithExistingGoogle() {
    return connectGoogleToCurrentUser();
}

function showStoreToast(message, status) {
    const el = document.getElementById('store-toast');
    if (!el) return;
    clearTimeout(window._minoToastTimer);
    el.textContent = message || '';
    el.classList.remove('ok', 'error', 'show');
    el.classList.add(status === 'error' ? 'error' : 'ok');
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    window._minoToastTimer = setTimeout(() => {
        el.classList.remove('show');
        window._minoToastTimer = setTimeout(() => { el.hidden = true; }, 220);
    }, 2800);
}

async function submitProfile(event) {
    event?.preventDefault();
    const user = minoCurrentUser();
    if (!user) return showAuthModal();
    const name = String(document.getElementById('profile-name')?.value || '').trim().replace(/\s+/g, ' ');
    const emailRaw = String(document.getElementById('profile-email')?.value || '').trim().toLowerCase();
    if (name.length < 2) return setAuthError('profile-error', 'Enter your full name.');
    if (emailRaw && !isValidEmail(emailRaw)) return setAuthError('profile-error', 'Enter a valid email address, or leave it blank.');
    const email = emailRaw && isValidEmail(emailRaw) ? emailRaw : '';
    if (!user.phoneNumber) {
        document.getElementById('profile-phone')?.focus();
        return setAuthError('profile-error', '');
    }
    const button = document.getElementById('profile-save-btn');
    if (button) button.disabled = true;
    const wasComplete = !!window.minoUserProfile?.profileComplete;
    try {
        if (wasComplete) {
            await firebase.firestore().collection('users').doc(user.uid).update({
                name,
                email,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            if (user.displayName !== name) await user.updateProfile({ displayName: name });
            window.minoUserProfile = { ...window.minoUserProfile, name, email };
        } else {
            await user.getIdToken(true);
            const result = await minoFunctionsPost('completeProfile', { name, email });
            if (!result?.ok) throw new Error(result?.error || 'profile_save_failed');
            window.minoUserProfile = result.profile;
        }
        try { localStorage.setItem(AUTH_PHONE_KEY, user.phoneNumber); } catch (_) { /* ignore */ }
        updateAuthHeader(user);
        closeAuthModal();
        if (typeof renderCheckoutIdentity === 'function') renderCheckoutIdentity();
        showStoreToast(wasComplete ? 'Account updated' : 'Profile saved', 'ok');
    } catch (err) {
        const message = mapAuthError(err);
        setAuthError('profile-error', message, authErrorOptions(err));
        showStoreToast(message, 'error');
    } finally {
        if (button) button.disabled = false;
    }
}

async function minoSaveProfileFromCheckout(rawName) {
    const user = minoCurrentUser();
    if (!user?.phoneNumber) return false;
    const name = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) return false;
    const current = window.minoUserProfile || {};
    if (current.profileComplete && current.name === name) return true;
    const email = String(current.email || '').trim().toLowerCase();
    if (current.profileComplete) {
        await firebase.firestore().collection('users').doc(user.uid).update({
            name,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (user.displayName !== name) await user.updateProfile({ displayName: name });
        window.minoUserProfile = { ...current, name };
    } else {
        await user.getIdToken(true);
        const result = await minoFunctionsPost('completeProfile', { name, email });
        if (!result?.ok) throw new Error(result?.error || 'profile_save_failed');
        window.minoUserProfile = result.profile;
    }
    updateAuthHeader(user);
    if (typeof renderCheckoutIdentity === 'function') renderCheckoutIdentity();
    return true;
}

async function loadUserProfile(user, openIfIncomplete) {
    if (!user) {
        window.minoUserProfile = null;
        return null;
    }
    const snap = await firebase.firestore().collection('users').doc(user.uid).get();
    window.minoUserProfile = snap.exists ? snap.data() : null;
    if (!window.minoUserProfile?.profileComplete && openIfIncomplete) {
        showProfilePane(window.minoUserProfile, true);
    } else if (window.minoUserProfile?.profileComplete && _profileOpenRequested) {
        showProfilePane(window.minoUserProfile);
    } else if (window.minoUserProfile?.profileComplete) {
        closeAuthModal();
    }
    if (typeof renderCheckoutIdentity === 'function') renderCheckoutIdentity();
    return window.minoUserProfile;
}

function minoRequireCompleteProfile() {
    if (!minoCurrentUser()) return true;
    if (minoProfileComplete()) return true;
    showProfilePane(window.minoUserProfile, true);
    return false;
}

async function signOutMino() {
    try { await firebase.auth().signOut(); } catch (err) { console.warn(err); }
    window.minoUserProfile = null;
    closeAccountMenu();
    closeAuthModal({ fromHistory: true });
    if (typeof renderCheckoutIdentity === 'function') renderCheckoutIdentity();
}

function closeAccountMenu() {
    document.getElementById('account-menu')?.classList.add('hidden');
}

function toggleAccountMenu(event) {
    event?.stopPropagation();
    document.getElementById('account-menu')?.classList.toggle('hidden');
}

function updateAuthHeader(user) {
    const signedOut = document.getElementById('header-auth-signed-out');
    const guest = document.getElementById('header-auth-guest');
    const inEl = document.getElementById('header-auth-user');
    const nameEl = document.getElementById('header-auth-name');
    const avatar = document.getElementById('header-auth-avatar');
    const guestIcon = document.getElementById('header-auth-guest-icon');
    if (!user) {
        signedOut?.classList.remove('hidden');
        if (guest) guest.hidden = false;
        if (guestIcon) guestIcon.hidden = false;
        inEl?.classList.add('hidden');
        inEl?.classList.remove('flex');
        closeAccountMenu();
        return;
    }
    signedOut?.classList.add('hidden');
    if (guest) guest.hidden = true;
    if (guestIcon) guestIcon.hidden = true;
    inEl?.classList.remove('hidden');
    inEl?.classList.add('flex');
    const shownName = window.minoUserProfile?.name || user.displayName || 'Account';
    if (nameEl) nameEl.textContent = shownName.split(' ')[0];
    if (avatar) {
        avatar.textContent = shownName.charAt(0).toUpperCase();
        if (user.photoURL) {
            const image = document.createElement('img');
            image.alt = '';
            image.className = 'w-full h-full object-cover';
            image.referrerPolicy = 'no-referrer';
            image.onload = () => { avatar.textContent = ''; avatar.appendChild(image); };
            image.src = user.photoURL;
        }
    }
}

function initAuth() {
    const guestButton = document.getElementById('header-auth-guest');
    const userButton = document.getElementById('header-auth-user');
    if (!minoFirebaseConfigured()) {
        guestButton?.classList.add('hidden');
        document.getElementById('header-auth-guest-icon')?.classList.add('hidden');
        userButton?.classList.add('hidden');
        return;
    }
    minoFirebaseInit();
    wireLoginOtpBoxes();
    wireProfileEmailField();
    document.addEventListener('click', (event) => {
        if (!event.target.closest('#header-account-wrap')) closeAccountMenu();
    });
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user && !user.phoneNumber) {
            try { await firebase.auth().signOut(); } catch (_) { /* ignore */ }
            return;
        }
        updateAuthHeader(user);
        if (user) {
            try {
                await loadUserProfile(user, true);
                updateAuthHeader(user);
            } catch (err) {
                console.warn('[auth] profile', err);
            }
        } else {
            window.minoUserProfile = null;
            if (typeof renderCheckoutIdentity === 'function') renderCheckoutIdentity();
        }
    });
}
