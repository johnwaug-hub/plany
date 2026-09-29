// ==================== AUTHENTICATION ====================

// Auth State Observer
auth.onAuthStateChanged(async (user) => {
    localStorage.removeItem('authPending');
    
    if (user) {
        // Account-switch guard: if a DIFFERENT account than last time is signing
        // in on this device, purge the previous account's device-local storage
        // (AI keys/name, MS/Moodle tokens, cached school year) so nothing bleeds
        // across accounts. Same-uid re-login keeps its own local state.
        try {
            const _lastUid = localStorage.getItem('plany_last_uid');
            if (_lastUid && _lastUid !== user.uid) clearAccountStorage();
            localStorage.setItem('plany_last_uid', user.uid);
        } catch (e) { console.warn('account-switch guard:', e); }

        currentUser = user;
        resetUserState();
        restoreConnectionState();
        elements.authScreen.classList.remove('active');
        elements.authScreen.classList.add('hidden');
        elements.appScreen.classList.remove('hidden');
        elements.appScreen.classList.add('active');
        const _nameText = document.getElementById('user-name-text');
        if (_nameText) _nameText.textContent = user.displayName || user.email.split('@')[0];
        elements.accountEmail.textContent = user.email;
        // Notify Capacitor bridge that auth resolved (dismisses splash screen)
        document.dispatchEvent(new CustomEvent('plany:auth-resolved'));
        
        // Create user document if it doesn't exist (for new Google users).
        // This check can transiently fail right after sign-in if the auth
        // token hasn't fully attached yet (seen in testing) -- if so, we
        // still proceed to loadUserData() below rather than leaving the app
        // on a blank screen. loadUserData()'s own per-collection try/catches
        // already degrade gracefully if something is still not ready.
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists) {
                await db.collection('users').doc(user.uid).set({
                    name: user.displayName || '',
                    email: user.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error('Error in auth handler (user doc check):', error);
        }
        loadUserData();
    } else {
        console.log('No user logged in');
        currentUser = null;
        // v6.5.0: signed-out launches also dismiss the native splash (they sat
        // on it for the 4-second fallback)
        document.dispatchEvent(new CustomEvent('plany:auth-resolved'));
        resetUserState();
        elements.appScreen.classList.remove('active');
        elements.appScreen.classList.add('hidden');
        elements.authScreen.classList.remove('hidden');
        elements.authScreen.classList.add('active');
        hideLoading();
    }
});

// Google Sign In
async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        provider.setCustomParameters({
            prompt: 'select_account'
        });
        
        const result = await auth.signInWithPopup(provider);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        console.error('Sign-in error:', error);
        
        showAuthError(friendlyAuthError(error));
    }
}

// Verify buttons exist first
try {
    if (elements.googleLoginBtn) {
        elements.googleLoginBtn.addEventListener('click', () => {
            signInWithGoogle();
        });
    }
    
    if (elements.googleRegisterBtn) {
        elements.googleRegisterBtn.addEventListener('click', () => {
            signInWithGoogle();
        });
    }
} catch(e) {
    console.error('Button setup error:', e);
}

// ==================== PWA INSTALL ====================
let deferredPrompt;
const installBtnAuth = document.getElementById('install-btn-auth');
const installBtnApp = document.getElementById('install-btn-app');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Show install buttons
    if (installBtnAuth) installBtnAuth.classList.remove('hidden');
    if (installBtnApp) installBtnApp.classList.remove('hidden');
});

function handleInstallClick() {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            showToast('App installed! 🎉');
        }
        deferredPrompt = null;
        // Hide install buttons
        if (installBtnAuth) installBtnAuth.classList.add('hidden');
        if (installBtnApp) installBtnApp.classList.add('hidden');
    });
}

if (installBtnAuth) installBtnAuth.addEventListener('click', handleInstallClick);
if (installBtnApp) installBtnApp.addEventListener('click', handleInstallClick);

// Hide button if app is already installed
window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installBtnAuth) installBtnAuth.classList.add('hidden');
    if (installBtnApp) installBtnApp.classList.add('hidden');
    showToast('App installed successfully! 🎉');
});

