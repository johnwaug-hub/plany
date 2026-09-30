// PLANY - Main Application v6.9.0
// GENERATED FILE -- edit the feature files in src/app/ and run `npm run build`.
// (public/js/app.js is those files joined in order; `npm test` fails if it is stale.)
// ==================================================

// Service Worker Update Handler - ensures fresh content
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
        console.log('SW registered:', registration.scope);
        
        // An update that finished installing in an earlier visit is still
        // waiting for the teacher's go-ahead -- offer it again.
        if (registration.waiting && navigator.serviceWorker.controller) showUpdateAvailable();

        // Check for updates immediately
        registration.update();
        
        // Check for updates every 5 minutes
        setInterval(() => {
            registration.update();
        }, 5 * 60 * 1000);
        
        // Handle updates
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            console.log('New service worker found, installing...');
            
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New content available - prompt user to refresh
                    console.log('New version available!');
                    showUpdateAvailable();
                }
            });
        });
    }).catch((error) => {
        console.log('SW registration failed:', error);
    });
    
    // Reload only when the teacher asked for the update (v6.0.2). The first
    // visit also fires controllerchange (null -> worker) and used to reload
    // the page for no reason.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!window._planyUpdateRequested) return;
        console.log('New service worker activated, reloading...');
        window.location.reload();
    });
}