// Plain-language messages for Firebase auth errors (v6.1.0). The raw text
// read like "Firebase: Error (auth/invalid-credential)."
function friendlyAuthError(error) {
    const code = (error && error.code) || '';
    const map = {
        'auth/invalid-credential':      'That email and password don\'t match. Check them, or tap "Forgot password?".',
        'auth/wrong-password':          'That email and password don\'t match. Check them, or tap "Forgot password?".',
        'auth/user-not-found':          'That email and password don\'t match. Check them, or tap "Forgot password?".',
        'auth/invalid-email':           'That doesn\'t look like an email address.',
        'auth/missing-password':        'Enter your password.',
        'auth/email-already-in-use':    'There\'s already a Plany account for that email. Log in instead, or use "Forgot password?".',
        'auth/weak-password':           'Choose a password with at least 6 characters.',
        'auth/too-many-requests':       'Too many attempts. Wait a few minutes, or reset your password.',
        'auth/user-disabled':           'This account has been turned off. Contact support.',
        'auth/network-request-failed':  'Can\'t reach Plany. Check your internet connection and try again.',
        'auth/popup-closed-by-user':    'Sign-in was cancelled.',
        'auth/popup-blocked':           'Your browser blocked the sign-in window. Allow pop-ups for plany.work and try again.',
        'auth/unauthorized-domain':     'Sign-in isn\'t allowed from this address. Open Plany at plany.work.',
        'auth/missing-email':           'Enter your email address first.'
    };
    return map[code] || 'Something went wrong signing in. Please try again.';
}
function showAuthError(msg, ok = false) {
    elements.authError.textContent = msg;
    elements.authError.classList.toggle('auth-ok', !!ok);
    elements.authError.classList.remove('hidden');
}

// Forgot password
document.getElementById('forgot-password-link')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('login-email')?.value || '').trim();
    if (!email) { showAuthError('Type your email address above, then tap "Forgot password?" again.'); document.getElementById('login-email')?.focus(); return; }
    try {
        await auth.sendPasswordResetEmail(email);
    } catch (error) {
        // Don't reveal whether an account exists; only surface fixable input errors.
        if (error.code === 'auth/invalid-email' || error.code === 'auth/network-request-failed' || error.code === 'auth/too-many-requests') {
            showAuthError(friendlyAuthError(error)); return;
        }
    }
    showAuthError(`If there's a Plany account for ${email}, a password-reset link is on its way. Check your inbox and spam folder.`, true);
});

// Email/Password Login
elements.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    showLoading();
    try {
        await auth.signInWithEmailAndPassword(email, password);
        elements.authError.classList.add('hidden');
    } catch (error) {
        showAuthError(friendlyAuthError(error));
        hideLoading();
    }
});

// Email/Password Register
elements.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    showLoading();
    try {
        const { user } = await auth.createUserWithEmailAndPassword(email, password);
        await user.updateProfile({ displayName: name });
        // Proves the email is theirs -- needed before a colleague's shared AI
        // key can be used, since those grants are made by email.
        user.sendEmailVerification().catch(err => console.warn('sendEmailVerification:', err.message));
        
        await db.collection('users').doc(user.uid).set({
            name,
            email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        elements.authError.classList.add('hidden');
    } catch (error) {
        showAuthError(friendlyAuthError(error));
        hideLoading();
    }
});

// Toggle Forms
elements.showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    elements.loginForm.classList.add('hidden');
    elements.registerForm.classList.remove('hidden');
    elements.authError.classList.add('hidden');
});

elements.showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    elements.registerForm.classList.add('hidden');
    elements.loginForm.classList.remove('hidden');
    elements.authError.classList.add('hidden');
});

// Logout
// v6.0.2: sign-out removes this account's secrets from the device (AI keys,
// Microsoft/Moodle tokens). Before, they stayed in localStorage until a
// DIFFERENT account signed in -- a problem on a shared classroom computer.
// The AI key comes back automatically from the account backup on next login.
function signOutAndClear() {
    clearAccountSecrets();
    try { sessionStorage.clear(); } catch (_) {}
    return auth.signOut();
}
elements.logoutBtn.addEventListener('click', signOutAndClear);
elements.logoutBtnSettings?.addEventListener('click', signOutAndClear);