// Show update notification
function showUpdateAvailable() {
    if (document.getElementById('update-banner')) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', showUpdateAvailable, { once: true }); return; }
    const updateBanner = document.createElement('div');
    updateBanner.id = 'update-banner';
    updateBanner.innerHTML = `
        <span>🔄 New version available!</span>
        <button onclick="applyUpdate()">Update Now</button>
        <button onclick="this.parentElement.remove()">Later</button>
    `;
    updateBanner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #9D4EDD 0%, #FF6B9D 100%);
        color: white;
        padding: 12px 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 15px;
        z-index: 9999;
        font-weight: 500;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    updateBanner.querySelectorAll('button').forEach(btn => {
        btn.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.4);
            color: white;
            padding: 6px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
        `;
    });
    document.body.prepend(updateBanner);
}

// Apply update - skip waiting and reload
function applyUpdate() {
    window._planyUpdateRequested = true;
    navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration && registration.waiting) {
            // controllerchange (above) reloads once the new worker takes over
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            setTimeout(() => window.location.reload(), 4000); // safety net
        } else {
            window.location.reload();
        }
    }).catch(() => window.location.reload());
}


// ── Client error reporting (v6.3.0) ────────────────────────────────────
// Uncaught errors are written to the top-level clientErrors collection
// (create-only for signed-in users; readable only in the Firebase console),
// so problems show up before a teacher has to report them. At most 10 per
// page load, each distinct message once.
const _reportedErrors = new Set();
function reportClientError(kind, message, stack) {
    try {
        if (typeof db === 'undefined' || !currentUser) return;
        const msg = String(message || 'Unknown error').slice(0, 500);
        if (_reportedErrors.has(msg) || _reportedErrors.size >= 10) return;
        if (/ResizeObserver loop|Script error\.?$|ServiceWorker/i.test(msg)) return;   // browser noise
        _reportedErrors.add(msg);
        db.collection('clientErrors').add({
            uid: currentUser.uid,
            kind,
            message: msg,
            stack: String(stack || '').slice(0, 2000),
            version: (document.querySelector('.nav-version')?.textContent || '').trim(),
            view: document.querySelector('.view.active')?.id || '',
            ua: navigator.userAgent.slice(0, 300),
            at: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
    } catch (_) { /* never let error reporting throw */ }
}
window.addEventListener('error', (e) => reportClientError('error', e.message, e.error && e.error.stack));
window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    reportClientError('promise', (r && r.message) || String(r), r && r.stack);
});

// Global State
let currentUser = null;
let currentDate = new Date();
let currentWeekStart = null; // Will be set after getWeekStart is defined
let currentDayDate = new Date();   // Tracks the currently-viewed day
let classes = [];
let lessons = [];
let events = [];
let techTools = []; // classroom technology tools (used by sub day planner)
let subDays = {};          // { "2026-03-15": { ...subDayData } }
let subDayDefaults = {};   // persistent defaults loaded from Firestore
let subClassDefaults = {}; // per-class defaults: { [classId]: { instructions, materials, notes } }
let units = [];
let students = [];
let assignments = [];
let attendance = {};       // { "classId_date": { studentId: status } }
let communications = [];

// AI settings — read from localStorage so all AI features can access them
// immediately. `provider` picks which AI service every feature calls
// (Anthropic Claude, OpenAI, or Google Gemini); each provider keeps its own
// key in storage (ai_key_<provider>) so switching providers never wipes out
// a key you already entered for another one. The very first read for
// Anthropic transparently migrates the old single-key storage name used
// before multi-provider support existed, so nobody has to re-paste a key
// they already saved.
const aiSettings = {
    get provider()   { return localStorage.getItem('ai_provider') || 'anthropic'; },
    set provider(v)  { localStorage.setItem('ai_provider', v); },
    get apiKey() {
        const p = aiSettings.provider;
        const keyed = localStorage.getItem(`ai_key_${p}`);
        if (keyed) return keyed;
        if (p === 'anthropic') {
            const legacy = localStorage.getItem('anthropic_api_key');
            if (legacy) { localStorage.setItem('ai_key_anthropic', legacy); return legacy; }
        }
        return '';
    },
    set apiKey(v)    { localStorage.setItem(`ai_key_${aiSettings.provider}`, v || ''); },
    get grade()      { return localStorage.getItem('ai_packet_grade')    || '1'; },
    get teacherName(){ return localStorage.getItem('ai_teacher_name')    || ''; }
};

// Per-provider connection details. Every AI feature in Plany sends one of
// two "tiers" of request: `quality` for the harder generation tasks (student
// packets, pacing-guide parsing, image scans) and `fast` for cheap/bulk work
// (lesson fill, quick JSON extraction) -- mirroring the Sonnet/Haiku split
// Plany always used with Anthropic, now available across all three
// providers so switching providers doesn't change how any feature behaves.
const AI_PROVIDERS = {
    anthropic: {
        label: 'Anthropic Claude',
        keyPlaceholder: 'sk-ant-api03-…',
        keyLooksValid: (k) => k.startsWith('sk-ant-'),
        signupUrl: 'https://console.anthropic.com',
        models: { quality: 'claude-sonnet-4-6', fast: 'claude-haiku-4-5-20251001' }
    },
    openai: {
        label: 'OpenAI (ChatGPT)',
        keyPlaceholder: 'sk-…',
        keyLooksValid: (k) => k.startsWith('sk-'),
        signupUrl: 'https://platform.openai.com/api-keys',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        models: { quality: 'gpt-5.5', fast: 'gpt-5.4-mini' }
    },
    gemini: {
        label: 'Google Gemini',
        keyPlaceholder: 'AIza…',
        keyLooksValid: (k) => k.startsWith('AIza'),
        signupUrl: 'https://aistudio.google.com/apikey',
        // Gemini exposes a fully OpenAI-compatible endpoint, so the exact
        // same request/response handling used for OpenAI works here too --
        // only the base URL, key, and model names differ.
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        models: { quality: 'gemini-3.5-flash', fast: 'gemini-3.1-flash-lite' }
    }
};

// ── Shared AI Key Access ──────────────────────────────────────────────
// A teacher can grant other Plany users (looked up by username or email)
// permission to use their AI key, so those users get working AI features
// without ever entering a key of their own. `incomingKeyShare` is resolved
// once per session (checkIncomingKeyShare, called after login) and is what
// every AI feature actually uses when the signed-in user has no key saved.
// v6.1.0: the shared key itself never reaches the grantee's browser any more.
// incomingKeyShare only says WHO shared and WHICH provider; the aiProxy Cloud
// Function looks the key up server-side after checking the grant.
let incomingKeyShare = null;   // { grantId, adminUid, adminName, provider } | null
let myKeyGrants = [];          // grants *I* have handed out, for the Settings panel

function sharedKeyOptedOut() {
    return localStorage.getItem('ai_ignore_shared_key') === '1';
}

// The provider + key every AI feature should actually use: your own key if
// you've saved one, otherwise a key someone has shared with you.
function escapeHtmlForKeyShare(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

function getEffectiveAiConfig() {
    if (aiSettings.apiKey) return { provider: aiSettings.provider, apiKey: aiSettings.apiKey, shared: false };
    if (!sharedKeyOptedOut() && incomingKeyShare && incomingKeyShare.adminUid) {
        return { provider: incomingKeyShare.provider, apiKey: '', shared: true,
                 sharedFromUid: incomingKeyShare.adminUid, sharedByName: incomingKeyShare.adminName };
    }
    return { provider: aiSettings.provider, apiKey: '', shared: false };
}

function hasEffectiveAiKey() {
    const cfg = getEffectiveAiConfig();
    return !!(cfg.apiKey || cfg.shared);
}

// ── AI Feature Gating ──────────────────────────────────────────────────
// Every AI-powered control in the app is hidden/locked unless an effective
// key (own or shared) is available. New AI features just get their element
// id added to one of these two lists.
const AI_GATED_ACCORDION_IDS = ['accord-scan', 'accord-ai-fill', 'accord-quiz', 'accord-smart-import'];
const AI_GATED_ELEMENT_IDS = ['newsletter-year-btn', 'newsletter-month-btn', 'newsletter-week-btn', 'anchor-charts-week-btn', 'sub-ai-section', 'curgen-open-btn', 'diffgen-open-btn'];

function applyAiFeatureGating() {
    const unlocked = hasEffectiveAiKey();

    AI_GATED_ACCORDION_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('ai-locked', !unlocked);
        if (!unlocked) el.open = false;
    });
    AI_GATED_ELEMENT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !unlocked);
    });

    const banner = document.getElementById('ai-key-required-banner');
    if (banner) banner.classList.toggle('hidden', unlocked);

    const badge = document.getElementById('ai-shared-key-badge');
    if (badge) {
        const cfg = getEffectiveAiConfig();
        badge.classList.toggle('hidden', !cfg.shared);
        const textEl = document.getElementById('ai-shared-key-badge-text');
        if (textEl && cfg.shared) textEl.textContent = `🔗 Using ${cfg.sharedByName || 'a colleague'}'s shared AI key`;
        // v6.1.0: the proxy only honours a shared key for a verified email.
        const needsVerify = cfg.shared && currentUser && !currentUser.emailVerified &&
            !(currentUser.providerData || []).some(p => p.providerId === 'google.com');
        let vBtn = document.getElementById('ai-verify-email-btn');
        if (needsVerify && !vBtn) {
            vBtn = document.createElement('button');
            vBtn.type = 'button'; vBtn.id = 'ai-verify-email-btn'; vBtn.className = 'btn btn-primary btn-sm';
            vBtn.textContent = 'Send verification email';
            vBtn.addEventListener('click', sendMyVerificationEmail);
            badge.appendChild(vBtn);
        }
        if (vBtn) vBtn.classList.toggle('hidden', !needsVerify);
        if (textEl && needsVerify) textEl.textContent += ' — verify your email to start using it';
    }
}

async function sendMyVerificationEmail() {
    if (!currentUser) return;
    try {
        await currentUser.reload();
        if (currentUser.emailVerified) { showToast('✅ Your email is already verified. Reload Plany to use the shared key.'); applyAiFeatureGating(); return; }
        await currentUser.sendEmailVerification();
        showToast(`📧 Verification email sent to ${currentUser.email}. Open the link, then reload Plany.`);
    } catch (e) {
        showToast(e.code === 'auth/too-many-requests' ? 'A verification email was sent recently. Check your inbox and spam folder.' : 'Could not send the email. Try again in a minute.');
    }
}

function toggleIgnoreSharedKey() {
    const opted = sharedKeyOptedOut();
    localStorage.setItem('ai_ignore_shared_key', opted ? '0' : '1');
    applyAiFeatureGating();
    showToast(opted ? '🔗 Using the shared key again' : 'Stopped using the shared key');
}

// True only for a key shaped like the provider's real keys. Guards every
// place a key gets saved or backed up: the key field is type="password", so
// a browser password manager can autofill the Plany LOGIN password into it,
// and one Save click would then push that junk to the account backup and
// break AI on every other device.
function aiKeyLooksValid(providerId, key) {
    const p = AI_PROVIDERS[providerId] || AI_PROVIDERS.anthropic;
    return !!key && p.keyLooksValid(key.trim());
}

// ── Sync my shared-key doc so anyone I've granted access to can use it ──
// (This also doubles as this account's cloud backup of its own key --
// restoreAiKeyFromCloud() below reads the same doc to recover from a wiped
// device, so every Save Key already leaves a way back in.)
// v6.1.0: the key lives in aiKeys/{uid}, which only its owner can read (and
// the aiProxy function, server-side). apiKeyShares/{uid} keeps only the
// provider + display name that grantees need, never the key itself.
async function syncMySharedKeyDoc() {
    if (!currentUser || !aiSettings.apiKey) return;
    if (!aiKeyLooksValid(aiSettings.provider, aiSettings.apiKey)) return; // never back up junk
    try {
        await db.collection('aiKeys').doc(currentUser.uid).set({
            provider: aiSettings.provider,
            apiKey: aiSettings.apiKey,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('apiKeyShares').doc(currentUser.uid).set({
            provider: aiSettings.provider,
            apiKey: firebase.firestore.FieldValue.delete(),
            adminName: (userProfile && userProfile.username) || currentUser.displayName || currentUser.email,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) { console.warn('syncMySharedKeyDoc:', e.message); }
}

// Reads this account's key backup: aiKeys/{uid}, or the pre-v6.1.0 copy in
// apiKeyShares/{uid} (which is then moved to aiKeys and scrubbed).
async function readMyAiKeyBackup() {
    const own = await db.collection('aiKeys').doc(currentUser.uid).get().catch(() => null);
    if (own && own.exists && own.data().apiKey) return own.data();
    const legacy = await db.collection('apiKeyShares').doc(currentUser.uid).get().catch(() => null);
    const d = legacy && legacy.exists ? legacy.data() : null;
    if (d && d.apiKey && d.provider && aiKeyLooksValid(d.provider, d.apiKey)) {
        try {
            await db.collection('aiKeys').doc(currentUser.uid).set({ provider: d.provider, apiKey: d.apiKey, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            await db.collection('apiKeyShares').doc(currentUser.uid).update({ apiKey: firebase.firestore.FieldValue.delete() });
        } catch (e) { console.warn('AI key backup migration:', e.message); }
        return { provider: d.provider, apiKey: d.apiKey };
    }
    return null;
}

// ── Restore this account's own AI key from its cloud backup ──────────────
// Local storage (browser localStorage, or a native app's WebView storage)
// isn't durable -- it can be wiped by clearing browser data, switching
// browsers/devices, or by the OS reclaiming storage inside an installed
// PWA/native app. Since every Save Key already writes a copy to this
// account's apiKeyShares/{uid} doc (used for the "share my key" feature),
// we can use that same doc to silently restore a key on any device that
// has none saved yet, right after login -- without ever overwriting a key
// that's already present locally.
// v6.3.2: the account backup is the source of truth. It changes only when you
// click Save Key somewhere, so it always holds your most recently saved key.
// Before, a device with an OLD key kept it (it "looked real") and then pushed
// it back into the backup on login, so the backup flipped between the old
// and new key depending on which device signed in last -- "API key is
// invalid" on the classroom board.
async function restoreAiKeyFromCloud() {
    if (!currentUser) return;
    try {
        const data = await readMyAiKeyBackup();
        if (!data || !data.apiKey || !data.provider) return;
        if (!aiKeyLooksValid(data.provider, data.apiKey)) return;
        const localKey = localStorage.getItem(`ai_key_${data.provider}`) || '';
        if (localKey === data.apiKey && aiSettings.provider === data.provider) return;   // already in step
        localStorage.setItem('ai_provider', data.provider);
        localStorage.setItem(`ai_key_${data.provider}`, data.apiKey);
        console.log('AI key updated from account backup.');
        applyAiFeatureGating();
        const providerEl = document.getElementById('ai-provider-select');
        const keyEl = document.getElementById('ai-api-key');
        if (providerEl) providerEl.value = aiSettings.provider;
        if (keyEl) keyEl.value = aiSettings.apiKey;
        if (typeof window._refreshAiKeyStatus === 'function') window._refreshAiKeyStatus();
    } catch (e) { console.warn('restoreAiKeyFromCloud:', e.message); }
}

// ── Make sure this account's key backup exists and is current ────────────
// syncMySharedKeyDoc() only ever ran on an explicit "Save Key" click, so any
// account whose key was saved before that call existed has NO cloud copy at
// all. That is why AI worked only on the device where the key was originally
// typed: restoreAiKeyFromCloud() had nothing to restore from. Backfilling on
// login means whichever device still holds the key repairs the backup for
// every other device, and a key rotated locally keeps the backup in step.
async function ensureAiKeyCloudBackup() {
    if (!currentUser || !aiKeyLooksValid(aiSettings.provider, aiSettings.apiKey)) return;
    try {
        const d = await readMyAiKeyBackup();
        // Only create a backup that doesn't exist yet. Replacing an existing
        // one is Save Key's job -- a device must never overwrite the backup
        // with whatever (possibly old) key it happens to hold.
        if (d && d.apiKey && aiKeyLooksValid(d.provider, d.apiKey)) return;
        await syncMySharedKeyDoc();
        console.log('AI key cloud backup written for this account.');
    } catch (e) { console.warn('ensureAiKeyCloudBackup:', e.message); }
}

// ── Check whether anyone has shared their key with me ────────────────────
async function checkIncomingKeyShare() {
    if (!currentUser) return;
    try {
        const snap = await db.collection('apiKeyGrants')
            .where('granteeEmail', '==', (currentUser.email || '').toLowerCase())
            .where('status', '==', 'active')
            .get();
        if (snap.empty) { incomingKeyShare = null; applyAiFeatureGating(); return; }
        const grants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        grants.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        const grant = grants[0];
        const shareDoc = await db.collection('apiKeyShares').doc(grant.adminUid).get();
        incomingKeyShare = shareDoc.exists
            ? { grantId: grant.id, adminUid: grant.adminUid, adminName: grant.adminName || shareDoc.data().adminName, provider: shareDoc.data().provider || 'anthropic' }
            : null;
    } catch (e) {
        console.warn('checkIncomingKeyShare:', e.message);
        incomingKeyShare = null;
    }
    applyAiFeatureGating();
}

// ── "Share My AI Key" panel (Settings) ────────────────────────────────
async function loadMyKeyGrants() {
    if (!currentUser) return;
    try {
        const snap = await db.collection('apiKeyGrants').where('adminUid', '==', currentUser.uid).get();
        myKeyGrants = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(g => g.status === 'active');
        renderMyKeyGrants();
    } catch (e) { console.warn('loadMyKeyGrants:', e.message); }
}

function renderMyKeyGrants() {
    const list = document.getElementById('key-share-list');
    if (!list) return;
    if (myKeyGrants.length === 0) {
        list.innerHTML = '<p style="font-size:0.8rem;opacity:0.6;">You haven\'t shared your key with anyone yet.</p>';
        return;
    }
    list.innerHTML = myKeyGrants.map(g => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:var(--radius-sm);margin-bottom:6px;">
            <span style="font-size:0.85rem;">👤 ${escapeHtmlForKeyShare(g.granteeUsername || g.granteeEmail)}</span>
            <button type="button" class="btn btn-icon-sm" title="Revoke access" onclick="revokeKeyGrant('${escapeHtmlForKeyShare(g.id)}')">✕</button>
        </div>
    `).join('');
}

async function grantKeyAccess() {
    const input = document.getElementById('key-share-input');
    const statusEl = document.getElementById('key-share-status');
    const raw = input?.value?.trim();
    if (!raw) { if (statusEl) statusEl.textContent = 'Enter a username or email.'; return; }
    if (!aiSettings.apiKey) { if (statusEl) statusEl.textContent = '❌ Add your own AI key above before sharing it.'; return; }
    if (statusEl) statusEl.innerHTML = '<span class="scan-spinner"></span> Looking up teacher…';

    try {
        let email = raw.toLowerCase();
        let username = raw;
        if (!raw.includes('@')) {
            const snap = await db.collection('users').where('username', '==', raw).limit(1).get();
            if (snap.empty) { if (statusEl) statusEl.textContent = '❌ No Plany account found with that username. Try their email instead.'; return; }
            const d = snap.docs[0].data();
            email = (d.email || '').toLowerCase();
            username = d.username || raw;
            if (!email) { if (statusEl) statusEl.textContent = '❌ That account has no email on file.'; return; }
        }

        if (email === (currentUser.email || '').toLowerCase()) { if (statusEl) statusEl.textContent = '❌ You can\'t share with yourself.'; return; }

        await syncMySharedKeyDoc();

        const grantId = currentUser.uid + '_' + email;
        await db.collection('apiKeyGrants').doc(grantId).set({
            adminUid: currentUser.uid,
            adminEmail: currentUser.email,
            adminName: (userProfile && userProfile.username) || currentUser.displayName || currentUser.email,
            granteeEmail: email,
            granteeUsername: username,
            status: 'active',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (statusEl) statusEl.innerHTML = `✅ Shared! ${username} can now use your AI key.`;
        if (input) input.value = '';
        loadMyKeyGrants();
    } catch (e) {
        console.error('grantKeyAccess:', e);
        if (statusEl) statusEl.textContent = '❌ Error: ' + e.message;
    }
}

async function revokeKeyGrant(grantId) {
    if (!await planyConfirm('Revoke this person\'s access to your AI key?')) return;
    try {
        await db.collection('apiKeyGrants').doc(grantId).delete();
        showToast('Access revoked');
        loadMyKeyGrants();
    } catch (e) { showToast('Error revoking access'); }
}

// Sends one user-role prompt (optionally with an image) to whichever AI
// provider is selected in Settings and returns the full text response.
// Anthropic uses its own Messages API shape (x-api-key header, top-level
// `system`-less single message, response at content[0].text); OpenAI and
// Gemini both speak the OpenAI Chat Completions shape (Bearer auth,
// choices[0].message.content), so one branch covers both of them.
// ── Where AI requests actually go ───────────────────────────────────────
// Calling the provider straight from the browser works at home but dies on
// a school network: districts (TUSD included) filter api.anthropic.com at
// the edge, so the request never leaves the building and every AI feature
// fails with a bare "Failed to fetch". So each request goes first to our own
// origin at /api/ai, which a Hosting rewrite forwards to the aiProxy Cloud
// Function -- the browser only ever talks to plany.work, which the district
// already allows.
//
// If that route isn't reachable (function not deployed yet, rewrite missing
// so the catch-all serves index.html, or the proxy itself is down) we fall
// back to calling the provider directly, so AI keeps working exactly as it
// did before on networks where the direct call is fine. The verdict is
// cached per page load so we only pay the failed hop once.
// Inside the Capacitor apps a relative URL would hit the app's own local file
// server, so native builds call the live site's proxy by absolute URL.
const AI_PROXY_PATH = (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
    ? 'https://plany.work/api/ai' : '/api/ai';
let _aiProxyAvailable = null;   // null = untried, true = works, false = fall back

function _aiDirectRequest(providerId, apiKey, payload) {
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.anthropic;
    const isAnthropic = providerId === 'anthropic';
    const url = isAnthropic ? 'https://api.anthropic.com/v1/messages' : provider.baseUrl;
    const headers = isAnthropic
        ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
        : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
}

// v6.3.2: if the provider rejects this device's own key, check the account
// backup; when it holds a different key, switch to it and retry once.
async function aiRequest(providerId, apiKey, payload, shareFromUid = null) {
    const resp = await _aiRequestOnce(providerId, apiKey, payload, shareFromUid);
    if (!apiKey || resp.status !== 401 || !currentUser) return resp;
    const body = await resp.clone().json().catch(() => null);
    const msg = (body && body.error && body.error.message) || '';
    if (/sign in to Plany/i.test(msg)) return resp;          // our proxy's own sign-in check, not the key
    try {
        const backup = await readMyAiKeyBackup();
        if (backup && backup.apiKey && backup.apiKey !== apiKey && backup.provider === providerId &&
            aiKeyLooksValid(backup.provider, backup.apiKey)) {
            localStorage.setItem(`ai_key_${providerId}`, backup.apiKey);
            const keyEl = document.getElementById('ai-api-key');
            if (keyEl && aiSettings.provider === providerId) keyEl.value = backup.apiKey;
            if (typeof window._refreshAiKeyStatus === 'function') window._refreshAiKeyStatus();
            showToast('🔑 This device had an old AI key. Switched to the key saved in your account.');
            return _aiRequestOnce(providerId, backup.apiKey, payload, null);
        }
    } catch (e) { console.warn('AI key recovery:', e.message); }
    resp._planyKeyRejected = true;
    return resp;
}

async function _aiRequestOnce(providerId, apiKey, payload, shareFromUid = null) {
    // A shared key only exists server-side, so it can only go via the proxy.
    const canGoDirect = !!apiKey;
    if (_aiProxyAvailable === false && canGoDirect) return _aiDirectRequest(providerId, apiKey, payload);

    // v6.1.0: the proxy only serves signed-in Plany users.
    let idToken = '';
    try { idToken = currentUser ? await currentUser.getIdToken() : ''; } catch (_) {}

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + idToken,
        'x-plany-provider': providerId
    };
    if (apiKey) headers['x-plany-key'] = apiKey;
    else if (shareFromUid) headers['x-plany-share-from'] = shareFromUid;

    try {
        const resp = await fetch(AI_PROXY_PATH, { method: 'POST', headers, body: JSON.stringify(payload) });

        // A missing rewrite means the `**` catch-all served index.html with a
        // 200, so "did we get HTML back with a 200/404" is the real test.
        // (A 5xx HTML page is a real failure -- falling back would send the
        // whole prompt a second time.)
        const ct = resp.headers.get('content-type') || '';
        if (resp.status === 404 || (resp.ok && ct.includes('text/html'))) {
            if (_aiProxyAvailable === null) console.warn('AI proxy /api/ai not live — calling the provider directly.');
            _aiProxyAvailable = false;
            if (canGoDirect) return _aiDirectRequest(providerId, apiKey, payload);
            throw new Error('The shared AI key is unavailable right now. Try again in a minute.');
        }

        _aiProxyAvailable = true;
        return resp;
    } catch (e) {
        if (!canGoDirect) throw e;
        if (_aiProxyAvailable === null) console.warn('AI proxy unreachable (' + e.message + ') — calling the provider directly.');
        _aiProxyAvailable = false;
        return _aiDirectRequest(providerId, apiKey, payload);
    }
}

// Turn a failed AI response into a sentence a teacher can act on (v6.3.1).
// Before, anything without error.message showed as a bare "API error 403".
function aiErrorMessage(body, status, label) {
    const e = body && body.error;
    const keyRejected = status === 401 && e && typeof e === 'object' &&
        (e.type === 'authentication_error' || e.code === 'invalid_api_key' || /api key/i.test(e.message || ''));
    if (keyRejected) return `${label} says your API key isn't valid any more. Paste your current key from ${label === 'Anthropic Claude' ? 'console.anthropic.com' : 'your provider'} in Settings → AI and click Save Key -- every device picks it up.`;
    if (e && typeof e === 'object' && e.message) return e.message;
    if (e === 'origin_not_allowed') return 'AI only works when Plany is opened at plany.work. Open https://plany.work and try again.';
    if (status === 401) return 'Please sign in to Plany again to use AI features.';
    if (status === 403) return `${label} refused the request (403). Check that your API key is active in Settings → AI.`;
    if (status === 429) return `${label} is busy or your usage limit was reached. Wait a minute and try again.`;
    if (status >= 500) return `${label} is having trouble right now (${status}). Try again in a minute.`;
    return `${label} API error ${status}`;
}

async function callAIText({ prompt, tier = 'fast', maxTokens = 2000, imageBase64 = null, imageMediaType = null }) {
    const cfg = getEffectiveAiConfig();
    const providerId = cfg.provider;
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.anthropic;
    const apiKey = cfg.apiKey;
    const shareFrom = cfg.shared ? cfg.sharedFromUid : null;
    if (!apiKey && !shareFrom) throw new Error(`No ${provider.label} API key set. Add one in Settings → AI, or ask a colleague to share theirs.`);
    const model = provider.models[tier] || provider.models.fast;

    if (providerId === 'anthropic') {
        const content = imageBase64
            ? [{ type: 'image', source: { type: 'base64', media_type: imageMediaType, data: imageBase64 } }, { type: 'text', text: prompt }]
            : prompt;
        const resp = await aiRequest(providerId, apiKey, { model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }, shareFrom);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(aiErrorMessage(err, resp.status, provider.label));
        }
        const data = await resp.json();
        if (data.stop_reason === 'max_tokens') console.warn('callAIText: response hit max_tokens and may be truncated');
        return data.content?.[0]?.text || '';
    }

    const content = imageBase64
        ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${imageMediaType};base64,${imageBase64}` } }]
        : prompt;
    const resp = await aiRequest(providerId, apiKey, { model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }, shareFrom);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(aiErrorMessage(err, resp.status, provider.label));
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
}

// Streaming variant of callAIText -- calls onDelta(chunkText, fullTextSoFar)
// as tokens arrive, used by the newsletter generator so text appears live
// instead of all at once. Anthropic's SSE events and OpenAI/Gemini's SSE
// events use different JSON shapes for each chunk, so that's the one thing
// that branches; the read loop itself is shared.
async function callAITextStream({ prompt, tier = 'quality', maxTokens = 2000, onDelta }) {
    const cfg = getEffectiveAiConfig();
    const providerId = cfg.provider;
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.anthropic;
    const apiKey = cfg.apiKey;
    const shareFrom = cfg.shared ? cfg.sharedFromUid : null;
    if (!apiKey && !shareFrom) throw new Error(`No ${provider.label} API key set. Add one in Settings → AI, or ask a colleague to share theirs.`);
    const model = provider.models[tier] || provider.models.quality;
    const isAnthropic = providerId === 'anthropic';

    const body = { model, max_tokens: maxTokens, stream: true, messages: [{ role: 'user', content: prompt }] };

    const resp = await aiRequest(providerId, apiKey, body, shareFrom);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(aiErrorMessage(err, resp.status, provider.label));
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let stopReason = null;
    const handleLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return;
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === '[DONE]') return;
        let evt;
        try { evt = JSON.parse(jsonStr); } catch (e) { return; }
        // v6.2.0: a mid-stream error (e.g. overloaded_error) used to be
        // ignored and the half-written text saved as a finished result.
        if (evt.type === 'error' || (evt.error && !evt.choices)) {
            throw new Error(evt.error?.message || 'The AI service stopped partway through. Please try again.');
        }
        if (isAnthropic) {
            if (evt.type === 'message_delta' && evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
        } else if (evt.choices?.[0]?.finish_reason) {
            stopReason = evt.choices[0].finish_reason;
        }
        const delta = isAnthropic
            ? (evt.type === 'content_block_delta' ? (evt.delta?.text || '') : '')
            : (evt.choices?.[0]?.delta?.content || '');
        if (delta) { full += delta; onDelta(delta, full); }
    };
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) handleLine(line);
    }
    if (buffer) handleLine(buffer);   // last event without a trailing newline

    if (!full.trim()) throw new Error('The AI returned an empty response. Please try again.');
    if (stopReason === 'max_tokens' || stopReason === 'length') {
        showToast('⚠️ The AI hit its length limit, so the end of this may be cut off. Check the last section.');
    }
    return full;
}
let settings = {
    schoolYear: '2025-2026',
    yearStart: '2025-08-05',
    yearEnd: '2026-05-22',
    breaks: [],
    background: 'classroom'
};

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({
    prompt: 'select_account'  // Always show account selector
});

// DOM Elements
const elements = {
    // Screens
    authScreen: document.getElementById('auth-screen'),
    appScreen: document.getElementById('app-screen'),
    
    // Auth
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    showRegister: document.getElementById('show-register'),
    showLogin: document.getElementById('show-login'),
    authError: document.getElementById('auth-error'),
    googleLoginBtn: document.getElementById('google-login-btn'),
    googleRegisterBtn: document.getElementById('google-register-btn'),
    
    // Header
    userName: document.getElementById('user-name'),
    logoutBtn: document.getElementById('logout-btn'),
    
    // Navigation
    navItems: document.querySelectorAll('.nav-item'),
    views: document.querySelectorAll('.view'),
    
    // Calendar
    calendarGrid: document.getElementById('calendar-grid'),
    currentMonth: document.getElementById('current-month'),
    prevMonth: document.getElementById('prev-month'),
    nextMonth: document.getElementById('next-month'),
    
    // Week
    weekContainer: document.getElementById('week-container'),
    currentWeek: document.getElementById('current-week'),
    prevWeek: document.getElementById('prev-week'),
    nextWeek: document.getElementById('next-week'),
    
    // Classes
    classesList: document.getElementById('classes-list'),
    addClassBtn: document.getElementById('add-class-btn'),
    
    // Settings
    schoolYear: document.getElementById('school-year'),
    saveYearBtn: null, // Removed - switching is automatic now
    breaksList: document.getElementById('breaks-list'),
    breakName: document.getElementById('break-name'),
    breakStart: document.getElementById('break-start'),
    breakEnd: document.getElementById('break-end'),
    addBreakBtn: document.getElementById('add-break-btn'),
    accountEmail: document.getElementById('account-email'),
    logoutBtnSettings: document.getElementById('logout-btn-settings'),
    
    // Modals
    lessonModal: document.getElementById('lesson-modal'),
    classModal: document.getElementById('class-modal'),
    dayModal: document.getElementById('day-modal'),
    
    // Lesson Form
    lessonForm: document.getElementById('lesson-form'),
    lessonId: document.getElementById('lesson-id'),
    lessonDate: document.getElementById('lesson-date'),
    lessonTitle: document.getElementById('lesson-title'),
    lessonClass: document.getElementById('lesson-class'),
    lessonSubject: document.getElementById('lesson-subject'),
    lessonDuration: document.getElementById('lesson-duration'),
    lessonStandards: document.getElementById('lesson-standards'),
    lessonLearningTarget: document.getElementById('lesson-learning-target'),
    lessonSuccessCriteria: document.getElementById('lesson-success-criteria'),
    lessonFlow: document.getElementById('lesson-flow'),
    lessonMaterials: document.getElementById('lesson-materials'),
    lessonActivities: document.getElementById('lesson-activities'),
    lessonAttachmentsList: document.getElementById('lesson-attachments-list'),
    lessonFileInput: document.getElementById('lesson-file-input'),
    addAttachmentBtn: document.getElementById('add-attachment-btn'),
    deleteLessonBtn: document.getElementById('delete-lesson-btn'),
    
    // Class Form
    classForm: document.getElementById('class-form'),
    classId: document.getElementById('class-id'),
    className: document.getElementById('class-name'),
    classSubject: document.getElementById('class-subject'),
    classRoom: document.getElementById('class-room'),
    deleteClassBtn: document.getElementById('delete-class-btn'),
    
    // Day Modal
    dayModalTitle: document.getElementById('day-modal-title'),
    dayLessons: document.getElementById('day-lessons'),
    addLessonToDay: document.getElementById('add-lesson-to-day'),
    
    // FAB
    
    // UI
    toast: document.getElementById('toast'),
    loading: document.getElementById('loading')
};

