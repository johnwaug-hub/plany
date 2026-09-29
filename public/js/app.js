// PLANY - Main Application v6.8.0
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

// ==================== UTILITY FUNCTIONS ====================

function formatDate(date) {
    // Use local date parts — toISOString() returns UTC which rolls to the
    // next day after 5pm in Arizona (UTC-7), causing off-by-one display bugs.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDisplayDate(date) {
    return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

function formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Convert 24hr time (HH:MM) to 12hr standard time (h:mm AM/PM)
// Also handles time ranges like "09:00-10:45"
function formatTime12hr(time24) {
    if (!time24) return '';
    
    // Check if it's a time range (contains hyphen with times on both sides)
    if (time24.includes('-') && time24.split('-').length === 2) {
        const [start, end] = time24.split('-');
        // Only treat as range if both parts look like times
        if (start.includes(':') && end.includes(':')) {
            return `${formatSingleTime12hr(start)}-${formatSingleTime12hr(end)}`;
        }
    }
    
    return formatSingleTime12hr(time24);
}

// Convert a single 24hr time to 12hr format
function formatSingleTime12hr(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.trim().split(':');
    const h = parseInt(hours, 10);
    if (isNaN(h)) return time24; // Return as-is if not a valid time
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes}${ampm}`;
}

// Normalize schedule[day] to always return an array of {start, end} objects
// Handles: string "09:00", object {start,end}, array [{start,end},...], falsy
function getTimeSlotsForDay(cls, day) {
    const raw = cls.schedule && cls.schedule[day];
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.filter(s => s && (s.start || s.end));
    }
    if (typeof raw === 'string') {
        const parts = raw.split('-');
        return [{ start: parts[0].trim(), end: parts[1]?.trim() || '' }];
    }
    if (typeof raw === 'object' && (raw.start || raw.end)) {
        return [{ start: raw.start || '', end: raw.end || '' }];
    }
    return [];
}

// Format a single slot as a display string
function formatTimeSlot(slot) {
    if (!slot) return '';
    const s = slot.start ? formatTime12hr(slot.start) : '';
    const e = slot.end   ? formatTime12hr(slot.end)   : '';
    return e ? s + '–' + e : s;
}

// Build a full time string for a class on a given day (all slots joined)
function buildTimeStr(cls, day) {
    const slots = getTimeSlotsForDay(cls, day);
    return slots.map(formatTimeSlot).filter(Boolean).join(' & ');
}

// Find a lesson matching a specific class, date, and slot index.
// slotIndex -1  = "spans all sessions" — matches every slot card for that class.
// slotIndex 0+  = specific session index.
// null/undefined (legacy) = slot 0 for backward compat.
// v6.5.0: for summaries/PDFs that show one line per class -- a class with
// several sessions on a day used to show only the first session's lesson.
// Returns the first lesson with every session's title joined by " / ".
function mergedLessonForClass(dayLessons, classId) {
    const list = dayLessons.filter(l => l.classId === classId)
        .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
    if (list.length <= 1) return list[0];
    return { ...list[0], title: list.map(l => l.title).filter(Boolean).join(' / ') };
}

function findLessonForSlot(dayLessons, classId, slotIndex) {
    // First: look for a span-all lesson (slotIndex === -1) — it wins for every slot
    const spanAll = dayLessons.find(l => l.classId === classId && l.slotIndex === -1);
    if (spanAll) return spanAll;
    // Then: look for a lesson specific to this slot
    return dayLessons.find(l => {
        if (l.classId !== classId) return false;
        const li = (l.slotIndex === undefined || l.slotIndex === null) ? 0 : l.slotIndex;
        return li === slotIndex;
    }) || null;
}

// Get the start time for a class on a given day (for sorting) — uses first slot
function getClassStartTime(cls, dayOfWeek) {
    const slots = getTimeSlotsForDay(cls, dayOfWeek);
    return slots.length > 0 && slots[0].start ? slots[0].start : '99:99';
}

// Sort classes by their start time for a given day
function sortClassesByTime(classesArr, dayOfWeek) {
    return [...classesArr].sort((a, b) => {
        const timeA = getClassStartTime(a, dayOfWeek);
        const timeB = getClassStartTime(b, dayOfWeek);
        return timeA.localeCompare(timeB);
    });
}

// Get the earliest scheduled day and time for a class (for Classes view sorting)
function getClassEarliestSchedule(cls) {
    if (!cls.schedule) return { day: 9, time: '99:99' };
    const dayOrder = { 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5 };
    let earliestDay = 9;
    let earliestTime = '99:99';
    for (const day of Object.keys(cls.schedule)) {
        const slots = getTimeSlotsForDay(cls, day);
        if (slots.length === 0) continue;
        const dayNum    = dayOrder[day] || 9;
        const startTime = slots[0].start || '99:99';
        if (dayNum < earliestDay || (dayNum === earliestDay && startTime < earliestTime)) {
            earliestDay  = dayNum;
            earliestTime = startTime;
        }
    }
    return { day: earliestDay, time: earliestTime };
}

// Sort classes by earliest scheduled day, then by time
function sortClassesBySchedule(classesArr) {
    return [...classesArr].sort((a, b) => {
        const schedA = getClassEarliestSchedule(a);
        const schedB = getClassEarliestSchedule(b);
        if (schedA.day !== schedB.day) return schedA.day - schedB.day;
        return schedA.time.localeCompare(schedB.time);
    });
}

// Returns the ISO week number (1-53) for a given date
function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum); // nearest Thursday
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Returns true if this class should appear on the given date,
// accounting for every-other-week scheduling.
// cls.everyOtherWeek — boolean
// cls.startingWeek   — 'A' (meets on odd ISO weeks) | 'B' (even ISO weeks)
function isClassActiveOnDate(cls, dateStr) {
    if (!cls.everyOtherWeek) return true; // normal weekly class
    const date = new Date(dateStr + 'T00:00:00');
    const isoWeek = getISOWeekNumber(date);
    const isOdd = isoWeek % 2 !== 0;
    return cls.startingWeek === 'B' ? !isOdd : isOdd; // 'A' = odd, 'B' = even
}

// Build a flat, time-sorted list of {cls, slotIndex, slot, startTime} entries for a day.
// Each slot of a multi-session class gets its own entry, sorted by its own start time.
function getSortedClassSlots(dayClasses, dow) {
    const entries = [];
    dayClasses.forEach(cls => {
        const slots = getTimeSlotsForDay(cls, dow);
        const slotCount = Math.max(slots.length, 1);
        for (let si = 0; si < slotCount; si++) {
            const slot = slots[si] || null;
            entries.push({
                cls,
                slotIndex: si,
                slot,
                slotCount,
                startTime: slot?.start || '99:99'
            });
        }
    });
    entries.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return entries;
}

// Returns the Monday that anchors the school week containing `date`.
// Sunday is treated as the FIRST day of its week (US school-calendar
// convention, matching the Sunday-first month grid and the Sun-Sat week
// columns) rather than the ISO tail of the previous week. With the old
// ISO rule, clicking "Today" on a Sunday jumped to the Mon-Fri week that
// had already ended and today's column was nowhere in the grid.
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();            // 0 = Sun ... 6 = Sat
    const diff = d.getDate() - day + 1; // Sun -> tomorrow's Monday; Mon-Sat -> this week's Monday
    return new Date(d.setDate(diff));
}

// Initialize currentWeekStart now that function is defined
currentWeekStart = getWeekStart(new Date());

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function isSameDay(date1, date2) {
    return formatDate(date1) === formatDate(date2);
}

// v6.5.0: each toast gets its full time on screen (a second toast used to
// vanish early on the first one's timer); longer messages stay longer.
let _toastTimer = null;
function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.remove('hidden');
    clearTimeout(_toastTimer);
    const ms = Math.min(8000, Math.max(3000, String(message).length * 60));
    _toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), ms);
}

function showLoading() {
    elements.loading.classList.remove('hidden');
}

function hideLoading() {
    elements.loading.classList.add('hidden');
}

// Count school days between two dates, excluding weekends and off-day events
// Check if a given dateStr (YYYY-MM-DD) falls on a holiday/break/no-school event
// Types that mean no school for students
const NO_SCHOOL_EVENT_TYPES = new Set([
    'break', 'holiday', 'no-school', 'grading', 'meeting', 'professional-learning'
]);
// Title keywords that mean "no school" when an event has no specific type.
// Whole-word matches only (v6.0.2): the old substring check let
// "Donuts with Dads Breakfast" match "break" and cancel every class that day.
const NO_SCHOOL_TITLE_RE = /\b(no school|breaks?|holidays?|grading day|professional learning|prof\. learning|planning day|induction|independence day|labor day|veterans?'? day|thanksgiving|martin luther king|mlk|rodeo|memorial day|juneteenth|school closed|non-student day)\b/;
const SCHOOL_DAY_EVENT_TYPES = new Set(['first-day', 'last-day', 'assembly', 'field-trip', 'testing']);
// A title that names something happening AT school is never a day off.
const SCHOOL_ACTIVITY_TITLE_RE = /\b(assembly|breakfast|lunch(eon)?|celebration|program|performance|parade|concert|potluck|fair|night|club)\b/;

function isNoSchoolEvent(event) {
    if (!event) return false;
    if (NO_SCHOOL_EVENT_TYPES.has(event.type)) return true;
    // These types are school happening as normal -- never a day off,
    // whatever the title says.
    if (SCHOOL_DAY_EVENT_TYPES.has(event.type)) return false;
    const t = (event.title || '').toLowerCase();
    if (SCHOOL_ACTIVITY_TITLE_RE.test(t)) return false;
    return NO_SCHOOL_TITLE_RE.test(t);
}

function isOffDay(dateStr) {
    // Dates after the last day of school are always off
    const lastDayEvent = events.find(e => e.type === 'last-day');
    if (lastDayEvent && lastDayEvent.startDate && dateStr > lastDayEvent.startDate) {
        return true;
    }
    // Dates before the first day of school are always off
    const firstDayEvent = events.find(e => e.type === 'first-day');
    if (firstDayEvent && firstDayEvent.startDate && dateStr < firstDayEvent.startDate) {
        return true;
    }
    return events.some(event => {
        if (!isNoSchoolEvent(event) || !event.startDate) return false;
        const end = event.endDate || event.startDate;
        return dateStr >= event.startDate && dateStr <= end;
    });
}

function countSchoolDaysLeft(startDate, endDate, eventsList) {
    let count = 0;
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    // v6.2.0: off days come from isNoSchoolEvent(), the single gatekeeper,
    // instead of a private copy of the rules that had drifted (it treated
    // the first and last day of school as days off and matched "break"
    // inside "Breakfast").
    const offDays = new Set();
    for (const event of (eventsList || [])) {
        if (!event || !event.startDate || !isNoSchoolEvent(event)) continue;
        const d = new Date(event.startDate + 'T00:00:00');
        const eventEnd = new Date((event.endDate || event.startDate) + 'T00:00:00');
        while (d <= eventEnd) {
            offDays.add(formatDate(d));
            d.setDate(d.getDate() + 1);
        }
    }
    
    // Count weekdays that aren't off days
    while (current <= end) {
        const dayOfWeek = current.getDay();
        const dateStr = formatDate(current);
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            if (!offDays.has(dateStr)) {
                count++;
            }
        }
        current.setDate(current.getDate() + 1);
    }
    
    return count;
}

function updateStats() {
    updateSchoolYearDisplay();
}

// Update School Year display on calendar
function updateSchoolYearDisplay() {
    // Update school year value
    const displayYear = document.getElementById('display-school-year');
    const displayStart = document.getElementById('display-year-start');
    const displayEnd = document.getElementById('display-year-end');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const breaksBanner = document.getElementById('breaks-banner');
    const breaksText = document.getElementById('breaks-text');
    
    if (displayYear) displayYear.textContent = settings.schoolYear || '2025-2026';
    
    // Find first day and last day events
    const firstDayEvent = events.find(e => e.type === 'first-day');
    const lastDayEvent = events.find(e => e.type === 'last-day');
    
    const yearStart = firstDayEvent ? firstDayEvent.startDate : null;
    const yearEnd = lastDayEvent ? lastDayEvent.startDate : null;
    
    // Format dates
    if (yearStart && displayStart) {
        const start = new Date(yearStart + 'T00:00:00');
        displayStart.textContent = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (displayStart) {
        displayStart.textContent = 'Not set';
    }
    
    if (yearEnd && displayEnd) {
        const end = new Date(yearEnd + 'T00:00:00');
        displayEnd.textContent = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (displayEnd) {
        displayEnd.textContent = 'Not set';
    }
    
    // Calculate progress
    if (yearStart && yearEnd && progressFill && progressText) {
        const start = new Date(yearStart + 'T00:00:00');
        const end = new Date(yearEnd + 'T23:59:59');
        // Normalize "now" to just the date (no time)
        const today = new Date();
        const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        if (now < start) {
            progressFill.style.width = '0%';
            progressText.textContent = 'Not started';
        } else if (now > end) {
            progressFill.style.width = '100%';
            progressText.textContent = 'Complete!';
        } else {
            const total = end - start;
            const elapsed = now - start;
            const percent = Math.round((elapsed / total) * 100);
            progressFill.style.width = percent + '%';
            progressText.textContent = percent + '% complete';
        }
        
        // Calculate school days left (excluding weekends and off days)
        const schoolDaysLeft = document.getElementById('school-days-left');
        if (schoolDaysLeft) {
            const daysLeft = countSchoolDaysLeft(now, end, events);
            if (now > end) {
                schoolDaysLeft.textContent = '';
            } else if (now < start) {
                const totalDays = countSchoolDaysLeft(start, end, events);
                schoolDaysLeft.textContent = `${totalDays} school days`;
            } else {
                schoolDaysLeft.textContent = `${daysLeft} school days left`;
            }
        }
    } else if (progressFill && progressText) {
        progressFill.style.width = '0%';
        progressText.textContent = 'Add First/Last Day events';
        const schoolDaysLeft = document.getElementById('school-days-left');
        if (schoolDaysLeft) schoolDaysLeft.textContent = '';
    }
    
    // Show upcoming or current break
    if (settings.breaks && settings.breaks.length > 0 && breaksBanner && breaksText) {
        const now = new Date();
        let upcomingBreak = null;
        let currentBreak = null;
        
        for (const brk of settings.breaks) {
            const brkStart = new Date(brk.start + 'T00:00:00');
            const brkEnd = new Date(brk.end + 'T23:59:59');
            
            if (now >= brkStart && now <= brkEnd) {
                currentBreak = brk;
                break;
            } else if (now < brkStart) {
                if (!upcomingBreak || brkStart < new Date(upcomingBreak.start + 'T00:00:00')) {
                    upcomingBreak = brk;
                }
            }
        }
        
        if (currentBreak) {
            const endDate = new Date(currentBreak.end + 'T00:00:00');
            breaksText.textContent = `🎉 Currently: ${currentBreak.name} (until ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
            breaksBanner.classList.remove('hidden');
        } else if (upcomingBreak) {
            const startDate = new Date(upcomingBreak.start + 'T00:00:00');
            const endDate = new Date(upcomingBreak.end + 'T00:00:00');
            breaksText.textContent = `Upcoming: ${upcomingBreak.name} (${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
            breaksBanner.classList.remove('hidden');
        } else {
            breaksBanner.classList.add('hidden');
        }
    } else if (breaksBanner) {
        breaksBanner.classList.add('hidden');
    }
}

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

// ==================== DATA LOADING ====================

async function loadUserData() {
    showLoading();
    try {
        // Load settings first to get current school year
        const settingsDoc = await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear').get();
        if (settingsDoc.exists) {
            settings = { ...settings, ...settingsDoc.data() };
            if (elements.schoolYear) elements.schoolYear.value = settings.schoolYear;
            try { localStorage.setItem('plany_last_school_year', settings.schoolYear); } catch(e) {}
            
            // Apply saved user profile
            if (settings.userProfile) {
                const _nt2 = document.getElementById('user-name-text');
                if (_nt2 && settings.userProfile.displayName) _nt2.textContent = settings.userProfile.nickname || settings.userProfile.displayName;
                if (typeof applyProfileAvatar === 'function') applyProfileAvatar(settings.userProfile.avatarUrl || '');
            }

            // Apply saved background
            if (settings.background) {
                applyBackground(settings.background, settings.customBgUrl);
                const bgRadio = document.querySelector(`input[name="background"][value="${settings.background}"]`);
                if (bgRadio) bgRadio.checked = true;
                
                // Show custom upload section if custom is selected
                if (settings.background === 'custom') {
                    const customUploadSection = document.getElementById('custom-upload-section');
                    if (customUploadSection) customUploadSection.classList.remove('hidden');
                    
                    // Update preview if custom image exists
                    if (settings.customBgUrl) {
                        const customPreview = document.getElementById('custom-bg-preview');
                        if (customPreview) {
                            customPreview.style.backgroundImage = `url('${settings.customBgUrl}')`;
                            customPreview.style.backgroundSize = 'cover';
                            customPreview.style.backgroundPosition = 'center';
                            const icon = customPreview.querySelector('.bg-icon');
                            if (icon) icon.style.display = 'none';
                        }
                    }
                }
            }
        }
        
        // Apply weekend visibility preference
        applyWeekendsVisibility();
        
        // Load data for current school year
        await loadSchoolYearData(settings.schoolYear);

        // Check for year-end transitions
        checkEndOfYearReminder();
        await checkSchoolYearTransition();
        
    } catch (error) {
        console.error('Error loading data:', error);
        console.error('Error stack:', error.stack);
        showToast('Error loading data: ' + error.message);
    }
    hideLoading();
}

// Helper to get the current school year's data path
function getYearPath() {
    return db.collection('users').doc(currentUser.uid).collection('years').doc(settings.schoolYear);
}

// Load data for a specific school year.
// v6.5.0: loads run one at a time, in the order they were asked for, so a
// slow earlier load (quick year switching, or signing out and in as someone
// else) can never finish last and overwrite the newer data.
let _yearLoadChain = Promise.resolve();
function loadSchoolYearData(schoolYear) {
    const run = () => _loadSchoolYearDataNow(schoolYear);
    const p = _yearLoadChain.then(run, run);
    _yearLoadChain = p.catch(() => {});
    return p;
}

async function _loadSchoolYearDataNow(schoolYear) {
    if (!currentUser) return;
    const loadUid = currentUser.uid;
    const stale = () => !currentUser || currentUser.uid !== loadUid;
    const yearPath = db.collection('users').doc(currentUser.uid).collection('years').doc(schoolYear);

    // Materialize this year document (give it a field) so it appears in
    // collection('years') queries. A parent that only holds subcollections is a
    // Firestore "phantom" and is invisible to collection reads — which left the
    // principal view unable to discover a teacher's school years, so it fell
    // back to the wrong year and showed no lessons. Non-blocking.
    yearPath.set({ schoolYear, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
        .catch(() => {});

    // Set initial date: today if within this school year, else Aug 1 of that year
    const startYear = parseInt(schoolYear.split('-')[0]);
    const _endYear  = parseInt(schoolYear.split('-')[1]);
    const _today    = new Date();
    const _syStart  = new Date(startYear, 7, 1);   // Aug 1
    const _syEnd    = new Date(_endYear,  6, 31);  // Jul 31
    if (_today >= _syStart && _today <= _syEnd) {
        // Separate Date objects: month navigation mutates currentDate and
        // must not drag the Day view along with it (v6.2.0).
        currentDate    = new Date(_today);
        currentDayDate = new Date(_today);
    } else {
        // Viewing a different school year (past or future) — start at August 1
        currentDate    = new Date(startYear, 7, 1);
        currentDayDate = new Date(startYear, 7, 1);
    }
    currentWeekStart = getWeekStart(currentDate);
    // Persist the school year being viewed so hard refresh restores it
    try { localStorage.setItem('plany_last_school_year', schoolYear); } catch(e) {}
    
    // Load classes, lessons, events and breaks together (v6.5.0: in parallel,
    // and only applied if the same account is still signed in)
    const [classesSnap, lessonsSnap, eventsSnap, breaksDoc] = await Promise.all([
        yearPath.collection('classes').orderBy('name').get(),
        yearPath.collection('lessons').orderBy('date').get(),
        yearPath.collection('events').orderBy('startDate').get(),
        yearPath.collection('settings').doc('breaks').get()
    ]);
    if (stale()) return;
    classes = classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    lessons = lessonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    events = eventsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (breaksDoc.exists) {
        settings.breaks = breaksDoc.data().breaks || [];
    } else {
        settings.breaks = [];
    }

    // Load sub day packets
    await loadSubDays();
    await loadEmergencySubPlans();

    // Load units
    await loadUnits();

    // Load students, assignments, grade settings, attendance
    await loadStudents();
    await loadAssignments();
    await loadClassGradeSettings();
    await loadAttendance();
    if (stale()) return;

    // Render everything
    renderCalendar();
    renderWeek();
    renderClasses();
    renderBreaks();
    updateClassDropdown();
    updateStats();
    updateSchoolYearDisplay();
    refreshAiFillClassDropdown();
    updateYearChecklist();
    initPrincipalView();
    loadTeacherLinkRequests();
    loadTeacherPrincipalComments();
    startLiveListeners();
    await restoreAiKeyFromCloud();
    await ensureAiKeyCloudBackup();
    await checkIncomingKeyShare();
    applyAiFeatureGating();
    preloadLibsWhenIdle();   // v6.3.0: fetch the PDF/Excel tools in the background
    handleLaunchShortcut();
    
    // Update import dropdowns (functions defined later, check if they exist)
    console.log('Classes loaded:', classes.length, classes);
    if (typeof updateSmartImportClassDropdown === 'function') {
        console.log('Calling updateSmartImportClassDropdown');
        updateSmartImportClassDropdown();
    } else {
        console.log('updateSmartImportClassDropdown not defined yet');
    }
}

// ==================== NAVIGATION ====================

// ── Phone bottom nav: Month · Week · Day · AI · More (v6.4.0) ───────────
// Seven tabs didn't fit a 390px phone ("CLASSESSTUDENTS"). On phones, CSS
// hides Year / Classes / Students and this "More" button lists them.
// The button is created here (not in the markup) so it isn't one of the
// view-switching .nav-item buttons wired up just below.
(function initNavMore() {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    const MORE_VIEWS = ['year', 'classes', 'students'];
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'nav-item nav-more';
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.innerHTML = '<span class="nav-icon" aria-hidden="true">☰</span><span class="nav-label">More</span>';
    const menu = document.createElement('div');
    menu.className = 'nav-more-menu hidden';
    menu.setAttribute('role', 'menu');
    const close = () => { menu.classList.add('hidden'); more.setAttribute('aria-expanded', 'false'); };
    MORE_VIEWS.forEach(v => {
        const src = nav.querySelector(`.nav-item[data-view="${v}"]`);
        if (!src) return;
        const icon = (src.querySelector('.nav-icon')?.childNodes[0]?.textContent || '').trim();
        const label = src.querySelector('.nav-label')?.textContent || v;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nav-more-item';
        b.setAttribute('role', 'menuitem');
        b.innerHTML = `<span aria-hidden="true">${escHtml(icon)}</span><span>${escHtml(label)}</span>`;
        b.addEventListener('click', () => { close(); src.click(); syncMore(); });
        menu.appendChild(b);
    });
    function syncMore() {
        const activeView = nav.querySelector('.nav-item.active[data-view]')?.dataset.view;
        more.classList.toggle('active', MORE_VIEWS.includes(activeView));
    }
    more.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !open);
        more.setAttribute('aria-expanded', String(open));
        if (open) menu.querySelector('button')?.focus();
    });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== more) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.classList.contains('hidden')) { close(); more.focus(); } });
    nav.addEventListener('click', () => setTimeout(syncMore, 0));
    const version = nav.querySelector('.nav-version');
    nav.insertBefore(more, version || null);
    document.body.appendChild(menu);
})();

elements.navItems.forEach(item => {
    item.addEventListener('click', () => {
        const view = item.dataset.view;

        // Principal view is a special overlay — not in elements.views
        if (view === 'principal') {
            elements.navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            elements.views.forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
            const pv = document.getElementById('principal-view');
            if (pv) { pv.classList.remove('hidden'); pv.classList.add('active'); }
            if (!_previewTeacher) renderPrincipalDashboard();
            return;
        }

        // Exit principal preview if active
        if (_previewTeacher) exitTeacherPreview();

        // Capture which view is active NOW — before we switch away from it
        const prevActive = document.querySelector('.view.active')?.id;

        elements.navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        elements.views.forEach(v => {
            v.classList.remove('active');
            v.classList.add('hidden');
        });
        
        const viewEl = document.getElementById(`${view}-view`);
        viewEl.classList.remove('hidden');
        viewEl.classList.add('active');

        // ── Three-way sync: month ↔ week ↔ day ──────────────────────
        if (view === 'week') {
            // Entering Week: sync from whichever view we came from
            if (prevActive === 'day-view') {
                currentWeekStart = getWeekStart(currentDayDate);
                currentDate = new Date(currentDayDate);
            } else {
                currentWeekStart = getWeekStart(currentDate);
            }
            renderWeek();

        } else if (view === 'day') {
            const _t = new Date();
            if (prevActive === 'calendar-view') {
                const _dispM = currentDate.getMonth();
                const _dispY = currentDate.getFullYear();
                if (currentDayDate.getMonth() === _dispM && currentDayDate.getFullYear() === _dispY) {
                    // Day cell click already set currentDayDate to a date within this month — keep it
                } else if (_t.getMonth() === _dispM && _t.getFullYear() === _dispY) {
                    currentDayDate = _t;  // today is in the displayed month
                } else {
                    currentDayDate = new Date(_dispY, _dispM, 1);  // default to 1st
                }
            } else if (prevActive === 'year-view') {
                // Year view sets currentDate to the exact clicked date — use it directly
                currentDayDate = new Date(currentDate);
            } else if (prevActive === 'week-view') {
                const _wHide  = settings.hideWeekends === true;
                const _wStart = formatDate(addDays(currentWeekStart, _wHide ? 0 : -1));
                const _wEnd   = formatDate(addDays(currentWeekStart, _wHide ? 4 : 5));
                const _dStr   = formatDate(currentDayDate);
                const _tStr   = formatDate(_t);
                if (_dStr >= _wStart && _dStr <= _wEnd) {
                    // Header click already set a valid day within this week — keep it
                } else if (_tStr >= _wStart && _tStr <= _wEnd) {
                    currentDayDate = _t;   // today is in this week
                } else {
                    currentDayDate = new Date(currentWeekStart); // default Monday
                }
            }
            renderDayView();

        } else if (view === 'calendar') {
            // Entering Month: sync from whichever view we came from
            if (prevActive === 'day-view') {
                currentDate = new Date(currentDayDate);
                currentWeekStart = getWeekStart(currentDayDate);
            } else {
                currentDate = new Date(addDays(currentWeekStart, 2));
            }
            renderCalendar();
        }

        // Render year view when selected
        if (view === 'students') {
            loadStudentsView();
        }
        if (view === 'year') {
            renderYearView();
        }
        
        // Refresh dropdowns when Settings view is opened
        if (view === 'settings') {
            if (typeof updateSmartImportClassDropdown === 'function') {
                updateSmartImportClassDropdown();
            }
            if (typeof updateExcelOnlyClassDropdown === 'function') {
                updateExcelOnlyClassDropdown();
            }
        }
    });
});

// ==================== YEAR VIEW ====================

function renderYearView() {
    const yearGrid = document.getElementById('year-grid');
    const yearTitle = document.getElementById('year-view-title');
    
    if (!yearGrid) return;

    // Refresh checklist state whenever year view renders
    updateYearChecklist();

    // Get school year from settings
    const schoolYear = settings.schoolYear || '2025-2026';
    const [startYear, endYear] = schoolYear.split('-').map(y => parseInt(y));
    
    yearTitle.textContent = schoolYear;
    
    // School year months: July through June
    const months = [
        { month: 6, year: startYear, name: 'July' },
        { month: 7, year: startYear, name: 'August' },
        { month: 8, year: startYear, name: 'September' },
        { month: 9, year: startYear, name: 'October' },
        { month: 10, year: startYear, name: 'November' },
        { month: 11, year: startYear, name: 'December' },
        { month: 0, year: endYear, name: 'January' },
        { month: 1, year: endYear, name: 'February' },
        { month: 2, year: endYear, name: 'March' },
        { month: 3, year: endYear, name: 'April' },
        { month: 4, year: endYear, name: 'May' },
        { month: 5, year: endYear, name: 'June' }
    ];
    
    // Build event lookup by date
    const eventsByDate = {};
    for (const event of events) {
        if (!event.startDate) continue;
        
        const start = new Date(event.startDate + 'T00:00:00');
        const end = event.endDate ? new Date(event.endDate + 'T00:00:00') : start;
        
        const d = new Date(start);
        while (d <= end) {
            const dateStr = formatDate(d);
            if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
            eventsByDate[dateStr].push(event);
            d.setDate(d.getDate() + 1);
        }
    }
    
    // Build lessons lookup by date
    const lessonsByDate = {};
    for (const lesson of lessons) {
        if (!lesson.date) continue;
        lessonsByDate[lesson.date] = true;
    }

    // Get school year boundaries from first/last day events
    const firstDayEvt = events.find(e => e.type === 'first-day');
    const lastDayEvt  = events.find(e => e.type === 'last-day');
    const yearFirstDate = firstDayEvt?.startDate || null;
    const yearLastDate  = lastDayEvt?.startDate  || null;
    
    // Get today's date string
    const today = formatDate(new Date());
    
    // Render each month
    yearGrid.innerHTML = months.map(m => {
        const firstDay = new Date(m.year, m.month, 1);
        const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
        const startDayOfWeek = firstDay.getDay();
        
        let daysHTML = '';
        
        // Day headers
        const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        daysHTML += dayNames.map(d => `<div class="mini-day-header">${d}</div>`).join('');
        
        // Empty cells before first day
        for (let i = 0; i < startDayOfWeek; i++) {
            daysHTML += '<div class="mini-day empty"></div>';
        }
        
        // Days of month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(m.year, m.month, day);
            const dateStr = formatDate(date);
            const dayOfWeek = date.getDay();
            
            let classes = ['mini-day'];
            
            // Weekend
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                classes.push('weekend');
            }
            
            // Today
            if (dateStr === today) {
                classes.push('today');
            }
            
            // Events
            const dayEvents = eventsByDate[dateStr] || [];
            for (const evt of dayEvents) {
                if (evt.type === 'first-day' || evt.type === 'last-day') {
                    classes.push('first-last');
                } else if (evt.type === 'grading') {
                    classes.push('grading');
                } else if (evt.type === 'conference' || 
                           (evt.title && /\bconferences?\b/i.test(evt.title))) {
                    classes.push('conference');
                } else if (isNoSchoolEvent(evt)) {
                    // v6.2.0: shade every no-school day the same way the month
                    // and week views treat it (meetings, professional
                    // learning, title-only holidays were missed before).
                    classes.push('break');
                }
            }
            
            // Mark days outside school year boundaries as out-of-year
            const pastYearEnd   = yearLastDate  && dateStr > yearLastDate;
            const beforeYearStart = yearFirstDate && dateStr < yearFirstDate;
            const outOfYear = pastYearEnd || beforeYearStart;
            if (outOfYear) classes.push('out-of-year');

            // Has lesson (only on school days within the school year)
            if (!outOfYear && lessonsByDate[dateStr] && !isOffDay(dateStr)) {
                classes.push('has-lesson');
            }

            // Sub day — same rule as the month calendar badge
            const isSubDay = !outOfYear && subDays[dateStr]?.isSubDay === true;
            if (isSubDay) classes.push('sub-day');

            daysHTML += `<div class="${classes.join(' ')}" data-date="${dateStr}"${isSubDay ? ' title="Sub Day"' : ''}>${day}</div>`;
        }
        
        return `
            <div class="mini-month">
                <div class="mini-month-header">${m.name} ${m.year}</div>
                <div class="mini-month-grid">${daysHTML}</div>
            </div>
        `;
    }).join('');
    
    // Add click handlers to days → navigate to Day view for exact date
    yearGrid.querySelectorAll('.mini-day:not(.empty)').forEach(day => {
        day.style.cursor = 'pointer';
        day.addEventListener('click', () => {
            const dateStr = day.dataset.date;
            if (!dateStr) return;
            // Set currentDate so the nav handler (prevActive=year-view) passes it straight to currentDayDate
            currentDate      = new Date(dateStr + 'T00:00:00');
            currentWeekStart = getWeekStart(currentDate);
            document.querySelector('[data-view="day"]')?.click();
        });
    });
    
    // Update summary
    updateYearSummary();
}

function updateYearSummary() {
    const firstDayEvent = events.find(e => e.type === 'first-day');
    const lastDayEvent = events.find(e => e.type === 'last-day');
    
    if (!firstDayEvent || !lastDayEvent) return;
    
    const start = new Date(firstDayEvent.startDate + 'T00:00:00');
    const end = new Date(lastDayEvent.startDate + 'T00:00:00');
    
    const totalDays = countSchoolDaysLeft(start, end, events);
    document.getElementById('year-total-days').textContent = totalDays;
    
    // Calculate quarters (approximate - divide into 4 roughly equal parts)
    // This is simplified - a real implementation would use grading period events
    const totalCalendarDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    const quarterLength = Math.round(totalCalendarDays / 4);
    
    const q1End = new Date(start);
    q1End.setDate(q1End.getDate() + quarterLength);
    const q2End = new Date(q1End);
    q2End.setDate(q2End.getDate() + quarterLength);
    const q3End = new Date(q2End);
    q3End.setDate(q3End.getDate() + quarterLength);
    
    // Each quarter starts the day AFTER the previous one ends, so a boundary
    // day isn't counted twice and the quarters add up to the total.
    const dayAfter = d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; };
    document.getElementById('year-q1-days').textContent = countSchoolDaysLeft(start, q1End, events);
    document.getElementById('year-q2-days').textContent = countSchoolDaysLeft(dayAfter(q1End), q2End, events);
    document.getElementById('year-q3-days').textContent = countSchoolDaysLeft(dayAfter(q2End), q3End, events);
    document.getElementById('year-q4-days').textContent = countSchoolDaysLeft(dayAfter(q3End), end, events);
}

// ==================== CALENDAR ====================

function renderCalendar() {
    if (!elements.calendarGrid || !elements.currentMonth) return;
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    elements.currentMonth.textContent = formatMonthYear(currentDate);
    
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    elements.calendarGrid.innerHTML = '';
    
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    
    // Check if mobile (skip weekends)
    const isMobile = window.innerWidth <= 768;
    
    // On mobile: 6 weeks × 5 days = 30 cells
    // On desktop: 6 weeks × 7 days = 42 cells
    const totalCells = isMobile ? 30 : 42;
    
    let current = new Date(startDate);
    let cellCount = 0;
    
    while (cellCount < totalCells) {
        const dayOfWeekNum = current.getDay();
        
        // Skip weekends on mobile
        if (isMobile && (dayOfWeekNum === 0 || dayOfWeekNum === 6)) {
            current.setDate(current.getDate() + 1);
            continue;
        }
        
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        
        // Add weekend class for Saturday (6) and Sunday (0) - for desktop
        if (dayOfWeekNum === 0 || dayOfWeekNum === 6) {
            dayEl.classList.add('weekend');
        }
        
        if (current.getMonth() !== month) dayEl.classList.add('other-month');
        if (isSameDay(current, new Date())) dayEl.classList.add('today');
        
        const dateStr = formatDate(current);
        const dayOfWeek = dayNames[dayOfWeekNum];
        dayEl.dataset.date = dateStr;
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = current.getDate();
        // Add 🙋 badge only if teacher explicitly marked this as a sub day
        if (subDays[dateStr]?.isSubDay === true) {
            const subBadge = document.createElement('span');
            subBadge.className = 'sub-day-badge';
            subBadge.title = 'Sub Day Packet exists';
            subBadge.textContent = '🙋';
            dayNumber.appendChild(subBadge);
        }
        dayEl.appendChild(dayNumber);
        
        // Container for events and classes
        const preview = document.createElement('div');
        preview.className = 'day-lessons-preview';
        
        // Get events for this day (including multi-day events)
        const dayEvents = events.filter(e => {
            const start = e.startDate;
            const end = e.endDate || e.startDate;
            return dateStr >= start && dateStr <= end;
        });
        
        // Show events
        dayEvents.slice(0, 2).forEach(event => {
            const eventEl = document.createElement('div');
            eventEl.className = `calendar-event event-${event.type || 'event'}`;
            eventEl.textContent = event.title;
            eventEl.addEventListener('click', (e) => {
                e.stopPropagation();
                openEventModal(event);
            });
            preview.appendChild(eventEl);
        });
        
        // Get classes scheduled for this day of week (only on weekdays)
        // Skip all classes on holidays/breaks/no-school days
        const dayIsOff = isOffDay(dateStr);
        if (dayIsOff) dayEl.classList.add('off-day');

        const dayClasses = dayIsOff ? [] : sortClassesByTime(classes.filter(cls => {
            if (!cls.schedule) return false;
            if (!cls.schedule[dayOfWeek]) return false;
            return isClassActiveOnDate(cls, dateStr);
        }), dayOfWeek);

        // Show a No School pill when off-day has no explicit event displayed yet
        if (dayIsOff && dayEvents.length === 0) {
            const noSchoolEl = document.createElement('div');
            noSchoolEl.className = 'calendar-event event-holiday';
            noSchoolEl.textContent = '🏖️ No School';
            preview.appendChild(noSchoolEl);
        }
        
        // Show classes (limit display) — each slot gets its own pill, sorted by start time
        const maxItems = dayEvents.length > 0 ? 2 : 3;
        let shownClassPills = 0;
        const classSlots = getSortedClassSlots(dayClasses, dayOfWeek);
        const totalClassSlots = classSlots.length;
        for (const { cls, slotIndex: si, slotCount } of classSlots) {
                if (shownClassPills >= maxItems) break;
                const lesson = findLessonForSlot(
                    lessons.filter(l => l.date === dateStr && l.classId === cls.id),
                    cls.id, si);
                const hasLesson = !!lesson;
                const classEl = document.createElement('div');
                classEl.className = `calendar-class ${hasLesson ? 'has-lesson' : 'no-lesson'}`;
                if (lesson?.linkGroupId) classEl.classList.add('linked');
                classEl.style.background = cls.color || '#FF6B9D';
                classEl.style.color = textOnColor(cls.color || '#FF6B9D');
                const slotLabel = slotCount > 1 ? ` S${si + 1}` : '';
                classEl.textContent = cls.name + slotLabel;
                if (hasLesson && lesson) makeLessonDraggable(classEl, lesson);
                classEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openLessonModalForClass(cls, dateStr, si);
                });
                preview.appendChild(classEl);
                shownClassPills++;
        }
        
        // Show +more indicator
        const totalItems = dayEvents.length + totalClassSlots;
        const shownItems = Math.min(dayEvents.length, 2) + shownClassPills;
        if (totalItems > shownItems) {
            const more = document.createElement('div');
            more.className = 'lesson-dot';
            more.style.background = 'rgba(255,255,255,0.2)';
            more.textContent = `+${totalItems - shownItems} more`;
            preview.appendChild(more);
        }
        
        dayEl.appendChild(preview);

        // Phone summary (v6.3.0): one dot per class period -- filled when a
        // lesson is planned, hollow when not -- plus a square per event.
        // CSS shows it instead of the text pills below 600px; the whole day
        // is the tap target and opens Day view.
        const summary = document.createElement('div');
        summary.className = 'day-mobile-summary';
        summary.setAttribute('aria-hidden', 'true');
        let plannedCount = 0;
        classSlots.forEach(({ cls, slotIndex: si }) => {
            const has = !!findLessonForSlot(lessons.filter(l => l.date === dateStr && l.classId === cls.id), cls.id, si);
            if (has) plannedCount++;
            const dot = document.createElement('span');
            dot.className = 'dms-dot' + (has ? '' : ' empty');
            dot.style.setProperty('--dot', cls.color || '#FF6B9D');
            summary.appendChild(dot);
        });
        dayEvents.forEach(() => {
            const sq = document.createElement('span');
            sq.className = 'dms-event';
            summary.appendChild(sq);
        });
        if (dayIsOff) {
            const off = document.createElement('span');
            off.className = 'dms-off';
            off.textContent = 'Off';
            summary.appendChild(off);
        }
        dayEl.appendChild(summary);

        // Keyboard + screen-reader access to the day (v6.3.0)
        const dayLabelParts = [current.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })];
        if (dayIsOff) dayLabelParts.push('no school');
        else if (totalClassSlots) dayLabelParts.push(`${plannedCount} of ${totalClassSlots} classes planned`);
        if (dayEvents.length) dayLabelParts.push(`${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}`);
        dayEl.setAttribute('role', 'button');
        dayEl.tabIndex = 0;
        dayEl.setAttribute('aria-label', dayLabelParts.join(', '));

        const openThisDay = () => {
            jumpToDate(new Date(dateStr + 'T00:00:00'));
            document.querySelector('[data-view="day"]')?.click();
        };
        // Click handler - navigate to Day view
        dayEl.addEventListener('click', (e) => {
            // Don't open if clicking on an event or class element
            if (e.target.classList.contains('calendar-event') || e.target.classList.contains('calendar-class')) {
                return;
            }
            openThisDay();
        });
        dayEl.addEventListener('keydown', (e) => {
            if (e.target === dayEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openThisDay(); }
        });
        
        elements.calendarGrid.appendChild(dayEl);
        
        current = addDays(current, 1);
        cellCount++;
    }
}

// Always step from the 1st: setMonth() on Oct 31 gives "Nov 31" = Dec 1,
// which skipped November (v6.2.0).
elements.prevMonth.addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    renderCalendar();
});

elements.nextMonth.addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    renderCalendar();
});

// Today button
document.getElementById('today-btn').addEventListener('click', () => {
    currentDate      = new Date();
    currentDayDate   = new Date();          // keep all three anchors in sync
    currentWeekStart = getWeekStart(currentDate);
    renderCalendar();
    showToast('Jumped to today');
});

// Re-render on resize/orientation change for mobile layout
window.addEventListener('resize', () => {
    const activeView = document.querySelector('.view.active')?.id;
    if (activeView === 'week-view') renderWeek();
});

// Re-render calendar on resize/orientation change for mobile weekend handling
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        renderCalendar();
    }, 250);
});

// ==================== WEEK VIEW ====================


function renderWeek() {
    if (!elements.currentWeek || !elements.weekContainer) return;

    const weekStart = currentWeekStart; // always a Monday
    const hideWknd = settings.hideWeekends === true;

    // Nav label: "Aug 31 – Sep 5, 2026". Must match the columns actually
    // rendered below: 5d = Mon..Fri, 7d = Sun..Sat (Sunday sits at offset -1).
    const labelStart = addDays(weekStart, hideWknd ? 0 : -1);
    const labelEnd   = addDays(weekStart, hideWknd ? 4 : 5);
    elements.currentWeek.textContent =
        `${labelStart.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ` +
        `${labelEnd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;

    // Sync 5d/7d button state
    ['toggle-weekends-btn','toggle-weekends-week-btn'].forEach(id => {
        const b = document.getElementById(id);
        if (!b) return;
        b.textContent = hideWknd ? '7d' : '5d';
        b.classList.toggle('active', hideWknd);
        b.title = hideWknd ? 'Show weekends' : 'Hide weekends';
    });


    // Determine columns: Mon-Fri (5) or Sun-Sat (7)
    const offsets = hideWknd ? [0,1,2,3,4] : [-1,0,1,2,3,4,5];
    const dayDates = offsets.map(o => addDays(weekStart, o));

    const container = elements.weekContainer;
    container.innerHTML = '';
    const isMobileView = window.innerWidth <= 768;
    if (isMobileView) {
        container.style.gridTemplateColumns = '';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
    } else {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${dayDates.length}, minmax(0, 1fr))`;
    }

    dayDates.forEach(dayDate => {
        const dateStr  = formatDate(dayDate);
        const isToday  = isSameDay(dayDate, new Date());
        const dayIsOff = isOffDay(dateStr);
        const dow      = ['sun','mon','tue','wed','thu','fri','sat'][dayDate.getDay()];
        const dayNameFull = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayDate.getDay()];

        const dayCol = document.createElement('div');
        dayCol.className = `week-day-col${isToday ? ' today-col' : ''}${dayIsOff ? ' off-day' : ''}`;

        // ── Header (gradient like month view, today gets circle) ──
        const header = document.createElement('div');
        header.className = `week-day-header${isToday ? ' today' : ''}`;
        header.innerHTML = `
            <span class="week-day-name">${dayNameFull}</span>
            <span class="week-day-number">${dayDate.getDate()}</span>`;
        header.title = 'Open day view';
        header.addEventListener('click', () => {
            currentDayDate = new Date(dayDate);
            switchView('day');
        });
        dayCol.appendChild(header);

        // ── Sub day flag ──
        if (subDays[dateStr]?.isSubDay === true) {
            dayCol.classList.add('sub-day-col');
            const subFlag = document.createElement('div');
            subFlag.className = 'week-day-sub-banner';
            subFlag.textContent = '\u{1F64B} Sub Day';
            subFlag.title = 'Open the Sub Day packet';
            subFlag.addEventListener('click', (ev) => { ev.stopPropagation(); openSubDayModal(dateStr); });
            dayCol.appendChild(subFlag);
        }

        // ── Events (same pill styles as month view) ──
        const dayEvents = events.filter(e => dateStr >= e.startDate && dateStr <= (e.endDate || e.startDate));
        if (dayEvents.length > 0) {
            const evEl = document.createElement('div');
            evEl.className = 'week-day-events';
            dayEvents.forEach(ev => {
                const pill = document.createElement('div');
                pill.className = `week-event event-${ev.type || 'event'}`;
                pill.textContent = ev.title;
                pill.addEventListener('click', () => openEventModal(ev));
                evEl.appendChild(pill);
            });
            dayCol.appendChild(evEl);
        }

        // ── Off-day banner ──
        if (dayIsOff) {
            const banner = document.createElement('div');
            banner.className = 'week-day-off-banner';
            banner.textContent = '🏖️ No School';
            dayCol.appendChild(banner);
            container.appendChild(dayCol);
            return;
        }

        // ── Lessons (color-coded by fill state) ──
        const lessonsEl = document.createElement('div');
        lessonsEl.className = 'week-day-lessons';

        const dayLessons = lessons.filter(l => l.date === dateStr)
            .sort((a,b) => (a.time||'').localeCompare(b.time||''));
        const dayClasses = classes.filter(cls => cls.schedule && cls.schedule[dow] && isClassActiveOnDate(cls, dateStr));
        const classSlots = getSortedClassSlots(dayClasses, dow);

        if (classSlots.length === 0) {
            lessonsEl.innerHTML = '<div class="week-day-empty">No classes</div>';
        } else {
            classSlots.forEach(({ cls, slotIndex: si, slot, slotCount }) => {
                    const slotTimeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dow);
                    const lesson = findLessonForSlot(dayLessons, cls.id, si);
                    const hasLesson = !!lesson;
                    const isSpanAll = hasLesson && lesson.slotIndex === -1;
                    const sessionLabel = slotCount > 1
                        ? (isSpanAll && si === 0 ? ` <span class="slot-badge span-badge">📋 all</span>`
                           : isSpanAll ? ` <span class="slot-badge span-badge muted-badge">📋</span>`
                           : ` <span class="slot-badge">S${si + 1}</span>`)
                        : '';
                    const clsEl = document.createElement('div');
                    clsEl.className = `week-lesson ${hasLesson ? 'has-lesson' : 'no-lesson'}`;
                    clsEl.innerHTML = `
                        <div class="lesson-color-bar" style="background:${cls.color||'#FF6B9D'}"></div>
                        <div class="lesson-info">
                            <h4>${escHtml(cls.name)}${sessionLabel}</h4>
                            <p>${hasLesson && lesson?.title ? escHtml(lesson.title) : escHtml(cls.subject || 'No lesson planned')}</p>
                            ${slotTimeStr ? `<span class="lesson-time">${slotTimeStr}</span>` : ''}
                        </div>
                        <span class="lesson-status">${hasLesson ? '✓' : '+'}</span>`;
                    clsEl.addEventListener('click', () => {
                        if (hasLesson && lesson) openLessonModal(lesson);
                        else openLessonModalForClass(cls, dateStr, si);
                    });
                    lessonsEl.appendChild(clsEl);
            });
        }

        lessonsEl.addEventListener('click', e => {
            if (e.target === lessonsEl || e.target.classList.contains('week-day-empty'))
                openLessonModal(null, dateStr);
        });

        dayCol.appendChild(lessonsEl);
        container.appendChild(dayCol);
    });
}

elements.prevWeek.addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    currentDate = new Date(addDays(currentWeekStart, 2)); // keep month in sync
    renderWeek();
});

elements.nextWeek.addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    currentDate = new Date(addDays(currentWeekStart, 2));
    renderWeek();
});

document.getElementById('today-week-btn')?.addEventListener('click', () => {
    currentDate      = new Date();
    currentDayDate   = new Date();          // keep all three anchors in sync
    currentWeekStart = getWeekStart(currentDate);
    renderWeek();
    renderCalendar();
    showToast('📅 Jumped to today');
});

document.getElementById('toggle-weekends-week-btn')?.addEventListener('click', async () => {
    settings.hideWeekends = !settings.hideWeekends;
    applyWeekendsVisibility();
    renderWeek();
    renderCalendar();
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear')
            .set({ hideWeekends: settings.hideWeekends }, { merge: true });
    } catch (e) { console.warn('Could not save weekend preference:', e); }
});


// ==================== DAY VIEW ====================

// ============================================================
// COLOR CONTRAST
// ============================================================
// Class colors are picked by the teacher and range from near-black to
// bright yellow, so a fixed white label is unreadable on the light ones
// (white on #FFD93D scores 1.4:1). Pick the label color from the
// background's relative luminance instead.
function textOnColor(bg) {
    const raw = String(bg || '').trim().replace('#', '');
    const hex = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#FFFFFF';
    const lin = v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const [r, g, b] = [0, 2, 4].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.21 ? '#141428' : '#FFFFFF';
}

function renderDayView() {
    const dateStr  = formatDate(currentDayDate);
    const date     = new Date(dateStr + 'T00:00:00');
    const isToday  = isSameDay(date, new Date());
    const dayIsOff = isOffDay(dateStr);
    const dowKey   = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];

    // Nav label
    const label = document.getElementById('current-day-display');
    if (label) {
        label.textContent = formatDisplayDate(date);
        label.style.color = isToday ? 'var(--neon-pink)' : '';
    }

    const content = document.getElementById('day-view-content');
    if (!content) return;
    content.innerHTML = '';

    // ── Off-day banner ──────────────────────────────────
    if (dayIsOff) {
        const banner = document.createElement('div');
        banner.className = 'day-view-section off-day-banner';
        banner.textContent = '🏖️ No School – All classes cancelled';
        content.appendChild(banner);
    }

    // ── Sub Day banner ──────────────────────────────────
    if (subDays[dateStr]?.isSubDay === true) {
        const sub = document.createElement('div');
        sub.className = 'day-view-section sub-day-banner';
        sub.innerHTML = `<span>\u{1F64B} This is a Sub Day</span>
            <button type="button" class="btn btn-sm btn-secondary" id="day-view-open-sub">Open packet</button>`;
        sub.querySelector('#day-view-open-sub').addEventListener('click', () => openSubDayModal(dateStr));
        content.appendChild(sub);
    }

    // ── Events section ──────────────────────────────────
    const dayEvents = events.filter(e => dateStr >= e.startDate && dateStr <= (e.endDate || e.startDate));
    const evSection = document.createElement('div');
    evSection.className = 'day-view-section';
    const typeIcons = { 'event':'📌','first-day':'🎒','last-day':'🎉','holiday':'🏖️','meeting':'👥','assembly':'🎤','field-trip':'🚌','testing':'📝','deadline':'⚠️' };
    evSection.innerHTML = `<div class="day-view-section-header"><span>📅</span> Events</div>`;
    if (dayEvents.length === 0) {
        evSection.innerHTML += '<div class="day-view-empty">No events today</div>';
    } else {
        const list = document.createElement('div');
        list.className = 'day-classes-list';
        dayEvents.forEach(ev => {
            const item = document.createElement('div');
            item.className = 'day-event-item';
            item.innerHTML = `
                <div class="day-event-info">
                    <span class="day-event-type">${typeIcons[ev.type] || '📌'}</span>
                    <div class="day-event-details">
                        <h4>${escHtml(ev.title)}</h4>
                        <p>${ev.startTime || 'All day'}${ev.endDate && ev.endDate !== ev.startDate ? ' · Multi-day' : ''}</p>
                    </div>
                </div>`;
            item.addEventListener('click', () => openEventModal(ev));
            list.appendChild(item);
        });
        evSection.appendChild(list);
    }
    content.appendChild(evSection);

    // ── Classes / Lessons section ────────────────────────
    const clsSection = document.createElement('div');
    clsSection.className = 'day-view-section';
    clsSection.innerHTML = `<div class="day-view-section-header" style="background:var(--gradient-synthwave)"><span>🎓</span> Classes</div>`;

    const _dayClassesRaw = dayIsOff ? [] : classes.filter(cls => cls.schedule && cls.schedule[dowKey] && isClassActiveOnDate(cls, dateStr));
    const classSlots = getSortedClassSlots(_dayClassesRaw, dowKey);
    const dayLessons = lessons.filter(l => l.date === dateStr);

    if (dayIsOff) {
        // already shown by banner
    } else if (classSlots.length === 0) {
        clsSection.innerHTML += '<div class="day-view-empty">No classes scheduled</div>';
    } else {
        const list = document.createElement('div');
        list.className = 'day-classes-list';
        classSlots.forEach(({ cls, slotIndex: si, slot, slotCount }) => {
                const slotTimeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dowKey);
                const lesson = findLessonForSlot(dayLessons, cls.id, si);
                const hasLesson = !!lesson;
                const isSpanAll = hasLesson && lesson.slotIndex === -1;
                const sessionLabel = slotCount > 1
                    ? (isSpanAll ? ' · 📋 All sessions' : ` · Session ${si + 1}`)
                    : '';
                const item = document.createElement('div');
                item.className = 'day-class-item' + (hasLesson ? ' is-expandable' : '');
                item.dataset.classId = cls.id;
                item.dataset.slotIndex = si;
                item.dataset.date    = dateStr;
                item.innerHTML = `
                    <div class="day-class-row">
                        <div class="day-class-info">
                            <div class="day-class-color" style="background:${cls.color||'#FF6B9D'}"></div>
                            <div class="day-class-details">
                                <h4>${escHtml(cls.name)}${sessionLabel}</h4>
                                <p>${slotTimeStr}${cls.room ? ' · ' + cls.room : ''}</p>
                            </div>
                        </div>
                        <span class="day-class-status ${hasLesson ? 'has-lesson' : 'no-lesson'}">
                            ${hasLesson ? '✓ ' + escHtml(lesson.title || 'Lesson planned') : '+ Add lesson'}
                        </span>
                        ${hasLesson ? '<span class="day-class-caret" aria-hidden="true">\u25BE</span>' : ''}
                    </div>
                    ${hasLesson ? `<div class="day-class-detail">${buildLessonDetailHtml(lesson)}</div>` : ''}`;

                if (hasLesson && lesson) {
                    const row = item.querySelector('.day-class-row');
                    row.setAttribute('role', 'button');
                    row.setAttribute('tabindex', '0');
                    const toggle = () => {
                        item.classList.toggle('expanded');
                        row.setAttribute('aria-expanded', item.classList.contains('expanded') ? 'true' : 'false');
                    };
                    row.addEventListener('click', toggle);
                    row.addEventListener('keydown', ev => {
                        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
                    });
                    item.querySelector('.day-lesson-edit-btn')?.addEventListener('click', ev => {
                        ev.stopPropagation();
                        openLessonModal(lesson);
                    });
                    item.querySelector('.day-lesson-print-btn')?.addEventListener('click', ev => {
                        ev.stopPropagation();
                        printLessonPDF(lesson.id);
                    });
                } else {
                    item.addEventListener('click', () => openLessonModalForClass(cls, dateStr, si));
                }
                list.appendChild(item);
        });
        clsSection.appendChild(list);
    }
    content.appendChild(clsSection);

}

// ============================================================
// LESSON DETAIL (shared by the Day view accordion and the Day print)
// ============================================================
const LESSON_DETAIL_FIELDS = [
    ['standards',       '\u{1F3AF} Standards & Objectives'],
    ['learningTarget',  '\u{1F3AF} Learning Target'],
    ['successCriteria', '\u2705 Success Criteria'],
    ['flow',            '\u{1F4CB} Lesson Flow'],
    ['materials',       '\u{1F4E6} Materials'],
    ['activities',      '\u{1F4DD} Activities & Notes']
];

function lessonHasDetail(lesson) {
    return !!lesson && LESSON_DETAIL_FIELDS.some(([k]) => (lesson[k] || '').toString().trim());
}

// Multiline text -> escaped HTML with line breaks preserved.
function detailText(v) {
    return escHtml(String(v || '').trim()).replace(/\n/g, '<br>');
}

// Inline lesson body shown when a Day view class row is expanded.
function buildLessonDetailHtml(lesson) {
    const blocks = LESSON_DETAIL_FIELDS
        .filter(([key]) => (lesson[key] || '').toString().trim())
        .map(([key, label]) => `
            <div class="day-lesson-field">
                <div class="day-lesson-field-label">${label}</div>
                <div class="day-lesson-field-value">${detailText(lesson[key])}</div>
            </div>`)
        .join('');

    const atts = Array.isArray(lesson.attachments) ? lesson.attachments : [];
    const attHtml = atts.length
        ? `<div class="day-lesson-field">
               <div class="day-lesson-field-label">\u{1F4CE} Attachments</div>
               <div class="day-lesson-field-value">${atts.map(a => escHtml(a.name || a.fileName || 'File')).join(', ')}</div>
           </div>`
        : '';

    const meta = [
        lesson.subject ? escHtml(lesson.subject) : '',
        lesson.duration ? escHtml(lesson.duration) + ' min' : ''
    ].filter(Boolean).join(' \u00B7 ');

    return `
        ${meta ? `<div class="day-lesson-meta">${meta}</div>` : ''}
        ${blocks || attHtml ? blocks + attHtml : '<div class="day-lesson-empty">No lesson details yet \u2014 open it to fill them in.</div>'}
        <div class="day-lesson-actions">
            <button type="button" class="btn btn-sm btn-secondary day-lesson-edit-btn">\u270F\uFE0F Edit lesson</button>
            <button type="button" class="btn btn-sm btn-ghost day-lesson-print-btn">\u{1F5A8}\uFE0F Print this lesson</button>
        </div>`;
}

// ============================================================
// PRINT: WHOLE DAY, WITH EVERY LESSON IN FULL
// ============================================================
function printDayFull(dateStr) {
    dateStr = dateStr || formatDate(currentDayDate);
    const date = new Date(dateStr + 'T00:00:00');
    const dow  = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];
    const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const dayIsOff  = isOffDay(dateStr);
    const isSub     = subDays[dateStr]?.isSubDay === true;

    const dayEvents = events.filter(e => dateStr >= e.startDate && dateStr <= (e.endDate || e.startDate));
    const dayClasses = dayIsOff ? [] : classes.filter(c => c.schedule && c.schedule[dow] && isClassActiveOnDate(c, dateStr));
    const slots = getSortedClassSlots(dayClasses, dow);
    const dayLessons = lessons.filter(l => l.date === dateStr);

    const eventsHtml = dayEvents.length
        ? `<section class="pd-block">
             <h2>Events</h2>
             <ul class="pd-events">${dayEvents.map(e => `<li><strong>${escHtml(e.title)}</strong>${e.startTime ? ' \u00B7 ' + escHtml(e.startTime) : ' \u00B7 All day'}</li>`).join('')}</ul>
           </section>`
        : '';

    const classesHtml = slots.map(({ cls, slotIndex: si, slot, slotCount }) => {
        const timeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dow);
        const lesson  = findLessonForSlot(dayLessons, cls.id, si);
        const session = slotCount > 1 ? (lesson && lesson.slotIndex === -1 ? ' \u00B7 All sessions' : ` \u00B7 Session ${si + 1}`) : '';
        const color   = cls.color || '#FF6B9D';

        const fields = lesson
            ? LESSON_DETAIL_FIELDS
                .filter(([key]) => (lesson[key] || '').toString().trim())
                .map(([key, label]) => `
                    <div class="pd-field">
                        <div class="pd-field-label">${label.replace(/^[^ ]+ /, '')}</div>
                        <div class="pd-field-value">${detailText(lesson[key])}</div>
                    </div>`).join('')
            : '';

        const atts = lesson && Array.isArray(lesson.attachments) ? lesson.attachments : [];

        return `
            <section class="pd-class">
                <div class="pd-class-head" style="border-left-color:${color}">
                    <div class="pd-class-name">${escHtml(cls.name)}${session}</div>
                    <div class="pd-class-time">${escHtml(timeStr || '')}${cls.room ? ' \u00B7 ' + escHtml(cls.room) : ''}</div>
                </div>
                ${lesson
                    ? `<div class="pd-lesson">
                           <div class="pd-lesson-title">${escHtml(lesson.title || 'Untitled lesson')}</div>
                           ${fields || '<div class="pd-empty">No lesson details recorded.</div>'}
                           ${atts.length ? `<div class="pd-field"><div class="pd-field-label">Attachments</div><div class="pd-field-value">${atts.map(a => escHtml(a.name || a.fileName || 'File')).join(', ')}</div></div>` : ''}
                       </div>`
                    : '<div class="pd-empty">No lesson planned.</div>'}
            </section>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Daily Plan \u2014 ${escHtml(formatted)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; }
  @page { margin: 0.5in 0.55in; }
  .pd-head { border-bottom: 3px solid #9D4EDD; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  .pd-head h1 { font-size: 20px; color: #9D4EDD; }
  .pd-head .pd-sub { font-size: 11px; color: #666; margin-top: 2px; }
  .pd-flag { font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #fff; background: #E8832A; padding: 3px 9px; border-radius: 3px; }
  .pd-block { margin-bottom: 14px; }
  .pd-block h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #7B5EA7; margin-bottom: 5px; }
  .pd-events { list-style: none; font-size: 12px; }
  .pd-events li { padding: 2px 0; }
  .pd-class { border: 1px solid #e2e2ea; border-radius: 5px; margin-bottom: 11px; page-break-inside: avoid; overflow: hidden; }
  .pd-class-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; background: #f6f5fa; border-left: 5px solid #FF6B9D; padding: 7px 11px; }
  .pd-class-name { font-size: 13px; font-weight: 700; }
  .pd-class-time { font-size: 11px; color: #555; white-space: nowrap; }
  .pd-lesson { padding: 9px 12px 11px; }
  .pd-lesson-title { font-size: 12.5px; font-weight: 700; color: #1a1a2e; margin-bottom: 7px; }
  .pd-field { margin-bottom: 7px; }
  .pd-field-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #8a8aa0; margin-bottom: 1px; }
  .pd-field-value { font-size: 11.5px; line-height: 1.5; white-space: normal; }
  .pd-empty { padding: 9px 12px; font-size: 11px; color: #999; font-style: italic; }
</style></head><body>
  <div class="pd-head">
    <div>
      <h1>Daily Plan</h1>
      <div class="pd-sub">${escHtml(formatted)}${userProfile?.username ? ' \u00B7 ' + escHtml(userProfile.username) : ''}</div>
    </div>
    ${isSub ? '<div class="pd-flag">Sub Day</div>' : ''}
  </div>
  ${dayIsOff ? '<div class="pd-block"><strong>No School \u2014 all classes cancelled.</strong></div>' : ''}
  ${eventsHtml}
  ${classesHtml || (dayIsOff ? '' : '<div class="pd-empty">No classes scheduled for this day.</div>')}
</body></html>`;

    const win = openPrintWindow();
    if (!win) { printHtmlViaIframe(preparePrintDoc(html, {v:'0.4in',h:'0.3in'})); return; }
    win.document.write(preparePrintDoc(html, {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 400);
}

document.getElementById('prev-day-btn')?.addEventListener('click', () => {
    currentDayDate = addDays(currentDayDate, -1);
    currentDate = new Date(currentDayDate);
    currentWeekStart = getWeekStart(currentDayDate);
    renderDayView();
});

document.getElementById('next-day-btn')?.addEventListener('click', () => {
    currentDayDate = addDays(currentDayDate, 1);
    currentDate = new Date(currentDayDate);
    currentWeekStart = getWeekStart(currentDayDate);
    renderDayView();
});

document.getElementById('day-view-print-btn')?.addEventListener('click', () => {
    printDayFull(formatDate(currentDayDate));
});

document.getElementById('day-view-sub-btn')?.addEventListener('click', () => {
    // Opened from the Day view: this IS the "make today a sub day" action, so
    // the day is marked as a sub day up front instead of relying on the toggle.
    openSubDayModal(formatDate(currentDayDate), { markAsSubDay: true });
});

document.getElementById('day-view-add-event-btn')?.addEventListener('click', () => {
    openEventModal(null, formatDate(currentDayDate));
});

document.getElementById('today-day-btn')?.addEventListener('click', () => {
    currentDayDate = new Date();
    currentDate = new Date();
    currentWeekStart = getWeekStart(currentDate);
    renderDayView();
    renderCalendar();
    renderWeek();
    showToast('📅 Jumped to today');
});

document.getElementById('add-lesson-day-view-btn')?.addEventListener('click', () => {
    openLessonModal(null, formatDate(currentDayDate));
});

// ==================== CLASSES ====================

function renderClasses() {
    if (!elements.classesList) return;
    
    if (classes.length === 0) {
        elements.classesList.innerHTML = `
            <div class="no-classes">
                <p>No classes yet</p>
                <p>Add your first class to get started!</p>
            </div>
        `;
        return;
    }
    
    // Sort classes by earliest scheduled day/time
    const sortedClasses = sortClassesBySchedule(classes);
    
    elements.classesList.innerHTML = sortedClasses.map(cls => {
        // Sort schedule entries by day order
        const dayOrder = { 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5 };
        const scheduleHtml = Object.entries(cls.schedule || {})
            .filter(([_, time]) => time)
            .sort((a, b) => (dayOrder[a[0]] || 9) - (dayOrder[b[0]] || 9))
            .map(([day]) => {
                const slots = getTimeSlotsForDay(cls, day);
                const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
                if (slots.length === 0) return '';
                return slots.map(slot =>
                    `<span class="schedule-badge">${dayLabel} ${formatTimeSlot(slot)}</span>`
                ).join('');
            })
            .join('');
        
        return `
            <div class="class-card" data-id="${cls.id}">
                <div class="class-card-header" style="background: ${cls.color || '#FF6B9D'}; color: ${textOnColor(cls.color || '#FF6B9D')}">
                    <h3>${escHtml(cls.name)}</h3>
                    ${cls.room ? `<div class="room-badge">${cls.room}</div>` : ''}
                </div>
                <div class="class-card-body">
                    ${cls.subject ? `<p class="class-subject">${cls.subject}</p>` : ''}
                    <div class="class-schedule">${scheduleHtml || '<span class="schedule-badge">No schedule set</span>'}</div>
                </div>
            </div>
        `;
    }).join('');
    
    elements.classesList.querySelectorAll('.class-card').forEach(card => {
        card.addEventListener('click', () => {
            const cls = classes.find(c => c.id === card.dataset.id);
            openClassModal(cls);
        });
    });
}

// ============================================================
// PRINT PAGE SHELL
// ============================================================
// Browsers draw their own header/footer (page title, about:blank URL,
// date, "Page 1 of 3") into the @page margin band. Zeroing the page
// margin is the only reliable way to suppress them. To keep real
// margins on EVERY page - not just the first - the document body is
// wrapped in a table: thead/tfoot become spacers that repeat at the
// top and bottom of each printed page, and the single body cell
// carries the left/right padding.
function preparePrintDoc(html, opts) {
    opts = opts || {};
    var v = opts.v || '0.4in';
    var h = opts.h || '0.3in';
    var css = '<style id="plany-print-shell">'
        + '@page { margin: 0 !important; }'
        + 'html, body { padding: 0 !important; margin-top: 0 !important; margin-bottom: 0 !important; }'
        + 'table.plany-pgwrap { display:table !important; width:100% !important; table-layout:fixed !important; border-collapse:collapse !important; border:0 !important; background:transparent !important; margin:0 !important; }'
        + 'table.plany-pgwrap > thead { display:table-header-group !important; }'
        + 'table.plany-pgwrap > tbody { display:table-row-group !important; }'
        + 'table.plany-pgwrap > tfoot { display:table-footer-group !important; }'
        + 'table.plany-pgwrap > * > tr { display:table-row !important; }'
        + 'table.plany-pgwrap > * > tr > td { display:table-cell !important; border:0 !important; background:transparent !important; }'
        + 'table.plany-pgwrap > thead > tr > td, table.plany-pgwrap > tfoot > tr > td { height:' + v + ' !important; padding:0 !important; font-size:0; line-height:0; }'
        + 'table.plany-pgwrap > tbody > tr > td { padding:0 ' + h + ' !important; vertical-align:top; }'
        + '</style>';

    if (typeof html !== 'string') return html;
    var open = html.match(/<body[^>]*>/i);
    if (!open) return html;

    var start = open.index + open[0].length;
    var endIdx = html.toLowerCase().lastIndexOf('</body>');
    var inner = endIdx > -1 ? html.slice(start, endIdx) : html.slice(start);
    var tail = endIdx > -1 ? html.slice(endIdx) : '</body></html>';
    var head = html.slice(0, start);

    if (/<\/head>/i.test(head)) {
        head = head.replace(/<\/head>/i, function (m) { return css + m; });
    } else {
        head = head.replace(/<body[^>]*>/i, function (m) { return css + m; });
    }

    return head
        + '<table class="plany-pgwrap"><thead><tr><td></td></tr></thead><tbody><tr><td>'
        + inner
        + '</td></tr></tbody><tfoot><tr><td></td></tr></tfoot></table>'
        + tail;
}

function printWeeklySchedule() {
    if (classes.length === 0) { showToast('No classes to export.'); return; }

    const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // Gather all slots with parsed minutes
    const toMin = t => {
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    const fmt12 = t => {
        if (!t) return '';
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + '\u00a0' + ampm;
    };

    // allSlots: one entry per class-per-day-per-slot
    const allSlots = [];
    classes.forEach(cls => {
        DAYS.forEach((dow, di) => {
            const slots = getTimeSlotsForDay(cls, dow);
            if (!slots.length) return;
            slots.forEach((slot, si) => {
                const startMin = toMin(slot.start);
                const endMin   = toMin(slot.end);
                if (startMin === null) return;
                allSlots.push({ cls, dow, di, slotIndex: si, slotCount: slots.length,
                    startMin, endMin: endMin || startMin + 45,
                    startStr: slot.start, endStr: slot.end });
            });
        });
    });

    if (!allSlots.length) {
        showToast('No scheduled class times to export. Add a schedule to your classes first.');
        return;
    }

    // Time axis: earliest start rounded down to 15 min, latest end rounded up
    const gridStart = Math.floor(Math.min(...allSlots.map(s => s.startMin)) / 15) * 15;
    const gridEnd   = Math.ceil( Math.max(...allSlots.map(s => s.endMin))   / 15) * 15;
    const gridSpan  = gridEnd - gridStart; // total minutes shown

    // Height constants (px per minute in the rendered grid)
    const PX_PER_MIN = 1.8;   // tweak this to change overall density
    const HEADER_H   = 28;    // day header height px
    const TIME_W     = 54;    // time gutter width px
    const totalH     = Math.round(gridSpan * PX_PER_MIN);

    // Build time axis tick marks every 30 minutes
    const ticks = [];
    for (let m = gridStart; m <= gridEnd; m += 30) {
        ticks.push(m);
    }

    // For each day, detect overlapping slots and assign column offsets
    // slots on the same day overlap if their time ranges intersect
    function getOverlapGroups(daySlots) {
        // Sort by start
        const sorted = [...daySlots].sort((a, b) => a.startMin - b.startMin);
        // Assign each slot a column index within the day cell
        const cols = []; // cols[i] = end time of last slot in column i
        sorted.forEach(slot => {
            let placed = false;
            for (let ci = 0; ci < cols.length; ci++) {
                if (slot.startMin >= cols[ci]) {
                    slot._col = ci;
                    slot._colCount = 1; // will update after
                    cols[ci] = slot.endMin;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                slot._col = cols.length;
                slot._colCount = 1;
                cols.push(slot.endMin);
            }
        });
        // Total columns needed for this day
        const totalCols = cols.length;
        sorted.forEach(slot => { slot._totalCols = totalCols; });
        return sorted;
    }

    // Group and lay out slots per day
    const daySlots = {};
    DAYS.forEach(d => { daySlots[d] = []; });
    allSlots.forEach(s => daySlots[s.dow].push(s));
    DAYS.forEach(d => { daySlots[d] = getOverlapGroups(daySlots[d]); });

    // Build one column div per day
    const dayCols = DAYS.map((dow, di) => {
        const slots = daySlots[dow];
        const blocks = slots.map(slot => {
            const top   = Math.round((slot.startMin - gridStart) * PX_PER_MIN);
            const height= Math.max(Math.round((slot.endMin - slot.startMin) * PX_PER_MIN) - 2, 18);
            const leftPct  = slot._col / slot._totalCols * 100;
            const widthPct = 100 / slot._totalCols;
            const sessLabel = slot.slotCount > 1
                ? '<span class="sess-lbl">S' + (slot.slotIndex + 1) + '</span>' : '';
            const altLabel = slot.cls.everyOtherWeek
                ? '<span class="alt-lbl">Wk\u00a0' + (slot.cls.startingWeek || 'A') + '</span>' : '';
            const timeLabel = slot.endStr
                ? fmt12(slot.startStr) + '\u2013' + fmt12(slot.endStr)
                : fmt12(slot.startStr);
            const showSub  = height >= 30;
            const showTime = height >= 22;
            const showRoom = height >= 40 && slot.cls.room;
            return '<div class="blk" style="'
                + 'top:' + top + 'px;'
                + 'height:' + height + 'px;'
                + 'left:' + leftPct.toFixed(1) + '%;'
                + 'width:calc(' + widthPct.toFixed(1) + '% - 2px);'
                + 'border-left:3px solid ' + (slot.cls.color || '#FF6B9D') + ';'
                + 'background:' + (slot.cls.color || '#FF6B9D') + '22;'
                + '">'
                + '<div class="blk-name">' + slot.cls.name + sessLabel + altLabel + '</div>'
                + (showSub  && slot.cls.subject ? '<div class="blk-sub">' + slot.cls.subject + '</div>' : '')
                + (showTime ? '<div class="blk-time">' + timeLabel + '</div>' : '')
                + (showRoom ? '<div class="blk-room">Rm\u00a0' + slot.cls.room + '</div>' : '')
                + '</div>';
        }).join('');
        return '<div class="day-col">' + blocks + '</div>';
    }).join('');

    // Build time gutter tick marks
    const gutterTicks = ticks.map(m => {
        const top = Math.round((m - gridStart) * PX_PER_MIN);
        const label = fmt12(
            String(Math.floor(m / 60)).padStart(2,'0') + ':' + String(m % 60).padStart(2,'0')
        );
        return '<div class="tick" style="top:' + top + 'px">' + label + '</div>';
    }).join('');

    // Horizontal grid lines at every 30-min tick
    const gridLines = ticks.map(m => {
        const top = Math.round((m - gridStart) * PX_PER_MIN);
        return '<div class="grid-line" style="top:' + top + 'px"></div>';
    }).join('');

    // Legend
    const uniqueIds = [...new Set(allSlots.map(s => s.cls.id))];
    const legendHtml = uniqueIds.map(id => {
        const cls = classes.find(c => c.id === id);
        if (!cls) return '';
        return '<div class="leg-item"><div class="leg-dot" style="background:' + (cls.color||'#FF6B9D') + '"></div>'
            + '<span>' + cls.name + (cls.subject ? ' \u2014 ' + cls.subject : '') + '</span></div>';
    }).join('');
    const altNote = allSlots.some(s => s.cls.everyOtherWeek)
        ? '<p class="alt-note">\u26a0\ufe0f Classes marked \u201cWk A/B\u201d meet every other week.</p>' : '';

    const teacherName = (settings.userProfile && settings.userProfile.displayName) || aiSettings.teacherName || '';
    const schoolYear  = settings.schoolYear || '';
    const genDate     = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

    // Day header row
    const dayHeaders = DAY_LABELS.map(d => '<div class="day-hdr">' + d + '</div>').join('');

    const css = [
        '* { box-sizing:border-box; margin:0; padding:0; }',
        'body { font-family:"Segoe UI",Arial,sans-serif; font-size:11px; color:#1a1a2e; background:#fff; }',
        '@page { size:landscape; margin:0.4in 0.45in; }',
        '@media print { body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }',
        '.hdr { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #9D4EDD; padding-bottom:6px; margin-bottom:10px; }',
        '.hdr-l h1 { font-size:18px; color:#9D4EDD; font-weight:800; }',
        '.hdr-l p  { font-size:10px; color:#555; margin-top:2px; }',
        '.hdr-r    { text-align:right; font-size:9px; color:#666; line-height:1.7; }',
        /* grid wrapper */
        '.grid-wrap { display:flex; width:100%; }',
        /* time gutter */
        '.time-gutter { width:' + TIME_W + 'px; flex-shrink:0; position:relative; height:' + totalH + 'px; margin-top:' + HEADER_H + 'px; }',
        '.tick { position:absolute; right:4px; font-size:8px; color:#888; transform:translateY(-50%); white-space:nowrap; }',
        /* day columns area */
        '.days-wrap { flex:1; display:flex; flex-direction:column; }',
        '.day-hdrs { display:flex; height:' + HEADER_H + 'px; }',
        '.day-hdr { flex:1; text-align:center; font-size:11px; font-weight:700; color:#fff; background:#9D4EDD; display:flex; align-items:center; justify-content:center; border-left:1px solid #7b3ab3; }',
        '.day-hdr:first-child { border-left:none; }',
        '.days-body { display:flex; flex:1; position:relative; height:' + totalH + 'px; }',
        '.grid-line { position:absolute; left:0; right:0; height:1px; background:#e8e0f5; pointer-events:none; }',
        '.day-col { flex:1; position:relative; border-left:1px solid #e8e0f5; height:' + totalH + 'px; }',
        '.day-col:first-child { border-left:none; }',
        /* class blocks */
        '.blk { position:absolute; border-radius:3px; padding:2px 4px; overflow:hidden; cursor:default; }',
        '.blk-name { font-size:9.5px; font-weight:700; line-height:1.2; display:flex; align-items:center; gap:2px; flex-wrap:wrap; }',
        '.blk-sub  { font-size:8px; color:#444; margin-top:1px; line-height:1.2; }',
        '.blk-time { font-size:7.5px; color:#666; margin-top:1px; }',
        '.blk-room { font-size:7.5px; color:#888; }',
        '.sess-lbl { font-size:7px; font-weight:800; background:rgba(0,0,0,0.13); border-radius:2px; padding:0 2px; }',
        '.alt-lbl  { font-size:7px; font-weight:700; background:#fff3cd; color:#856404; border:1px solid #ffc107; border-radius:2px; padding:0 2px; }',
        /* legend */
        '.legend { margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; }',
        '.leg-item { display:flex; align-items:center; gap:4px; font-size:9.5px; color:#333; }',
        '.leg-dot  { width:10px; height:10px; border-radius:2px; flex-shrink:0; }',
        '.alt-note { margin-top:5px; font-size:9px; color:#888; }'
    ].join('\n');

    const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">'
        + '<title>Weekly Class Schedule</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n'
        + '<div class="hdr">'
        +   '<div class="hdr-l"><h1>\ud83d\udcc5 Weekly Class Schedule</h1>'
        +   '<p>' + (teacherName ? teacherName + ' \u00b7 ' : '') + (schoolYear ? 'School Year ' + schoolYear + ' \u00b7 ' : '') + 'Generated ' + genDate + '</p></div>'
        +   '<div class="hdr-r"><div>' + classes.length + ' class' + (classes.length !== 1 ? 'es' : '') + '</div></div>'
        + '</div>\n'
        + '<div class="grid-wrap">'
        +   '<div class="time-gutter">' + gutterTicks + '</div>'
        +   '<div class="days-wrap">'
        +     '<div class="day-hdrs">' + dayHeaders + '</div>'
        +     '<div class="days-body">'
        +       gridLines
        +       dayCols
        +     '</div>'
        +   '</div>'
        + '</div>\n'
        + '<div class="legend">' + legendHtml + '</div>' + altNote
        + '\n</body>\n</html>';

    const win = openPrintWindow();
    win.document.write(preparePrintDoc(html, {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 400);
}

function updateClassDropdown() {
    if (!elements.lessonClass) return;
    
    elements.lessonClass.innerHTML = '<option value="">Select a class...</option>';
    classes.forEach(cls => {
        elements.lessonClass.innerHTML += `<option value="${cls.id}">${escHtml(cls.name)}</option>`;
    });
}

elements.addClassBtn.addEventListener('click', () => openClassModal());

// ==================== SETTINGS ====================

// Background Picker
function applyBackground(bg, customUrl = null) {
    document.body.classList.remove('bg-classroom', 'bg-beach', 'bg-mountains', 'bg-forest', 'bg-custom');
    
    // Remove any custom background image
    document.body.style.removeProperty('--custom-bg');
    const beforeStyle = document.getElementById('custom-bg-style');
    if (beforeStyle) beforeStyle.remove();
    
    if (bg && bg !== 'classroom') {
        document.body.classList.add(`bg-${bg}`);
    }
    
    // Apply custom background image
    if (bg === 'custom' && customUrl) {
        const style = document.createElement('style');
        style.id = 'custom-bg-style';
        style.textContent = `body.bg-custom::before { background-image: url('${customUrl}') !important; }`;
        document.head.appendChild(style);
    }
}

function initBackgroundPicker() {
    const bgOptions = document.querySelectorAll('input[name="background"]');
    const customUploadSection = document.getElementById('custom-upload-section');
    const bgUpload = document.getElementById('bg-upload');
    const customPreview = document.getElementById('custom-bg-preview');
    
    bgOptions.forEach(option => {
        option.addEventListener('change', async (e) => {
            const bg = e.target.value;
            settings.background = bg;
            
            // Show/hide custom upload section
            if (bg === 'custom') {
                customUploadSection.classList.remove('hidden');
                // Apply existing custom background if available
                if (settings.customBgUrl) {
                    applyBackground(bg, settings.customBgUrl);
                } else {
                    applyBackground(bg);
                }
            } else {
                customUploadSection.classList.add('hidden');
                applyBackground(bg);
            }
            
            // Save to Firestore
            if (currentUser) {
                try {
                    await db.collection('users').doc(currentUser.uid)
                        .collection('settings').doc('schoolYear').set(settings);
                    showToast('Background updated!');
                } catch (error) {
                    console.error('Error saving background:', error);
                }
            }
        });
    });
    
    // Handle custom image upload
    bgUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Check file size (max 2MB for localStorage)
        if (file.size > 2 * 1024 * 1024) {
            showToast('Image too large. Please use an image under 2MB.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const dataUrl = event.target.result;
            
            // Update preview
            customPreview.style.backgroundImage = `url('${dataUrl}')`;
            customPreview.style.backgroundSize = 'cover';
            customPreview.style.backgroundPosition = 'center';
            customPreview.querySelector('.bg-icon').style.display = 'none';
            
            // Save to settings and apply
            settings.customBgUrl = dataUrl;
            settings.background = 'custom';
            applyBackground('custom', dataUrl);
            
            // Save to Firestore
            if (currentUser) {
                try {
                    await db.collection('users').doc(currentUser.uid)
                        .collection('settings').doc('schoolYear').set(settings);
                    showToast('Custom background saved!');
                } catch (error) {
                    console.error('Error saving background:', error);
                    showToast('Error saving background');
                }
            }
        };
        reader.readAsDataURL(file);
    });
}

// Initialize background picker on DOM ready
document.addEventListener('DOMContentLoaded', initBackgroundPicker);

// School year change handler
elements.schoolYear.addEventListener('change', async () => {
    const newYear = elements.schoolYear.value;
    const prevYear = settings.schoolYear;
    settings.schoolYear = newYear;
    
    showLoading();
    try {
        // Load data for the new school year FIRST; only remember the choice
        // once it loaded (v6.2.0 -- a failed load used to leave the spinner up
        // and point every later save at the new year while old data showed).
        await loadSchoolYearData(newYear);

        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear').set(settings, { merge: true });
        try { localStorage.setItem('plany_last_school_year', settings.schoolYear); } catch(e) {}
        
        // Month view opens on August of the new year; week view stays on this week
        const startYear = parseInt(newYear.split('-')[0]);
        currentDate = new Date(startYear, 7, 1);
        currentWeekStart = getWeekStart(new Date());
        
        updateSchoolYearDisplay();
        showToast(`Switched to ${newYear}`);
    } catch (error) {
        console.error('Error switching school year:', error);
        settings.schoolYear = prevYear;
        elements.schoolYear.value = prevYear;
        try { await loadSchoolYearData(prevYear); } catch (e2) { console.error('Reloading previous year failed:', e2); }
        showToast(`Couldn't open ${newYear}. You're still in ${prevYear}. Check your connection and try again.`);
    } finally {
        hideLoading();
    }
});

function renderBreaks() {
    if (!elements.breaksList) return;
    
    if (!settings.breaks || settings.breaks.length === 0) {
        elements.breaksList.innerHTML = '';
        return;
    }
    
    elements.breaksList.innerHTML = settings.breaks.map((brk, i) => `
        <div class="break-item">
            <div class="break-info">
                <div>${escHtml(brk.name)}</div>
                <div class="break-dates">${brk.start} to ${brk.end}</div>
            </div>
            <button class="btn btn-icon" data-index="${i}" title="Delete">×</button>
        </div>
    `).join('');
    
    elements.breaksList.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', async () => {
            settings.breaks.splice(parseInt(btn.dataset.index), 1);
            const yearPath = db.collection('users').doc(currentUser.uid).collection('years').doc(settings.schoolYear);
            await yearPath.collection('settings').doc('breaks').set({ breaks: settings.breaks });
            renderBreaks();
            updateSchoolYearDisplay();
            showToast('Break removed');
        });
    });
}

elements.addBreakBtn.addEventListener('click', async () => {
    const name = elements.breakName.value.trim();
    const start = elements.breakStart.value;
    const end = elements.breakEnd.value;
    
    if (!name || !start || !end) {
        showToast('Please fill all break fields');
        return;
    }
    
    if (!settings.breaks) settings.breaks = [];
    settings.breaks.push({ name, start, end });
    
    try {
        const yearPath = db.collection('users').doc(currentUser.uid).collection('years').doc(settings.schoolYear);
        await yearPath.collection('settings').doc('breaks').set({ breaks: settings.breaks });
        elements.breakName.value = '';
        elements.breakStart.value = '';
        elements.breakEnd.value = '';
        renderBreaks();
        updateSchoolYearDisplay();
        updateYearChecklist();
        showToast('Break added!');
    } catch (error) {
        showToast('Error adding break');
    }
});

// ==================== MODALS ====================

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById('standards-picker')?.classList.add('hidden');
    document.getElementById('copy-lesson-picker')?.classList.add('hidden');
    document.getElementById('copy-day-picker')?.classList.add('hidden');
    closeCopyWeekPicker();
    document.getElementById('unit-modal')?.classList.add('hidden');
    document.getElementById('curriculum-gen-modal')?.classList.add('hidden');
    document.getElementById('student-modal')?.classList.add('hidden');
    document.getElementById('assignment-modal')?.classList.add('hidden');
    document.getElementById('diff-modal')?.classList.add('hidden');
    document.getElementById('gc-modal')?.classList.add('hidden');
    document.getElementById('grade-settings-modal')?.classList.add('hidden');
    document.getElementById('attendance-modal')?.classList.add('hidden');
    document.getElementById('teams-modal')?.classList.add('hidden');
    document.getElementById('moodle-modal')?.classList.add('hidden');
    document.getElementById('sis-modal')?.classList.add('hidden');
    document.getElementById('comm-modal')?.classList.add('hidden');
    closeSeatPicker();
    document.getElementById('unit-standards-picker')?.classList.add('hidden');
}

function closeModal(modal) {
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ── Styled confirm / alert (v6.4.0) ────────────────────────────────────
// Replaces the browser's confirm()/alert() boxes, which looked foreign,
// blocked the page, and in the installed app could be suppressed entirely.
// planyConfirm(message, { okText, cancelText, danger }) -> Promise<boolean>
function _planyDialog({ message, okText = 'OK', cancelText = null, danger = false, title = '' }) {
    return new Promise(resolve => {
        const prevFocus = document.activeElement;
        const wrap = document.createElement('div');
        wrap.className = 'plany-dialog';
        wrap.innerHTML = `<div class="plany-dialog-box" role="alertdialog" aria-modal="true" aria-labelledby="plany-dialog-msg">
            ${title ? `<div class="plany-dialog-title">${escHtml(title)}</div>` : ''}
            <div class="plany-dialog-msg" id="plany-dialog-msg"></div>
            <div class="plany-dialog-actions">
                ${cancelText ? `<button type="button" class="btn btn-secondary plany-dialog-cancel">${escHtml(cancelText)}</button>` : ''}
                <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} plany-dialog-ok">${escHtml(okText)}</button>
            </div>
        </div>`;
        wrap.querySelector('.plany-dialog-msg').textContent = message;
        document.body.appendChild(wrap);
        const ok = wrap.querySelector('.plany-dialog-ok');
        const cancel = wrap.querySelector('.plany-dialog-cancel');
        const done = (val) => {
            wrap.remove();
            try { if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true }); } catch (_) {}
            resolve(val);
        };
        ok.addEventListener('click', () => done(true));
        cancel?.addEventListener('click', () => done(false));
        wrap.addEventListener('click', (e) => { if (e.target === wrap) done(false); });
        wrap.addEventListener('keydown', (e) => {
            e.stopPropagation();   // don't let Esc/Tab reach the modal handlers underneath
            if (e.key === 'Escape') { e.preventDefault(); done(false); }
            else if (e.key === 'Tab') {
                const btns = [cancel, ok].filter(Boolean);
                const i = btns.indexOf(document.activeElement);
                e.preventDefault();
                btns[(i + (e.shiftKey ? btns.length - 1 : 1)) % btns.length].focus();
            }
        });
        // Destructive questions focus Cancel, so a stray Enter doesn't delete
        (danger && cancel ? cancel : ok).focus();
    });
}
function planyConfirm(message, opts = {}) {
    const danger = opts.danger ?? /\b(delete|remove|clear|revoke|cannot be undone|without saving)\b/i.test(message);
    return _planyDialog({ message, okText: opts.okText || (danger ? 'Yes, continue' : 'OK'), cancelText: opts.cancelText || 'Cancel', danger, title: opts.title || '' });
}
function planyAlert(message, opts = {}) {
    return _planyDialog({ message, okText: opts.okText || 'OK', title: opts.title || '' });
}
function planyDialogOpen() { return !!document.querySelector('.plany-dialog'); }

// ── Unsaved-change guard (v6.2.0) ─────────────────────────────────────
// Typing in a modal marks it "dirty". Esc, the backdrop and the × button
// then ask before throwing the changes away. (Save buttons close modals
// directly and aren't affected.) The dirty flag resets whenever a modal
// is opened, and modals are tracked in the order they open so Esc closes
// only the one on top -- not the lesson modal underneath a picker.
const _modalOpenOrder = [];
(function initModalTracking() {
    const obs = new MutationObserver(muts => {
        muts.forEach(m => {
            const el = m.target;
            const visible = !el.classList.contains('hidden');
            const idx = _modalOpenOrder.indexOf(el);
            if (visible && idx === -1) { el.dataset.dirty = ''; _modalOpenOrder.push(el); onModalOpened(el); }
            if (!visible && idx !== -1) { _modalOpenOrder.splice(idx, 1); onModalClosed(el); }
        });
    });
    document.querySelectorAll('.modal').forEach(modal => {
        obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
        modal.addEventListener('input', (e) => {
            if (e.isTrusted && e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [contenteditable]')) {
                modal.dataset.dirty = '1';
            }
        });
    });
})();

// ── Accessible dialogs (v6.3.0) ───────────────────────────────────────
// Every .modal becomes a proper dialog: role/aria-modal/label, focus moves
// in when it opens, Tab stays inside it, and focus goes back to whatever
// opened it when it closes.
const FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function visibleFocusables(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE_SEL)).filter(el => el.offsetParent !== null || el === document.activeElement);
}
let _modalA11yCounter = 0;
function onModalOpened(modal) {
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (!modal.hasAttribute('aria-labelledby') && !modal.hasAttribute('aria-label')) {
        const h = modal.querySelector('h1, h2, h3');
        if (h) { if (!h.id) h.id = 'modal-title-' + (++_modalA11yCounter); modal.setAttribute('aria-labelledby', h.id); }
    }
    const opener = document.activeElement;
    if (opener && opener !== document.body && !modal.contains(opener)) modal._returnFocus = opener;
    // Let the opener finish filling the form, then focus the first field
    // (or the close button) unless something inside already has focus.
    setTimeout(() => {
        if (modal.classList.contains('hidden') || modal.contains(document.activeElement)) return;
        // On touch screens don't focus a text field (it would pop the keyboard
        // over the form); focus the dialog itself instead.
        const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const f = visibleFocusables(modal);
        let target = touch ? null : (f.find(el => el.matches('input, select, textarea')) || f[0]);
        if (!target) {
            target = modal.querySelector('.modal-content') || modal;
            if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        }
        try { target.focus({ preventScroll: true }); } catch (_) {}
    }, 60);
}
function onModalClosed(modal) {
    const back = modal._returnFocus;
    modal._returnFocus = null;
    if (back && document.contains(back) && !topOpenModalOrNull()) { try { back.focus({ preventScroll: true }); } catch (_) {} }
}
function topOpenModalOrNull() {
    for (let i = _modalOpenOrder.length - 1; i >= 0; i--) {
        if (!_modalOpenOrder[i].classList.contains('hidden')) return _modalOpenOrder[i];
    }
    return null;
}
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || planyDialogOpen()) return;
    const modal = topOpenModalOrNull();
    if (!modal) return;
    const f = visibleFocusables(modal);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// Icon-only buttons get a spoken name (their tooltip, or "Close" for ×).
function labelIconButtons(root = document) {
    root.querySelectorAll('.modal-close:not([aria-label])').forEach(b => b.setAttribute('aria-label', 'Close'));
    root.querySelectorAll('button[title]:not([aria-label])').forEach(b => {
        if (!/[A-Za-z]{2,}/.test(b.textContent || '')) b.setAttribute('aria-label', b.getAttribute('title'));
    });
}
labelIconButtons();
document.getElementById('toast')?.setAttribute('aria-live', 'polite');

// v6.5.0: most form labels sat next to their field without for="", so
// screen readers read the field with no name. Connect each loose <label>
// to the field right after it, and give label-less fields their placeholder
// as a name.
let _autoFieldId = 0;
function associateFormLabels(root = document) {
    const FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea';
    root.querySelectorAll('label:not([for])').forEach(label => {
        if (label.querySelector('input, select, textarea')) return;          // wraps its field already
        let el = label.nextElementSibling, field = null;
        for (let hops = 0; el && hops < 3 && !field; hops++, el = el.nextElementSibling) {
            field = el.matches(FIELD) ? el : el.querySelector(FIELD);
        }
        if (!field) return;
        if (!field.id) field.id = 'auto-field-' + (++_autoFieldId);
        if (!document.querySelector(`label[for="${field.id}"]`)) label.htmlFor = field.id;
    });
    root.querySelectorAll(FIELD).forEach(f => {
        const named = f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') ||
            (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) || f.closest('label');
        if (named || f.type === 'file') return;
        const prevText = (f.previousElementSibling && /^(SPAN|LABEL|STRONG|B)$/.test(f.previousElementSibling.tagName))
            ? f.previousElementSibling.textContent.trim().replace(/[:：]\s*$/, '') : '';
        const name = f.placeholder || f.title || prevText ||
            (f.id ? f.id.replace(/[-_]+/g, ' ').replace(/\b(pm|gb|qr|es|sub|ai)\b/g, '').trim() : '');
        if (name) f.setAttribute('aria-label', name);
    });
}
associateFormLabels();

function topOpenModal() {
    for (let i = _modalOpenOrder.length - 1; i >= 0; i--) {
        if (!_modalOpenOrder[i].classList.contains('hidden')) return _modalOpenOrder[i];
    }
    return document.querySelector('.modal:not(.hidden)');
}

// Close a modal the user dismissed (Esc / backdrop / ×). Returns false if
// they chose to keep editing.
async function dismissModal(modal) {
    if (!modal) return true;
    if (modal.dataset.dirty === '1' && !(await planyConfirm('You have unsaved changes. Close without saving?', { okText: 'Discard changes', cancelText: 'Keep editing', danger: true }))) return false;
    modal.dataset.dirty = '';
    closeModal(modal);
    return true;
}

// Close button handlers - close only the parent modal
document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const modal = e.target.closest('.modal');
        // "Cancel" is an explicit discard; the × asks first if there are edits.
        if (btn.classList.contains('modal-cancel')) { if (modal) modal.dataset.dirty = ''; closeModal(modal); }
        else dismissModal(modal);
    });
});

// Click outside modal to close only that modal
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            dismissModal(modal);
        }
    });
});

// ESC key closes only the top-most modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !planyDialogOpen()) {
        const openModal = topOpenModal();
        if (openModal) {
            e._planyModalHandled = true;
            dismissModal(openModal);
        }
    }
});

// Day Modal
function openDayModal(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    elements.dayModalTitle.textContent = `📅 ${formatDisplayDate(date)}`;
    elements.dayModal.dataset.date = dateStr;
    
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayOfWeek = dayNames[date.getDay()];
    
    // Get classes for this day, sorted by time
    // Automatically cancel classes on holidays/off-days
    const dayIsOff = isOffDay(dateStr);
    const _modalDayClasses = dayIsOff ? [] : classes.filter(cls => cls.schedule && cls.schedule[dayOfWeek] && isClassActiveOnDate(cls, dateStr));
    const modalClassSlots = getSortedClassSlots(_modalDayClasses, dayOfWeek);
    const classesListEl = document.getElementById('day-classes-list');
    
    if (dayIsOff) {
        classesListEl.innerHTML = '<div class="empty-state">🏖️ No School – All classes cancelled for this day</div>';
    } else if (modalClassSlots.length === 0) {
        classesListEl.innerHTML = '<div class="empty-state">No classes scheduled for this day</div>';
    } else {
        const dayLessons = lessons.filter(l => l.date === dateStr);
        const rows = [];
        modalClassSlots.forEach(({ cls, slotIndex: si, slot, slotCount }) => {
                const slotTimeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dayOfWeek);
                const lesson = findLessonForSlot(dayLessons, cls.id, si);
                const hasLesson = !!lesson;
                const isSpanAll = hasLesson && lesson.slotIndex === -1;
                const sessionLabel = slotCount > 1
                    ? (isSpanAll ? ' · 📋 All sessions' : ` · Session ${si + 1}`)
                    : '';
                rows.push(`
                    <div class="day-class-item" data-class-id="${cls.id}" data-date="${dateStr}" data-slot-index="${si}">
                        <div class="day-class-info">
                            <div class="day-class-color" style="background: ${cls.color || '#FF6B9D'}"></div>
                            <div class="day-class-details">
                                <h4>${escHtml(cls.name)}${sessionLabel}</h4>
                                <p>${slotTimeStr}${cls.room ? ' • ' + cls.room : ''}</p>
                            </div>
                        </div>
                        <span class="day-class-status ${hasLesson ? 'has-lesson' : 'no-lesson'}">
                            ${hasLesson ? '✓ ' + escHtml(lesson.title || 'Lesson planned') : '+ Add lesson'}
                        </span>
                    </div>
                `);
        });
        classesListEl.innerHTML = rows.join('');
        
        // Add click handlers for class items
        classesListEl.querySelectorAll('.day-class-item').forEach(item => {
            item.addEventListener('click', () => {
                const classId = item.dataset.classId;
                const date = item.dataset.date;
                const si = parseInt(item.dataset.slotIndex || '0') || 0;
                const cls = classes.find(c => c.id === classId);
                closeAllModals();
                openLessonModalForClass(cls, date, si);
            });
        });
    }
    
    // Get events for this day
    const dayEvents = events.filter(e => {
        const start = e.startDate;
        const end = e.endDate || e.startDate;
        return dateStr >= start && dateStr <= end;
    });
    const eventsListEl = document.getElementById('day-events-list');
    
    if (dayEvents.length === 0) {
        eventsListEl.innerHTML = '<div class="empty-state">No events for this day</div>';
    } else {
        const typeIcons = {
            'event': '📌',
            'first-day': '🎒',
            'last-day': '🎉',
            'holiday': '🏖️',
            'meeting': '👥',
            'assembly': '🎤',
            'field-trip': '🚌',
            'testing': '📝',
            'deadline': '⚠️'
        };
        
        eventsListEl.innerHTML = dayEvents.map(event => `
            <div class="day-event-item" data-event-id="${event.id}">
                <div class="day-event-info">
                    <span class="day-event-type">${typeIcons[event.type] || '📌'}</span>
                    <div class="day-event-details">
                        <h4>${escHtml(event.title)}</h4>
                        <p>${event.startTime ? event.startTime : 'All day'}${event.endDate && event.endDate !== event.startDate ? ' • Multi-day' : ''}</p>
                    </div>
                </div>
            </div>
        `).join('');
        
        // Add click handlers for event items
        eventsListEl.querySelectorAll('.day-event-item').forEach(item => {
            item.addEventListener('click', () => {
                const eventId = item.dataset.eventId;
                const event = events.find(e => e.id === eventId);
                closeAllModals();
                openEventModal(event);
            });
        });
    }
    
    elements.dayModal.classList.remove('hidden');
}

// Open lesson modal for a specific class
// Shows/wires the session-mode chooser (One lesson spans all sessions / This
// session only) for a multi-slot class. Used both when creating a brand new
// lesson AND when editing an existing per-session lesson, so a lesson that
// was originally created for just one session can later be promoted to span
// every session that day (or narrowed back down) without deleting it.
// Bulk-converts every Session 1 lesson for a class to "spans all sessions,"
// merging away any sibling per-slot lesson on the same day (e.g. a separate
// Session 2 lesson that's now redundant). Backs the class-level "Spread
// Session 1 lessons across all sessions" toggle so a whole class's lesson
// history can be migrated at once instead of switching one lesson at a time.
async function bulkSpreadSessionsForClass(classId) {
    const session1Lessons = lessons.filter(l =>
        l.classId === classId &&
        (l.slotIndex === 0 || l.slotIndex === undefined || l.slotIndex === null)
    );
    if (session1Lessons.length === 0) return { converted: 0, merged: 0 };

    const yearPath = getYearPath();
    const ops = [];
    const deleteIds = [];
    let converted = 0;

    session1Lessons.forEach(lesson => {
        ops.push({ type: 'update', ref: yearPath.collection('lessons').doc(lesson.id), data: { slotIndex: -1 } });
        lesson.slotIndex = -1;
        converted++;

        lessons.filter(l =>
            l.id !== lesson.id &&
            l.classId === classId &&
            l.date === lesson.date &&
            l.slotIndex !== -1
        ).forEach(sibling => {
            ops.push({ type: 'delete', ref: yearPath.collection('lessons').doc(sibling.id) });
            deleteIds.push(sibling.id);
        });
    });

    // Chunk writes to stay safely under Firestore's 500-operation batch limit.
    const CHUNK = 400;
    for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = db.batch();
        ops.slice(i, i + CHUNK).forEach(op => {
            if (op.type === 'update') batch.update(op.ref, op.data);
            else batch.delete(op.ref);
        });
        await batch.commit();
    }

    if (deleteIds.length > 0) {
        lessons = lessons.filter(l => !deleteIds.includes(l.id));
    }
    return { converted, merged: deleteIds.length };
}

// Computes a lesson's duration (in minutes) straight from the class's actual
// scheduled time for that day, instead of teachers having to remember and
// re-type their own bell schedule every time. Returns null when there's no
// usable start/end time to compute from (leaves the field as-is in that case).
function computeClassDurationMinutes(cls, dateStr, slotIndex) {
    if (!cls || !dateStr) return null;
    const dow = ['sun','mon','tue','wed','thu','fri','sat'][new Date(dateStr + 'T00:00:00').getDay()];
    const slots = getTimeSlotsForDay(cls, dow);
    if (slots.length === 0) return null;

    const slotMinutes = (slot) => {
        if (!slot?.start || !slot?.end) return null;
        const [sh, sm] = slot.start.split(':').map(Number);
        const [eh, em] = slot.end.split(':').map(Number);
        if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return null;
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        return diff > 0 ? diff : null;
    };

    if (slotIndex === -1) {
        // "Spans all sessions" -- total actual instructional minutes across
        // every session that day, not the elapsed clock time between them.
        const total = slots.reduce((sum, s) => sum + (slotMinutes(s) || 0), 0);
        return total > 0 ? total : null;
    }

    return slotMinutes(slots[slotIndex] || slots[0]);
}

// Re-reads the currently selected class/date/slot and fills the Duration
// field from the class's schedule. Only wired to genuine user actions
// (picking a class, toggling session mode, or pre-filling a brand-new
// lesson) -- never called on a bare modal open, so it can't silently
// overwrite a duration someone already saved for an existing lesson.
function autoFillLessonDuration(slotIndexOverride) {
    const classId = elements.lessonClass?.value;
    const cls = classId ? classes.find(c => c.id === classId) : null;
    const dateStr = elements.lessonDate?.value;
    const slotIndex = slotIndexOverride !== undefined
        ? slotIndexOverride
        : (parseInt(document.getElementById('lesson-slot-index')?.value || '0') || 0);
    const mins = computeClassDurationMinutes(cls, dateStr, slotIndex);
    if (mins && elements.lessonDuration) elements.lessonDuration.value = mins;
}

function setupSessionModeChooser(cls, dateStr, slotIndex, defaultToSpan) {
    const slotField = document.getElementById('lesson-slot-index');
    const chooser = document.getElementById('session-mode-chooser');
    if (!chooser || !cls || !dateStr) { chooser?.classList.add('hidden'); return; }

    const dow = ['sun','mon','tue','wed','thu','fri','sat'][new Date(dateStr + 'T00:00:00').getDay()];
    const slots = getTimeSlotsForDay(cls, dow);
    if (slots.length <= 1) { chooser.classList.add('hidden'); return; }

    // The "this session only" label always shows the specific session number,
    // even while "span all" is selected, so switching back is unambiguous.
    const specificSlot = slotIndex === -1 ? 0 : slotIndex;
    const splitLabel = document.getElementById('session-mode-split-label-text');
    if (splitLabel) splitLabel.textContent = `Session ${specificSlot + 1} of ${slots.length}`;

    const spanRadio = document.getElementById('session-mode-span');
    const splitRadio = document.getElementById('session-mode-split');
    const useSpan = defaultToSpan !== undefined ? defaultToSpan : (slotIndex === -1);
    if (spanRadio) spanRadio.checked = useSpan;
    if (splitRadio) splitRadio.checked = !useSpan;
    if (slotField) slotField.value = useSpan ? -1 : specificSlot;
    chooser.classList.remove('hidden');

    // Wire radio change to update the hidden slot index (clone first to drop
    // any listeners from a previous time this modal was opened).
    chooser.querySelectorAll('input[name="session-mode"]').forEach(radio => {
        const fresh = radio.cloneNode(true);
        radio.parentNode.replaceChild(fresh, radio);
    });
    document.getElementById('session-mode-span')?.addEventListener('change', () => {
        if (slotField) slotField.value = -1; // span-all sentinel
        autoFillLessonDuration(-1);
    });
    document.getElementById('session-mode-split')?.addEventListener('change', () => {
        if (slotField) slotField.value = specificSlot;
        autoFillLessonDuration(specificSlot);
    });
}

function openLessonModalForClass(cls, dateStr, slotIndex = 0) {
    const dayLessons = lessons.filter(l => l.date === dateStr && l.classId === cls.id);
    const existingLesson = findLessonForSlot(dayLessons, cls.id, slotIndex);

    if (existingLesson) {
        // Existing lesson — open it directly. openLessonModal() itself now
        // re-shows the session-mode chooser so it can still be promoted to
        // (or demoted from) "spans all sessions" from here.
        openLessonModal(existingLesson);
        return;
    }

    // New lesson — open blank modal pre-filled with class + slot
    openLessonModal(null, dateStr);
    elements.lessonClass.value = cls.id;
    const slotField = document.getElementById('lesson-slot-index');
    if (slotField) slotField.value = slotIndex;

    // openLessonModal() already ran updateLessonFormForClassType() once, but
    // at that point the class dropdown was still blank (it's set above, right
    // after). Re-run it now so Activity classes correctly hide the academic
    // fields on a brand-new lesson instead of only after the user manually
    // touches the class dropdown.
    updateLessonFormForClassType();
    // Pre-fill Duration from the class's actual scheduled time for this slot
    // instead of leaving the generic 45-minute default.
    autoFillLessonDuration(slotIndex);

    // Show session-mode chooser only when class has multiple slots on this day.
    // Defaults to "this session only" for a brand new lesson.
    setupSessionModeChooser(cls, dateStr, slotIndex, false);
}

elements.addLessonToDay.addEventListener('click', () => {
    const dateStr = elements.dayModal.dataset.date;
    closeAllModals();
    openLessonModal(null, dateStr);
});

// Current lesson attachments (in-memory while editing)
let currentLessonAttachments = [];

// Lesson Modal
function openLessonModal(lesson = null, dateStr = null) {
    elements.lessonForm.reset();
    elements.lessonId.value = '';
    currentLessonAttachments = [];
    // Always hide chooser on open — openLessonModalForClass re-shows it when appropriate
    document.getElementById('session-mode-chooser')?.classList.add('hidden');
    
    const printBtn = document.getElementById('print-lesson-btn');
    const shareBtn = document.getElementById('share-lesson-btn');
    const recurringSection = document.getElementById('recurring-section');
    const recurringCheckbox = document.getElementById('lesson-recurring');
    const recurringOptions = document.getElementById('recurring-options');
    const linkGroupSelect = document.getElementById('lesson-link-group');
    const partSelector = document.getElementById('link-part-selector');
    
    // Reset recurring options
    if (recurringCheckbox) recurringCheckbox.checked = false;
    if (recurringOptions) recurringOptions.classList.add('hidden');
    
    // Reset linking options
    if (linkGroupSelect) linkGroupSelect.value = '';
    if (partSelector) partSelector.classList.add('hidden');
    
    if (lesson) {
        document.getElementById('modal-title').textContent = '✏️ Edit Lesson';
        // Show active unit badge
        const _activeUnit = lesson.classId ? getActiveUnit(lesson.date, lesson.classId) : null;
        const _badgeEl = document.getElementById('lesson-unit-badge-area');
        if (_badgeEl) _badgeEl.innerHTML = _activeUnit
            ? `<span class="lesson-unit-badge" style="background:${_activeUnit.color||'#7B5EA7'}">📐 ${_activeUnit.name}</span>`
            : '';
        elements.lessonId.value = lesson.id;
        elements.lessonDate.value = lesson.date;
        const lockEl = document.getElementById('lesson-locked');
        if (lockEl) lockEl.checked = lesson.lockedDate === true;
        elements.lessonTitle.value = lesson.title;
        elements.lessonClass.value = lesson.classId || '';
        // Restore slot index (default 0 for legacy lessons)
        const slotField = document.getElementById('lesson-slot-index');
        const _restoredSlotIndex = (lesson.slotIndex === undefined || lesson.slotIndex === null) ? 0 : lesson.slotIndex;
        if (slotField) slotField.value = _restoredSlotIndex;
        // Re-show the session-mode chooser for multi-slot classes so an existing
        // per-session lesson can be promoted to "spans all sessions" (or back)
        // without deleting and recreating it.
        {
            const _lessonCls = lesson.classId ? classes.find(c => c.id === lesson.classId) : null;
            setupSessionModeChooser(_lessonCls, lesson.date, _restoredSlotIndex);
        }
        elements.lessonSubject.value = lesson.subject || '';
        elements.lessonDuration.value = lesson.duration || 45;
        {
            const legacySplit = splitStandardsBlock(lesson.standards || lesson.objectives || '');
            elements.lessonStandards.value = (lesson.learningTarget !== undefined || lesson.successCriteria !== undefined)
                ? (lesson.standards || lesson.objectives || '')
                : legacySplit.standards;
            elements.lessonLearningTarget.value = lesson.learningTarget || legacySplit.learningTarget || '';
            elements.lessonSuccessCriteria.value = lesson.successCriteria || legacySplit.successCriteria || '';
        }
        elements.lessonFlow.value = lesson.flow || '';
        elements.lessonMaterials.value = lesson.materials || '';
        elements.lessonActivities.value = lesson.activities || '';
        currentLessonAttachments = lesson.attachments || [];
        elements.deleteLessonBtn.classList.remove('hidden');
        if (shareBtn) shareBtn.classList.remove('hidden');
        document.getElementById('link-lesson-btn')?.classList.remove('hidden');
        const _cpBtn = document.getElementById('copy-lesson-btn'); if (_cpBtn) _cpBtn.classList.remove('hidden');
        
        // Hide recurring section for existing lessons
        if (recurringSection) recurringSection.style.display = 'none';
        
        // Handle lesson linking
        if (lesson.linkGroupId) {
            if (linkGroupSelect) {
                updateLinkGroupSelect();
                linkGroupSelect.value = lesson.linkGroupId;
            }
            if (partSelector) {
                partSelector.classList.remove('hidden');
                document.getElementById('lesson-part-number').value = lesson.partNumber || 1;
                document.getElementById('lesson-total-parts').value = lesson.totalParts || 3;
            }
            renderLinkedLessonsNav(lesson);
        }
        
        // Check for duplicate
        setTimeout(checkForDuplicate, 100);
    } else {
        document.getElementById('modal-title').textContent = '✏️ Add Lesson';
        elements.lessonDate.value = dateStr || formatDate(new Date());
        elements.deleteLessonBtn.classList.add('hidden');
        if (shareBtn) shareBtn.classList.add('hidden');
        document.getElementById('link-lesson-btn')?.classList.add('hidden');
        const _cpBtnNew = document.getElementById('copy-lesson-btn'); if (_cpBtnNew) _cpBtnNew.classList.add('hidden');
        
        // Show recurring section for new lessons
        if (recurringSection) recurringSection.style.display = 'block';
        
        // Hide linked lessons nav
        document.getElementById('linked-lessons-nav')?.classList.add('hidden');
    }
    
    // Always show print button (works for both new and existing lessons)
    if (printBtn) printBtn.classList.remove('hidden');
    
    // Show/hide the academic lesson-plan fields based on whether the
    // selected class is a placeholder Activity (Lunch, Recess, Electives...).
    updateLessonFormForClassType();
    
    renderLessonAttachments();
    elements.lessonModal.classList.remove('hidden');
}

// Shows the full academic lesson form (Standards, Learning Target, Success
// Criteria, Lesson Flow, Materials) for normal classes, or hides all of that
// and relabels "Activities & Notes" to "Instructions" for classes marked as
// an Activity via the Class modal's "This is an activity" toggle.
function updateLessonFormForClassType() {
    const classId = elements.lessonClass?.value;
    const cls = classId ? classes.find(c => c.id === classId) : null;
    const isActivity = !!cls?.isActivity;

    const academicFields = document.getElementById('lesson-academic-fields');
    if (academicFields) academicFields.classList.toggle('hidden', isActivity);

    const activitiesLabel = document.getElementById('lesson-activities-label');
    if (activitiesLabel) activitiesLabel.textContent = isActivity ? '📝 Instructions' : '📝 Activities & Notes';

    const activitiesTextarea = document.getElementById('lesson-activities');
    if (activitiesTextarea) {
        activitiesTextarea.placeholder = isActivity
            ? 'Instructions for this activity — procedures, expectations, what to bring, etc.'
            : 'Additional activities, differentiation strategies, notes...';
    }
}
elements.lessonClass?.addEventListener('change', () => {
    updateLessonFormForClassType();
    // Picking a class is a deliberate action, so it's safe to refresh
    // Duration to match that class's schedule here too.
    autoFillLessonDuration();
});

// Render attachments list in lesson modal
function renderLessonAttachments() {
    const list = elements.lessonAttachmentsList;
    if (!list) return;
    
    if (currentLessonAttachments.length === 0) {
        list.innerHTML = '<div class="attachments-empty">No files attached</div>';
        return;
    }
    
    list.innerHTML = currentLessonAttachments.map((attachment, index) => {
        const icon = getFileIcon(attachment.type || attachment.name);
        const isCurriculum = attachment.isCurriculumSource;
        
        return `
            <div class="attachment-item ${isCurriculum ? 'curriculum-source' : ''}" data-index="${index}">
                <div class="attachment-info">
                    <span class="attachment-icon">${icon}</span>
                    <div class="attachment-details">
                        <div class="attachment-name">${attachment.name}</div>
                        <div class="attachment-meta">
                            ${attachment.size ? formatFileSize(attachment.size) : ''}
                            ${isCurriculum ? '<span class="attachment-badge">📚 Curriculum Source</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="attachment-actions">
                    <button type="button" class="btn-icon-sm" onclick="removeLessonAttachment(${index})" title="Remove">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// Get file icon based on type/extension
function getFileIcon(typeOrName) {
    const name = (typeOrName || '').toLowerCase();
    if (name.includes('pdf')) return '📄';
    if (name.includes('ppt') || name.includes('presentation')) return '📊';
    if (name.includes('doc') || name.includes('word')) return '📝';
    if (name.includes('xls') || name.includes('sheet')) return '📈';
    if (name.includes('image') || name.includes('png') || name.includes('jpg')) return '🖼️';
    return '📎';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Remove attachment from lesson
function removeLessonAttachment(index) {
    currentLessonAttachments.splice(index, 1);
    renderLessonAttachments();
}

// Add attachment button click
if (elements.addAttachmentBtn) {
    elements.addAttachmentBtn.addEventListener('click', () => {
        elements.lessonFileInput.click();
    });
}

// File input change
if (elements.lessonFileInput) {
    elements.lessonFileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files.length) return;
        
        for (const file of files) {
            // Store file reference (we'll upload on save)
            currentLessonAttachments.push({
                name: file.name,
                type: file.type,
                size: file.size,
                file: file, // Keep file object for upload
                isCurriculumSource: false
            });
        }
        
        renderLessonAttachments();
        e.target.value = ''; // Reset input
    });
}

elements.lessonForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Prepare attachments (remove file objects, keep metadata)
    const attachmentsToSave = currentLessonAttachments.map(att => ({
        name: att.name,
        type: att.type,
        size: att.size,
        isCurriculumSource: att.isCurriculumSource || false,
        curriculumDocId: att.curriculumDocId || null
    }));
    
    // Handle lesson linking
    const linkGroupSelect = document.getElementById('lesson-link-group');
    let linkGroupId = null;
    let partNumber = null;
    let totalParts = null;
    
    if (linkGroupSelect?.value === 'new') {
        linkGroupId = `link_${Date.now()}`;
        partNumber = parseInt(document.getElementById('lesson-part-number')?.value) || 1;
        totalParts = parseInt(document.getElementById('lesson-total-parts')?.value) || 3;
    } else if (linkGroupSelect?.value) {
        linkGroupId = linkGroupSelect.value;
        partNumber = parseInt(document.getElementById('lesson-part-number')?.value) || 1;
        const existingGroup = lessonLinkGroups[linkGroupId];
        totalParts = existingGroup?.[0]?.totalParts || parseInt(document.getElementById('lesson-total-parts')?.value) || 3;
    }
    
    const lessonData = {
        title: elements.lessonTitle.value.trim(),
        date: elements.lessonDate.value,
        classId: elements.lessonClass.value || null,
        slotIndex: parseInt(document.getElementById('lesson-slot-index')?.value || '0') || 0,
        subject: elements.lessonSubject.value.trim(),
        duration: parseInt(elements.lessonDuration.value) || 45,
        standards: elements.lessonStandards.value.trim(),
        learningTarget: elements.lessonLearningTarget.value.trim(),
        successCriteria: elements.lessonSuccessCriteria.value.trim(),
        flow: elements.lessonFlow.value.trim(),
        materials: elements.lessonMaterials.value.trim(),
        activities: elements.lessonActivities.value.trim(),
        attachments: attachmentsToSave,
        lockedDate: document.getElementById('lesson-locked')?.checked === true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Add linking data if applicable
    if (linkGroupId) {
        lessonData.linkGroupId = linkGroupId;
        lessonData.partNumber = partNumber;
        lessonData.totalParts = totalParts;
    }
    
    showLoading();
    try {
        const lessonId = elements.lessonId.value;
        const yearPath = getYearPath();
        
        if (lessonId) {
            // Update existing lesson
            await yearPath.collection('lessons').doc(lessonId).update(lessonData);
            const index = lessons.findIndex(l => l.id === lessonId);
            if (index >= 0) lessons[index] = { ...lessons[index], ...lessonData };
            else lessons.push({ id: lessonId, ...lessonData });   // v6.5.0: never write lessons[-1]

            // If this lesson was just promoted to "spans all sessions," any
            // other per-session lesson still sitting on a different slot that
            // same class/day is now redundant (findLessonForSlot always lets
            // the span-all lesson win, so it would otherwise become an
            // invisible orphan). Clean those up so the merge is complete.
            if (lessonData.slotIndex === -1 && lessonData.classId) {
                const orphans = lessons.filter(l =>
                    l.id !== lessonId &&
                    l.classId === lessonData.classId &&
                    l.date === lessonData.date &&
                    l.slotIndex !== -1
                );
                if (orphans.length > 0) {
                    await Promise.all(orphans.map(o => yearPath.collection('lessons').doc(o.id).delete()));
                    const orphanIds = new Set(orphans.map(o => o.id));
                    lessons = lessons.filter(l => !orphanIds.has(l.id));
                    showToast(`Lesson updated! Merged ${orphans.length} other session${orphans.length > 1 ? 's' : ''} into this one.`);
                } else {
                    showToast('Lesson updated!');
                }
            } else {
                showToast('Lesson updated!');
            }
        } else {
            // Create new lesson
            lessonData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await yearPath.collection('lessons').add(lessonData);
            const newLesson = { id: docRef.id, ...lessonData };
            lessons.push(newLesson);
            
            // Handle recurring lessons
            const isRecurring = document.getElementById('lesson-recurring')?.checked;
            if (isRecurring) {
                // Mark the first lesson with recurring info
                newLesson.recurringGroupId = `recurring_${Date.now()}`;
                newLesson.recurringIndex = 1;
                await yearPath.collection('lessons').doc(docRef.id).update({
                    recurringGroupId: newLesson.recurringGroupId,
                    recurringIndex: 1
                });
                
                // Create additional recurring lessons
                const count = await createRecurringLessons(lessonData, lessonData.date);
                showToast(`Lesson added! Created ${count + 1} recurring lessons.`);
            } else {
                showToast('Lesson added!');
            }
        }
        
        // Reload link groups
        loadLinkGroups();
        
        closeAllModals();
        renderCalendar();
        renderWeek();
        updateStats();
    } catch (error) {
        console.error(error);
        showToast('Error saving lesson');
    }
    hideLoading();
});

elements.deleteLessonBtn.addEventListener('click', async () => {
    if (!await planyConfirm('Delete this lesson?')) return;

    const lessonId = elements.lessonId.value;
    const deletedLesson = lessons.find(l => l.id === lessonId);

    // Offer to shift all later lessons in the same class back one slot to fill the gap.
    // Each lesson takes the previous slot's old date, so the shift always lands on a
    // date the class already met on - no need to separately compute "school days".
    let shiftLessons = [];
    let shiftOldDates = [];
    if (deletedLesson && deletedLesson.classId) {
        const laterLessons = lessons
            .filter(l => l.classId === deletedLesson.classId && l.id !== lessonId && l.date > deletedLesson.date)
            .sort((a, b) => a.date.localeCompare(b.date));
        if (laterLessons.length > 0) {
            const doShift = await planyConfirm(`Also shift the ${laterLessons.length} later lesson(s) in this class back to fill the gap?`, { okText: 'Shift them back', cancelText: 'Leave them', danger: false });
            if (doShift) {
                shiftLessons = laterLessons;
                shiftOldDates = laterLessons.map(l => l.date);
            }
        }
    }

    // New dates for the shifted lessons: lesson[0] takes the deleted date,
    // lesson[1] takes lesson[0]'s old date, and so on down the chain.
    const shiftNewDates = [];
    if (shiftLessons.length > 0) {
        let prevDate = deletedLesson.date;
        for (let i = 0; i < shiftLessons.length; i++) {
            shiftNewDates.push(prevDate);
            prevDate = shiftOldDates[i];
        }
    }

    async function applyShift(dates) {
        if (shiftLessons.length === 0) return;
        const yearPath = getYearPath();
        const batch = db.batch();
        for (let i = 0; i < shiftLessons.length; i++) {
            batch.update(yearPath.collection('lessons').doc(shiftLessons[i].id), { date: dates[i] });
        }
        await batch.commit();
        for (let i = 0; i < shiftLessons.length; i++) {
            const idx = lessons.findIndex(l => l.id === shiftLessons[i].id);
            if (idx !== -1) lessons[idx] = { ...lessons[idx], date: dates[i] };
        }
    }

    showLoading();
    try {
        await getYearPath().collection('lessons').doc(lessonId).delete();
        lessons = lessons.filter(l => l.id !== lessonId);
        await applyShift(shiftNewDates);
        closeAllModals();
        renderCalendar();
        renderWeek();
        updateStats();

        // Record undo action
        if (deletedLesson) {
            let restoredId = null;
            recordAction({
                type: 'delete_lesson',
                data: deletedLesson,
                restore: async () => {
                    await applyShift(shiftOldDates);
                    const { id, ...lessonData } = deletedLesson;
                    const docRef = await getYearPath().collection('lessons').add(lessonData);
                    lessons.push({ id: docRef.id, ...lessonData });
                    restoredId = docRef.id;   // v6.5.0: redo deletes exactly this one
                    renderCalendar();
                    renderWeek();
                    updateStats();
                },
                redo: async () => {
                    const lessonToDelete = lessons.find(l => l.id === restoredId);
                    if (lessonToDelete) {
                        await getYearPath().collection('lessons').doc(lessonToDelete.id).delete();
                        lessons = lessons.filter(l => l.id !== lessonToDelete.id);
                        await applyShift(shiftNewDates);
                        renderCalendar();
                        renderWeek();
                        updateStats();
                    }
                }
            });
        }

        showToast(shiftLessons.length > 0 ? `Lesson deleted - ${shiftLessons.length} later lesson(s) shifted back` : 'Lesson deleted');
    } catch (error) {
        showToast('Error deleting lesson');
    }
    hideLoading();
});

// Class Modal
function openClassModal(cls = null) {
    elements.classForm.reset();
    elements.classId.value = '';
    
    // Reset schedule checkboxes and time inputs
    document.querySelectorAll('.schedule-day input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    document.querySelectorAll('.schedule-day input[type="time"]').forEach(ti => {
        ti.value = '';
    });
    // Remove any extra slot rows from previous edit
    document.querySelectorAll('.schedule-slot-extra').forEach(el => el.remove());
    // Re-show all add-slot buttons in case any were hidden at max capacity
    document.querySelectorAll('.add-slot-btn').forEach(btn => btn.style.display = '');
    
    // Reset every other week
    const everyOtherWeekCb = document.getElementById('every-other-week');
    const weekTypeSelector = document.getElementById('week-type-selector');
    const startingWeekSelect = document.getElementById('starting-week');
    if (everyOtherWeekCb) everyOtherWeekCb.checked = false;
    if (weekTypeSelector) weekTypeSelector.classList.add('hidden');
    if (startingWeekSelect) startingWeekSelect.value = 'A';

    // Reset spread-sessions toggle
    const spreadSessionsCb = document.getElementById('class-spread-sessions');
    if (spreadSessionsCb) spreadSessionsCb.checked = false;

    // Reset activity toggle
    const isActivityCb = document.getElementById('class-is-activity');
    if (isActivityCb) isActivityCb.checked = false;
    
    document.querySelector('input[name="class-color"][value="#FF6B9D"]').checked = true;
    // Reset custom swatch to its default state
    const _csr = document.getElementById('class-color-custom-radio');
    const _csi = document.getElementById('class-color-custom-input');
    const _css = document.getElementById('class-color-custom-swatch');
    if (_csr) { _csr.value = '__custom__'; }
    if (_csi) { _csi.value = '#FF6B9D'; }
    if (_css) { _css.style.background = ''; _css.textContent = '＋'; }
    
    if (cls) {
        document.getElementById('class-modal-title').textContent = '🎓 Edit Class';
        elements.classId.value = cls.id;
        elements.className.value = cls.name;
        elements.classSubject.value = cls.subject || '';
        elements.classRoom.value = cls.room || '';
    const _curEl = document.getElementById('class-curriculum'); if (_curEl) _curEl.value = cls.curriculum || '';
        
        if (cls.color) {
            const colorInput = document.querySelector(`input[name="class-color"][value="${cls.color}"]`);
            if (colorInput) {
                colorInput.checked = true;
            } else {
                // Custom color not in palette — select the custom swatch and set its value
                const customRadio = document.getElementById('class-color-custom-radio');
                const customInput = document.getElementById('class-color-custom-input');
                const customSwatch = document.getElementById('class-color-custom-swatch');
                if (customRadio && customInput && customSwatch) {
                    customRadio.value = cls.color;
                    customRadio.checked = true;
                    customInput.value = cls.color;
                    customSwatch.style.background = cls.color;
                    customSwatch.textContent = '';
                }
            }
        }
        
        if (cls.schedule) {
            Object.entries(cls.schedule).forEach(([day]) => {
                const checkbox = document.querySelector(`input[name="schedule-${day}"]`);
                if (!checkbox) return;
                const slots = getTimeSlotsForDay(cls, day);
                if (slots.length === 0) return;
                checkbox.checked = true;

                // Reset to one slot first
                const slotsContainer = document.querySelector(`.schedule-slots[data-day="${day}"]`);
                if (!slotsContainer) return;
                // Remove any extra slots from a previous edit session
                slotsContainer.querySelectorAll('.schedule-slot:not(:first-child)').forEach(el => el.remove());
                // Re-show add button in case it was hidden at max
                const addBtnRestore = document.querySelector(`.add-slot-btn[data-day="${day}"]`);
                if (addBtnRestore) addBtnRestore.style.display = '';

                // Restore slot 0 into the fixed first row
                const firstSlotEl = slotsContainer.querySelector('.schedule-slot');
                if (firstSlotEl) {
                    const inputs = firstSlotEl.querySelectorAll('input[type="time"]');
                    if (inputs[0]) inputs[0].value = slots[0].start || '';
                    if (inputs[1]) inputs[1].value = slots[0].end   || '';
                }
                // Restore all additional slots (slots[1], slots[2], …)
                for (let si = 1; si < slots.length; si++) {
                    addScheduleSlot(day, slots[si].start, slots[si].end);
                }
            });
        }
        
        // Set every other week options
        if (cls.everyOtherWeek && everyOtherWeekCb) {
            everyOtherWeekCb.checked = true;
            if (weekTypeSelector) weekTypeSelector.classList.remove('hidden');
            if (startingWeekSelect && cls.startingWeek) {
                startingWeekSelect.value = cls.startingWeek;
            }
        }
        if (spreadSessionsCb) spreadSessionsCb.checked = !!cls.spreadSessions;
        if (isActivityCb) isActivityCb.checked = !!cls.isActivity;
        
        elements.deleteClassBtn.classList.remove('hidden');
    } else {
        document.getElementById('class-modal-title').textContent = '🎓 Add Class';
        elements.deleteClassBtn.classList.add('hidden');
    }
    
    elements.classModal.classList.remove('hidden');
}

// Schedule day checkbox handlers
document.querySelectorAll('.schedule-day input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
        // Time inputs stay editable either way, but when a day gets unchecked we
        // must fully clear its time value(s) — a native <input type="time"> can be
        // left in a browser-internal "incomplete" validity state even after being
        // visually emptied (e.g. user typed a time, then unchecked the day without
        // finishing/clearing it). That stale invalid state silently blocks the whole
        // form's native validation on submit with zero visible error to the user.
        // Explicitly resetting .value (and firing 'input' so any listeners update)
        // clears that stale state.
        if (!cb.checked) {
            const dayContainer = cb.closest('.schedule-day');
            dayContainer?.querySelectorAll('input[type="time"]').forEach(ti => {
                ti.value = '';
                ti.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
    });
});

// Add a second time slot row to a day
function addScheduleSlot(day, startVal = '', endVal = '') {
    const container = document.querySelector(`.schedule-slots[data-day="${day}"]`);
    if (!container) return;
    const MAX_SLOTS = 5;
    if (container.querySelectorAll('.schedule-slot').length >= MAX_SLOTS) return;
    const slot = document.createElement('div');
    slot.className = 'schedule-slot schedule-slot-extra';
    slot.innerHTML = `
        <input type="time" class="time-slot-extra" data-day="${day}" value="${startVal}" placeholder="Start">
        <span class="time-separator">to</span>
        <input type="time" class="time-end-slot-extra" data-day="${day}" value="${endVal}" placeholder="End">
        <button type="button" class="remove-slot-btn" title="Remove session">✕</button>
    `;
    slot.querySelector('.remove-slot-btn').addEventListener('click', () => {
        slot.remove();
        const addBtn = document.querySelector(`.add-slot-btn[data-day="${day}"]`);
        if (addBtn) addBtn.style.display = '';
    });
    container.appendChild(slot);
    const cb = document.querySelector(`input[name="schedule-${day}"]`);
    if (cb) cb.checked = true;
    const addBtn = document.querySelector(`.add-slot-btn[data-day="${day}"]`);
    if (addBtn && container.querySelectorAll('.schedule-slot').length >= MAX_SLOTS) {
        addBtn.style.display = 'none';
    }
}

// Custom color picker wiring
(function () {
    const customLabel = document.querySelector('.color-option-custom');
    const customRadio = document.getElementById('class-color-custom-radio');
    const customInput = document.getElementById('class-color-custom-input');
    const customSwatch = document.getElementById('class-color-custom-swatch');
    if (!customLabel || !customRadio || !customInput || !customSwatch) return;

    // Clicking the custom swatch opens the native color picker
    customLabel.addEventListener('click', (e) => {
        e.preventDefault();
        customInput.click();
    });

    // When user picks a color from the native picker
    customInput.addEventListener('input', () => {
        const hex = customInput.value;
        customRadio.value = hex;   // make the radio's value = the actual hex
        customRadio.checked = true;
        customSwatch.style.background = hex;
        customSwatch.textContent = '';
    });

    // Also trigger on change (for browsers that only fire change, not input)
    customInput.addEventListener('change', () => {
        const hex = customInput.value;
        customRadio.value = hex;
        customRadio.checked = true;
        customSwatch.style.background = hex;
        customSwatch.textContent = '';
    });
})();

// Wire ＋ Add Slot buttons via delegation on the schedule-picker
document.querySelector('.schedule-picker')?.addEventListener('click', (e) => {
    // Add second slot
    const addBtn = e.target.closest('.add-slot-btn');
    if (addBtn) {
        addScheduleSlot(addBtn.dataset.day);
        return;
    }

    // Copy time from previous day
    const copyBtn = e.target.closest('.copy-time-btn');
    if (!copyBtn) return;

    const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const currentDay = copyBtn.dataset.day;
    const currentIndex = days.indexOf(currentDay);

    if (currentIndex > 0) {
        const prevDay = days[currentIndex - 1];
        const prevSlots  = document.querySelector(`.schedule-slots[data-day="${prevDay}"]`);
        const currSlots  = document.querySelector(`.schedule-slots[data-day="${currentDay}"]`);
        const prevChecked = document.querySelector(`input[name="schedule-${prevDay}"]`)?.checked;
        if (!prevSlots) { showToast('No previous day to copy from'); return; }

        const prevInputs = prevSlots.querySelectorAll('.schedule-slot:first-child input[type="time"]');
        if (!prevInputs[0]?.value) { showToast('No time set for previous day'); return; }

        // Copy first slot
        const currInputs = currSlots?.querySelectorAll('.schedule-slot:first-child input[type="time"]');
        if (currInputs?.[0]) currInputs[0].value = prevInputs[0].value;
        if (currInputs?.[1] && prevInputs[1]) currInputs[1].value = prevInputs[1].value;
        document.querySelector(`input[name="schedule-${currentDay}"]`).checked = prevChecked;

        // Copy all extra slots from previous day
        prevSlots.querySelectorAll('.schedule-slot-extra').forEach(extraEl => {
            const pInputs = extraEl.querySelectorAll('input[type="time"]');
            addScheduleSlot(currentDay, pInputs[0]?.value || '', pInputs[1]?.value || '');
        });
        const dayNames = {mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday'};
        showToast(`Copied from ${dayNames[prevDay]}`);
    } else {
        showToast('No previous day to copy from');
    }
});

// Select all days button
document.getElementById('select-all-days-btn')?.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.schedule-day input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => { cb.checked = !allChecked; });
    showToast(allChecked ? 'All days deselected' : 'All days selected');
});

// Every other week toggle
const everyOtherWeekCheckbox = document.getElementById('every-other-week');
const weekTypeSelector = document.getElementById('week-type-selector');

if (everyOtherWeekCheckbox && weekTypeSelector) {
    everyOtherWeekCheckbox.addEventListener('change', () => {
        weekTypeSelector.classList.toggle('hidden', !everyOtherWeekCheckbox.checked);
    });
}

elements.classForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const schedule = {};
    ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(day => {
        const checkbox = document.querySelector(`input[name="schedule-${day}"]`);
        if (!checkbox || !checkbox.checked) return;

        const slotsContainer = document.querySelector(`.schedule-slots[data-day="${day}"]`);
        const slots = [];

        if (slotsContainer) {
            // Read all slots generically (supports 1–5 sessions per day)
            slotsContainer.querySelectorAll('.schedule-slot').forEach((slotEl, idx) => {
                const inputs = slotEl.querySelectorAll('input[type="time"]');
                const s = { start: inputs[0]?.value || '', end: inputs[1]?.value || '' };
                // Always push slot 0; only push extras if they have a time set
                if (idx === 0 || s.start || s.end) slots.push(s);
            });
        }

        // Store as array if multiple slots, single object if 1 (backward compat)
        if (slots.length > 1) {
            schedule[day] = slots;
        } else if (slots.length === 1) {
            schedule[day] = slots[0];
        } else {
            schedule[day] = { start: '', end: '' };
        }
    });
    
    // Every other week settings
    const everyOtherWeek = document.getElementById('every-other-week')?.checked || false;
    const startingWeek = document.getElementById('starting-week')?.value || 'A';
    
    const spreadSessions = document.getElementById('class-spread-sessions')?.checked || false;
    const isActivity = document.getElementById('class-is-activity')?.checked || false;

    const classData = {
        name: elements.className.value.trim(),
        subject: elements.classSubject.value.trim(),
        room: elements.classRoom.value.trim(),
        curriculum: (document.getElementById('class-curriculum')?.value || '').trim(),
        color: (() => {
            const checked = document.querySelector('input[name="class-color"]:checked');
            const val = checked ? checked.value : '#FF6B9D';
            // If somehow __custom__ slipped through (no color chosen yet), fall back to default
            return (val && val !== '__custom__') ? val : '#FF6B9D';
        })(),
        schedule,
        everyOtherWeek,
        startingWeek: everyOtherWeek ? startingWeek : null,
        spreadSessions,
        isActivity,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    showLoading();
    try {
        const classId = elements.classId.value;
        const yearPath = getYearPath();
        let finalClassId = classId;
        if (classId) {
            await yearPath.collection('classes').doc(classId).update(classData);
            const index = classes.findIndex(c => c.id === classId);
            classes[index] = { ...classes[index], ...classData };
        } else {
            classData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await yearPath.collection('classes').add(classData);
            classes.push({ id: docRef.id, ...classData });
            finalClassId = docRef.id;
        }

        // Keep the "spread Session 1 across all sessions" invariant up to date
        // every time the class is saved with the toggle on — this both handles
        // a fresh toggle-on and picks up any Session-1 lessons added since.
        if (spreadSessions) {
            const result = await bulkSpreadSessionsForClass(finalClassId);
            if (result.converted > 0 || result.merged > 0) {
                showToast(`Class saved! Spread ${result.converted} Session 1 lesson${result.converted === 1 ? '' : 's'} across all sessions${result.merged > 0 ? ` (merged ${result.merged} other session lesson${result.merged === 1 ? '' : 's'})` : ''}.`);
            } else {
                showToast(classId ? 'Class updated!' : 'Class added!');
            }
        } else {
            showToast(classId ? 'Class updated!' : 'Class added!');
        }
        
        closeAllModals();
        renderClasses();
        renderCalendar();
        renderWeek();
        updateClassDropdown();
        updateYearChecklist();
        if (typeof updateSmartImportClassDropdown === 'function') updateSmartImportClassDropdown();
        updateStats();
    } catch (error) {
        console.error(error);
        showToast('Error saving class');
    }
    hideLoading();
});

elements.deleteClassBtn.addEventListener('click', async () => {
    if (!await planyConfirm('Delete this class?')) return;
    
    const classId = elements.classId.value;
    showLoading();
    try {
        await getYearPath().collection('classes').doc(classId).delete();
        classes = classes.filter(c => c.id !== classId);
        closeAllModals();
        renderClasses();
        updateClassDropdown();
        if (typeof updateSmartImportClassDropdown === 'function') updateSmartImportClassDropdown();
        updateStats();
        showToast('Class deleted');
    } catch (error) {
        showToast('Error deleting class');
    }
    hideLoading();
});

// ==================== EVENT MODAL ====================

function openEventModal(event = null, dateStr = null) {
    const form = document.getElementById('event-form');
    form.reset();
    document.getElementById('event-id').value = '';
    
    const deleteBtn = document.getElementById('delete-event-btn');
    const allDayCheckbox = document.getElementById('event-all-day');
    const timeInputs = document.querySelectorAll('#event-start-time, #event-end-time');
    
    // Toggle time inputs based on all-day checkbox
    const toggleTimeInputs = () => {
        timeInputs.forEach(input => {
            input.disabled = allDayCheckbox.checked;
            if (allDayCheckbox.checked) input.value = '';
        });
    };
    
    allDayCheckbox.removeEventListener('change', toggleTimeInputs);
    allDayCheckbox.addEventListener('change', toggleTimeInputs);
    
    if (event) {
        document.getElementById('event-modal-title').textContent = '📌 Edit Event';
        document.getElementById('event-id').value = event.id;
        document.getElementById('event-title').value = event.title;
        document.getElementById('event-type').value = event.type || 'event';
        document.getElementById('event-start').value = event.startDate;
        document.getElementById('event-end').value = event.endDate || '';
        document.getElementById('event-start-time').value = event.startTime || '';
        document.getElementById('event-end-time').value = event.endTime || '';
        document.getElementById('event-all-day').checked = !event.startTime;
        document.getElementById('event-notes').value = event.notes || '';
        
        timeInputs.forEach(input => input.disabled = !event.startTime);
        deleteBtn.classList.remove('hidden');
    } else {
        document.getElementById('event-modal-title').textContent = '📌 Add Event';
        document.getElementById('event-start').value = dateStr || formatDate(new Date());
        deleteBtn.classList.add('hidden');
        timeInputs.forEach(input => input.disabled = true);
    }
    
    document.getElementById('event-modal').classList.remove('hidden');
}

// Event form submit
document.getElementById('event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    console.log('Event form submitted');
    
    const eventData = {
        title: document.getElementById('event-title').value.trim(),
        type: document.getElementById('event-type').value,
        startDate: document.getElementById('event-start').value,
        endDate: document.getElementById('event-end').value || document.getElementById('event-start').value,
        startTime: document.getElementById('event-all-day').checked ? null : document.getElementById('event-start-time').value,
        endTime: document.getElementById('event-all-day').checked ? null : document.getElementById('event-end-time').value,
        notes: document.getElementById('event-notes').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    console.log('Event data:', eventData);
    
    showLoading();
    try {
        const eventId = document.getElementById('event-id').value;
        const yearPath = getYearPath();
        if (eventId) {
            await yearPath.collection('events').doc(eventId).update(eventData);
            const index = events.findIndex(e => e.id === eventId);
            events[index] = { ...events[index], ...eventData };
            showToast('Event updated!');
        } else {
            eventData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await yearPath.collection('events').add(eventData);
            events.push({ id: docRef.id, ...eventData });
            console.log('Events array now:', events);
            showToast('Event added!');
        }
        
        closeAllModals();
        renderCalendar();
        renderWeek();
        updateYearChecklist();
        updateSchoolYearDisplay();
        console.log('Calendar re-rendered');
    } catch (error) {
        console.error('Error saving event:', error);
        showToast('Error saving event');
    }
    hideLoading();
});

// Delete event
document.getElementById('delete-event-btn').addEventListener('click', async () => {
    if (!await planyConfirm('Delete this event?')) return;
    
    const eventId = document.getElementById('event-id').value;
    showLoading();
    try {
        await getYearPath().collection('events').doc(eventId).delete();
        events = events.filter(e => e.id !== eventId);
        closeAllModals();
        renderCalendar();
        renderWeek();
        updateSchoolYearDisplay();
        showToast('Event deleted');
    } catch (error) {
        showToast('Error deleting event');
    }
    hideLoading();
});

// Add event to day button
document.getElementById('add-event-to-day').addEventListener('click', () => {
    const dateStr = elements.dayModal.dataset.date;
    // Open event modal on top of day modal (don't close day modal)
    openEventModal(null, dateStr);
});

// FAB removed

// ==================== CALENDAR PDF IMPORT ====================

// ── On-demand libraries (v6.3.0) ───────────────────────────────────────
// Loaded the first time a feature needs them (and pre-loaded quietly after
// sign-in), instead of blocking every page load.
const LIBS = {
    // v6.5.0: PDF.js 4.10.38 (legacy build, for older classroom devices),
    // served from plany.work itself -- an ES module, so it's imported rather
    // than added as a script tag, and its worker runs same-origin.
    pdfjs: { module: '/vendor/pdfjs/pdf.min.mjs', ready: () => typeof pdfjsLib !== 'undefined',
             after: () => { pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs'; } },
    jspdf: { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', ready: () => !!window.jspdf },
    xlsx:  { src: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', ready: () => typeof XLSX !== 'undefined' },
    jszip: { src: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', ready: () => typeof JSZip !== 'undefined' }
};
const _libPromises = {};
function ensureLib(name) {
    const lib = LIBS[name];
    if (!lib) return Promise.reject(new Error('Unknown library ' + name));
    if (lib.ready()) { if (lib.after && !lib._done) { lib.after(); lib._done = true; } return Promise.resolve(); }
    if (_libPromises[name]) return _libPromises[name];
    if (lib.module) {
        _libPromises[name] = import(lib.module).then(m => {
            window.pdfjsLib = m;
            if (lib.after) { lib.after(); lib._done = true; }
        }).catch(e => {
            delete _libPromises[name];
            throw new Error('Could not load a tool Plany needs. Check your internet connection and try again.');
        });
        return _libPromises[name];
    }
    _libPromises[name] = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = lib.src;
        el.async = true;
        el.onload = () => { if (lib.after) { lib.after(); lib._done = true; } resolve(); };
        el.onerror = () => { delete _libPromises[name]; el.remove(); reject(new Error('Could not load a tool Plany needs. Check your internet connection and try again.')); };
        document.head.appendChild(el);
    });
    return _libPromises[name];
}
// Home-screen shortcuts from manifest.json (v6.3.0 -- they did nothing before)
function handleLaunchShortcut() {
    let q;
    try { q = new URLSearchParams(window.location.search); } catch (_) { return; }
    const action = q.get('action'), view = q.get('view');
    if (!action && !view) return;
    try { window.history.replaceState({}, document.title, '/'); } catch (_) {}
    if (view === 'week') {
        jumpToDate(new Date());
        document.querySelector('[data-view="week"]')?.click();
    }
    if (action === 'add-lesson') {
        jumpToDate(new Date());
        openLessonModal(null, formatDate(new Date()));
    }
}

function preloadLibsWhenIdle() {
    const go = () => Object.keys(LIBS).forEach(n => ensureLib(n).catch(() => {}));
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 8000 }); else setTimeout(go, 4000);
}

// Set PDF.js worker - retry if not loaded yet
function initPdfWorker() {
    if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
        return true;
    }
    return false;
}

// Try to initialize, and retry a few times if library not loaded yet
if (!initPdfWorker()) {
    setTimeout(initPdfWorker, 500);
    setTimeout(initPdfWorker, 1500);
}

let pendingImportEvents = [];

// Only add JS event listener (remove the inline onclick from HTML is recommended)
document.getElementById('import-calendar-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = document.getElementById('calendar-pdf-input');
    if (input) {
        input.value = ''; // Reset to allow re-selecting same file
        input.click();
    }
});

document.getElementById('calendar-pdf-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
        console.log('No file selected');
        return;
    }
    
    console.log('Processing PDF:', file.name, file.size, 'bytes');
    document.getElementById('import-filename').textContent = file.name;
    showLoading();
    
    try {
        // Ensure PDF.js worker is initialized
        await ensureLib('pdfjs');
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js library not loaded');
        }
        initPdfWorker();
        
        const arrayBuffer = await file.arrayBuffer();
        console.log('ArrayBuffer loaded, size:', arrayBuffer.byteLength);
        
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false }).promise;
        console.log('PDF loaded, pages:', pdf.numPages);
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        
        console.log('Extracted text length:', fullText.length);
        console.log('First 500 chars:', fullText.substring(0, 500));
        
        // Parse calendar: AI-first (more reliable with messy PDF text),
        // regex fallback if no API key or AI fails.
        if (hasEffectiveAiKey()) {
            document.querySelector('.loading-text') && (document.querySelector('.loading-text').textContent = 'Asking Claude to parse calendar…');
            try {
                const aiEvents = await parseCalendarWithAI(fullText);
                if (aiEvents && aiEvents.length > 0) {
                    pendingImportEvents = aiEvents;
                    displayImportPreview(aiEvents);
                    hideLoading();
                    return;
                }
                // AI returned 0 events — fall through to regex
                console.warn('AI returned 0 events, falling back to regex parser');
            } catch (aiErr) {
                console.error('AI calendar parse error:', aiErr, '— falling back to regex');
            }
        }
        
        // Regex fallback (or primary when no API key)
        const parsedEvents = parseCalendarText(fullText);
        console.log('Regex parsed events:', parsedEvents.length);
        
        if (parsedEvents.length === 0) {
            showToast('No events found. The PDF may not be a recognized school calendar.');
            hideLoading();
            return;
        }
        
        pendingImportEvents = parsedEvents;
        displayImportPreview(parsedEvents);
        
    } catch (error) {
        console.error('Error parsing PDF:', error);
        showToast('Error reading PDF: ' + error.message);
    }
    
    hideLoading();
});

function parseCalendarText(text) {
    const events = [];
    const currentYear = parseInt(settings.schoolYear.split('-')[0]);
    const nextYear = currentYear + 1;
    
    // Normalize text - handle various spacing and formatting issues from PDF extraction
    const normalizedText = text
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .replace(/[\u2013\u2014]/g, '-')  // Normalize dashes
        .replace(/[\u2018\u2019]/g, "'")  // Normalize quotes
        .trim();
    
    console.log('Normalized text sample:', normalizedText.substring(0, 300));
    
    const monthMap = {
        'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
        'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'sept': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    
    // TUSD calendar event patterns - more flexible matching
    // Patterns try to match both "Event Month Day" and table format variations
    // Day-range separator: dash, en-dash, or space (PDF.js sometimes strips dashes from table cells)
    const SEP = '[\u2013\-\s]';
    
    const eventPatterns = [
        // Single day events
        { regex: /Independence\s+Day\s+(\w+)\s+(\d+)/i, title: 'Independence Day', type: 'holiday' },
        { regex: /First\s+Day\s+(?:for\s+)?Students?\s+(\w+)\s+(\d+)/i, title: 'First Day of School', type: 'first-day' },
        { regex: /Last\s+Day\s+(?:for\s+)?Students?\s+(\w+)\s+(\d+)/i, title: 'Last Day of School', type: 'last-day' },
        { regex: /Labor\s+Day\s+(\w+)\s+(\d+)/i, title: 'Labor Day', type: 'holiday' },
        { regex: /Veteran['']?s?\s+Day\s+(\w+)\s+(\d+)/i, title: "Veteran's Day", type: 'holiday' },
        { regex: /Martin\s+Luther\s+King[,.]?\s*Jr\.?\s*Day\s+(\w+)\s+(\d+)/i, title: 'MLK Day', type: 'holiday' },
        { regex: /Memorial\s+Day\s+(\w+)\s+(\d+)/i, title: 'Memorial Day', type: 'holiday' },
        { regex: /Juneteenth\s+(\w+)\s+(\d+)/i, title: 'Juneteenth', type: 'holiday' },
        
        // Multi-day events in same month (SEP handles dash, en-dash, or space from PDF extraction)
        { regex: new RegExp('Thanksgiving\\s+Break\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Thanksgiving Break', type: 'holiday', multiDay: true },
        { regex: new RegExp('Fall\\s+Break\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Fall Break', type: 'holiday', multiDay: true },
        { regex: new RegExp('Spring\\s+Break\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Spring Break', type: 'holiday', multiDay: true },
        { regex: new RegExp('Rodeo\\s+Break\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Rodeo Break', type: 'holiday', multiDay: true },
        { regex: new RegExp('Graduation\\s+(?:Day)?\\s*(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Graduation', type: 'event', multiDay: true },
        
        // Cross-month events (Winter Break: "December-January 21-1")
        { regex: new RegExp('Winter\\s+Break\\s+(\\w+)[\\u2013\\-\\s](\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Winter Break', type: 'holiday', crossMonth: true },
        
        // Conferences - K-8 multi-day
        { regex: new RegExp('Parent\\/?Teacher\\s+Conference[s]?\\s*\\(?(?:grades?\\s*)?K[\\u2013\\-]?8\\)?\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Parent/Teacher Conferences (K-8)', type: 'meeting', multiDay: true },
        // Conferences - 9-12 single day
        { regex: /Parent\/?Teacher\s+Conference[s]?\s*\(?(?:grades?\s*)?9[\u2013\-]?12\)?\s+(\w+)\s+(\d+)/i, title: 'Parent/Teacher Conferences (9-12)', type: 'meeting' },
        
        // Teacher Planning Days (no school for students, listed as G in TUSD calendar)
        { regex: new RegExp('Teacher\\s+Planning\\s+Days?\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Teacher Planning Days (No School)', type: 'holiday', multiDay: true },
        
        // Professional days and grading days - multiple instances, handle ranges
        { regex: /Grading\s+Day\s+(\w+)\s+(\d+)/gi, title: 'Grading Day (No School)', type: 'holiday', findAll: true },
        { regex: new RegExp('Prof(?:essional)?[.]?\\s*Learning\\s+Days?\\s*(?:Staff)?\\s*\\(?(?:No\\s*School)?\\)?\\s+(\\w+)\\s+(\\d+)(?:' + SEP + '(\\d+))?', 'gi'), title: 'Professional Learning Day (No School)', type: 'holiday', findAll: true, maybeMultiDay: true },
    ];
    
    for (const pattern of eventPatterns) {
        if (pattern.findAll) {
            // Find all matches for events that occur multiple times
            const matches = [...normalizedText.matchAll(pattern.regex)];
            for (const match of matches) {
                processMatch(match, pattern, events, currentYear, nextYear, monthMap);
            }
        } else {
            const match = normalizedText.match(pattern.regex);
            if (match) {
                processMatch(match, pattern, events, currentYear, nextYear, monthMap);
            }
        }
    }
    
    // Helper function to process a match
    function processMatch(match, pattern, events, currentYear, nextYear, monthMap) {
        let startDate, endDate;
        
        try {
            if (pattern.crossMonth) {
                const startMonth = monthMap[match[1].toLowerCase()];
                const endMonth = monthMap[match[2].toLowerCase()];
                if (startMonth === undefined || endMonth === undefined) {
                    console.log('Failed to parse months for', pattern.title, ':', match[1], match[2]);
                    return;
                }
                const startDay = parseInt(match[3]);
                const endDay = parseInt(match[4]);
                
                const startYear = startMonth >= 6 ? currentYear : nextYear;
                const endYear = endMonth >= 6 ? currentYear : nextYear;
                
                startDate = formatDate(new Date(startYear, startMonth, startDay));
                endDate = formatDate(new Date(endYear, endMonth, endDay));
            } else if (pattern.multiDay || (pattern.maybeMultiDay && match[3])) {
                const month = monthMap[match[1].toLowerCase()];
                if (month === undefined) {
                    console.log('Failed to parse month for', pattern.title, ':', match[1]);
                    return;
                }
                const startDay = parseInt(match[2]);
                const endDay = parseInt(match[3]);
                
                const year = month >= 6 ? currentYear : nextYear;
                
                startDate = formatDate(new Date(year, month, startDay));
                endDate = formatDate(new Date(year, month, endDay));
            } else {
                const month = monthMap[match[1].toLowerCase()];
                if (month === undefined) {
                    console.log('Failed to parse month for', pattern.title, ':', match[1]);
                    return;
                }
                const day = parseInt(match[2]);
                
                const year = month >= 6 ? currentYear : nextYear;
                
                startDate = formatDate(new Date(year, month, day));
                endDate = startDate;
            }
            
            // Check if event already exists
            const exists = events.find(e => e.title === pattern.title && e.startDate === startDate);
            if (!exists && startDate) {
                console.log('Found event:', pattern.title, startDate, endDate);
                events.push({
                    title: pattern.title,
                    type: pattern.type,
                    startDate,
                    endDate: endDate !== startDate ? endDate : null,
                    selected: true
                });
            }
        } catch (err) {
            console.error('Error processing match for', pattern.title, ':', err);
        }
    }
    
    // Sort by date
    events.sort((a, b) => a.startDate.localeCompare(b.startDate));
    
    console.log('Total events found:', events.length);
    return events;
}

// ============================================
// AI CALENDAR PARSING FALLBACK
// ============================================
// Called when regex parser finds 0 events — sends extracted PDF text to Claude
// and asks it to return structured JSON of school calendar events.

async function parseCalendarWithAI(rawText) {
    const schoolYear = settings.schoolYear || '2025-2026';
    const [startYear, endYear] = schoolYear.split('-');

    // Trim text to stay within token limits (~12k chars is plenty for a calendar)
    const trimmedText = rawText.substring(0, 12000);

    const prompt = `You are parsing a school district calendar. Extract every school event from the text below.

School year: ${schoolYear} (${startYear}–${endYear})
Rules:
- Months Aug–Dec belong to year ${startYear}
- Months Jan–Jul belong to year ${endYear}
- For multi-day events use startDate AND endDate (YYYY-MM-DD)
- For single-day events endDate = startDate
- type must be one of: first-day, last-day, holiday, break, grading, conference, testing, meeting, event

Return ONLY a JSON array, no markdown, no explanation. Each object:
{"title": "...", "type": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}

CALENDAR TEXT:
${trimmedText}`;

    const text = (await callAIText({ prompt, tier: 'fast', maxTokens: 4096 })).replace(/```json|```/g, '').trim();


    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        throw new Error('Claude returned invalid JSON: ' + text.substring(0, 200));
    }

    if (!Array.isArray(parsed)) throw new Error('Expected JSON array from Claude');

    // Validate and mark all as selected
    return parsed
        .filter(ev => ev.title && ev.startDate)
        .map(ev => ({
            title: ev.title,
            type: ev.type || 'event',
            startDate: ev.startDate,
            endDate: ev.endDate && ev.endDate !== ev.startDate ? ev.endDate : null,
            selected: true,
            aiParsed: true
        }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
}


function displayImportPreview(eventsList) {
    const container = document.getElementById('import-events-list');
    const preview = document.getElementById('import-preview');
    
    const typeIcons = {
        'event': '📌',
        'first-day': '🎒',
        'last-day': '🎉',
        'holiday': '🏖️',
        'meeting': '👥',
        'assembly': '🎤',
        'field-trip': '🚌',
        'testing': '📝',
        'deadline': '⚠️'
    };
    
    container.innerHTML = eventsList.map((event, index) => {
        const dateDisplay = event.endDate 
            ? `${formatDisplayDateShort(event.startDate)} - ${formatDisplayDateShort(event.endDate)}`
            : formatDisplayDateShort(event.startDate);
        
        return `
            <div class="import-event-item">
                <input type="checkbox" id="import-event-${index}" checked data-index="${index}">
                <span class="import-event-type">${typeIcons[event.type] || '📌'}</span>
                <span class="import-event-date">${dateDisplay}</span>
                <span class="import-event-title">${escHtml(event.title)}</span>
                ${event.aiParsed ? '<span style="font-size:0.65rem;background:#9D4EDD;color:#fff;padding:1px 5px;border-radius:3px;margin-left:4px;">AI</span>' : ''}
            </div>
        `;
    }).join('');
    
    // Add checkbox listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            pendingImportEvents[index].selected = e.target.checked;
        });
    });
    
    preview.classList.remove('hidden');
}

function formatDisplayDateShort(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

document.getElementById('cancel-import-btn').addEventListener('click', () => {
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-filename').textContent = '';
    document.getElementById('calendar-pdf-input').value = '';
    pendingImportEvents = [];
});

document.getElementById('confirm-import-btn').addEventListener('click', async () => {
    const selectedEvents = pendingImportEvents.filter(e => e.selected);
    
    if (selectedEvents.length === 0) {
        showToast('No events selected');
        return;
    }
    
    showLoading();
    
    try {
        const yearPath = getYearPath();
        let imported = 0;
        let skipped = 0;
        
        for (const event of selectedEvents) {
            // Check if similar event already exists
            const exists = events.find(e => 
                e.title === event.title && e.startDate === event.startDate
            );
            
            if (exists) {
                skipped++;
                continue;
            }
            
            const eventData = {
                title: event.title,
                type: event.type,
                startDate: event.startDate,
                endDate: event.endDate || event.startDate,
                startTime: '',
                endTime: '',
                description: 'Imported from district calendar',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            const docRef = await yearPath.collection('events').add(eventData);
            // Add to local array with actual values (not serverTimestamp)
            events.push({ 
                id: docRef.id, 
                title: event.title,
                type: event.type,
                startDate: event.startDate,
                endDate: event.endDate || event.startDate,
                startTime: '',
                endTime: '',
                description: 'Imported from district calendar'
            });
            imported++;
        }
        
        // Reset import UI
        document.getElementById('import-preview').classList.add('hidden');
        document.getElementById('import-filename').textContent = '';
        document.getElementById('calendar-pdf-input').value = '';
        pendingImportEvents = [];
        
        // Refresh views
        renderCalendar();
        renderWeek();
        updateSchoolYearDisplay();
        
        if (skipped > 0) {
            showToast(`Imported ${imported} events (${skipped} already existed)`);
        } else {
            showToast(`Imported ${imported} events!`);
        }
        
    } catch (error) {
        console.error('Error importing events:', error);
        showToast('Error importing events');
    }
    
    hideLoading();
});

// ==================== CURRICULUM PACING GUIDE IMPORT ====================

let pendingCurriculumLessons = [];

// Update curriculum class dropdown when classes change
// ============================================

// Print Week View
document.getElementById('print-week-btn')?.addEventListener('click', () => {
    printWeekPDF();
});

// Print Month View
// ── Hide / Show Weekends toggle ──────────────────────────────────
function applyWeekendsVisibility() {
    const calView = document.getElementById('calendar-view');
    const hidden = settings.hideWeekends === true;
    calView?.classList.toggle('weekends-hidden', hidden);
    ['toggle-weekends-btn','toggle-weekends-week-btn'].forEach(id => {
        const b = document.getElementById(id);
        if (!b) return;
        b.title = hidden ? 'Show weekends' : 'Hide weekends';
        b.textContent = hidden ? '7d' : '5d';
        b.classList.toggle('active', hidden);
    });
}

document.getElementById('toggle-weekends-btn')?.addEventListener('click', async () => {
    settings.hideWeekends = !settings.hideWeekends;
    applyWeekendsVisibility();
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear')
            .set({ hideWeekends: settings.hideWeekends }, { merge: true });
    } catch (e) {
        console.warn('Could not save weekend preference:', e);
    }
});

document.getElementById('print-month-btn')?.addEventListener('click', () => {
    printMonthPDF();
});

// Print Year View
document.getElementById('print-year-btn')?.addEventListener('click', () => {
    printYearPDF();
});

// Print Day View
document.getElementById('print-day-btn')?.addEventListener('click', () => {
    const dateStr = document.getElementById('day-modal').dataset.date;
    printDayPDF(dateStr);
});

// Print Single Lesson
document.getElementById('print-lesson-btn')?.addEventListener('click', () => {
    const lessonId = document.getElementById('lesson-id').value;
    printLessonPDF(lessonId || null, true);
});

// Sanitize text for jsPDF (Helvetica/Latin-1 only — strip/replace Unicode chars that corrupt output)
function sanitizeForPDF(str) {
    if (!str) return '';
    return str
        .replace(/→/g, '->') // → right arrow
        .replace(/←/g, '<-') // ← left arrow
        .replace(/↔/g, '<->') // ↔
        .replace(/•/g, '-')  // • bullet
        .replace(/–/g, '-')  // – en dash
        .replace(/—/g, '--') // — em dash
        .replace(/‘|’/g, "'") // '' curly single quotes
        .replace(/“|”/g, '"') // "" curly double quotes
        .replace(/…/g, '...') // … ellipsis
        .replace(/ /g, ' ')   // non-breaking space
        .replace(/[^ -ÿ]/g, '?'); // any remaining non-Latin-1
}

// Generate PDF for Year Overview
function printYearPDF() {
    if (!window.jspdf) { ensureLib('jspdf').then(() => printYearPDF()).catch(e => showToast(e.message)); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'letter');
    
    const schoolYear = settings.schoolYear || '2025-2026';
    
    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(`School Year ${schoolYear} Overview`, 14, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
    
    let yPos = 42;
    const margin = 14;
    const pageHeight = 270;
    
    // Summary Statistics
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Year Summary', margin, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const totalDays = document.getElementById('year-total-days')?.textContent || '--';
    const q1Days = document.getElementById('year-q1-days')?.textContent || '--';
    const q2Days = document.getElementById('year-q2-days')?.textContent || '--';
    const q3Days = document.getElementById('year-q3-days')?.textContent || '--';
    const q4Days = document.getElementById('year-q4-days')?.textContent || '--';
    
    doc.text(`Total School Days: ${totalDays}`, margin, yPos);
    yPos += 6;
    doc.text(`Q1: ${q1Days}  |  Q2: ${q2Days}  |  Q3: ${q3Days}  |  Q4: ${q4Days}`, margin, yPos);
    yPos += 12;
    
    // Classes Summary
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Classes', margin, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    if (classes.length === 0) {
        doc.text('No classes configured', margin, yPos);
        yPos += 6;
    } else {
        classes.forEach(cls => {
            if (yPos > pageHeight - 20) {
                doc.addPage();
                yPos = 20;
            }
            
            const scheduleArr = [];
            if (cls.schedule) {
                Object.entries(cls.schedule).forEach(([day, time]) => {
                    if (time) {
                        let timeStr = typeof time === 'string' ? time : (time.start || '');
                        if (time.end) timeStr += '-' + time.end;
                        scheduleArr.push(`${day.charAt(0).toUpperCase() + day.slice(1)}: ${timeStr}`);
                    }
                });
            }
            
            doc.setFont('helvetica', 'bold');
            doc.text(`• ${cls.name}`, margin, yPos);
            doc.setFont('helvetica', 'normal');
            if (cls.subject) {
                doc.text(` - ${cls.subject}`, margin + doc.getTextWidth(`• ${cls.name}`), yPos);
            }
            yPos += 5;
            
            if (scheduleArr.length > 0) {
                doc.setFontSize(9);
                doc.text(`  Schedule: ${scheduleArr.join(', ')}`, margin, yPos);
                doc.setFontSize(10);
                yPos += 5;
            }
            yPos += 2;
        });
    }
    
    yPos += 6;
    
    // Breaks & Holidays
    if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Breaks & Holidays', margin, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const breaks = settings.breaks || [];
    const holidayEvents = events.filter(e => e.type === 'holiday' || e.type === 'break' || (e.title && e.title.toLowerCase().includes('break')));
    const allBreaks = [...breaks, ...holidayEvents];
    
    if (allBreaks.length === 0) {
        doc.text('No breaks configured', margin, yPos);
    } else {
        allBreaks.forEach(brk => {
            if (yPos > pageHeight - 10) {
                doc.addPage();
                yPos = 20;
            }
            const name = brk.name || brk.title || 'Break';
            const start = brk.startDate || brk.start;
            const end = brk.endDate || brk.end || start;
            doc.text(`• ${name}: ${start} to ${end}`, margin, yPos);
            yPos += 6;
        });
    }
    
    // Save PDF
    doc.save(`Year_Overview_${schoolYear}.pdf`);
    showToast('Year overview PDF downloaded!');
}

// Generate PDF for Single Day
function printDayPDF(dateStr) {
    if (!window.jspdf) { ensureLib('jspdf').then(() => printDayPDF(dateStr)).catch(e => showToast(e.message)); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'letter');
    
    const date = new Date(dateStr + 'T00:00:00');
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
    
    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`Daily Plan - ${dayName}`, 14, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 27);
    
    let yPos = 40;
    const margin = 14;
    const pageHeight = 270;
    const contentWidth = 185;
    
    // Get events for this day
    const dayEvents = events.filter(e => {
        const start = e.startDate;
        const end = e.endDate || e.startDate;
        return dateStr >= start && dateStr <= end;
    });
    
    // Events section
    if (dayEvents.length > 0) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Events', margin, yPos);
        yPos += 8;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        dayEvents.forEach(event => {
            doc.text(`• ${event.title}${event.type ? ' (' + event.type + ')' : ''}`, margin, yPos);
            yPos += 6;
        });
        
        yPos += 6;
    }
    
    // Get classes and lessons for this day, sorted by time (none on a no-school day)
    const pdfDayOff = isOffDay(dateStr);
    const dayClasses = pdfDayOff ? [] : sortClassesByTime(classes.filter(cls => cls.schedule && cls.schedule[dayOfWeek] && isClassActiveOnDate(cls, dateStr)), dayOfWeek);
    const dayLessons = lessons.filter(l => l.date === dateStr);
    
    // Classes & Lessons section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Classes & Lessons', margin, yPos);
    yPos += 10;
    
    if (dayClasses.length === 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(pdfDayOff ? 'No school' : 'No classes scheduled for this day', margin, yPos);
    } else {
        dayClasses.forEach(cls => {
            if (yPos > pageHeight - 40) {
                doc.addPage();
                yPos = 20;
            }
            
            const lesson = mergedLessonForClass(dayLessons, cls.id);
            const timeStr = buildTimeStr(cls, dayOfWeek);
            // Class header with time
            doc.setFillColor(240, 240, 240);
            doc.rect(margin, yPos - 4, contentWidth, 10, 'F');
            
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(`${cls.name}`, margin + 2, yPos + 2);
            
            if (timeStr) {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.text(timeStr, margin + contentWidth - doc.getTextWidth(timeStr) - 2, yPos + 2);
            }
            
            yPos += 12;
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            if (lesson) {
                // Lesson title
                doc.setFont('helvetica', 'bold');
                doc.text(`Lesson: ${lesson.title || 'Untitled'}`, margin + 4, yPos);
                yPos += 6;
                doc.setFont('helvetica', 'normal');
                
                // Standards
                if (lesson.standards) {
                    const standardsLines = doc.splitTextToSize(`Standards: ${sanitizeForPDF(lesson.standards)}`, contentWidth - 8);
                    doc.text(standardsLines, margin + 4, yPos);
                    yPos += standardsLines.length * 5;
                }

                // Learning Target
                if (lesson.learningTarget) {
                    const ltLines = doc.splitTextToSize(`Learning Target: ${sanitizeForPDF(lesson.learningTarget)}`, contentWidth - 8);
                    doc.text(ltLines, margin + 4, yPos);
                    yPos += ltLines.length * 5;
                }

                // Success Criteria
                if (lesson.successCriteria) {
                    const scLines = doc.splitTextToSize(`Success Criteria: ${sanitizeForPDF(lesson.successCriteria)}`, contentWidth - 8);
                    doc.text(scLines, margin + 4, yPos);
                    yPos += scLines.length * 5;
                }

                // Materials
                if (lesson.materials) {
                    const materialsLines = doc.splitTextToSize(`Materials: ${sanitizeForPDF(lesson.materials)}`, contentWidth - 8);
                    doc.text(materialsLines, margin + 4, yPos);
                    yPos += materialsLines.length * 5;
                }
                
                // Lesson Flow
                if (lesson.flow) {
                    yPos += 2;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Lesson Flow:', margin + 4, yPos);
                    yPos += 5;
                    doc.setFont('helvetica', 'normal');
                    const flowLines = doc.splitTextToSize(sanitizeForPDF(lesson.flow), contentWidth - 8);
                    flowLines.forEach(line => {
                        if (yPos > pageHeight - 10) {
                            doc.addPage();
                            yPos = 20;
                        }
                        doc.text(line, margin + 4, yPos);
                        yPos += 5;
                    });
                }
                
                // Notes
                if (lesson.notes) {
                    yPos += 2;
                    doc.setFont('helvetica', 'bold');
                    doc.text('Notes:', margin + 4, yPos);
                    yPos += 5;
                    doc.setFont('helvetica', 'normal');
                    const notesLines = doc.splitTextToSize(sanitizeForPDF(lesson.notes), contentWidth - 8);
                    notesLines.forEach(line => {
                        if (yPos > pageHeight - 10) {
                            doc.addPage();
                            yPos = 20;
                        }
                        doc.text(line, margin + 4, yPos);
                        yPos += 5;
                    });
                }
            } else {
                doc.setTextColor(128, 128, 128);
                doc.text('No lesson planned', margin + 4, yPos);
                doc.setTextColor(0, 0, 0);
                yPos += 6;
            }
            
            yPos += 8;
        });
    }
    
    // Save PDF
    const fileLabel = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    doc.save(`${fileLabel} Lesson Plan.pdf`);
    showToast('Daily plan PDF downloaded!');
}

// Generate PDF for current week
function printWeekPDF() {
    if (!window.jspdf) { ensureLib('jspdf').then(() => printWeekPDF()).catch(e => showToast(e.message)); return; }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'letter');
    
    const weekLabel = document.getElementById('current-week')?.textContent || 'Week';
    const weekStart = new Date(currentWeekStart);
    
    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Weekly Lesson Plans - ' + weekLabel, 14, 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Generated: ' + new Date().toLocaleDateString(), 14, 26);
    
    let yPos = 35;
    const pageHeight = 265;
    const margin = 14;
    const contentWidth = 185;
    
    // Loop through each day of the week
    for (let i = 0; i < 5; i++) { // Mon-Fri
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        const dateStr = formatDate(date);
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
        const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
        
        // Get classes scheduled for this day, sorted by time (none on a no-school day)
        const pdfDayOff = isOffDay(dateStr);
        const dayClasses = pdfDayOff ? [] : sortClassesByTime(classes.filter(cls => cls.schedule && cls.schedule[dayOfWeek] && isClassActiveOnDate(cls, dateStr)), dayOfWeek);
        const dayLessons = lessons.filter(l => l.date === dateStr);
        
        // Calculate space needed for this day
        let spaceNeeded = 12; // header
        if (dayClasses.length === 0) {
            spaceNeeded += 10;
        } else {
            spaceNeeded += dayClasses.length * 18; // approx per class
        }
        
        // Check if we need a new page
        if (yPos + spaceNeeded > pageHeight) {
            doc.addPage();
            yPos = 20;
        }
        
        // Day header
        doc.setFillColor(50, 50, 80);
        doc.rect(margin, yPos, contentWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(dayName + ', ' + formatDisplayDate(date), margin + 3, yPos + 5.5);
        doc.setTextColor(0, 0, 0);
        yPos += 12;
        
        if (dayClasses.length === 0) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(128, 128, 128);
            doc.text(pdfDayOff ? 'No school' : 'No classes scheduled', margin + 5, yPos);
            doc.setTextColor(0, 0, 0);
            yPos += 8;
        } else {
            for (const cls of dayClasses) {
                const lesson = mergedLessonForClass(dayLessons, cls.id);
                
                // Get time
                const timeStr = buildTimeStr(cls, dayOfWeek);
                if (yPos + 16 > pageHeight) {
                    doc.addPage();
                    yPos = 20;
                }
                
                // Draw light background for class
                doc.setFillColor(245, 245, 250);
                doc.rect(margin, yPos - 2, contentWidth, lesson ? 14 : 10, 'F');
                
                // Class name and time on same line
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                let classLine = cls.name;
                if (timeStr) {
                    classLine += ' (' + timeStr + ')';
                }
                doc.text(classLine, margin + 3, yPos + 3);
                
                // Lesson info on next line
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                
                if (lesson) {
                    const lessonText = 'Lesson: ' + sanitizeForPDF(lesson.title || 'Untitled');
                    doc.text(lessonText.substring(0, 70) + (lessonText.length > 70 ? '...' : ''), margin + 5, yPos + 9);
                    yPos += 16;
                } else {
                    doc.setTextColor(120, 120, 120);
                    doc.text('- No lesson planned', margin + 5, yPos + 9);
                    doc.setTextColor(0, 0, 0);
                    yPos += 12;
                }
            }
        }
        
        yPos += 6; // Space between days
    }
    
    // Save the PDF
    doc.save('week-plans-' + formatDate(weekStart) + '.pdf');
    showToast('Week PDF downloaded!');
}

// Generate PDF for current month
function printMonthPDF() {
    if (!window.jspdf) { ensureLib('jspdf').then(() => printMonthPDF()).catch(e => showToast(e.message)); return; }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape', 'mm', 'letter');
    
    const monthLabel = document.getElementById('current-month')?.textContent || formatMonthYear(currentDate);
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    
    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Monthly Calendar - ' + monthLabel, 14, 15);
    
    // Calendar grid
    const startX = 14;
    const startY = 25;
    const cellWidth = 38;
    const cellHeight = 35;
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Header row
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(15, 15, 35);
    
    for (let i = 0; i < 7; i++) {
        doc.rect(startX + i * cellWidth, startY, cellWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(daysOfWeek[i], startX + i * cellWidth + cellWidth/2 - 5, startY + 5);
    }
    doc.setTextColor(0, 0, 0);
    
    // Get first day of month and number of days
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    let row = 0;
    let col = startDayOfWeek;
    
    for (let day = 1; day <= daysInMonth; day++) {
        const x = startX + col * cellWidth;
        const y = startY + 8 + row * cellHeight;
        const dateObj = new Date(currentYear, currentMonth, day);
        const dateStr = formatDate(dateObj);
        const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dateObj.getDay()];
        
        // Cell border
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, cellWidth, cellHeight);
        
        // Date number
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(day.toString(), x + 2, y + 5);
        
        // Get classes for this day, sorted by time
        const dayClasses = sortClassesByTime(classes.filter(cls => cls.schedule && cls.schedule[dayOfWeek] && isClassActiveOnDate(cls, dateStr)), dayOfWeek);
        const dayLessons = lessons.filter(l => l.date === dateStr);
        
        // List classes (max 4)
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        let itemY = y + 11;
        let itemCount = 0;
        
        for (const cls of dayClasses) {
            if (itemCount >= 4) break;
            const lesson = mergedLessonForClass(dayLessons, cls.id);
            const hasLesson = !!lesson;
            
            // Truncate name and use simple ASCII
            let displayName = cls.name || 'Class';
            if (displayName.length > 14) {
                displayName = displayName.substring(0, 12) + '..';
            }
            
            const prefix = hasLesson ? 'X ' : '- ';
            doc.text(prefix + displayName, x + 2, itemY);
            itemY += 5;
            itemCount++;
        }
        
        if (dayClasses.length > 4) {
            doc.setTextColor(100, 100, 100);
            doc.text('+' + (dayClasses.length - 4) + ' more', x + 2, itemY);
            doc.setTextColor(0, 0, 0);
        }
        
        col++;
        if (col > 6) {
            col = 0;
            row++;
        }
    }
    
    // Save the PDF
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    doc.save('calendar-' + monthNames[currentMonth].toLowerCase() + '-' + currentYear + '.pdf');
    showToast('Month PDF downloaded!');
}

// Generate PDF for a single lesson
function printLessonPDF(lessonId, fromModal = false) {
    const lessonFromDb = lessons.find(l => l.id === lessonId);

    // v6.2.0: read the open form ONLY when printing from the lesson modal.
    // Closing the modal doesn't clear it, so printing lesson B from Day view
    // used to print whatever lesson A was last opened.
    const f = (id) => fromModal ? (document.getElementById(id)?.value || '') : '';
    const L = lessonFromDb || {};
    const title      = f('lesson-title')      || L.title      || 'Untitled Lesson';
    const date       = f('lesson-date')       || L.date       || formatDate(new Date());
    const classId    = f('lesson-class')      || L.classId;
    const subject    = f('lesson-subject')    || L.subject    || '';
    const duration   = f('lesson-duration')   || L.duration   || '';
    const standards  = f('lesson-standards')  || L.standards  || L.objectives || '';
    const learningTarget  = f('lesson-learning-target')  || L.learningTarget  || '';
    const successCriteria = f('lesson-success-criteria') || L.successCriteria || '';
    const flow       = f('lesson-flow')       || L.flow       || '';
    const materials  = f('lesson-materials')  || L.materials  || '';
    const activities = f('lesson-activities') || L.activities || L.notes || '';

    if (!title) { showToast('Please enter a lesson title'); return; }

    const cls = classes.find(c => c.id === classId);
    const dateObj = new Date(date + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

    function section(label, content) {
        if (!content || !content.trim()) return '';
        return '<div style="margin-bottom:14px;page-break-inside:avoid;">'
            + '<div style="background:#f0f0f0;padding:4px 10px;font-weight:bold;font-size:12px;'
            + 'text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">' + label + '</div>'
            + '<div style="font-size:13px;line-height:1.6;white-space:pre-wrap;padding:0 4px;">' + escHtml(content) + '</div>'
            + '</div>';
    }

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtml(title) + '</title>'
        + '<style>'
        + 'body{font-family:"Segoe UI",Arial,sans-serif;margin:0;padding:0;color:#222;}'
        + '@page{margin:0.6in 0.65in;}'
        + '</style></head><body>'
        + '<div style="border-bottom:3px solid #FF6B9D;padding-bottom:12px;margin-bottom:18px;display:table;width:100%;">'
            + '<div style="display:table-cell;vertical-align:bottom;">'
                + '<div style="font-size:22px;font-weight:bold;color:#FF6B9D;">' + escHtml(title) + '</div>'
                + '<div style="font-size:12px;color:#666;margin-top:4px;">'
                    + [cls ? cls.name : '', subject, formattedDate, duration ? duration + ' min' : ''].filter(Boolean).map(escHtml).join(' &nbsp;·&nbsp; ')
                + '</div>'
            + '</div>'
        + '</div>'
        + section('🎯 Standards &amp; Objectives', standards)
        + section('🎯 Learning Target', learningTarget)
        + section('✅ Success Criteria', successCriteria)
        + section('📋 Lesson Flow', flow)
        + section('📦 Materials Needed', materials)
        + section('📝 Activities &amp; Notes', activities)
        + '</body></html>';

    var win = openPrintWindow();
    win.document.write(preparePrintDoc(html, {v:'0.5in',h:'0.3in'}));
    win.document.close();
    win.onload = function() { setTimeout(function() { win.focus(); win.print(); }, 600); };
}

// Show print button when editing existing lesson
const originalOpenLessonModal = openLessonModal;
if (typeof openLessonModal === 'function') {
    window.openLessonModalWithPrint = function(date, lessonId = null) {
        originalOpenLessonModal(date, lessonId);
        const printBtn = document.getElementById('print-lesson-btn');
        if (printBtn) {
            printBtn.classList.toggle('hidden', !lessonId);
        }
    };
}

// ============================================
// CURRICULUM LIBRARY SYSTEM
// ============================================

let curriculumDocs = [];

// ── Extractors ──────────────────────────────────────────────────────────────

async function readFileAsText(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result || '');
        reader.onerror = () => resolve('');
        reader.readAsText(file);
    });
}

async function readFileAsArrayBuffer(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsArrayBuffer(file);
    });
}

// Extract text from a PDF file using PDF.js (already loaded for calendar import)
async function extractTextFromPdf(file) {
    await Promise.all([ensureLib('pdfjs')]);
    try {
        const ab = await readFileAsArrayBuffer(file);
        if (!ab) return '';
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab), isEvalSupported: false }).promise;
        let fullText = '';
        const maxPages = Math.min(pdf.numPages, 20); // cap at 20 pages
        for (let p = 1; p <= maxPages; p++) {
            const page = await pdf.getPage(p);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        try { pdf.destroy(); } catch (_) {}
        return fullText.trim().substring(0, 12000);
    } catch (e) {
        console.warn('PDF text extraction failed for', file.name, e);
        return '';
    }
}

// Extract readable text from a single file object
// Extract text from a PowerPoint (.pptx) file using JSZip + XML parsing
async function extractTextFromPptx(file) {
    await Promise.all([ensureLib('jszip')]);
    try {
        const ab = await readFileAsArrayBuffer(file);
        if (!ab) return '';
        const zip = await JSZip.loadAsync(ab);

        // Collect all slide XML files in order
        const slideKeys = Object.keys(zip.files)
            .filter(k => k.match(/^ppt\/slides\/slide\d+\.xml$/))
            .sort((a, b) => {
                const na = parseInt(a.match(/\d+/)[0]);
                const nb = parseInt(b.match(/\d+/)[0]);
                return na - nb;
            });

        let fullText = '';
        for (const key of slideKeys) {
            const xml = await zip.files[key].async('string');
            // Extract all <a:t> text nodes (DrawingML text runs)
            const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
            const slideText = matches
                .map(m => m.replace(/<[^>]+>/g, '').trim())
                .filter(Boolean)
                .join(' ');
            if (slideText) fullText += slideText + '\n';
        }

        // Also grab notes if present
        const noteKeys = Object.keys(zip.files)
            .filter(k => k.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/));
        for (const key of noteKeys.slice(0, 10)) {
            const xml = await zip.files[key].async('string');
            const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
            const noteText = matches
                .map(m => m.replace(/<[^>]+>/g, '').trim())
                .filter(Boolean)
                .join(' ');
            if (noteText) fullText += '[Notes] ' + noteText + '\n';
        }

        return fullText.trim().substring(0, 12000);
    } catch (e) {
        console.warn('PPTX extraction failed:', file.name, e);
        return '';
    }
}

async function extractContentFromFile(file) {
    const name = file.name.toLowerCase();
    const type = file.type || '';

    // PDFs — extract text using PDF.js
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
        return await extractTextFromPdf(file);
    }

    // PowerPoint — extract text via JSZip + DrawingML XML parsing
    if (name.endsWith('.pptx') ||
        type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        return await extractTextFromPptx(file);
    }

    // Plain text / markdown / CSV / JSON
    if (type === 'text/plain' || type === 'text/csv' || type === 'application/json'
        || name.endsWith('.txt') || name.endsWith('.md')
        || name.endsWith('.csv') || name.endsWith('.json')) {
        const text = await readFileAsText(file);
        return text.substring(0, 12000);
    }

    return '';
}

// Unpack a ZIP and return array of { name, subject, content, size, fileType }
async function extractZipContents(file, subject, resourceType, description) {
    await Promise.all([ensureLib('jszip'), ensureLib('pdfjs')]);
    const ab = await readFileAsArrayBuffer(file);
    if (!ab) return [];
    const zip   = await JSZip.loadAsync(ab);
    const items = [];
    const skipPrefixes = ['__MACOSX/', '.'];

    for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const filename = path.split('/').pop();
        if (!filename || skipPrefixes.some(p => path.startsWith(p) || filename.startsWith('.'))) continue;

        const ext = filename.split('.').pop().toLowerCase();
        const textExts = ['txt','md','csv','json'];
        let content = '';
        let fileType = ext;

        if (textExts.includes(ext)) {
            const raw = await entry.async('string');
            content = raw.substring(0, 12000);
            fileType = 'text/' + ext;
        } else if (ext === 'pdf') {
            // Extract text from PDF inside ZIP using PDF.js
            try {
                const pdfBytes = await entry.async('uint8array');
                const pdf = await pdfjsLib.getDocument({ data: pdfBytes, isEvalSupported: false }).promise;
                let pdfText = '';
                const maxPages = Math.min(pdf.numPages, 20);
                for (let p = 1; p <= maxPages; p++) {
                    const page = await pdf.getPage(p);
                    const tc = await page.getTextContent();
                    pdfText += tc.items.map(i => i.str).join(' ') + '\n';
                }
                content = pdfText.trim().substring(0, 12000);
            } catch (e) {
                console.warn('PDF extract failed inside ZIP:', filename, e);
            }
            fileType = 'application/pdf';
        } else if (ext === 'pptx') {
            // Extract text from PowerPoint inside ZIP
            try {
                const pptxBytes = await entry.async('uint8array');
                const pptxBlob = new Blob([pptxBytes]);
                const pptxFile = new File([pptxBlob], filename);
                content = await extractTextFromPptx(pptxFile);
            } catch (e) {
                console.warn('PPTX extract failed inside ZIP:', filename, e);
            }
            fileType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        }

        const blob = await entry.async('uint8array');

        // Keep the ORIGINAL of every unpacked file in Storage — stored as-is,
        // regardless of type. PDFs also become viewable in the page picker.
        let storageUrl = null, storagePath = null;
        {
            const _lt = document.querySelector('.loading-text');
            if (_lt) _lt.textContent = `Saving ${filename} to cloud…`;
            const ctMap = {
                pdf:  'application/pdf',
                pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                png:  'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
                txt:  'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json'
            };
            const up = await uploadBytesToStorage(blob, filename, currentUser.uid, ctMap[ext] || undefined);
            storageUrl = up.storageUrl;
            storagePath = up.storagePath;
        }

        items.push({
            name: filename,
            fromZip: file.name,
            subject,
            resourceType,
            description: description || '',
            content,
            size: blob.length,
            fileType,
            hasContent: content.length > 0,
            storageUrl,
            storagePath,
            uploadedAt: new Date().toISOString()
        });
    }
    return items;
}

// ── Curriculum Library ───────────────────────────────────────────────────────

function initCurriculumLibrary() {
    const uploadBtn    = document.getElementById('upload-curriculum-btn');
    const fileInput    = document.getElementById('curriculum-file-upload');
    const zipBtn       = document.getElementById('upload-curriculum-zip-btn');
    const zipInput     = document.getElementById('curriculum-zip-upload');

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleCurriculumUpload);
    }
    if (zipBtn && zipInput) {
        zipBtn.addEventListener('click', () => zipInput.click());
        zipInput.addEventListener('change', handleCurriculumUpload);
    }

    // Filter buttons
    document.querySelectorAll('.curriculum-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.curriculum-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderCurriculumLibrary(btn.dataset.filter);
        });
    });

    loadCurriculumDocs();
}

async function loadCurriculumDocs() {
    if (!currentUser) return;
    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('curriculum').orderBy('uploadedAt', 'desc').get();
        curriculumDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCurriculumLibrary();
    } catch (error) {
        console.error('Error loading curriculum:', error);
    }
}


// ── Upload a file to Firebase Storage and return its download URL ────────
async function uploadFileToStorage(file, uid) {
    try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `users/${uid}/curriculum/${Date.now()}_${safeName}`;
        const ref = storage.ref(path);
        const snapshot = await ref.put(file);
        const url = await snapshot.ref.getDownloadURL();
        return { storageUrl: url, storagePath: path };
    } catch (e) {
        console.warn('Storage upload failed (text extraction only):', e.message);
        return { storageUrl: null, storagePath: null };
    }
}

// Upload raw bytes (e.g. a file unpacked from a ZIP) so the ORIGINAL is kept —
// this is what lets PDFs render as actual pages in the page picker.
async function uploadBytesToStorage(bytes, filename, uid, contentType) {
    try {
        const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        const rand = Math.random().toString(36).slice(2, 7);
        const path = `users/${uid}/curriculum/${Date.now()}_${rand}_${safeName}`;
        const ref = storage.ref(path);
        const snapshot = await ref.put(bytes, contentType ? { contentType } : undefined);
        const url = await snapshot.ref.getDownloadURL();
        return { storageUrl: url, storagePath: path };
    } catch (e) {
        console.warn('Storage bytes upload failed:', filename, e.message);
        return { storageUrl: null, storagePath: null };
    }
}

async function handleCurriculumUpload(e) {
    const files   = Array.from(e.target.files || []);
    if (!files.length) return;

    const subject      = document.getElementById('curriculum-subject')?.value || 'other';
    const resourceType = document.getElementById('curriculum-resource-type')?.value || 'other';
    const description  = document.getElementById('curriculum-description')?.value?.trim() || '';

    showLoading();
    document.querySelector('.loading-text').textContent = 'Processing resources...';

    let totalAdded = 0;

    for (const file of files) {
        const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';

        if (isZip) {
            // Unpack zip and save each file as its own resource
            document.querySelector('.loading-text').textContent = `Unpacking ${file.name}...`;
            try {
                const items = await extractZipContents(file, subject, resourceType, description);
                for (const item of items) {
                    const docRef = await db.collection('users').doc(currentUser.uid)
                        .collection('curriculum').add(item);
                    curriculumDocs.unshift({ id: docRef.id, ...item });
                    totalAdded++;
                }
                updateYearChecklist();
                showToast(`✅ Unpacked ${items.length} files from ${file.name}`);
            } catch (err) {
                console.error('ZIP error:', err);
                showToast(`❌ Could not unpack ${file.name}`);
            }
        } else {
            // Single file
            const isPdf  = file.name.toLowerCase().endsWith('.pdf');
            const isPptx = file.name.toLowerCase().endsWith('.pptx');
            document.querySelector('.loading-text').textContent = isPdf
                ? `Extracting text from ${file.name}…`
                : isPptx
                ? `Reading slides from ${file.name}…`
                : `Processing ${file.name}...`;
            try {
                const content = await extractContentFromFile(file);
                document.querySelector('.loading-text').textContent = `Saving ${file.name} to cloud…`;
                const { storageUrl, storagePath } = await uploadFileToStorage(file, currentUser.uid);
                const docData = {
                    name: file.name,
                    subject,
                    resourceType,
                    description,
                    fileType: file.type || file.name.split('.').pop(),
                    size: file.size,
                    content,
                    hasContent: content.length > 0,
                    storageUrl: storageUrl || null,
                    storagePath: storagePath || null,
                    uploadedAt: new Date().toISOString()
                };
                const docRef = await db.collection('users').doc(currentUser.uid)
                    .collection('curriculum').add(docData);
                curriculumDocs.unshift({ id: docRef.id, ...docData });
                totalAdded++;
                if (!storageUrl) {
                    // Original file did NOT store — only text/metadata was saved.
                    showToast(`⚠️ ${file.name}: saved, but the original file couldn't upload (deploy Storage rules).`);
                } else {
                    showToast(`✅ Added: ${file.name}`);
                }
            } catch (err) {
                console.error('Upload error:', err);
                showToast(`❌ Error uploading ${file.name}`);
            }
        }
    }

    e.target.value = '';
    renderCurriculumLibrary();
    hideLoading();
    if (totalAdded > 1) showToast(`✅ ${totalAdded} resources added to your library`);
}

function renderCurriculumLibrary(filter = 'all') {
    const container = document.getElementById('curriculum-library-list');
    if (!container) return;

    const filtered = filter === 'all'
        ? curriculumDocs
        : curriculumDocs.filter(d => d.subject === filter);

    if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-state">${filter === 'all' ? 'No resources uploaded yet.' : 'No ' + filter + ' resources yet.'}</p>`;
        return;
    }

    const subjectIcons = { math:'📐', ela:'📖', phonics:'🔤', science:'🔬', social:'🌍', other:'📁' };
    const typeLabels   = { worksheet:'📝 Worksheet', reading:'📖 Reading', 'word-list':'🔤 Word List',
        activity:'🎮 Activity', 'lesson-guide':'📋 Guide', 'answer-key':'✅ Answer Key', other:'📁 Other' };

    const isPdfDoc = d => d.fileType === 'application/pdf' || (d.name || '').toLowerCase().endsWith('.pdf');

    const bulkBar = `
        <div class="curr-bulk-bar">
            <label class="curr-selectall"><input type="checkbox" id="curr-select-all" onchange="toggleSelectAllCurriculum(this)"> Select all</label>
            <span class="curr-bulk-hint">${filtered.length} shown</span>
            <button type="button" id="curr-delete-selected" class="btn btn-sm btn-danger" onclick="deleteCurriculumSelected()" disabled>🗑️ Delete selected (0)</button>
        </div>`;

    container.innerHTML = bulkBar + filtered.map(doc => {
        const pdf = isPdfDoc(doc);
        const pageStatus = pdf
            ? (doc.storageUrl
                ? '<span class="curriculum-content-badge curr-pages-yes">📄 pages ready</span>'
                : '<span class="curriculum-content-badge curr-pages-no">⚠️ no file — attach to use pages</span>')
            : '';
        return `
        <div class="curriculum-doc-item" data-id="${doc.id}">
            <input type="checkbox" class="curr-select" value="${doc.id}" onchange="updateCurrSelCount()" title="Select for bulk delete">
            <span class="curriculum-doc-icon">${subjectIcons[doc.subject] || '📄'}</span>
            <div class="curriculum-doc-info">
                <div class="curriculum-doc-name">${escHtml(doc.name)}</div>
                <div class="curriculum-doc-meta curriculum-doc-meta-editable">
                    <select class="curriculum-inline-select" data-id="${doc.id}" data-field="subject"
                        onchange="updateCurriculumField('${doc.id}','subject',this.value)"
                        title="Edit subject">
                        ${['math','ela','phonics','science','social','other'].map(s =>
                            `<option value="${s}" ${doc.subject===s?'selected':''}>${subjectIcons[s]||'📁'} ${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
                        ).join('')}
                    </select>
                    <select class="curriculum-inline-select" data-id="${doc.id}" data-field="resourceType"
                        onchange="updateCurriculumField('${doc.id}','resourceType',this.value)"
                        title="Edit resource type">
                        ${Object.entries(typeLabels).map(([k,v]) =>
                            `<option value="${k}" ${doc.resourceType===k?'selected':''}>${v}</option>`
                        ).join('')}
                    </select>
                    <span class="curriculum-doc-size">${formatFileSize(doc.size)}</span>
                    ${doc.fromZip ? `<span class="curriculum-zip-badge" title="From ${doc.fromZip}">🗜️ ZIP</span>` : ''}
                </div>
                ${doc.description ? `<div class="curriculum-doc-desc">${doc.description}</div>` : ''}
                ${doc.hasContent
                    ? `<span class="curriculum-content-badge curriculum-content-yes">✅ AI-readable</span>`
                    : `<span class="curriculum-content-badge curriculum-content-no">📄 Name only</span>`}
                ${pageStatus}
            </div>
            <div class="curriculum-doc-actions">
                ${doc.content ? `<button class="btn btn-icon-sm" onclick="previewCurriculumDoc('${doc.id}')" title="Preview content">👁</button>` : ''}
                ${!doc.storageUrl ? `<button class="btn btn-icon-sm" onclick="attachOriginalToDoc('${doc.id}')" title="Attach the original file so it's stored as-is${pdf ? ' and usable in the page picker' : ''}">📎</button>` : ''}
                ${!doc.hasContent && (doc.fileType === 'application/pdf' || doc.name?.endsWith('.pdf'))
                    ? `<button class="btn btn-icon-sm" onclick="reExtractPdf('${doc.id}')" title="Extract text from PDF">🔄</button>` : ''}
                ${!doc.hasContent && (doc.name?.toLowerCase().endsWith('.pptx') ||
                    doc.fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
                    ? `<button class="btn btn-icon-sm" onclick="reExtractPptx('${doc.id}')" title="Extract text from PowerPoint">🔄</button>` : ''}
                ${friends.length > 0 ? `<button class="btn btn-icon-sm btn-share-resource" onclick="openShareResourceModal('${doc.id}')" title="Share with a colleague">📤</button>` : ''}
                <button class="btn btn-icon-sm btn-danger" onclick="deleteCurriculumDoc('${doc.id}')" title="Delete">🗑️</button>
            </div>
        </div>`;
    }).join('');
    updateCurrSelCount();
}

function previewCurriculumDoc(docId) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc || !doc.content) return;
    const preview = doc.content.substring(0, 800);
    planyAlert(`${preview}${doc.content.length > 800 ? '\n\n[... content continues ...]' : ''}`, { title: `📄 ${doc.name}` });
}

// Re-extract text from a PDF that was previously uploaded without text
function reExtractPdf(docId) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.name !== doc.name) {
            showToast('⚠️ Please select the same file: ' + doc.name);
            return;
        }
        showLoading();
        document.querySelector('.loading-text').textContent = 'Extracting text from ' + file.name + '…';
        try {
            const content = await extractTextFromPdf(file);
            if (!content) { showToast('⚠️ No text found — PDF may be a scanned image'); hideLoading(); return; }
            await db.collection('users').doc(currentUser.uid)
                .collection('curriculum').doc(docId).update({ content, hasContent: true });
            doc.content = content;
            doc.hasContent = true;
            const activeFilter = document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all';
            renderCurriculumLibrary(activeFilter);
            showToast('✅ Extracted ' + content.length + ' characters from ' + file.name);
        } catch (err) {
            console.error('Re-extract error:', err);
            showToast('❌ Could not extract text from PDF');
        }
        hideLoading();
    };
    input.click();
}


// Re-extract text from a PPTX that was previously uploaded without text
function reExtractPptx(docId) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pptx';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.name !== doc.name) {
            showToast('⚠️ Please select the same file: ' + doc.name);
            return;
        }
        showLoading();
        document.querySelector('.loading-text').textContent = 'Reading slides from ' + file.name + '…';
        try {
            const content = await extractTextFromPptx(file);
            if (!content) {
                showToast('⚠️ No text found — slides may contain only images');
                hideLoading();
                return;
            }
            await db.collection('users').doc(currentUser.uid)
                .collection('curriculum').doc(docId).update({ content, hasContent: true });
            doc.content = content;
            doc.hasContent = true;
            const activeFilter = document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all';
            renderCurriculumLibrary(activeFilter);
            showToast('✅ Extracted ' + content.length.toLocaleString() + ' characters from ' + file.name);
        } catch (err) {
            console.error('Re-extract PPTX error:', err);
            showToast('❌ Could not extract text from PowerPoint');
        }
        hideLoading();
    };
    input.click();
}

async function updateCurriculumField(docId, field, value) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;
    doc[field] = value;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('curriculum').doc(docId).update({ [field]: value });
        // Re-render to update icon and active filter if subject changed
        const activeFilter = document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all';
        renderCurriculumLibrary(activeFilter);
    } catch (e) {
        console.error('Update curriculum field error:', e);
        showToast('❌ Could not save change');
    }
}

async function deleteCurriculumDoc(docId) {
    if (!await planyConfirm('Delete this resource?')) return;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('curriculum').doc(docId).delete();
        curriculumDocs = curriculumDocs.filter(d => d.id !== docId);
        renderCurriculumLibrary(
            document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all'
        );
        showToast('Resource deleted');
    } catch (error) {
        console.error('Error deleting:', error);
    }
}

// ── Multi-select delete ──────────────────────────────────────────────
function updateCurrSelCount() {
    const checked = document.querySelectorAll('.curr-select:checked').length;
    const total = document.querySelectorAll('.curr-select').length;
    const btn = document.getElementById('curr-delete-selected');
    if (btn) {
        btn.textContent = `🗑️ Delete selected (${checked})`;
        btn.disabled = checked === 0;
    }
    const all = document.getElementById('curr-select-all');
    if (all) {
        all.checked = total > 0 && checked === total;
        all.indeterminate = checked > 0 && checked < total;
    }
}

function toggleSelectAllCurriculum(cb) {
    document.querySelectorAll('.curr-select').forEach(c => { c.checked = cb.checked; });
    updateCurrSelCount();
}

async function deleteCurriculumSelected() {
    const ids = Array.from(document.querySelectorAll('.curr-select:checked')).map(c => c.value);
    if (ids.length === 0) return;
    if (!await planyConfirm(`Delete ${ids.length} selected resource${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;

    showLoading();
    const lt = document.querySelector('.loading-text');
    if (lt) lt.textContent = `Deleting ${ids.length} resource${ids.length !== 1 ? 's' : ''}…`;
    let ok = 0;
    const deleted = new Set();
    try {
        const col = db.collection('users').doc(currentUser.uid).collection('curriculum');
        // Firestore batches cap at 500 writes
        for (let i = 0; i < ids.length; i += 400) {
            const chunk = ids.slice(i, i + 400);
            const batch = db.batch();
            chunk.forEach(id => batch.delete(col.doc(id)));
            await batch.commit();
            ok += chunk.length;
            chunk.forEach(id => deleted.add(id));
            // Best-effort: also remove any stored original files
            chunk.forEach(id => {
                const d = curriculumDocs.find(x => x.id === id);
                if (d?.storagePath) { try { storage.ref(d.storagePath).delete().catch(() => {}); } catch (e) {} }
            });
        }
        showToast(`🗑️ Deleted ${ok} resource${ok !== 1 ? 's' : ''}`);
    } catch (e) {
        console.error('Bulk delete error:', e);
        showToast(`❌ Deleted ${ok} of ${ids.length}; the rest failed: ` + (e.message || 'error'));
    } finally {
        // v6.5.0: drop whatever WAS deleted from the list, even after a failure
        curriculumDocs = curriculumDocs.filter(d => !deleted.has(d.id));
        renderCurriculumLibrary(document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all');
        hideLoading();
    }
}

// ── Attach an original file to an existing doc (backfill storageUrl) ──
// Lets a PDF that was uploaded without its original become viewable in the
// page picker — no need to delete and re-create the resource.
function attachOriginalToDoc(docId) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        showLoading();
        const lt = document.querySelector('.loading-text');
        if (lt) lt.textContent = `Attaching ${file.name}…`;
        try {
            const { storageUrl, storagePath } = await uploadFileToStorage(file, currentUser.uid);
            if (!storageUrl) {
                showToast('❌ File could not upload — deploy the Storage rules first.');
                return;
            }
            const update = { storageUrl, storagePath };
            const t = file.type || '';
            if (t) update.fileType = t;                       // keep the real type
            else if (/\.pdf$/i.test(file.name)) update.fileType = 'application/pdf';
            await db.collection('users').doc(currentUser.uid).collection('curriculum').doc(docId).update(update);
            Object.assign(doc, update);
            renderCurriculumLibrary(document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all');
            const isPdfNow = (update.fileType || doc.fileType) === 'application/pdf' || /\.pdf$/i.test(doc.name || '');
            showToast(`✅ Original stored for “${doc.name}”${isPdfNow ? ' — now usable in the page picker' : ''}`);
        } catch (e) {
            console.error('attachOriginalToDoc:', e);
            showToast('❌ Could not attach file: ' + (e.message || 'error'));
        } finally {
            hideLoading();
        }
    };
    input.click();
}

// ============================================
// USER PROFILE SYSTEM
// ============================================

let userProfile = {
    username: '',
    role: '',
    grade: '',
    school: '',
    district: '',
    profilePicture: ''
};

// Reset all in-memory, account-specific state to defaults. Called on every
// auth change so a newly signed-in account never inherits the previous user's
// profile/settings that live only in memory. (Firestore data is per-uid and
// reloads cleanly; these globals otherwise persist across account switches.)
function resetUserState() {
    // Undo history belongs to the previous account/year (v6.0.2).
    try { undoStack.length = 0; redoStack.length = 0; } catch (_) { /* not initialised yet */ }
    settings = {
        schoolYear: '2025-2026',
        yearStart: '2025-08-05',
        yearEnd: '2026-05-22',
        breaks: [],
        background: 'classroom'
    };
    userProfile = {
        username: '', role: '', grade: '', school: '', district: '', profilePicture: ''
    };

    // Wipe every account-scoped in-memory collection so a newly signed-in
    // account can never see the previous account's data before/if its own
    // loaders run. Firestore loaders repopulate these per-uid on login.
    classes = [];
    lessons = [];
    events = [];
    students = [];
    assignments = [];
    attendance = {};
    communications = [];
    units = [];
    techTools = [];
    subDays = {};
    emergencySubPlans = { general: {}, days: {} };
    classGradeSettings = {};
    friends = [];
    sharedLessons = [];
    principalLinkedTeachers = [];
    teacherLinkRequests = [];
    // v6.4.0: these also belonged to the previous account (a shared AI key,
    // the curriculum library, inboxes and badges)
    try {
        stopLiveListeners();
        incomingKeyShare = null;
        myKeyGrants = [];
        curriculumDocs = [];
        pendingRequests = [];
        unreadCount = 0;
        sharedResourceInbox = [];
        sharedResourceUnread = 0;
        teacherFeedback = [];
        seatingData = { rows: 5, cols: 6, seats: {} };
        window._commsYear = null;
    } catch (_) { /* declared later in the file; fine before first load */ }

    // Clear principal-preview scratch state
    _previewTeacher = null;
    _savedClasses = _savedLessons = _savedEvents = _savedSettings = null;

    // Clear in-memory Microsoft / Moodle connection state
    if (typeof msAccessToken !== 'undefined') { msAccessToken = null; msUserEmail = ''; msUserId = ''; }
    if (typeof moodleUrl !== 'undefined')      { moodleUrl = ''; moodleToken = ''; }
}

// Device-local (localStorage) state that belongs to a specific account. Purged
// when a DIFFERENT account signs in on the same device (see the auth handler),
// so AI keys/name, Microsoft/Moodle tokens, and cached prefs never bleed across
// accounts. localStorage is shared by every account on a device, so resetting
// in-memory globals alone is not enough — these keys must be removed too.
// Only the sensitive keys -- used on sign-out. (UI preferences such as the
// dismissed-checklist flags are kept so they don't reappear every login.)
function clearAccountSecrets() {
    try {
        [
            'ai_key_anthropic', 'ai_key_openai', 'ai_key_gemini', 'anthropic_api_key',
            'ms_token', 'ms_refresh', 'ms_user_id', 'ms_user_email', 'moodle_token'
        ].forEach(k => localStorage.removeItem(k));
    } catch (e) { console.warn('clearAccountSecrets:', e); }
}

function clearAccountStorage() {
    try {
        [
            'ai_provider', 'ai_key_anthropic', 'ai_key_openai', 'ai_key_gemini',
            'anthropic_api_key', 'ai_packet_grade', 'ai_teacher_name', 'ai_ignore_shared_key',
            'ms_client_id', 'ms_token', 'ms_refresh', 'ms_user_id', 'ms_user_email',
            'moodle_url', 'moodle_token', 'plany_last_school_year'
        ].forEach(k => localStorage.removeItem(k));

        // Prefix-keyed per-account flags (one entry per school year)
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('checklist_dismissed_') || k.startsWith('plany_new_year_dismissed_')) {
                localStorage.removeItem(k);
            }
        });
    } catch (e) { console.warn('clearAccountStorage:', e); }
}

// Initialize user profile system
function initUserProfile() {
    // Load profile data
    loadUserProfile();
}

// Load user profile from Firestore
async function loadUserProfile() {
    if (!currentUser) return;
    
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists) {
            const data = doc.data();
            // v6.0.2: msUserId was readable by every user and was the input
            // to the old derived Microsoft password. Scrub it from our doc.
            if (data.msUserId !== undefined || data.msConnected !== undefined) {
                db.collection('users').doc(currentUser.uid).update({
                    msUserId: firebase.firestore.FieldValue.delete(),
                    msConnected: firebase.firestore.FieldValue.delete()
                }).catch(() => {});
            }
            userProfile = {
                username: data.username || data.displayName || currentUser.displayName || '',
                role: data.role || '',
                grade: data.grade || '',
                school: data.school || '',
                district: data.district || '',
                profilePicture: data.profilePicture || ''
            };
            
        } else {
            userProfile = { username: '', role: '', grade: '', school: '', district: '', profilePicture: '' };
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}


// Handle profile picture upload
async function handleProfilePictureUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file');
        return;
    }
    
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be less than 2MB');
        return;
    }
    
    showLoading();
    
    try {
        // Convert to base64 for storage (for simplicity; could use Firebase Storage)
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target.result;
            
            // Resize image if needed
            const resized = await resizeImage(base64, 200, 200);
            userProfile.profilePicture = resized;
            
            // Save to Firestore
            await db.collection('users').doc(currentUser.uid).set({
                profilePicture: resized,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            showToast('Profile picture updated!');
            hideLoading();
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Error uploading picture:', error);
        showToast('Error uploading picture');
        hideLoading();
    }
}

// Resize image helper
function resizeImage(base64, maxWidth, maxHeight) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = base64;
    });
}


// ============================================
// TEACHER FRIENDS SYSTEM
// ============================================

let friends = [];
let pendingRequests = [];
let sharedLessons = [];
let unreadCount = 0;
let currentFriendsSort = 'all';

// Initialize friends system
function initFriendsSystem() {
    // Add friend button (new)
    document.getElementById('add-friend-btn')?.addEventListener('click', sendFriendRequestFromInput);
    document.getElementById('friend-email-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendFriendRequestFromInput();
        }
    });
    
    // Sort tabs
    document.querySelectorAll('.sort-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFriendsSort = tab.dataset.sort;
            renderFriendsList();
        });
    });
    
    // Load friends data
    loadFriendsData();
    
    // Real-time listeners start from startLiveListeners() once the account's
    // data has loaded (v6.4.0)
    startLiveListeners();
}

// Send friend request from the settings input
async function sendFriendRequestFromInput() {
    const emailInput = document.getElementById('friend-email-input');
    if (!emailInput) return;
    
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email) {
        showToast('Please enter an email address');
        return;
    }
    
    if (email === currentUser.email.toLowerCase()) {
        showToast("You can't add yourself!");
        return;
    }
    
    // Check if already friends
    if (friends.some(f => f.email.toLowerCase() === email)) {
        showToast('Already friends!');
        return;
    }
    
    showLoading();
    
    try {
        // Find user by email
        const usersSnap = await db.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();
        
        if (usersSnap.empty) {
            showToast('No teacher found with that email');
            hideLoading();
            return;
        }
        
        const targetUser = usersSnap.docs[0];
        
        // Check for existing request
        const existingRequest = await db.collection('friendRequests')
            .where('fromUid', '==', currentUser.uid)
            .where('toUid', '==', targetUser.id)
            .where('status', '==', 'pending')
            .get();
        
        if (!existingRequest.empty) {
            showToast('Friend request already sent!');
            hideLoading();
            return;
        }
        
        // Create friend request with profile info
        await db.collection('friendRequests').add({
            fromUid: currentUser.uid,
            fromEmail: currentUser.email,
            fromName: userProfile.username || currentUser.displayName || currentUser.email,
            fromProfile: {
                role: userProfile.role,
                grade: userProfile.grade,
                school: userProfile.school,
                district: userProfile.district,
                profilePicture: userProfile.profilePicture
            },
            toUid: targetUser.id,
            toEmail: email,
            status: 'pending',
            sentAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        emailInput.value = '';
        showToast('Friend request sent!');
        
    } catch (error) {
        console.error('Error sending request:', error);
        showToast('Error sending friend request');
    }
    
    hideLoading();
}

// Load all friends data
async function loadFriendsData() {
    if (!currentUser) return;
    
    try {
        // Load friends
        const friendsSnap = await db.collection('users').doc(currentUser.uid)
            .collection('friends').get();
        
        // Fetch full profile data for each friend
        const friendPromises = friendsSnap.docs.map(async (doc) => {
            const friendData = { id: doc.id, ...doc.data() };
            
            // Try to get their full profile
            try {
                const profileDoc = await db.collection('users').doc(friendData.uid).get();
                if (profileDoc.exists) {
                    const profile = profileDoc.data();
                    friendData.username = profile.username || friendData.name;
                    friendData.name = profile.username || profile.displayName || friendData.name;
                    friendData.role = profile.role || '';
                    friendData.grade = profile.grade || '';
                    friendData.school = profile.school || '';
                    friendData.district = profile.district || '';
                    friendData.profilePicture = profile.profilePicture || '';
                }
            } catch (e) {
                console.log('Could not fetch profile for friend:', friendData.uid);
            }
            
            return friendData;
        });
        
        friends = await Promise.all(friendPromises);
        
        // Load pending requests (incoming)
        const requestsSnap = await db.collection('friendRequests')
            .where('toUid', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        pendingRequests = requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Load shared lessons
        const sharedSnap = await db.collection('sharedLessons')
            .where('toUid', '==', currentUser.uid)
            .orderBy('sharedAt', 'desc')
            .limit(20)
            .get();
        sharedLessons = sharedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Count unread
        unreadCount = pendingRequests.length + sharedLessons.filter(s => !s.read).length;
        updateUnreadBadge();
        
        // Render
        renderFriendsList();
        renderPendingRequests();
        renderSharedLessons();
        renderActivityFeed();
        
    } catch (error) {
        console.error('Error loading friends data:', error);
    }
}

// Listen for real-time updates
// ── Live listeners follow the signed-in account (v6.4.0) ───────────────
// They used to start once, 1 s after page load -- before sign-in had
// finished on a fresh login, so they never started -- and were never
// stopped, so after switching accounts the old account's queries kept
// running. Now they start after each account's data loads and stop on
// sign-out / account switch.
const _liveUnsubs = [];
let _liveUid = null;
function stopLiveListeners() {
    while (_liveUnsubs.length) { try { _liveUnsubs.pop()(); } catch (_) {} }
    _liveUid = null;
}
function startLiveListeners() {
    if (!currentUser || _liveUid === currentUser.uid) return;
    stopLiveListeners();
    _liveUid = currentUser.uid;
    listenForFriendUpdates();
    listenForSharedResources();
    loadFriendsData();
}
const _liveErr = (what) => (e) => console.warn(`live ${what} listener:`, e.message);

function listenForFriendUpdates() {
    if (!currentUser) return;
    
    // Listen for new friend requests
    _liveUnsubs.push(db.collection('friendRequests')
        .where('toUid', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            pendingRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderPendingRequests();
            updateUnreadBadge();
        }, _liveErr('friend requests')));
    
    // Listen for new shared lessons
    _liveUnsubs.push(db.collection('sharedLessons')
        .where('toUid', '==', currentUser.uid)
        .orderBy('sharedAt', 'desc')
        .limit(20)
        .onSnapshot(snapshot => {
            sharedLessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderSharedLessons();
            updateUnreadBadge();
        }, _liveErr('shared lessons')));
}

// Send friend request
// Accept friend request
async function acceptFriendRequest(requestId) {
    const request = pendingRequests.find(r => r.id === requestId);
    if (!request) return;
    
    try {
        showLoading();
        
        // Add to both users' friends lists
        const friendData = {
            uid: request.fromUid,
            email: request.fromEmail,
            name: request.fromName,
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const myDataForThem = {
            uid: currentUser.uid,
            email: currentUser.email,
            name: currentUser.displayName || currentUser.email,
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add friend to my list
        await db.collection('users').doc(currentUser.uid)
            .collection('friends').doc(request.fromUid).set(friendData);
        
        // Add me to their list
        await db.collection('users').doc(request.fromUid)
            .collection('friends').doc(currentUser.uid).set(myDataForThem);
        
        // Update request status
        await db.collection('friendRequests').doc(requestId).update({
            status: 'accepted',
            acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Reload data
        loadFriendsData();
        showToast(`You are now friends with ${request.fromName}!`);
        
    } catch (error) {
        console.error('Error accepting request:', error);
        showToast('Error accepting request');
    }
    
    hideLoading();
}

// Decline friend request
async function declineFriendRequest(requestId) {
    try {
        await db.collection('friendRequests').doc(requestId).update({
            status: 'declined'
        });
        showToast('Request declined');
        loadFriendsData();
    } catch (error) {
        console.error('Error declining:', error);
    }
}

// Remove friend
async function removeFriend(friendUid) {
    if (!await planyConfirm('Remove this friend?')) return;
    
    try {
        // Remove from both lists
        await db.collection('users').doc(currentUser.uid)
            .collection('friends').doc(friendUid).delete();
        
        await db.collection('users').doc(friendUid)
            .collection('friends').doc(currentUser.uid).delete();
        
        loadFriendsData();
        showToast('Friend removed');
    } catch (error) {
        console.error('Error removing friend:', error);
        showToast('Error removing friend');
        loadFriendsData();
    }
}

// Share lesson with friends
function openShareModal(lessonId) {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;
    
    document.getElementById('share-lesson-id').value = lessonId;
    document.getElementById('share-lesson-title').textContent = lesson.title;
    document.getElementById('share-lesson-date').textContent = formatDisplayDate(new Date(lesson.date + 'T00:00:00'));
    
    // Populate friends checklist
    const container = document.getElementById('share-friends-list');
    if (friends.length === 0) {
        container.innerHTML = '<p class="empty-state">Add friends first to share lessons!</p>';
    } else {
        container.innerHTML = friends.map(friend => `
            <label class="share-friend-option">
                <input type="checkbox" name="share-to" value="${friend.uid}">
                <span>${escHtml(friend.name)}</span>
                <span style="color: var(--text-muted); font-size: 0.8rem;">(${friend.email})</span>
            </label>
        `).join('');
    }
    
    document.getElementById('share-modal').classList.remove('hidden');
}

// Handle share form submit
document.getElementById('share-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const lessonId = document.getElementById('share-lesson-id').value;
    const lesson = lessons.find(l => l.id === lessonId);
    const message = document.getElementById('share-message').value;
    
    const selectedFriends = Array.from(document.querySelectorAll('input[name="share-to"]:checked'))
        .map(cb => cb.value);
    
    if (selectedFriends.length === 0) {
        showToast('Please select at least one friend');
        return;
    }
    
    try {
        showLoading();
        
        for (const friendUid of selectedFriends) {
            const friend = friends.find(f => f.uid === friendUid);
            
            await db.collection('sharedLessons').add({
                fromUid: currentUser.uid,
                fromEmail: currentUser.email,
                fromName: currentUser.displayName || currentUser.email,
                toUid: friendUid,
                toEmail: friend.email,
                lesson: {
                    title: lesson.title,
                    date: lesson.date,
                    subject: lesson.subject,
                    standards: lesson.standards || '',
                    learningTarget: lesson.learningTarget || '',
                    successCriteria: lesson.successCriteria || '',
                    flow: lesson.flow || '',
                    materials: lesson.materials || '',
                    activities: lesson.activities || ''
                },
                message: message,
                read: false,
                sharedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        document.getElementById('share-modal').classList.add('hidden');
        document.getElementById('share-form').reset();
        showToast(`Lesson shared with ${selectedFriends.length} friend(s)!`);
        
    } catch (error) {
        console.error('Error sharing lesson:', error);
        showToast('Error sharing lesson');
    }
    
    hideLoading();
});

// View shared lesson
function viewSharedLesson(sharedId) {
    const shared = sharedLessons.find(s => s.id === sharedId);
    if (!shared) return;
    
    // Mark as read
    if (!shared.read) {
        db.collection('sharedLessons').doc(sharedId).update({ read: true });
    }
    
    const content = document.getElementById('shared-lesson-content');
    content.innerHTML = `
        <div class="shared-from">
            <span class="friend-avatar">${escHtml((shared.fromName||'?').charAt(0).toUpperCase())}</span>
            <div>
                <strong>${escHtml(shared.fromName)}</strong> shared this with you
                ${shared.message ? `<p style="margin: 0.5rem 0 0; font-style: italic;">"${escHtml(shared.message)}"</p>` : ''}
            </div>
        </div>
        
        <h3 style="margin-bottom: 0.5rem;">${escHtml(shared.lesson.title)}</h3>
        <p style="color: var(--text-muted); margin-bottom: 1rem;">${formatDisplayDate(new Date(shared.lesson.date + 'T00:00:00'))} • ${escHtml(shared.lesson.subject || 'General')}</p>
        
        ${shared.lesson.standards ? `
        <div class="shared-lesson-section">
            <h4>Standards & Objectives</h4>
            <pre>${escHtml(shared.lesson.standards)}</pre>
        </div>` : ''}

        ${shared.lesson.learningTarget ? `
        <div class="shared-lesson-section">
            <h4>🎯 Learning Target</h4>
            <pre>${escHtml(shared.lesson.learningTarget)}</pre>
        </div>` : ''}

        ${shared.lesson.successCriteria ? `
        <div class="shared-lesson-section">
            <h4>✅ Success Criteria</h4>
            <pre>${escHtml(shared.lesson.successCriteria)}</pre>
        </div>` : ''}

        ${shared.lesson.flow ? `
        <div class="shared-lesson-section">
            <h4>Lesson Flow</h4>
            <pre>${escHtml(shared.lesson.flow)}</pre>
        </div>` : ''}
        
        ${shared.lesson.materials ? `
        <div class="shared-lesson-section">
            <h4>Materials</h4>
            <pre>${escHtml(shared.lesson.materials)}</pre>
        </div>` : ''}
        
        ${shared.lesson.activities ? `
        <div class="shared-lesson-section">
            <h4>Activities & Notes</h4>
            <pre>${escHtml(shared.lesson.activities)}</pre>
        </div>` : ''}
    `;
    
    document.getElementById('copy-shared-lesson-btn').onclick = () => copySharedLesson(shared);
    document.getElementById('view-shared-modal').classList.remove('hidden');
}

// Copy shared lesson to my lessons
async function copySharedLesson(shared) {
    // Open lesson modal with data pre-filled
    const lessonData = {
        title: shared.lesson.title + ' (Shared)',
        date: shared.lesson.date,
        subject: shared.lesson.subject,
        standards: shared.lesson.standards,
        learningTarget: shared.lesson.learningTarget,
        successCriteria: shared.lesson.successCriteria,
        flow: shared.lesson.flow,
        materials: shared.lesson.materials,
        activities: shared.lesson.activities
    };
    
    // Close the view modal
    document.getElementById('view-shared-modal').classList.add('hidden');
    
    // Open lesson modal and fill in data
    openLessonModal(shared.lesson.date);
    
    setTimeout(() => {
        document.getElementById('lesson-title').value = lessonData.title;
        document.getElementById('lesson-subject').value = lessonData.subject || '';
        document.getElementById('lesson-standards').value = lessonData.standards || '';
        document.getElementById('lesson-learning-target').value = lessonData.learningTarget || '';
        document.getElementById('lesson-success-criteria').value = lessonData.successCriteria || '';
        document.getElementById('lesson-flow').value = lessonData.flow || '';
        document.getElementById('lesson-materials').value = lessonData.materials || '';
        document.getElementById('lesson-activities').value = lessonData.activities || '';
    }, 100);
    
    showToast('Lesson copied - edit and save to add to your calendar!');
}

// Render functions
function renderFriendsList() {
    const container = document.getElementById('friends-list');
    if (!container) return;
    
    if (friends.length === 0) {
        container.innerHTML = '<p class="empty-state">No friends yet. Add a colleague above!</p>';
        return;
    }
    
    // Sort friends based on current sort tab
    let sortedFriends = [...friends];
    let groupedFriends = null;
    
    if (currentFriendsSort === 'school') {
        groupedFriends = groupBy(sortedFriends, f => f.school || 'Unknown School');
    } else if (currentFriendsSort === 'grade') {
        groupedFriends = groupBy(sortedFriends, f => formatGrade(f.grade) || 'Unknown Grade');
    } else if (currentFriendsSort === 'role') {
        groupedFriends = groupBy(sortedFriends, f => formatRole(f.role) || 'Unknown Role');
    } else if (currentFriendsSort === 'district') {
        groupedFriends = groupBy(sortedFriends, f => f.district || 'Unknown District');
    }
    
    if (groupedFriends) {
        // Render grouped
        let html = '';
        const sortedGroups = Object.keys(groupedFriends).sort();
        
        for (const group of sortedGroups) {
            const groupFriends = groupedFriends[group];
            html += `
                <div class="friends-group">
                    <div class="friends-group-header">
                        ${group}
                        <span class="friends-group-count">${groupFriends.length}</span>
                    </div>
                    <div class="friends-grid">
                        ${groupFriends.map(friend => renderFriendCard(friend)).join('')}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } else {
        // Render flat list
        container.innerHTML = `
            <div class="friends-grid">
                ${sortedFriends.map(friend => renderFriendCard(friend)).join('')}
            </div>
        `;
    }
}

// Render a single friend card
function renderFriendCard(friend) {
    const avatarContent = friend.profilePicture 
        ? `<img src="${escHtml(safeImgUrl(friend.profilePicture))}" alt="${escHtml(friend.name)}">`
        : `<div class="friend-avatar-placeholder">${escHtml(((friend.name || friend.email) || '?').charAt(0).toUpperCase())}</div>`;
    
    const badges = [];
    if (friend.grade) badges.push(`<span class="friend-badge grade">${escHtml(formatGrade(friend.grade))}</span>`);
    if (friend.role) badges.push(`<span class="friend-badge role">${escHtml(formatRole(friend.role))}</span>`);
    if (friend.school) badges.push(`<span class="friend-badge school">🏫 ${escHtml(friend.school)}</span>`);
    if (friend.district) badges.push(`<span class="friend-badge district">📍 ${escHtml(friend.district)}</span>`);
    
    return `
        <div class="friend-card" data-uid="${friend.uid}">
            <div class="friend-avatar">
                ${avatarContent}
            </div>
            <div class="friend-info">
                <div class="friend-name">${escHtml(friend.name || friend.email)}</div>
                <div class="friend-details">
                    ${badges.join('')}
                </div>
            </div>
            <div class="friend-actions">
                <button class="btn btn-icon-sm" onclick="openMessageModal('${friend.uid}', ${jsArg(friend.name)})" title="Message">💬</button>
                <button class="btn btn-icon-sm btn-danger" onclick="removeFriend('${friend.uid}')" title="Remove">✕</button>
            </div>
        </div>
    `;
}

// Group array by key
function groupBy(array, keyFn) {
    return array.reduce((result, item) => {
        const key = keyFn(item);
        if (!result[key]) result[key] = [];
        result[key].push(item);
        return result;
    }, {});
}

// Format grade for display
function formatGrade(grade) {
    if (!grade) return '';
    const gradeMap = {
        'prek': 'Pre-K',
        'k': 'Kindergarten',
        '1': '1st Grade',
        '2': '2nd Grade',
        '3': '3rd Grade',
        '4': '4th Grade',
        '5': '5th Grade',
        '6': '6th Grade',
        '7': '7th Grade',
        '8': '8th Grade',
        '9': '9th Grade',
        '10': '10th Grade',
        '11': '11th Grade',
        '12': '12th Grade',
        'multi': 'Multiple Grades'
    };
    return gradeMap[grade] || grade;
}

// Format role for display
function formatRole(role) {
    if (!role) return '';
    const roleMap = {
        'teacher': 'Teacher',
        'lead-teacher': 'Lead Teacher',
        'coach': 'Instructional Coach',
        'specialist': 'Specialist',
        'substitute': 'Substitute',
        'student-teacher': 'Student Teacher',
        'admin': 'Administrator',
        'other': 'Other'
    };
    return roleMap[role] || role;
}

function renderPendingRequests() {
    const card = document.getElementById('friend-requests-section');
    const container = document.getElementById('friend-requests-list');
    if (!card || !container) return;
    
    if (pendingRequests.length === 0) {
        card.classList.add('hidden');
        return;
    }
    
    card.classList.remove('hidden');
    container.innerHTML = pendingRequests.map(req => `
        <div class="pending-item">
            <div class="friend-avatar">${escHtml((req.fromName||'?').charAt(0).toUpperCase())}</div>
            <div class="friend-info">
                <div class="friend-name">${escHtml(req.fromName)}</div>
                <div class="friend-email">${escHtml(req.fromEmail)}</div>
            </div>
            <div class="pending-actions">
                <button class="btn btn-primary btn-sm" onclick="acceptFriendRequest('${req.id}')">Accept</button>
                <button class="btn btn-secondary btn-sm" onclick="declineFriendRequest('${req.id}')">Decline</button>
            </div>
        </div>
    `).join('');
}

function renderSharedLessons() {
    const container = document.getElementById('shared-lessons-list');
    if (!container) return;
    
    if (sharedLessons.length === 0) {
        container.innerHTML = '<p class="empty-state">No shared lessons yet.</p>';
        return;
    }
    
    container.innerHTML = sharedLessons.map(shared => `
        <div class="shared-lesson-item ${shared.read ? '' : 'unread'}" onclick="viewSharedLesson('${shared.id}')">
            <div class="shared-lesson-title">${shared.read ? '' : '🔵 '}${escHtml(shared.lesson.title)}</div>
            <div class="shared-lesson-meta">
                <span>From: ${escHtml(shared.fromName)}</span>
                <span>${escHtml(shared.lesson.date)}</span>
            </div>
        </div>
    `).join('');
}

function renderActivityFeed() {
    const container = document.getElementById('activity-feed');
    if (!container) return;
    
    const activities = [
        ...pendingRequests.map(r => ({
            type: 'request',
            icon: '👋',
            text: `${r.fromName} wants to be your friend`,
            time: r.sentAt?.toDate?.() || new Date()
        })),
        ...sharedLessons.slice(0, 5).map(s => ({
            type: 'share',
            icon: '📤',
            text: `${s.fromName} shared "${s.lesson.title}"`,
            time: s.sharedAt?.toDate?.() || new Date()
        }))
    ].sort((a, b) => b.time - a.time).slice(0, 10);
    
    if (activities.length === 0) {
        container.innerHTML = '<p class="empty-state">No recent activity.</p>';
        return;
    }
    
    container.innerHTML = activities.map(act => `
        <div class="activity-item">
            <div class="activity-icon">${act.icon}</div>
            <div class="activity-content">
                <div class="activity-text">${escHtml(act.text)}</div>
                <div class="activity-time">${formatTimeAgo(act.time)}</div>
            </div>
        </div>
    `).join('');
}

function updateUnreadBadge() {
    const badge = document.getElementById('unread-badge');
    if (!badge) return;
    
    const unreadShared = sharedLessons.filter(s => !s.read).length;
    const total = pendingRequests.length + unreadShared;
    
    if (total > 0) {
        badge.textContent = total;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Message modal
function openMessageModal(toUid, toName) {
    document.getElementById('message-to-uid').value = toUid;
    document.getElementById('message-to-name').value = toName;
    document.getElementById('message-to-display').textContent = toName;
    document.getElementById('message-modal').classList.remove('hidden');
}

// Send message (using shared lessons as a simple message system)
document.getElementById('message-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const toUid = document.getElementById('message-to-uid').value;
    const toName = document.getElementById('message-to-name').value;
    const subject = document.getElementById('message-subject').value;
    const body = document.getElementById('message-body').value;
    
    const friend = friends.find(f => f.uid === toUid);
    
    try {
        showLoading();
        
        // Use shared lessons collection as a simple message system
        await db.collection('sharedLessons').add({
            fromUid: currentUser.uid,
            fromEmail: currentUser.email,
            fromName: currentUser.displayName || currentUser.email,
            toUid: toUid,
            toEmail: friend?.email || '',
            lesson: {
                title: `💬 Message: ${subject || 'No subject'}`,
                date: formatDate(new Date()),
                subject: 'Message',
                standards: '',
                flow: body,
                materials: '',
                activities: ''
            },
            message: '',
            read: false,
            isMessage: true,
            sharedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('message-modal').classList.add('hidden');
        document.getElementById('message-form').reset();
        showToast(`Message sent to ${toName}!`);
        
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Error sending message');
    }
    
    hideLoading();
});

// Time ago helper

// Share button in lesson modal
document.getElementById('share-lesson-btn')?.addEventListener('click', () => {
    const lessonId = document.getElementById('lesson-id').value;
    if (lessonId) {
        document.getElementById('lesson-modal').classList.add('hidden');
        openShareModal(lessonId);
    } else {
        showToast('Save the lesson first to share it');
    }
});


// ============================================
// SMART IMPORT SYSTEM (JSON/PDF Pacing + Excel Library)
// ============================================

let smartPacingData = [];       // Array of {date, title} from JSON or AI-parsed PDF
let smartLessonLibrary = [];    // Array of lesson content from Excel
let smartMatchedLessons = [];   // Merged data ready to import

// Normalize a lesson identifier for matching between the pacing calendar
// and the Excel lesson library (e.g. "M1 Lesson 5" <-> "m1 lesson 5" <-> "M1  Lesson  5").
// Strips everything but letters/digits and lowercases, so formatting/spacing
// differences between sources don't break the match.
function normalizeLessonName(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .trim();
}

// Excel Only mode data
let excelOnlyLessons = [];      // Array of lessons from Excel for direct import

// Initialize Smart Import UI
function initSmartImport() {
    console.log('Initializing Smart Import...');
    updateSmartImportClassDropdown();
    
    // Mode toggle buttons
    const fullModeBtn = document.getElementById('smart-mode-full-btn');
    const excelModeBtn = document.getElementById('smart-mode-excel-btn');
    const fullModeDiv = document.getElementById('smart-import-full-mode');
    const excelModeDiv = document.getElementById('smart-import-excel-mode');
    
    if (fullModeBtn && excelModeBtn) {
        fullModeBtn.addEventListener('click', () => {
            fullModeBtn.classList.add('active');
            excelModeBtn.classList.remove('active');
            fullModeDiv.classList.remove('hidden');
            excelModeDiv.classList.add('hidden');
        });
        
        excelModeBtn.addEventListener('click', () => {
            excelModeBtn.classList.add('active');
            fullModeBtn.classList.remove('active');
            excelModeDiv.classList.remove('hidden');
            fullModeDiv.classList.add('hidden');
        });
    }
    
    // Set default start date to today
    const startDateInput = document.getElementById('excel-only-start-date');
    if (startDateInput) {
        startDateInput.value = formatDate(new Date());
    }
    
    // Excel Only mode event listeners
    initExcelOnlyImport();
    
    // Pacing JSON button
    const pacingBtn = document.getElementById('smart-import-pacing-btn');
    const pacingInput = document.getElementById('smart-pacing-json-input');
    console.log('Pacing btn:', pacingBtn, 'Pacing input:', pacingInput);
    
    if (pacingBtn) {
        pacingBtn.addEventListener('click', () => {
            const classId = document.getElementById('smart-import-class').value;
            if (!classId) {
                showToast('Please select a class first');
                return;
            }
            pacingInput.click();
        });
    }
    
    // Pacing JSON file input
    if (pacingInput) {
        pacingInput.addEventListener('change', handleSmartPacingUpload);
    }
    
    // Lesson Excel button
    const lessonsBtn = document.getElementById('smart-import-lessons-btn');
    const lessonsInput = document.getElementById('smart-lessons-excel-input');
    console.log('Lessons btn:', lessonsBtn, 'Lessons input:', lessonsInput);
    
    if (lessonsBtn) {
        lessonsBtn.addEventListener('click', () => {
            const classId = document.getElementById('smart-import-class').value;
            if (!classId) {
                showToast('Please select a class first');
                return;
            }
            lessonsInput.click();
        });
    }
    
    // Lesson Excel file input
    if (lessonsInput) {
        lessonsInput.addEventListener('change', handleSmartLessonsUpload);
    }
    
    // Match button
    const matchBtn = document.getElementById('smart-match-btn');
    if (matchBtn) {
        matchBtn.addEventListener('click', smartMatchLessons);
    }
    
    // Import button
    const importBtn = document.getElementById('smart-import-btn');
    if (importBtn) {
        importBtn.addEventListener('click', smartImportLessons);
    }
    
    // Delete all lessons button
    const deleteBtn = document.getElementById('smart-delete-lessons-btn');
    console.log('Delete btn:', deleteBtn);
    if (deleteBtn) {
        deleteBtn.addEventListener('click', smartDeleteAllLessons);
    }
    
    console.log('Smart Import initialized');
}

// Delete all lessons for selected class
async function smartDeleteAllLessons() {
    const classId = document.getElementById('smart-delete-class').value;
    
    if (!classId) {
        showToast('Please select a class first');
        return;
    }
    
    const className = classes.find(c => c.id === classId)?.name || 'selected class';
    
    // Find ALL lessons for this class
    const classLessons = lessons.filter(l => l.classId === classId);
    
    if (classLessons.length === 0) {
        showToast('No lessons found for this class');
        return;
    }
    
    if (!await planyConfirm(`Delete ALL ${classLessons.length} lessons from "${className}"?\n\nThis will delete every lesson for this class and cannot be undone.`)) {
        return;
    }
    
    showLoading();
    document.querySelector('.loading-text').textContent = 'Deleting lessons...';
    
    try {
        const yearPath = getYearPath();
        let deleted = 0;
        
        for (const lesson of classLessons) {
            await yearPath.collection('lessons').doc(lesson.id).delete();
            deleted++;
        }
        
        // Remove from local array
        lessons = lessons.filter(l => l.classId !== classId);
        
        // Refresh views
        renderCalendar();
        renderWeek();
        updateStats();
        
        showToast(`🗑️ Deleted ${deleted} lessons from ${className}`);
        
    } catch (error) {
        console.error('Error deleting lessons:', error);
        showToast('Error deleting lessons');
    }
    
    hideLoading();
}

// Update class dropdown for Smart Import
function updateSmartImportClassDropdown() {
    console.log('updateSmartImportClassDropdown called, classes:', classes.length);
    
    const selects = [
        document.getElementById('smart-import-class'),
        document.getElementById('smart-delete-class'),
        document.getElementById('excel-only-class')
    ];
    
    const optionsHtml = '<option value="">Select a class...</option>' +
        classes.map(cls => `<option value="${cls.id}">${escHtml(cls.name)}</option>`).join('');
    
    selects.forEach((select, i) => {
        if (select) {
            select.innerHTML = optionsHtml;
            console.log('Updated dropdown', i, 'with', classes.length, 'classes');
        } else {
            console.log('Dropdown', i, 'not found');
        }
    });
}

// Also make it globally accessible for debugging
window.updateSmartImportClassDropdown = updateSmartImportClassDropdown;
window.getClasses = () => classes;

// ============================================
// PDF PACING GUIDE IMPORT (AI-parsed)
// ============================================
// District pacing guides (e.g. TUSD's dated "Pacing Guide" PDFs) are laid out
// as a weekly Mon-Fri calendar grid, not a table. Reading the PDF with plain
// left-to-right text extraction destroys that structure, so this groups text
// items by vertical position first (like pdftotext -layout) to rebuild
// readable rows before handing the text to Claude.
async function extractPdfTextGridLayout(file, maxChars = 30000) {
    await Promise.all([ensureLib('pdfjs')]);
    try {
        const ab = await readFileAsArrayBuffer(file);
        if (!ab) return '';
        if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js library not loaded');
        initPdfWorker();

        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab), isEvalSupported: false }).promise;
        let fullText = '';
        const maxPages = Math.min(pdf.numPages, 20);

        for (let p = 1; p <= maxPages; p++) {
            const page = await pdf.getPage(p);
            const textContent = await page.getTextContent();

            // Bucket text items into lines by rounded Y position (a few pts of
            // tolerance handles baseline jitter within the same visual row).
            const lineBuckets = [];
            for (const item of textContent.items) {
                if (!item.str || !item.str.trim()) continue;
                const y = item.transform[5];
                let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= 3);
                if (!bucket) {
                    bucket = { y, items: [] };
                    lineBuckets.push(bucket);
                }
                bucket.items.push({ x: item.transform[4], str: item.str });
            }

            lineBuckets.sort((a, b) => b.y - a.y); // top of page first
            for (const bucket of lineBuckets) {
                bucket.items.sort((a, b) => a.x - b.x);
                const lineText = bucket.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
                if (lineText) fullText += lineText + '\n';
            }
            fullText += '\n';
        }

        return fullText.trim().substring(0, maxChars);
    } catch (e) {
        console.warn('Pacing PDF grid extraction failed for', file.name, e);
        return '';
    }
}

// Sends extracted pacing-guide PDF text to Claude and asks for structured
// {date, title, topic, standards, subject} entries. Tuned to the two TUSD
// pacing guide formats seen in practice: Eureka Math ("M1 Lesson 5") and
// Benchmark Advance ELA ("Unit 3 Week 1 Day 2") -- but written generically
// enough to handle other district pacing calendars too.
async function parsePacingCalendarWithAI(rawText, subjectHint) {
    const schoolYear = settings.schoolYear || '2025-2026';
    const [startYear, endYear] = schoolYear.split('-');
    const trimmedText = rawText.substring(0, 30000);

    const prompt = `You are extracting a day-by-day lesson pacing calendar from a school district's pacing guide PDF. The text below was extracted from a weekly Monday-Friday calendar grid, so lines may run several date-columns together -- use the surrounding context (date headers, unit/topic headers that span the week, "Day N" labels, standards codes) to work out which content belongs under which date.

School year: ${schoolYear} (${startYear}-${endYear})
Rules:
- Months Aug-Dec belong to year ${startYear}; months Jan-Jul belong to year ${endYear}.
- Subject for this pacing guide: ${subjectHint || 'not specified - infer it from the title and standards code prefixes (OA/NBT/MD/G = Math; RL/RI/RF/W/SL/L = ELA/Reading/Writing)'}.
- For every calendar date that has an actual instructional assignment, output one entry.
- Use the lesson identifier EXACTLY as it appears in the source text as "title":
  - Eureka Math style: combine the module and lesson number, e.g. "M1 Lesson 5".
  - Benchmark Advance style: combine the Unit number, the Week number (from the section header spanning that week), and the Day number under the date, e.g. "Unit 3 Week 1 Day 2".
  - If neither pattern applies, use whatever label is shown (e.g. "Module 1 Assessment", "Unit 3 BA Assessment", "Review and Routines", "Topic A Ticket").
- If a date cell lists two day numbers together (e.g. "Day 2 & 3"), output TWO entries for that date, one per day number.
- SKIP non-instructional days entirely: "NO SCHOOL"/"No School" + a holiday name, "Grading Day", "No Students" (with no lesson also listed), "Professional Learning Day" (when that's the only thing in the cell), and multi-day breaks (Fall/Winter/Spring/Rodeo/Thanksgiving Break). Those are days off, not lessons.
- "topic" = the unit/topic name shown for that week, if any (e.g. "Unit 3: Plants and Animals Grow and Change" or "Module 1 Topic A: Count and Compare with Data").
- "standards" = any standard codes listed under that date, comma-separated, if present.
- "subject" = your best guess: Math, ELA, Science, or Social Studies.

Return ONLY a JSON array, no markdown, no explanation. Each object:
{"date": "YYYY-MM-DD", "title": "...", "topic": "...", "standards": "...", "subject": "..."}

PACING GUIDE TEXT:
${trimmedText}`;

    const text = (await callAIText({ prompt, tier: 'quality', maxTokens: 16000 })).replace(/```json|```/g, '').trim();


    // A full school year of dated pacing entries can be large enough to hit the
    // response's max_tokens limit, which cuts the JSON off mid-object. Rather than
    // failing the whole import, salvage every complete {...} entry that was
    // returned before the cutoff (these entries have no nested braces, so a plain
    // regex match is reliable) and warn if anything had to be dropped.
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        const matches = text.match(/\{[^{}]*\}/g);
        let repaired = null;
        if (matches && matches.length > 0) {
            try {
                repaired = JSON.parse('[' + matches.join(',') + ']');
            } catch (e2) {
                repaired = null;
            }
        }
        if (repaired && repaired.length > 0) {
            console.warn(`Pacing PDF response was truncated - recovered ${repaired.length} entries before the cutoff.`);
            showToast(`⚠️ Claude's response was cut off - recovered ${repaired.length} dates, but some may be missing. Try again or split the PDF by quarter if dates look incomplete.`);
            parsed = repaired;
        } else {
            throw new Error('Claude returned invalid JSON: ' + text.substring(0, 200));
        }
    }

    if (!Array.isArray(parsed)) throw new Error('Expected JSON array from Claude');

    return parsed
        .filter(item => item.date && item.title)
        .map(item => ({
            date: item.date,
            title: item.title,
            normalizedTitle: normalizeLessonName(item.title),
            topic: item.topic || '',
            standards: item.standards || '',
            subject: item.subject || subjectHint || 'Math'
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// Handle Smart Pacing upload -- JSON (structured) or PDF (AI-parsed)
async function handleSmartPacingUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    document.getElementById('smart-pacing-filename').textContent = file.name;

    if (isPdf) {
        if (!hasEffectiveAiKey()) {
            showToast('PDF pacing guides need an AI API key -- add one under Settings > AI Provider & API Key, or use a JSON pacing calendar instead.');
            e.target.value = '';
            return;
        }

        showLoading();
        document.querySelector('.loading-text').textContent = 'Reading PDF pacing guide...';

        try {
            const rawText = await extractPdfTextGridLayout(file);
            if (!rawText) throw new Error('Could not read any text from this PDF');

            document.querySelector('.loading-text').textContent = 'Asking Claude to map out the calendar...';

            const classId = document.getElementById('smart-import-class').value;
            const cls = classes.find(c => c.id === classId);
            const subjectHint = cls?.subject || '';

            const aiEntries = await parsePacingCalendarWithAI(rawText, subjectHint);

            hideLoading();

            if (aiEntries.length === 0) {
                showToast('No dated lessons found. Make sure this is the dated Pacing Guide (weekly calendar grid) and not the curriculum framework/standards document.');
                e.target.value = '';
                return;
            }

            smartPacingData = aiEntries;
            displaySmartPacingPreview();
            updateSmartMatchButton();
            showToast(`✅ Loaded ${smartPacingData.length} dates from pacing guide (AI-parsed PDF)`);

        } catch (error) {
            hideLoading();
            console.error('Smart pacing PDF error:', error);
            showToast('Error reading PDF: ' + error.message);
        }

        e.target.value = '';
        return;
    }

    // JSON path
    showLoading();
    document.querySelector('.loading-text').textContent = 'Reading pacing calendar...';

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!Array.isArray(data)) {
            throw new Error('JSON must be an array');
        }

        // Extract pacing data
        smartPacingData = data.filter(item => item.date && item.title).map(item => ({
            date: item.date,
            title: item.title,
            normalizedTitle: normalizeLessonName(item.title),
            topic: item.topic || '',
            standards: item.standards || '',
            subject: item.subject || 'Math'
        }));

        hideLoading();

        if (smartPacingData.length === 0) {
            showToast('No valid pacing data found');
            return;
        }

        // Display preview
        displaySmartPacingPreview();
        updateSmartMatchButton();
        showToast(`✅ Loaded ${smartPacingData.length} dates from pacing calendar`);

    } catch (error) {
        hideLoading();
        console.error('Smart pacing JSON error:', error);
        showToast('Error reading JSON: ' + error.message);
    }

    e.target.value = '';
}

// Find a header (case-insensitive) matching one of the given aliases.
// Tries an exact match first, then falls back to a substring match, so a
// header like "Lesson Number" still matches the alias "lesson number" and
// "Lesson #" matches "lesson #". `headers` is expected to already be
// lowercased; aliases should be lowercase too.
// Read an .xlsx/.xls file (via SheetJS) into an array of row objects keyed by
// the header row - e.g. [{ "Module": 1, "Lesson #": 5, "Title": "..." }, ...].
// Used by the Smart Import Excel Lesson Library uploaders.
async function readExcelFile(file) {
    await Promise.all([ensureLib('xlsx')]);
    const buf = await file.arrayBuffer();
    if (!window.XLSX) {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

// Splits a legacy combined "standards" text block (which may have Learning Target /
// Success Criteria / Key Vocabulary stacked in as labeled sections from older imports)
// back out into separate pieces for display. Lessons imported after v5.6.4 store these
// in their own dedicated fields already, so this is purely a fallback for old data.
function splitStandardsBlock(text) {
    const result = { standards: text || '', learningTarget: '', successCriteria: '', vocabulary: '' };
    if (!text) return result;

    const labels = [
        { key: 'learningTarget', re: /\n\nLearning Target:\n/ },
        { key: 'successCriteria', re: /\n\nSuccess Criteria:\n/ },
        { key: 'vocabulary', re: /\n\nKey Vocabulary:\n/ }
    ];

    // Find earliest label match to know where the base "standards" text ends
    let cut = text.length;
    const found = [];
    for (const { key, re } of labels) {
        const m = text.match(re);
        if (m) {
            found.push({ key, index: m.index, contentStart: m.index + m[0].length });
            cut = Math.min(cut, m.index);
        }
    }
    if (found.length === 0) return result;

    found.sort((a, b) => a.index - b.index);
    result.standards = text.substring(0, cut).trim();
    for (let i = 0; i < found.length; i++) {
        const start = found[i].contentStart;
        const end = (i + 1 < found.length) ? found[i + 1].index : text.length;
        result[found[i].key] = text.substring(start, end).trim();
    }
    return result;
}

function findColumn(headers, aliases) {
    for (const alias of aliases) {
        const exact = headers.find(h => h === alias);
        if (exact) return exact;
    }
    for (const alias of aliases) {
        const partial = headers.find(h => h.includes(alias));
        if (partial) return partial;
    }
    return null;
}

// Handle Smart Lessons Excel upload
async function handleSmartLessonsUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    document.getElementById('smart-lessons-filename').textContent = file.name;
    showLoading();
    document.querySelector('.loading-text').textContent = 'Reading lesson library...';
    
    try {
        const data = await readExcelFile(file);
        
        if (!data || data.length === 0) {
            throw new Error('No data found in Excel file');
        }
        
        // Find columns
        const headers = Object.keys(data[0]).map(h => h.toLowerCase());
        const headerKeys = Object.keys(data[0]);
        
        // Detect format: Eureka Math (Module + Lesson #) OR Benchmark (Unit + Week + Day)
        let moduleCol = findColumn(headers, ['module', 'mod']);
        let lessonNumCol = findColumn(headers, ['lesson #', 'lesson number', 'lesson num']);
        let unitCol = findColumn(headers, ['unit']);
        let weekCol = findColumn(headers, ['week']);
        let dayCol = findColumn(headers, ['day']);
        
        // Other common columns
        let titleCol = findColumn(headers, ['title', 'primary skill', 'skill']);
        let objectivesCol = findColumn(headers, ['learning target', 'learning targets', 'objectives', 'i can', 'objective']);
        let successCriteriaCol = findColumn(headers, ['success criteria', 'success criterion', 'criteria for success']);
        let vocabularyCol = findColumn(headers, ['key vocabulary', 'vocabulary', 'vocab']);
        let standardsCol = findColumn(headers, ['standard', 'standards']);
        let materialsCol = findColumn(headers, ['material', 'materials']);
        let flowCol = findColumn(headers, ['lesson flow', 'flow']);
        let notesCol = findColumn(headers, ['activities & notes', 'activities', 'notes']);
        
        const getCol = (col) => col ? headerKeys.find(k => k.toLowerCase() === col) : null;
        
        const actualModuleCol = getCol(moduleCol);
        const actualLessonNumCol = getCol(lessonNumCol);
        const actualUnitCol = getCol(unitCol);
        const actualWeekCol = getCol(weekCol);
        const actualDayCol = getCol(dayCol);
        const actualTitleCol = getCol(titleCol);
        const actualObjectivesCol = getCol(objectivesCol);
        const actualSuccessCriteriaCol = getCol(successCriteriaCol);
        const actualVocabularyCol = getCol(vocabularyCol);
        const actualStandardsCol = getCol(standardsCol);
        const actualMaterialsCol = getCol(materialsCol);
        const actualFlowCol = getCol(flowCol);
        const actualNotesCol = getCol(notesCol);
        
        // Determine format
        const isEurekaFormat = actualModuleCol && actualLessonNumCol;
        const isBenchmarkFormat = actualUnitCol && actualWeekCol && actualDayCol;
        
        if (!isEurekaFormat && !isBenchmarkFormat) {
            throw new Error('Could not detect Excel format. Need Module+Lesson# or Unit+Week+Day columns.');
        }
        
        // Extract lesson library
        smartLessonLibrary = [];
        
        for (const row of data) {
            let lessonId;
            
            if (isEurekaFormat) {
                // Eureka Math format: "M1 Lesson 5"
                const moduleVal = row[actualModuleCol];
                const lessonNumVal = row[actualLessonNumCol];
                if (!moduleVal || !lessonNumVal) continue;
                lessonId = `M${moduleVal} Lesson ${lessonNumVal}`;
            } else if (isBenchmarkFormat) {
                // Benchmark format: "Unit 1 Week 2 Day 3"
                const unitVal = row[actualUnitCol];
                const weekVal = row[actualWeekCol];
                const dayVal = row[actualDayCol];
                if (unitVal === undefined || weekVal === undefined || dayVal === undefined) continue;
                lessonId = `Unit ${unitVal} Week ${weekVal} Day ${dayVal}`;
            }
            
            // Standards stays its own field; Learning Target and Success Criteria get their
            // own dedicated fields. Key Vocabulary (no dedicated schema field) is folded
            // into the standards text block as a labeled section.
            let standardsText = actualStandardsCol ? String(row[actualStandardsCol] || '').trim() : '';
            const learningTargetText = actualObjectivesCol ? String(row[actualObjectivesCol] || '').trim() : '';
            const successCriteriaText = actualSuccessCriteriaCol ? String(row[actualSuccessCriteriaCol] || '').trim() : '';
            if (actualVocabularyCol) {
                const vocabulary = String(row[actualVocabularyCol] || '').trim();
                if (vocabulary) {
                    standardsText = standardsText ? `${standardsText}\n\nKey Vocabulary:\n${vocabulary}` : `Key Vocabulary:\n${vocabulary}`;
                }
            }

            smartLessonLibrary.push({
                lessonId: lessonId,
                normalizedId: normalizeLessonName(lessonId),
                title: actualTitleCol ? String(row[actualTitleCol] || '').trim() : '',
                standards: standardsText,
                learningTarget: learningTargetText,
                successCriteria: successCriteriaText,
                materials: actualMaterialsCol ? String(row[actualMaterialsCol] || '').trim() : '',
                flow: actualFlowCol ? String(row[actualFlowCol] || '').trim() : '',
                notes: actualNotesCol ? String(row[actualNotesCol] || '').trim() : ''
            });
        }
        
        hideLoading();
        
        if (smartLessonLibrary.length === 0) {
            showToast('No valid lesson data found');
            return;
        }
        
        // Display preview
        displaySmartLessonsPreview();
        updateSmartMatchButton();
        showToast(`✅ Loaded ${smartLessonLibrary.length} lessons from library`);
        
    } catch (error) {
        hideLoading();
        console.error('Smart lessons Excel error:', error);
        showToast('Error reading Excel: ' + error.message);
    }
    
    e.target.value = '';
}

// Display Smart Pacing preview
function displaySmartPacingPreview() {
    const container = document.getElementById('smart-pacing-preview-list');
    const preview = document.getElementById('smart-pacing-preview');
    const summary = document.getElementById('smart-pacing-summary');
    
    const previewEntries = smartPacingData.slice(0, 8);
    
    container.innerHTML = previewEntries.map(entry => `
        <div class="import-event-item">
            <span class="import-event-date">${formatDisplayDateShort(entry.date)}</span>
            <span class="import-event-title">${entry.title}</span>
        </div>
    `).join('');
    
    if (smartPacingData.length > 8) {
        container.innerHTML += `<p style="color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem;">...and ${smartPacingData.length - 8} more dates</p>`;
    }
    
    const firstDate = smartPacingData[0]?.date;
    const lastDate = smartPacingData[smartPacingData.length - 1]?.date;
    summary.innerHTML = `<strong>${smartPacingData.length}</strong> dates: ${formatDisplayDateShort(firstDate)} → ${formatDisplayDateShort(lastDate)}`;
    
    preview.classList.remove('hidden');
}

// Display Smart Lessons preview
function displaySmartLessonsPreview() {
    const container = document.getElementById('smart-lessons-preview-list');
    const preview = document.getElementById('smart-lessons-preview');
    const summary = document.getElementById('smart-lessons-summary');
    
    const previewLessons = smartLessonLibrary.slice(0, 8);
    
    container.innerHTML = previewLessons.map(lesson => `
        <div class="import-event-item">
            <span class="import-event-title" style="flex: 1;">${lesson.lessonId}</span>
            <span class="import-event-meta" style="color: var(--text-muted); font-size: 0.7rem;">${escHtml(lesson.title.substring(0, 25))}${lesson.title.length > 25 ? '...' : ''}</span>
        </div>
    `).join('');
    
    if (smartLessonLibrary.length > 8) {
        container.innerHTML += `<p style="color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem;">...and ${smartLessonLibrary.length - 8} more lessons</p>`;
    }
    
    summary.innerHTML = `<strong>${smartLessonLibrary.length}</strong> lessons in library`;
    
    preview.classList.remove('hidden');
}

// Update Smart Match button state
function updateSmartMatchButton() {
    const matchBtn = document.getElementById('smart-match-btn');
    if (matchBtn) {
        matchBtn.disabled = !(smartPacingData.length > 0 && smartLessonLibrary.length > 0);
    }
}

// Extracts a loose (unit, day) key from a lesson-ID-like string, ignoring any
// "Week" number in between. Only meaningful for Unit 0 (Launch/Foundations
// placeholder units), where Day is a globally unique running count 1-N.
// Regular numbered units reset Day to 1-5 each week, so Unit+Day alone is NOT
// a safe unique key there - this fallback deliberately only applies to Unit 0
// to avoid mismatching a real unit's Week 2 Day 3 with its own Week 1 Day 3.
function extractUnitDayKey(str) {
    if (!str) return null;
    const nums = (String(str).match(/\d+/g) || []).map(Number);
    if (nums.length >= 2 && nums[0] === 0) {
        return `${nums[0]}_${nums[nums.length - 1]}`;
    }
    return null;
}

// Some pacing calendars reuse one generic label (e.g. "Review and Routines") on
// several non-consecutive dates instead of giving each occurrence a unique
// title. There's no way to uniquely match those to one specific library row,
// so instead we cycle through the Module/Unit 0 routine rows round-robin,
// giving each occurrence a different routine lesson instead of failing to match.
function isGenericRoutineTitle(title) {
    return !!title && /routine/i.test(title);
}

// Pulls a "unit" grouping key + a reasonable fallback display name out of a
// pacing lessonId, so Smart Import can auto-populate the Unit Map without
// requiring a separate units file. Handles both id formats produced by the
// library parser: Benchmark-style ("Unit X Week Y Day Z") and Eureka-style
// ("M<module> Lesson <n>").
function extractUnitGroupKey(lessonId) {
    if (!lessonId) return null;
    const str = String(lessonId).trim();

    let m = str.match(/^Unit\s+(.+?)\s+Week\s+(.+?)\s+Day\s+(.+)$/i);
    if (m) {
        const unitRaw = m[1].trim();
        const fallbackName = /^\d+$/.test(unitRaw) ? `Unit ${unitRaw}` : unitRaw;
        return { key: `unit:${unitRaw}`, fallbackName, weekRaw: m[2].trim(), dayRaw: m[3].trim() };
    }
    m = str.match(/^M(\S+)\s+Lesson\s+(.+)$/i);
    if (m) {
        return { key: `module:${m[1].trim()}`, fallbackName: `Module ${m[1].trim()}`, weekRaw: null, dayRaw: m[2].trim() };
    }

    // Looser fallbacks for pacing entries that don't fit either strict
    // pattern -- AI-parsed pacing guides can also emit labels like
    // "Unit 3 BA Assessment" or "Module 1 Topic A: ..." when the source PDF
    // doesn't cleanly break into Week/Day or Lesson# columns. Group by
    // whichever Unit/Module token leads the id rather than dropping these
    // lessons out of the Unit Map entirely.
    m = str.match(/^Unit\s+(\S+)/i);
    if (m) {
        const unitRaw = m[1].replace(/[:,]$/, '');
        return { key: `unit:${unitRaw}`, fallbackName: `Unit ${unitRaw}`, weekRaw: null, dayRaw: null };
    }
    m = str.match(/^Module\s+(\S+)/i);
    if (m) {
        const modRaw = m[1].replace(/[:,]$/, '');
        return { key: `module:${modRaw}`, fallbackName: `Module ${modRaw}`, weekRaw: null, dayRaw: null };
    }

    // Last resort: some libraries (RISE, CharacterStrong, FOSS Science) and
    // round-robin-matched "routine" pacing entries carry a curriculumRef
    // that's just the bare topic/unit name repeated across every day in that
    // unit (e.g. "Kindness Kickoff", "Sound and Light", "Review and
    // Routines") with no Unit/Module prefix at all. That string IS already a
    // perfectly good unit name, so group and name the unit by it directly
    // rather than dropping these lessons out of the Unit Map.
    if (str.length > 0) {
        return { key: `raw:${str.toLowerCase()}`, fallbackName: str, weekRaw: null, dayRaw: null };
    }

    return null;
}

// Converts a Week/Day pair into a single increasing number so a run of
// lessons can be checked for whether it's progressing forward (Week 1 Day 1,
// Week 1 Day 2, Week 2 Day 1...) or has jumped back to the start -- the
// tell-tale sign of a repeating rotation template (PE's 6-week rotation,
// RISE's per-group cycle) starting over. Returns null when Week/Day aren't
// plain numbers, so non-numeric labels never trigger a false split.
function computeSeqIndex(weekRaw, dayRaw) {
    const w = parseInt(weekRaw, 10);
    const d = parseInt(dayRaw, 10);
    if (Number.isNaN(w) || Number.isNaN(d)) return null;
    return w * 1000 + d;
}

// Splits one unit-key's lessons into separate contiguous "runs" -- one per
// actual scheduled block -- instead of collapsing every occurrence into a
// single min-to-max span. This is what turns something like "PE Rotation
// (Repeat Every 6 Weeks)" from one giant bar spanning the whole year into
// one bar per real 6-week rotation, and "RISE Cycle 1 (Repeat for Each New
// Group/Cycle)" into one bar per group's actual cycle.
//
// A new run starts whenever either signal fires:
//   - a real gap in the calendar (no lesson in this group for GAP_DAYS+), or
//   - the Week/Day sequence goes backward or repeats (Week 1 Day 1 again
//     after having already reached a later Week/Day) -- this catches
//     back-to-back rotations that repeat with zero calendar gap.
function splitLessonsIntoRuns(entries) {
    const GAP_DAYS = 21;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const runs = [];
    let current = [];
    let prevIndex = null;
    let prevDate = null;

    sorted.forEach(entry => {
        const idx = computeSeqIndex(entry.weekRaw, entry.dayRaw);
        const gapDays = prevDate
            ? (new Date(entry.date + 'T00:00:00') - new Date(prevDate + 'T00:00:00')) / 86400000
            : 0;
        const isNewRun = current.length > 0 && (
            gapDays > GAP_DAYS ||
            (idx !== null && prevIndex !== null && idx <= prevIndex)
        );
        if (isNewRun) {
            runs.push(current);
            current = [];
        }
        current.push(entry);
        if (idx !== null) prevIndex = idx;
        prevDate = entry.date;
    });
    if (current.length > 0) runs.push(current);
    return runs;
}

// Groups a batch of just-imported lessons by unit and creates/extends the
// matching Unit Map entries so units fill in automatically as pacing
// calendars are imported, instead of requiring separate manual entry.
async function syncUnitsFromImportedLessons(importedLessons, classId) {
    if (!importedLessons || importedLessons.length === 0) return 0;

    const groups = new Map();
    for (const lesson of importedLessons) {
        const info = extractUnitGroupKey(lesson.curriculumRef || lesson.title);
        if (!info) continue;
        if (!groups.has(info.key)) {
            groups.set(info.key, { fallbackName: info.fallbackName, entries: [] });
        }
        // lesson.title is "<lessonId>: <lessonTitle>" or just "<lessonId>" --
        // strip the id prefix so repeated theme titles (e.g. ELA/CharacterStrong/
        // FOSS, which repeat the same unit theme as every row's title) can be
        // detected and reused as a friendlier unit name.
        const bare = lesson.title.includes(': ') ? lesson.title.split(': ').slice(1).join(': ') : '';
        groups.get(info.key).entries.push({
            date: lesson.date,
            title: bare,
            weekRaw: info.weekRaw,
            dayRaw: info.dayRaw
        });
    }

    if (groups.size === 0) return 0;

    let unitIdx = units.filter(u => u.classId === classId).length;
    let created = 0;
    const GAP_DAYS = 21;
    const claimedIds = new Set(); // prevents two runs in this call from matching the same existing unit

    for (const [, g] of groups) {
        // Friendlier display name: if most entries for this unit key share the
        // same descriptive title, use that instead of the raw Unit/Module id.
        let name = g.fallbackName;
        const titledEntries = g.entries.filter(e => e.title);
        if (titledEntries.length > 0) {
            const counts = new Map();
            titledEntries.forEach(e => counts.set(e.title, (counts.get(e.title) || 0) + 1));
            const [topTitle, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
            if (topCount > titledEntries.length / 2) name = topTitle;
        }

        const runs = splitLessonsIntoRuns(g.entries);

        for (const run of runs) {
            const dates = run.map(e => e.date);
            const minDate = dates.reduce((a, b) => (b < a ? b : a));
            const maxDate = dates.reduce((a, b) => (b > a ? b : a));

            // Multiple units can now legitimately share a name (one per
            // rotation/cycle), so match this run to an existing unit by name
            // AND actual date-range overlap -- NOT proximity. Runs from
            // splitLessonsIntoRuns are deliberately back-to-back with only a
            // few days between rotations, so a proximity pad here (as big as
            // or bigger than that gap) would immediately re-merge adjacent
            // runs back into one unit within this same sync call, undoing
            // the split. Requiring real overlap only matches a run against
            // its own previously-saved unit from an earlier sync (e.g. when
            // more lessons get added later to the same rotation), never a
            // neighboring rotation. claimedIds guards against two runs in
            // the same call matching the same existing unit.
            const existing = units.find(u => {
                if (u.classId !== classId) return false;
                if (claimedIds.has(u.id)) return false;
                if ((u.name || '').trim().toLowerCase() !== name.trim().toLowerCase()) return false;
                if (!u.startDate || !u.endDate) return false;
                const uStart = new Date(u.startDate + 'T00:00:00').getTime();
                const uEnd = new Date(u.endDate + 'T00:00:00').getTime();
                const rStart = new Date(minDate + 'T00:00:00').getTime();
                const rEnd = new Date(maxDate + 'T00:00:00').getTime();
                return rStart <= uEnd && rEnd >= uStart;
            });
            if (existing) claimedIds.add(existing.id);

            try {
                if (existing) {
                    const newStart = existing.startDate && existing.startDate < minDate ? existing.startDate : minDate;
                    const newEnd   = existing.endDate && existing.endDate > maxDate ? existing.endDate : maxDate;
                    if (newStart !== existing.startDate || newEnd !== existing.endDate) {
                        await getYearPath().collection('units').doc(existing.id).update({ startDate: newStart, endDate: newEnd });
                        existing.startDate = newStart;
                        existing.endDate = newEnd;
                    }
                } else {
                    const data = {
                        name,
                        classId: classId || null,
                        startDate: minDate,
                        endDate: maxDate,
                        color: UNIT_COLORS[unitIdx % UNIT_COLORS.length],
                        description: 'Auto-created from Smart Import.',
                        standards: '',
                        docIds: [],
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    const ref = await getYearPath().collection('units').add(data);
                    units.push({ id: ref.id, ...data });
                    unitIdx++;
                    created++;
                }
            } catch (err) {
                console.warn('syncUnitsFromImportedLessons: could not save unit', name, err.message);
            }
        }
    }

    units.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    return created;
}

// One-time catch-up for lessons imported via Smart Import BEFORE the Unit
// Map auto-sync existed. Scans every already-saved lesson that carries a
// curriculumRef (the marker Smart Import stamps on each lesson), regroups
// them per class, and runs them through the same unit-creation logic new
// imports use -- so classes imported earlier this session backfill their
// Unit Map without needing to re-import anything.
async function bulkSyncUnitsFromExistingLessons() {
    // Smart Import stamps curriculumRef on every lesson it creates, but some
    // lessons predate that field or came from other flows (recurring
    // lessons, manual entry) -- those can't be grouped into units, so we
    // report on them separately instead of silently skipping.
    const allLessons = lessons.slice();
    const importedLessons = allLessons.filter(l => l.curriculumRef);
    const noRefLessons = allLessons.filter(l => !l.curriculumRef);

    console.log(`[Unit Map backfill] ${allLessons.length} total lessons, ${importedLessons.length} have curriculumRef, ${noRefLessons.length} do not.`);

    if (importedLessons.length === 0) {
        showToast('No Smart-Imported lessons found to backfill from.');
        return;
    }

    showLoading();
    document.querySelector('.loading-text').textContent = 'Scanning imported lessons for units...';

    try {
        const byClass = new Map();
        for (const lesson of importedLessons) {
            const key = lesson.classId || '__none__';
            if (!byClass.has(key)) byClass.set(key, []);
            byClass.get(key).push(lesson);
        }

        // Clean up fully orphaned auto-created units -- ones whose class no
        // longer has ANY currently-imported lessons at all (the class was
        // cleared, re-imported under a new id, or the lessons were deleted).
        // The per-class cleanup below only runs for classes that appear in
        // byClass, so a class with zero remaining imported lessons would
        // otherwise keep its old auto-created units forever with no way to
        // regenerate or replace them.
        const classIdsWithLessons = new Set([...byClass.keys()].map(k => k === '__none__' ? null : k));
        const orphanedUnits = units.filter(u => u.description === 'Auto-created from Smart Import.' && !classIdsWithLessons.has(u.classId));
        for (const u of orphanedUnits) {
            try {
                await getYearPath().collection('units').doc(u.id).delete();
            } catch (err) {
                console.warn('bulkSyncUnitsFromExistingLessons: could not delete orphaned unit', u.name, err.message);
            }
        }
        if (orphanedUnits.length > 0) {
            const orphanIds = new Set(orphanedUnits.map(u => u.id));
            for (let i = units.length - 1; i >= 0; i--) {
                if (orphanIds.has(units[i].id)) units.splice(i, 1);
            }
            console.log(`[Unit Map backfill] Removed ${orphanedUnits.length} orphaned unit(s) with no remaining imported lessons.`);
        }
        let totalCreated = 0;
        const diagnostics = [];

        for (const [classKey, classLessons] of byClass) {
            const classId = classKey === '__none__' ? null : classKey;
            const clsName = classes.find(c => c.id === classId)?.name || '(no class)';

            // Delete this class's previously auto-created units before
            // regenerating. This fix changes unit creation from "one giant
            // span per repeating template" to "one unit per actual
            // rotation/cycle run" -- if we left the old giant units in place,
            // the new proximity-based matching in syncUnitsFromImportedLessons
            // would just match every new smaller run inside the old giant
            // range and no-op, so stale merged units would never get
            // replaced. Manually-created/edited units (no auto-created
            // description, or a description that's been changed) are left
            // untouched.
            const staleUnits = units.filter(u => u.classId === classId && u.description === 'Auto-created from Smart Import.');
            for (const u of staleUnits) {
                try {
                    await getYearPath().collection('units').doc(u.id).delete();
                } catch (err) {
                    console.warn('bulkSyncUnitsFromExistingLessons: could not delete stale unit', u.name, err.message);
                }
            }
            if (staleUnits.length > 0) {
                const staleIds = new Set(staleUnits.map(u => u.id));
                for (let i = units.length - 1; i >= 0; i--) {
                    if (staleIds.has(units[i].id)) units.splice(i, 1);
                }
            }

            // Diagnose how many of this class's lessons actually produced a
            // parseable unit key, and sample a few that didn't so we can see
            // exactly what format they're in.
            const unparsed = [];
            let parsedCount = 0;
            for (const l of classLessons) {
                const info = extractUnitGroupKey(l.curriculumRef);
                if (info) parsedCount++;
                else if (unparsed.length < 3) unparsed.push(l.curriculumRef);
            }

            const createdForClass = await syncUnitsFromImportedLessons(classLessons, classId);
            totalCreated += createdForClass;

            diagnostics.push({
                class: clsName,
                classId,
                totalLessons: classLessons.length,
                parsedIntoUnitKey: parsedCount,
                unitsCreatedOrUpdated: createdForClass,
                sampleUnparsedCurriculumRef: unparsed
            });
        }
        console.log('[Unit Map backfill] Per-class breakdown:');
        console.table(diagnostics.map(d => ({
            class: d.class, classId: d.classId, totalLessons: d.totalLessons,
            parsedIntoUnitKey: d.parsedIntoUnitKey, unitsCreatedOrUpdated: d.unitsCreatedOrUpdated
        })));
        diagnostics.filter(d => d.sampleUnparsedCurriculumRef.length > 0).forEach(d => {
            console.log(`[Unit Map backfill] "${d.class}" -- sample curriculumRef values that didn't match a known pattern:`, d.sampleUnparsedCurriculumRef);
        });

        renderUnitMap();
        hideLoading();

        const anyUnparsed = diagnostics.some(d => d.parsedIntoUnitKey < d.totalLessons);
        const orphanNote = orphanedUnits.length > 0 ? ` Removed ${orphanedUnits.length} stale unit(s) with no remaining lessons.` : '';
        if (totalCreated > 0) {
            showToast(`📐 Backfilled ${totalCreated} units from ${importedLessons.length} imported lessons!${anyUnparsed ? ' (some lessons had an unrecognized id format -- see console for details)' : ''}${orphanNote}`);
        } else if (anyUnparsed) {
            showToast(`⚠️ Found imported lessons but couldn't recognize their unit format. Check the browser console for details.${orphanNote}`);
        } else if (orphanedUnits.length > 0) {
            showToast(`Unit Map updated.${orphanNote}`);
        } else {
            showToast('Unit Map is already up to date with your imported lessons.');
        }
    } catch (err) {
        hideLoading();
        console.error('bulkSyncUnitsFromExistingLessons:', err);
        showToast('Error backfilling units: ' + err.message);
    }
}

// Match pacing to lessons
function smartMatchLessons() {
    if (smartPacingData.length === 0 || smartLessonLibrary.length === 0) {
        showToast('Please load both files first');
        return;
    }
    
    // Create lookup map
    const lessonMap = new Map();
    const lessonMapByUnitDay = new Map();
    for (const lesson of smartLessonLibrary) {
        lessonMap.set(lesson.normalizedId, lesson);
        const udKey = extractUnitDayKey(lesson.lessonId);
        if (udKey && !lessonMapByUnitDay.has(udKey)) {
            lessonMapByUnitDay.set(udKey, lesson);
        }
    }

    // Routine rows (Module/Unit 0) for round-robin assignment against generic
    // "routine"-labeled pacing entries that don't carry a unique identifier.
    const routineLessons = smartLessonLibrary.filter(l => {
        const nums = (l.lessonId.match(/\d+/g) || []).map(Number);
        return nums.length > 0 && nums[0] === 0;
    });
    let routineRoundRobinIndex = 0;
    
    // Match each pacing entry
    smartMatchedLessons = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    
    for (const pacing of smartPacingData) {
        let lessonData = lessonMap.get(pacing.normalizedTitle);

        // Fallback: if the exact Unit+Week+Day string didn't match, try
        // matching by Unit+Day alone (ignoring Week) before giving up.
        if (!lessonData) {
            const udKey = extractUnitDayKey(pacing.title);
            if (udKey) lessonData = lessonMapByUnitDay.get(udKey);
        }

        // Fallback: generic repeated "routine" label - cycle through the
        // routine lessons in order so repeated occurrences don't all fail.
        if (!lessonData && routineLessons.length > 0 && isGenericRoutineTitle(pacing.title)) {
            lessonData = routineLessons[routineRoundRobinIndex % routineLessons.length];
            routineRoundRobinIndex++;
        }

        if (lessonData) {
            smartMatchedLessons.push({
                date: pacing.date,
                lessonId: pacing.title,
                lessonTitle: lessonData.title,
                topic: pacing.topic,
                standards: lessonData.standards || pacing.standards,
                learningTarget: lessonData.learningTarget || '',
                successCriteria: lessonData.successCriteria || '',
                materials: lessonData.materials,
                flow: lessonData.flow,
                notes: lessonData.notes,
                subject: pacing.subject,
                matched: true,
                selected: true
            });
            matchedCount++;
        } else {
            // Unmatched - use pacing data only
            smartMatchedLessons.push({
                date: pacing.date,
                lessonId: pacing.title,
                lessonTitle: '',
                topic: pacing.topic,
                standards: pacing.standards,
                learningTarget: '',
                successCriteria: '',
                materials: '',
                flow: '',
                notes: '',
                subject: pacing.subject,
                matched: false,
                selected: true
            });
            unmatchedCount++;
        }
    }
    
    // Display matched results
    displaySmartMatchPreview(matchedCount, unmatchedCount);
    
    // Enable import button
    const importBtn = document.getElementById('smart-import-btn');
    if (importBtn) {
        importBtn.disabled = smartMatchedLessons.length === 0;
    }
}

// Display matched lessons preview
function displaySmartMatchPreview(matchedCount, unmatchedCount) {
    const container = document.getElementById('smart-match-list');
    const preview = document.getElementById('smart-match-preview');
    const summary = document.getElementById('smart-match-summary');
    
    const previewLessons = smartMatchedLessons.slice(0, 12);
    
    container.innerHTML = previewLessons.map((lesson, index) => `
        <div class="import-event-item ${lesson.matched ? 'matched' : 'unmatched'}">
            <input type="checkbox" id="smart-lesson-${index}" ${lesson.selected ? 'checked' : ''} data-index="${index}">
            <span class="import-event-date">${formatDisplayDateShort(lesson.date)}</span>
            <span class="import-event-title">${lesson.lessonId}</span>
            <span class="match-indicator" style="font-size: 11px; padding: 0.15rem 0.35rem; border-radius: 3px; ${lesson.matched ? 'background: rgba(95,227,155,0.18); color: var(--success-color);' : 'background: rgba(255,138,128,0.18); color: var(--error-color);'}">${lesson.matched ? '✓' : '?'}</span>
        </div>
    `).join('');
    
    if (smartMatchedLessons.length > 12) {
        container.innerHTML += `<p style="color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem;">...and ${smartMatchedLessons.length - 12} more lessons</p>`;
    }
    
    // Add checkbox listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (index < smartMatchedLessons.length) {
                smartMatchedLessons[index].selected = e.target.checked;
            }
        });
    });
    
    summary.innerHTML = `<span style="color: var(--success-color);"><strong>${matchedCount}</strong> matched with full content</span> | <span style="color: var(--error-color);"><strong>${unmatchedCount}</strong> title only</span>`;
    
    preview.classList.remove('hidden');
}

// Import matched lessons
async function smartImportLessons() {
    const classId = document.getElementById('smart-import-class').value;
    if (!classId) {
        showToast('Please select a class');
        return;
    }
    
    const selectedLessons = smartMatchedLessons.filter(l => l.selected);
    
    if (selectedLessons.length === 0) {
        showToast('No lessons selected');
        return;
    }
    
    showLoading();
    document.querySelector('.loading-text').textContent = 'Importing lessons...';
    
    try {
        const yearPath = getYearPath();
        const cls = classes.find(c => c.id === classId);
        const subject = cls?.subject || 'Math';
        let imported = 0;
        let skipped = 0;
        const newlyImported = [];
        const importedOnDate = {};   // date -> lesson created by THIS import

        for (const lesson of selectedLessons) {
            // v6.5.0: a pacing cell like "Day 2 & 3" gives two lessons for one
            // date. The second used to be skipped as a duplicate; now it's
            // merged into the lesson this import just created for that date.
            const mine = importedOnDate[lesson.date];
            if (mine) {
                const extraTitle = lesson.lessonTitle ? `${lesson.lessonId}: ${lesson.lessonTitle}` : lesson.lessonId;
                const extraText = [lesson.topic ? `Topic: ${lesson.topic}` : '', lesson.notes || ''].filter(Boolean).join('\n\n');
                mine.title = `${mine.title} + ${extraTitle}`;
                if (extraText) mine.activities = [mine.activities, extraText].filter(Boolean).join('\n\n---\n\n');
                mine.curriculumRef = `${mine.curriculumRef}, ${lesson.lessonId}`;
                await yearPath.collection('lessons').doc(mine.id).update({
                    title: mine.title, activities: mine.activities, curriculumRef: mine.curriculumRef,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                const local = lessons.find(l => l.id === mine.id);
                if (local) Object.assign(local, { title: mine.title, activities: mine.activities, curriculumRef: mine.curriculumRef });
                continue;
            }

            // Check if lesson already exists
            const exists = lessons.find(l =>
                l.date === lesson.date &&
                l.classId === classId
            );

            if (exists) {
                skipped++;
                continue;
            }

            // Build lesson title
            const title = lesson.lessonTitle
                ? `${lesson.lessonId}: ${lesson.lessonTitle}`
                : lesson.lessonId;

            // Build activities text
            let activitiesText = '';
            if (lesson.topic) {
                activitiesText += `Topic: ${lesson.topic}\n\n`;
            }
            if (lesson.notes) {
                activitiesText += lesson.notes;
            }

            const lessonData = {
                title: title,
                date: lesson.date,
                classId: classId,
                subject: subject,
                duration: 60,
                standards: lesson.standards || '',
                learningTarget: lesson.learningTarget || '',
                successCriteria: lesson.successCriteria || '',
                flow: lesson.flow || '',
                materials: lesson.materials || '',
                activities: activitiesText.trim(),
                curriculumRef: lesson.lessonId,
                attachments: [],
                smartImported: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await yearPath.collection('lessons').add(lessonData);
            lessons.push({ id: docRef.id, ...lessonData });
            newlyImported.push(lessonData);
            importedOnDate[lesson.date] = { id: docRef.id, title: lessonData.title, activities: lessonData.activities, curriculumRef: lessonData.curriculumRef };
            imported++;
        }

        // Auto-populate the Unit Map from this import so units show up
        // without any separate manual step.
        const unitsCreated = await syncUnitsFromImportedLessons(newlyImported, classId);
        if (typeof renderUnitMap === 'function') renderUnitMap();

        // Reset UI
        resetSmartImportUI();

        // Refresh views
        renderCalendar();
        renderWeek();
        updateStats();

        if (skipped > 0) {
            showToast(`Imported ${imported} lessons (${skipped} dates already had lessons)${unitsCreated > 0 ? ` and added ${unitsCreated} units to the Unit Map` : ''}`);
        } else {
            showToast(`✅ Imported ${imported} lessons${unitsCreated > 0 ? ` and added ${unitsCreated} units to the Unit Map` : ''}!`);
        }

    } catch (error) {
        console.error('Error importing lessons:', error);
        showToast('Error importing lessons');
    }

    hideLoading();
}

// Reset Smart Import UI
function resetSmartImportUI() {
    smartPacingData = [];
    smartLessonLibrary = [];
    smartMatchedLessons = [];
    
    document.getElementById('smart-pacing-filename').textContent = '';
    document.getElementById('smart-lessons-filename').textContent = '';
    document.getElementById('smart-pacing-preview')?.classList.add('hidden');
    document.getElementById('smart-lessons-preview')?.classList.add('hidden');
    document.getElementById('smart-match-preview')?.classList.add('hidden');
    
    const matchBtn = document.getElementById('smart-match-btn');
    const importBtn = document.getElementById('smart-import-btn');
    if (matchBtn) matchBtn.disabled = true;
    if (importBtn) importBtn.disabled = true;
}

// ============================================
// SMART EXCEL IMPORT SYSTEM
// ============================================

// Smart Excel Import data
let smartExcelAllLessons = [];     // All lessons from Excel file
let smartExcelSections = [];       // Available sections (modules/units)
let smartExcelSelectedLessons = []; // Lessons from selected section
// excelOnlyLessons is declared above in Smart Import section

// Raw Excel data and headers for manual mapping
let smartExcelRawData = [];
let smartExcelHeaders = [];

// Initialize Smart Excel Import UI
function initExcelOnlyImport() {
    console.log('Initializing Smart Excel Import...');
    
    // Update class dropdown
    updateExcelOnlyClassDropdown();
    
    // File select button
    const selectBtn = document.getElementById('excel-only-select-btn');
    const fileInput = document.getElementById('excel-only-file-input');
    
    if (selectBtn && fileInput) {
        selectBtn.addEventListener('click', () => {
            const classId = document.getElementById('excel-only-class').value;
            
            if (!classId) {
                showToast('Please select a class first');
                return;
            }
            
            fileInput.click();
        });
    }
    
    // File input change
    if (fileInput) {
        fileInput.addEventListener('change', handleSmartExcelUpload);
    }
    
    // Apply mapping button
    const applyMappingBtn = document.getElementById('apply-mapping-btn');
    if (applyMappingBtn) {
        applyMappingBtn.addEventListener('click', applyColumnMapping);
    }
    
    // Section select change
    const sectionSelect = document.getElementById('excel-section-select');
    if (sectionSelect) {
        sectionSelect.addEventListener('change', handleSectionChange);
    }
    
    // Start date change - regenerate preview with dates
    const startDateInput = document.getElementById('excel-only-start-date');
    if (startDateInput) {
        startDateInput.addEventListener('change', generateDatedPreview);
    }
    
    // Days per lesson change - regenerate preview
    const daysPerLessonSelect = document.getElementById('excel-days-per-lesson');
    if (daysPerLessonSelect) {
        daysPerLessonSelect.addEventListener('change', generateDatedPreview);
    }
    
    // Import button
    const importBtn = document.getElementById('excel-only-import-btn');
    if (importBtn) {
        importBtn.addEventListener('click', excelOnlyImportLessons);
    }
    
    console.log('Smart Excel Import initialized');
}

// Update Excel Only class dropdown
function updateExcelOnlyClassDropdown() {
    const select = document.getElementById('excel-only-class');
    if (select) {
        select.innerHTML = '<option value="">Select a class...</option>' +
            classes.map(cls => `<option value="${cls.id}">${escHtml(cls.name)}</option>`).join('');
    }
}

// Handle Smart Excel file upload (Step 2) - Now just loads file and shows mapping UI
async function handleSmartExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    document.getElementById('excel-only-filename').textContent = file.name;
    showLoading();
    document.querySelector('.loading-text').textContent = 'Reading Excel file...';
    
    try {
        const data = await readExcelFile(file);
        
        if (!data || data.length === 0) {
            throw new Error('No data found in Excel file');
        }
        
        // Store raw data and headers
        smartExcelRawData = data;
        smartExcelHeaders = Object.keys(data[0]);
        
        console.log('Excel headers found:', smartExcelHeaders);
        
        hideLoading();
        
        // Populate mapping dropdowns
        populateMappingDropdowns();
        
        // Show mapping step
        const mappingStep = document.getElementById('excel-mapping-step');
        if (mappingStep) {
            mappingStep.style.display = 'block';
        }
        
        showToast(`✅ Loaded ${data.length} rows - now map your columns`);
        
    } catch (error) {
        hideLoading();
        console.error('Smart Excel import error:', error);
        showToast('Error reading Excel: ' + error.message);
    }
    
    e.target.value = '';
}

// Populate mapping dropdown selects with Excel headers
function populateMappingDropdowns() {
    const mappingIds = [
        'map-lesson-id', 'map-title', 'map-standards', 'map-objectives',
        'map-success-criteria', 'map-vocabulary',
        'map-materials', 'map-flow', 'map-notes', 'map-section'
    ];

    // Smart auto-detect suggestions
    const suggestions = {
        'map-lesson-id': ['lesson', 'lesson #', 'lesson number', 'lesson id', 'id'],
        'map-title': ['title', 'lesson title', 'name', 'topic', 'skill', 'primary skill'],
        'map-standards': ['standard', 'standards', 'ccss', 'teks'],
        'map-objectives': ['objective', 'objectives', 'i can', 'learning target'],
        'map-success-criteria': ['success criteria', 'success criterion', 'criteria for success'],
        'map-vocabulary': ['key vocabulary', 'vocabulary', 'vocab'],
        'map-materials': ['material', 'materials', 'resources'],
        'map-flow': ['flow', 'lesson flow', 'procedure', 'steps'],
        'map-notes': ['notes', 'activities', 'description', 'activities & notes'],
        'map-section': ['module', 'unit', 'section', 'topic', 'chapter']
    };
    
    mappingIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        
        // Build options
        let html = '<option value="">-- None --</option>';
        smartExcelHeaders.forEach(header => {
            html += `<option value="${header}">${header}</option>`;
        });
        select.innerHTML = html;
        
        // Try to auto-select based on suggestions
        const suggestList = suggestions[id] || [];
        for (const suggest of suggestList) {
            const match = smartExcelHeaders.find(h => 
                h.toLowerCase().trim() === suggest.toLowerCase() ||
                h.toLowerCase().trim().includes(suggest.toLowerCase())
            );
            if (match) {
                select.value = match;
                break;
            }
        }
    });
}

// Apply column mapping and process lessons
function applyColumnMapping() {
    const lessonIdCol = document.getElementById('map-lesson-id').value;
    
    if (!lessonIdCol) {
        showToast('Please select a Lesson ID column');
        return;
    }
    
    const titleCol = document.getElementById('map-title').value;
    const standardsCol = document.getElementById('map-standards').value;
    const objectivesCol = document.getElementById('map-objectives').value;
    const successCriteriaCol = document.getElementById('map-success-criteria').value;
    const vocabularyCol = document.getElementById('map-vocabulary').value;
    const materialsCol = document.getElementById('map-materials').value;
    const flowCol = document.getElementById('map-flow').value;
    const notesCol = document.getElementById('map-notes').value;
    const sectionCol = document.getElementById('map-section').value;
    
    // Process lessons with mapping
    smartExcelAllLessons = [];
    smartExcelSections = [];
    const sectionSet = new Set();
    
    for (const row of smartExcelRawData) {
        const lessonId = row[lessonIdCol];
        if (!lessonId) continue;
        
        // Determine section
        let section = 'All Lessons';
        if (sectionCol && row[sectionCol]) {
            section = String(row[sectionCol]).trim();
        }
        
        // Track sections
        if (!sectionSet.has(section)) {
            sectionSet.add(section);
            smartExcelSections.push(section);
        }
        
        // Standards and Objectives(->Learning Target)/Success Criteria get their own fields.
        // Key Vocabulary (no dedicated schema field) is folded into the standards text block.
        let standardsText = standardsCol ? String(row[standardsCol] || '').trim() : '';
        const learningTargetText = objectivesCol ? String(row[objectivesCol] || '').trim() : '';
        const successCriteriaText = successCriteriaCol ? String(row[successCriteriaCol] || '').trim() : '';
        if (vocabularyCol) {
            const vocabulary = String(row[vocabularyCol] || '').trim();
            if (vocabulary) {
                standardsText = standardsText
                    ? `${standardsText}\n\nKey Vocabulary:\n${vocabulary}`
                    : `Key Vocabulary:\n${vocabulary}`;
            }
        }

        smartExcelAllLessons.push({
            lessonId: String(lessonId).trim(),
            section: section,
            title: titleCol ? String(row[titleCol] || '').trim() : '',
            standards: standardsText,
            learningTarget: learningTargetText,
            successCriteria: successCriteriaText,
            materials: materialsCol ? String(row[materialsCol] || '').trim() : '',
            flow: flowCol ? String(row[flowCol] || '').trim() : '',
            notes: notesCol ? String(row[notesCol] || '').trim() : ''
        });
    }
    
    if (smartExcelAllLessons.length === 0) {
        showToast('No valid lessons found with selected mapping');
        return;
    }
    
    // Populate section dropdown and show next steps
    populateSectionDropdown();
    showToast(`✅ Mapped ${smartExcelAllLessons.length} lessons in ${smartExcelSections.length} sections`);
}

// Populate section dropdown (Step 3)
function populateSectionDropdown() {
    const sectionSelect = document.getElementById('excel-section-select');
    const sectionStep = document.getElementById('excel-section-step');
    
    if (sectionSelect) {
        sectionSelect.innerHTML = '<option value="all">All Lessons (' + smartExcelAllLessons.length + ')</option>' +
            smartExcelSections.map(section => {
                const count = smartExcelAllLessons.filter(l => l.section === section).length;
                return `<option value="${section}">${section} (${count} lessons)</option>`;
            }).join('');
    }
    
    // Show section step
    if (sectionStep) {
        sectionStep.style.display = 'block';
    }
    
    // Trigger initial section selection
    handleSectionChange();
}

// Handle section selection change
function handleSectionChange() {
    const sectionSelect = document.getElementById('excel-section-select');
    const selectedSection = sectionSelect?.value || 'all';
    
    // Filter lessons by section
    if (selectedSection === 'all') {
        smartExcelSelectedLessons = [...smartExcelAllLessons];
    } else {
        smartExcelSelectedLessons = smartExcelAllLessons.filter(l => l.section === selectedSection);
    }
    
    // Display section preview
    displaySectionPreview();
    
    // Show step 4 (date & import)
    const dateStep = document.getElementById('excel-date-step');
    if (dateStep) {
        dateStep.style.display = 'block';
    }
    
    // Set default start date to today if not set
    const startDateInput = document.getElementById('excel-only-start-date');
    if (startDateInput && !startDateInput.value) {
        startDateInput.value = formatDate(new Date());
    }
    
    // Generate dated preview if date is set
    if (startDateInput?.value) {
        generateDatedPreview();
    }
}

// Display section preview (without dates)
function displaySectionPreview() {
    const container = document.getElementById('excel-section-preview-list');
    const preview = document.getElementById('excel-section-preview');
    const summary = document.getElementById('excel-section-summary');
    
    const previewLessons = smartExcelSelectedLessons.slice(0, 6);
    
    container.innerHTML = previewLessons.map(lesson => `
        <div class="import-event-item">
            <span class="import-event-title">${lesson.lessonId}</span>
            ${lesson.title ? `<span class="import-event-meta" style="color: var(--text-muted); font-size: 0.65rem; margin-left: 0.5rem;">${escHtml(lesson.title.substring(0, 25))}${lesson.title.length > 25 ? '...' : ''}</span>` : ''}
        </div>
    `).join('');
    
    if (smartExcelSelectedLessons.length > 6) {
        container.innerHTML += `<p style="color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem;">...and ${smartExcelSelectedLessons.length - 6} more lessons</p>`;
    }
    
    summary.innerHTML = `<strong>${smartExcelSelectedLessons.length}</strong> lessons selected`;
    preview.classList.remove('hidden');
}

// Generate dated preview based on start date and class schedule
function generateDatedPreview() {
    const classId = document.getElementById('excel-only-class').value;
    const startDate = document.getElementById('excel-only-start-date').value;
    const daysPerLesson = parseInt(document.getElementById('excel-days-per-lesson')?.value || '1');
    
    if (!classId || !startDate || smartExcelSelectedLessons.length === 0) {
        return;
    }
    
    // Get the selected class to check its schedule
    const selectedClass = classes.find(c => c.id === classId);
    if (!selectedClass) return;
    
    // Build class schedule day map
    const dayNameToNum = { 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5 };
    const classScheduleDays = new Set();
    if (selectedClass.schedule) {
        Object.keys(selectedClass.schedule).forEach(day => {
            if (selectedClass.schedule[day]) {
                classScheduleDays.add(dayNameToNum[day]);
            }
        });
    }
    const hasSchedule = classScheduleDays.size > 0;
    
    // Build set of off days from events
    const offDays = new Set();
    for (const event of events) {
        const isOffDay = isNoSchoolEvent(event);   // v6.2.0: single gatekeeper
        
        if (isOffDay && event.startDate) {
            const eventStart = new Date(event.startDate + 'T00:00:00');
            const eventEnd = event.endDate ? new Date(event.endDate + 'T00:00:00') : eventStart;
            
            const d = new Date(eventStart);
            while (d <= eventEnd) {
                offDays.add(formatDate(d));
                d.setDate(d.getDate() + 1);
            }
        }
    }
    
    // Helper function to check if a date is a valid class day
    function isValidClassDay(date) {
        const dayOfWeek = date.getDay();
        const dateStr = formatDate(date);
        
        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) return false;
        
        // Skip off days (incl. before the first / after the last day of school)
        if (offDays.has(dateStr) || isOffDay(dateStr)) return false;
        
        // If class has a schedule, only use days the class meets
        if (hasSchedule && !classScheduleDays.has(dayOfWeek)) return false;
        
        return true;
    }
    
    // Get next valid class day
    function getNextValidClassDay(date) {
        let current = new Date(date);
        let maxIterations = 365;
        while (!isValidClassDay(current) && maxIterations > 0) {
            current = addDays(current, 1);
            maxIterations--;
        }
        return current;
    }
    
    // Assign dates to lessons (with support for multiple days per lesson)
    excelOnlyLessons = [];
    let currentDate = new Date(startDate + 'T00:00:00');
    
    for (const lesson of smartExcelSelectedLessons) {
        // Add the same lesson for each day specified
        for (let dayNum = 1; dayNum <= daysPerLesson; dayNum++) {
            currentDate = getNextValidClassDay(currentDate);
            
            excelOnlyLessons.push({
                ...lesson,
                date: formatDate(currentDate),
                selected: true,
                dayLabel: daysPerLesson > 1 ? `Day ${dayNum}/${daysPerLesson}` : null
            });
            
            currentDate = addDays(currentDate, 1);
        }
    }
    
    // Display dated preview
    displayExcelOnlyPreview(hasSchedule, classScheduleDays, offDays.size, daysPerLesson);
}

// Display Excel Only preview (with dates)
function displayExcelOnlyPreview(hasSchedule, classScheduleDays, offDaysCount, daysPerLesson = 1) {
    const container = document.getElementById('excel-only-preview-list');
    const preview = document.getElementById('excel-only-preview');
    const summary = document.getElementById('excel-only-summary');
    const importBtn = document.getElementById('excel-only-import-btn');
    
    const previewLessons = excelOnlyLessons.slice(0, 10);
    
    // Day number to name for display
    const dayNumToName = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };
    
    container.innerHTML = previewLessons.map((lesson, index) => {
        const lessonDate = new Date(lesson.date + 'T00:00:00');
        const dayName = lessonDate.toLocaleDateString('en-US', { weekday: 'short' });
        const dayLabel = lesson.dayLabel ? `<span style="color: var(--cyan-blue); font-size: 0.65rem; margin-left: 0.25rem;">${lesson.dayLabel}</span>` : '';
        return `
            <div class="import-event-item">
                <input type="checkbox" id="excel-only-lesson-${index}" ${lesson.selected ? 'checked' : ''} data-index="${index}">
                <span class="import-event-date">${dayName} ${formatDisplayDateShort(lesson.date)}</span>
                <span class="import-event-title">${lesson.lessonId}${dayLabel}</span>
            </div>
        `;
    }).join('');
    
    if (excelOnlyLessons.length > 10) {
        container.innerHTML += `<p style="color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem;">...and ${excelOnlyLessons.length - 10} more lessons</p>`;
    }
    
    // Add checkbox listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (index < excelOnlyLessons.length) {
                excelOnlyLessons[index].selected = e.target.checked;
            }
        });
    });
    
    const firstDate = excelOnlyLessons[0]?.date;
    const lastDate = excelOnlyLessons[excelOnlyLessons.length - 1]?.date;
    
    // Build schedule info
    let scheduleInfo = '';
    if (hasSchedule) {
        const dayNames = Array.from(classScheduleDays).sort().map(d => dayNumToName[d]).join('/');
        scheduleInfo = ` • ${dayNames}`;
    }
    if (offDaysCount > 0) {
        scheduleInfo += ` • Skipping ${offDaysCount} off days`;
    }
    
    // Show days per lesson info
    const uniqueLessons = smartExcelSelectedLessons.length;
    let daysInfo = '';
    if (daysPerLesson > 1) {
        daysInfo = ` (${uniqueLessons} lessons × ${daysPerLesson} days)`;
    }
    
    summary.innerHTML = `<strong>${excelOnlyLessons.length}</strong> lesson entries${daysInfo}: ${formatDisplayDateShort(firstDate)} → ${formatDisplayDateShort(lastDate)}${scheduleInfo}`;
    
    preview.classList.remove('hidden');
    if (importBtn) importBtn.disabled = false;
}

// Import Excel Only lessons
async function excelOnlyImportLessons() {
    const classId = document.getElementById('excel-only-class').value;
    if (!classId) {
        showToast('Please select a class');
        return;
    }
    
    const selectedLessons = excelOnlyLessons.filter(l => l.selected);
    
    if (selectedLessons.length === 0) {
        showToast('No lessons selected');
        return;
    }
    
    showLoading();
    document.querySelector('.loading-text').textContent = 'Importing lessons...';
    
    try {
        const yearPath = getYearPath();
        const cls = classes.find(c => c.id === classId);
        const subject = cls?.subject || 'Math';
        let imported = 0;
        let skipped = 0;
        const newlyImported = [];

        for (const lesson of selectedLessons) {
            // Check if lesson already exists on that date for that class
            const exists = lessons.find(l =>
                l.date === lesson.date &&
                l.classId === classId
            );

            if (exists) {
                skipped++;
                continue;
            }
            
            // Build lesson title
            const title = lesson.title 
                ? `${lesson.lessonId}: ${lesson.title}`
                : lesson.lessonId;
            
            // Build activities text
            let activitiesText = '';
            if (lesson.notes) {
                activitiesText = lesson.notes;
            }
            
            const lessonData = {
                title: title,
                date: lesson.date,
                classId: classId,
                subject: subject,
                duration: 60,
                standards: lesson.standards || '',
                learningTarget: lesson.learningTarget || '',
                successCriteria: lesson.successCriteria || '',
                flow: lesson.flow || '',
                materials: lesson.materials || '',
                activities: activitiesText.trim(),
                curriculumRef: lesson.lessonId,
                attachments: [],
                smartImported: true,
                smartExcelImport: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await yearPath.collection('lessons').add(lessonData);
            lessons.push({ id: docRef.id, ...lessonData });
            newlyImported.push(lessonData);
            imported++;
        }

        // Auto-populate the Unit Map from this import so units show up
        // without any separate manual step.
        const unitsCreated = await syncUnitsFromImportedLessons(newlyImported, classId);
        if (typeof renderUnitMap === 'function') renderUnitMap();

        // Reset UI
        resetSmartExcelUI();

        // Refresh views
        renderCalendar();
        renderWeek();
        updateStats();

        if (skipped > 0) {
            showToast(`Imported ${imported} lessons (${skipped} dates already had lessons)${unitsCreated > 0 ? ` and added ${unitsCreated} units to the Unit Map` : ''}`);
        } else {
            showToast(`✅ Imported ${imported} lessons${unitsCreated > 0 ? ` and added ${unitsCreated} units to the Unit Map` : ''}!`);
        }

    } catch (error) {
        console.error('Error importing lessons:', error);
        showToast('Error importing lessons');
    }

    hideLoading();
}

// Reset Smart Excel UI
function resetSmartExcelUI() {
    smartExcelAllLessons = [];
    smartExcelSections = [];
    smartExcelSelectedLessons = [];
    smartExcelRawData = [];
    smartExcelHeaders = [];
    excelOnlyLessons = [];
    
    document.getElementById('excel-only-filename').textContent = '';
    document.getElementById('excel-section-preview')?.classList.add('hidden');
    document.getElementById('excel-only-preview')?.classList.add('hidden');
    
    // Hide steps 3, 4 and 5
    const mappingStep = document.getElementById('excel-mapping-step');
    const sectionStep = document.getElementById('excel-section-step');
    const dateStep = document.getElementById('excel-date-step');
    if (mappingStep) mappingStep.style.display = 'none';
    if (sectionStep) sectionStep.style.display = 'none';
    if (dateStep) dateStep.style.display = 'none';
    
    const importBtn = document.getElementById('excel-only-import-btn');
    if (importBtn) importBtn.disabled = true;
}

// Initialize on load

// ============================================
// PARENT NEWSLETTER GENERATOR
// ============================================

let newsletterMode = 'week'; // 'week' | 'month'

function initNewsletterSystem() {
    document.getElementById('newsletter-week-btn')?.addEventListener('click', () => {
        openNewsletterModal('week');
    });
    document.getElementById('newsletter-month-btn')?.addEventListener('click', () => {
        openNewsletterModal('month');
    });
    document.getElementById('newsletter-generate-btn')?.addEventListener('click', generateNewsletter);
    document.getElementById('newsletter-copy-btn')?.addEventListener('click', () => copyNewsletterOutput('newsletter-output'));
    document.getElementById('newsletter-print-btn')?.addEventListener('click', printNewsletter);
    document.getElementById('newsletter-regenerate-btn')?.addEventListener('click', generateNewsletter);

    // Anchor Charts (Week view)
    document.getElementById('anchor-charts-week-btn')?.addEventListener('click', openAnchorChartsModal);
    document.getElementById('anchor-generate-btn')?.addEventListener('click', generateAnchorCharts);
    document.getElementById('anchor-regenerate-btn')?.addEventListener('click', generateAnchorCharts);
    document.getElementById('anchor-copy-btn')?.addEventListener('click', () => copyNewsletterOutput('anchor-output'));
    document.getElementById('anchor-print-btn')?.addEventListener('click', printAnchorCharts);
}

function openNewsletterModal(mode) {
    newsletterMode = mode;
    const title = mode === 'week'
        ? `📰 Weekly Parent Newsletter — ${document.getElementById('current-week')?.textContent || ''}`
        : `📰 Monthly Parent Newsletter — ${document.getElementById('current-month')?.textContent || ''}`;
    document.getElementById('newsletter-modal-title').textContent = title;

    // Reset output, then bring back the saved copy for this week/month if any
    document.getElementById('newsletter-output-area').classList.add('hidden');
    document.getElementById('newsletter-status').classList.add('hidden');
    document.getElementById('newsletter-modal').classList.remove('hidden');
    showSavedAiOutput({
        id: newsletterSaveId(mode),
        statusEl: document.getElementById('newsletter-status'),
        outputArea: document.getElementById('newsletter-output-area'),
        outputEl: document.getElementById('newsletter-output'),
        outputLabelEl: document.getElementById('newsletter-output-label')
    });
}

function buildNewsletterContext() {
    if (newsletterMode === 'week') {
        // ── WEEKLY ──────────────────────────────────────────
        const weekStart = currentWeekStart;
        const days = [];
        for (let i = 0; i < 5; i++) {
            const date = addDays(weekStart, i);
            const dateStr = formatDate(date);
            const dayName = ['Monday','Tuesday','Wednesday','Thursday','Friday'][i];
            const dayOfWeek = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];

            const dayIsOff = isOffDay(dateStr);
            const dayClasses = dayIsOff ? [] : sortClassesByTime(
                classes.filter(cls => cls.schedule && cls.schedule[dayOfWeek] && isClassActiveOnDate(cls, dateStr)), dayOfWeek
            );
            const dayEvents = events.filter(e => dateStr >= e.startDate && dateStr <= (e.endDate || e.startDate));
            const dayLessons = lessons.filter(l => l.date === dateStr);

            const classLines = dayClasses.map(cls => {
                const lesson = mergedLessonForClass(dayLessons, cls.id);
                if (lesson) {
                    return `  • ${cls.name}${cls.subject ? ' (' + cls.subject + ')' : ''}: ${lesson.title}${lesson.standards ? ' — ' + lesson.standards.substring(0, 80) : ''}`;
                }
                return `  • ${cls.name}${cls.subject ? ' (' + cls.subject + ')' : ''}: (no lesson planned)`;
            });

            const eventLines = dayEvents.map(e => `  📌 ${e.title}`);

            if (dayIsOff) {
                days.push(`${dayName} ${date.toLocaleDateString('en-US',{month:'short',day:'numeric'})}: NO SCHOOL`);
            } else {
                days.push([
                    `${dayName} ${date.toLocaleDateString('en-US',{month:'short',day:'numeric'})}:`,
                    ...classLines,
                    ...eventLines
                ].join('\n'));
            }
        }
        return days.join('\n\n');

    } else {
        // ── MONTHLY ─────────────────────────────────────────
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // Collect all lessons and events for the month
        const monthLessons = lessons.filter(l => {
            if (!l.date) return false;
            const d = new Date(l.date + 'T00:00:00');
            return d.getFullYear() === year && d.getMonth() === month;
        });

        // Group lessons by class, collect unique titles
        const byClass = {};
        monthLessons.forEach(l => {
            const cls = classes.find(c => c.id === l.classId);
            const name = cls ? cls.name : 'General';
            if (!byClass[name]) byClass[name] = [];
            if (l.title && !byClass[name].includes(l.title)) {
                byClass[name].push(l.title);
            }
        });

        const monthEvents = events.filter(e => {
            if (!e.startDate) return false;
            const d = new Date(e.startDate + 'T00:00:00');
            return d.getFullYear() === year && d.getMonth() === month;
        }).sort((a, b) => a.startDate.localeCompare(b.startDate));

        const classLines = Object.entries(byClass).map(([name, titles]) =>
            `  ${name}: ${titles.slice(0, 6).join(', ')}${titles.length > 6 ? '…' : ''}`
        );

        const eventLines = monthEvents.map(e =>
            `  • ${new Date(e.startDate + 'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}: ${e.title}`
        );

        return [
            `Month: ${monthName}`,
            '',
            'LESSONS PLANNED FOR THIS MONTH:',
            ...classLines,
            '',
            'SCHOOL EVENTS:',
            ...(eventLines.length > 0 ? eventLines : ['  (No events this month)'])
        ].join('\n');
    }
}

// ── Shared newsletter engine ─────────────────────────────────────────────
// Weekly, Monthly, and Year-at-a-Glance newsletters each build their own
// context (buildNewsletterContext / buildYearNewsletterContext), but share
// one prompt skeleton, one Claude streaming call, one markup renderer, one
// copy handler, and one print template. This keeps the three newsletter
// types visually and structurally consistent, and puts the parent-facing
// content in a fixed order so the most important information (concrete
// dates and action items) is never buried inside a wall of narrative text.

function buildNewsletterPrompt({ teacherName, grade, scopeLabel, toneMap, tone, language, context, sections, extra, wordLimit, extraGuidance }) {
    const langInstruction = language === 'both'
        ? 'Write the full newsletter in English first, then provide the complete Spanish translation below a divider line "---".'
        : language === 'Spanish'
        ? 'Write entirely in Spanish.'
        : 'Write in English.';

    const allSections = extra ? [...sections, `this special note from the teacher: "${extra}"`] : sections;

    return `You are ${teacherName}, a Grade ${grade} teacher writing a parent newsletter.

SCOPE: ${scopeLabel}
TONE: ${toneMap[tone] || toneMap.warm}
LANGUAGE: ${langInstruction}

CLASS DATA:
${context}

Write a parent newsletter covering: ${allSections.join(', ') || 'what students are learning'}.

Use exactly this structure so busy parents can find what matters most at a glance:
1. Open with a direct greeting to families, written out as the actual greeting itself (for example: "Good morning, Grade ${grade} families!" or "Hi everyone!"). Do NOT describe, announce, or preview the greeting ("Here's a warm sentence to...") — just write the greeting.
2. "### 📚 What We're Learning" followed by a short plain-language paragraph, no jargon.${extraGuidance ? ' ' + extraGuidance : ''}
3. "### 📌 Important Dates & Reminders" followed by "- " bullet points, one concrete date or action item per line. Put the single most time-sensitive item first. ONLY include this section if the data above actually contains real dates, events, or reminders — omit it entirely otherwise.
4. A brief warm sign-off as ${teacherName}.

Formatting rules:
- Use "### " immediately before each section title, exactly as written above.
- Use "- " for every bullet point, one per line, no sub-bullets.
- No other markdown — no **bold**, no numbered lists, no extra "#" headers.
- Keep the total length under ${wordLimit} words${language === 'both' ? ' per language' : ''}.

TENSE — this is the most important rule: Write entirely in a forward-looking, "here's what's coming up" tone. Use future/upcoming phrasing like "will be learning," "coming up," "next," "this week we'll." NEVER describe things as already finished — avoid past tense like "we learned," "we covered," "students explored," or "last week." Even if some of the data above reflects days that have already passed, present everything to parents as what's ahead, not a recap of what already happened.`;
}

// Renders the ### headers / - bullets / paragraph structure above into HTML.
function renderNewsletterMarkup(text) {
    return text.split(/\n\s*\n/).map(block => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('### ')) {
            const lines = trimmed.split('\n');
            const heading = lines[0].replace(/^###\s*/, '').trim();
            const rest = lines.slice(1).join('\n').trim();
            return `<h3 class="newsletter-section-heading">${heading}</h3>` + (rest ? renderNewsletterBody(rest) : '');
        }
        return renderNewsletterBody(trimmed);
    }).join('');
}

function renderNewsletterBody(block) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const isBulletList = lines.length > 0 && lines.every(l => l.startsWith('- ') || l.startsWith('• '));
    if (isBulletList) {
        return '<ul class="newsletter-bullets">' + lines.map(l => `<li>${l.replace(/^[-•]\s*/, '')}</li>`).join('') + '</ul>';
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
}

// Shared fetch + stream + render loop used by every newsletter type.
// Shared fetch + stream + render loop used by every newsletter type.
// ============================================================
// SAVED AI OUTPUT (v6.3.0)
// Everything the AI writes is kept under
//   users/{uid}/years/{year}/aiOutputs/{id}
// and shown again in the place it was made:
//   * newsletters (week / month / year) and anchor charts: one saved copy per
//     period, re-shown when that modal opens; generating again replaces it
//   * quizzes, rubrics and differentiation: a "Saved" list you can reopen,
//     re-print or delete
// (Lesson Fill, student packets, the curriculum generator, calendar and
// pacing imports already save into lessons / sub days / events.)
// ============================================================
const _aiOutputCache = {};

function aiOutputsRef() { return getYearPath().collection('aiOutputs'); }
// Cache per account + school year ("newsletter-year" exists in every year)
function aiCacheKey(id) { return (currentUser ? currentUser.uid : '') + '/' + settings.schoolYear + '/' + id; }

function aiSavedStamp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', '
        + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Save (or replace) one output. Returns the doc id, or null if it failed.
async function saveAiOutput(id, data) {
    if (!currentUser) return null;
    const savedAt = new Date().toISOString();
    const docData = { ...data, savedAt, schoolYear: settings.schoolYear, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
        const ref = id ? aiOutputsRef().doc(id) : aiOutputsRef().doc();
        await ref.set(docData);
        _aiOutputCache[aiCacheKey(ref.id)] = { id: ref.id, ...data, savedAt };
        return ref.id;
    } catch (e) {
        console.warn('saveAiOutput:', e.message);
        showToast('⚠️ Generated, but a copy could not be saved: ' + e.message);
        return null;
    }
}

async function loadAiOutput(id) {
    if (!currentUser) return null;
    const ck = aiCacheKey(id);
    if (_aiOutputCache[ck]) return _aiOutputCache[ck];
    try {
        const doc = await aiOutputsRef().doc(id).get();
        if (!doc.exists) return null;
        _aiOutputCache[ck] = { id: doc.id, ...doc.data() };
        return _aiOutputCache[ck];
    } catch (e) { console.warn('loadAiOutput:', e.message); return null; }
}

// Newest first. (Filtered client-side so no composite index is needed.)
async function listAiOutputs(types) {
    if (!currentUser) return [];
    try {
        const snap = await aiOutputsRef().where('type', 'in', types).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
    } catch (e) { console.warn('listAiOutputs:', e.message); return []; }
}

async function deleteAiOutput(id) {
    try { await aiOutputsRef().doc(id).delete(); delete _aiOutputCache[aiCacheKey(id)]; return true; }
    catch (e) { showToast('Could not delete: ' + e.message); return false; }
}

// Re-show a saved newsletter / anchor-chart set when its modal opens.
let _aiShowToken = 0;
async function showSavedAiOutput({ id, statusEl, outputArea, outputEl, outputLabelEl }) {
    const token = ++_aiShowToken;
    const saved = await loadAiOutput(id);
    if (token !== _aiShowToken || !saved || !saved.text) return;   // modal changed meanwhile / nothing saved
    outputEl.innerHTML = renderNewsletterMarkup(saved.text);
    if (outputLabelEl && saved.label) outputLabelEl.textContent = saved.label;
    outputArea.classList.remove('hidden');
    if (statusEl) {
        statusEl.innerHTML = `<div class="ai-saved-note">💾 Your saved copy from ${escHtml(aiSavedStamp(saved.savedAt))}. Generate again to replace it.</div>`;
        statusEl.classList.remove('hidden');
    }
}

function newsletterSaveId(mode) {
    if (mode === 'week') return 'newsletter-week-' + formatDate(currentWeekStart);
    if (mode === 'year') return 'newsletter-year';
    return 'newsletter-month-' + currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0');
}

async function generateNewsletterFromPrompt({ prompt, maxTokens, statusEl, outputArea, outputEl, outputLabelEl, labelText, genBtn, readyMessage, saveId = null, saveType = 'newsletter' }) {
    const providerLabel = (AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic).label;
    if (!hasEffectiveAiKey()) {
        showToast(`Add your ${providerLabel} API key in Settings → AI Packet Generator`);
        return false;
    }

    statusEl.innerHTML = `<div class="newsletter-generating"><div class="nl-spinner"></div><span>AI is writing your newsletter…</span></div>`;
    statusEl.classList.remove('hidden');
    outputArea.classList.add('hidden');
    if (genBtn) genBtn.disabled = true;

    try {
        statusEl.classList.add('hidden');
        outputEl.innerHTML = '';
        outputArea.classList.remove('hidden');
        if (outputLabelEl) outputLabelEl.textContent = labelText;

        _aiShowToken++;   // a saved copy still loading must not overwrite this one
        const fullText = await callAITextStream({
            prompt,
            tier: 'quality',
            maxTokens,
            onDelta: (_chunk, fullText) => {
                outputEl.innerHTML = renderNewsletterMarkup(fullText);
                outputEl.scrollTop = outputEl.scrollHeight;
            }
        });

        if (saveId) {
            const ok = await saveAiOutput(saveId, { type: saveType, label: labelText, text: fullText });
            if (ok) {
                statusEl.innerHTML = `<div class="ai-saved-note">💾 Saved. It will be here next time you open this.</div>`;
                statusEl.classList.remove('hidden');
            }
        }
        showToast(readyMessage || '📰 Newsletter ready!');
        return true;

    } catch (err) {
        console.error('Newsletter generation error:', err);
        statusEl.innerHTML = `<div class="newsletter-error">❌ ${err.message || 'Generation failed. Check your API key.'}</div>`;
        statusEl.classList.remove('hidden');
        outputArea.classList.add('hidden');
        return false;
    } finally {
        if (genBtn) genBtn.disabled = false;
    }
}

// Shared copy-to-clipboard handler for any newsletter output element.
function copyNewsletterOutput(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const text = el.innerText || el.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Copied!');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('📋 Copied!');
    });
}

// Shared print template for any newsletter type — one visual style for all three.
function openNewsletterPrintWindow({ title, subtitle, bodyHtml, v = '0.4in' }) {   // spec: 0.5in only for the year newsletter
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #222; margin: 0; }
  @page { margin: 0.6in; }
  h1 { font-size: 22px; color: #FF6B9D; border-bottom: 3px solid #FF6B9D; padding-bottom: 8px; margin-bottom: 4px; }
  h3.newsletter-section-heading { font-size: 15px; color: #7B5EA7; margin: 22px 0 8px; }
  .meta { font-size: 12px; color: #888; margin-bottom: 24px; }
  p { line-height: 1.7; margin-bottom: 14px; }
  ul.newsletter-bullets { margin: 0 0 16px; padding-left: 22px; }
  ul.newsletter-bullets li { line-height: 1.6; margin-bottom: 6px; }
  hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
  .footer { font-size: 11px; color: #aaa; margin-top: 32px; border-top: 1px solid #eee; padding-top: 10px; }
</style>
</head><body>
<h1>📰 ${title}</h1>
${subtitle ? `<div class="meta">${subtitle}</div>` : ''}
${bodyHtml}
</body></html>`, {v, h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 400);
}

async function generateNewsletter() {
    const tone = document.getElementById('newsletter-tone')?.value || 'warm';
    const language = document.getElementById('newsletter-language')?.value || 'English';
    const includeUpcoming = document.getElementById('nl-include-upcoming')?.checked;
    const includeEvents = document.getElementById('nl-include-events')?.checked;
    const includeReminders = document.getElementById('nl-include-reminders')?.checked;
    const extra = document.getElementById('newsletter-extra')?.value?.trim() || '';

    const context = buildNewsletterContext();
    const teacherName = aiSettings.teacherName || userProfile.username || 'Your Teacher';
    const grade = aiSettings.grade || '1';
    const isWeek = newsletterMode === 'week';
    const period = isWeek
        ? document.getElementById('current-week')?.textContent || 'This Week'
        : document.getElementById('current-month')?.textContent || 'This Month';

    const toneMap = {
        warm: 'warm, friendly, and encouraging — like a letter from a caring teacher',
        professional: 'professional and informative, clear and concise',
        brief: 'very brief — use bullet points and keep it under 150 words total'
    };

    const sections = [];
    if (includeUpcoming) sections.push('what students are learning');
    if (includeEvents) sections.push('upcoming school events and important dates');
    if (includeReminders) sections.push('homework or preparation reminders');

    const prompt = buildNewsletterPrompt({
        teacherName, grade, scopeLabel: period, toneMap, tone, language,
        context, sections, extra, wordLimit: 300
    });

    await generateNewsletterFromPrompt({
        prompt,
        maxTokens: 1500,
        statusEl: document.getElementById('newsletter-status'),
        outputArea: document.getElementById('newsletter-output-area'),
        outputEl: document.getElementById('newsletter-output'),
        outputLabelEl: document.getElementById('newsletter-output-label'),
        labelText: isWeek ? `Week newsletter · ${period}` : `Monthly newsletter · ${period}`,
        genBtn: document.getElementById('newsletter-generate-btn'),
        readyMessage: '📰 Newsletter ready!',
        saveId: newsletterSaveId(isWeek ? 'week' : 'month')
    });
}

function printNewsletter() {
    const el = document.getElementById('newsletter-output');
    const label = document.getElementById('newsletter-output-label')?.textContent || 'Newsletter';
    const teacherName = aiSettings.teacherName || userProfile.username || 'Teacher';
    if (!el || !el.innerHTML.trim()) { showToast('Generate a newsletter first'); return; }

    openNewsletterPrintWindow({
        title: label,
        subtitle: '',
        bodyHtml: el.innerHTML
    });
}


// ============================================
// YEAR NEWSLETTER GENERATOR
// ============================================

function initYearNewsletter() {
    document.getElementById('newsletter-year-btn')?.addEventListener('click', openYearNewsletterModal);
    document.getElementById('yn-generate-btn')?.addEventListener('click', generateYearNewsletter);
    document.getElementById('yn-copy-btn')?.addEventListener('click', () => copyNewsletterOutput('yn-output'));
    document.getElementById('yn-print-btn')?.addEventListener('click', printYearNewsletter);
    document.getElementById('yn-regenerate-btn')?.addEventListener('click', generateYearNewsletter);
}

function openYearNewsletterModal() {
    const schoolYear = settings.schoolYear || '2025-2026';
    document.getElementById('year-newsletter-title').textContent = `📰 Year-at-a-Glance Newsletter — ${schoolYear}`;

    const statusEl = document.getElementById('yn-curriculum-status');
    const readable = curriculumDocs.filter(d => d.hasContent && d.content && d.content.length > 50);
    if (readable.length > 0) {
        statusEl.innerHTML = `<div class="yn-curriculum-info">📚 Using <strong>${readable.length}</strong> pacing document${readable.length !== 1 ? 's' : ''} from your Curriculum Library as source material.</div>`;
    } else if (curriculumDocs.length > 0) {
        statusEl.innerHTML = `<div class="yn-curriculum-warn">⚠️ ${curriculumDocs.length} document${curriculumDocs.length !== 1 ? 's' : ''} uploaded but none have readable text — Claude will use your class schedule and lesson titles instead.</div>`;
    } else {
        statusEl.innerHTML = `<div class="yn-curriculum-warn">📂 No curriculum documents uploaded. Upload pacing guides in <strong>Settings → Curriculum Library</strong> for richer newsletters.</div>`;
    }

    document.getElementById('yn-output-area').classList.add('hidden');
    document.getElementById('yn-status').classList.add('hidden');
    document.getElementById('year-newsletter-modal').classList.remove('hidden');
    showSavedAiOutput({
        id: newsletterSaveId('year'),
        statusEl: document.getElementById('yn-status'),
        outputArea: document.getElementById('yn-output-area'),
        outputEl: document.getElementById('yn-output'),
        outputLabelEl: document.getElementById('yn-output-label')
    });
}

function buildYearNewsletterContext() {
    const schoolYear = settings.schoolYear || '2025-2026';

    const classLines = classes.map(cls => {
        const dayList = Object.entries(cls.schedule || {})
            .filter(([, v]) => v)
            .map(([d]) => d.charAt(0).toUpperCase() + d.slice(1))
            .join(', ');
        return `  • ${cls.name}${cls.subject ? ' (' + cls.subject + ')' : ''}${dayList ? ' — ' + dayList : ''}`;
    });

    const keyTypes = ['first-day','last-day','holiday','break','no-school','grading','conference'];
    // v6.5.0: every key date (was capped at 20, which dropped spring break and
    // the last day on a detailed district calendar), no-school via the single
    // gatekeeper, and events without a start date can't crash the sort.
    const keyEvents = events
        .filter(e => e.startDate && (keyTypes.includes(e.type) || isNoSchoolEvent(e)))
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 60)
        .map(e => {
            const d = new Date(e.startDate + 'T00:00:00');
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endStr = e.endDate && e.endDate !== e.startDate
                ? ' – ' + new Date(e.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '';
            return `  • ${dateStr}${endStr}: ${e.title}`;
        });

    const readable = curriculumDocs.filter(d => d.hasContent && d.content && d.content.length > 50);
    const bySubject = {};
    readable.forEach(doc => {
        const subj = doc.subject || 'other';
        if (!bySubject[subj]) bySubject[subj] = [];
        bySubject[subj].push(doc);
    });

    const pacingBlocks = Object.entries(bySubject).map(([subj, docs]) => {
        const names = docs.map(d => d.name).join(', ');
        // v6.5.0: sample every document in the subject (was the first 1,000
        // characters of the first one only)
        const perDoc = Math.max(600, Math.floor(4000 / docs.length));
        const excerpt = docs.slice(0, 6).map(d => d.content.substring(0, perDoc).replace(/\s+/g, ' ').trim()).join('\n...\n');
        return 'SUBJECT: ' + subj.toUpperCase() + '\nDocuments: ' + names + '\nContent:\n' + excerpt;
    });

    const lessonSamples = classes.slice(0, 6).map(cls => {
        const titles = lessons
            .filter(l => l.classId === cls.id && l.title)
            .slice(0, 8)
            .map(l => l.title);
        if (titles.length === 0) return '';
        return '  ' + cls.name + ': ' + titles.join(' | ');
    }).filter(Boolean);

    const parts = [
        'SCHOOL YEAR: ' + schoolYear,
        '',
        'CLASSES:',
        ...classLines,
        '',
        'KEY SCHOOL EVENTS & BREAKS:',
        ...(keyEvents.length > 0 ? keyEvents : ['  (No events added yet)']),
        '',
        'LESSON SAMPLES:',
        ...lessonSamples,
    ];
    if (pacingBlocks.length > 0) {
        parts.push('', 'PACING DOCUMENTS (primary source — use these for curriculum details):');
        pacingBlocks.forEach((b, i) => {
            parts.push('', '--- Document ' + (i+1) + ' ---');
            parts.push(b);
        });
    } else {
        parts.push('', '(No pacing documents uploaded — using class and lesson data only)');
    }
    return parts.join('\n');
}

async function generateYearNewsletter() {
    const tone = document.getElementById('yn-tone')?.value || 'warm';
    const language = document.getElementById('yn-language')?.value || 'English';
    const includeCurriculum = document.getElementById('yn-include-curriculum')?.checked;
    const includeEvents = document.getElementById('yn-include-events')?.checked;
    const includeGoals = document.getElementById('yn-include-goals')?.checked;
    const extra = document.getElementById('yn-extra')?.value?.trim() || '';

    const schoolYear = settings.schoolYear || '2025-2026';
    const teacherName = aiSettings.teacherName || userProfile.username || 'Your Teacher';
    const grade = aiSettings.grade || '1';
    const context = buildYearNewsletterContext();

    const toneMap = {
        warm: 'warm, welcoming, and encouraging',
        professional: 'professional and informative',
        brief: 'concise with bullet points, under 200 words'
    };

    const sections = [];
    if (includeCurriculum) sections.push('what students will study this year');
    if (includeEvents) sections.push('key dates (first day, breaks, holidays, last day)');
    if (includeGoals) sections.push('main learning goals and skills students will build');

    const prompt = buildNewsletterPrompt({
        teacherName, grade, scopeLabel: `${schoolYear} school year`, toneMap, tone, language,
        context, sections, extra, wordLimit: 400,
        extraGuidance: 'Draw curriculum highlights DIRECTLY from the pacing documents in the data above — use real unit names, topics, and skills rather than generic phrases.'
    });

    await generateNewsletterFromPrompt({
        prompt,
        maxTokens: 2000,
        statusEl: document.getElementById('yn-status'),
        outputArea: document.getElementById('yn-output-area'),
        outputEl: document.getElementById('yn-output'),
        outputLabelEl: document.getElementById('yn-output-label'),
        labelText: `Year newsletter · ${schoolYear}`,
        genBtn: document.getElementById('yn-generate-btn'),
        readyMessage: '📰 Year newsletter ready!',
        saveId: newsletterSaveId('year')
    });
}

function printYearNewsletter() {
    const el = document.getElementById('yn-output');
    const teacherName = aiSettings.teacherName || userProfile.username || 'Teacher';
    const schoolYear = settings.schoolYear || '2025-2026';
    if (!el?.innerHTML.trim()) { showToast('Generate a newsletter first'); return; }

    openNewsletterPrintWindow({
        title: `Year-at-a-Glance · ${schoolYear}`,
        subtitle: '',
        v: '0.5in',
        bodyHtml: el.innerHTML
    });
}


// ============================================
// SCHOOL YEAR TRANSITION SYSTEM
// ============================================
// Runs on login. Detects June 1+ and prompts rollover.
// May 31 = last save day for current year.
// June 1+ = new year prompt until dismissed or acted on.

async function checkSchoolYearTransition() {
    if (!currentUser) return;

    const today = new Date();
    const month = today.getMonth(); // 0-indexed: 5 = June
    const day   = today.getDate();

    // Determine the "end year" of the current school year
    const yearParts = (settings.schoolYear || '2025-2026').split('-');
    const endCalYear = parseInt(yearParts[1]);  // e.g. 2026

    // Only trigger if today is June 1 or later in the end calendar year
    const isPostYear = (today.getFullYear() === endCalYear && month >= 5)  // June+ of end year
                    || (today.getFullYear() > endCalYear);                   // any later year

    if (!isPostYear) return;

    // Check if user already dismissed or switched this cycle
    const dismissKey = 'plany_new_year_dismissed_' + settings.schoolYear;
    const dismissed = localStorage.getItem(dismissKey);
    if (dismissed) return;

    // Calculate the next school year
    const nextYear = endCalYear + '-' + (endCalYear + 1);

    // Populate the new year select
    const sel = document.getElementById('new-year-select');
    if (sel) {
        sel.innerHTML = [nextYear, (endCalYear+1) + '-' + (endCalYear+2)]
            .map(y => `<option value="${y}">${y}</option>`)
            .join('');
        sel.value = nextYear;
    }

    // Show class preview in modal
    const classListEl = document.getElementById('new-year-class-list');
    if (classListEl) {
        if (classes.length === 0) {
            classListEl.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.4rem;">No classes in current year to copy.</p>';
            const copyChk = document.getElementById('new-year-copy-classes');
            if (copyChk) { copyChk.checked = false; copyChk.disabled = true; }
        } else {
            classListEl.innerHTML = classes.map(cls => `
                <div class="new-year-class-chip" style="border-left:3px solid ${cls.color || '#FF6B9D'}">
                    <span class="chip-dot" style="background:${cls.color || '#FF6B9D'}"></span>
                    <span class="chip-name">${escHtml(cls.name)}</span>
                    ${cls.subject ? `<span class="chip-subject">${cls.subject}</span>` : ''}
                </div>
            `).join('');
        }
    }

    // Update heading
    const heading = document.getElementById('new-year-heading');
    const subtext  = document.getElementById('new-year-subtext');
    if (heading) heading.textContent = month === 5 && day === 1
        ? "It's June 1st — New Year Time!"
        : `The ${settings.schoolYear} school year has ended!`;
    if (subtext) subtext.textContent =
        `Your ${settings.schoolYear} data is safely saved and archived. Let's set up ${nextYear}.`;

    document.getElementById('new-year-modal').classList.remove('hidden');
}

function initNewYearModal() {
    document.getElementById('new-year-start-btn')?.addEventListener('click', async () => {
        const sel = document.getElementById('new-year-select');
        const newYear = sel?.value;
        if (!newYear) return;

        const copyClasses = document.getElementById('new-year-copy-classes')?.checked === true;
        const oldYear = settings.schoolYear;
        const classesToCopy = copyClasses ? [...classes] : [];

        // Save dismissal
        localStorage.setItem('plany_new_year_dismissed_' + oldYear, '1');
        document.getElementById('new-year-modal').classList.add('hidden');

        // Switch to new school year
        settings.schoolYear = newYear;
        if (elements.schoolYear) elements.schoolYear.value = newYear;

        try {
            await db.collection('users').doc(currentUser.uid)
                .collection('settings').doc('schoolYear')
                .set(settings, { merge: true });
        } catch(e) { console.warn('Could not save new year setting:', e); }

        showLoading();
        document.querySelector('.loading-text') && (document.querySelector('.loading-text').textContent = 'Setting up new school year...');

        // Copy classes into the new year before loading
        if (classesToCopy.length > 0) {
            try {
                const newYearPath = db.collection('users').doc(currentUser.uid).collection('years').doc(newYear);
                // Check if new year already has classes
                const existingSnap = await newYearPath.collection('classes').limit(1).get();
                if (existingSnap.empty) {
                    for (const cls of classesToCopy) {
                        const { id, ...clsData } = cls;
                        clsData.copiedFromYear = oldYear;
                        clsData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        clsData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                        await newYearPath.collection('classes').add(clsData);
                    }
                    console.log(`Copied ${classesToCopy.length} classes to ${newYear}`);
                }
            } catch(e) {
                console.warn('Could not copy classes:', e);
            }
        }

        await loadSchoolYearData(newYear);
        hideLoading();

        const copiedMsg = classesToCopy.length > 0
            ? ` Copied ${classesToCopy.length} class${classesToCopy.length !== 1 ? 'es' : ''} from ${oldYear}.`
            : '';
        showToast(`🎉 Welcome to ${newYear}!${copiedMsg}`);

        // Go to settings so they can upload new pacing docs
        setTimeout(() => {
            const settingsNav = document.querySelector('[data-view="settings"]');
            if (settingsNav) settingsNav.click();
        }, 800);
    });

    document.getElementById('new-year-dismiss-btn')?.addEventListener('click', () => {
        localStorage.setItem('plany_new_year_dismissed_' + settings.schoolYear, '1');
        document.getElementById('new-year-modal').classList.add('hidden');
    });
}

// May 31 — show end-of-year save reminder banner
function checkEndOfYearReminder() {
    const today = new Date();
    const month = today.getMonth(); // 4 = May
    const day   = today.getDate();
    const yearParts = (settings.schoolYear || '2025-2026').split('-');
    const endCalYear = parseInt(yearParts[1]);

    const isMay31 = today.getFullYear() === endCalYear && month === 4 && day === 31;
    if (!isMay31) return;

    const key = 'plany_may31_banner_' + settings.schoolYear;
    if (localStorage.getItem(key)) return;

    const banner = document.createElement('div');
    banner.id = 'end-of-year-banner';
    banner.innerHTML = `
        <span>📦 Last day of school! Your year data is automatically saved. Export a backup for safekeeping.</span>
        <button onclick="document.getElementById('open-export-modal-btn')?.click(); this.parentElement.remove();">💾 Export Backup</button>
        <button onclick="localStorage.setItem('${key}','1'); this.parentElement.remove();">✕</button>
    `;
    banner.style.cssText = `
        position:fixed; top:0; left:0; right:0; z-index:9999;
        background:linear-gradient(135deg,#FF6B9D,#9D4EDD);
        color:#fff; padding:10px 20px; display:flex; align-items:center;
        justify-content:center; gap:12px; font-size:0.88rem; font-weight:500;
    `;
    banner.querySelectorAll('button').forEach(b => {
        b.style.cssText = 'background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;padding:4px 12px;border-radius:5px;cursor:pointer;';
    });
    document.body.prepend(banner);
}

// Update the school year dropdown to always include current + next 2 years
function updateSchoolYearDropdown() {
    const sel = elements.schoolYear;
    if (!sel) return;
    const today = new Date();
    const cy = today.getFullYear();
    // Generate options for past 1 year through next 2 years
    const years = [];
    for (let y = cy - 1; y <= cy + 2; y++) {
        years.push(`${y}-${y+1}`);
    }
    const current = settings.schoolYear || `${cy}-${cy+1}`;
    sel.innerHTML = years.map(y =>
        `<option value="${y}"${y === current ? ' selected' : ''}>${y}</option>`
    ).join('');
}


// ============================================
// CURRICULUM RESOURCE SHARING SYSTEM
// ============================================

let sharedResourceInbox = [];  // incoming shared curriculum docs
let sharedResourceUnread = 0;

// Open the share-resource modal for a given doc
function openShareResourceModal(docId) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;

    if (friends.length === 0) {
        showToast('Add teacher friends first to share resources');
        return;
    }

    // Populate modal
    document.getElementById('share-resource-doc-name').textContent = doc.name;
    document.getElementById('share-resource-doc-id').value = docId;

    const listEl = document.getElementById('share-resource-friends-list');
    listEl.innerHTML = friends.map(f => `
        <label class="share-friend-option">
            <input type="checkbox" name="share-resource-to" value="${f.uid}">
            <span>${escHtml(f.name || f.email)}</span>
            <span style="color:var(--text-muted);font-size:0.78rem;">(${escHtml(f.email)})</span>
        </label>
    `).join('');

    document.getElementById('share-resource-note').value = '';
    document.getElementById('share-resource-modal').classList.remove('hidden');
}

// Send a shared curriculum resource
async function sendSharedResource() {
    const docId = document.getElementById('share-resource-doc-id').value;
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;

    const selectedUids = Array.from(
        document.querySelectorAll('input[name="share-resource-to"]:checked')
    ).map(cb => cb.value);

    if (selectedUids.length === 0) {
        showToast('Select at least one colleague');
        return;
    }

    const note = document.getElementById('share-resource-note').value.trim();

    showLoading();
    try {
        for (const toUid of selectedUids) {
            const friend = friends.find(f => f.uid === toUid);
            await db.collection('sharedCurriculum').add({
                fromUid:   currentUser.uid,
                fromEmail: currentUser.email,
                fromName:  userProfile.username || currentUser.displayName || currentUser.email,
                toUid,
                toEmail:   friend?.email || '',
                resource: {
                    name:         doc.name,
                    subject:      doc.subject,
                    resourceType: doc.resourceType,
                    description:  doc.description || '',
                    fileType:     doc.fileType,
                    size:         doc.size,
                    content:      doc.content || '',
                    hasContent:   doc.hasContent || false,
                    // v6.4.0: include the file's download link so a shared PDF
                    // also works in the recipient's page picker
                    storageUrl:   doc.storageUrl || null,
                },
                note,
                read: false,
                sharedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        document.getElementById('share-resource-modal').classList.add('hidden');
        showToast(`📤 Shared with ${selectedUids.length} colleague${selectedUids.length !== 1 ? 's' : ''}!`);
    } catch (e) {
        console.error('Share resource error:', e);
        showToast('❌ Could not share resource');
    }
    hideLoading();
}

// Listen for incoming shared resources in real-time
function listenForSharedResources() {
    if (!currentUser) return;
    _liveUnsubs.push(db.collection('sharedCurriculum')
        .where('toUid', '==', currentUser.uid)
        .orderBy('sharedAt', 'desc')
        .limit(30)
        .onSnapshot(snap => {
            sharedResourceInbox = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            sharedResourceUnread = sharedResourceInbox.filter(r => !r.read).length;
            renderSharedResourceInbox();
            updateResourceInboxBadge();
        }, _liveErr('shared resources')));
}

function updateResourceInboxBadge() {
    const badge = document.getElementById('shared-resource-badge');
    if (!badge) return;
    if (sharedResourceUnread > 0) {
        badge.textContent = sharedResourceUnread;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function renderSharedResourceInbox() {
    const container = document.getElementById('shared-resource-inbox-list');
    if (!container) return;

    if (sharedResourceInbox.length === 0) {
        container.innerHTML = '<p class="empty-state" style="font-size:0.85rem;">No shared resources yet. When a colleague shares a resource with you, it will appear here.</p>';
        return;
    }

    const subjectIcons = { math:'📐', ela:'📖', phonics:'🔤', science:'🔬', social:'🌍', other:'📁' };

    container.innerHTML = sharedResourceInbox.map(item => `
        <div class="shared-resource-item ${item.read ? '' : 'unread'}" data-id="${item.id}">
            <div class="shared-resource-header">
                <span class="shared-resource-icon">${subjectIcons[item.resource?.subject] || '📄'}</span>
                <div class="shared-resource-info">
                    <div class="shared-resource-name">${item.read ? '' : '<span class="unread-dot">●</span> '}<strong>${escHtml(item.resource?.name || 'Resource')}</strong></div>
                    <div class="shared-resource-meta">
                        From <strong>${escHtml(item.fromName)}</strong>
                        · ${escHtml(item.resource?.subject || 'other')} · ${formatFileSize(item.resource?.size || 0)}
                        ${item.resource?.hasContent ? '<span style="color:var(--success-color);font-size:12px;"> ✅ AI-readable</span>' : ''}
                    </div>
                    ${item.note ? `<div class="shared-resource-note">"${escHtml(item.note)}"</div>` : ''}
                </div>
            </div>
            <div class="shared-resource-actions">
                <button class="btn btn-sm btn-primary" onclick="importSharedResource('${item.id}')">
                    ⬇️ Add to My Library
                </button>
                <button class="btn btn-sm btn-ghost" onclick="dismissSharedResource('${item.id}')">✕</button>
            </div>
        </div>
    `).join('');
}

async function importSharedResource(itemId) {
    const item = sharedResourceInbox.find(r => r.id === itemId);
    if (!item) return;

    // Check duplicate by name
    const exists = curriculumDocs.find(d => d.name === item.resource.name);
    if (exists) {
        if (!await planyConfirm(`"${item.resource.name}" is already in your library. Add a copy anyway?`)) return;
    }

    showLoading();
    try {
        // v6.4.0: copy only known fields. Spreading the sender's object let
        // them set anything (including a storagePath pointing at their files).
        const r = item.resource || {};
        const url = typeof r.storageUrl === 'string' && /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/plany-waugs\.firebasestorage\.app\//.test(r.storageUrl) ? r.storageUrl : null;
        const docData = {
            name:         String(r.name || 'Shared resource').slice(0, 200),
            subject:      String(r.subject || 'other').slice(0, 40),
            resourceType: String(r.resourceType || '').slice(0, 40),
            description:  String(r.description || '').slice(0, 2000),
            fileType:     String(r.fileType || '').slice(0, 100),
            size:         Number(r.size) || 0,
            content:      typeof r.content === 'string' ? r.content : '',
            hasContent:   !!r.hasContent,
            storageUrl:   url,
            sharedBy:   item.fromName,
            sharedFrom: item.fromEmail,
            uploadedAt: new Date().toISOString()
        };
        const docRef = await db.collection('users').doc(currentUser.uid)
            .collection('curriculum').add(docData);
        curriculumDocs.unshift({ id: docRef.id, ...docData });

        // Mark as read
        await db.collection('sharedCurriculum').doc(itemId).update({ read: true });

        renderCurriculumLibrary(
            document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all'
        );
        renderSharedResourceInbox();
        showToast(`✅ "${item.resource.name}" added to your Curriculum Library!`);
    } catch (e) {
        console.error('Import shared resource error:', e);
        showToast('❌ Could not import resource');
    }
    hideLoading();
}

// v6.5.0: ✕ removes the item from your inbox (it only marked it read before)
async function dismissSharedResource(itemId) {
    try {
        await db.collection('sharedCurriculum').doc(itemId).delete();
        sharedResourceInbox = sharedResourceInbox.filter(r => r.id !== itemId);
        sharedResourceUnread = sharedResourceInbox.filter(r => !r.read).length;
        renderSharedResourceInbox();
        updateResourceInboxBadge();
    } catch(e) { console.warn('dismiss error:', e); showToast('Could not remove it. Try again.'); }
}

function initCurriculumSharing() {
    // Share form submit
    document.getElementById('share-resource-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await sendSharedResource();
    });

    // Live listener starts from startLiveListeners() (v6.4.0)
    startLiveListeners();
}

// ── AI Settings (API key only — grade + teacher name live in user profile) ──
// ── AI Settings (Provider + API key — grade + teacher name live in user profile) ──
function loadAiSettings() {
    try {
        const providerEl = document.getElementById('ai-provider-select');
        const keyEl      = document.getElementById('ai-api-key');
        const saveBtn    = document.getElementById('save-ai-settings-btn');
        const toggleBtn  = document.getElementById('toggle-api-key-vis');
        const statusEl   = document.getElementById('api-key-status');
        const linkEl     = document.getElementById('ai-key-signup-link');

        const applyProviderUI = () => {
            const provider = AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic;
            if (keyEl) keyEl.placeholder = provider.keyPlaceholder;
            if (linkEl) {
                linkEl.href = provider.signupUrl;
                linkEl.textContent = provider.signupUrl.replace(/^https?:\/\//, '');
            }
        };

        if (providerEl) providerEl.value = aiSettings.provider;
        applyProviderUI();
        if (keyEl) keyEl.value = aiSettings.apiKey;

        const updateKeyStatus = () => {
            if (!statusEl) return;
            const provider = AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic;
            const val = keyEl?.value?.trim() || aiSettings.apiKey || '';
            if (val && provider.keyLooksValid(val)) {
                statusEl.textContent = '✅';
                statusEl.title = 'API key saved';
            } else if (val) {
                statusEl.textContent = '⚠️';
                statusEl.title = `Key doesn't look like a valid ${provider.label} key`;
            } else {
                statusEl.textContent = '🔴';
                statusEl.title = 'No API key — AI features disabled';
            }
        };
        updateKeyStatus();
        window._refreshAiKeyStatus = updateKeyStatus;
        let keyTyped = false;
        keyEl?.addEventListener('input', (e) => { if (e.isTrusted && e.inputType) keyTyped = true; updateKeyStatus(); });
        // Password managers autofill this field shortly after load (it's
        // type="password"). Undo that unless the user is actually typing.
        [300, 1000, 2500].forEach(ms => setTimeout(() => {
            if (!keyEl || keyTyped) return;
            if (keyEl.value !== aiSettings.apiKey) { keyEl.value = aiSettings.apiKey; updateKeyStatus(); }
        }, ms));

        providerEl?.addEventListener('change', () => {
            aiSettings.provider = providerEl.value;
            applyProviderUI();
            if (keyEl) keyEl.value = aiSettings.apiKey; // show that provider's own saved key, if any
            updateKeyStatus();
            applyAiFeatureGating();
        });

        saveBtn?.addEventListener('click', () => {
            const typed = keyEl ? keyEl.value.trim() : '';
            if (typed && !aiKeyLooksValid(aiSettings.provider, typed)) {
                const provider = AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic;
                showToast(`⚠️ That doesn't look like a ${provider.label} key — not saved. (If your browser autofilled a password here, clear it and paste your key.)`);
                if (keyEl) keyEl.value = aiSettings.apiKey;
                updateKeyStatus();
                return;
            }
            if (keyEl) aiSettings.apiKey = typed;
            updateKeyStatus();
            updateYearChecklist();
            syncMySharedKeyDoc();
            applyAiFeatureGating();
            const msg = document.getElementById('ai-settings-saved-msg');
            if (msg) { msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2500); }
        });

        toggleBtn?.addEventListener('click', () => {
            if (keyEl) keyEl.type = keyEl.type === 'password' ? 'text' : 'password';
        });

        // Share-my-key panel
        document.getElementById('key-share-grant-btn')?.addEventListener('click', grantKeyAccess);
        document.getElementById('key-share-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); grantKeyAccess(); }
        });
        loadMyKeyGrants();

        applyAiFeatureGating();
    } catch(e) { console.warn('loadAiSettings:', e.message); }
}

// ── Refresh #ai-fill-class dropdown with current classes ─────────────────
function refreshAiFillClassDropdown() {
    const sel = document.getElementById('ai-fill-class');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">-- All Classes --</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls.id;
        opt.textContent = cls.name;
        sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
}

// ── AI Lesson Fill initialisation ─────────────────────────────────────────
let _aiFillAbort = false;

function initAiLessonFill() {
    const previewBtn = document.getElementById('ai-fill-preview-btn');
    const runBtn     = document.getElementById('ai-fill-run-btn');
    const stopBtn    = document.getElementById('ai-fill-stop-btn');
    const statusEl   = document.getElementById('ai-fill-status');

    if (!previewBtn) return;

    previewBtn.addEventListener('click', () => {
        const startVal = document.getElementById('ai-fill-start')?.value;
        const endVal   = document.getElementById('ai-fill-end')?.value;
        if (!startVal || !endVal) { showToast('Please set a start and end date.'); return; }
        if (startVal > endVal)    { showToast('Start date must be before end date.'); return; }

        const classId = document.getElementById('ai-fill-class')?.value || '';
        const skipExisting = document.getElementById('ai-fill-skip-existing')?.checked ?? true;

        // Collect school days in range
        const days = [];
        let cur = new Date(startVal + 'T00:00:00');
        const end = new Date(endVal   + 'T00:00:00');
        while (cur <= end) {
            const dateStr = formatDate(cur);
            const dow = ['sun','mon','tue','wed','thu','fri','sat'][cur.getDay()];
            const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
            if (!isWeekend && !isOffDay(dateStr)) {
                const dayClasses = classId
                    ? classes.filter(c => c.id === classId && c.schedule?.[dow] && isClassActiveOnDate(c, dateStr))
                    : classes.filter(c => c.schedule?.[dow] && isClassActiveOnDate(c, dateStr));
                dayClasses.forEach(cls => {
                    if (skipExisting && lessons.find(l => l.date === dateStr && l.classId === cls.id)) return;
                    days.push({ date: dateStr, cls });
                });
            }
            cur.setDate(cur.getDate() + 1);
        }

        if (days.length === 0) {
            statusEl.innerHTML = '<p style="color:var(--text-secondary)">No eligible lesson slots found in that range.</p>';
            runBtn.disabled = true;
            return;
        }

        statusEl.innerHTML = `<p style="color:var(--text-secondary)">Found <strong>${days.length}</strong> lesson slot${days.length !== 1 ? 's' : ''} to fill across ${[...new Set(days.map(d => d.date))].length} school day${[...new Set(days.map(d => d.date))].length !== 1 ? 's' : ''}.</p>`;
        runBtn.disabled = false;
        runBtn._fillDays = days;
    });

    runBtn.addEventListener('click', async () => {
        const days = runBtn._fillDays;
        if (!days?.length) return;
        if (!hasEffectiveAiKey()) { showToast(`Please save your ${(AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic).label} API key in AI Settings first.`); return; }

        const context = document.getElementById('ai-fill-context')?.value.trim() || '';
        const grade   = localStorage.getItem('ai_packet_grade') || '1';

        runBtn.classList.add('hidden');
        previewBtn.disabled = true;
        stopBtn.classList.remove('hidden');
        _aiFillAbort = false;

        let done = 0;
        statusEl.innerHTML = `<p>Filling lessons… <span id="ai-fill-progress">0 / ${days.length}</span></p><div id="ai-fill-log" style="margin-top:0.5rem;font-size:0.8rem;max-height:200px;overflow-y:auto;"></div>`;
        const progressEl = document.getElementById('ai-fill-progress');
        const logEl = document.getElementById('ai-fill-log');

        for (const { date, cls } of days) {
            if (_aiFillAbort) break;

            const prompt = `You are a Grade ${grade} teacher. Write a short lesson plan for ${cls.name} (${cls.subject || cls.name}) on ${date}. ${context ? 'Context: ' + context : ''}\nRespond with JSON only:\n{"title":"...","objective":"...","materials":"...","activities":"...","standards":""}`;

            try {
                const text = (await callAIText({ prompt, tier: 'fast', maxTokens: 512 })) || '{}';

                const clean = text.replace(/```json|```/g, '').trim();
                const parsed = JSON.parse(clean);

                // Save lesson to Firestore
                const lessonData = {
                    date, classId: cls.id, className: cls.name,
                    title: parsed.title || '',
                    // v6.2.0: the lesson form shows learningTarget; "objective"
                    // was saved but never displayed.
                    learningTarget: parsed.objective || '',
                    materials: parsed.materials || '',
                    activities: parsed.activities || '',
                    standards: parsed.standards || '',
                    slotIndex: 0,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                const yearPath = getYearPath();
                const existing = lessons.find(l => l.date === date && l.classId === cls.id);
                if (existing) {
                    await yearPath.collection('lessons').doc(existing.id).update(lessonData);
                    Object.assign(existing, lessonData);
                } else {
                    const ref = await yearPath.collection('lessons').add(lessonData);
                    lessons.push({ id: ref.id, ...lessonData });
                }

                done++;
                if (progressEl) progressEl.textContent = `${done} / ${days.length}`;
                if (logEl) logEl.innerHTML += `<div style="color:var(--success-color,#2ecc71)">✓ ${date} — ${escHtml(cls.name)}: ${escHtml(parsed.title || '(untitled)')}</div>`;
            } catch(e) {
                if (logEl) logEl.innerHTML += `<div style="color:var(--error-color,#e74c3c)">✗ ${date} — ${escHtml(cls.name)}: ${escHtml(e.message)}</div>`;
            }
        }

        renderCalendar(); renderWeek();
        stopBtn.classList.add('hidden');
        runBtn.classList.remove('hidden');
        previewBtn.disabled = false;
        statusEl.innerHTML += `<p style="margin-top:0.5rem;font-weight:600;">Done! Filled ${done} lesson${done !== 1 ? 's' : ''}.</p>`;
    });

    stopBtn.addEventListener('click', () => { _aiFillAbort = true; });
}

// ── Classroom Technology Tools ─────────────────────────────────────────────
async function loadTechTools() {
    if (!currentUser) return;
    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('techTools').get();
        techTools = doc.exists ? (doc.data().tools || []) : [];
    } catch(e) {
        console.warn('loadTechTools:', e.message);
        techTools = [];
    }
    renderTechToolsList();
}

async function saveTechTools() {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('techTools')
            .set({ tools: techTools }, { merge: true });
    } catch(e) {
        console.error('saveTechTools:', e);
        showToast('Error saving tech tools');
    }
}

function renderTechToolsList() {
    const list = document.getElementById('tech-tools-list');
    if (!list) return;
    if (techTools.length === 0) {
        list.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);">No tools added yet.</p>';
        return;
    }
    const deviceIcons = { iPad:'📱', Chromebook:'💻', laptop:'🖥️', desktop:'🖥️', smartboard:'📺', other:'📡' };
    list.innerHTML = techTools.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:6px;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.85rem;font-weight:600;">${deviceIcons[t.device]||'💻'} ${escHtml(t.name)}</div>
                ${t.notes ? `<div style="font-size:0.72rem;color:var(--text-secondary);margin-top:2px;">${escHtml(t.notes)}</div>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" style="flex-shrink:0;color:var(--text-muted);" onclick="removeTechTool('${t.id}')">✕</button>
        </div>`).join('');
}

async function addTechTool() {
    const device  = document.getElementById('tech-device-type')?.value || 'other';
    const name    = document.getElementById('tech-app-name')?.value.trim();
    const subject = document.getElementById('tech-app-subject')?.value || 'general';
    const notes   = document.getElementById('tech-app-notes')?.value.trim() || '';
    if (!name) { showToast('Please enter an app or website name'); return; }

    techTools.push({
        id: 'tt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        device, name, subject, notes
    });
    await saveTechTools();
    renderTechToolsList();

    // Clear inputs
    const nameEl = document.getElementById('tech-app-name');
    const notesEl = document.getElementById('tech-app-notes');
    if (nameEl) nameEl.value = '';
    if (notesEl) notesEl.value = '';
    showToast('✅ Tool added');
}

async function removeTechTool(id) {
    techTools = techTools.filter(t => t.id !== id);
    await saveTechTools();
    renderTechToolsList();
}

function initTechTools() {
    document.getElementById('add-tech-tool-btn')?.addEventListener('click', addTechTool);
    loadTechTools();
}

// Check for OAuth callback (Microsoft) before anything else
initOAuthCallback();

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            initUserProfile();
            initCurriculumLibrary();
            initFriendsSystem();
            initSmartImport();
            initKeyboardShortcuts();
            initGlobalSearch();
            initUndoSystem();
            initDataExport();
            initOfflineIndicator();
            initPhase2Features();
            loadAiSettings();
            initTechTools();
            initAiLessonFill();
            initNewsletterSystem();
            initYearNewsletter();
            initNewYearModal();
            updateSchoolYearDropdown();
            initCurriculumSharing();
            console.log('All init functions completed successfully');
        } catch (error) {
            console.error('Error during initialization:', error);
        }
    }, 1000);
});

// Re-init when user logs in
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        setTimeout(() => {
            loadUserProfile();
            loadCurriculumDocs();
            loadFriendsData();
        }, 500);
    }
});

// ============================================
// PHASE 1: KEYBOARD SHORTCUTS
// ============================================

function initKeyboardShortcuts() {
    document.addEventListener('keydown', handleKeyboardShortcut);
    
    // Keyboard help button
    document.getElementById('keyboard-help-btn')?.addEventListener('click', () => {
        document.getElementById('keyboard-modal')?.classList.remove('hidden');
    });
}

function handleKeyboardShortcut(e) {
    // Don't trigger shortcuts when typing in inputs
    const activeEl = document.activeElement;
    const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;
    
    // Allow Escape and Ctrl+K even in inputs. A modal already handled
    // this Escape above (top-most only); otherwise close any open pickers.
    if (e.key === 'Escape') {
        if (!e._planyModalHandled && !document.querySelector('.modal:not(.hidden)')) closeAllModals();
        return;
    }
    
    // Ctrl/Cmd + K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearchModal();
        return;
    }
    
    // Don't process other shortcuts if in input. (v6.0.2: this now comes
    // BEFORE undo/redo, so Ctrl+Z in a text box undoes your typing instead
    // of reverting a lesson change in the database.)
    if (isInput) return;

    const _k = (e.key || '').toLowerCase();
    if (typeof _previewTeacher !== 'undefined' && _previewTeacher && (e.ctrlKey || e.metaKey) && (_k === 'z' || _k === 'y')) return;
    // Ctrl/Cmd + Z for undo
    if ((e.ctrlKey || e.metaKey) && _k === 'z' && !e.shiftKey) {
        e.preventDefault();
        performUndo();
        return;
    }
    
    // Ctrl/Cmd + Y or Ctrl+Shift+Z for redo
    if ((e.ctrlKey || e.metaKey) && (_k === 'y' || (_k === 'z' && e.shiftKey))) {
        e.preventDefault();
        performRedo();
        return;
    }
    
    // ? for help
    if (e.key === '?') {
        document.getElementById('keyboard-modal')?.classList.remove('hidden');
        return;
    }
    
    // v6.5.0: while a principal previews a teacher's Plany (read-only),
    // the create shortcuts would have saved into the principal's own account.
    const _sk = (e.key || '').toLowerCase();
    if (typeof _previewTeacher !== 'undefined' && _previewTeacher && ['n', 'e', 'c'].includes(_sk) && !e.ctrlKey && !e.metaKey) return;

    // Navigation shortcuts. Guard against e.key being unset -- some
    // synthetic/IME key events reach this handler without a populated key.
    switch (_sk) {
        case 't':
            // Go to today
            goToToday();
            break;
        case 'n':
            // New lesson
            e.preventDefault();
            openLessonModal();
            break;
        case 'e':
            // New event
            e.preventDefault();
            openEventModal();
            break;
        case 'c':
            // New class (only if not Ctrl+C)
            if (!e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                openClassModal();
            }
            break;
        case 'arrowleft':
            navigatePrevious();
            break;
        case 'arrowright':
            navigateNext();
            break;
        case '1':
            switchView('year');
            break;
        case '2':
            switchView('calendar');
            break;
        case '3':
            switchView('week');
            break;
        case '4':
            switchView('classes');
            break;
        case '5':
            switchView('day');
            break;
        case '6':
            switchView('settings');
            break;
    }
}

// Move every view to one date -- all three anchors together.
function jumpToDate(d) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    currentDate      = new Date(day);
    currentDayDate   = new Date(day);
    currentWeekStart = getWeekStart(new Date(day));
}

// Re-render whichever view is showing, plus month/week which other code reads.
function renderAfterJump() {
    renderCalendar();
    renderWeek();
    const active = document.querySelector('.view.active')?.id;
    if (active === 'day-view' && typeof renderDayView === 'function') renderDayView();
    if (active === 'year-view' && typeof renderYearView === 'function') renderYearView();
}

function goToToday() {
    jumpToDate(new Date());
    renderAfterJump();                       // v6.2.0: Day/Year view redraw too
    showToast('📅 Jumped to today');
}

function navigatePrevious() {
    const currentView = document.querySelector('.view.active')?.id;
    if (currentView === 'calendar-view' || currentView === 'year-view') {
        document.getElementById('prev-month')?.click();
    } else if (currentView === 'week-view') {
        document.getElementById('prev-week')?.click();
    } else if (currentView === 'day-view') {
        document.getElementById('prev-day-btn')?.click();
    }
}

function navigateNext() {
    const currentView = document.querySelector('.view.active')?.id;
    if (currentView === 'calendar-view' || currentView === 'year-view') {
        document.getElementById('next-month')?.click();
    } else if (currentView === 'week-view') {
        document.getElementById('next-week')?.click();
    } else if (currentView === 'day-view') {
        document.getElementById('next-day-btn')?.click();
    }
}

function switchView(viewName) {
    const navItem = document.querySelector(`[data-view="${viewName}"]`);
    if (navItem) {
        navItem.click();
    }
}

// ============================================
// PHASE 1: GLOBAL SEARCH
// ============================================

let searchDebounceTimer = null;

function initGlobalSearch() {
    // Header search input
    const headerSearch = document.getElementById('global-search-input');
    headerSearch?.addEventListener('focus', openSearchModal);
    headerSearch?.addEventListener('click', openSearchModal);
    
    // Modal search input
    const modalSearch = document.getElementById('search-modal-input');
    modalSearch?.addEventListener('input', handleSearchInput);
    
    // Search filters
    document.querySelectorAll('#search-lessons, #search-events, #search-classes').forEach(cb => {
        cb.addEventListener('change', () => performSearch(modalSearch?.value));
    });
    
    // Date filters
    document.getElementById('search-date-from')?.addEventListener('change', () => performSearch(modalSearch?.value));
    document.getElementById('search-date-to')?.addEventListener('change', () => performSearch(modalSearch?.value));
}

function openSearchModal() {
    const modal = document.getElementById('search-modal');
    modal?.classList.remove('hidden');
    
    setTimeout(() => {
        document.getElementById('search-modal-input')?.focus();
    }, 100);
}

function handleSearchInput(e) {
    const query = e.target.value;
    
    // Debounce search
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        performSearch(query);
    }, 200);
}

function performSearch(query) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    if (!query || query.trim().length < 2) {
        resultsContainer.innerHTML = '<p class="search-hint">Start typing to search...</p>';
        return;
    }
    
    const searchLessons = document.getElementById('search-lessons')?.checked ?? true;
    const searchEvents = document.getElementById('search-events')?.checked ?? true;
    const searchClasses = document.getElementById('search-classes')?.checked ?? true;
    
    const dateFrom = document.getElementById('search-date-from')?.value;
    const dateTo = document.getElementById('search-date-to')?.value;
    
    const queryLower = query.toLowerCase();
    const results = [];
    
    // Debug logging
    console.log('Search debug:', {
        query: queryLower,
        searchLessons,
        searchEvents, 
        searchClasses,
        lessonsCount: lessons.length,
        eventsCount: events.length,
        classesCount: classes.length
    });
    
    // Search lessons
    if (searchLessons && lessons.length > 0) {
        lessons.forEach(lesson => {
            if (matchesDateFilter(lesson.date, dateFrom, dateTo) && matchesQuery(lesson, queryLower, ['title', 'subject', 'standards', 'flow', 'materials', 'activities'])) {
                const cls = classes.find(c => c.id === lesson.classId);
                results.push({
                    type: 'lesson',
                    icon: '📝',
                    title: lesson.title,
                    meta: `${formatDisplayDate(new Date(lesson.date + 'T00:00:00'))} • ${cls?.name || 'No class'}`,
                    data: lesson,
                    score: getSearchScore(lesson, queryLower, ['title', 'subject'])
                });
            }
        });
    }
    
    // Search events
    if (searchEvents && events.length > 0) {
        events.forEach(event => {
            if (matchesDateFilter(event.startDate, dateFrom, dateTo) && matchesQuery(event, queryLower, ['title', 'description'])) {
                const startDateObj = new Date(event.startDate + 'T00:00:00');
                const endDateObj = event.endDate ? new Date(event.endDate + 'T00:00:00') : null;
                results.push({
                    type: 'event',
                    icon: getEventIcon(event.type),
                    title: event.title,
                    meta: formatDisplayDate(startDateObj) + (endDateObj && event.endDate !== event.startDate ? ` - ${formatDisplayDate(endDateObj)}` : ''),
                    data: event,
                    score: getSearchScore(event, queryLower, ['title'])
                });
            }
        });
    }
    
    // Search classes
    if (searchClasses) {
        classes.forEach(cls => {
            if (matchesQuery(cls, queryLower, ['name', 'subject'])) {
                results.push({
                    type: 'class',
                    icon: '🎓',
                    title: cls.name,
                    meta: cls.subject || 'No subject',
                    data: cls,
                    score: getSearchScore(cls, queryLower, ['name'])
                });
            }
        });
    }
    
    // Sort by score (higher is better)
    results.sort((a, b) => b.score - a.score);
    
    // Render results
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="search-no-results">No results found</div>';
    } else {
        resultsContainer.innerHTML = results.slice(0, 50).map(result => `
            <div class="search-result-item" onclick="handleSearchResultClick('${result.type}', '${result.data.id}')">
                <span class="search-result-icon">${result.icon}</span>
                <div class="search-result-content">
                    <div class="search-result-title">${highlightMatch(result.title, query)}</div>
                    <div class="search-result-meta">${result.meta}</div>
                </div>
                <span class="search-result-type">${result.type}</span>
            </div>
        `).join('');
    }
}

function matchesQuery(obj, query, fields) {
    return fields.some(field => {
        const value = obj[field];
        return value && value.toString().toLowerCase().includes(query);
    });
}

function matchesDateFilter(date, from, to) {
    if (!date) return true;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
}

function getSearchScore(obj, query, priorityFields) {
    let score = 0;
    priorityFields.forEach((field, index) => {
        const value = obj[field];
        if (value && value.toString().toLowerCase().includes(query)) {
            score += (priorityFields.length - index) * 10;
            if (value.toString().toLowerCase().startsWith(query)) {
                score += 20;
            }
        }
    });
    return score;
}

function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="search-result-highlight">$1</span>');
}

function getEventIcon(type) {
    const icons = {
        'first-day': '🎉',
        'last-day': '🏁',
        'break': '🏖️',
        'holiday': '🎄',
        'grading': '📊',
        'conference': '👥',
        'professional': '📚',
        'event': '📌'
    };
    return icons[type] || '📌';
}

function handleSearchResultClick(type, id) {
    closeAllModals();
    
    if (type === 'lesson') {
        const lesson = lessons.find(l => l.id === id);
        if (lesson) {
            // Local-midnight parse (plain new Date('YYYY-MM-DD') is UTC and
            // lands on the previous day in Arizona) + all three anchors.
            jumpToDate(new Date(lesson.date + 'T00:00:00'));
            renderAfterJump();
            setTimeout(() => openLessonModal(lesson), 200);
        }
    } else if (type === 'event') {
        const event = events.find(e => e.id === id);
        if (event) {
            jumpToDate(new Date(event.startDate + 'T00:00:00'));
            renderAfterJump();
            setTimeout(() => openEventModal(event), 200);
        }
    } else if (type === 'class') {
        switchView('classes');
        const cls = classes.find(c => c.id === id);
        if (cls) {
            setTimeout(() => openClassModal(cls), 200);
        }
    }
}

// ============================================
// PHASE 1: UNDO/REDO SYSTEM
// ============================================

const undoStack = [];
const redoStack = [];
const MAX_UNDO_STACK = 50;
let undoToastTimer = null;

function initUndoSystem() {
    // Nothing to initialize, actions will call recordAction()
}

function recordAction(action) {
    // action = { type: 'delete_lesson', data: {...}, restore: async function }
    undoStack.push(action);
    if (undoStack.length > MAX_UNDO_STACK) {
        undoStack.shift();
    }
    // Clear redo stack when new action is performed
    redoStack.length = 0;
    
    // Show undo toast
    showUndoToast(action);
}

function showUndoToast(action) {
    const toast = document.getElementById('undo-toast');
    const message = document.getElementById('undo-message');
    
    if (!toast || !message) return;
    
    const messages = {
        'delete_lesson': 'Lesson deleted',
        'delete_event': 'Event deleted',
        'delete_class': 'Class deleted',
        'update_lesson': 'Lesson updated',
        'update_event': 'Event updated',
        'create_lesson': 'Lesson created',
        'create_event': 'Event created',
        'move_lesson': 'Lesson moved',
        'copy_lesson': 'Lesson copied'
    };
    
    message.textContent = messages[action.type] || 'Action completed';
    toast.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    clearTimeout(undoToastTimer);
    undoToastTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, 5000);
    
    // Undo button handler
    document.getElementById('undo-btn').onclick = () => {
        performUndo();
        toast.classList.add('hidden');
    };
    
    // Dismiss button
    document.getElementById('undo-dismiss').onclick = () => {
        toast.classList.add('hidden');
    };
}

async function performUndo() {
    if (undoStack.length === 0) {
        showToast('Nothing to undo');
        return;
    }
    
    const action = undoStack.pop();
    
    try {
        await action.restore();
        redoStack.push(action);
        showToast('↩️ Undone');
    } catch (error) {
        console.error('Undo failed:', error);
        showToast('Undo failed');
        undoStack.push(action); // Put it back
    }
}

async function performRedo() {
    if (redoStack.length === 0) {
        showToast('Nothing to redo');
        return;
    }
    
    const action = redoStack.pop();
    
    try {
        await action.redo();
        undoStack.push(action);
        showToast('↪️ Redone');
    } catch (error) {
        console.error('Redo failed:', error);
        showToast('Redo failed');
        redoStack.push(action);
    }
}

// ============================================
// PHASE 1: DATA EXPORT/IMPORT
// ============================================

function initDataExport() {
    document.getElementById('open-export-modal-btn')?.addEventListener('click', () => {
        document.getElementById('export-modal')?.classList.remove('hidden');
    });
    
    document.getElementById('export-data-btn')?.addEventListener('click', exportData);
    
    document.getElementById('import-data-btn')?.addEventListener('click', () => {
        document.getElementById('import-file-input')?.click();
    });
    
    document.getElementById('import-file-input')?.addEventListener('change', handleImportFile);
}

async function exportData() {
    if (!currentUser) {
        showToast('Please log in first');
        return;
    }
    
    showLoading();
    
    try {
        const exportObj = {
            version: '4.9.14',
            exportDate: new Date().toISOString(),
            userId: currentUser.uid,
            userEmail: currentUser.email
        };
        
        if (document.getElementById('export-lessons')?.checked) {
            exportObj.lessons = lessons;
        }
        
        if (document.getElementById('export-classes')?.checked) {
            exportObj.classes = classes;
        }
        
        if (document.getElementById('export-events')?.checked) {
            exportObj.events = events;
        }
        
        if (document.getElementById('export-settings')?.checked) {
            exportObj.settings = settings;
        }
        
        if (document.getElementById('export-curriculum')?.checked) {
            exportObj.curriculum = curriculumDocs;
        }
        
        // Create and download file
        const dataStr = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `plany-backup-${formatDate(new Date())}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('✅ Backup downloaded!');
        document.getElementById('export-modal')?.classList.add('hidden');
        
    } catch (error) {
        console.error('Export failed:', error);
        showToast('Export failed');
    }
    
    hideLoading();
}

async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
        showToast('Please select a JSON backup file');
        return;
    }
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.version) {
            showToast('Invalid backup file');
            return;
        }
        
        if (!await planyConfirm(`Import backup from ${data.exportDate?.split('T')[0] || 'unknown date'}?\n\nThis will add to your existing data.`)) {
            return;
        }
        
        await importData(data);
        
    } catch (error) {
        console.error('Import error:', error);
        showToast('Failed to read backup file');
    }
    
    e.target.value = '';
}

async function importData(data) {
    if (!currentUser) return;
    
    showLoading();
    let imported = { lessons: 0, classes: 0, events: 0 };
    // v6.0.2: everything is written under the CURRENT school year
    // (users/{uid}/years/{year}/...), which is where the app reads from.
    // Before this, import wrote to the pre-v5 top-level paths, so a restore
    // reported success and then vanished on reload.
    const yearPath = getYearPath();
    const classIdMap = {};   // backup's class id -> id in this account

    try {
        // Import classes first (lessons depend on them)
        if (data.classes && Array.isArray(data.classes)) {
            for (const cls of data.classes) {
                // Check if class with same name exists
                const existing = classes.find(c => c.name === cls.name);
                if (existing) {
                    if (cls.id) classIdMap[cls.id] = existing.id;
                } else {
                    const { id, ...clsData } = cls;
                    const docRef = await yearPath
                        .collection('classes').add({
                            ...clsData,
                            importedAt: new Date().toISOString()
                        });
                    classes.push({ id: docRef.id, ...clsData });
                    if (id) classIdMap[id] = docRef.id;
                    imported.classes++;
                }
            }
        }
        
        // Import lessons
        if (data.lessons && Array.isArray(data.lessons)) {
            for (const lesson of data.lessons) {
                const { id, ...lessonData } = lesson;
                // Point the lesson at this account's copy of its class.
                if (lessonData.classId && classIdMap[lessonData.classId]) {
                    lessonData.classId = classIdMap[lessonData.classId];
                }
                // Check for duplicate (same class + title + date)
                const existing = lessons.find(l => l.title === lessonData.title && l.date === lessonData.date &&
                    (l.classId || null) === (lessonData.classId || null));
                if (!existing) {
                    const docRef = await yearPath
                        .collection('lessons').add({
                            ...lessonData,
                            importedAt: new Date().toISOString()
                        });
                    lessons.push({ id: docRef.id, ...lessonData });
                    imported.lessons++;
                }
            }
        }
        
        // Import events
        if (data.events && Array.isArray(data.events)) {
            for (const event of data.events) {
                const existing = events.find(e => e.title === event.title && e.startDate === event.startDate);
                if (!existing) {
                    const { id, ...eventData } = event;
                    const docRef = await yearPath
                        .collection('events').add({
                            ...eventData,
                            importedAt: new Date().toISOString()
                        });
                    events.push({ id: docRef.id, ...eventData });
                    imported.events++;
                }
            }
        }
        
        // Import settings
        if (data.settings) {
            // Never let a backup switch the active school year out from under
            // the data that's loaded -- that would point later saves at
            // another year.
            const { schoolYear: _ignoredYear, ...importedSettings } = data.settings;
            settings = { ...settings, ...importedSettings };
            // Save merged settings to Firestore
            if (currentUser) {
                try {
                    await db.collection('users').doc(currentUser.uid)
                        .collection('settings').doc('schoolYear').set(settings, { merge: true });
                } catch(e) { console.warn('Could not save imported settings:', e); }
            }
        }
        
        // Refresh views
        lessons.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        renderCalendar();
        renderWeek();
        renderClasses();
        if (typeof updateClassDropdown === 'function') updateClassDropdown();
        
        showToast(`✅ Imported: ${imported.lessons} lessons, ${imported.classes} classes, ${imported.events} events`);
        document.getElementById('export-modal')?.classList.add('hidden');
        
    } catch (error) {
        console.error('Import failed:', error);
        showToast('Import failed');
    }
    
    hideLoading();
}

// ============================================
// PHASE 1: OFFLINE INDICATOR
// ============================================

let lastSyncTime = null;

function initOfflineIndicator() {
    updateOnlineStatus();
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Also check periodically (helps with DevTools offline mode)
    setInterval(checkOnlineStatus, 10000); // Every 10 seconds
    
    // Track last sync time
    lastSyncTime = new Date();
}

async function checkOnlineStatus() {
    // Use the browser's built-in online status — avoids noisy 404s from Firestore root
    updateOnlineStatus(navigator.onLine);
}

function updateOnlineStatus(forceOnline = null) {
    const indicator = document.getElementById('offline-indicator');
    const lastSyncedEl = document.getElementById('last-synced');
    
    if (!indicator) return;
    
    const isOnline = forceOnline !== null ? forceOnline : navigator.onLine;
    
    if (isOnline) {
        indicator.classList.add('hidden');
        lastSyncTime = new Date();
    } else {
        indicator.classList.remove('hidden');
        if (lastSyncedEl && lastSyncTime) {
            lastSyncedEl.textContent = `Last synced: ${formatTimeAgo(lastSyncTime)}`;
        }
    }
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// ============================================
// PHASE 2: DRAG AND DROP LESSONS
// ============================================

let draggedLesson = null;
let draggedElement = null;
let dragGhost = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

function initDragAndDrop() {
    // Add drag events to calendar grid
    const calendarGrid = document.getElementById('calendar-grid');
    if (calendarGrid) {
        calendarGrid.addEventListener('dragover', handleDragOver);
        calendarGrid.addEventListener('drop', handleDrop);
        calendarGrid.addEventListener('dragleave', handleDragLeave);
    }
    
    // Touch support for mobile
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
}

function makeLessonDraggable(element, lesson) {
    element.draggable = true;
    element.classList.add('draggable');
    element.dataset.lessonId = lesson.id;
    
    element.addEventListener('dragstart', (e) => {
        draggedLesson = lesson;
        draggedElement = element;
        element.classList.add('dragging');
        
        e.dataTransfer.setData('text/plain', lesson.id);
        e.dataTransfer.effectAllowed = 'copyMove';
        
        // Show drag indicator
        showDragIndicator();
    });
    
    element.addEventListener('dragend', () => {
        element.classList.remove('dragging');
        draggedLesson = null;
        draggedElement = null;
        hideDragIndicator();
        
        // Remove drag-over from all days
        document.querySelectorAll('.calendar-day.drag-over').forEach(day => {
            day.classList.remove('drag-over');
        });
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
    
    const dayEl = e.target.closest('.calendar-day');
    if (dayEl && !dayEl.classList.contains('drag-over')) {
        // Remove from others
        document.querySelectorAll('.calendar-day.drag-over').forEach(day => {
            day.classList.remove('drag-over');
        });
        dayEl.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const dayEl = e.target.closest('.calendar-day');
    if (dayEl && !dayEl.contains(e.relatedTarget)) {
        dayEl.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    
    const dayEl = e.target.closest('.calendar-day');
    if (!dayEl) return;
    
    dayEl.classList.remove('drag-over');
    
    // Check if we have a valid dragged lesson
    if (!draggedLesson || !draggedLesson.id) {
        console.log('No valid lesson being dragged');
        return;
    }
    
    const newDate = dayEl.dataset.date;
    const isCopy = e.shiftKey;
    
    if (newDate === draggedLesson.date && !isCopy) {
        // Same day, no change needed
        return;
    }
    
    // Capture values before async operations
    const lessonToMove = { ...draggedLesson };
    const lessonId = draggedLesson.id;
    const oldDate = draggedLesson.date;
    
    showLoading();
    
    try {
        if (isCopy) {
            // Copy lesson to new date
            const { id, ...lessonData } = lessonToMove;
            const newLesson = {
                ...lessonData,
                date: newDate,
                copiedFrom: lessonId,
                createdAt: new Date().toISOString()
            };
            
            const docRef = await getYearPath().collection('lessons').add(newLesson);
            lessons.push({ id: docRef.id, ...newLesson });
            showToast(`📋 Lesson copied to ${formatDisplayDate(new Date(newDate + 'T00:00:00'))}`);
        } else {
            // Move lesson to new date
            await getYearPath().collection('lessons').doc(lessonId).update({
                date: newDate
            });
            
            // Update local array
            const lesson = lessons.find(l => l.id === lessonId);
            if (lesson) {
                lesson.date = newDate;
            }
            
            // Record for undo (capture lessonId in closure)
            recordAction({
                type: 'move_lesson',
                data: { lessonId, oldDate, newDate },
                restore: async () => {
                    await getYearPath().collection('lessons').doc(lessonId).update({
                        date: oldDate
                    });
                    const l = lessons.find(x => x.id === lessonId);
                    if (l) l.date = oldDate;
                    renderCalendar();
                    renderWeek();
                },
                redo: async () => {
                    await getYearPath().collection('lessons').doc(lessonId).update({
                        date: newDate
                    });
                    const l = lessons.find(x => x.id === lessonId);
                    if (l) l.date = newDate;
                    renderCalendar();
                    renderWeek();
                }
            });
            // Undo toast already shows via recordAction
        }
        
        renderCalendar();
        renderWeek();
        
    } catch (error) {
        console.error('Error moving/copying lesson:', error);
        showToast('Error moving lesson');
    }
    
    hideLoading();
}

function showDragIndicator() {
    let indicator = document.querySelector('.drag-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'drag-indicator';
        indicator.innerHTML = `
            <span>Drag to move</span>
            <span>•</span>
            <span>Hold <kbd>Shift</kbd> to copy</span>
        `;
        document.body.appendChild(indicator);
    }
    indicator.style.display = 'flex';
}

function hideDragIndicator() {
    const indicator = document.querySelector('.drag-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Touch support for mobile drag
function handleTouchStart(e) {
    const lessonEl = e.target.closest('.calendar-class[data-lesson-id], .lesson-item[data-lesson-id]');
    if (!lessonEl) return;
    
    const lessonId = lessonEl.dataset.lessonId;
    draggedLesson = lessons.find(l => l.id === lessonId);
    if (!draggedLesson) return;
    
    draggedElement = lessonEl;
    dragStartX = e.touches[0].clientX;
    dragStartY = e.touches[0].clientY;
    
    // Long press to initiate drag
    draggedElement._touchTimer = setTimeout(() => {
        isDragging = true;
        draggedElement.classList.add('dragging');
        showDragIndicator();
        
        // Create ghost element
        dragGhost = draggedElement.cloneNode(true);
        dragGhost.className = 'drag-ghost';
        dragGhost.style.width = draggedElement.offsetWidth + 'px';
        document.body.appendChild(dragGhost);
    }, 500);
}

function handleTouchMove(e) {
    if (!isDragging || !dragGhost) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    dragGhost.style.left = touch.clientX - 20 + 'px';
    dragGhost.style.top = touch.clientY - 20 + 'px';
    
    // Find day under touch
    const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    const dayEl = elemBelow?.closest('.calendar-day');
    
    document.querySelectorAll('.calendar-day.drag-over').forEach(day => {
        day.classList.remove('drag-over');
    });
    
    if (dayEl) {
        dayEl.classList.add('drag-over');
    }
}

function handleTouchEnd(e) {
    if (draggedElement?._touchTimer) {
        clearTimeout(draggedElement._touchTimer);
    }
    
    if (!isDragging) {
        draggedLesson = null;
        draggedElement = null;
        return;
    }
    
    // Find target day
    const dayEl = document.querySelector('.calendar-day.drag-over');
    if (dayEl && draggedLesson) {
        handleDrop({ 
            preventDefault: () => {},
            target: dayEl,
            shiftKey: false
        });
    }
    
    // Cleanup
    if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
    }
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
    }
    document.querySelectorAll('.calendar-day.drag-over').forEach(day => {
        day.classList.remove('drag-over');
    });
    
    hideDragIndicator();
    isDragging = false;
    draggedLesson = null;
    draggedElement = null;
}

// ============================================
// PHASE 2: RECURRING LESSONS
// ============================================

function initRecurringLessons() {
    const recurringCheckbox = document.getElementById('lesson-recurring');
    const recurringOptions = document.getElementById('recurring-options');

    recurringCheckbox?.addEventListener('change', (e) => {
        if (e.target.checked) {
            recurringOptions?.classList.remove('hidden');
        } else {
            recurringOptions?.classList.add('hidden');
        }
    });

    // Same show/hide behavior for the "Copy to a different date" picker's
    // own recurrence checkbox.
    const copyRecurringCheckbox = document.getElementById('copy-lesson-recurring');
    const copyRecurringOptions = document.getElementById('copy-recurring-options');

    copyRecurringCheckbox?.addEventListener('change', (e) => {
        if (e.target.checked) {
            copyRecurringOptions?.classList.remove('hidden');
        } else {
            copyRecurringOptions?.classList.add('hidden');
        }
    });
}

// Shared date-generation logic for any "recurring" feature (new lessons,
// copying a lesson to a date, etc). Returns an array of "YYYY-MM-DD" date
// strings starting from the NEXT occurrence after `startDate` (the start
// date itself is never included -- callers add it separately if needed).
//
// Prefers the calendar's actual "last day of school" event as the source of
// truth for "Rest of year"/"Rest of semester" (same source isOffDay and the
// year progress bar use), falling back to settings.yearEnd only if it's
// chronologically after the start date, then to a computed May 31 default.
function generateRecurringDates(startDate, frequency, countValue) {
    const dates = [];
    const start = new Date(startDate + 'T00:00:00');

    const lastDayEvent = events.find(e => e.type === 'last-day');
    let yearEnd = lastDayEvent?.startDate ? new Date(lastDayEvent.startDate + 'T00:00:00') : null;

    if (!yearEnd && settings.yearEnd) {
        const candidate = new Date(settings.yearEnd + 'T00:00:00');
        if (candidate > start) yearEnd = candidate;
    }

    if (!yearEnd) {
        // Last resort: assume a typical school year ending in late May, the
        // year after `start` if `start` falls in the Jul-Dec half of the year.
        const fallbackYear = start.getMonth() >= 6 ? start.getFullYear() + 1 : start.getFullYear();
        yearEnd = new Date(`${fallbackYear}-05-31T00:00:00`);
        showToast('No "last day of school" event found -- assuming the year ends May 31. Add a Last Day event for an exact end date.');
    }

    let maxWeeks;
    if (countValue === 'semester') {
        // Approximately 18 weeks
        maxWeeks = 18;
    } else if (countValue === 'year') {
        // Calculate weeks until year end
        maxWeeks = Math.floor((yearEnd - start) / (7 * 24 * 60 * 60 * 1000));
    } else {
        maxWeeks = parseInt(countValue);
    }

    const weekIncrement = frequency === 'biweekly' ? 2 : 1;

    let current = new Date(start);
    current.setDate(current.getDate() + (7 * weekIncrement)); // Start from next occurrence

    for (let i = 0; i < maxWeeks && current <= yearEnd; i++) {
        // Skip weekends and no-school days (v6.2.0 -- recurring lessons were
        // being created during Thanksgiving and winter break)
        if (current.getDay() !== 0 && current.getDay() !== 6 && !isOffDay(formatDate(current))) {
            dates.push(formatDate(current));
        }
        current.setDate(current.getDate() + (7 * weekIncrement));
    }

    return dates;
}

async function createRecurringLessons(baseLessonData, startDate) {
    const frequency = document.getElementById('recurring-frequency')?.value || 'weekly';
    const countValue = document.getElementById('recurring-count')?.value || '4';

    const dates = generateRecurringDates(startDate, frequency, countValue);

    // Create a recurring group ID
    const recurringGroupId = `recurring_${Date.now()}`;
    
    // Create lessons for each date
    const createdLessons = [];
    for (let i = 0; i < dates.length; i++) {
        const lessonData = {
            ...baseLessonData,
            date: dates[i],
            recurringGroupId: recurringGroupId,
            recurringIndex: i + 2, // Start lesson is index 1
            createdAt: new Date().toISOString()
        };
        
        try {
            const docRef = await getYearPath().collection('lessons').add(lessonData);
            createdLessons.push({ id: docRef.id, ...lessonData });
        } catch (error) {
            console.error('Error creating recurring lesson:', error);
        }
    }
    
    // Add to local array
    lessons.push(...createdLessons);
    
    return createdLessons.length;
}

// ============================================
// PHASE 2: LESSON LINKING (MULTI-DAY LESSONS)
// ============================================

let lessonLinkGroups = {};

function initLessonLinking() {
    const linkGroupSelect = document.getElementById('lesson-link-group');
    const partSelector = document.getElementById('link-part-selector');
    
    linkGroupSelect?.addEventListener('change', (e) => {
        if (e.target.value === 'new' || e.target.value) {
            partSelector?.classList.remove('hidden');
        } else {
            partSelector?.classList.add('hidden');
        }
    });
    
    // Load existing link groups
    loadLinkGroups();
}

function loadLinkGroups() {
    lessonLinkGroups = {};
    
    lessons.forEach(lesson => {
        if (lesson.linkGroupId) {
            if (!lessonLinkGroups[lesson.linkGroupId]) {
                lessonLinkGroups[lesson.linkGroupId] = [];
            }
            lessonLinkGroups[lesson.linkGroupId].push(lesson);
        }
    });
    
    // Sort each group by part number
    Object.keys(lessonLinkGroups).forEach(groupId => {
        lessonLinkGroups[groupId].sort((a, b) => (a.partNumber || 1) - (b.partNumber || 1));
    });
    
    updateLinkGroupSelect();
}

function updateLinkGroupSelect() {
    const select = document.getElementById('lesson-link-group');
    if (!select) return;
    
    // Keep first two options
    select.innerHTML = `
        <option value="">Not part of a series</option>
        <option value="new">+ Create new series</option>
    `;
    
    // Add existing groups
    Object.keys(lessonLinkGroups).forEach(groupId => {
        const group = lessonLinkGroups[groupId];
        if (group.length > 0) {
            const firstLesson = group[0];
            const option = document.createElement('option');
            option.value = groupId;
            option.textContent = `${firstLesson.title} (${group.length} parts)`;
            select.appendChild(option);
        }
    });
}

function renderLinkedLessonsNav(currentLesson) {
    const nav = document.getElementById('linked-lessons-nav');
    if (!nav || !currentLesson.linkGroupId) {
        nav?.classList.add('hidden');
        return;
    }
    
    const group = lessonLinkGroups[currentLesson.linkGroupId] || [];
    if (group.length < 2) {
        nav.classList.add('hidden');
        return;
    }
    
    nav.classList.remove('hidden');
    nav.innerHTML = `
        <h5>🔗 Linked Lessons (${group.length} parts)</h5>
        ${group.map(lesson => `
            <div class="linked-lesson-item ${lesson.id === currentLesson.id ? 'current' : ''}" 
                 onclick="navigateToLinkedLesson('${lesson.id}')">
                <span class="linked-lesson-part">Part ${lesson.partNumber || '?'}</span>
                <span class="linked-lesson-date">${formatDisplayDate(new Date(lesson.date + 'T00:00:00'))}</span>
            </div>
        `).join('')}
    `;
}

function navigateToLinkedLesson(lessonId) {
    const lesson = lessons.find(l => l.id === lessonId);
    if (lesson) {
        openLessonModal(lesson);
    }
}

// ============================================
// PHASE 2: DUPLICATE DETECTION
// ============================================

function initDuplicateDetection() {
    const classSelect = document.getElementById('lesson-class');
    const dateInput = document.getElementById('lesson-date');
    
    classSelect?.addEventListener('change', () => {
        // Changing class invalidates any slot selection from the previous class.
        // Reset to slot 0 and hide the session chooser so the lesson can't be
        // saved into a slot index the new class doesn't have.
        const slotField = document.getElementById('lesson-slot-index');
        if (slotField) slotField.value = 0;
        document.getElementById('session-mode-chooser')?.classList.add('hidden');
        checkForDuplicate();
    });
    // Date is hidden but we'll check when opening modal
}

function checkForDuplicate() {
    const classId = document.getElementById('lesson-class')?.value;
    const date = document.getElementById('lesson-date')?.value;
    const currentLessonId = document.getElementById('lesson-id')?.value;
    const slotIndex = parseInt(document.getElementById('lesson-slot-index')?.value || '0') || 0;
    
    const warning = document.getElementById('duplicate-warning');
    if (!warning) return;
    
    if (!classId || !date) {
        warning.classList.add('hidden');
        return;
    }
    
    // Find existing lesson for this class, date, AND slot index
    // A span-all lesson (slotIndex -1) is a duplicate for every slot
    const duplicate = lessons.find(l => {
        if (l.classId !== classId || l.date !== date || l.id === currentLessonId) return false;
        if (l.slotIndex === -1) return true; // span-all conflicts with any slot
        const li = (l.slotIndex === undefined || l.slotIndex === null) ? 0 : l.slotIndex;
        return li === slotIndex || slotIndex === -1; // new span-all conflicts with any existing
    });
    
    if (duplicate) {
        warning.classList.remove('hidden');
        document.getElementById('view-duplicate-btn').onclick = () => {
            openLessonModal(duplicate);
        };
    } else {
        warning.classList.add('hidden');
    }
}

// ============================================
// PHASE 2: INITIALIZE ALL
// ============================================

function initPhase2Features() {
    initDragAndDrop();
    initRecurringLessons();
    initLessonLinking();
    initDuplicateDetection();
}

// ============================================
// SUB DAY PACKET SYSTEM
// ============================================

// subDays, subDayDefaults, subClassDefaults declared at top of file

// Fields that are the same every sub day (saved as defaults)
const SUB_DEFAULT_FIELDS = [
    'sub-teacher-name','sub-room-grade','sub-school',
    'sub-neighbor','sub-office','sub-contact-notes',
    'sub-morning','sub-attendance','sub-lunch',
    'sub-end-of-day','sub-restroom','sub-early-finishers','sub-behavior-system',
    'sub-medical','sub-student-notes','sub-helpers',
    'sub-feedback-prompt','sub-specials','sub-materials-location','sub-extras'
];

// Load all sub day packets for the current school year
async function loadSubDays() {
    if (!currentUser) return;
    try {
        const yearPath = getYearPath();
        const snap = await yearPath.collection('subDays').get();
        subDays = {};
        snap.forEach(doc => {
            subDays[doc.id] = { id: doc.id, ...doc.data() };
        });
    } catch (e) {
        console.warn('Could not load sub days:', e);
    }
    // Also load defaults (stored at user level, not per-year)
    await loadSubDayDefaults();
}

// Load sub day defaults from Firestore
async function loadSubDayDefaults() {
    if (!currentUser) return;
    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('subDayDefaults').get();
        subDayDefaults = doc.exists ? doc.data() : {};
    } catch (e) {
        console.warn('Could not load sub day defaults:', e);
        subDayDefaults = {};
    }
    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('subClassDefaults').get();
        subClassDefaults = doc.exists ? doc.data() : {};
    } catch (e) {
        console.warn('Could not load sub class defaults:', e);
        subClassDefaults = {};
    }
}

// Save current form values as defaults
async function saveSubDayDefaults() {
    // Collect general field defaults
    const data = {};
    SUB_DEFAULT_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });

    // Collect per-class instruction defaults
    const classData = {};
    document.querySelectorAll('#sub-schedule-blocks .sub-class-block').forEach(block => {
        const classId = block.dataset.classId;
        classData[classId] = {
            instructions: block.querySelector('.sub-class-instructions')?.value || '',
            materials:    block.querySelector('.sub-class-materials')?.value || '',
            notes:        block.querySelector('.sub-class-notes')?.value || ''
        };
    });

    try {
        const userSettings = db.collection('users').doc(currentUser.uid).collection('settings');
        await userSettings.doc('subDayDefaults').set(data, { merge: true });
        await userSettings.doc('subClassDefaults').set(classData, { merge: true });
        subDayDefaults   = { ...data };
        subClassDefaults = { ...subClassDefaults, ...classData };
        showToast('✅ Defaults saved! Every new Sub Day packet will pre-fill with these values.');
    } catch (e) {
        console.error('Save defaults error:', e);
        showToast('❌ Could not save defaults. Try again.');
    }
}

// Open sub day modal for a given date
function updatePacketBadge(dateStr) {
    const badge = document.getElementById('sub-packet-badge');
    if (!badge) return;
    const has = !!subDays[dateStr]?.generatedPacket;
    badge.classList.remove('hidden', 'has-packet', 'no-packet');
    if (has) {
        badge.classList.add('has-packet');
        badge.textContent = '✓ Student Packet Ready';
    } else {
        badge.classList.add('no-packet');
        badge.textContent = '○ No Packet Yet';
    }
}

// Wire up the AI Student Work Packet section (toggle, generate button, and
// the modal's footer action buttons) each time the Sub Day modal opens.
// Uses .onclick/.onchange (not addEventListener) so re-opening the modal for
// a different date never stacks duplicate handlers from the previous date.
function initPacketGenerator(dateStr) {
    const toggle   = document.getElementById('sub-create-student-work');
    const options   = document.getElementById('sub-ai-options');
    const statusEl  = document.getElementById('sub-ai-status');
    const stickyEl  = document.getElementById('sub-ai-sticky-status');
    const genBtn    = document.getElementById('sub-ai-generate-btn');
    const styleEl   = document.getElementById('sub-ai-style');
    const instrEl   = document.getElementById('sub-ai-instructions');
    const markedToggle = document.getElementById('sub-day-marked-toggle');

    if (statusEl) statusEl.textContent = '';
    if (stickyEl) { stickyEl.textContent = ''; stickyEl.classList.add('hidden'); }

    const saved = subDays[dateStr] || {};
    if (toggle) {
        toggle.checked = saved.createStudentWork === true;
        options?.classList.toggle('hidden', !toggle.checked);
        toggle.onchange = () => options?.classList.toggle('hidden', !toggle.checked);
    }
    if (styleEl) styleEl.value = saved.aiStyle || 'mixed';
    if (instrEl) instrEl.value = saved.aiInstructions || '';

    if (genBtn) genBtn.onclick = () => generateSubDayStudentPacket(dateStr);

    // Save immediately whenever the sub-day flag itself is toggled, so it's
    // never lost even if the teacher closes the modal without printing.
    if (markedToggle) markedToggle.onchange = () => saveSubDay();

    const defaultsBtn = document.getElementById('sub-day-defaults-btn');
    if (defaultsBtn) defaultsBtn.onclick = () => saveSubDayDefaults();

    const printPlanBtn = document.getElementById('sub-day-print-btn');
    if (printPlanBtn) printPlanBtn.onclick = async () => { await saveSubDay(); printSubPacket(); };

    const printWorkBtn = document.getElementById('sub-day-student-work-btn');
    if (printWorkBtn) printWorkBtn.onclick = () => printSubDayStudentWork(dateStr);

    const pickedPagesBtn = document.getElementById('sub-day-picked-pages-btn');
    if (pickedPagesBtn) pickedPagesBtn.onclick = () => printSubDayPickedPages(dateStr);
}

function openSubDayModal(dateStr, opts) {
    opts = opts || {};
    const date = new Date(dateStr + 'T00:00:00');
    const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    document.getElementById('sub-day-modal-title').textContent = '🙋 Sub Day Packet';
    document.getElementById('sub-day-modal-date').textContent = formatted;
    document.getElementById('sub-day-modal').dataset.date = dateStr;

    // Pre-fill teacher info from profile (fallback if no defaults saved)
    const nameInput = document.getElementById('sub-teacher-name');
    const schoolInput = document.getElementById('sub-school');
    if (!nameInput.value) nameInput.value = userProfile.username || '';
    if (!schoolInput.value) schoolInput.value = userProfile.school || '';

    const gradeInput = document.getElementById('sub-room-grade');
    if (!gradeInput.value && userProfile.grade) {
        gradeInput.value = userProfile.grade ? `${formatGrade(userProfile.grade)}` : '';
    }

    // Load saved sub day data if it exists, otherwise load defaults
    const saved = subDays[dateStr];
    if (saved) {
        fillSubDayForm(saved);
        // Show "this day has saved data" indicator
        document.getElementById('sub-defaults-status').textContent = '✏️ Editing saved packet';
    } else {
        loadSubDayFromDefaults();
        document.getElementById('sub-defaults-status').textContent =
            Object.keys(subDayDefaults).length > 0
                ? '✨ Pre-filled from your defaults'
                : '💡 Save defaults to pre-fill future packets';
    }

    // Build schedule blocks from today's classes
    buildSubScheduleBlocks(dateStr, saved);

    // Init AI packet generator (resource picker + status)
    initPacketGenerator(dateStr);

    // Set the "Mark as Sub Day" toggle from saved data. When the packet was
    // opened via "Create Sub Day" (Day view), the day is marked from the start.
    const markedToggle = document.getElementById('sub-day-marked-toggle');
    if (markedToggle) markedToggle.checked = opts.markAsSubDay === true || subDays[dateStr]?.isSubDay === true;
    document.getElementById('sub-day-modal').dataset.forceSubDay = opts.markAsSubDay === true ? '1' : '';

    // Show packet exists / not exists badge
    updatePacketBadge(dateStr);

    document.getElementById('sub-day-modal').classList.remove('hidden');
}

// Fill form fields from saved data
function fillSubDayForm(data) {
    const fields = [
        'sub-teacher-name','sub-room-grade','sub-school','sub-sub-name',
        'sub-neighbor','sub-office','sub-contact-notes',
        'sub-morning','sub-attendance','sub-lunch',
        'sub-end-of-day','sub-restroom','sub-early-finishers','sub-behavior-system',
        'sub-medical','sub-student-notes','sub-helpers',
        'sub-feedback-prompt','sub-extras','sub-specials','sub-materials-location'
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el && data[id] !== undefined) el.value = data[id];
    });
}

// Load defaults into the form (for a new, unsaved sub day)
function loadSubDayFromDefaults() {
    // Clear all fields
    const allFields = [...SUB_DEFAULT_FIELDS, 'sub-sub-name'];
    allFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Apply saved defaults
    SUB_DEFAULT_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && subDayDefaults[id] !== undefined) {
            el.value = subDayDefaults[id];
        }
    });

    // Fallback: teacher info from profile if defaults not set
    if (!document.getElementById('sub-teacher-name').value)
        document.getElementById('sub-teacher-name').value = userProfile.username || '';
    if (!document.getElementById('sub-school').value)
        document.getElementById('sub-school').value = userProfile.school || '';
    if (!document.getElementById('sub-room-grade').value && userProfile.grade)
        document.getElementById('sub-room-grade').value = formatGrade(userProfile.grade) || '';

    // Fallback feedback prompt if nothing saved
    const fp = document.getElementById('sub-feedback-prompt');
    if (fp && !fp.value)
        fp.value = 'Please leave a note describing how the day went, any concerns, or anything that was not completed. Thank you so much!';
}

// Build per-class instruction blocks
function buildSubScheduleBlocks(dateStr, saved) {
    subWorkPages = {}; // reset picked-pages state for this packet
    const container = document.getElementById('sub-schedule-blocks');
    const noClassesEl = document.getElementById('sub-no-classes');
    const date = new Date(dateStr + 'T00:00:00');
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    const dayKey = dayNames[date.getDay()];

    const dayClassesRaw = classes.filter(cls => cls.schedule && cls.schedule[dayKey] && isClassActiveOnDate(cls, dateStr));
    const classSlots = getSortedClassSlots(dayClassesRaw, dayKey);

    if (classSlots.length === 0) {
        container.innerHTML = '';
        noClassesEl.classList.remove('hidden');
        return;
    }
    noClassesEl.classList.add('hidden');
    const dayLessons = lessons.filter(l => l.date === dateStr);
    container.innerHTML = classSlots.map(({ cls, slotIndex: si, slot, slotCount }) => {
        // Key for per-slot saved data: "classId_slotIndex" for multi-slot, "classId" for single
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        subWorkPages[slotKey] = (saved?.classInstructions?.[slotKey]?.workPages) || (subClassDefaults[cls.id]?.workPages) || [];
        const timeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dayKey);
        const sessionLabel = slotCount > 1 ? ` · Session ${si + 1}` : '';
        const savedInstructions = saved?.classInstructions?.[slotKey];
        const classDefault      = subClassDefaults[cls.id] || {};
        const lesson = findLessonForSlot(dayLessons, cls.id, si);
        const lessonText = lesson
            ? `Lesson: ${lesson.title || ''}${lesson.objectives ? '\nObjectives: ' + lesson.objectives : ''}${lesson.activities ? '\nActivities: ' + lesson.activities : ''}${lesson.materials ? '\nMaterials: ' + lesson.materials : ''}`
            : '';

        // Priority: saved-for-this-date > class default > lesson plan text
        const instructionsVal = savedInstructions !== undefined
            ? savedInstructions.instructions
            : (classDefault.instructions || lessonText);
        const materialsVal = savedInstructions !== undefined
            ? savedInstructions.materials
            : (classDefault.materials || '');
        const notesVal = savedInstructions !== undefined
            ? savedInstructions.notes
            : (classDefault.notes || '');

        const hasLesson = !!lesson;
        const lessonBadge = hasLesson
            ? `<span class="sub-lesson-badge" title="${escHtml(lesson.title || 'Lesson planned')}">📋 ${lesson.title ? escHtml(lesson.title.substring(0,30)) + (lesson.title.length > 30 ? '…' : '') : 'Lesson planned'}</span>`
            : `<span class="sub-lesson-badge sub-lesson-none">No lesson planned</span>`;

        const lessonDataAttr = hasLesson
            ? `data-lesson-instructions="${encodeURIComponent(lessonText)}"
               data-lesson-materials="${encodeURIComponent(lesson.materials || '')}"
               data-lesson-notes="${encodeURIComponent(lesson.notes || '')}"`
            : '';

        const defaultDataAttr = `data-default-instructions="${encodeURIComponent(classDefault.instructions || '')}"
               data-default-materials="${encodeURIComponent(classDefault.materials || '')}"
               data-default-notes="${encodeURIComponent(classDefault.notes || '')}"`;

        const deviceIcons = { iPad:'📱', Chromebook:'💻', laptop:'🖥️', desktop:'🖥️', smartboard:'📺', other:'📡' };

        // Saved approved tools for this class
        const savedComputer = savedInstructions?.computerTime || classDefault.computerTime || {};
        const approvedToolIds = savedComputer.approvedToolIds || (savedComputer.enabled && savedComputer.toolId ? [savedComputer.toolId] : []);
        const compNotes = savedComputer.notes || '';

        // Build tech pills
        const techPillsHtml = techTools.length > 0
            ? techTools.map(t => {
                const active = approvedToolIds.includes(t.id);
                return `<button type="button"
                    class="tech-pill ${active ? 'tech-pill-active' : ''}"
                    data-tool-id="${t.id}"
                    data-class-id="${cls.id}"
                    onclick="toggleTechPill(this)"
                    title="${escHtml(t.notes || t.name)}">${deviceIcons[t.device]||'💻'} ${escHtml(t.name)}</button>`;
              }).join('')
            : '<span style="font-size:0.78rem;color:var(--text-muted);">No tech tools added yet — add them in Settings → Classroom Technology</span>';

        const savedIncluded = savedInstructions?.included !== false; // default true

        return `
        <div class="sub-class-block${savedIncluded ? '' : ' excluded'}" data-class-id="${cls.id}" data-slot-key="${slotKey}" style="border-left: 4px solid ${cls.color || '#FF6B9D'}">
            <div class="sub-class-block-header">
                <div class="sub-class-block-color-dot" style="background:${cls.color || '#FF6B9D'}"></div>
                <div class="sub-class-block-title">
                    <strong>${escHtml(cls.name)}${sessionLabel}</strong>
                    <span class="sub-class-time">${timeStr}${cls.room ? ' · ' + escHtml(cls.room) : ''}</span>
                </div>
                <label class="sub-class-include-label" title="Include this class when generating the AI Student Work Packet">
                    <input type="checkbox" class="sub-class-include" data-class-id="${cls.id}"
                        ${savedIncluded ? 'checked' : ''}
                        onchange="toggleSubClassInclude(this)">
                    <span>📝 AI work</span>
                </label>
            </div>
            <div class="sub-lesson-row">
                ${lessonBadge}
                <div class="sub-lesson-actions">
                    ${hasLesson ? `<button type="button" class="btn btn-ghost btn-xs sub-push-lesson-btn"
                        ${lessonDataAttr}
                        data-class-id="${cls.id}"
                        onclick="pushLessonToSub(this)"
                        title="Fill sub instructions from this lesson plan">📋 Push Lesson</button>` : ''}
                    ${classDefault.instructions ? `<button type="button" class="btn btn-ghost btn-xs sub-use-default-btn"
                        ${defaultDataAttr}
                        data-class-id="${cls.id}"
                        onclick="pushDefaultToSub(this)"
                        title="Fill from your saved sub defaults">🔄 Use Default</button>` : ''}
                </div>
            </div>
            <div class="form-group">
                <label>📌 Sub Instructions for This Class</label>
                <textarea class="form-control sub-class-instructions" data-class-id="${cls.id}" rows="4"
                    placeholder="What should the sub do during this period? Be specific...">${escHtml(instructionsVal)}</textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>📦 Materials / Location</label>
                    <input type="text" class="form-control sub-class-materials" data-class-id="${cls.id}"
                        placeholder="e.g. Worksheet in red folder on desk"
                        value="${escHtml(materialsVal)}">
                </div>
                <div class="form-group">
                    <label>⚠️ Notes / Heads Up</label>
                    <input type="text" class="form-control sub-class-notes" data-class-id="${cls.id}"
                        placeholder="e.g. Noisy group — use quiet signal"
                        value="${escHtml(notesVal)}">
                </div>
            </div>
            <div class="subwork-section">
                <div class="subwork-head">
                    <label>📄 Student Work Pages <span class="subwork-hint">(hand-pick actual pages from your PDFs)</span></label>
                    <button type="button" class="btn btn-ghost btn-xs" onclick="openPagePicker('${slotKey}')">➕ Pick pages</button>
                </div>
                <div class="subwork-chips">${subWorkChipsHTML(slotKey)}</div>
            </div>
            <!-- Tech Pills -->
            ${techTools.length > 0 ? `
            <div class="sub-class-tech-pills">
                <div class="sub-class-tech-label">✅ Approved tech this period:</div>
                <div class="sub-class-tech-pill-row" data-class-id="${cls.id}">
                    ${techPillsHtml}
                </div>
                ${approvedToolIds.length > 0 ? `
                <div class="form-group" style="margin-top:0.4rem;">
                    <input type="text" class="form-control sub-class-computer-notes" data-class-id="${cls.id}"
                        placeholder="Sub notes for tech time (e.g. 15 min, earn 3 stars)"
                        value="${escHtml(compNotes)}" style="font-size:0.82rem;">
                </div>` : ''}
            </div>` : ''}
        </div>`;
    }).join('');
}

// Toggle a class block's included/excluded state
function toggleSubClassInclude(checkbox) {
    const block = checkbox.closest('.sub-class-block');
    if (!block) return;
    if (checkbox.checked) {
        block.classList.remove('excluded');
    } else {
        block.classList.add('excluded');
    }
}

// Collect all form values into a data object
function collectSubDayData(dateStr) {
    const data = { date: dateStr };
    const fields = [
        'sub-teacher-name','sub-room-grade','sub-school','sub-sub-name',
        'sub-neighbor','sub-office','sub-contact-notes',
        'sub-morning','sub-attendance','sub-lunch',
        'sub-end-of-day','sub-restroom','sub-early-finishers','sub-behavior-system',
        'sub-medical','sub-student-notes','sub-helpers',
        'sub-feedback-prompt','sub-extras','sub-specials','sub-materials-location'
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });

    // Collect per-class instructions + approved tech pills
    // Key is slotKey (classId_slotIndex for multi-slot, classId for single-slot)
    data.classInstructions = {};
    document.querySelectorAll('#sub-schedule-blocks .sub-class-block').forEach(block => {
        const classId = block.dataset.classId;
        const slotKey = block.dataset.slotKey || classId;
        // Collect all active tech pill tool IDs
        const activePills = Array.from(block.querySelectorAll('.tech-pill-active'));
        const approvedToolIds = activePills.map(p => p.dataset.toolId);
        const approvedTools = approvedToolIds.map(id => techTools.find(t => t.id === id)).filter(Boolean);
        const includeCheckbox = block.querySelector('.sub-class-include');
        data.classInstructions[slotKey] = {
            included:     includeCheckbox ? includeCheckbox.checked : true,
            instructions: block.querySelector('.sub-class-instructions')?.value || '',
            materials:    block.querySelector('.sub-class-materials')?.value || '',
            notes:        block.querySelector('.sub-class-notes')?.value || '',
            workPages:    subWorkPages[slotKey] || [],
            computerTime: {
                enabled:       approvedToolIds.length > 0,
                approvedToolIds,
                toolId:        approvedToolIds[0] || '',
                toolName:      approvedTools.map(t => t.name).join(', '),
                toolNotes:     approvedTools.map(t => t.notes).filter(Boolean).join('; '),
                device:        approvedTools[0]?.device || '',
                notes:         block.querySelector('.sub-class-computer-notes')?.value || ''
            }
        };
    });

    return data;
}

// Toggle a tech pill on/off for a class period
function toggleTechPill(btn) {
    btn.classList.toggle('tech-pill-active');
    const block = btn.closest('.sub-class-block');
    const classId = btn.dataset.classId;
    const pillRow = btn.closest('.sub-class-tech-pill-row');

    // Show/hide notes field based on whether any pill is active
    const anyActive = pillRow.querySelectorAll('.tech-pill-active').length > 0;
    let notesField = block.querySelector('.sub-class-computer-notes');
    if (anyActive && !notesField) {
        // Inject notes field dynamically
        const techDiv = block.querySelector('.sub-class-tech-pills');
        const noteDiv = document.createElement('div');
        noteDiv.className = 'form-group';
        noteDiv.style.marginTop = '0.4rem';
        noteDiv.innerHTML = `<input type="text" class="form-control sub-class-computer-notes" data-class-id="${classId}"
            placeholder="Sub notes for tech time (e.g. 15 min, earn 3 stars)" style="font-size:0.82rem;">`;
        techDiv.appendChild(noteDiv);
    } else if (!anyActive && notesField) {
        notesField.closest('.form-group')?.remove();
    }
}

// Legacy — keep for backward compat
function toggleComputerTime(checkbox) {}

// Push existing lesson plan into the sub instructions fields
function pushLessonToSub(btn) {
    const block = btn.closest('.sub-class-block');
    const classId = btn.dataset.classId;
    const instructions = decodeURIComponent(btn.dataset.lessonInstructions || '');
    const materials    = decodeURIComponent(btn.dataset.lessonMaterials || '');
    const notes        = decodeURIComponent(btn.dataset.lessonNotes || '');
    const ta = block.querySelector('.sub-class-instructions');
    const mat = block.querySelector('.sub-class-materials');
    const nt  = block.querySelector('.sub-class-notes');
    if (ta) ta.value = instructions;
    if (mat && materials) mat.value = materials;
    if (nt && notes) nt.value = notes;
    showToast('📋 Lesson pushed to sub instructions');
}

// Push saved sub defaults into the sub instructions fields
function pushDefaultToSub(btn) {
    const block = btn.closest('.sub-class-block');
    const instructions = decodeURIComponent(btn.dataset.defaultInstructions || '');
    const materials    = decodeURIComponent(btn.dataset.defaultMaterials || '');
    const notes        = decodeURIComponent(btn.dataset.defaultNotes || '');
    const ta = block.querySelector('.sub-class-instructions');
    const mat = block.querySelector('.sub-class-materials');
    const nt  = block.querySelector('.sub-class-notes');
    if (ta) ta.value = instructions;
    if (mat) mat.value = materials;
    if (nt) nt.value = notes;
    showToast('🔄 Default sub instructions restored');
}

// Save sub day to Firestore
async function saveSubDay() {
    const modal = document.getElementById('sub-day-modal');
    const dateStr = modal.dataset.date;
    if (!dateStr) { showToast('❌ No date set — reopen the packet'); return; }

    const isSubDay = document.getElementById('sub-day-marked-toggle')?.checked === true
        || modal.dataset.forceSubDay === '1';
    const markedToggleEl = document.getElementById('sub-day-marked-toggle');
    if (markedToggleEl && isSubDay) markedToggleEl.checked = true;
    const data = collectSubDayData(dateStr);
    data.isSubDay = isSubDay;
    data.createStudentWork = document.getElementById('sub-create-student-work')?.checked === true;
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    // Preserve any generated packet already in memory
    if (subDays[dateStr]?.generatedPacket && !data.generatedPacket) {
        data.generatedPacket = subDays[dateStr].generatedPacket;
    }

    // Strip undefined values — Firestore rejects them and silently skips the write
    const cleanData = JSON.parse(JSON.stringify(data, (k, v) => v === undefined ? null : v));

    try {
        const yearPath = getYearPath();
        // Use set+merge for the full packet, then explicitly update isSubDay
        // so the toggle always persists even if other fields fail validation
        await yearPath.collection('subDays').doc(dateStr).set(cleanData, { merge: true });
        subDays[dateStr] = { ...subDays[dateStr], ...cleanData };
        renderCalendar();
        if (typeof renderDayView === 'function' && !document.getElementById('day-view')?.classList.contains('hidden')) renderDayView();
        showToast(isSubDay ? '✅ Saved — this day is now a Sub Day' : '✅ Sub Day packet saved!');
    } catch (e) {
        console.error('Save sub day error:', e.code, e.message, e);
        // If the full save failed, try to at least save the isSubDay flag
        try {
            const yearPath = getYearPath();
            await yearPath.collection('subDays').doc(dateStr).set(
                { isSubDay, date: dateStr, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                { merge: true }
            );
            subDays[dateStr] = { ...subDays[dateStr], isSubDay, date: dateStr };
            renderCalendar();
            if (typeof renderDayView === 'function' && !document.getElementById('day-view')?.classList.contains('hidden')) renderDayView();
            showToast('⚠️ Packet partially saved (toggle saved, other fields may not have)');
        } catch (e2) {
            showToast('❌ Could not save: ' + (e.code || e.message || 'Unknown error'));
        }
    }
}

// Generate and print the sub packet
function printSubPacket() {
    const modal = document.getElementById('sub-day-modal');
    const dateStr = modal.dataset.date;
    const data = collectSubDayData(dateStr);

    const date = new Date(dateStr + 'T00:00:00');
    const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Build class schedule HTML — one block per slot
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    const dayKey = dayNames[date.getDay()];
    const _printDayClasses = classes.filter(cls => cls.schedule && cls.schedule[dayKey] && isClassActiveOnDate(cls, dateStr));
    const _printClassSlots = getSortedClassSlots(_printDayClasses, dayKey);
    const _printDayLessons = lessons.filter(l => l.date === dateStr);

    const scheduleHtml = _printClassSlots.map(({ cls, slotIndex: si, slot, slotCount }) => {
        const timeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dayKey);
        const sessionLabel = slotCount > 1 ? ` · Session ${si + 1}` : '';
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        const ci = data.classInstructions?.[slotKey] || {};
        const ct = ci.computerTime || {};
        const computerHtml = ct.enabled && ct.toolName
            ? '<div style="margin-top:8px;padding:8px 10px;background:#e3f2fd;border-left:3px solid #2980b9;border-radius:3px;">'
              + '<strong style="font-size:12px;color:#2980b9;">💻 Computer Time' + (ct.duration ? ' · ' + ct.duration : '') + ': ' + ct.toolName + '</strong>'
              + (ct.toolNotes ? '<p style="margin:3px 0 0;font-size:11px;color:#555;">' + ct.toolNotes + '</p>' : '')
              + (ct.notes ? '<p style="margin:3px 0 0;font-size:11px;color:#555;font-style:italic;">' + ct.notes + '</p>' : '')
              + '</div>'
            : '';
        const instrHtml = ci.instructions
            ? '<p style="margin:0 0 6px;white-space:pre-wrap;font-size:13px;">' + ci.instructions + '</p>'
            : '<p style="color:#999;font-size:13px;font-style:italic;">No specific instructions provided.</p>';
        const matHtml = ci.materials
            ? '<p style="margin:4px 0;font-size:12px;color:#444;"><strong>📦 Materials:</strong> ' + ci.materials + '</p>'
            : '';
        const noteHtml = ci.notes
            ? '<p style="margin:4px 0;font-size:12px;color:#c0392b;"><strong>⚠️ Note:</strong> ' + ci.notes + '</p>'
            : '';
        return '<div class="print-class-block" style="border-left:5px solid ' + (cls.color || '#FF6B9D') + '; margin-bottom:16px; padding:12px 16px; background:#fafafa; border-radius:4px; page-break-inside:avoid;">'
            + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
            + '<div style="width:14px;height:14px;border-radius:50%;background:' + (cls.color || '#FF6B9D') + ';flex-shrink:0;"></div>'
            + '<strong style="font-size:15px;">' + cls.name + sessionLabel + '</strong>'
            + '<span style="color:#666;font-size:13px;">' + timeStr + (cls.room ? ' · ' + cls.room : '') + '</span>'
            + '</div>'
            + instrHtml + matHtml + noteHtml + computerHtml
            + '</div>';
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} Sub Plan</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #222; background: #fff; }
  @page { margin: 0.4in 0.45in; }

  .packet-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #FF6B9D; padding-bottom: 8px; margin-bottom: 12px;
  }
  .packet-header-left h1 { font-size: 20px; color: #FF6B9D; margin-bottom: 2px; }
  .packet-header-left p { font-size: 12px; color: #555; }
  .packet-header-right { text-align: right; }
  .packet-header-right .info-row { font-size: 11px; color: #444; margin-bottom: 2px; }
  .packet-header-right .info-row strong { color: #222; }

  .print-section { margin-bottom: 10px; }
  .print-section h2 {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
    color: #fff; background: #2c3e50; padding: 3px 7px; border-radius: 2px;
    margin-bottom: 5px;
  }
  .print-section.accent-pink h2   { background: #e91e8c; }
  .print-section.accent-blue h2   { background: #2980b9; }
  .print-section.accent-green h2  { background: #27ae60; }
  .print-section.accent-orange h2 { background: #e67e22; }
  .print-section.accent-red h2    { background: #c0392b; }
  .print-section.accent-purple h2 { background: #8e44ad; }
  .print-section-empty { display: none !important; }

  .print-field { margin-bottom: 4px; }
  .print-field .label { font-weight: 700; font-size: 9px; color: #666; margin-bottom: 1px; }
  .print-field .value { font-size: 11px; color: #222; white-space: pre-wrap; line-height: 1.4; }
  .print-field .value.empty { color: #aaa; font-style: italic; }

  /* Class blocks in the schedule column */
  .print-class-block { margin-bottom: 10px; }

  .feedback-box {
    margin-top: 12px; border: 2px dashed #FF6B9D; padding: 8px; border-radius: 4px;
  }
  .feedback-box h2 { font-size: 11px; color: #FF6B9D; margin-bottom: 5px; }
  .feedback-line { border-bottom: 1px solid #ddd; height: 20px; margin-bottom: 3px; }

  .packet-footer {
    margin-top: 10px; border-top: 1px solid #ddd; padding-top: 6px;
    display: flex; justify-content: space-between; font-size: 9px; color: #999;
  }
</style>
</head>
<body>

<!-- HEADER -->
<div class="packet-header">
  <div class="packet-header-left">
    <h1>🙋 Substitute Teacher Packet</h1>
    <p>${formatted}</p>
  </div>
  <div class="packet-header-right">
    ${data['sub-teacher-name'] ? `<div class="info-row"><strong>Teacher:</strong> ${data['sub-teacher-name']}</div>` : ''}
    ${data['sub-room-grade'] ? `<div class="info-row"><strong>Room / Grade:</strong> ${data['sub-room-grade']}</div>` : ''}
    ${data['sub-school'] ? `<div class="info-row"><strong>School:</strong> ${data['sub-school']}</div>` : ''}
    ${data['sub-sub-name'] ? `<div class="info-row"><strong>Sub:</strong> ${data['sub-sub-name']}</div>` : ''}
  </div>
</div>

<!-- Morning Routine -->
<div class="print-section accent-blue">
  <h2>🌅 Morning Routine</h2>
  ${data['sub-morning'] ? `<div class="print-field"><div class="value">${data['sub-morning']}</div></div>` : ''}
  ${data['sub-attendance'] ? `<div class="print-field"><div class="label">Attendance</div><div class="value">${data['sub-attendance']}</div></div>` : ''}
  ${data['sub-lunch'] ? `<div class="print-field"><div class="label">Lunch Count</div><div class="value">${data['sub-lunch']}</div></div>` : ''}
</div>

<!-- End of Day -->
<div class="print-section accent-blue">
  <h2>🌇 End of Day</h2>
  ${data['sub-end-of-day'] ? `<div class="print-field"><div class="value">${data['sub-end-of-day']}</div></div>` : '<div class="print-field"><div class="value empty">No end-of-day routine specified.</div></div>'}
</div>

<!-- Classroom Procedures -->
<div class="print-section accent-green">
  <h2>📋 Classroom Procedures</h2>
  ${data['sub-restroom'] ? `<div class="print-field"><div class="label">Restroom</div><div class="value">${data['sub-restroom']}</div></div>` : ''}
  ${data['sub-early-finishers'] ? `<div class="print-field"><div class="label">Early Finishers</div><div class="value">${data['sub-early-finishers']}</div></div>` : ''}
  ${data['sub-behavior-system'] ? `<div class="print-field"><div class="label">Behavior System</div><div class="value">${data['sub-behavior-system']}</div></div>` : ''}
</div>

<!-- Student Alerts -->
<div class="print-section accent-red">
  <h2>⚠️ Student Alerts</h2>
  ${data['sub-medical'] ? `<div class="print-field"><div class="label">Medical / Allergy</div><div class="value">${data['sub-medical']}</div></div>` : ''}
  ${data['sub-student-notes'] ? `<div class="print-field"><div class="label">Behavioral Notes</div><div class="value">${data['sub-student-notes']}</div></div>` : ''}
  ${data['sub-helpers'] ? `<div class="print-field"><div class="label">Helpers / Leaders Today</div><div class="value">${data['sub-helpers']}</div></div>` : ''}
</div>

<!-- Special Info -->
<div class="print-section accent-purple">
  <h2>📌 Special Schedule Notes</h2>
  ${data['sub-specials'] ? `<div class="print-field"><div class="value">${data['sub-specials']}</div></div>` : '<div class="print-field"><div class="value empty">No specials noted.</div></div>'}
</div>

<!-- Where to Find Things -->
<div class="print-section accent-orange">
  <h2>🗂️ Where to Find Things</h2>
  ${data['sub-materials-location'] ? `<div class="print-field"><div class="value">${data['sub-materials-location']}</div></div>` : '<div class="print-field"><div class="value empty">See desk for materials.</div></div>'}
</div>

<!-- Extra Time -->
${data['sub-extras'] ? `<div class="print-section">
  <h2>➕ Extra / Free Time</h2>
  <div class="print-field"><div class="value">${data['sub-extras']}</div></div>
</div>` : ''}

<!-- Emergency Contacts -->
<div class="print-section accent-red">
  <h2>📞 Emergency Contacts</h2>
  ${data['sub-neighbor'] ? `<div class="print-field"><div class="label">Neighbor / Go-To Teacher</div><div class="value">${data['sub-neighbor']}</div></div>` : ''}
  ${data['sub-office'] ? `<div class="print-field"><div class="label">Office / Admin</div><div class="value">${data['sub-office']}</div></div>` : ''}
  ${data['sub-contact-notes'] ? `<div class="print-field"><div class="label">Other</div><div class="value">${data['sub-contact-notes']}</div></div>` : ''}
</div>

<!-- SCHEDULE -->
<div class="print-section accent-pink">
  <h2>🗓️ Today's Schedule & Instructions</h2>
  ${_printDayClasses.length > 0 ? scheduleHtml : '<p style="color:#999;font-style:italic;padding:8px 0;">No classes found for this day.</p>'}
</div>

<!-- FEEDBACK BOX -->
<div class="feedback-box">
  <h2>📝 Please Leave a Note for ${data['sub-teacher-name'] || 'the Teacher'}</h2>
  <p style="font-size:12px;color:#555;margin-bottom:10px;">${data['sub-feedback-prompt'] || 'Please leave a note about how the day went, any concerns, or anything not completed.'}</p>
  <div class="feedback-lines">
    <div class="feedback-line"></div>
    <div class="feedback-line"></div>
    <div class="feedback-line"></div>
    <div class="feedback-line"></div>
    <div class="feedback-line"></div>
  </div>
</div>

<!-- FOOTER -->
<div class="packet-footer">
  <span>Substitute Packet · ${formatted}</span>
  <span>Thank you for being here today! 💙</span>
</div>

${subDays[dateStr] && subDays[dateStr].generatedPacket
    ? '<div style="page-break-before:always;"><style>'      + 'table{display:block!important;width:100%!important;}'      + 'tr{display:block!important;width:100%!important;}'      + 'td{display:block!important;width:100%!important;border:none!important;padding:0!important;}'      + '[style*="page-break-before"]{page-break-before:always!important;break-before:page!important;}'      + 'p,li{page-break-inside:avoid;}'      + '</style>' + subDays[dateStr].generatedPacket + '</div>'
    : ''}

</body>
</html>`;

    const win = openPrintWindow();
    win.document.write(preparePrintDoc(html, {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => {
        // Hide any print-section that has no visible content (only an h2 child)
        win.document.querySelectorAll('.print-section').forEach(sec => {
            const hasContent = Array.from(sec.children).some(el => el.tagName !== 'H2' && el.offsetHeight > 0);
            if (!hasContent) sec.classList.add('print-section-empty');
        });
        setTimeout(() => {
            win.focus();
            win.print();
        }, 400);
    };
}

// Build the AI Student Work Packet for a sub day: one activity set per
// scheduled class, using that class's lesson (if any) and typed sub
// instructions as context. Streams into the modal's status area, then
// saves the finished HTML onto subDays[dateStr].generatedPacket so it's
// available both from "Print Student Work" and embedded in the full plan.
async function generateSubDayStudentPacket(dateStr) {
    const statusEl = document.getElementById('sub-ai-status');
    const stickyEl = document.getElementById('sub-ai-sticky-status');
    const genBtn   = document.getElementById('sub-ai-generate-btn');
    const styleEl  = document.getElementById('sub-ai-style');
    const instrEl  = document.getElementById('sub-ai-instructions');
    const printWorkBtn = document.getElementById('sub-day-student-work-btn');

    if (!hasEffectiveAiKey()) { showToast('Add your AI API key in Settings first.'); return; }

    const date = new Date(dateStr + 'T00:00:00');
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    const dayKey = dayNames[date.getDay()];
    const dayClasses = classes.filter(cls => cls.schedule && cls.schedule[dayKey] && isClassActiveOnDate(cls, dateStr) && cls.type !== 'activity');
    const classSlots = getSortedClassSlots(dayClasses, dayKey);
    const dayLessons = lessons.filter(l => l.date === dateStr);
    const formData = collectSubDayData(dateStr);

    if (classSlots.length === 0) {
        showToast('No classes scheduled this day — nothing to generate a packet for.');
        return;
    }

    const styleLabel = {
        worksheets: 'worksheets and practice problems',
        activities: 'hands-on activities and games',
        mixed: '2 activities per class period, each roughly one full printed page',
        reading: 'a short reading passage with comprehension questions'
    }[styleEl?.value] || '2 activities per class period';
    const grade = userProfile.grade ? formatGrade(userProfile.grade) : '1st Grade';
    const specialInstructions = instrEl?.value.trim() || '';

    // v6.2.0: honour the per-class "📝 AI work" checkbox -- unchecked
    // classes used to get activities anyway.
    const includedSlots = classSlots.filter(({ cls, slotIndex: si, slotCount }) => {
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        return formData.classInstructions?.[slotKey]?.included !== false;
    });
    if (includedSlots.length === 0) {
        showToast('Every class is unchecked for AI work — tick at least one "📝 AI work" box.');
        return;
    }

    const classContext = includedSlots.map(({ cls, slotIndex: si, slotCount }) => {
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        const lesson = findLessonForSlot(dayLessons, cls.id, si);
        const ci = formData.classInstructions?.[slotKey] || {};
        return `Class: ${cls.name}${cls.subject ? ' (' + cls.subject + ')' : ''}\n`
            + (lesson?.title ? `Today's lesson: ${lesson.title}\n` : '')
            + (lesson?.notes ? `Lesson notes: ${lesson.notes}\n` : '')
            + (ci.instructions ? `Sub instructions: ${ci.instructions}\n` : '');
    }).join('\n');

    const prompt = `Create a printable student work packet for a substitute-teacher day in a ${grade} classroom.\n`
        + `For EACH class period below, create ${styleLabel} that a substitute can hand out with no special prep.\n`
        + `Give every class period exactly 2 activities.\n`
        + (specialInstructions ? `Special instructions: ${specialInstructions}\n` : '')
        + `\nClasses today:\n${classContext}\n`
        + `\nFormat the output as clean semantic HTML fragments only (use <h2> for each class name, <h3> for each activity title, <p>, <ol>/<li>, and simple <table> where useful). `
        + `Do not include <html>, <head>, or <body> tags, and do not use Markdown syntax (no **, ##, backticks). `
        + `Start each class's section with <div style="page-break-before:always;"> and close it with </div> so each class prints on its own page. `
        + `Write for a ${grade} reading level — clear, simple, age-appropriate language and short instructions.`;

    statusEl.innerHTML = '🤖 Generating student packet…';
    stickyEl.textContent = '🤖 Generating student packet…';
    stickyEl.classList.remove('hidden');
    if (genBtn) genBtn.disabled = true;
    if (printWorkBtn) printWorkBtn.disabled = true;

    try {
        let full = '';
        await callAITextStream({
            prompt,
            tier: 'quality',
            maxTokens: 16000,
            onDelta: (_chunk, fullText) => {
                full = fullText;
                statusEl.innerHTML = `🤖 Generating… (${fullText.length.toLocaleString()} characters so far)`;
            }
        });

        subDays[dateStr] = { ...subDays[dateStr], generatedPacket: full, aiStyle: styleEl?.value || null, aiInstructions: specialInstructions };
        // v6.2.0: write the packet to the date it was generated FOR. Before,
        // saveSubDay() read whichever date the modal showed ~2 minutes later,
        // so opening another day meanwhile lost the packet.
        await getYearPath().collection('subDays').doc(dateStr).set({
            date: dateStr,
            generatedPacket: full,
            aiStyle: styleEl?.value || null,
            aiInstructions: specialInstructions,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        const subModal = document.getElementById('sub-day-modal');
        if (subModal && subModal.dataset.date === dateStr && !subModal.classList.contains('hidden')) {
            await saveSubDay();   // also keep the rest of the open form
        }
        updatePacketBadge(dateStr);
        statusEl.innerHTML = '✅ Student packet ready!';
        showToast('✅ Student packet generated and saved!');
    } catch (e) {
        console.error('generateSubDayStudentPacket:', e);
        statusEl.innerHTML = '❌ ' + (e.message || 'Generation failed.');
        showToast('❌ Could not generate packet: ' + (e.message || 'Unknown error'));
    } finally {
        stickyEl.classList.add('hidden');
        if (genBtn) genBtn.disabled = false;
        if (printWorkBtn) printWorkBtn.disabled = false;
    }
}

// Print just the AI-generated student packet (no sub instructions), for
// running copies to hand to students.
function printSubDayStudentWork(dateStr) {
    const packet = subDays[dateStr]?.generatedPacket;
    if (!packet) {
        showToast('No student packet generated yet — click "✨ Generate Student Packet" first.');
        return;
    }
    const date = new Date(dateStr + 'T00:00:00');
    const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Student Work Packet — ${formatted}</title>
        <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #222; margin: 0; }
        table { display:block!important; width:100%!important; }
        tr { display:block!important; width:100%!important; }
        td { display:block!important; width:100%!important; border:none!important; padding:0!important; }
        [style*="page-break-before"] { page-break-before: always !important; break-before: page !important; }
        p, li { page-break-inside: avoid; }
        </style></head><body>${packet}</body></html>`, {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => { setTimeout(() => { win.focus(); win.print(); }, 400); };
}


// ============================================================
// CURRICULUM PAGE PICKER  (Sub Day student work)
// View a curriculum PDF and hand-pick the exact pages to hand
// out for a given class. Selected pages print as ACTUAL pages.
// Selection is stored per class slot in subWorkPages and saved
// with the sub-day packet (classInstructions[slotKey].workPages).
// ============================================================

let subWorkPages = {};                 // { slotKey: [ {resourceId, name, pages:[1,3]} ] }
let emergencyWorkPages = {};           // { "dow::slotKey": [ {resourceId, name, pages} ] }
let _ppCtx = { scope: 'sub', slotKey: null, storeKey: null, resourceId: null, numPages: 0, selected: new Set() };

// Picker scope helpers — the page picker serves both the Sub Day modal and
// the Emergency Sub Plans modal.
function _ppStore(scope) { return scope === 'emergency' ? emergencyWorkPages : subWorkPages; }
function _ppContainerSel(scope) { return scope === 'emergency' ? '#es-day-blocks' : '#sub-schedule-blocks'; }
function _ppBlockSel(scope) { return scope === 'emergency' ? '.es-period-block' : '.sub-class-block'; }
function _ppRawSlot(storeKey, scope) { return scope === 'emergency' ? storeKey.split('::').slice(1).join('::') : storeKey; }
function _ppChipHost(storeKey, scope) {
    const raw = _ppRawSlot(storeKey, scope);
    return document.querySelector(`${_ppContainerSel(scope)} ${_ppBlockSel(scope)}[data-slot-key="${raw}"] .subwork-chips`);
}

// PDF resources we can actually render pages from (need the stored original)
function pickablePdfDocs(subject) {
    const renderable = d => d.storageUrl && (d.fileType === 'application/pdf' || /\.pdf$/i.test(d.name || ''));
    const list = curriculumDocs.filter(renderable);
    list.sort((a, b) => {
        const am = subject && a.subject === subject ? 0 : 1;
        const bm = subject && b.subject === subject ? 0 : 1;
        return am - bm || (a.name || '').localeCompare(b.name || '');
    });
    return list;
}

// Compress a page list to a short label: [1,2,3,5] -> "pp. 1-3, 5"
function summarizePages(pages) {
    if (!pages || !pages.length) return 'no pages';
    const sorted = [...pages].sort((a, b) => a - b);
    const runs = [];
    let start = sorted[0], prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === prev + 1) { prev = sorted[i]; continue; }
        runs.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = prev = sorted[i];
    }
    runs.push(start === prev ? `${start}` : `${start}-${prev}`);
    return (sorted.length === 1 ? 'p. ' : 'pp. ') + runs.join(', ');
}

// Chips shown under each class block
function subWorkChipsHTML(storeKey, scope = 'sub') {
    const sel = _ppStore(scope)[storeKey] || [];
    if (sel.length === 0) return '<span class="subwork-empty">No pages picked yet.</span>';
    return sel.map(s => {
        const nm = (s.name || 'Resource');
        const short = nm.length > 26 ? nm.substring(0, 25) + '…' : nm;
        return `<span class="subwork-chip" title="${escHtml(nm)} — ${escHtml(summarizePages(s.pages))}">📄 ${escHtml(short)} · ${escHtml(summarizePages(s.pages))}<button type="button" class="subwork-chip-x" title="Remove" onclick="removeSubWork('${storeKey}','${s.resourceId}','${scope}')">✕</button></span>`;
    }).join('');
}

function removeSubWork(storeKey, resourceId, scope = 'sub') {
    const store = _ppStore(scope);
    store[storeKey] = (store[storeKey] || []).filter(s => s.resourceId !== resourceId);
    const host = _ppChipHost(storeKey, scope);
    if (host) host.innerHTML = subWorkChipsHTML(storeKey, scope);
}

// Open the picker for a class slot. scope 'sub' (default) or 'emergency'.
async function openPagePicker(slotKey, scope = 'sub', dow = null) {
    const modal = document.getElementById('page-picker-modal');
    if (!modal) return;
    const storeKey = scope === 'emergency' ? `${dow}::${slotKey}` : slotKey;
    // Derive subject + class name from the block
    const block = document.querySelector(`${_ppContainerSel(scope)} ${_ppBlockSel(scope)}[data-slot-key="${slotKey}"]`);
    const classId = block?.dataset.classId;
    const cls = classes.find(c => c.id === classId);
    const subject = cls?.subject || '';
    const clsName = cls?.name || 'Class';

    _ppCtx = { scope, slotKey, storeKey, resourceId: null, numPages: 0, selected: new Set() };
    document.getElementById('pp-title').textContent = '📄 Pick Pages · ' + clsName;

    const sel = document.getElementById('pp-resource-select');
    const thumbs = document.getElementById('pp-thumbs');
    const status = document.getElementById('pp-status');
    thumbs.innerHTML = '';
    sel.innerHTML = '<option value="">…</option>';
    status.textContent = 'Loading your resources…';
    modal.classList.remove('hidden');

    // Self-heal a stale library: if we see no viewable PDFs, re-pull from the
    // cloud in case files were uploaded/attached after this session loaded.
    let pdfs = pickablePdfDocs(subject);
    if (pdfs.length === 0 && typeof loadCurriculumDocs === 'function') {
        try { await loadCurriculumDocs(); } catch (e) { console.warn('picker refresh failed:', e.message); }
        pdfs = pickablePdfDocs(subject);
    }

    if (pdfs.length === 0) {
        sel.innerHTML = '<option value="">— none available —</option>';
        status.innerHTML = 'No viewable PDFs found. A PDF shows up here once its original file is stored — use 📎 Attach (or re-upload it) in the AI tab → Curriculum Library. If you just did that, refresh the page.';
        updatePpCount();
        return;
    }
    sel.innerHTML = '<option value="">— choose a resource —</option>' +
        pdfs.map(d => `<option value="${d.id}">${escHtml(d.name)}${subject && d.subject === subject ? ' ★' : ''}</option>`).join('');
    status.textContent = `Choose a resource above to view its pages. (${pdfs.length} available)`;
    updatePpCount();
}

// Render a chosen resource's pages as tappable thumbnails
async function pagePickerLoadResource(resourceId) {
    await Promise.all([ensureLib('pdfjs')]);
    if (!resourceId) { document.getElementById('pp-thumbs').innerHTML = ''; return; }
    const doc = curriculumDocs.find(d => d.id === resourceId);
    if (!doc || !doc.storageUrl) { showToast('That resource has no viewable file.'); return; }
    _ppCtx.resourceId = resourceId;

    // Seed from any existing selection for this slot + resource
    const existing = (_ppStore(_ppCtx.scope)[_ppCtx.storeKey] || []).find(s => s.resourceId === resourceId);
    _ppCtx.selected = new Set(existing?.pages || []);

    const thumbs = document.getElementById('pp-thumbs');
    const status = document.getElementById('pp-status');
    thumbs.innerHTML = '';
    status.textContent = 'Loading pages…';

    try {
        if (typeof initPdfWorker === 'function') initPdfWorker();
        const resp = await fetch(doc.storageUrl);
        if (!resp.ok) throw new Error('could not fetch file');
        const buf = await resp.arrayBuffer();
        // v6.5.0: free the previous PDF, and stop an older render loop if the
        // teacher switched resources mid-way (thumbnails used to mix).
        const runId = (_ppCtx.runId = (_ppCtx.runId || 0) + 1);
        try { _ppCtx.pdf?.destroy(); } catch (_) {}
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
        if (runId !== _ppCtx.runId) { pdf.destroy(); return; }
        _ppCtx.pdf = pdf;
        _ppCtx.numPages = pdf.numPages;
        const cap = Math.min(pdf.numPages, 300); // safety ceiling only
        for (let p = 1; p <= cap; p++) {
            if (runId !== _ppCtx.runId) return;
            status.textContent = `Rendering pages… ${p} / ${cap}`;
            try {
                const page = await pdf.getPage(p);
                const viewport = page.getViewport({ scale: 0.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                const url = canvas.toDataURL('image/jpeg', 0.7);
                const div = document.createElement('div');
                div.className = 'pp-thumb' + (_ppCtx.selected.has(p) ? ' selected' : '');
                div.dataset.page = p;
                div.innerHTML = `<img src="${url}" alt="page ${p}"><div class="pp-thumb-num">${p}</div><div class="pp-thumb-check">✓</div>`;
                div.onclick = () => togglePpThumb(div);
                thumbs.appendChild(div);
            } catch (pageErr) {
                // A single bad page must NOT stop the rest — add a selectable placeholder.
                console.warn('page render failed:', p, pageErr.message);
                const div = document.createElement('div');
                div.className = 'pp-thumb pp-thumb-failed' + (_ppCtx.selected.has(p) ? ' selected' : '');
                div.dataset.page = p;
                div.innerHTML = `<div class="pp-thumb-fail">Page ${p}<span>preview unavailable</span></div><div class="pp-thumb-num">${p}</div><div class="pp-thumb-check">✓</div>`;
                div.onclick = () => togglePpThumb(div);
                thumbs.appendChild(div);
            }
        }
        status.textContent = pdf.numPages > cap
            ? `Showing first ${cap} of ${pdf.numPages} pages. Tap pages to select.`
            : `${pdf.numPages} page${pdf.numPages !== 1 ? 's' : ''}. Tap pages to select.`;
        updatePpCount();
    } catch (e) {
        console.error('pagePickerLoadResource:', e);
        status.textContent = '❌ Could not load this PDF (' + (e.message || 'error') + ').';
    }
}

function togglePpThumb(div) {
    const p = parseInt(div.dataset.page, 10);
    if (_ppCtx.selected.has(p)) { _ppCtx.selected.delete(p); div.classList.remove('selected'); }
    else { _ppCtx.selected.add(p); div.classList.add('selected'); }
    updatePpCount();
}

function pagePickerSelectAll(all) {
    document.querySelectorAll('#pp-thumbs .pp-thumb').forEach(div => {
        const p = parseInt(div.dataset.page, 10);
        if (all) { _ppCtx.selected.add(p); div.classList.add('selected'); }
        else { _ppCtx.selected.delete(p); div.classList.remove('selected'); }
    });
    updatePpCount();
}

function updatePpCount() {
    const c = document.getElementById('pp-count');
    const n = _ppCtx.selected?.size || 0;
    if (c) c.textContent = `${n} page${n !== 1 ? 's' : ''} selected`;
}

function pagePickerSave() {
    const { storeKey, scope, resourceId } = _ppCtx;
    if (!resourceId) { showToast('Choose a resource first.'); return; }
    const doc = curriculumDocs.find(d => d.id === resourceId);
    const pages = [..._ppCtx.selected].sort((a, b) => a - b);
    const store = _ppStore(scope);
    if (!store[storeKey]) store[storeKey] = [];
    // Replace any prior selection for this resource
    const arr = store[storeKey].filter(s => s.resourceId !== resourceId);
    if (pages.length > 0) arr.push({ resourceId, name: doc?.name || 'Resource', pages });
    store[storeKey] = arr;

    const host = _ppChipHost(storeKey, scope);
    if (host) host.innerHTML = subWorkChipsHTML(storeKey, scope);
    document.getElementById('page-picker-modal').classList.add('hidden');
    showToast(pages.length ? `✅ ${pages.length} page${pages.length !== 1 ? 's' : ''} added` : 'Selection cleared for that resource');
}

// Render specific page numbers of a PDF to full-size JPEG data URLs
async function renderPdfPagesByNumber(url, pageNums) {
    await Promise.all([ensureLib('pdfjs')]);
    const out = [];
    try {
        if (typeof initPdfWorker === 'function') initPdfWorker();
        const resp = await fetch(url);
        if (!resp.ok) return out;
        const buf = await resp.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
        for (const p of pageNums) {
            if (p < 1 || p > pdf.numPages) continue;
            const page = await pdf.getPage(p);
            const viewport = page.getViewport({ scale: 1.6 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            out.push(canvas.toDataURL('image/jpeg', 0.85));
        }
        try { pdf.destroy(); } catch (_) {}
    } catch (e) {
        console.warn('renderPdfPagesByNumber:', e.message);
    }
    return out;
}

// Print the hand-picked pages as a student work packet, grouped by class
async function printSubDayPickedPages(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];
    const dayClasses = classes.filter(c => c.schedule && c.schedule[dayKey] && isClassActiveOnDate(c, dateStr));
    const slots = getSortedClassSlots(dayClasses, dayKey);

    const groups = [];
    slots.forEach(({ cls, slotIndex: si, slot, slotCount }) => {
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        const sel = subWorkPages[slotKey] || [];
        if (sel.length) groups.push({ className: cls.name, sel });
    });
    printPickedPagesPacket(groups, `Student Work — ${date.toLocaleDateString('en-US')}`);
}

// Print arbitrary HTML via a hidden iframe (fallback when window.open is
// blocked, e.g. inside the packaged desktop app).
// v6.2.0: a print window that still works when pop-ups are blocked (common
// in the installed desktop app). If window.open() is refused, the HTML is
// collected and printed from a hidden iframe instead of crashing on
// win.document.
function openPrintWindow() {
    const w = window.open('', '_blank');
    if (w) return w;
    let buf = '', printed = false;
    const flush = () => { if (printed || !buf) return; printed = true; printHtmlViaIframe(buf); };
    return {
        document: {
            open() { buf = ''; printed = false; },
            write(h) { buf += h; },
            close() { flush(); },
            querySelectorAll() { return []; }
        },
        focus() {}, print() {}, close() {},
        set onload(_fn) {}, get onload() { return null; }
    };
}

function printHtmlViaIframe(html) {
    const old = document.getElementById('pk-print-frame');
    if (old) old.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'pk-print-frame';
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const d = iframe.contentWindow.document;
    d.open();
    d.write(html);
    d.close();
    setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {} }, 600);
}

// Shared: render hand-picked pages (groups = [{className, sel:[{resourceId,pages}]}]) to a print window.
async function printPickedPagesPacket(groups, title) {
    if (!groups || groups.length === 0) {
        showToast('No pages picked yet — use “➕ Pick pages” under a class.');
        return;
    }
    const win = window.open('', '_blank');
    if (win) {
        win.document.write('<!DOCTYPE html><body style="font-family:Segoe UI,Arial,sans-serif;padding:48px;color:#666;">📄 Rendering your selected pages…</body>');
        win.document.close();
    }
    showLoading();
    const lt = document.querySelector('.loading-text');
    if (lt) lt.textContent = 'Rendering selected pages…';

    try {
        let body = '';
        for (const g of groups) {
            for (const s of g.sel) {
                const doc = curriculumDocs.find(d => d.id === s.resourceId);
                if (!doc || !doc.storageUrl) continue;
                const imgs = await renderPdfPagesByNumber(doc.storageUrl, s.pages);
                imgs.forEach((src, i) => {
                    body += `<div class="pk-page"><img src="${src}"></div>`;
                });
            }
        }
        if (!body) { showToast('Could not render the selected pages.'); if (win) win.close(); return; }
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          html, body { margin:0; padding:0; }
          @page { margin:0; }
          .pk-page { page-break-after:always; page-break-inside:avoid; text-align:center; line-height:0; }
          .pk-page:last-child { page-break-after:auto; }
          /* Fit each worksheet within a single page in BOTH dimensions so it
             never overflows onto a second (near-blank) page. */
          .pk-page img { display:inline-block; width:auto; height:auto; max-width:100%; max-height:100vh; vertical-align:top; }
        </style></head><body>${body}</body></html>`;
        if (win) {
            win.document.open();
            win.document.write(html);
            win.document.close();
            // Images are inline base64, so don't wait on onload (it may have
            // already fired for the placeholder doc) — print after a short beat.
            setTimeout(() => { try { win.focus(); win.print(); } catch (e) {} }, 500);
        } else {
            // Pop-up blocked (common in the desktop app) — print via hidden iframe.
            printHtmlViaIframe(html);
        }
    } catch (e) {
        console.error('printPickedPagesPacket:', e);
        showToast('❌ Could not build the packet: ' + (e.message || 'error'));
        if (win) win.close();
    } finally {
        hideLoading();
    }
}


// ============================================================
// ANCHOR CHARTS  (Week view)
// AI reviews the week's lesson plans + curriculum and suggests a
// classroom-ready list of anchor charts to make for the week.
// Reuses the newsletter engine: callAITextStream + renderNewsletterMarkup.
// ============================================================

function openAnchorChartsModal() {
    const wk = document.getElementById('current-week')?.textContent || 'this week';
    document.getElementById('anchor-modal-title').textContent = `🖼️ Anchor Charts — ${wk}`;
    document.getElementById('anchor-output-area')?.classList.add('hidden');
    document.getElementById('anchor-status')?.classList.add('hidden');

    const note = document.getElementById('anchor-curriculum-note');
    if (note) {
        const n = curriculumDocs.length;
        note.textContent = n
            ? `Claude will use this week's plans + ${n} curriculum resource${n !== 1 ? 's' : ''}.`
            : `Claude will use this week's plans. Upload curriculum in the AI tab for richer ideas.`;
    }
    document.getElementById('anchor-charts-modal')?.classList.remove('hidden');
    showSavedAiOutput({
        id: 'anchor-charts-' + formatDate(currentWeekStart),
        statusEl: document.getElementById('anchor-status'),
        outputArea: document.getElementById('anchor-output-area'),
        outputEl: document.getElementById('anchor-output'),
        outputLabelEl: null
    });
}

// Gather this week's plans (+ a compact curriculum summary) as AI context
function buildAnchorChartContext() {
    const weekStart = currentWeekStart;
    const dayBlocks = [];
    const subjectsSeen = new Set();

    for (let i = 0; i < 5; i++) {
        const date = addDays(weekStart, i);
        const dateStr = formatDate(date);
        const dayName = ['Monday','Tuesday','Wednesday','Thursday','Friday'][i];
        const dow = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];

        if (isOffDay(dateStr)) { dayBlocks.push(`${dayName}: NO SCHOOL`); continue; }

        const dayClasses = sortClassesByTime(
            classes.filter(c => c.schedule && c.schedule[dow] && isClassActiveOnDate(c, dateStr) && c.type !== 'activity'),
            dow
        );
        const dayLessons = lessons.filter(l => l.date === dateStr);

        const lines = dayClasses.map(cls => {
            if (cls.subject) subjectsSeen.add(cls.subject);
            const lesson = mergedLessonForClass(dayLessons, cls.id);
            const parts = [`  • ${cls.name}${cls.subject ? ' (' + cls.subject + ')' : ''}`];
            if (lesson) {
                if (lesson.title) parts.push(`topic: ${lesson.title}`);
                const obj = lesson.objective || lesson.objectives;
                if (obj) parts.push(`objective: ${String(obj).substring(0, 140)}`);
                if (lesson.standards) parts.push(`standards: ${String(lesson.standards).substring(0, 100)}`);
            } else {
                parts.push('(no lesson planned)');
            }
            return parts.join(' — ');
        });

        dayBlocks.push([
            `${dayName} ${date.toLocaleDateString('en-US', { month:'short', day:'numeric' })}:`,
            ...(lines.length ? lines : ['  (no classes)'])
        ].join('\n'));
    }

    // Compact curriculum summary
    let curr = '';
    if (curriculumDocs.length) {
        const names = curriculumDocs.slice(0, 40)
            .map(d => `  • ${d.name}${d.subject ? ' [' + d.subject + ']' : ''}`).join('\n');
        curr = 'CURRICULUM LIBRARY (resources on hand):\n' + names;
        const relevant = curriculumDocs
            .filter(d => d.hasContent && d.content && d.content.length > 50 && subjectsSeen.has(d.subject))
            .slice(0, 4);
        if (relevant.length) {
            curr += '\n\nSAMPLE CURRICULUM CONTENT (excerpts):\n'
                + relevant.map(d => `--- ${d.name} ---\n${d.content.substring(0, 600)}`).join('\n\n');
        }
    }

    return `THIS WEEK'S PLANS:\n${dayBlocks.join('\n\n')}${curr ? '\n\n' + curr : ''}`;
}

async function generateAnchorCharts() {
    const providerLabel = (AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic).label;
    if (!hasEffectiveAiKey()) { showToast(`Add your ${providerLabel} API key in Settings first.`); return; }

    const statusEl   = document.getElementById('anchor-status');
    const outputArea = document.getElementById('anchor-output-area');
    const outputEl   = document.getElementById('anchor-output');
    const genBtn     = document.getElementById('anchor-generate-btn');

    const grade   = userProfile.grade ? formatGrade(userProfile.grade) : 'Grade 1';
    const teacher = userProfile.username || 'a teacher';
    const context = buildAnchorChartContext();

    const prompt = `You are ${teacher}, a ${grade} teacher. Review THIS WEEK'S lesson plans and curriculum below, then produce a practical, classroom-ready LIST of ANCHOR CHARTS that would best support students' learning this week.

An anchor chart is a poster the teacher makes and displays to "anchor" a concept, strategy, vocabulary set, or routine so students can refer back to it.

For EACH anchor chart use EXACTLY this format:
### <Chart Title>
- Purpose: <one sentence on why it helps this week's learning>
- Put on the chart: <3-6 short, concrete items — the exact words, steps, examples, or visuals to include>

Rules:
- Group charts by subject (start each subject with its own "### " title line if helpful).
- Only suggest charts that clearly connect to this week's ACTUAL lessons, objectives, or standards below.
- Aim for 5-9 charts total. Keep everything ${grade}-appropriate and concrete.
- Output ONLY the chart list — no preamble, no closing remarks.

${context}`;

    if (genBtn) genBtn.disabled = true;
    statusEl.innerHTML = `<div class="newsletter-generating"><div class="nl-spinner"></div><span>Reviewing this week's learning…</span></div>`;
    statusEl.classList.remove('hidden');
    outputArea.classList.add('hidden');

    try {
        statusEl.classList.add('hidden');
        outputEl.innerHTML = '';
        outputArea.classList.remove('hidden');
        _aiShowToken++;
        const fullText = await callAITextStream({
            prompt,
            tier: 'quality',
            maxTokens: 2000,
            onDelta: (_chunk, fullText) => {
                outputEl.innerHTML = renderNewsletterMarkup(fullText);
                outputEl.scrollTop = outputEl.scrollHeight;
            }
        });
        const wkLabel = document.getElementById('current-week')?.textContent || formatDate(currentWeekStart);
        if (await saveAiOutput('anchor-charts-' + formatDate(currentWeekStart), { type: 'anchor-charts', label: 'Anchor charts · ' + wkLabel, text: fullText })) {
            statusEl.innerHTML = `<div class="ai-saved-note">💾 Saved. They'll be here next time you open Anchor Charts for this week.</div>`;
            statusEl.classList.remove('hidden');
        }
        showToast('🖼️ Anchor charts ready!');
    } catch (err) {
        console.error('generateAnchorCharts:', err);
        statusEl.innerHTML = `<div class="newsletter-error">❌ ${err.message || 'Generation failed. Check your API key.'}</div>`;
        statusEl.classList.remove('hidden');
        outputArea.classList.add('hidden');
    } finally {
        if (genBtn) genBtn.disabled = false;
    }
}

function printAnchorCharts() {
    const el = document.getElementById('anchor-output');
    if (!el || !el.innerHTML.trim()) { showToast('Generate anchor charts first.'); return; }
    const wk = document.getElementById('current-week')?.textContent || '';
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Anchor Charts</title>
<style>
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:14px; color:#222; max-width:none; margin:0 auto; padding:24px 0; }
  @page { margin:0.6in; }
  h1 { font-size:22px; color:#7B5EA7; border-bottom:3px solid #7B5EA7; padding-bottom:8px; margin-bottom:4px; }
  h3.newsletter-section-heading { font-size:15px; color:#7B5EA7; margin:22px 0 8px; }
  .meta { font-size:12px; color:#888; margin-bottom:24px; }
  p { line-height:1.6; margin-bottom:12px; }
  ul.newsletter-bullets { margin:0 0 16px; padding-left:22px; }
  ul.newsletter-bullets li { line-height:1.5; margin-bottom:5px; }
  .footer { font-size:11px; color:#aaa; margin-top:32px; border-top:1px solid #eee; padding-top:10px; }
</style></head><body>
<h1>🖼️ Anchor Charts</h1>
<div class="meta">${wk}</div>
${el.innerHTML}
</body></html>`, {v:'0.5in',h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 400);
}


// ============================================================
// EMERGENCY SUB PLANS  (Week view)
// Up to 5 ready-to-go weekday plans (Mon–Fri), each auto-built from
// that weekday's class schedule, with hand-picked student-work pages
// (via the shared page picker). User-scoped: persists across years.
// ============================================================

let emergencySubPlans = { general: {}, days: {} };

const ES_DOWS = ['mon','tue','wed','thu','fri'];
const ES_DOW_LABELS = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday' };
const ES_GENERAL_FIELDS = [
    'es-teacher-name','es-room-grade','es-school',
    'es-morning','es-attendance','es-lunch','es-end-of-day',
    'es-restroom','es-early-finishers','es-behavior',
    'es-medical','es-student-notes','es-helpers',
    'es-neighbor','es-office','es-contact-notes',
    'es-materials-location','es-feedback-prompt'
];
// es- field -> matching saved sub-default key (reuse the teacher's sub defaults)
const ES_DEFAULT_MAP = {
    'es-teacher-name':'sub-teacher-name','es-room-grade':'sub-room-grade','es-school':'sub-school',
    'es-morning':'sub-morning','es-attendance':'sub-attendance','es-lunch':'sub-lunch','es-end-of-day':'sub-end-of-day',
    'es-restroom':'sub-restroom','es-early-finishers':'sub-early-finishers','es-behavior':'sub-behavior-system',
    'es-medical':'sub-medical','es-student-notes':'sub-student-notes','es-helpers':'sub-helpers',
    'es-neighbor':'sub-neighbor','es-office':'sub-office','es-contact-notes':'sub-contact-notes',
    'es-materials-location':'sub-materials-location','es-feedback-prompt':'sub-feedback-prompt'
};

async function loadEmergencySubPlans() {
    if (!currentUser) return;
    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('emergencySubPlans').get();
        emergencySubPlans = doc.exists ? (doc.data() || {}) : {};
    } catch (e) {
        console.warn('loadEmergencySubPlans:', e.message);
        emergencySubPlans = {};
    }
    if (!emergencySubPlans.general) emergencySubPlans.general = {};
    if (!emergencySubPlans.days) emergencySubPlans.days = {};
}

function openEmergencySubPlans() {
    const modal = document.getElementById('emergency-sub-modal');
    if (!modal) return;
    const g = emergencySubPlans.general || {};

    ES_GENERAL_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const savedKey = id.replace('es-', '');
        let val = g[savedKey];
        if (val === undefined || val === '') {
            const defKey = ES_DEFAULT_MAP[id];
            if (defKey && typeof subDayDefaults !== 'undefined' && subDayDefaults[defKey] !== undefined) val = subDayDefaults[defKey];
        }
        el.value = val || '';
    });

    // Profile fallbacks
    const nameEl = document.getElementById('es-teacher-name');
    if (nameEl && !nameEl.value) nameEl.value = userProfile.username || '';
    const schoolEl = document.getElementById('es-school');
    if (schoolEl && !schoolEl.value) schoolEl.value = userProfile.school || '';
    const gradeEl = document.getElementById('es-room-grade');
    if (gradeEl && !gradeEl.value && userProfile.grade) gradeEl.value = formatGrade(userProfile.grade) || '';
    const fbEl = document.getElementById('es-feedback-prompt');
    if (fbEl && !fbEl.value) fbEl.value = 'Please leave a note describing how the day went, any concerns, or anything not completed. Thank you so much!';

    emergencyWorkPages = {}; // reset picker working state
    const firstWithClasses = ES_DOWS.find(d => classes.some(c => c.schedule && c.schedule[d])) || 'mon';
    modal.dataset.dow = '';
    switchEmergencyDay(firstWithClasses);
    modal.classList.remove('hidden');
}

function switchEmergencyDay(dow) {
    const modal = document.getElementById('emergency-sub-modal');
    if (!modal) return;
    const prev = modal.dataset.dow;
    if (prev && prev !== dow) captureEmergencyDayIntoState(prev);
    modal.dataset.dow = dow;
    document.querySelectorAll('.es-day-tab').forEach(t => t.classList.toggle('active', t.dataset.dow === dow));
    renderEmergencyDayBlocks(dow);
}

function renderEmergencyDayBlocks(dow) {
    const container = document.getElementById('es-day-blocks');
    const emptyEl = document.getElementById('es-day-empty');
    if (!container) return;

    const dayClasses = classes.filter(cls => cls.schedule && cls.schedule[dow]);
    const slots = getSortedClassSlots(dayClasses, dow);
    const savedDay = emergencySubPlans.days?.[dow]?.periods || {};

    if (slots.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    container.innerHTML = slots.map(({ cls, slotIndex: si, slot, slotCount }) => {
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        const storeKey = `${dow}::${slotKey}`;
        // Seed picker working state from saved
        emergencyWorkPages[storeKey] = (savedDay[slotKey]?.workPages) || [];
        const timeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dow);
        const sessionLabel = slotCount > 1 ? ` · Session ${si + 1}` : '';
        const saved = savedDay[slotKey] || {};
        const everyOther = cls.everyOtherWeek
            ? `<span class="es-eow-badge" title="This class meets every other week — check the date before using this plan.">↔ every other week</span>` : '';

        return `
        <div class="es-period-block" data-slot-key="${slotKey}" data-class-id="${cls.id}" style="border-left:4px solid ${cls.color || '#FF6B9D'}">
            <div class="es-period-head">
                <div class="es-period-dot" style="background:${cls.color || '#FF6B9D'}"></div>
                <div class="es-period-title">
                    <strong>${escHtml(cls.name)}${sessionLabel}</strong>
                    <span class="es-period-time">${escHtml(timeStr)}${cls.room ? ' · ' + escHtml(cls.room) : ''}</span>
                </div>
                ${everyOther}
            </div>
            <div class="form-group">
                <label>📌 Generic Sub Instructions <span class="subwork-hint">(shared with this class's Sub Day plans)</span></label>
                <textarea class="form-control es-period-instructions" rows="2"
                    placeholder="What should the sub do this period, no matter the date?">${escHtml((subClassDefaults[cls.id]?.instructions) || saved.instructions || '')}</textarea>
            </div>
            <div class="subwork-section">
                <div class="subwork-head">
                    <label>📄 Student Work Pages <span class="subwork-hint">(hand-pick actual PDF pages)</span></label>
                    <button type="button" class="btn btn-ghost btn-xs" onclick="openPagePicker('${slotKey}','emergency','${dow}')">➕ Pick pages</button>
                </div>
                <div class="subwork-chips">${subWorkChipsHTML(storeKey, 'emergency')}</div>
            </div>
        </div>`;
    }).join('');
}

function captureEmergencyDayIntoState(dow) {
    if (!emergencySubPlans.days) emergencySubPlans.days = {};
    const periods = {};
    document.querySelectorAll('#es-day-blocks .es-period-block').forEach(block => {
        const slotKey = block.dataset.slotKey;
        const classId = block.dataset.classId;
        const storeKey = `${dow}::${slotKey}`;
        const instr = block.querySelector('.es-period-instructions')?.value || '';
        // Generic instructions are per-class and SHARED with the Sub Day builder
        // (both read/write subClassDefaults[classId].instructions).
        if (classId) {
            if (!subClassDefaults[classId]) subClassDefaults[classId] = {};
            subClassDefaults[classId].instructions = instr;
        }
        periods[slotKey] = { workPages: emergencyWorkPages[storeKey] || [] };
    });
    emergencySubPlans.days[dow] = { periods };
}

function captureEmergencyGeneralIntoState() {
    const g = {};
    ES_GENERAL_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) g[id.replace('es-', '')] = el.value;
    });
    emergencySubPlans.general = g;
}

async function saveEmergencySubPlans() {
    const modal = document.getElementById('emergency-sub-modal');
    if (!currentUser) { showToast('Sign in to save.'); return; }
    captureEmergencyGeneralIntoState();
    if (modal?.dataset.dow) captureEmergencyDayIntoState(modal.dataset.dow);

    const payload = {
        general: emergencySubPlans.general || {},
        days: emergencySubPlans.days || {},
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const clean = JSON.parse(JSON.stringify(payload, (k, v) => v === undefined ? null : v));
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('emergencySubPlans').set(clean, { merge: true });
        // Persist the shared per-class generic instructions too, so Sub Day sees them.
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('subClassDefaults').set(subClassDefaults, { merge: true });
        emergencySubPlans = { ...emergencySubPlans, general: clean.general, days: clean.days };
        showToast('✅ Emergency sub plans saved!');
    } catch (e) {
        console.error('saveEmergencySubPlans:', e);
        showToast('❌ Could not save: ' + (e.code || e.message || 'Unknown error'));
    }
}

// ── Printing: instruction packet per weekday ──
function buildEmergencyDayPrintHtml(dow) {
    // v6.0.2: the form saves kebab-case keys ('teacher-name', 'end-of-day'…)
    // but this printout reads camelCase (g.teacherName, g.endOfDay…), so most
    // of the general section printed blank. Read both spellings.
    const rawG = emergencySubPlans.general || {};
    const g = {};
    Object.keys(rawG).forEach(k => {
        g[k] = rawG[k];
        g[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = rawG[k];
    });
    const label = ES_DOW_LABELS[dow] || dow;
    const S = sanitizeForPDF;

    const dayClasses = classes.filter(cls => cls.schedule && cls.schedule[dow]);
    const slots = getSortedClassSlots(dayClasses, dow);
    const periods = emergencySubPlans.days?.[dow]?.periods || {};

    const scheduleHtml = slots.length === 0
        ? '<p style="color:#999;font-style:italic;padding:8px 0;">No classes scheduled for ' + S(label) + '.</p>'
        : slots.map(({ cls, slotIndex: si, slot, slotCount }) => {
            const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
            const timeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dow);
            const sessionLabel = slotCount > 1 ? ' · Session ' + (si + 1) : '';
            const p = periods[slotKey] || {};
            const instrText = (subClassDefaults[cls.id]?.instructions) || p.instructions || '';
            const instr = instrText
                ? '<p style="margin:0 0 6px;white-space:pre-wrap;font-size:13px;">' + S(instrText) + '</p>'
                : '<p style="color:#999;font-size:13px;font-style:italic;">See attached student work pages.</p>';
            const workNote = (p.workPages && p.workPages.length)
                ? '<p style="margin:4px 0;font-size:11px;color:#8e44ad;">📄 Student work: ' + p.workPages.map(w => S(w.name)).join(', ') + ' (see Student Work packet)</p>' : '';
            return '<div style="border-left:5px solid ' + (cls.color || '#FF6B9D') + ';margin-bottom:14px;padding:12px 16px;background:#fafafa;border-radius:4px;page-break-inside:avoid;">'
                + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
                + '<div style="width:14px;height:14px;border-radius:50%;background:' + (cls.color || '#FF6B9D') + ';"></div>'
                + '<strong style="font-size:15px;">' + S(cls.name) + sessionLabel + '</strong>'
                + '<span style="color:#666;font-size:13px;">' + S(timeStr) + (cls.room ? ' · ' + S(cls.room) : '') + '</span>'
                + '</div>' + instr + workNote + '</div>';
        }).join('');

    const field = (val) => val ? '<div class="pf"><div class="pv">' + S(val) + '</div></div>' : '';
    const labeled = (lab, val) => val ? '<div class="pf"><div class="pl">' + lab + '</div><div class="pv">' + S(val) + '</div></div>' : '';

    return `
<div class="es-packet">
  <div class="es-head">
    <div class="es-head-left"><div class="es-badge">🆘 EMERGENCY SUB PLAN</div><h1>${S(label)}</h1></div>
    <div class="es-head-right">
      ${g.teacherName ? '<div class="ir"><strong>Teacher:</strong> ' + S(g.teacherName) + '</div>' : ''}
      ${g.roomGrade ? '<div class="ir"><strong>Room / Grade:</strong> ' + S(g.roomGrade) + '</div>' : ''}
      ${g.school ? '<div class="ir"><strong>School:</strong> ' + S(g.school) + '</div>' : ''}
    </div>
  </div>
  <div class="sec b"><h2>🌅 Morning Routine</h2>${field(g.morning)}${labeled('Attendance', g.attendance)}${labeled('Lunch Count', g.lunch)}${(!g.morning && !g.attendance && !g.lunch) ? '<div class="pf"><div class="pv em">Follow the posted morning routine.</div></div>' : ''}</div>
  <div class="sec g"><h2>📋 Classroom Procedures</h2>${labeled('Restroom', g.restroom)}${labeled('Early Finishers', g.earlyFinishers)}${labeled('Behavior System', g.behavior)}</div>
  <div class="sec r"><h2>⚠️ Student Alerts</h2>${labeled('Medical / Allergy', g.medical)}${labeled('Behavioral Notes', g.studentNotes)}${labeled('Helpers / Leaders', g.helpers)}</div>
  <div class="sec o"><h2>🗂️ Where to Find Things</h2>${g.materialsLocation ? field(g.materialsLocation) : '<div class="pf"><div class="pv em">See the desk for the emergency folder.</div></div>'}</div>
  <div class="sec p"><h2>🗓️ ${S(label)} Schedule &amp; Instructions</h2>${scheduleHtml}</div>
  <div class="sec b"><h2>🌇 End of Day</h2>${g.endOfDay ? field(g.endOfDay) : '<div class="pf"><div class="pv em">Follow the posted end-of-day routine.</div></div>'}</div>
  <div class="sec r"><h2>📞 Emergency Contacts</h2>${labeled('Neighbor / Go-To Teacher', g.neighbor)}${labeled('Office / Admin', g.office)}${labeled('Other', g.contactNotes)}</div>
  <div class="es-feedback">
    <h2>📝 Please Leave a Note for ${g.teacherName ? S(g.teacherName) : 'the Teacher'}</h2>
    <p style="font-size:12px;color:#555;margin-bottom:10px;">${g.feedbackPrompt ? S(g.feedbackPrompt) : 'Please leave a note about how the day went and anything not completed.'}</p>
    <div class="fl"></div><div class="fl"></div><div class="fl"></div><div class="fl"></div>
  </div>
  <div class="es-foot"><span>Emergency Sub Plan · ${S(label)}</span><span>Thank you for being here today! 💙</span></div>
</div>`;
}

function emergencyPrintShell(bodyHtml, titleText) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${titleText}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; color:#222; background:#fff; }
  @page { margin:0.4in 0.45in; }
  .es-packet { page-break-after:always; }
  .es-packet:last-child { page-break-after:auto; }
  .es-head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #8e44ad; padding-bottom:8px; margin-bottom:12px; }
  .es-badge { display:inline-block; font-size:9px; font-weight:700; letter-spacing:0.5px; color:#fff; background:#8e44ad; padding:2px 7px; border-radius:3px; margin-bottom:4px; }
  .es-head-left h1 { font-size:22px; color:#8e44ad; }
  .es-head-right { text-align:right; }
  .es-head-right .ir { font-size:11px; color:#444; margin-bottom:2px; }
  .sec { margin-bottom:10px; }
  .sec h2 { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:#fff; background:#2c3e50; padding:3px 7px; border-radius:2px; margin-bottom:5px; }
  .sec.b h2 { background:#2980b9; } .sec.g h2 { background:#27ae60; } .sec.o h2 { background:#e67e22; }
  .sec.r h2 { background:#c0392b; } .sec.p h2 { background:#e91e8c; }
  .pf { margin-bottom:4px; } .pl { font-weight:700; font-size:9px; color:#666; margin-bottom:1px; }
  .pv { font-size:11px; color:#222; white-space:pre-wrap; line-height:1.4; } .pv.em { color:#aaa; font-style:italic; }
  .es-feedback { margin-top:12px; border:2px dashed #8e44ad; padding:8px; border-radius:4px; page-break-inside:avoid; }
  .es-feedback h2 { font-size:11px; color:#8e44ad; margin-bottom:5px; }
  .fl { border-bottom:1px solid #ddd; height:20px; margin-bottom:3px; }
  .es-foot { margin-top:10px; border-top:1px solid #ddd; padding-top:6px; display:flex; justify-content:space-between; font-size:9px; color:#999; }
</style></head><body>${bodyHtml}</body></html>`;
}

function printEmergencyDay() {
    const modal = document.getElementById('emergency-sub-modal');
    const dow = modal?.dataset.dow || 'mon';
    captureEmergencyGeneralIntoState();
    captureEmergencyDayIntoState(dow);
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(emergencyPrintShell(buildEmergencyDayPrintHtml(dow), (ES_DOW_LABELS[dow] || dow) + ' Emergency Sub Plan'), {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => { setTimeout(() => { win.focus(); win.print(); }, 300); };
}

function printEmergencyAll() {
    const modal = document.getElementById('emergency-sub-modal');
    captureEmergencyGeneralIntoState();
    if (modal?.dataset.dow) captureEmergencyDayIntoState(modal.dataset.dow);
    const usable = ES_DOWS.filter(d => classes.some(c => c.schedule && c.schedule[d]));
    const dows = usable.length ? usable : ['mon'];
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(emergencyPrintShell(dows.map(buildEmergencyDayPrintHtml).join('\n'), 'Emergency Sub Plans'), {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => { setTimeout(() => { win.focus(); win.print(); }, 300); };
}

// Print the hand-picked student work pages (this day or all 5) via the shared printer
function printEmergencyStudentWork(allDays) {
    const modal = document.getElementById('emergency-sub-modal');
    if (modal?.dataset.dow) captureEmergencyDayIntoState(modal.dataset.dow);
    const dows = allDays
        ? ES_DOWS.filter(d => classes.some(c => c.schedule && c.schedule[d]))
        : [modal?.dataset.dow || 'mon'];
    const groups = [];
    dows.forEach(dow => {
        const dayClasses = classes.filter(c => c.schedule && c.schedule[dow]);
        const savedDay = emergencySubPlans.days?.[dow]?.periods || {};
        getSortedClassSlots(dayClasses, dow).forEach(({ cls, slotIndex: si, slotCount }) => {
            const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
            const storeKey = `${dow}::${slotKey}`;
            const sel = emergencyWorkPages[storeKey] || savedDay[slotKey]?.workPages || [];
            if (sel.length) groups.push({ className: (allDays ? ES_DOW_LABELS[dow] + ' · ' : '') + cls.name, sel });
        });
    });
    printPickedPagesPacket(groups, allDays ? 'Emergency Student Work — All Days' : (ES_DOW_LABELS[modal?.dataset.dow] || 'Emergency') + ' — Student Work');
}


// ============================================================
// PROFILE VIEW
// ============================================================

let _profilePrevView = 'calendar'; // which view to return to on back

function openProfileView() {
    _profilePrevView = document.querySelector('.view.active')?.id?.replace('-view','') || 'calendar';
    populateProfileView();
    // Switch all views to hidden, show profile
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
    const pv = document.getElementById('profile-view');
    pv.classList.remove('hidden');
    pv.classList.add('active');
    // Deactivate nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

function closeProfileView() {
    document.getElementById('profile-view').classList.remove('active');
    document.getElementById('profile-view').classList.add('hidden');
    switchView(_profilePrevView);
}

function populateProfileView() {
    const emailEl = document.getElementById('account-email');
    if (emailEl && currentUser) emailEl.textContent = currentUser.email || '';
    const p = settings.userProfile || {};
    const _s = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    _s('pm-display-name', p.displayName);
    _s('pm-nickname',     p.nickname);
    _s('pm-grade',        p.grade);
    _s('pm-role',         p.role);
    _s('pm-school',       p.school);
    _s('pm-district',     p.district);
    _s('pm-birthday',     p.birthday);
    _s('pm-years-teaching', p.yearsTeaching != null ? String(p.yearsTeaching) : '');
    _s('pm-subjects',     p.subjects);
    _s('pm-room',         p.room);
    _s('pm-bio',          p.bio);
    _s('pm-bitmoji-url',     p.avatarUrl      || '');
    _s('pm-start-teaching-date', p.startTeachingDate || '');
    _s('pm-retirement-date',    p.retirementDate    || '');
    _s('pm-days-per-year',   p.daysPerYear ? String(p.daysPerYear) : '');
    applyProfileAvatar(p.avatarUrl || '');
    // Restore last retirement calculation if available
    if (p.lastCalc) {
        const _c = p.lastCalc;
        if (_c.experience) {
            const _expEl = document.getElementById('experience-result');
            if (_expEl) renderStatsCard(_expEl, _c.experience, 'experience');
        }
        if (_c.countdown) {
            const _retEl = document.getElementById('retirement-result');
            if (_retEl) renderStatsCard(_retEl, _c.countdown, 'countdown');
        }
    }
}

function applyProfileAvatar(url) {
    // Update profile-view avatar
    const img = document.getElementById('pm-avatar-img');
    const ph  = document.getElementById('pm-avatar-placeholder');
    if (img && ph) {
        if (url) { img.src = url; img.classList.remove('hidden'); ph.classList.add('hidden'); }
        else      { img.src = ''; img.classList.add('hidden');    ph.classList.remove('hidden'); }
    }
    // Update header pill avatar
    const hImg = document.getElementById('user-avatar-img');
    const hPh  = document.getElementById('user-avatar-placeholder');
    if (hImg && hPh) {
        if (url) { hImg.src = url; hImg.classList.remove('hidden'); hPh.classList.add('hidden'); }
        else      { hImg.src = ''; hImg.classList.add('hidden');    hPh.classList.remove('hidden'); }
    }
}

async function saveProfile() {
    const _g = id => document.getElementById(id)?.value?.trim() || '';
    const p = {
        displayName:    _g('pm-display-name'),
        nickname:       _g('pm-nickname'),
        grade:          _g('pm-grade'),
        role:           _g('pm-role'),
        school:         _g('pm-school'),
        district:       _g('pm-district'),
        birthday:       _g('pm-birthday'),
        yearsTeaching:  parseInt(_g('pm-years-teaching')) || 0,
        subjects:       _g('pm-subjects'),
        room:           _g('pm-room'),
        bio:            _g('pm-bio'),
        avatarUrl:      settings.userProfile?.avatarUrl || _g('pm-bitmoji-url'),
        startTeachingDate: _g('pm-start-teaching-date'),
        retirementDate:    _g('pm-retirement-date'),
        daysPerYear:       parseInt(_g('pm-days-per-year')) || 0,
        lastCalc:          settings.userProfile?.lastCalc || null,
    };
    // Bitmoji URL field overrides stored value if filled
    const urlField = _g('pm-bitmoji-url');
    if (urlField) p.avatarUrl = urlField;

    settings.userProfile = p;

    // Update header pill text
    const _nt = document.getElementById('user-name-text');
    if (_nt) _nt.textContent = p.nickname || p.displayName || _nt.textContent;

    applyProfileAvatar(p.avatarUrl || '');

    if (!currentUser) { showToast('Not signed in'); return; }
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear')
            .set({ userProfile: p }, { merge: true });

        // Also sync public-facing fields to the top-level users/{uid} doc.
        // Cross-user features (friends, principal links) read THIS doc, so it
        // must stay in sync with the live pm-* profile system.
        await db.collection('users').doc(currentUser.uid).set({
            email: currentUser.email,
            displayName: p.displayName || currentUser.displayName || '',
            username: p.nickname || p.displayName || '',
            role: p.role || '',
            grade: p.grade || '',
            school: p.school || '',
            district: p.district || '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Keep the in-memory global in sync so isPrincipal() etc. work immediately
        userProfile = { ...userProfile,
            username: p.nickname || p.displayName || userProfile.username,
            role: p.role || '',
            grade: p.grade || '',
            school: p.school || '',
            district: p.district || ''
        };
        initPrincipalView();

        showToast('✅ Profile saved');
        closeProfileView();
    } catch (e) {
        console.error('Profile save error', e);
        showToast('Error saving profile: ' + e.message);
    }
}

// Wire up profile view buttons (elements always in DOM — no lazy getter needed)
document.getElementById('user-name')?.addEventListener('click', openProfileView);
document.getElementById('profile-back-btn')?.addEventListener('click', closeProfileView);
document.getElementById('profile-save-btn')?.addEventListener('click', saveProfile);

// Photo upload
document.getElementById('pm-upload-btn')?.addEventListener('click', () => {
    document.getElementById('pm-photo-input').click();
});
document.getElementById('pm-change-photo-btn')?.addEventListener('click', () => {
    document.getElementById('pm-photo-input').click();
});
document.getElementById('pm-photo-input')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Compress before storing: resize to max 256px via canvas
    const reader = new FileReader();
    reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
            const MAX = 256;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            if (!settings.userProfile) settings.userProfile = {};
            settings.userProfile.avatarUrl = dataUrl;
            document.getElementById('pm-bitmoji-url').value = '';
            applyProfileAvatar(dataUrl);
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

// Bitmoji URL live preview
document.getElementById('pm-bitmoji-url')?.addEventListener('input', e => {
    const url = e.target.value.trim();
    applyProfileAvatar(url);
    if (settings.userProfile) settings.userProfile.avatarUrl = url;
});


// ============================================================
// RETIREMENT COUNTDOWN
// ============================================================

document.getElementById('pm-calc-retirement-btn')?.addEventListener('click', calculateTeachingStats);

async function calculateTeachingStats() {
    const startDate      = document.getElementById('pm-start-teaching-date')?.value;
    const retirementDate = document.getElementById('pm-retirement-date')?.value;
    const daysPerYear    = parseInt(document.getElementById('pm-days-per-year')?.value) || 0;
    const expEl          = document.getElementById('experience-result');
    const retEl          = document.getElementById('retirement-result');

    if (!daysPerYear || daysPerYear < 1) { showToast('Enter school days per year'); return; }
    if (!startDate && !retirementDate)    { showToast('Enter at least one date'); return; }
    if (!hasEffectiveAiKey())             { showToast('Add an API key in the AI tab'); return; }

    const loading = '<div class="stats-calculating">🤖 Calculating…</div>';
    if (startDate   && expEl) { expEl.classList.remove('hidden'); expEl.innerHTML = loading; }
    if (retirementDate && retEl) { retEl.classList.remove('hidden'); retEl.innerHTML = loading; }

    const today       = new Date();
    const todayStr    = formatDate(today);
    const currentSY   = settings.schoolYear || '2025-2026';
    const yearStart   = settings.yearStart  || (currentSY.split('-')[0] + '-08-01');
    const yearEnd     = settings.yearEnd    || (currentSY.split('-')[1] + '-05-25');
    const dpm         = (daysPerYear / 10).toFixed(2);   // school days per month (10 month school year)

    const prompt = `You are a precise school-days calculator for a teacher's career stats.

TODAY: ${todayStr}
SCHOOL YEAR: ${currentSY}  (runs approx ${yearStart} – ${yearEnd})
SCHOOL DAYS PER YEAR: ${daysPerYear}
Derived: days per month = ${dpm} (${daysPerYear}÷10), days per week = 5

${startDate ? `TEACHING START DATE: ${startDate}` : ''}
${retirementDate ? `TARGET RETIREMENT DATE: ${retirementDate}` : ''}

INSTRUCTIONS:
For each date range, count school days by:
1. Days remaining/elapsed in the CURRENT/STARTING partial school year
2. Complete full school years × ${daysPerYear}
3. Days in any ENDING partial school year
Then derive weeks (÷5), months (÷${dpm}), years (÷${daysPerYear}) — round to 1 decimal.

Return ONLY valid compact JSON, NO markdown:
{
  ${startDate ? `"experience": {
    "totalDays": <int>,
    "totalWeeks": <number 1dp>,
    "totalMonths": <number 1dp>,
    "totalYears": <number 1dp>,
    "message": "<one inspiring sentence about their teaching journey so far>"
  }` : ''}${startDate && retirementDate ? ',' : ''}
  ${retirementDate ? `"countdown": {
    "totalDays": <int>,
    "totalWeeks": <number 1dp>,
    "totalMonths": <number 1dp>,
    "totalYears": <number 1dp>,
    "retirementYear": <int>,
    "message": "<one motivating sentence mentioning when they retire>"
  }` : ''}
}`;

    try {
        const raw    = (await callAIText({ prompt, tier: 'fast', maxTokens: 600 })).replace(/```json|```/g, '').trim();

        const result = JSON.parse(raw);

        // Cache to profile
        if (!settings.userProfile) settings.userProfile = {};
        settings.userProfile.startTeachingDate = startDate || settings.userProfile.startTeachingDate;
        settings.userProfile.retirementDate    = retirementDate || settings.userProfile.retirementDate;
        settings.userProfile.daysPerYear       = daysPerYear;
        settings.userProfile.lastCalc          = { ...result, calcDate: todayStr };
        // v6.3.0: keep the result even if the profile form is never saved
        if (currentUser) {
            db.collection('users').doc(currentUser.uid).collection('settings').doc('schoolYear')
                .set({ userProfile: settings.userProfile }, { merge: true })
                .catch(e => console.warn('save teaching stats:', e.message));
        }

        if (result.experience && expEl) renderStatsCard(expEl, result.experience, 'experience');
        if (result.countdown  && retEl) renderStatsCard(retEl, result.countdown,  'countdown');

    } catch (e) {
        console.error('Teaching stats error:', e);
        const errHtml = `<div class="stats-calculating" style="color:var(--neon-pink)">Error: ${e.message}</div>`;
        if (expEl && !expEl.classList.contains('hidden')) expEl.innerHTML = errHtml;
        if (retEl && !retEl.classList.contains('hidden')) retEl.innerHTML = errHtml;
    }
}

function renderStatsCard(el, data, type) {
    const isCountdown  = type === 'countdown';
    const icon         = isCountdown ? '🎓' : '👩‍🏫';
    const titleText    = isCountdown ? 'Until Retirement' : 'Teaching Experience';
    const accent       = isCountdown ? 'var(--neon-pink)' : 'var(--cyan-blue)';

    el.classList.remove('hidden');
    el.innerHTML = `
        <div class="stats-card-title" style="color:${accent}">${icon} ${titleText}</div>
        <div class="stats-grid-4">
            <div class="stats-cell primary">
                <div class="stats-big">${Number(data.totalYears).toLocaleString()}</div>
                <div class="stats-unit">Years</div>
            </div>
            <div class="stats-cell">
                <div class="stats-num">${Number(data.totalMonths).toLocaleString()}</div>
                <div class="stats-unit">School Months</div>
            </div>
            <div class="stats-cell">
                <div class="stats-num">${Number(data.totalWeeks).toLocaleString()}</div>
                <div class="stats-unit">School Weeks</div>
            </div>
            <div class="stats-cell">
                <div class="stats-num">${Number(data.totalDays).toLocaleString()}</div>
                <div class="stats-unit">School Days</div>
            </div>
        </div>
        <div class="stats-message">${data.message || ''}</div>
    `;
}


// ============================================================
// STANDARDS ALIGNMENT (CCSS)
// ============================================================

const CCSS = {
  ela: {
    'RL': {
      label: 'Reading: Literature',
      K: [
        ['CCSS.ELA-LITERACY.RL.K.1','Ask & answer questions about key details.'],
        ['CCSS.ELA-LITERACY.RL.K.2','Retell familiar stories with key details.'],
        ['CCSS.ELA-LITERACY.RL.K.3','Identify characters, settings, and major events.'],
        ['CCSS.ELA-LITERACY.RL.K.4','Ask & answer questions about unknown words.'],
        ['CCSS.ELA-LITERACY.RL.K.5','Recognize common types of texts.'],
        ['CCSS.ELA-LITERACY.RL.K.6','Name the author and illustrator.'],
        ['CCSS.ELA-LITERACY.RL.K.9','Compare & contrast adventures of characters.'],
        ['CCSS.ELA-LITERACY.RL.K.10','Actively engage with group reading.'],
      ],
      '1': [
        ['CCSS.ELA-LITERACY.RL.1.1','Ask & answer questions about key details in a text.'],
        ['CCSS.ELA-LITERACY.RL.1.2','Retell stories including key details; demonstrate understanding of central message.'],
        ['CCSS.ELA-LITERACY.RL.1.3','Describe characters, settings, and major events.'],
        ['CCSS.ELA-LITERACY.RL.1.4','Identify words & phrases that suggest feelings or appeal to senses.'],
        ['CCSS.ELA-LITERACY.RL.1.5','Explain major differences between books that tell stories and books that give information.'],
        ['CCSS.ELA-LITERACY.RL.1.6','Identify who is telling the story at various points.'],
        ['CCSS.ELA-LITERACY.RL.1.7','Use illustrations and details to describe characters, settings, or events.'],
        ['CCSS.ELA-LITERACY.RL.1.9','Compare & contrast adventures of characters in stories.'],
      ],
      '2': [
        ['CCSS.ELA-LITERACY.RL.2.1','Ask & answer such questions as who, what, where, when, why, and how.'],
        ['CCSS.ELA-LITERACY.RL.2.2','Recount stories and determine their central message, lesson, or moral.'],
        ['CCSS.ELA-LITERACY.RL.2.3','Describe how characters respond to major events and challenges.'],
        ['CCSS.ELA-LITERACY.RL.2.5','Describe the overall structure of a story.'],
        ['CCSS.ELA-LITERACY.RL.2.6','Acknowledge differences in the points of view of characters.'],
        ['CCSS.ELA-LITERACY.RL.2.9','Compare & contrast two or more versions of the same story.'],
      ],
      '3': [
        ['CCSS.ELA-LITERACY.RL.3.1','Ask & answer questions to demonstrate understanding.'],
        ['CCSS.ELA-LITERACY.RL.3.2','Recount stories and determine the central message.'],
        ['CCSS.ELA-LITERACY.RL.3.3','Describe characters and explain how their actions contribute to the plot.'],
        ['CCSS.ELA-LITERACY.RL.3.5','Refer to parts of stories, dramas, and poems.'],
        ['CCSS.ELA-LITERACY.RL.3.6','Distinguish own point of view from narrator or characters.'],
      ],
    },
    'RI': {
      label: 'Reading: Informational Text',
      K: [
        ['CCSS.ELA-LITERACY.RI.K.1','Ask & answer questions about key details.'],
        ['CCSS.ELA-LITERACY.RI.K.2','Identify the main topic & retell key details.'],
        ['CCSS.ELA-LITERACY.RI.K.3','Describe the connection between two individuals, events, ideas, or pieces of information.'],
        ['CCSS.ELA-LITERACY.RI.K.7','Describe the relationship between illustrations and the text.'],
      ],
      '1': [
        ['CCSS.ELA-LITERACY.RI.1.1','Ask & answer questions about key details in a text.'],
        ['CCSS.ELA-LITERACY.RI.1.2','Identify the main topic & retell key details.'],
        ['CCSS.ELA-LITERACY.RI.1.3','Describe the connection between two individuals, events, ideas, or pieces of information.'],
        ['CCSS.ELA-LITERACY.RI.1.4','Ask & answer questions about unknown words.'],
        ['CCSS.ELA-LITERACY.RI.1.5','Know and use various text features.'],
        ['CCSS.ELA-LITERACY.RI.1.6','Distinguish between information provided by pictures or other illustrations and text.'],
        ['CCSS.ELA-LITERACY.RI.1.7','Use illustrations and details to describe key ideas.'],
        ['CCSS.ELA-LITERACY.RI.1.8','Identify the reasons an author gives to support points.'],
        ['CCSS.ELA-LITERACY.RI.1.9','Identify basic similarities & differences between two texts on the same topic.'],
      ],
      '2': [
        ['CCSS.ELA-LITERACY.RI.2.1','Ask & answer such questions as who, what, where, when, why, and how.'],
        ['CCSS.ELA-LITERACY.RI.2.2','Identify the main topic of a multi-paragraph text.'],
        ['CCSS.ELA-LITERACY.RI.2.3','Describe the connection between a series of historical events, concepts, or steps.'],
        ['CCSS.ELA-LITERACY.RI.2.5','Know and use various text features.'],
        ['CCSS.ELA-LITERACY.RI.2.6','Identify the main purpose of a text.'],
        ['CCSS.ELA-LITERACY.RI.2.8','Describe how reasons support specific points the author makes.'],
      ],
      '3': [
        ['CCSS.ELA-LITERACY.RI.3.1','Ask & answer questions to demonstrate understanding.'],
        ['CCSS.ELA-LITERACY.RI.3.2','Determine the main idea; recount key details.'],
        ['CCSS.ELA-LITERACY.RI.3.3','Describe the relationship between a series of historical events, steps in technical procedures, or concepts.'],
        ['CCSS.ELA-LITERACY.RI.3.5','Use text features and search tools to locate information.'],
        ['CCSS.ELA-LITERACY.RI.3.8','Describe the logical connection between sentences and paragraphs.'],
      ],
    },
    'RF': {
      label: 'Reading: Foundational Skills',
      K: [
        ['CCSS.ELA-LITERACY.RF.K.1','Demonstrate understanding of print concepts.'],
        ['CCSS.ELA-LITERACY.RF.K.2','Demonstrate understanding of spoken words, syllables, and sounds.'],
        ['CCSS.ELA-LITERACY.RF.K.3','Know and apply grade-level phonics and word analysis skills.'],
        ['CCSS.ELA-LITERACY.RF.K.4','Read emergent-reader texts with purpose and understanding.'],
      ],
      '1': [
        ['CCSS.ELA-LITERACY.RF.1.1','Demonstrate understanding of the organization and basic features of print.'],
        ['CCSS.ELA-LITERACY.RF.1.2','Demonstrate understanding of spoken words, syllables, and sounds (phonemes).'],
        ['CCSS.ELA-LITERACY.RF.1.3.A','Know the spelling-sound correspondences for common consonant digraphs.'],
        ['CCSS.ELA-LITERACY.RF.1.3.B','Decode regularly spelled one-syllable words.'],
        ['CCSS.ELA-LITERACY.RF.1.3.C','Know final -e and common vowel team conventions for long vowel sounds.'],
        ['CCSS.ELA-LITERACY.RF.1.3.D','Use knowledge that every syllable must have a vowel sound.'],
        ['CCSS.ELA-LITERACY.RF.1.3.E','Decode two-syllable words following basic patterns.'],
        ['CCSS.ELA-LITERACY.RF.1.3.F','Read words with inflectional endings.'],
        ['CCSS.ELA-LITERACY.RF.1.3.G','Recognize and read grade-appropriate irregularly spelled words.'],
        ['CCSS.ELA-LITERACY.RF.1.4.A','Read on-level text with purpose and understanding.'],
        ['CCSS.ELA-LITERACY.RF.1.4.B','Read on-level text orally with accuracy, appropriate rate, and expression.'],
        ['CCSS.ELA-LITERACY.RF.1.4.C','Use context to confirm or self-correct word recognition and understanding.'],
      ],
      '2': [
        ['CCSS.ELA-LITERACY.RF.2.3','Know and apply grade-level phonics and word analysis skills.'],
        ['CCSS.ELA-LITERACY.RF.2.3.A','Distinguish long and short vowels when reading one-syllable words.'],
        ['CCSS.ELA-LITERACY.RF.2.3.B','Know spelling-sound correspondences for additional common vowel teams.'],
        ['CCSS.ELA-LITERACY.RF.2.4','Read with sufficient accuracy and fluency to support comprehension.'],
      ],
      '3': [
        ['CCSS.ELA-LITERACY.RF.3.3','Know and apply grade-level phonics and word analysis skills in decoding words.'],
        ['CCSS.ELA-LITERACY.RF.3.4','Read with sufficient accuracy and fluency to support comprehension.'],
      ],
    },
    'W': {
      label: 'Writing',
      K: [
        ['CCSS.ELA-LITERACY.W.K.1','Use drawing, dictating, and writing to compose opinion pieces.'],
        ['CCSS.ELA-LITERACY.W.K.2','Use drawing, dictating, and writing to compose informative/explanatory texts.'],
        ['CCSS.ELA-LITERACY.W.K.3','Use drawing, dictating, and writing to narrate a single event.'],
        ['CCSS.ELA-LITERACY.W.K.5','Respond to questions and suggestions from peers and add details.'],
        ['CCSS.ELA-LITERACY.W.K.7','Participate in shared research and writing projects.'],
      ],
      '1': [
        ['CCSS.ELA-LITERACY.W.1.1','Write opinion pieces naming a topic, stating an opinion, and supplying a reason.'],
        ['CCSS.ELA-LITERACY.W.1.2','Write informative/explanatory texts that name a topic and supply facts.'],
        ['CCSS.ELA-LITERACY.W.1.3','Write narratives recounting two or more appropriately sequenced events.'],
        ['CCSS.ELA-LITERACY.W.1.5','Focus on a topic, respond to questions and suggestions from peers, and add details to strengthen writing.'],
        ['CCSS.ELA-LITERACY.W.1.6','Use digital tools to produce and publish writing.'],
        ['CCSS.ELA-LITERACY.W.1.7','Participate in shared research and writing projects.'],
        ['CCSS.ELA-LITERACY.W.1.8','Recall information from experiences or gather information to answer a question.'],
      ],
      '2': [
        ['CCSS.ELA-LITERACY.W.2.1','Write opinion pieces introducing a topic, state an opinion, supply reasons.'],
        ['CCSS.ELA-LITERACY.W.2.2','Write informative/explanatory texts introducing a topic, using facts and definitions.'],
        ['CCSS.ELA-LITERACY.W.2.3','Write narratives recounting a short sequence of events.'],
        ['CCSS.ELA-LITERACY.W.2.5','Focus on a topic and strengthen writing as needed by revising and editing.'],
      ],
      '3': [
        ['CCSS.ELA-LITERACY.W.3.1','Write opinion pieces on topics or texts, supporting a point of view.'],
        ['CCSS.ELA-LITERACY.W.3.2','Write informative/explanatory texts to examine a topic and convey ideas.'],
        ['CCSS.ELA-LITERACY.W.3.3','Write narratives to develop real or imagined experiences.'],
      ],
    },
    'L': {
      label: 'Language',
      K: [
        ['CCSS.ELA-LITERACY.L.K.1','Demonstrate command of grammar conventions.'],
        ['CCSS.ELA-LITERACY.L.K.2','Demonstrate command of capitalization, punctuation, and spelling.'],
        ['CCSS.ELA-LITERACY.L.K.4','Determine or clarify the meaning of unknown words.'],
        ['CCSS.ELA-LITERACY.L.K.6','Use words and phrases acquired through conversations and reading.'],
      ],
      '1': [
        ['CCSS.ELA-LITERACY.L.1.1.A','Print all upper- and lowercase letters.'],
        ['CCSS.ELA-LITERACY.L.1.1.B','Use common, proper, and possessive nouns.'],
        ['CCSS.ELA-LITERACY.L.1.1.C','Use singular and plural nouns with matching verbs in basic sentences.'],
        ['CCSS.ELA-LITERACY.L.1.1.D','Use personal, possessive, and indefinite pronouns.'],
        ['CCSS.ELA-LITERACY.L.1.1.E','Use verbs to convey a sense of past, present, and future.'],
        ['CCSS.ELA-LITERACY.L.1.1.F','Use frequently occurring adjectives.'],
        ['CCSS.ELA-LITERACY.L.1.1.G','Use frequently occurring conjunctions.'],
        ['CCSS.ELA-LITERACY.L.1.1.H','Use determiners (articles, demonstratives).'],
        ['CCSS.ELA-LITERACY.L.1.1.J','Produce and expand complete simple and compound declarative, interrogative, imperative, and exclamatory sentences.'],
        ['CCSS.ELA-LITERACY.L.1.2.A','Capitalize dates and names of people.'],
        ['CCSS.ELA-LITERACY.L.1.2.B','Use end punctuation for sentences.'],
        ['CCSS.ELA-LITERACY.L.1.2.C','Use commas in dates and to separate single words in a series.'],
        ['CCSS.ELA-LITERACY.L.1.2.D','Use conventional spelling for words with common spelling patterns.'],
        ['CCSS.ELA-LITERACY.L.1.4.A','Use sentence-level context as a clue to the meaning of a word.'],
        ['CCSS.ELA-LITERACY.L.1.5.A','Sort words into categories.'],
        ['CCSS.ELA-LITERACY.L.1.5.D','Distinguish shades of meaning among verbs.'],
        ['CCSS.ELA-LITERACY.L.1.6','Use words and phrases acquired through conversations and reading.'],
      ],
      '2': [
        ['CCSS.ELA-LITERACY.L.2.1','Demonstrate command of grammar and usage.'],
        ['CCSS.ELA-LITERACY.L.2.2','Demonstrate command of capitalization, punctuation, and spelling.'],
        ['CCSS.ELA-LITERACY.L.2.4','Determine or clarify the meaning of unknown and multiple-meaning words and phrases.'],
        ['CCSS.ELA-LITERACY.L.2.6','Use words and phrases acquired through conversations, reading, and being read to.'],
      ],
      '3': [
        ['CCSS.ELA-LITERACY.L.3.1','Demonstrate command of grammar and usage.'],
        ['CCSS.ELA-LITERACY.L.3.2','Demonstrate command of capitalization, punctuation, and spelling.'],
        ['CCSS.ELA-LITERACY.L.3.4','Determine or clarify the meaning of unknown words.'],
      ],
    },
  },
  math: {
    'OA': {
      label: 'Operations & Algebraic Thinking',
      K: [
        ['CCSS.MATH.CONTENT.K.OA.A.1','Represent addition and subtraction with objects, fingers, mental images.'],
        ['CCSS.MATH.CONTENT.K.OA.A.2','Solve addition and subtraction word problems within 10.'],
        ['CCSS.MATH.CONTENT.K.OA.A.3','Decompose numbers less than or equal to 10 into pairs.'],
        ['CCSS.MATH.CONTENT.K.OA.A.4','Find the number that makes 10 when added to a given number.'],
        ['CCSS.MATH.CONTENT.K.OA.A.5','Fluently add and subtract within 5.'],
      ],
      '1': [
        ['CCSS.MATH.CONTENT.1.OA.A.1','Use addition and subtraction within 20 to solve word problems.'],
        ['CCSS.MATH.CONTENT.1.OA.A.2','Solve word problems that call for addition of three whole numbers.'],
        ['CCSS.MATH.CONTENT.1.OA.B.3','Apply properties of operations as strategies to add and subtract.'],
        ['CCSS.MATH.CONTENT.1.OA.B.4','Understand subtraction as an unknown-addend problem.'],
        ['CCSS.MATH.CONTENT.1.OA.C.5','Relate counting to addition and subtraction.'],
        ['CCSS.MATH.CONTENT.1.OA.C.6','Add and subtract within 20, demonstrating fluency within 10.'],
        ['CCSS.MATH.CONTENT.1.OA.D.7','Understand the meaning of the equal sign.'],
        ['CCSS.MATH.CONTENT.1.OA.D.8','Determine the unknown whole number in an addition or subtraction equation.'],
      ],
      '2': [
        ['CCSS.MATH.CONTENT.2.OA.A.1','Use addition and subtraction within 100 to solve word problems.'],
        ['CCSS.MATH.CONTENT.2.OA.B.2','Fluently add and subtract within 20.'],
        ['CCSS.MATH.CONTENT.2.OA.C.3','Determine whether a group of objects has an odd or even number of members.'],
        ['CCSS.MATH.CONTENT.2.OA.C.4','Use addition to find the total number of objects arranged in arrays.'],
      ],
      '3': [
        ['CCSS.MATH.CONTENT.3.OA.A.1','Interpret products of whole numbers.'],
        ['CCSS.MATH.CONTENT.3.OA.A.2','Interpret whole-number quotients of whole numbers.'],
        ['CCSS.MATH.CONTENT.3.OA.A.3','Use multiplication and division within 100 to solve word problems.'],
        ['CCSS.MATH.CONTENT.3.OA.A.4','Determine the unknown whole number in a multiplication or division equation.'],
        ['CCSS.MATH.CONTENT.3.OA.B.5','Apply properties of operations as strategies to multiply and divide.'],
        ['CCSS.MATH.CONTENT.3.OA.C.7','Fluently multiply and divide within 100.'],
        ['CCSS.MATH.CONTENT.3.OA.D.8','Solve two-step word problems using the four operations.'],
      ],
    },
    'NBT': {
      label: 'Number & Operations in Base Ten',
      K: [
        ['CCSS.MATH.CONTENT.K.NBT.A.1','Compose and decompose numbers from 11 to 19 into ten ones and some further ones.'],
      ],
      '1': [
        ['CCSS.MATH.CONTENT.1.NBT.A.1','Count to 120, starting at any number less than 120.'],
        ['CCSS.MATH.CONTENT.1.NBT.B.2','Understand that the two digits of a two-digit number represent tens and ones.'],
        ['CCSS.MATH.CONTENT.1.NBT.B.3','Compare two two-digit numbers based on tens and ones.'],
        ['CCSS.MATH.CONTENT.1.NBT.C.4','Add within 100, using concrete models or drawings and strategies.'],
        ['CCSS.MATH.CONTENT.1.NBT.C.5','Given a two-digit number, mentally find 10 more or 10 less.'],
        ['CCSS.MATH.CONTENT.1.NBT.C.6','Subtract multiples of 10 in the range 10–90.'],
      ],
      '2': [
        ['CCSS.MATH.CONTENT.2.NBT.A.1','Understand that the three digits of a three-digit number represent hundreds, tens, and ones.'],
        ['CCSS.MATH.CONTENT.2.NBT.A.2','Count within 1000; skip-count by 5s, 10s, and 100s.'],
        ['CCSS.MATH.CONTENT.2.NBT.A.3','Read and write numbers to 1000.'],
        ['CCSS.MATH.CONTENT.2.NBT.A.4','Compare two three-digit numbers.'],
        ['CCSS.MATH.CONTENT.2.NBT.B.5','Fluently add and subtract within 100.'],
        ['CCSS.MATH.CONTENT.2.NBT.B.7','Add and subtract within 1000.'],
      ],
      '3': [
        ['CCSS.MATH.CONTENT.3.NBT.A.1','Use place value understanding to round whole numbers to the nearest 10 or 100.'],
        ['CCSS.MATH.CONTENT.3.NBT.A.2','Fluently add and subtract within 1000.'],
        ['CCSS.MATH.CONTENT.3.NBT.A.3','Multiply one-digit whole numbers by multiples of 10.'],
      ],
    },
    'MD': {
      label: 'Measurement & Data',
      K: [
        ['CCSS.MATH.CONTENT.K.MD.A.1','Describe measurable attributes of objects.'],
        ['CCSS.MATH.CONTENT.K.MD.A.2','Directly compare two objects with a measurable attribute in common.'],
        ['CCSS.MATH.CONTENT.K.MD.B.3','Classify objects into given categories; count the numbers in each category.'],
      ],
      '1': [
        ['CCSS.MATH.CONTENT.1.MD.A.1','Order three objects by length; compare the lengths of two objects indirectly.'],
        ['CCSS.MATH.CONTENT.1.MD.A.2','Express the length of an object as a whole number of length units.'],
        ['CCSS.MATH.CONTENT.1.MD.B.3','Tell and write time in hours and half-hours using analog and digital clocks.'],
        ['CCSS.MATH.CONTENT.1.MD.C.4','Organize, represent, and interpret data with up to three categories.'],
      ],
      '2': [
        ['CCSS.MATH.CONTENT.2.MD.A.1','Measure the length of an object by selecting and using appropriate tools.'],
        ['CCSS.MATH.CONTENT.2.MD.A.3','Estimate lengths using units of inches, feet, centimeters, and meters.'],
        ['CCSS.MATH.CONTENT.2.MD.B.5','Use addition and subtraction within 100 to solve measurement problems.'],
        ['CCSS.MATH.CONTENT.2.MD.C.7','Tell and write time from analog and digital clocks to the nearest five minutes.'],
        ['CCSS.MATH.CONTENT.2.MD.C.8','Solve word problems involving dollar bills, quarters, dimes, nickels, and pennies.'],
        ['CCSS.MATH.CONTENT.2.MD.D.9','Generate measurement data and show data on a line plot.'],
        ['CCSS.MATH.CONTENT.2.MD.D.10','Draw a picture graph and a bar graph.'],
      ],
      '3': [
        ['CCSS.MATH.CONTENT.3.MD.A.1','Tell and write time to the nearest minute.'],
        ['CCSS.MATH.CONTENT.3.MD.A.2','Measure and estimate liquid volumes and masses.'],
        ['CCSS.MATH.CONTENT.3.MD.B.3','Draw a scaled picture graph and a scaled bar graph.'],
        ['CCSS.MATH.CONTENT.3.MD.C.5','Recognize area as an attribute of plane figures.'],
        ['CCSS.MATH.CONTENT.3.MD.C.7','Relate area to the operations of multiplication and addition.'],
      ],
    },
    'G': {
      label: 'Geometry',
      K: [
        ['CCSS.MATH.CONTENT.K.G.A.1','Describe objects in the environment using names of shapes.'],
        ['CCSS.MATH.CONTENT.K.G.A.2','Correctly name shapes regardless of their orientations or overall size.'],
        ['CCSS.MATH.CONTENT.K.G.A.3','Identify shapes as two-dimensional or three-dimensional.'],
        ['CCSS.MATH.CONTENT.K.G.B.4','Analyze and compare two- and three-dimensional shapes.'],
        ['CCSS.MATH.CONTENT.K.G.B.5','Model shapes in the world by building shapes from components.'],
        ['CCSS.MATH.CONTENT.K.G.B.6','Compose simple shapes to form larger shapes.'],
      ],
      '1': [
        ['CCSS.MATH.CONTENT.1.G.A.1','Distinguish between defining attributes vs. non-defining attributes.'],
        ['CCSS.MATH.CONTENT.1.G.A.2','Compose two-dimensional shapes or three-dimensional shapes to create a composite shape.'],
        ['CCSS.MATH.CONTENT.1.G.A.3','Partition circles and rectangles into two and four equal shares.'],
      ],
      '2': [
        ['CCSS.MATH.CONTENT.2.G.A.1','Recognize and draw shapes having specified attributes.'],
        ['CCSS.MATH.CONTENT.2.G.A.2','Partition a rectangle into rows and columns of same-size squares.'],
        ['CCSS.MATH.CONTENT.2.G.A.3','Partition circles and rectangles into two, three, or four equal shares.'],
      ],
      '3': [
        ['CCSS.MATH.CONTENT.3.G.A.1','Understand that shapes in different categories may share attributes.'],
        ['CCSS.MATH.CONTENT.3.G.A.2','Partition shapes into parts with equal areas.'],
      ],
    },
  },
  science: {
    'PS': {
      label: 'Physical Science',
      K: [
        ['NGSS K-PS2-1','Plan and conduct an investigation to compare the effects of different strengths or different directions of pushes and pulls.'],
        ['NGSS K-PS2-2','Analyze data to determine if a design solution works as intended to change the speed or direction of an object.'],
        ['NGSS K-PS3-1','Make observations to determine the effect of sunlight on Earth\'s surface.'],
      ],
      '1': [
        ['NGSS 1-PS4-1','Plan and conduct investigations to provide evidence that vibrating materials can make sound.'],
        ['NGSS 1-PS4-2','Make observations to construct an evidence-based account that objects can be seen only when illuminated.'],
        ['NGSS 1-PS4-3','Plan and conduct investigations to determine the effect of placing objects made with different materials in the path of a beam of light.'],
        ['NGSS 1-PS4-4','Use tools and materials to design and build a device that uses light or sound to solve the problem of communicating over a distance.'],
      ],
      '2': [
        ['NGSS 2-PS1-1','Plan and conduct an investigation to describe and classify different kinds of materials by their observable properties.'],
        ['NGSS 2-PS1-2','Analyze data obtained from testing different materials to determine which materials have the properties that are best suited for an intended purpose.'],
        ['NGSS 2-PS1-3','Make observations to construct an evidence-based account of how an object made of a small set of pieces can be disassembled and made into a new object.'],
      ],
      '3': [
        ['NGSS 3-PS2-1','Plan and conduct an investigation to provide evidence of the effects of balanced and unbalanced forces on the motion of an object.'],
        ['NGSS 3-PS2-3','Ask questions to determine cause and effect relationships of electric or magnetic interactions.'],
      ],
    },
    'LS': {
      label: 'Life Science',
      K: [
        ['NGSS K-LS1-1','Use observations to describe patterns of what plants and animals (including humans) need to survive.'],
      ],
      '1': [
        ['NGSS 1-LS1-1','Use materials to design a solution to a human problem by mimicking how plants and/or animals use their external parts to help them survive.'],
        ['NGSS 1-LS1-2','Read texts and use media to determine patterns in behavior of parents and offspring that help offspring survive.'],
        ['NGSS 1-LS3-1','Make observations to construct an evidence-based account that young plants and animals are like, but not exactly like, their parents.'],
      ],
      '2': [
        ['NGSS 2-LS2-1','Plan and conduct an investigation to determine if plants need sunlight and water to grow.'],
        ['NGSS 2-LS2-2','Develop a simple model that mimics the function of an animal in dispersing seeds or pollinating plants.'],
        ['NGSS 2-LS4-1','Make observations of plants and animals to compare the diversity of life in different habitats.'],
      ],
      '3': [
        ['NGSS 3-LS1-1','Develop models to describe that organisms have unique and diverse life cycles.'],
        ['NGSS 3-LS2-1','Construct an argument that some animals form groups that help members survive.'],
        ['NGSS 3-LS3-1','Analyze and interpret data to provide evidence that plants and animals have traits inherited from parents.'],
        ['NGSS 3-LS4-2','Use evidence to construct an explanation for how the variations in characteristics among individuals of the same species may provide advantages.'],
      ],
    },
    'ESS': {
      label: 'Earth & Space Science',
      K: [
        ['NGSS K-ESS2-1','Use and share observations of local weather conditions to describe patterns over time.'],
        ['NGSS K-ESS3-1','Use a model to represent the relationship between the needs of different plants or animals and the places they live.'],
      ],
      '1': [
        ['NGSS 1-ESS1-1','Use observations of the sun, moon, and stars to describe patterns that can be predicted.'],
        ['NGSS 1-ESS1-2','Make observations at different times of year to relate the amount of daylight to the time of year.'],
      ],
      '2': [
        ['NGSS 2-ESS1-1','Use information from several sources to provide evidence that Earth events can occur quickly or slowly.'],
        ['NGSS 2-ESS2-1','Compare multiple solutions designed to slow or prevent wind or water from changing the shape of the land.'],
        ['NGSS 2-ESS2-2','Develop a model to represent the shapes and kinds of land and bodies of water in an area.'],
      ],
      '3': [
        ['NGSS 3-ESS2-1','Represent data in tables and graphical displays to describe typical weather conditions expected during a particular season.'],
        ['NGSS 3-ESS2-2','Obtain and combine information to describe climates in different regions of the world.'],
      ],
    },
  },
};

// ============================================================
// STANDARDS LIBRARY (v6.7.0)
// Every US state + DC, Common Core and NGSS, K-12, from the Common Standards
// Project (CC BY 3.0 US). One file per jurisdiction in public/standards/,
// loaded only when needed. The small built-in CCSS list above stays as the
// offline fallback.
// ============================================================
const STD = { index: null, files: {} };
const STD_GRADES = ['K','1','2','3','4','5','6','7','8','9','10','11','12'];

async function stdIndex() {
    if (STD.index) return STD.index;
    const r = await fetch('/standards/index.json');
    if (!r.ok) throw new Error('Standards list unavailable');
    STD.index = await r.json();
    return STD.index;
}
async function stdLoad(code) {
    if (STD.files[code]) return STD.files[code];
    const r = await fetch(`/standards/${encodeURIComponent(code)}.json`);
    if (!r.ok) throw new Error('Could not load standards for ' + code);
    STD.files[code] = await r.json();
    return STD.files[code];
}
function stdPrefs() {
    const p = settings.standardsPrefs || {};
    let g = String(p.grade || userProfile.grade || aiSettings.grade || '1').toUpperCase().replace(/^0+(?=\d)/, '');
    if (g === 'KINDERGARTEN' || g === '0') g = 'K';
    if (!STD_GRADES.includes(g)) g = '1';
    return { jur: p.jur || 'CCSS', subject: p.subject || '', grade: g };
}
function saveStdPrefs(prefs) {
    settings.standardsPrefs = { ...stdPrefs(), ...prefs };
    if (currentUser) db.collection('users').doc(currentUser.uid).collection('settings').doc('schoolYear')
        .set({ standardsPrefs: settings.standardsPrefs }, { merge: true }).catch(() => {});
}
// All standard sets for a jurisdiction that cover a grade
function stdSetsFor(file, grade) { return (file.sets || []).filter(st => st.grades.includes(grade)); }
function stdSubjectLabel(st) { return st.group === 'Other' ? st.subject : `${st.group} — ${st.subject}`; }

// Build the jurisdiction / subject / grade (/ search) controls into `root`.
// onChange({ file, set, grade }) runs whenever the selection is ready.
async function buildStdControls(root, { withSearch = true, onChange }) {
    root.innerHTML = `<div class="std-controls">
        <select class="form-control std-jur" aria-label="State or framework"><option>Loading…</option></select>
        <select class="form-control std-grade" aria-label="Grade">${STD_GRADES.map(g => `<option value="${g}">${g === 'K' ? 'Kindergarten' : 'Grade ' + g}</option>`).join('')}</select>
        <select class="form-control std-subject" aria-label="Subject"></select>
        ${withSearch ? '<input type="search" class="form-control std-search" placeholder="Search code or words…" aria-label="Search standards">' : ''}
    </div>`;
    const jurSel = root.querySelector('.std-jur'), gradeSel = root.querySelector('.std-grade'),
          subjSel = root.querySelector('.std-subject'), search = root.querySelector('.std-search');
    const prefs = stdPrefs();
    let file = null;
    try {
        const idx = await stdIndex();
        const top = ['CCSS', 'NGSS'];
        const list = [...idx.jurisdictions].sort((x, y) => (top.indexOf(y.code) - top.indexOf(x.code)) || x.name.localeCompare(y.name));
        jurSel.innerHTML = list.map(j => `<option value="${escHtml(j.code)}">${escHtml(j.code === 'CCSS' ? 'Common Core (CCSS)' : j.code === 'NGSS' ? 'Next Gen Science (NGSS)' : j.name)}</option>`).join('');
        jurSel.value = list.some(j => j.code === prefs.jur) ? prefs.jur : 'CCSS';
    } catch (e) {
        jurSel.innerHTML = '<option value="">Standards library unavailable offline</option>';
    }
    gradeSel.value = prefs.grade;
    const fillSubjects = () => {
        const sets = file ? stdSetsFor(file, gradeSel.value) : [];
        subjSel.innerHTML = sets.length
            ? sets.map((st, i) => `<option value="${i}">${escHtml(stdSubjectLabel(st))}</option>`).join('')
            : '<option value="">No standards for this grade</option>';
        const want = sets.findIndex(st => st.subject === prefs.subject);
        if (want >= 0) subjSel.value = String(want);
    };
    const fire = () => {
        const sets = file ? stdSetsFor(file, gradeSel.value) : [];
        const set = sets[parseInt(subjSel.value, 10)] || null;
        onChange({ file, set, grade: gradeSel.value, query: search ? search.value.trim().toLowerCase() : '' });
    };
    const loadJur = async () => {
        if (!jurSel.value) { file = null; fillSubjects(); fire(); return; }
        try { file = await stdLoad(jurSel.value); } catch (e) { file = null; }
        fillSubjects(); fire();
    };
    jurSel.addEventListener('change', () => { saveStdPrefs({ jur: jurSel.value }); loadJur(); });
    gradeSel.addEventListener('change', () => { saveStdPrefs({ grade: gradeSel.value }); fillSubjects(); fire(); });
    subjSel.addEventListener('change', () => {
        const set = file ? stdSetsFor(file, gradeSel.value)[parseInt(subjSel.value, 10)] : null;
        if (set) { prefs.subject = set.subject; saveStdPrefs({ subject: set.subject }); }
        fire();
    });
    search?.addEventListener('input', fire);
    await loadJur();
}

// Picker attached to a textarea (lesson form or unit form)
async function openStdPicker(pickerId) {
    const el = document.getElementById(pickerId);
    if (!el) return;
    if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (el.dataset.built) return;
    el.dataset.built = '1';
    const targetId = el.dataset.target;
    el.innerHTML = '<div class="std-ctl-host"></div><div class="standards-list"></div><p class="std-credit">Standards: Common Standards Project, CC BY 3.0 US.</p>';
    const listEl = el.querySelector('.standards-list');
    await buildStdControls(el.querySelector('.std-ctl-host'), {
        onChange: ({ set, query }) => {
            if (!set) { listEl.innerHTML = '<p class="std-empty">Pick a state and subject.</p>'; return; }
            let rows = set.standards;
            if (query) rows = rows.filter(([c, d]) => c.toLowerCase().includes(query) || d.toLowerCase().includes(query));
            const shown = rows.slice(0, 400);
            let html = '', lastDom = -1;
            shown.forEach(([code, desc, dom]) => {
                if (dom !== lastDom) { lastDom = dom; if (set.domains[dom]) html += `<div class="std-domain-label">${escHtml(set.domains[dom])}</div>`; }
                const insert = code || desc.slice(0, 80);
                html += `<button type="button" class="std-chip" data-insert="${escHtml(insert)}">`
                    + (code ? `<span class="std-chip-code">${escHtml(code)}</span>` : '')
                    + `<span class="std-chip-desc">${escHtml(desc)}</span></button>`;
            });
            if (rows.length > shown.length) html += `<p class="std-empty">Showing 400 of ${rows.length}. Search to narrow it down.</p>`;
            listEl.innerHTML = html || '<p class="std-empty">No standards match.</p>';
            listEl.querySelectorAll('.std-chip').forEach(b => b.addEventListener('click', () => appendStandardTo(targetId, b.dataset.insert)));
        }
    });
}

function appendStandardTo(targetId, code) {
    const ta = document.getElementById(targetId);
    if (!ta) return;
    const lines = ta.value.split('\n').map(x => x.trim()).filter(Boolean);
    if (lines.includes(code)) { showToast('Already added'); return; }
    ta.value = lines.concat(code).join('\n');
    const modal = ta.closest('.modal'); if (modal) modal.dataset.dirty = '1';
    ta.style.borderColor = 'var(--focus-ring, #00D4FF)';
    setTimeout(() => { ta.style.borderColor = ''; }, 600);
}

function toggleStandardsPicker() { openStdPicker('standards-picker'); }
function toggleUnitStandardsPicker() { openStdPicker('unit-standards-picker'); }
function appendStandard(code) { appendStandardTo('lesson-standards', code); }
function appendUnitStandard(code) { appendStandardTo('unit-standards', code); }

// ── Standards coverage report (v6.7.0) ─────────────────────────────────
// Reads the codes already typed or picked into each lesson's Standards
// field -- no re-tagging needed. A code counts when it appears as a whole
// token (so "1.OA.A.1" doesn't also count "1.OA.A.10"; "1.OA.A.1.a" does).
let _coverage = null;
function codeRegex(code) {
    const esc = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // A sub-standard (1.OA.A.1.a) counts toward its parent; 1.OA.A.10 doesn't count for 1.OA.A.1
    return new RegExp('(^|[^A-Za-z0-9.])' + esc + '(?![A-Za-z0-9])', 'i');
}
function computeCoverage(set, lessonList) {
    const texts = lessonList.map(l => ({ l, t: `${l.standards || ''}\n${l.objectives || ''}` })).filter(x => x.t.trim());
    return set.standards.filter(([code]) => code).map(([code, desc, dom]) => {
        const re = codeRegex(code);
        const hits = texts.filter(x => re.test(x.t)).map(x => x.l);
        return { code, desc, domain: set.domains[dom] || '', count: hits.length, lessons: hits };
    });
}

async function openCoverageReport() {
    const modal = document.getElementById('coverage-modal');
    if (!modal) return;
    const clsSel = document.getElementById('coverage-class');
    clsSel.innerHTML = '<option value="">All classes</option>' + classes.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');
    const first = events.find(e => e.type === 'first-day')?.startDate || settings.yearStart || '';
    document.getElementById('coverage-from').value = first;
    document.getElementById('coverage-to').value = formatDate(new Date());
    modal.classList.remove('hidden');
    const rerender = () => renderCoverage();
    ['coverage-class', 'coverage-from', 'coverage-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el._covBound) { el.addEventListener('change', rerender); el._covBound = true; }
    });
    const host = document.getElementById('coverage-picker');
    if (!host.dataset.built) {
        host.dataset.built = '1';
        await buildStdControls(host, { withSearch: false, onChange: (sel) => { _coverage = sel; renderCoverage(); } });
    } else renderCoverage();
}

function coverageLessons() {
    const cls = document.getElementById('coverage-class')?.value || '';
    const from = document.getElementById('coverage-from')?.value || '0000';
    const to = document.getElementById('coverage-to')?.value || '9999';
    return lessons.filter(l => (!cls || l.classId === cls) && l.date >= from && l.date <= to);
}

function renderCoverage() {
    const sum = document.getElementById('coverage-summary'), list = document.getElementById('coverage-list');
    if (!_coverage || !_coverage.set) { sum.textContent = 'Pick a state, grade and subject.'; list.innerHTML = ''; return; }
    const rows = computeCoverage(_coverage.set, coverageLessons());
    const taught = rows.filter(r => r.count >= 1).length, repeated = rows.filter(r => r.count >= 2).length;
    sum.innerHTML = `<div class="cov-stat"><b>${taught}</b><span>of ${rows.length} taught</span></div>
        <div class="cov-stat"><b>${repeated}</b><span>taught 2+ times</span></div>
        <div class="cov-stat"><b>${rows.length - taught}</b><span>not yet</span></div>`;
    let html = '', lastDom = null;
    rows.forEach(r => {
        if (r.domain !== lastDom) { lastDom = r.domain; html += `<div class="std-domain-label">${escHtml(r.domain)}</div>`; }
        const state = r.count >= 2 ? 'rep' : r.count === 1 ? 'once' : 'none';
        html += `<div class="cov-row cov-${state}">
            <span class="cov-badge">${r.count ? r.count + '×' : 'Not yet'}</span>
            <span class="cov-code">${escHtml(r.code)}</span>
            <span class="cov-desc">${escHtml(r.desc)}</span>
            ${r.count ? '' : `<button type="button" class="btn btn-ghost btn-sm cov-plan" data-code="${escHtml(r.code)}">+ Plan</button>`}
        </div>`;
    });
    list.innerHTML = html || '<p class="std-empty">This set has no coded standards to track.</p>';
    list.querySelectorAll('.cov-plan').forEach(b => b.addEventListener('click', () => {
        document.getElementById('coverage-modal')?.classList.add('hidden');
        openLessonModal(null, formatDate(currentDayDate || new Date()));
        const cls = document.getElementById('coverage-class')?.value;
        if (cls && elements.lessonClass) elements.lessonClass.value = cls;
        setTimeout(() => appendStandardTo('lesson-standards', b.dataset.code), 50);
    }));
}

function printCoverageReport() {
    if (!_coverage || !_coverage.set) return;
    const rows = computeCoverage(_coverage.set, coverageLessons());
    const clsName = classes.find(c => c.id === document.getElementById('coverage-class')?.value)?.name || 'All classes';
    const from = document.getElementById('coverage-from')?.value, to = document.getElementById('coverage-to')?.value;
    const taught = rows.filter(r => r.count).length;
    const body = rows.map(r => `<tr><td>${escHtml(r.code)}</td><td>${escHtml(r.desc)}</td><td style="text-align:center">${r.count || '—'}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Standards coverage</title><style>
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#222;margin:0}
        h1{font-size:18px;margin:0 0 4px} .meta{color:#555;margin-bottom:12px}
        table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:4px 6px;vertical-align:top}
        th{background:#f0f0f0;text-align:left} td:first-child{white-space:nowrap;font-weight:600}
        </style></head><body>
        <h1>Standards coverage — ${escHtml(_coverage.set.subject)}, ${_coverage.grade === 'K' ? 'Kindergarten' : 'Grade ' + escHtml(_coverage.grade)}</h1>
        <div class="meta">${escHtml(_coverage.file?.name || '')} · ${escHtml(clsName)} · ${escHtml(from || '')} to ${escHtml(to || '')} · ${taught} of ${rows.length} taught</div>
        <table><thead><tr><th>Code</th><th>Standard</th><th>Lessons</th></tr></thead><tbody>${body}</tbody></table>
        </body></html>`;
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(html, { v: '0.4in', h: '0.3in' }));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 300);
}


// ============================================================
// GRADE REPORT EXPORT (CSV + PDF)
// ============================================================

function exportGradebookCSV() {
    const clsFilter = document.getElementById('gb-class-filter')?.value||'';
    const asgList = assignments.filter(a => !clsFilter || a.classId===clsFilter || !a.classId);
    if (!asgList.length || !students.length) { showToast('No data to export.'); return; }
    const cfg = clsFilter ? getClassGradeSettings(clsFilter) : { scale:'percent', weights:DEFAULT_WEIGHTS };

    const headers = ['Student', ...asgList.map(a => a.title + ' (/' + (a.maxScore||100) + ')'), 'Average %', 'Grade'];
    const rows = students.map(s => {
        const scores = asgList.map(a => { const v=(a.scores||{})[s.id]; return v!==undefined&&v!==null&&v!==''?v:''; });
        const avg = calcWeightedAvg(s.id, asgList, cfg);
        const label = avg!==null ? (getGradeLabel(avg, cfg.scale)||'') : '';
        return [s.firstName+' '+(s.lastName||''), ...scores, avg!==null?avg+'%':'', label];
    });

    const csv = [headers, ...rows].map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'gradebook_' + (clsFilter ? classes.find(c=>c.id===clsFilter)?.name||clsFilter : 'all') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('⬇️ CSV downloaded!');
}

function printGradeReports() {
    const clsFilter = document.getElementById('gb-class-filter')?.value||'';
    const asgList = assignments.filter(a => !clsFilter || a.classId===clsFilter || !a.classId);
    if (!students.length) { showToast('No students to report on.'); return; }
    const cfg = clsFilter ? getClassGradeSettings(clsFilter) : { scale:'percent', weights:DEFAULT_WEIGHTS };
    const clsName = clsFilter ? (classes.find(c=>c.id===clsFilter)?.name||'Class') : 'All Classes';
    const today = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    const scaleLabel = { percent:'Percent', letter:'A/B/C/D/F', k5:'4-Point Scale', mastery:'Mastery Scale' }[cfg.scale||'percent'] || '';

    const catIcons = { quiz:'📝',homework:'📖',project:'🏗️',participation:'🙋' };

    const reportHtml = students.map(s => {
        const avg = calcWeightedAvg(s.id, asgList, cfg);
        const label = avg!==null ? (getGradeLabel(avg, cfg.scale)||'') : '';
        const rows = asgList.map(a => {
            const v = (a.scores||{})[s.id];
            const score = v!==undefined&&v!==null&&v!=='' ? v+'/'+a.maxScore : '—';
            const pct   = v!==undefined&&v!==null&&v!=='' ? Math.round(v/(a.maxScore||100)*100)+'%' : '';
            return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${catIcons[a.category||'quiz']||'📋'} ${a.title}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;">${a.date||''}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;">${score}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:700;">${pct}</td></tr>`;
        }).join('');
        return `<div style="page-break-after:always;padding:24px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:2px solid #7B5EA7;padding-bottom:12px;">
                <div>
                    <h2 style="margin:0;font-size:18px;color:#1F1F2E;">${s.firstName} ${s.lastName||''}</h2>
                    <div style="font-size:13px;color:#888;margin-top:2px;">${clsName} · ${today}</div>
                    ${s.group?`<div style="font-size:12px;color:#888;">Group: ${s.group}</div>`:''}
                </div>
                <div style="text-align:right;">
                    ${avg!==null?`<div style="font-size:28px;font-weight:900;color:#7B5EA7;">${avg}%</div>`:''}
                    ${label?`<div style="font-size:16px;font-weight:700;color:#4A3B8C;">${label}</div>`:''}
                    <div style="font-size:11px;color:#aaa;">${scaleLabel}</div>
                </div>
            </div>
            ${s.accommodations?`<div style="background:#FFF8E1;border-left:3px solid #F9A825;padding:6px 10px;font-size:12px;margin-bottom:12px;">${s.accommodations}</div>`:''}
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead><tr style="background:#f5f5f5;"><th style="padding:6px 8px;text-align:left;">Assignment</th>
                <th style="padding:6px 8px;text-align:center;">Date</th>
                <th style="padding:6px 8px;text-align:center;">Score</th>
                <th style="padding:6px 8px;text-align:center;">%</th></tr></thead>
                <tbody>${rows||'<tr><td colspan="4" style="padding:8px;color:#aaa;text-align:center;">No assignments recorded</td></tr>'}</tbody>
            </table>
        </div>`;
    }).join('');

    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Grade Reports — ${clsName}</title>
        <style>* { box-sizing:border-box; } body { font-family:Arial,sans-serif; margin:0; }
        .no-print{background:#eaf3fb;padding:10px 16px;margin-bottom:0;}
        @media print{.no-print{display:none!important;}}</style>
        </head><body>
        <div class="no-print" style="display:flex;align-items:center;gap:12px;">
            <button onclick="window.print()" style="padding:7px 16px;background:#7B5EA7;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;">🖨️ Print All Reports</button>
            <span style="font-size:13px;color:#555;">${students.length} student report${students.length!==1?'s':''} · one page each</span>
        </div>
        ${reportHtml}</body></html>`, {v:'0.4in',h:'0.3in'}));
    win.document.close();
}


// ============================================================
// ATTENDANCE
// ============================================================

// attendance declared at top of file

const ATTEND_STATUSES = ['P','A','T','E'];
const ATTEND_LABELS   = { P:'Present', A:'Absent', T:'Tardy', E:'Excused' };

async function loadAttendance() {
    try {
        const snap = await getYearPath().collection('attendance').get();
        attendance = {};
        snap.docs.forEach(d => { attendance[d.id] = d.data(); });
    } catch(e) { console.warn('loadAttendance:', e.message); }
}

function populateAttendClassFilters() {
    ['attend-class-filter','attend-class-select'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = id === 'attend-class-filter'
            ? '<option value="">All classes</option>'
            : '<option value="">Select class…</option>';
        classes.forEach(c => { const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });
        sel.value = cur;
    });
    // Populate month filter
    const mSel = document.getElementById('attend-month-filter');
    if (mSel) {
        const months = getSchoolMonths();
        mSel.innerHTML = months.map(m =>
            `<option value="${m.value}" ${m.isCurrent?'selected':''}>${m.label}</option>`
        ).join('');
    }
}

function getSchoolMonths() {
    const sy = settings.schoolYear||'2025-2026';
    const [sy1,sy2] = sy.split('-').map(Number);
    const result = [];
    const now = new Date();
    for (let m = 7; m <= 11; m++) { result.push({ value: sy1+'-'+String(m+1).padStart(2,'0'), label: new Date(sy1,m,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}), isCurrent: now.getMonth()===m && now.getFullYear()===sy1 }); }
    for (let m = 0; m <= 5; m++)  { result.push({ value: sy2+'-'+String(m+1).padStart(2,'0'), label: new Date(sy2,m,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}), isCurrent: now.getMonth()===m && now.getFullYear()===sy2 }); }
    return result;
}

function renderAttendanceView() {
    if (!attendance) return;
    const wrap = document.getElementById('attendance-wrap');
    if (!wrap) return;
    const clsFilter = document.getElementById('attend-class-filter')?.value||'';
    const monthFilter = document.getElementById('attend-month-filter')?.value||'';

    // Build list of dates in selected month that have attendance records
    const filteredKeys = Object.keys(attendance).filter(k => {
        const [kCls, kDate] = k.split('_');
        return (!clsFilter || kCls===clsFilter) && (!monthFilter || kDate.startsWith(monthFilter));
    });

    if (!filteredKeys.length) {
        wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;padding:1rem 0;">No attendance records for this period. Click <strong>+ Take Attendance</strong> to start.</p>';
        return;
    }

    // Group by class
    const byClass = {};
    filteredKeys.forEach(k => {
        const [kCls, kDate] = k.split('_');
        if (!byClass[kCls]) byClass[kCls] = {};
        byClass[kCls][kDate] = attendance[k];
    });

    let html = '';
    Object.entries(byClass).forEach(([cid, dateMap]) => {
        const cls = classes.find(c=>c.id===cid);
        const dates = Object.keys(dateMap).sort();
        const clsStudents = students.filter(s => !s.classId || s.classId===cid);
        if (!clsStudents.length) return;

        html += `<h4 style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);margin:12px 0 6px;">${cls?.name||cid}</h4>`;
        html += '<div style="overflow-x:auto;"><table class="attend-table"><thead><tr><th>Student</th>';
        dates.forEach(d => {
            const day = new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'});
            html += `<th>${day}</th>`;
        });
        html += '<th>Present</th><th>Absent</th></tr></thead><tbody>';

        clsStudents.forEach(s => {
            html += `<tr><td>${s.firstName} ${s.lastName||''}</td>`;
            let pCount=0, aCount=0;
            dates.forEach(d => {
                const status = (dateMap[d]||{})[s.id]||'';
                if (status==='P') pCount++;
                if (status==='A') aCount++;
                html += `<td><span class="attend-cell attend-${status||'?'}" title="${ATTEND_LABELS[status]||'Not recorded'}">${status||'?'}</span></td>`;
            });
            html += `<td style="font-weight:700;color:#a5d6a7;">${pCount}</td><td style="font-weight:700;color:#ef9a9a;">${aCount}</td></tr>`;
        });
        html += '</tbody></table></div>';
    });

    wrap.innerHTML = html || '<p style="color:var(--text-muted);">No data for selected filters.</p>';
}

function openAttendanceDay() {
    const modal = document.getElementById('attendance-modal');
    if (!modal) return;
    populateAttendClassFilters();
    document.getElementById('attend-date').value = formatDate(new Date());
    renderAttendStudentList();
    modal.classList.remove('hidden');
}

function renderAttendStudentList() {
    const cid  = document.getElementById('attend-class-select').value;
    const date = document.getElementById('attend-date').value;
    const list = document.getElementById('attend-student-list');
    if (!list) return;

    const key = cid + '_' + date;
    const existing = attendance[key] || {};
    const clsStudents = cid ? students.filter(s => !s.classId || s.classId===cid) : students;

    if (!clsStudents.length) { list.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:8px;">No students for this class.</p>'; return; }

    list.innerHTML = clsStudents.map(s => {
        const cur = existing[s.id] || 'P';
        const btns = ATTEND_STATUSES.map(st =>
            `<button type="button" class="attend-status-btn ${cur===st?'active-'+st:''}" data-sid="${s.id}" data-st="${st}" onclick="toggleAttendStatus(this)">${st}</button>`
        ).join('');
        return `<div class="attend-student-row">
            <span class="attend-student-name">${s.firstName} ${s.lastName||''}</span>
            <div class="attend-status-btns">${btns}</div>
        </div>`;
    }).join('');
}

function toggleAttendStatus(btn) {
    const sid = btn.dataset.sid;
    btn.closest('.attend-status-btns').querySelectorAll('.attend-status-btn').forEach(b => b.className = 'attend-status-btn');
    btn.classList.add('active-' + btn.dataset.st);
}

async function saveAttendance() {
    const cid  = document.getElementById('attend-class-select').value;
    const date = document.getElementById('attend-date').value;
    if (!cid)  { showToast('Select a class.'); return; }
    if (!date) { showToast('Select a date.'); return; }

    const record = {};
    document.querySelectorAll('.attend-status-btns').forEach(row => {
        const activeBtn = row.querySelector('.attend-status-btn[class*="active-"]');
        if (activeBtn) record[activeBtn.dataset.sid] = activeBtn.dataset.st;
    });

    const key = cid + '_' + date;
    try {
        showLoading();
        await getYearPath().collection('attendance').doc(key).set(record);
        attendance[key] = record;
        hideLoading();
        document.getElementById('attendance-modal').classList.add('hidden');
        renderAttendanceView();
        showToast('📅 Attendance saved!');
    } catch(e) { hideLoading(); showToast('Error: ' + e.message); }
}

function printAttendanceReport() {
    const clsFilter = document.getElementById('attend-class-filter')?.value||'';
    const monthFilter = document.getElementById('attend-month-filter')?.value||'';
    const clsName = clsFilter ? (classes.find(c=>c.id===clsFilter)?.name||'Class') : 'All Classes';

    const filteredKeys = Object.keys(attendance).filter(k => {
        const [kCls, kDate] = k.split('_');
        return (!clsFilter || kCls===clsFilter) && (!monthFilter || kDate.startsWith(monthFilter));
    });
    if (!filteredKeys.length) { showToast('No attendance data to print.'); return; }

    const dateMap = {};
    // Merge every class's record for a date (v6.2.0 -- the second class on a
    // date used to overwrite the first, printing "?" for marked students).
    filteredKeys.forEach(k => {
        const [kCls, kDate] = k.split('_');
        const rec = attendance[k] || {};
        const merged = dateMap[kDate] || (dateMap[kDate] = {});
        Object.keys(rec).forEach(sid => { if (rec[sid]) merged[sid] = rec[sid]; });
    });
    const dates = Object.keys(dateMap).sort();
    const clsStudents = clsFilter ? students.filter(s => !s.classId || s.classId===clsFilter) : students;

    let rows = clsStudents.map(s => {
        const cells = dates.map(d => {
            const st = (dateMap[d]||{})[s.id]||'';
            const bg = st==='P'?'#e8f5e9':st==='A'?'#ffebee':st==='T'?'#fff8e1':st==='E'?'#e3f2fd':'#fafafa';
            return `<td style="text-align:center;padding:4px 6px;background:${bg};border:1px solid #ddd;">${st||'?'}</td>`;
        }).join('');
        const p = dates.filter(d=>(dateMap[d]||{})[s.id]==='P').length;
        const a = dates.filter(d=>(dateMap[d]||{})[s.id]==='A').length;
        return `<tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:600;">${s.firstName} ${s.lastName||''}</td>${cells}
            <td style="text-align:center;padding:4px 6px;border:1px solid #ddd;font-weight:700;color:#2e7d32;">${p}</td>
            <td style="text-align:center;padding:4px 6px;border:1px solid #ddd;font-weight:700;color:#c62828;">${a}</td></tr>`;
    }).join('');

    const hdrs = dates.map(d => {
        const day = new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'});
        return `<th style="padding:5px 6px;background:#4A3B8C;color:white;border:1px solid #3a2b7c;font-size:11px;">${day}</th>`;
    }).join('');

    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Attendance — ${clsName}</title>
        <style>body{font-family:Arial,sans-serif;margin:0;font-size:13px;}
        .no-print{margin-bottom:12px;} @media print{.no-print{display:none!important;}}</style>
        </head><body>
        <div class="no-print"><button onclick="window.print()" style="padding:6px 14px;background:#7B5EA7;color:white;border:none;border-radius:4px;cursor:pointer;">🖨️ Print</button></div>
        <h2 style="margin:0 0 4px;">Attendance — ${clsName}</h2>
        <p style="margin:0 0 12px;color:#888;font-size:12px;">${monthFilter||'All dates'}</p>
        <table style="border-collapse:collapse;width:100%;">
        <thead><tr><th style="padding:5px 8px;background:#4A3B8C;color:white;border:1px solid #3a2b7c;text-align:left;">Student</th>
        ${hdrs}
        <th style="padding:5px 6px;background:#2e7d32;color:white;border:1px solid #1b5e20;">Present</th>
        <th style="padding:5px 6px;background:#c62828;color:white;border:1px solid #b71c1c;">Absent</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <p style="margin-top:10px;font-size:11px;color:#aaa;">P=Present A=Absent T=Tardy E=Excused</p>
        </body></html>`, {v:'0.4in',h:'0.3in'}));
    win.document.close();
}

// ============================================================
// SEATING CHART
// ============================================================

let seatingData = { rows: 5, cols: 6, seats: {} };
let _seatPickerTarget = null;
let _qrMode = 'quiz';
let _qrOutput = '';

async function loadSeatingChart() {
    try {
        const doc = await getYearPath().collection('settings').doc('seatingChart').get();
        if (doc.exists) {
            const d = doc.data();
            seatingData = { rows: d.rows||5, cols: d.cols||6, seats: d.seats||{} };
            const ri = document.getElementById('seat-rows');
            const ci = document.getElementById('seat-cols');
            if(ri) ri.value = seatingData.rows;
            if(ci) ci.value = seatingData.cols;
        } else {
            // No chart for this year yet -- don't keep showing the last year's.
            seatingData = { rows: 5, cols: 6, seats: {} };
        }
    } catch(e) { console.warn('loadSeatingChart:', e.message); }
}

async function saveSeatingChart() {
    try {
        await getYearPath().collection('settings').doc('seatingChart').set(seatingData);   // v6.2.0: no merge -- a merge kept deleted seats in the nested map
    } catch(e) { console.warn('saveSeatingChart:', e.message); }
}

function renderSeatingChart() {
    const rows = Math.min(10, Math.max(1, parseInt(document.getElementById('seat-rows')?.value)||5));
    const cols = Math.min(10, Math.max(1, parseInt(document.getElementById('seat-cols')?.value)||6));
    seatingData.rows = rows; seatingData.cols = cols;

    const wrap = document.getElementById('seating-grid-wrap');
    if (!wrap) return;
    closeSeatPicker();

    const tagColors = { IEP:'#ef9a9a', '504':'#ffcc80', ELL:'#90caf9', GT:'#a5d6a7', Behavior:'#ce93d8', Speech:'#80cbc4' };

    let html = '<div class="classroom-front">▼ Front of Classroom ▼</div>';
    html += `<div class="seating-grid" style="grid-template-columns:repeat(${cols},80px);">`;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const key = r + '-' + c;
            const sid = seatingData.seats[key];
            const s   = sid ? students.find(x => x.id === sid) : null;
            if (s) {
                const bg = studentColor(s);
                const tags = (s.tags||[]).map(t => `<div class="desk-mini-tag" style="background:${tagColors[t]||'#888'}" title="${t}"></div>`).join('');
                html += `<div class="desk occupied" style="background:${bg}22;border-color:${bg}88;"
                    onclick="openSeatPicker(event,'${key}')" data-key="${key}">
                    <div class="desk-name">${s.firstName}<br>${s.lastName?s.lastName[0]+'.':''}</div>
                    <div class="desk-tag-row">${tags}</div>
                </div>`;
            } else {
                html += `<div class="desk" onclick="openSeatPicker(event,'${key}')" data-key="${key}">
                    <div class="desk-empty-label">+ assign</div>
                </div>`;
            }
        }
    }
    html += '</div>';
    wrap.innerHTML = html;
}

function openSeatPicker(e, key) {
    e.stopPropagation();
    closeSeatPicker();
    _seatPickerTarget = key;
    const popup = document.getElementById('seat-picker-popup');
    if (!popup) return;

    const unassigned = students.filter(s => !Object.values(seatingData.seats).includes(s.id));
    const currentId  = seatingData.seats[key];
    const currentStudent = currentId ? students.find(s => s.id === currentId) : null;

    let html = '';
    if (currentStudent) {
        html += `<div class="seat-picker-item seat-picker-clear" onclick="clearSeat('${key}')">✕ Remove ${currentStudent.firstName}</div>`;
        html += '<div style="height:1px;background:rgba(255,255,255,0.08);margin:4px 0;"></div>';
    }
    if (unassigned.length === 0 && !currentStudent) {
        html = '<div style="font-size:0.72rem;color:var(--text-muted);padding:4px;">All students are seated.</div>';
    } else {
        unassigned.forEach(s => {
            html += `<div class="seat-picker-item" onclick="assignSeat('${key}','${s.id}')">
                <div style="width:22px;height:22px;border-radius:50%;background:${studentColor(s)};display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;color:white;flex-shrink:0;">${studentInitials(s)}</div>
                ${s.firstName} ${s.lastName||''}
            </div>`;
        });
    }

    popup.innerHTML = html;
    popup.classList.remove('hidden');

    // Position near clicked desk
    const rect = e.target.closest('.desk').getBoundingClientRect();
    const wrapRect = document.getElementById('seating-grid-wrap').getBoundingClientRect();
    popup.style.left = Math.min(rect.left - wrapRect.left, wrapRect.width - 200) + 'px';
    popup.style.top  = (rect.bottom - wrapRect.top + 4) + 'px';
    popup.style.position = 'absolute';
    document.getElementById('seating-grid-wrap').style.position = 'relative';
}

function closeSeatPicker() {
    document.getElementById('seat-picker-popup')?.classList.add('hidden');
    _seatPickerTarget = null;
}

async function assignSeat(key, studentId) {
    seatingData.seats[key] = studentId;
    await saveSeatingChart();
    renderSeatingChart();
}

async function clearSeat(key) {
    delete seatingData.seats[key];
    await saveSeatingChart();
    renderSeatingChart();
}

async function clearAllSeats() {
    if (!await planyConfirm('Clear all seat assignments?')) return;
    seatingData.seats = {};
    await saveSeatingChart();
    renderSeatingChart();
}

async function autoArrangeSeats() {
    const rows = seatingData.rows, cols = seatingData.cols;
    const shuffled = [...students].sort(() => Math.random() - 0.5);
    seatingData.seats = {};
    shuffled.forEach((s, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        if (r < rows) seatingData.seats[r + '-' + c] = s.id;
    });
    await saveSeatingChart();
    renderSeatingChart();
    showToast('⚡ Seats randomly arranged!');
}

function printSeatingChart() {
    const rows = seatingData.rows, cols = seatingData.cols;
    const tagColors = { IEP:'#e57373', '504':'#ffb74d', ELL:'#64b5f6', GT:'#81c784', Behavior:'#ba68c8', Speech:'#4db6ac' };
    let grid = '';
    for (let r = 0; r < rows; r++) {
        let row = '<tr>';
        for (let c = 0; c < cols; c++) {
            const sid = seatingData.seats[r+'-'+c];
            const s   = sid ? students.find(x => x.id === sid) : null;
            const tags = s ? (s.tags||[]).map(t=>`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${tagColors[t]||'#999'};margin:1px;" title="${t}"></span>`).join('') : '';
            row += s
                ? `<td style="border:1px solid #ccc;padding:8px;text-align:center;background:#f8f8f8;min-width:80px;"><strong>${s.firstName}</strong><br><small>${s.lastName||''}</small><br>${tags}</td>`
                : `<td style="border:1px dashed #ddd;padding:8px;min-width:80px;"></td>`;
        }
        row += '</tr>';
        grid += row;
    }
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><title>Seating Chart</title>
        <style>body{font-family:Arial,sans-serif;margin:0;}h2{text-align:center;}table{border-collapse:collapse;margin:0 auto;}
        .front{text-align:center;font-size:12px;color:#666;margin-bottom:10px;letter-spacing:2px;}
        @media print{.no-print{display:none}}</style></head><body>
        <button class="no-print" onclick="window.print()" style="margin-bottom:12px;padding:6px 14px;cursor:pointer;">Print</button>
        <h2>Seating Chart</h2>
        <div class="front">▼ FRONT OF CLASSROOM ▼</div>
        <table>${grid}</table></body></html>`, {v:'0.4in',h:'0.3in'}));
    win.document.close();
}

document.addEventListener('click', e => {
    if (!e.target.closest('.desk') && !e.target.closest('.seat-picker-popup')) closeSeatPicker();
});


// ============================================================
// PARENT COMMUNICATION LOG
// ============================================================
// communications declared at top of file

async function loadCommunications() {
    try {
        const snap = await getYearPath().collection('communications').orderBy('date','desc').get();
        communications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window._commsYear = settings.schoolYear;   // v6.2.0: reload after a year switch
    } catch(e) { console.warn('loadCommunications:', e.message); communications = []; }
}

function populateCommsFilters() {
    const sel = document.getElementById('comms-student-filter');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">All students</option>';
    students.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.firstName + ' ' + (s.lastName||'');
        sel.appendChild(o);
    });
    sel.value = cur;

    const cSel = document.getElementById('comm-student');
    if (cSel) {
        cSel.innerHTML = '<option value="">Select student…</option>';
        students.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id;
            o.textContent = s.firstName + ' ' + (s.lastName||'');
            cSel.appendChild(o);
        });
    }
}

function renderCommsLog() {
    const wrap = document.getElementById('comms-log-wrap');
    if (!wrap) return;
    const sFilter = document.getElementById('comms-student-filter')?.value || '';
    const mFilter = document.getElementById('comms-method-filter')?.value || '';

    let list = communications;
    if (sFilter) list = list.filter(c => c.studentId === sFilter);
    if (mFilter) list = list.filter(c => c.method === mFilter);

    if (!list.length) {
        wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;padding:1rem 0;">No contacts logged yet. Click <strong>+ Log Contact</strong> to start.</p>';
        return;
    }

    const methodIcon = { phone:'📞', email:'📧', conference:'🤝', note:'📝', text:'💬', other:'📋' };
    const methodColor = { phone:'rgba(30,136,229,.2)', email:'rgba(67,160,71,.2)', conference:'rgba(156,39,176,.2)', note:'rgba(251,140,0,.2)', text:'rgba(0,188,212,.2)', other:'rgba(120,144,156,.2)' };

    let html = '<table class="comms-table"><thead><tr><th>Date</th><th>Student</th><th>Method</th><th>Contact</th><th>By</th><th>Notes</th><th></th></tr></thead><tbody>';
    list.forEach(c => {
        const d = new Date(c.date + 'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
        const icon = methodIcon[c.method] || '📋';
        const bg   = methodColor[c.method] || '';
        const fu   = c.followUp ? '<span class="comm-followup-dot" title="Needs follow-up"></span> ' : '';
        const notes = (c.notes||'').substring(0, 60) + ((c.notes||'').length > 60 ? '…' : '');
        html += `<tr class="comms-row" onclick="openCommModal('${c.id}')">
            <td>${d}</td>
            <td>${c.studentName||'—'}</td>
            <td><span class="comm-method-badge" style="background:${bg}">${icon} ${c.method}</span></td>
            <td style="color:var(--text-secondary)">${c.contactName||'—'}</td>
            <td style="color:var(--text-muted);font-size:0.7rem;">${c.initiatedBy==='parent'?'Parent':'Teacher'}</td>
            <td style="color:var(--text-secondary)">${fu}${notes}</td>
            <td><button class="btn btn-icon" style="font-size:0.7rem;opacity:0.5;" onclick="event.stopPropagation();deleteComm('${c.id}')">🗑️</button></td>
        </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
}

function openCommModal(id) {
    const modal = document.getElementById('comm-modal');
    if (!modal) return;
    document.getElementById('comm-form').reset();
    document.getElementById('comm-id').value = '';
    populateCommsFilters();
    const del = document.getElementById('delete-comm-btn');
    if (id) {
        const c = communications.find(x => x.id === id);
        if (!c) return;
        document.getElementById('comm-modal-title').textContent = '✏️ Edit Contact Log';
        document.getElementById('comm-id').value          = c.id;
        document.getElementById('comm-date').value        = c.date || '';
        document.getElementById('comm-student').value     = c.studentId || '';
        document.getElementById('comm-contact').value     = c.contactName || '';
        document.getElementById('comm-method').value      = c.method || 'phone';
        document.getElementById('comm-initiated').value   = c.initiatedBy || 'teacher';
        document.getElementById('comm-followup').checked  = !!c.followUp;
        document.getElementById('comm-notes').value       = c.notes || '';
        del?.classList.remove('hidden');
    } else {
        document.getElementById('comm-modal-title').textContent = '📞 Log Parent Contact';
        document.getElementById('comm-date').value = formatDate(new Date());
        del?.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

function closeCommModal() {
    document.getElementById('comm-modal')?.classList.add('hidden');
}

document.getElementById('comm-form')?.addEventListener('submit', async(e) => {
    e.preventDefault();
    const sid   = document.getElementById('comm-student').value;
    const s     = students.find(x => x.id === sid);
    const data  = {
        date:        document.getElementById('comm-date').value,
        studentId:   sid,
        studentName: s ? s.firstName + ' ' + (s.lastName||'') : '',
        contactName: document.getElementById('comm-contact').value.trim(),
        method:      document.getElementById('comm-method').value,
        initiatedBy: document.getElementById('comm-initiated').value,
        followUp:    document.getElementById('comm-followup').checked,
        notes:       document.getElementById('comm-notes').value.trim(),
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
    };
    showLoading();
    try {
        const cid = document.getElementById('comm-id').value;
        if (cid) {
            await getYearPath().collection('communications').doc(cid).update(data);
            const i = communications.findIndex(c => c.id === cid);
            if (i >= 0) communications[i] = { ...communications[i], ...data };
        } else {
            const ref = await getYearPath().collection('communications').add(data);
            communications.unshift({ id: ref.id, ...data });
        }
        closeCommModal();
        renderCommsLog();
        showToast('📞 Contact logged!');
    } catch(err) { showToast('Error: ' + err.message); }
    hideLoading();
});

async function deleteComm(id) {
    const cid = id || document.getElementById('comm-id').value;
    if (!cid || !await planyConfirm('Delete this log entry?')) return;
    showLoading();
    try {
        await getYearPath().collection('communications').doc(cid).delete();
        communications = communications.filter(c => c.id !== cid);
        closeCommModal();
        renderCommsLog();
        showToast('Entry deleted.');
    } catch(err) { showToast('Error: ' + err.message); }
    hideLoading();
}


// ============================================================
// QUIZ & RUBRIC GENERATOR
// ============================================================

// Strips common Markdown syntax so AI output displays as clean plain text
// in the preview <div> and the print window (neither renders Markdown).
function stripMarkdown(text) {
    if (!text) return text;
    return text
        .replace(/^#{1,6}\s+/gm, '')          // # Headings
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // ***bold italic***
        .replace(/\*\*(.+?)\*\*/g, '$1')      // **bold**
        .replace(/__(.+?)__/g, '$1')          // __bold__
        .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '$1') // *italic*
        .replace(/(?<!_)_(?!_)(.+?)_(?!_)/g, '$1')      // _italic_
        .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // `code`
        .replace(/^\s*[-*+]\s+/gm, '• ')      // - bullet / * bullet
        .replace(/^\s*>\s?/gm, '');           // > blockquote
}

function setQrMode(mode) {
    _qrMode = mode;
    document.getElementById('qr-quiz-btn')?.classList.toggle('btn-primary', mode === 'quiz');
    document.getElementById('qr-quiz-btn')?.classList.toggle('btn-ghost',   mode !== 'quiz');
    document.getElementById('qr-rubric-btn')?.classList.toggle('btn-primary', mode === 'rubric');
    document.getElementById('qr-rubric-btn')?.classList.toggle('btn-ghost',   mode !== 'rubric');
    document.getElementById('qr-quiz-fields')?.classList.toggle('hidden',   mode !== 'quiz');
    document.getElementById('qr-rubric-fields')?.classList.toggle('hidden', mode !== 'rubric');
    document.getElementById('qr-preview')?.classList.add('hidden');
    document.getElementById('qr-print-btn')?.classList.add('hidden');
    document.getElementById('qr-status').textContent = '';
    _qrOutput = '';
}

async function runQuizRubricGenerator() {
    if (!hasEffectiveAiKey()) { showToast('Add your API key first.'); return; }
    const statusEl  = document.getElementById('qr-status');
    const previewEl = document.getElementById('qr-preview');
    const printBtn  = document.getElementById('qr-print-btn');
    const genBtn    = document.getElementById('qr-generate-btn');
    const grade     = aiSettings.grade || '1';
    const standards = document.getElementById('qr-standards')?.value.trim() || '';

    let prompt = '';
    if (_qrMode === 'quiz') {
        const topic  = document.getElementById('qr-topic')?.value.trim();
        if (!topic) { showToast('Enter a topic.'); return; }
        const numQ   = document.getElementById('qr-num-q')?.value || '10';
        const qtype  = document.getElementById('qr-qtype')?.value || 'mixed';
        const ansKey = document.getElementById('qr-answer-key')?.checked;
        const qtypeLabel = { mixed:'a mix of multiple choice, short answer, true/false, and fill-in-the-blank', multiple_choice:'multiple choice (A/B/C/D)', short_answer:'short answer', true_false:'true/false', fill_blank:'fill in the blank' }[qtype] || qtype;

        prompt = `Create a ${numQ}-question Grade ${grade} quiz on: "${topic}"\n`
            + `Question types: ${qtypeLabel}\n`
            + (standards ? `Standards: ${standards}\n` : '')
            + `\nFormat:\n- Title at the top\n- Name/Date line\n- Numbered questions clearly formatted\n- For multiple choice: indent answer choices A B C D\n- Leave space for student answers on short answer questions\n`
            + (ansKey ? `\nAfter all questions, add an ANSWER KEY section clearly separated by a divider line.\n` : '')
            + `\nWrite for Grade ${grade} reading level. Keep language clear and age-appropriate.`
            + `\nPlain text only — do not use Markdown syntax (no **, ##, backticks, etc.).`;
    } else {
        const task     = document.getElementById('qr-rubric-task')?.value.trim();
        if (!task) { showToast('Enter a task or assignment name.'); return; }
        const criteria = document.getElementById('qr-criteria')?.value || '4';
        const scale    = document.getElementById('qr-scale')?.value || '4';
        prompt = `Create a ${criteria}-criteria, ${scale}-point rubric for Grade ${grade} for the following task: "${task}"\n`
            + (standards ? `Standards: ${standards}\n` : '')
            + `\nFor each criterion provide:\n- A clear criterion name\n- ${scale} performance level descriptions (${Array.from({length:parseInt(scale)},(_,i)=>scale-i).join(', ')} points)\n`
            + `\nFormat as a clear text table with criterion names in the first column and point levels across the top.\nAfter the table, add a Total Points row.\nKeep language positive and descriptive. Write for Grade ${grade}.`
            + `\nPlain text only — do not use Markdown syntax (no **, ##, backticks, etc.).`;
    }

    statusEl.textContent  = '🤖 Generating…';
    previewEl.classList.add('hidden');
    printBtn.classList.add('hidden');
    if (genBtn) genBtn.disabled = true;
    _qrOutput = '';

    try {
        _qrOutput = await callAIText({ prompt, tier: 'fast', maxTokens: 2000 });
        _qrOutput = stripMarkdown(_qrOutput);

        previewEl.textContent = _qrOutput;
        previewEl.classList.remove('hidden');
        printBtn.classList.remove('hidden');
        statusEl.textContent = '';
        const qrTitle = _qrMode === 'quiz'
            ? (document.getElementById('qr-topic')?.value.trim() || 'Quiz')
            : (document.getElementById('qr-rubric-task')?.value.trim() || 'Rubric');
        if (await saveAiOutput(null, { type: _qrMode === 'quiz' ? 'quiz' : 'rubric', label: qrTitle, text: _qrOutput, standards })) {
            statusEl.textContent = '💾 Saved to your list below.';
            refreshQrHistory();
        }
    } catch(e) {
        statusEl.textContent = 'Error: ' + e.message;
    }
    if (genBtn) genBtn.disabled = false;
}

// Saved quizzes & rubrics, listed under the generator
async function refreshQrHistory() {
    const previewEl = document.getElementById('qr-preview');
    if (!previewEl) return;
    let box = document.getElementById('qr-history');
    if (!box) {
        box = document.createElement('div');
        box.id = 'qr-history';
        box.className = 'ai-history';
        previewEl.insertAdjacentElement('afterend', box);
    }
    const items = await listAiOutputs(['quiz', 'rubric']);
    renderAiHistory(box, items, 'Saved quizzes & rubrics', (item) => {
        _qrMode = item.type === 'rubric' ? 'rubric' : 'quiz';
        if (typeof setQrMode === 'function') { try { setQrMode(_qrMode); } catch (_) {} }
        const titleInput = document.getElementById(_qrMode === 'quiz' ? 'qr-topic' : 'qr-rubric-task');
        if (titleInput) titleInput.value = item.label || '';
        _qrOutput = item.text || '';
        previewEl.textContent = _qrOutput;
        previewEl.classList.remove('hidden');
        document.getElementById('qr-print-btn')?.classList.remove('hidden');
        const st = document.getElementById('qr-status');
        if (st) st.textContent = `💾 Saved ${aiSavedStamp(item.savedAt)}`;
    }, refreshQrHistory);
}

document.getElementById('accord-quiz')?.addEventListener('toggle', (e) => { if (e.target.open) refreshQrHistory(); });

// Shared list renderer: title · date · Open · ✕
function renderAiHistory(box, items, heading, onOpen, onChanged) {
    if (!items.length) { box.innerHTML = ''; return; }
    const icon = { quiz: '📝', rubric: '📋', differentiation: '🎯' };
    box.innerHTML = `<div class="ai-history-head">${escHtml(heading)}</div>` + items.map(it => `
        <div class="ai-history-row">
            <button type="button" class="ai-history-open" data-id="${escHtml(it.id)}">
                <span>${icon[it.type] || '✨'} ${escHtml(it.label || 'Untitled')}</span>
                <span class="ai-history-date">${escHtml(aiSavedStamp(it.savedAt))}</span>
            </button>
            <button type="button" class="btn btn-icon-sm ai-history-del" data-id="${escHtml(it.id)}" aria-label="Delete ${escHtml(it.label || 'saved item')}" title="Delete">✕</button>
        </div>`).join('');
    box.querySelectorAll('.ai-history-open').forEach(b => b.addEventListener('click', () => {
        const it = items.find(x => x.id === b.dataset.id);
        if (it) onOpen(it);
    }));
    box.querySelectorAll('.ai-history-del').forEach(b => b.addEventListener('click', async () => {
        const it = items.find(x => x.id === b.dataset.id);
        if (!it || !await planyConfirm(`Delete "${it.label || 'this item'}"?`)) return;
        if (await deleteAiOutput(it.id)) { showToast('Deleted'); onChanged(); }
    }));
}

function printQuizRubric() {
    if (!_qrOutput) return;
    const grade = aiSettings.grade || '1';
    const title = _qrMode === 'quiz'
        ? (document.getElementById('qr-topic')?.value || 'Quiz')
        : (document.getElementById('qr-rubric-task')?.value || 'Rubric');
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>${title}</title>
        <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111; max-width: none; margin: 24px 0; padding: 0; }
        h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
        pre { white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; }
        .no-print { background: #eaf3fb; border: 1px solid #aad4f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
        @media print { .no-print { display: none !important; } }
        </style></head><body>
        <div class="no-print">
            <button onclick="window.print()" style="padding:6px 16px;cursor:pointer;background:#2980b9;color:white;border:none;border-radius:4px;">🖨️ Print</button>
            <span style="margin-left:12px;font-size:13px;color:#555;">Or use browser File → Save as PDF</span>
        </div>
        <pre>${_qrOutput.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
        </body></html>`, {v:'0.4in',h:'0.3in'}));
    win.document.close();
}

// ============================================================
// STUDENTS — ROSTER, GRADEBOOK, IEP, GOOGLE CLASSROOM
// ============================================================
// students, assignments declared at top of file
let gcAccessToken = null;
let _activeTagFilter = '';
let _activeStudentsTab = 'roster';

const STUDENT_COLORS = ['#7B5EA7','#D4698A','#3A86C8','#2A9D7F','#E8832A','#C0392B','#8E7B4E'];
function studentColor(s){ const n=(s.firstName||'?')[0].charCodeAt(0); return STUDENT_COLORS[n%STUDENT_COLORS.length]; }
function studentInitials(s){ return ((s.firstName||'?')[0]+(s.lastName||'')[0]||'').toUpperCase(); }

// ── Load / save ───────────────────────────────────────────────────────────
async function loadStudents(){
    try{
        const snap = await getYearPath().collection('students').orderBy('lastName').get();
        students = snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(e){ console.warn('loadStudents:',e.message); students=[]; }
}
async function loadAssignments(){
    try{
        const snap = await getYearPath().collection('assignments').orderBy('date','desc').get();
        assignments = snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(e){ console.warn('loadAssignments:',e.message); assignments=[]; }
}

// ── Tab switching ─────────────────────────────────────────────────────────
function switchStudentsTab(tab){
    _activeStudentsTab = tab;
    document.querySelectorAll('.stab').forEach(b=>b.classList.toggle('active', b.dataset.stab===tab));
    document.querySelectorAll('.stab-panel').forEach(p=>p.classList.add('hidden'));
    const panel = document.getElementById('stab-'+tab);
    if(panel) panel.classList.remove('hidden');
    if(tab==='roster')  renderRoster();
    if(tab==='grades')  { populateGbFilters(); renderGradebook(); }
    if(tab==='iep')     renderIepTable();
    if(tab==='seating') { loadSeatingChart().then(()=>renderSeatingChart()); }
    if(tab==='comms')   { populateCommsFilters(); if(!communications.length || window._commsYear !== settings.schoolYear) loadCommunications().then(()=>renderCommsLog()); else renderCommsLog(); }
    if(tab==='attend')  { populateAttendClassFilters(); if(!Object.keys(attendance).length) loadAttendance().then(()=>renderAttendanceView()); else renderAttendanceView(); }
}

// Called when Students view is shown
async function loadStudentsView(){
    if(!students.length)    await loadStudents();
    if(!assignments.length) await loadAssignments();
    renderRoster();
    renderGroupFilterChips();
    populateGbFilters();
}

// ── Roster ────────────────────────────────────────────────────────────────
function renderGroupFilterChips(){
    const groups = [...new Set(students.map(s=>s.group).filter(Boolean))];
    const el = document.getElementById('student-group-filters');
    if(!el) return;
    el.innerHTML = groups.map(g=>
        `<button class="tag-chip" data-group="${g}" onclick="filterByGroup(this)">${g}</button>`
    ).join('');
}

function filterStudents(){
    const q = (document.getElementById('student-search')?.value||'').toLowerCase();
    document.querySelectorAll('.student-card').forEach(card=>{
        const name = (card.dataset.name||'').toLowerCase();
        card.style.display = name.includes(q) ? '' : 'none';
    });
}

function filterByTag(btn){
    _activeTagFilter = btn.dataset.tag || '';
    document.querySelectorAll('.tag-filter-chips .tag-chip').forEach(b=>b.classList.toggle('active', b===btn));
    renderRoster();
}

function filterByGroup(btn){
    const g = btn.dataset.group;
    const current = btn.classList.contains('active');
    document.querySelectorAll('.group-filter-chips .tag-chip').forEach(b=>b.classList.remove('active'));
    if(!current){ btn.classList.add('active'); }
    const filterGroup = current ? '' : g;
    renderRoster(filterGroup);
}

function renderRoster(groupFilter){
    const grid = document.getElementById('roster-grid');
    if(!grid) return;
    let list = students;
    if(_activeTagFilter) list = list.filter(s=>(s.tags||[]).includes(_activeTagFilter));
    if(groupFilter)      list = list.filter(s=>s.group===groupFilter);
    if(!list.length){
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:0.82rem;padding:2rem;">No students yet. Click <strong>+ Add Student</strong> or import from Google Classroom.</div>';
        return;
    }
    grid.innerHTML = list.map(s=>`
        <div class="student-card" data-name="${(s.firstName+' '+(s.lastName||'')).toLowerCase()}" onclick="openStudentModal('${s.id}')">
            <div class="student-avatar" style="background:${studentColor(s)}">${studentInitials(s)}</div>
            <div class="student-name">${s.firstName}${s.lastName?' '+s.lastName:''}</div>
            <div class="student-meta">${s.group||''}${s.readingLevel?' · Lvl '+s.readingLevel:''}</div>
            <div class="student-tags">${(s.tags||[]).map(t=>`<span class="student-tag tag-${t}">${t}</span>`).join('')}</div>
        </div>`
    ).join('');
}

// ── Student modal ─────────────────────────────────────────────────────────
function openStudentModal(studentId){
    const modal = document.getElementById('student-modal');
    const form  = document.getElementById('student-form');
    if(!modal||!form) return;
    form.reset();
    document.getElementById('student-id').value = '';

    // Populate class dropdown
    const sel = document.getElementById('student-class');
    sel.innerHTML = '<option value="">All / Homeroom</option>';
    classes.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });

    const deleteBtn = document.getElementById('delete-student-btn');
    if(studentId){
        const s = students.find(x=>x.id===studentId);
        if(!s) return;
        document.getElementById('student-modal-title').textContent = '✏️ Edit Student';
        document.getElementById('student-id').value       = s.id;
        document.getElementById('student-first').value    = s.firstName||'';
        document.getElementById('student-last').value     = s.lastName||'';
        document.getElementById('student-nickname').value = s.nickname||'';
        document.getElementById('student-group').value    = s.group||'';
        document.getElementById('student-reading-level').value = s.readingLevel||'';
        document.getElementById('student-class').value    = s.classId||'';
        document.getElementById('student-accommodations').value = s.accommodations||'';
        document.getElementById('student-notes').value    = s.notes||'';
        // Restore tags
        document.querySelectorAll('.student-tag-checks input[type=checkbox]').forEach(cb=>{
            cb.checked = (s.tags||[]).includes(cb.value);
        });
        deleteBtn?.classList.remove('hidden');
    } else {
        document.getElementById('student-modal-title').textContent = '👤 Add Student';
        document.querySelectorAll('.student-tag-checks input[type=checkbox]').forEach(cb=>cb.checked=false);
        deleteBtn?.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

function closeStudentModal(){
    document.getElementById('student-modal')?.classList.add('hidden');
}

// "+ Add Student" button (top of Students view) had no click handler at all
// -- openStudentModal() already fully supports the no-args "add new" flow.
document.getElementById('add-student-btn')?.addEventListener('click', () => openStudentModal());

document.getElementById('student-form')?.addEventListener('submit', async(e)=>{
    e.preventDefault();
    const tags = Array.from(document.querySelectorAll('.student-tag-checks input:checked')).map(cb=>cb.value);
    const data = {
        firstName:      document.getElementById('student-first').value.trim(),
        lastName:       document.getElementById('student-last').value.trim(),
        nickname:       document.getElementById('student-nickname').value.trim(),
        group:          document.getElementById('student-group').value.trim(),
        readingLevel:   document.getElementById('student-reading-level').value.trim(),
        classId:        document.getElementById('student-class').value||null,
        accommodations: document.getElementById('student-accommodations').value.trim(),
        notes:          document.getElementById('student-notes').value.trim(),
        tags,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    showLoading();
    try{
        const sid = document.getElementById('student-id').value;
        if(sid){
            await getYearPath().collection('students').doc(sid).update(data);
            const i = students.findIndex(s=>s.id===sid);
            if(i>=0) students[i] = {...students[i],...data};
        } else {
            const ref = await getYearPath().collection('students').add(data);
            students.push({id:ref.id,...data});
        }
        students.sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||''));
        closeStudentModal();
        renderRoster();
        renderGroupFilterChips();
        showToast(document.getElementById('student-id').value ? 'Student updated!' : '👤 Student added!');
    }catch(err){ showToast('Error: '+err.message); }
    hideLoading();
});

async function deleteStudent(){
    const sid = document.getElementById('student-id').value;
    if(!sid||!await planyConfirm('Remove this student?')) return;
    showLoading();
    try{
        await getYearPath().collection('students').doc(sid).delete();
        students = students.filter(s=>s.id!==sid);
        closeStudentModal();
        renderRoster();
        showToast('Student removed.');
    }catch(err){ showToast('Error: '+err.message); }
    hideLoading();
}

// ── Gradebook ─────────────────────────────────────────────────────────────

// ── Gradebook settings (weights + scale) ─────────────────────────────────
let classGradeSettings = {};  // { classId: { scale, weights: { quiz:40, homework:20, ... } } }

const DEFAULT_WEIGHTS = { quiz:40, homework:25, project:25, participation:10 };
const GRADE_SCALES = {
    letter:  [[90,'A'],[80,'B'],[70,'C'],[60,'D'],[0,'F']],
    k5:      [[88,'4'],[75,'3'],[60,'2'],[0,'1']],
    mastery: [[88,'M'],[75,'AP'],[60,'IP'],[0,'NY']]
};

function getGradeLabel(pct, scale) {
    if (!scale || scale === 'percent') return null;
    const tiers = GRADE_SCALES[scale] || [];
    for (const [min, label] of tiers) { if (pct >= min) return label; }
    return tiers[tiers.length-1]?.[1] || null;
}

function getClassGradeSettings(classId) {
    return classGradeSettings[classId] || { scale: 'percent', weights: { ...DEFAULT_WEIGHTS } };
}

async function loadClassGradeSettings() {
    try {
        const doc = await getYearPath().collection('settings').doc('gradeSettings').get();
        classGradeSettings = doc.exists ? (doc.data() || {}) : {};
    } catch(e) { console.warn('loadClassGradeSettings:', e.message); classGradeSettings = {}; }
}

async function saveClassGradeSettings() {
    try {
        await getYearPath().collection('settings').doc('gradeSettings').set(classGradeSettings);
    } catch(e) { console.warn('saveClassGradeSettings:', e.message); }
}

function openGradeSettings() {
    const modal = document.getElementById('grade-settings-modal');
    if (!modal) return;
    const sel = document.getElementById('gs-class');
    sel.innerHTML = '<option value="">Select a class…</option>';
    classes.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o); });
    document.getElementById('gs-body').classList.add('hidden');
    modal.classList.remove('hidden');
}

function loadGradeSettingsForClass() {
    const cid = document.getElementById('gs-class').value;
    if (!cid) { document.getElementById('gs-body').classList.add('hidden'); return; }
    const cfg = getClassGradeSettings(cid);
    document.getElementById('gs-scale').value = cfg.scale || 'percent';
    const cats = ['quiz','homework','project','participation'];
    const catLabels = { quiz:'Quiz 📝', homework:'Homework 📖', project:'Project 🏗️', participation:'Participation 🙋' };
    const w = document.getElementById('gs-weights');
    w.innerHTML = cats.map(cat =>
        `<div class="gs-weight-row">
            <span class="gs-weight-label">${catLabels[cat]}</span>
            <input class="form-control gs-weight-input" type="number" min="0" max="100" data-cat="${cat}" value="${cfg.weights?.[cat] ?? DEFAULT_WEIGHTS[cat]}" oninput="updateWeightTotal()">
            <span class="gs-weight-pct">%</span>
        </div>`
    ).join('') + '<div class="gs-weight-total" id="gs-weight-total"></div>';
    updateWeightTotal();
    document.getElementById('gs-body').classList.remove('hidden');
}

function updateWeightTotal() {
    const inputs = document.querySelectorAll('.gs-weight-input');
    const total = Array.from(inputs).reduce((s,i) => s + (parseInt(i.value)||0), 0);
    const el = document.getElementById('gs-weight-total');
    if (el) {
        el.textContent = 'Total: ' + total + '%' + (total !== 100 ? '  ⚠️ Must equal 100%' : '  ✅');
        el.style.color = total !== 100 ? 'var(--neon-pink)' : 'var(--text-secondary)';
    }
}

async function saveGradeSettings() {
    const cid = document.getElementById('gs-class').value;
    if (!cid) { showToast('Select a class.'); return; }
    const weights = {};
    document.querySelectorAll('.gs-weight-input').forEach(i => { weights[i.dataset.cat] = parseInt(i.value)||0; });
    const total = Object.values(weights).reduce((s,v)=>s+v,0);
    if (total !== 100) { showToast('Weights must add up to 100%.'); return; }
    classGradeSettings[cid] = { scale: document.getElementById('gs-scale').value, weights };
    await saveClassGradeSettings();
    document.getElementById('grade-settings-modal').classList.add('hidden');
    renderGradebook();
    showToast('⚙️ Grade settings saved!');
}

// ── Weighted average calculation ─────────────────────────────────────────
function calcWeightedAvg(studentId, filteredAssignments, settings) {
    const weights = settings.weights || DEFAULT_WEIGHTS;
    const cats = Object.keys(weights).filter(k => (weights[k]||0) > 0);
    if (cats.length === 0) return calcSimpleAvg(studentId, filteredAssignments);

    let totalWeight = 0, weightedSum = 0;
    cats.forEach(cat => {
        const catAssigns = filteredAssignments.filter(a => (a.category||'quiz') === cat);
        if (!catAssigns.length) return;
        const scored = catAssigns.filter(a => {
            const v = (a.scores||{})[studentId];
            return v !== undefined && v !== null && v !== '';
        });
        if (!scored.length) return;
        const pct = scored.reduce((s,a) => s + (parseFloat((a.scores||{})[studentId])||0), 0)
                  / scored.reduce((s,a) => s + (a.maxScore||100), 0) * 100;
        weightedSum += pct * (weights[cat]/100);
        totalWeight += (weights[cat]/100);
    });
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
}

function calcSimpleAvg(studentId, filteredAssignments) {
    const scored = filteredAssignments.filter(a => {
        const v = (a.scores||{})[studentId];
        return v !== undefined && v !== null && v !== '';
    });
    if (!scored.length) return null;
    return Math.round(scored.reduce((s,a)=>s+(parseFloat((a.scores||{})[studentId])||0),0)
                    / scored.reduce((s,a)=>s+(a.maxScore||100),0)*100);
}

// ── Gradebook view switcher ───────────────────────────────────────────────
let _gbView = 'grid';
function switchGbView(view) {
    _gbView = view;
    document.querySelectorAll('.gb-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    renderGradebook();
}

function populateGbFilters(){
    const clsSel = document.getElementById('gb-class-filter');
    if(!clsSel) return;
    const cur = clsSel.value;
    clsSel.innerHTML = '<option value="">All classes</option>';
    classes.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; clsSel.appendChild(o); });
    clsSel.value = cur;
    const asnSel = document.getElementById('assign-class');
    if(asnSel){
        asnSel.innerHTML = '<option value="">All</option>';
        classes.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; asnSel.appendChild(o); });
    }
    populateAttendClassFilters();
}

function renderGradebook(){
    const wrap = document.getElementById('gradebook-wrap');
    if(!wrap) return;
    if (_gbView === 'standards') { renderStandardsGradebook(); return; }

    const clsFilter = document.getElementById('gb-class-filter')?.value||'';
    const catFilter = document.getElementById('gb-cat-filter')?.value||'';
    let asgList = assignments.filter(a=> (!clsFilter||a.classId===clsFilter||!a.classId) && (!catFilter||a.category===catFilter));
    // The table shows the 25 newest columns, but averages use every
    // assignment (v6.2.0 -- they used to disagree with the CSV and report).
    const allAsgList = asgList;
    asgList = asgList.slice(0,25);

    if(!students.length){ wrap.innerHTML='<p style="color:var(--text-muted);font-size:0.82rem;">Add students to the roster first.</p>'; return; }
    if(!asgList.length){ wrap.innerHTML='<p style="color:var(--text-muted);font-size:0.82rem;">No assignments yet. Click <strong>+ Add Assignment</strong>.</p>'; return; }

    const cfg = clsFilter ? getClassGradeSettings(clsFilter) : { scale:'percent', weights: DEFAULT_WEIGHTS };
    const hasWeights = Object.values(cfg.weights||{}).some(w => w > 0);
    const catIcons = { quiz:'📝',homework:'📖',project:'🏗️',participation:'🙋' };

    let html = '<div style="overflow-x:auto;"><table class="gradebook-table"><thead><tr><th style="text-align:left">Student</th>';
    asgList.forEach(a=>{
        const wt = hasWeights ? `<span class="cat-weight-pill">${cfg.weights?.[a.category||'quiz']||0}%</span>` : '';
        html += `<th class="gb-header-rotate" title="${a.title}">`
            + `${catIcons[a.category||'quiz']||'📋'} ${a.title}${wt}`
            + `<br><span style="font-weight:400;opacity:0.6;font-size:0.65rem;">/${a.maxScore||100}</span>`
            + (a.standards ? `<br><span style="font-size:0.6rem;opacity:0.5;">${a.standards.split(',')[0].trim()}</span>` : '')
            + `<button class="assign-delete-btn" onclick="deleteAssignment('${a.id}')" title="Delete">✕</button></th>`;
    });
    html += '<th class="gb-avg">' + (hasWeights ? 'Wtd Avg' : 'Avg %') + '</th></tr></thead><tbody>';

    students.forEach(s=>{
        const avg = hasWeights
            ? calcWeightedAvg(s.id, allAsgList, cfg)
            : calcSimpleAvg(s.id, allAsgList);
        const label = avg !== null ? getGradeLabel(avg, cfg.scale) : null;
        const gradeBadge = label ? `<span class="gb-grade-badge grade-${label}">${label}</span>` : '';
        const name = s.firstName+(s.lastName?' '+s.lastName[0]+'.':'');
        html += `<tr><td title="${s.firstName} ${s.lastName||''}">${name}</td>`;
        asgList.forEach(a=>{
            const v = (a.scores||{})[s.id];
            html += `<td class="gb-score-cell" onclick="editGbCell(this,'${s.id}','${a.id}')" data-sid="${s.id}" data-aid="${a.id}" data-max="${a.maxScore||100}">${v!==undefined&&v!==null&&v!==''?v:'—'}</td>`;
        });
        html += `<td class="gb-avg">${avg!==null?avg+'%'+gradeBadge:'—'}</td></tr>`;
    });

    // Class avg row
    html += '<tr style="border-top:1px solid rgba(255,255,255,0.12);"><td style="font-weight:700;color:var(--text-muted);font-size:0.7rem;">CLASS AVG</td>';
    asgList.forEach(a=>{
        const vals = students.map(s=>(a.scores||{})[s.id]).filter(v=>v!==undefined&&v!==null&&v!=='');
        const avg = vals.length ? Math.round(vals.reduce((t,v)=>t+(parseFloat(v)||0),0)/(vals.length*(a.maxScore||100))*100) : null;
        html += `<td class="gb-avg">${avg!==null?avg+'%':'—'}</td>`;
    });
    html += '<td></td></tr></tbody></table></div>';
    wrap.innerHTML = html;
}

// ── Standards gradebook view ──────────────────────────────────────────────
function renderStandardsGradebook() {
    const wrap = document.getElementById('gradebook-wrap');
    if (!wrap) return;
    const clsFilter = document.getElementById('gb-class-filter')?.value||'';

    // Build standard → assignments map
    const stdMap = {};
    assignments.filter(a => a.standards && (!clsFilter || a.classId === clsFilter || !a.classId))
        .forEach(a => {
            a.standards.split(',').map(s => s.trim()).filter(Boolean).forEach(std => {
                if (!stdMap[std]) stdMap[std] = [];
                stdMap[std].push(a);
            });
        });

    if (!Object.keys(stdMap).length) {
        wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;">No assignments with standards linked yet. Edit an assignment and add a standard code.</p>';
        return;
    }

    let html = '<table class="std-gb-table"><thead><tr><th>Student</th>';
    const stds = Object.keys(stdMap);
    stds.forEach(std => { html += `<th title="${stdMap[std].map(a=>a.title).join(', ')}">${std.split('.').slice(-2).join('.')}</th>`; });
    html += '</tr></thead><tbody>';

    students.forEach(s => {
        html += `<tr><td style="font-weight:600">${s.firstName} ${s.lastName||''}</td>`;
        stds.forEach(std => {
            const asgns = stdMap[std];
            const scored = asgns.filter(a => { const v=(a.scores||{})[s.id]; return v!==undefined&&v!==null&&v!==''; });
            if (!scored.length) { html += '<td style="color:var(--text-muted)">—</td>'; return; }
            const pct = Math.round(scored.reduce((t,a)=>t+(parseFloat((a.scores||{})[s.id])||0),0)
                                 / scored.reduce((t,a)=>t+(a.maxScore||100),0)*100);
            const color = pct>=80?'#a5d6a7':pct>=60?'#ffcc80':'#ef9a9a';
            html += `<td><span style="font-weight:700;color:${color}">${pct}%</span>`
                + `<div class="std-mastery-bar"><div class="std-mastery-fill" style="width:${pct}%;background:${color}"></div></div></td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
}

function editGbCell(td, studentId, assignId){
    if(td.querySelector('input')) return;
    const cur = td.textContent.trim();
    const max = td.dataset.max || 100;
    td.innerHTML = `<input class="gb-score-input" type="number" min="0" max="${max}" value="${cur==='—'?'':cur}" autofocus>`;
    const inp = td.querySelector('input');
    inp.focus(); inp.select();
    const save = async()=>{
        const val = inp.value.trim();
        const numVal = val==='' ? null : parseFloat(val);
        try{
            const asnIdx = assignments.findIndex(a=>a.id===assignId);
            if(asnIdx<0) return;
            const scores = {...(assignments[asnIdx].scores||{})};
            if(numVal===null) delete scores[studentId];
            else scores[studentId] = numVal;
            await getYearPath().collection('assignments').doc(assignId).update({scores});
            assignments[asnIdx].scores = scores;
        }catch(e){ console.error(e); }
        td.textContent = numVal!==null ? numVal : '—';
    };
    inp.addEventListener('blur', save);
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') inp.blur(); if(e.key==='Escape'){ td.textContent=cur; } });
}

// Assignment modal
function openAssignmentModal(id){
    const modal = document.getElementById('assignment-modal');
    if(!modal) return;
    document.getElementById('assignment-form').reset();
    document.getElementById('assign-id').value = '';
    populateGbFilters();
    const deleteBtn = document.getElementById('delete-assign-btn');
    if(id){
        const a = assignments.find(x=>x.id===id);
        if(!a) return;
        document.getElementById('assign-modal-title').textContent = '📝 Edit Assignment';
        document.getElementById('assign-id').value       = a.id;
        document.getElementById('assign-title').value    = a.title||'';
        document.getElementById('assign-date').value     = a.date||'';
        document.getElementById('assign-max').value      = a.maxScore||100;
        document.getElementById('assign-class').value    = a.classId||'';
        document.getElementById('assign-category').value = a.category||'quiz';
        if(document.getElementById('assign-standards')) document.getElementById('assign-standards').value = a.standards||'';
        deleteBtn?.classList.remove('hidden');
    } else {
        document.getElementById('assign-modal-title').textContent = '📝 Add Assignment';
        document.getElementById('assign-date').value = formatDate(new Date());
        deleteBtn?.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

function closeAssignmentModal(){
    document.getElementById('assignment-modal')?.classList.add('hidden');
}

document.getElementById('assignment-form')?.addEventListener('submit', async(e)=>{
    e.preventDefault();
    const data = {
        title:     document.getElementById('assign-title').value.trim(),
        date:      document.getElementById('assign-date').value,
        maxScore:  parseInt(document.getElementById('assign-max').value)||100,
        classId:   document.getElementById('assign-class').value||null,
        category:  document.getElementById('assign-category').value||'quiz',
        standards: (document.getElementById('assign-standards')?.value||'').trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    showLoading();
    try{
        const aid = document.getElementById('assign-id').value;
        // v6.0.2: scores are only initialised on CREATE. Sending scores:{}
        // on edit wiped every student's grade for the assignment.
        if(!aid) data.scores = {};
        if(aid){
            await getYearPath().collection('assignments').doc(aid).update(data);
            const i = assignments.findIndex(a=>a.id===aid);
            if(i>=0) assignments[i]={...assignments[i],...data};
        } else {
            const ref = await getYearPath().collection('assignments').add(data);
            assignments.unshift({id:ref.id,...data,scores:{}});
        }
        closeAssignmentModal();
        renderGradebook();
        showToast('Assignment saved!');
    }catch(err){ showToast('Error: '+err.message); }
    hideLoading();
});

async function deleteAssignment(id){
    const aid = id||document.getElementById('assign-id').value;
    if(!aid||!await planyConfirm('Delete this assignment and all scores?')) return;
    showLoading();
    try{
        await getYearPath().collection('assignments').doc(aid).delete();
        assignments = assignments.filter(a=>a.id!==aid);
        closeAssignmentModal();
        renderGradebook();
        showToast('Assignment deleted.');
    }catch(err){ showToast('Error: '+err.message); }
    hideLoading();
}

// ── IEP / Differentiation ─────────────────────────────────────────────────
function renderIepTable(){
    const wrap = document.getElementById('iep-table-wrap');
    if(!wrap) return;
    const flagged = students.filter(s=>(s.tags||[]).length>0);
    if(!flagged.length){
        wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;">No students with IEP/504/ELL/GT flags. Edit a student card to add flags.</p>';
        return;
    }
    let html = '<table class="iep-table"><thead><tr><th>Student</th><th>Flags</th><th>Reading Level</th><th>Group</th><th>Accommodations</th></tr></thead><tbody>';
    flagged.forEach(s=>{
        html += `<tr>
            <td style="font-weight:600;cursor:pointer;" onclick="openStudentModal('${s.id}')">${s.firstName} ${s.lastName||''}</td>
            <td><div class="student-tags" style="justify-content:flex-start;">${(s.tags||[]).map(t=>`<span class="student-tag tag-${t}">${t}</span>`).join('')}</div></td>
            <td style="color:var(--text-secondary)">${s.readingLevel||'—'}</td>
            <td style="color:var(--text-secondary)">${s.group||'—'}</td>
            <td class="iep-accommodations">${s.accommodations||'<span style="opacity:0.4">None recorded</span>'}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
}

// ── AI Differentiation Generator ──────────────────────────────────────────
function openDiffGenerator(){
    const modal = document.getElementById('diff-modal');
    if(!modal) return;
    document.getElementById('diff-lesson-input').value = '';
    document.getElementById('diff-status').innerHTML = '';
    const result = document.getElementById('diff-result');
    result.style.display = 'none'; result.textContent = '';
    const checksEl = document.getElementById('diff-student-checks');
    if(checksEl){
        const flagged = students.filter(s=>(s.tags||[]).length>0||s.accommodations);
        checksEl.innerHTML = flagged.length ? flagged.map(s=>
            `<label style="display:flex;align-items:center;gap:5px;font-size:0.75rem;cursor:pointer;background:rgba(0,0,0,0.15);padding:3px 8px;border-radius:4px;">
                <input type="checkbox" class="diff-student-check" value="${s.id}" checked>
                ${s.firstName} ${s.lastName||''} <span style="opacity:0.6;font-size:0.65rem;">${(s.tags||[]).join(',')}</span>
            </label>`
        ).join('') : '<p style="font-size:0.75rem;color:var(--text-muted);">No students with flags — add IEP/ELL/etc. tags to student cards first.</p>';
    }
    modal.classList.remove('hidden');
    refreshDiffHistory();
}

async function refreshDiffHistory() {
    const resultEl = document.getElementById('diff-result');
    if (!resultEl) return;
    let box = document.getElementById('diff-history');
    if (!box) {
        box = document.createElement('div');
        box.id = 'diff-history';
        box.className = 'ai-history';
        resultEl.insertAdjacentElement('afterend', box);
    }
    const items = await listAiOutputs(['differentiation']);
    renderAiHistory(box, items, 'Saved differentiation plans', (item) => {
        const input = document.getElementById('diff-lesson-input');
        if (input) input.value = item.lesson || item.label || '';
        resultEl.textContent = item.text || '';
        resultEl.style.display = 'block';
        document.getElementById('diff-status').innerHTML = `<span class="ai-saved-note">💾 Saved ${escHtml(aiSavedStamp(item.savedAt))}</span>`;
    }, refreshDiffHistory);
}

async function runDiffGenerator(){
    if(!hasEffectiveAiKey()){ showToast('Add your API key first.'); return; }
    const lesson = document.getElementById('diff-lesson-input')?.value.trim();
    if(!lesson){ showToast('Enter a lesson or topic.'); return; }
    const selectedIds = Array.from(document.querySelectorAll('.diff-student-check:checked')).map(cb=>cb.value);
    if(!selectedIds.length){ showToast('Select at least one student.'); return; }

    const selectedStudents = selectedIds.map(id=>students.find(s=>s.id===id)).filter(Boolean);
    const statusEl = document.getElementById('diff-status');
    const resultEl = document.getElementById('diff-result');
    const btn      = document.getElementById('diff-run-btn');
    statusEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.78rem;">🤖 Generating differentiated activities…</span>';
    resultEl.style.display = 'none';
    if(btn) btn.disabled = true;

    const studentContext = selectedStudents.map(s=>
        `- ${s.firstName} ${s.lastName||''}: ${(s.tags||[]).join(', ')} | Reading level: ${s.readingLevel||'grade level'} | Accommodations: ${s.accommodations||'standard'}`
    ).join('\n');

    const prompt = `You are a Grade ${aiSettings.grade||'1'} teacher creating differentiated activities for the lesson: "${lesson}"\n\nStudents needing differentiation:\n${studentContext}\n\nCreate a brief differentiated version of this lesson for EACH student listed. For each student:\n1. State their name and needs\n2. Describe a modified activity (2-3 sentences)\n3. Note any specific accommodation to apply\n\nKeep each modification concise and practical. Format clearly with each student's name as a header.`;

    try{
        const text = await callAIText({ prompt, tier: 'fast', maxTokens: 1500 });

        statusEl.innerHTML = '';
        resultEl.style.display = 'block';
        resultEl.textContent = text;
        if (await saveAiOutput(null, { type: 'differentiation', label: lesson.slice(0, 90), text, lesson })) {
            statusEl.innerHTML = '<span class="ai-saved-note">💾 Saved to your list below.</span>';
            refreshDiffHistory();
        }
    }catch(e){
        statusEl.innerHTML = `<span style="color:var(--neon-pink);font-size:0.78rem;">Error: ${e.message}</span>`;
    }
    if(btn) btn.disabled = false;
}

// ── Google Classroom Integration ──────────────────────────────────────────


// ============================================================
// MICROSOFT TEAMS INTEGRATION (PKCE OAuth — no client secret)
// ============================================================

let msAccessToken   = null;
let msUserId        = null;
let msUserEmail     = null;
const MS_REDIRECT   = 'https://plany.work/';
const MS_GRAPH      = 'https://graph.microsoft.com/v1.0';
const MS_SCOPES     = 'User.Read EduRoster.ReadBasic.All TeamMember.Read.All offline_access';

// PKCE helpers
async function generatePkce() {
    const verifier = Array.from(crypto.getRandomValues(new Uint8Array(40)))
        .map(b => ('0'+b.toString(16)).slice(-2)).join('');
    const data    = new TextEncoder().encode(verifier);
    const digest  = await crypto.subtle.digest('SHA-256', data);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    return { verifier, challenge };
}

function getMsClientId() {
    return (settings.msClientId || '').trim()
        || (document.getElementById('ms-client-id-settings')?.value || '').trim()
        || localStorage.getItem('ms_client_id') || '';
}

function saveMsClientId() {
    const val = (document.getElementById('ms-client-id-settings')?.value || '').trim();
    if (!val) { showToast('Enter an Azure Application (Client) ID.'); return; }
    localStorage.setItem('ms_client_id', val);
    settings.msClientId = val;
    if (currentUser) db.collection('users').doc(currentUser.uid).collection('settings').doc('app')
        .set({ msClientId: val }, { merge: true }).catch(()=>{});
    showToast('🟦 Microsoft Client ID saved!');
}

async function loginWithMicrosoft(state) {
    const clientId = getMsClientId();
    if (!clientId) {
        const id = prompt('Enter your Azure Application (Client) ID:\n\n(Register at portal.azure.com → App registrations → New registration.\nSet platform = Single-page application.\nAdd redirect URI: https://plany.work\nAdd scopes: EduRoster.ReadBasic.All, TeamMember.Read.All)');
        if (!id) return;
        localStorage.setItem('ms_client_id', id.trim());
        settings.msClientId = id.trim();
    }
    const resolvedId = getMsClientId();
    const resolvedState = state || 'login';
    const { verifier, challenge } = await generatePkce();
    sessionStorage.setItem('ms_cv', verifier);
    sessionStorage.setItem('ms_state', resolvedState);

    const params = new URLSearchParams({
        client_id:             resolvedId,
        response_type:         'code',
        redirect_uri:          MS_REDIRECT,
        scope:                 MS_SCOPES,
        response_mode:         'query',
        code_challenge:        challenge,
        code_challenge_method: 'S256',
        state:                 'ms_' + resolvedState,
    });
    window.location.href = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' + params.toString();
}

// Called from initOAuthCallback when a Microsoft PKCE callback is detected
async function handleMsCallback(code, state) {
    const verifier  = sessionStorage.getItem('ms_cv');
    const expectedState = sessionStorage.getItem('ms_state');
    const clientId  = getMsClientId();
    sessionStorage.removeItem('ms_cv');
    sessionStorage.removeItem('ms_state');
    if (!verifier || !clientId) { showToast('Microsoft auth session expired. Please try again.'); return; }
    // Reject a callback this browser didn't start (login-CSRF guard).
    if (!expectedState || state !== 'ms_' + expectedState) { showToast('Microsoft sign-in was interrupted. Please try again.'); return; }
    // Signing IN to Plany with Microsoft is disabled (v6.0.2): the old flow
    // derived the Firebase password from the Microsoft user id, which was
    // readable by other users. Only the Teams import (for an already
    // signed-in teacher) is allowed through until it is rebuilt on
    // Firebase's own OAuthProvider('microsoft.com').
    if (state !== 'ms_import' || !firebase.auth().currentUser) {
        const errEl = document.getElementById('auth-error');
        const msg = 'Sign in with Microsoft is turned off. Please sign in with your email and password.';
        if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); } else showToast(msg);
        return;
    }

    showLoading();
    try {
        // Exchange code for token (PKCE — no client_secret needed)
        const tokenResp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id:     clientId,
                code,
                redirect_uri:  MS_REDIRECT,
                grant_type:    'authorization_code',
                code_verifier: verifier,
                scope:         MS_SCOPES,
            }).toString()
        });
        if (!tokenResp.ok) {
            const err = await tokenResp.json();
            throw new Error(err.error_description || 'Token exchange failed');
        }
        const tokenData = await tokenResp.json();
        msAccessToken = tokenData.access_token;
        localStorage.setItem('ms_token', msAccessToken);
        if (tokenData.refresh_token) localStorage.setItem('ms_refresh', tokenData.refresh_token);

        // Get user profile
        const meResp = await msGraph('/me');
        msUserEmail = meResp.mail || meResp.userPrincipalName || '';
        msUserId    = meResp.id || '';
        localStorage.setItem('ms_user_id',    msUserId);
        localStorage.setItem('ms_user_email', msUserEmail);
        updateMsConnectionStatus();

        if (state === 'ms_import') {
            hideLoading();
            openTeamsImport();
            return;
        }

        // (Firebase sign-in via Microsoft removed in v6.0.2 -- see guard above.)
        hideLoading();
    } catch(e) {
        hideLoading();
        console.error('MS handleCallback:', e);
        const errEl = document.getElementById('auth-error');
        if (errEl) { errEl.textContent = 'Microsoft sign-in error: ' + e.message; errEl.classList.remove('hidden'); }
        else showToast('Microsoft error: ' + e.message);
    }
}

async function msGraph(path) {
    const t = msAccessToken || localStorage.getItem('ms_token');
    if (!t) throw new Error('Not connected to Microsoft. Please sign in first.');
    const resp = await fetch(MS_GRAPH + path, {
        headers: { 'Authorization': 'Bearer ' + t, 'Accept': 'application/json' }
    });
    if (resp.status === 401) {
        localStorage.removeItem('ms_token');
        msAccessToken = null;
        throw new Error('Microsoft session expired. Please reconnect.');
    }
    if (!resp.ok) throw new Error('Microsoft Graph API ' + resp.status + ' — ' + path);
    return resp.json();
}

async function openTeamsImport() {
    const modal = document.getElementById('teams-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    if (!msAccessToken && !localStorage.getItem('ms_token')) {
        document.getElementById('teams-step-connect').classList.remove('hidden');
        document.getElementById('teams-step-classes').classList.add('hidden');
        return;
    }
    msAccessToken = msAccessToken || localStorage.getItem('ms_token');

    document.getElementById('teams-step-connect').classList.add('hidden');
    document.getElementById('teams-step-classes').classList.remove('hidden');
    const listEl = document.getElementById('teams-classes-list');
    listEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);padding:8px;">Loading classes…</div>';

    try {
        // Try education API first, fall back to joined Teams
        let classes_data = [];
        try {
            const eduResp = await msGraph('/education/classes?$top=30');
            classes_data = eduResp.value || [];
        } catch(e) {
            // Education API not available — fall back to Teams
            const teamsResp = await msGraph('/me/joinedTeams?$top=30');
            classes_data = (teamsResp.value || []).map(t => ({
                id: t.id, displayName: t.displayName, _isTeam: true
            }));
        }

        if (!classes_data.length) {
            listEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);padding:8px;">No classes found for your Microsoft account.</div>';
            return;
        }
        listEl.innerHTML = classes_data.map(c => {
            const name = c.displayName || c.courseNumber || 'Unnamed Class';
            return `<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.12);border-radius:var(--radius-sm);padding:8px 12px;">
                <div style="font-size:0.82rem;font-weight:700;color:var(--text-primary);">${name}</div>
                <div style="display:flex;gap:4px;">
                    <button class="btn btn-sm btn-primary" onclick="teamsImportRoster('${c.id}','${name.replace(/'/g,"\\'")}',${!!c._isTeam})">Import Roster</button>
                    <button class="btn btn-sm btn-ghost" onclick="teamsImportAssignments('${c.id}','${name.replace(/'/g,"\\'")}',${!!c._isTeam})">Assignments</button>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        listEl.innerHTML = `<div style="font-size:0.78rem;color:var(--neon-pink);padding:8px;">Error: ${e.message}</div>`;
        if (e.message.includes('expired')) {
            document.getElementById('teams-step-connect').classList.remove('hidden');
            document.getElementById('teams-step-classes').classList.add('hidden');
        }
    }
}

async function teamsImportRoster(classId, className, isTeam) {
    const statusEl = document.getElementById('teams-import-status');
    if (statusEl) statusEl.textContent = 'Fetching students…';
    try {
        let memberList = [];
        if (isTeam) {
            const resp = await msGraph('/teams/' + classId + '/members');
            memberList = (resp.value || []).filter(m => m.roles?.length === 0 || !m.roles); // students have no roles
        } else {
            const resp = await msGraph('/education/classes/' + classId + '/students');
            memberList = resp.value || [];
        }
        if (!memberList.length) { if(statusEl) statusEl.textContent = 'No students found.'; return; }

        showLoading();
        const batch = db.batch();
        let added = 0, skipped = 0;
        memberList.forEach(m => {
            const dn = m.displayName || '';
            const parts = dn.trim().split(' ');
            const firstName = m.givenName  || parts[0]  || 'Student';
            const lastName  = m.surname    || parts.slice(1).join(' ') || '';
            if (students.some(s => s.firstName===firstName && s.lastName===lastName)) { skipped++; return; }
            const data = { firstName, lastName, msId: m.id||'', grade:'', nickname:'', group:'',
                readingLevel:'', classId:null, accommodations:'', notes:'', tags:[],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            const ref = getYearPath().collection('students').doc();
            batch.set(ref, data);
            students.push({ id: ref.id, ...data });
            added++;
        });
        await batch.commit();
        students.sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||''));
        hideLoading();
        const msg = `✅ Imported ${added} student${added!==1?'s':''} from "${className}"${skipped?' ('+skipped+' skipped)':''}`;
        if(statusEl) statusEl.textContent = msg;
        showToast(msg);
        renderRoster(); renderGroupFilterChips();
    } catch(e) { hideLoading(); if(statusEl) statusEl.textContent='Error: '+e.message; showToast('Error: '+e.message); }
}

async function teamsImportAssignments(classId, className, isTeam) {
    const statusEl = document.getElementById('teams-import-status');
    if(statusEl) statusEl.textContent = 'Fetching assignments…';
    try {
        const path = isTeam
            ? '/teams/' + classId + '/channels'
            : '/education/classes/' + classId + '/assignments?$top=30&$orderby=dueDateTime+desc';
        if (isTeam) { if(statusEl) statusEl.textContent = 'Assignment sync not available for this team type. Use Education classes.'; return; }
        const resp = await msGraph(path);
        const aList = resp.value || [];
        if (!aList.length) { if(statusEl) statusEl.textContent = 'No assignments found.'; return; }
        showLoading();
        const batch = db.batch(); let added=0;
        aList.forEach(a => {
            if (assignments.some(ex => ex.msId===a.id)) return;
            const due = a.dueDateTime ? formatDate(new Date(a.dueDateTime)) : formatDate(new Date()); // Teams sends UTC; show the local date
            const data = { title: a.displayName||'Untitled', date: due,
                maxScore: a.grading?.maxPoints || 100, category:'homework',
                classId:null, msId:a.id, scores:{},
                updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            const ref = getYearPath().collection('assignments').doc();
            batch.set(ref,data); assignments.unshift({id:ref.id,...data}); added++;
        });
        await batch.commit();
        hideLoading();
        const msg = `✅ Imported ${added} assignment${added!==1?'s':''} from "${className}"`;
        if(statusEl) statusEl.textContent=msg; showToast(msg);
        renderGradebook();
    } catch(e) { hideLoading(); if(statusEl) statusEl.textContent='Error: '+e.message; }
}

function updateMsConnectionStatus() {
    const el = document.getElementById('ms-connection-status');
    if (!el) return;
    const email = msUserEmail || localStorage.getItem('ms_user_email');
    if ((msAccessToken || localStorage.getItem('ms_token')) && email) {
        el.innerHTML = `<span style="color:var(--color-text-success);">✅ Connected as ${email}</span>
            <button class="btn btn-ghost btn-sm" style="font-size:0.7rem;margin-left:8px;" onclick="disconnectMicrosoft()">Disconnect</button>`;
    } else { el.textContent=''; }
}

function disconnectMicrosoft() {
    msAccessToken=msUserId=msUserEmail=null;
    ['ms_token','ms_refresh','ms_user_id','ms_user_email'].forEach(k=>localStorage.removeItem(k));
    updateMsConnectionStatus();
    showToast('🟦 Microsoft disconnected.');
}


// ============================================================
// MOODLE INTEGRATION
// ============================================================

let moodleUrl   = '';
let moodleToken = '';

function saveMoodleSettings() {
    const url   = (document.getElementById('moodle-url-settings')?.value||'').trim().replace(/\/$/,'');
    const token = (document.getElementById('moodle-token-settings')?.value||'').trim();
    if (!url || !token) { showToast('Enter both your Moodle URL and API token.'); return; }
    moodleUrl   = url;
    moodleToken = token;
    localStorage.setItem('moodle_url',   url);
    localStorage.setItem('moodle_token', token);
    settings.moodleUrl   = url;
    settings.moodleToken = token;
    if (currentUser) db.collection('users').doc(currentUser.uid).collection('settings').doc('app')
        .set({ moodleUrl: url, moodleToken: token }, { merge: true }).catch(()=>{});
    showToast('🟠 Moodle settings saved!');
}

async function moodleFetch(fn, params) {
    const url   = moodleUrl   || localStorage.getItem('moodle_url')   || '';
    const token = moodleToken || localStorage.getItem('moodle_token') || '';
    if (!url || !token) throw new Error('Moodle URL and token not configured. Set them in Settings → Moodle.');
    const p = new URLSearchParams({ wstoken: token, wsfunction: fn, moodlewsrestformat: 'json', ...params });
    const resp = await fetch(url + '/webservice/rest/server.php?' + p.toString());
    if (!resp.ok) throw new Error('Moodle API ' + resp.status);
    const data = await resp.json();
    if (data.exception) throw new Error(data.message || data.exception);
    return data;
}

function openMoodleImport() {
    const modal = document.getElementById('moodle-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    // Pre-fill saved values
    const savedUrl   = moodleUrl   || localStorage.getItem('moodle_url')   || '';
    const savedToken = moodleToken || localStorage.getItem('moodle_token') || '';
    const uEl = document.getElementById('moodle-url-modal');
    const tEl = document.getElementById('moodle-token-modal');
    if (uEl) uEl.value = savedUrl;
    if (tEl) tEl.value = savedToken;
    document.getElementById('moodle-step-config').classList.remove('hidden');
    document.getElementById('moodle-step-courses').classList.add('hidden');
}

async function moodleConnect() {
    const url   = (document.getElementById('moodle-url-modal')?.value||'').trim().replace(/\/$/,'');
    const token = (document.getElementById('moodle-token-modal')?.value||'').trim();
    if (!url || !token) { showToast('Enter Moodle URL and token.'); return; }
    moodleUrl = url; moodleToken = token;
    localStorage.setItem('moodle_url', url); localStorage.setItem('moodle_token', token);

    const listEl = document.getElementById('moodle-courses-list');
    listEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);padding:8px;">Connecting…</div>';
    document.getElementById('moodle-step-config').classList.add('hidden');
    document.getElementById('moodle-step-courses').classList.remove('hidden');

    try {
        const courses = await moodleFetch('core_enrol_get_my_courses');
        if (!courses.length) { listEl.innerHTML='<div style="font-size:0.78rem;color:var(--text-muted);padding:8px;">No courses found for your token.</div>'; return; }
        listEl.innerHTML = courses.map(c =>
            `<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.12);border-radius:var(--radius-sm);padding:8px 12px;">
                <div>
                    <div style="font-size:0.82rem;font-weight:700;color:var(--text-primary);">${c.fullname||c.shortname}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${c.shortname||''}</div>
                </div>
                <button class="btn btn-sm btn-primary" onclick="moodleImportCourse(${c.id},'${(c.fullname||c.shortname).replace(/'/g,"\\'")}')">Import</button>
            </div>`
        ).join('');
    } catch(e) {
        listEl.innerHTML=`<div style="font-size:0.78rem;color:var(--neon-pink);padding:8px;">Error: ${e.message}</div>`;
        document.getElementById('moodle-step-config').classList.remove('hidden');
        document.getElementById('moodle-step-courses').classList.add('hidden');
    }
}

async function moodleImportCourse(courseId, courseName) {
    const statusEl = document.getElementById('moodle-import-status');
    if(statusEl) statusEl.textContent = 'Fetching students…';
    try {
        const enrolled = await moodleFetch('core_enrol_get_enrolled_users', { courseid: courseId });
        const learners = enrolled.filter(u => u.roles?.some(r => r.shortname==='student') || !u.roles?.length);
        if (!learners.length) { if(statusEl) statusEl.textContent='No enrolled students found.'; return; }
        showLoading();
        const batch = db.batch(); let added=0, skipped=0;
        learners.forEach(u => {
            const fn = u.firstname || 'Student';
            const ln = u.lastname  || '';
            if (students.some(s=>s.firstName===fn&&s.lastName===ln)) { skipped++; return; }
            const data = { firstName:fn, lastName:ln, moodleId:String(u.id), grade:'',
                nickname:'', group:'', readingLevel:'', classId:null,
                accommodations:'', notes:'', tags:[],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            const ref = getYearPath().collection('students').doc();
            batch.set(ref,data); students.push({id:ref.id,...data}); added++;
        });
        await batch.commit();
        students.sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||''));
        hideLoading();
        const msg=`✅ Imported ${added} student${added!==1?'s':''} from "${courseName}"${skipped?' ('+skipped+' skipped)':''}`;
        if(statusEl) statusEl.textContent=msg; showToast(msg);
        renderRoster(); renderGroupFilterChips();
    } catch(e) { hideLoading(); if(statusEl) statusEl.textContent='Error: '+e.message; showToast('Error: '+e.message); }
}


// ============================================================
// SIS CSV / EXCEL IMPORT  (universal — works with any SIS)
// ============================================================

let _sisParsedRows  = [];
let _sisColumnMap   = {};

function openSisImport() {
    const modal = document.getElementById('sis-modal');
    if (!modal) return;
    document.getElementById('sis-file-input').value = '';
    const pasteEl = document.getElementById('sis-paste');
    if (pasteEl) pasteEl.value = '';
    document.getElementById('sis-preview').classList.add('hidden');
    document.getElementById('sis-import-btn').classList.add('hidden');
    document.getElementById('sis-status').textContent = '';
    _sisParsedRows = []; _sisColumnMap = {};
    modal.classList.remove('hidden');
}

async function previewSisFile() {
    await Promise.all([ensureLib('xlsx')]);
    const file = document.getElementById('sis-file-input')?.files[0];
    if (!file) return;
    const statusEl = document.getElementById('sis-status');
    statusEl.textContent = '⏳ Reading file…';

    try {
        let rows = [];
        let headerRow = null;
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'csv' || ext === 'txt' || ext === 'tsv' || ext === 'tab' || ext === 'text') {
            // Tab-delimited .TXT is what most SIS "student list" exports actually
            // produce, so route every plain-text extension through the sniffing
            // parser rather than assuming commas.
            const parsed = parseRosterText(await file.text());
            headerRow = parsed.headers;
            rows = [parsed.headers].concat(parsed.rows);
        } else {
            // XLS/XLSX — use SheetJS
            const buf = await file.arrayBuffer();
            if (!window.XLSX) {
                await new Promise((res,rej) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                    s.onload=res; s.onerror=rej;
                    document.head.appendChild(s);
                });
            }
            const wb   = XLSX.read(buf, { type:'array' });
            const ws   = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(ws, { header:1 });
            rows = data.map(r => r.map(v => String(v||'')));
        }

        if (rows.length < 2) { statusEl.textContent = 'File appears empty or unreadable.'; return; }

        await showSisPreview(headerRow || rows[0], rows.slice(1), statusEl);
    } catch(e) {
        statusEl.textContent = 'Error reading file: ' + e.message;
        console.error(e);
    }
}

// Paste path — same preview and import as the file path.
async function previewSisPaste() {
    const statusEl = document.getElementById('sis-status');
    const text = document.getElementById('sis-paste')?.value || '';
    if (!text.trim()) { statusEl.textContent = 'Paste your roster first.'; return; }
    try {
        const parsed = parseRosterText(text);
        if (!parsed.rows.length) { statusEl.textContent = 'No student rows found in that text.'; return; }
        await showSisPreview(parsed.headers, parsed.rows, statusEl, parsed.source);
    } catch(e) {
        statusEl.textContent = 'Could not read that text: ' + e.message;
        console.error(e);
    }
}

async function showSisPreview(headers, rows, statusEl, source) {
    _sisParsedRows = rows.filter(r => r.some(v => String(v || '').trim()));
    if (source === 'names') {
        _sisColumnMap = { firstName: 0, lastName: 1 };
    } else {
        const heuristic = detectSisColumnsHeuristic(headers);
        if (heuristic.firstName === undefined && heuristic.fullName === undefined && hasEffectiveAiKey()) {
            statusEl.textContent = '🤖 Detecting columns with AI…';
        }
        _sisColumnMap = await aiDetectSisColumns(headers);
        // Nothing recognizable (a headerless export): guess the first two
        // columns so the preview shows something the teacher can correct with
        // the dropdowns, instead of an empty table.
        const gotName = ['firstName','lastName','fullName'].some(k => _sisColumnMap[k] !== undefined && _sisColumnMap[k] !== null);
        if (!gotName && headers.length >= 2) { _sisColumnMap.firstName = 0; _sisColumnMap.lastName = 1; }
        else if (!gotName) { _sisColumnMap.fullName = 0; }
    }
    renderSisColumnMap(headers);
    document.getElementById('sis-row-count').textContent =
        `${_sisParsedRows.length} student row${_sisParsedRows.length !== 1 ? 's' : ''} detected`;
    document.getElementById('sis-preview').classList.remove('hidden');
    document.getElementById('sis-import-btn').classList.remove('hidden');
    statusEl.textContent = '';
}

// ============================================================
// PLAIN-TEXT ROSTER PARSING
// ============================================================
// SIS exports land as tab-delimited .TXT at least as often as .csv (Synergy
// "Student List" exports are tab-delimited with a UTF-8 BOM and CRLF endings),
// and teachers just as often have a plain list of names in an email. Both are
// handled here: the delimiter is detected from the data, a header row is
// detected rather than assumed, and a single-column list falls back to name
// parsing ("Last, First M." or "First Last").

// Words that mark a row as headers rather than data
const SIS_HEADER_WORDS = ['name','first','last','student','id','grade','gender','birth',
                          'email','nickname','perm','sis','number','level','track','language','dob'];

// A one-column paste can still have a header ("Student Name") on line 1.
function isHeaderishLine(line) {
    const c = String(line || '').trim().toLowerCase();
    if (!c || c.length > 40 || /[0-9]/.test(c)) return false;
    return SIS_HEADER_WORDS.some(w => c.includes(w)) && !c.includes(',');
}

function looksLikeHeaderRow(row) {
    const cells = row.map(c => String(c || '').trim().toLowerCase()).filter(Boolean);
    if (!cells.length) return false;
    const hits = cells.filter(c => SIS_HEADER_WORDS.some(w => c.includes(w))).length;
    const numeric = cells.filter(c => /^[0-9\/\-]+$/.test(c)).length;
    return hits >= Math.max(2, Math.ceil(cells.length * 0.3)) && numeric === 0;
}

// "Bouma, Sharon H." -> {first:'Sharon', last:'Bouma'}   "Sharon Bouma" -> same
function splitPersonName(raw) {
    let v = String(raw || '').replace(/\s+/g, ' ').trim();
    // strip list markers teachers paste from a numbered or bulleted list
    v = v.replace(/^\s*(?:\d+\s*[.)\-:]|[-*\u2022\u00B7])\s+/, '').trim();
    if (!v) return { first: '', last: '' };
    if (v.includes(',')) {
        const [lastPart, firstPart = ''] = v.split(',');
        const firstBits = firstPart.trim().split(' ').filter(Boolean);
        // drop a trailing middle initial ("Sharon H.")
        if (firstBits.length > 1 && /^[A-Za-z]\.?$/.test(firstBits[firstBits.length - 1])) firstBits.pop();
        return { first: firstBits.join(' '), last: lastPart.trim() };
    }
    const bits = v.split(' ').filter(Boolean);
    if (bits.length === 1) return { first: bits[0], last: '' };
    const first = bits.shift();
    if (bits.length > 1 && /^[A-Za-z]\.?$/.test(bits[0])) bits.shift();  // middle initial
    return { first, last: bits.join(' ') };
}

// Text (tab / comma / semicolon / pipe delimited, or a bare list of names)
// -> { headers:[...], rows:[[...]], source:'delimited'|'names' }
function parseRosterText(text) {
    const clean = String(text || '')
        .replace(/^\uFEFF/, '')          // strip BOM
        .replace(/\r\n?/g, '\n');        // normalize CRLF / CR
    const lines = clean.split('\n').filter(l => l.trim());
    if (!lines.length) return { headers: [], rows: [], source: 'delimited' };

    // Which delimiter gives the most consistent multi-column split?
    const score = (rows) => {
        const widths = rows.map(r => r.length);
        const max = Math.max(...widths);
        if (max < 2) return -1;
        const consistent = widths.filter(w => w === max).length / widths.length;
        return max * consistent;
    };
    const sample = lines.slice(0, 25);
    let best = null;
    // tab / semicolon / pipe
    [['\t', l => l.split('\t')], [';', l => l.split(';')], ['|', l => l.split('|')]].forEach(([, split]) => {
        const rows = sample.map(split);
        const sc = score(rows);
        if (!best || sc > best.sc) best = { sc, split };
    });
    // comma goes through the quote-aware CSV parser
    const csvRows = parseCsvToRows(clean).filter(r => r.some(c => String(c).trim()));
    const csvScore = score(csvRows.slice(0, 25));
    if (csvScore > (best ? best.sc : -1)) best = { sc: csvScore, csv: true };

    if (!best || best.sc < 2) {
        // Single column — treat every line as a person's name
        const body = isHeaderishLine(lines[0]) ? lines.slice(1) : lines;
        const rows = body.map(l => {
            const n = splitPersonName(l);
            return [n.first, n.last];
        }).filter(r => r[0] || r[1]);
        return { headers: ['First Name', 'Last Name'], rows, source: 'names' };
    }

    let rows = best.csv ? csvRows : lines.map(best.split);
    rows = rows.map(r => r.map(c => String(c == null ? '' : c).trim()))
               .filter(r => r.some(c => c));
    const width = Math.max(...rows.map(r => r.length));
    rows = rows.map(r => (r.length < width ? r.concat(Array(width - r.length).fill('')) : r));

    if (looksLikeHeaderRow(rows[0])) {
        return { headers: rows[0], rows: rows.slice(1), source: 'delimited' };
    }

    // Headerless. A pasted list like "Bouma, Sharon H." splits on the comma into
    // two anonymous columns, which is the wrong reading - it is one name. If no
    // cell contains a digit and the rows are narrow, read the ORIGINAL lines as
    // names (the original text still has the comma that tells us the order).
    const noDigits = rows.every(r => r.every(c => !/[0-9]/.test(c)));
    if (width <= 3 && noDigits) {
        const body = isHeaderishLine(lines[0]) ? lines.slice(1) : lines;
        const nameRows = body.map(l => {
            const n = splitPersonName(l);
            return [n.first, n.last];
        }).filter(r => r[0] || r[1]);
        if (nameRows.length) return { headers: ['First Name', 'Last Name'], rows: nameRows, source: 'names' };
    }

    return { headers: rows[0].map((_, i) => 'Column ' + (i + 1)), rows, source: 'delimited', headerless: true };
}

function parseCsvToRows(text) {
    const rows = []; let row = []; let inQuote = false; let cell = '';
    for (let i=0; i<text.length; i++) {
        const ch = text[i];
        if (ch==='"') { inQuote=!inQuote; }
        else if (ch===',' && !inQuote) { row.push(cell); cell=''; }
        else if ((ch==='\n'||ch==='\r') && !inQuote) {
            if (cell || row.length) { row.push(cell); rows.push(row); }
            row=[]; cell='';
            if (ch==='\r' && text[i+1]==='\n') i++;
        } else { cell+=ch; }
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

// Header matching that runs with no AI key and no network. It handles the
// column names real SIS exports use (Synergy: "Perm ID", "Student Name",
// "First Name", "Last Name"; PowerSchool: "Student_Number"; etc.) and can map a
// single combined name column, which executeSisImport() splits on import.
function detectSisColumnsHeuristic(headers) {
    const map = {};
    const norm = h => String(h || '').toLowerCase().replace(/[^a-z]/g, '');
    headers.forEach((h, i) => {
        const l = norm(h);
        if (!l) return;
        if (map.firstName === undefined && (l === 'firstname' || l === 'first' || l === 'fname' || l === 'givenname' || l === 'given')) map.firstName = i;
        if (map.lastName  === undefined && (l === 'lastname' || l === 'last' || l === 'lname' || l === 'surname' || l === 'familyname')) map.lastName = i;
        if (map.fullName  === undefined && (l === 'studentname' || l === 'name' || l === 'fullname' || l === 'student')) map.fullName = i;
        if (map.nickname  === undefined && (l.includes('nickname') || l.includes('preferred') || l.includes('goesby'))) map.nickname = i;
        if (map.grade     === undefined && (l === 'grade' || l === 'gradelevel' || l === 'gradelvl' || l === 'yearlevel')) map.grade = i;
        if (map.studentId === undefined && (l === 'permid' || l === 'studentid' || l === 'sisid' || l === 'studentnumber'
                                            || l === 'localid' || l === 'stateid' || l === 'id' || l === 'idnumber')) map.studentId = i;
    });
    // Looser second pass only for anything still unmapped
    headers.forEach((h, i) => {
        const l = norm(h);
        if (map.firstName === undefined && l.includes('first')) map.firstName = i;
        if (map.lastName  === undefined && l.includes('last') && !l.includes('lastlogin')) map.lastName = i;
        if (map.fullName  === undefined && l.includes('name') && i !== map.firstName && i !== map.lastName) map.fullName = i;
        if (map.studentId === undefined && (l.includes('id') || l.includes('number')) && !l.includes('grade')) map.studentId = i;
        if (map.grade     === undefined && l.includes('grade')) map.grade = i;
    });
    return map;
}

async function aiDetectSisColumns(headers) {
    const heuristic = detectSisColumnsHeuristic(headers);
    // If the heuristic already found a usable name mapping, don't spend an API
    // call (and don't make the teacher wait on one).
    const solved = heuristic.firstName !== undefined || heuristic.fullName !== undefined;
    if (solved || !hasEffectiveAiKey()) return heuristic;

    const prompt = 'Column headers from a school SIS export: ' + JSON.stringify(headers) + '\n\n'
        + 'Map these headers to student fields. Return ONLY compact JSON (no markdown):\n'
        + '{ "firstName": <index or null>, "lastName": <index or null>, "studentId": <index or null>, "grade": <index or null>, "nickname": <index or null>, "email": <index or null> }\n'
        + 'Use null if no matching column. Use the 0-based index number.';
    try {
        const raw  = (await callAIText({ prompt, tier: 'fast', maxTokens: 200 })).replace(/```json|```/g,'').trim();
        const ai = JSON.parse(raw);
        // never let a null from the model wipe out a good heuristic hit
        Object.keys(ai).forEach(k => { if (ai[k] === null || ai[k] === undefined) delete ai[k]; });
        return { ...heuristic, ...ai };
    } catch(e) { console.warn('AI column detection failed, using heuristics:', e); return heuristic; }
}

function renderSisColumnMap(headers) {
    const el = document.getElementById('sis-column-map');
    const fields = [
        ['firstName','First Name'],['lastName','Last Name'],
        ['fullName','Full Name'],
        ['studentId','Student ID'],['grade','Grade'],['nickname','Nickname']
    ];
    el.innerHTML = fields.map(([field, label]) => {
        const detected = _sisColumnMap[field];
        const opts = '<option value="">— skip —</option>' +
            headers.map((h,i) => `<option value="${i}" ${detected===i?'selected':''}>${h}</option>`).join('');
        return `<div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:0.72rem;color:var(--text-secondary);min-width:90px;">${label}</label>
            <select class="form-control sis-col-select" data-field="${field}" style="font-size:0.75rem;padding:3px 6px;">${opts}</select>
        </div>`;
    }).join('');

    // Sync UI selections back to _sisColumnMap
    el.querySelectorAll('.sis-col-select').forEach(sel => {
        sel.addEventListener('change', () => {
            _sisColumnMap[sel.dataset.field] = sel.value===''?null:parseInt(sel.value);
            renderSisPreviewTable();
        });
    });
    renderSisPreviewTable();
}

// Show what will actually be created, so a bad column guess is obvious before
// anything is written to Firestore.
function renderSisPreviewTable() {
    const box = document.getElementById('sis-preview-table');
    if (!box) return;
    const rows = sisRowsToStudents(_sisParsedRows.slice(0, 8));
    if (!rows.length) { box.innerHTML = ''; return; }
    box.innerHTML = `
        <table class="sis-preview-table">
            <thead><tr><th>First</th><th>Last</th><th>ID</th><th>Grade</th></tr></thead>
            <tbody>${rows.map(r => `<tr>
                <td>${escHtml(r.firstName)}</td><td>${escHtml(r.lastName)}</td>
                <td>${escHtml(r.sisId)}</td><td>${escHtml(r.grade)}</td></tr>`).join('')}</tbody>
        </table>
        ${_sisParsedRows.length > 8 ? `<div class="sis-preview-more">+ ${_sisParsedRows.length - 8} more</div>` : ''}`;
}

// One place that turns parsed rows + the column map into student objects, used
// by both the preview and the import so they can never disagree.
function sisRowsToStudents(rows) {
    const get = (row, key) => {
        const idx = _sisColumnMap[key];
        return (idx !== null && idx !== undefined && idx !== '') ? String(row[idx] || '').trim() : '';
    };
    return rows.map(row => {
        let firstName = get(row, 'firstName');
        let lastName  = get(row, 'lastName');
        if (!firstName && !lastName) {
            const n = splitPersonName(get(row, 'fullName'));
            firstName = n.first; lastName = n.last;
        } else if (!lastName && get(row, 'fullName')) {
            lastName = splitPersonName(get(row, 'fullName')).last;
        }
        return {
            firstName, lastName,
            sisId:    get(row, 'studentId'),
            grade:    get(row, 'grade').replace(/^0+(?=\d)/, ''),
            nickname: get(row, 'nickname')
        };
    }).filter(r => r.firstName || r.lastName);
}

async function executeSisImport() {
    // Read current UI selections
    document.querySelectorAll('.sis-col-select').forEach(sel => {
        _sisColumnMap[sel.dataset.field] = sel.value===''?null:parseInt(sel.value);
    });

    const hasName = ['firstName','lastName','fullName'].some(k => {
        const v = _sisColumnMap[k];
        return v !== null && v !== undefined && v !== '';
    });
    if (!hasName) { showToast('Map a name column before importing.'); return; }

    const parsed = sisRowsToStudents(_sisParsedRows);
    if (!parsed.length) { showToast('No student names found in those rows.'); return; }

    showLoading();
    const batch = db.batch(); let added=0, skipped=0;
    parsed.forEach(p => {
        const firstName = p.firstName || 'Student';
        const lastName  = p.lastName || '';
        const dupe = students.some(s =>
            (p.sisId && s.sisId && s.sisId === p.sisId) ||
            ((s.firstName || '').toLowerCase() === firstName.toLowerCase() &&
             (s.lastName  || '').toLowerCase() === lastName.toLowerCase()));
        if (dupe) { skipped++; return; }
        const data = {
            firstName, lastName,
            sisId:        p.sisId,
            grade:        p.grade,
            nickname:     p.nickname,
            group:'', readingLevel:'', classId:null,
            accommodations:'', notes:'', tags:[],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const ref = getYearPath().collection('students').doc();
        batch.set(ref,data); students.push({id:ref.id,...data}); added++;
    });

    try {
        await batch.commit();
        students.sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||''));
        hideLoading();
        document.getElementById('sis-modal').classList.add('hidden');
        const msg=`✅ Imported ${added} student${added!==1?'s':''}${skipped?' ('+skipped+' already on the roster)':''}`;
        showToast(msg);
        renderRoster(); renderGroupFilterChips();
    } catch(e) { hideLoading(); showToast('Import error: '+e.message); }
}

// ============================================================
// OAUTH CALLBACK + STATE RESTORE (Microsoft / Moodle)
// ============================================================
// initOAuthCallback runs SYNCHRONOUSLY at page-load (top-level call further
// down). It must therefore only touch things already initialized at that point
// — it completes a Microsoft PKCE redirect if one is present and nothing else.
// Restoring saved MS/Moodle state is done separately in restoreConnectionState()
// (called from the auth handler AFTER the whole script has run), because those
// globals are declared later in the file and assigning them here would throw a
// Temporal-Dead-Zone ReferenceError and abort the rest of module init.
// (Clever integration was removed in v5.19.1.)
// -------------------------------------------------------------

function initOAuthCallback() {
    // Complete a Microsoft PKCE code callback (?code=...&state=ms_...)
    const urlParams = new URLSearchParams(window.location.search);
    const msCode  = urlParams.get('code');
    const msState = urlParams.get('state');
    if (msCode && msState && msState.startsWith('ms_')) {
        window.history.replaceState({}, document.title, '/');
        handleMsCallback(msCode, msState);
    }
}

// Restore saved Microsoft / Moodle connection state from localStorage. Safe to
// call only after module init has completed (i.e. from the auth handler), so the
// ms*/moodle* globals it assigns are already initialized.
function restoreConnectionState() {
    try {
        const _msT = localStorage.getItem('ms_token');
        if (_msT) {
            msAccessToken = _msT;
            msUserEmail   = localStorage.getItem('ms_user_email') || '';
            msUserId      = localStorage.getItem('ms_user_id')    || '';
        }
        if (typeof updateMsConnectionStatus === 'function') updateMsConnectionStatus();

        moodleUrl   = localStorage.getItem('moodle_url')   || '';
        moodleToken = localStorage.getItem('moodle_token') || '';
    } catch (e) { console.warn('restoreConnectionState:', e); }
}


let gcTokenClient = null;

function saveGcClientId(){
    const id = document.getElementById('gc-client-id-settings')?.value.trim();
    if(!id){ showToast('Enter a client ID.'); return; }
    if(!settings.gcClientId || settings.gcClientId!==id){
        settings.gcClientId = id;
        db.collection('users').doc(currentUser.uid).collection('settings').doc('app')
            .set({gcClientId:id},{merge:true}).catch(e=>console.warn(e));
    }
    showToast('Google client ID saved!');
}

function connectGoogleClassroom(){
    const modal = document.getElementById('gc-modal');
    if(!modal) return;
    const savedId = settings.gcClientId||'';
    const inp = document.getElementById('gc-client-id');
    if(inp) inp.value = savedId;
    document.getElementById('gc-step-auth').classList.remove('hidden');
    document.getElementById('gc-step-courses').classList.add('hidden');
    modal.classList.remove('hidden');
}

function gcAuthorize(){
    const clientId = (document.getElementById('gc-client-id')?.value||'').trim();
    if(!clientId){ showToast('Enter your Google OAuth Client ID.'); return; }
    settings.gcClientId = clientId;

    if(!window.google?.accounts?.oauth2){ showToast('Google Identity Services not loaded. Check your connection.'); return; }

    gcTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.coursework.students.readonly',
        callback: async(resp)=>{
            if(resp.error){ showToast('Auth error: '+resp.error); return; }
            gcAccessToken = resp.access_token;
            await gcLoadCourses();
        }
    });
    gcTokenClient.requestAccessToken();
}

async function gcLoadCourses(){
    try{
        const resp = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=20',{
            headers:{'Authorization':'Bearer '+gcAccessToken}
        });
        if(!resp.ok) throw new Error('Classroom API '+resp.status);
        const data = await resp.json();
        const courses = data.courses||[];
        document.getElementById('gc-step-auth').classList.add('hidden');
        document.getElementById('gc-step-courses').classList.remove('hidden');
        const list = document.getElementById('gc-courses-list');
        if(!courses.length){ list.innerHTML='<p style="font-size:0.82rem;color:var(--text-muted);">No active courses found.</p>'; return; }
        list.innerHTML = courses.map(c=>`
            <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.15);border-radius:var(--radius-sm);padding:8px 12px;">
                <div>
                    <div style="font-size:0.82rem;font-weight:700;color:var(--text-primary);">${escHtml(c.name)}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${escHtml(c.section||'')} ${escHtml(c.descriptionHeading||'')}</div>
                </div>
                <div style="display:flex;gap:5px;">
                    <button class="btn btn-sm btn-primary" onclick="gcImportRoster(${jsArg(c.id)},${jsArg(c.name||'')})">Import Roster</button>
                    <button class="btn btn-sm btn-ghost" onclick="gcImportAssignments(${jsArg(c.id)},${jsArg(c.name||'')})">Assignments</button>
                </div>
            </div>`
        ).join('');
    }catch(e){ showToast('Error loading courses: '+e.message); }
}

async function gcImportRoster(courseId, courseName){
    const statusEl = document.getElementById('gc-import-status');
    if(statusEl) statusEl.textContent = 'Importing roster…';
    try{
        const resp = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students?pageSize=100`,{
            headers:{'Authorization':'Bearer '+gcAccessToken}
        });
        if(!resp.ok) throw new Error('Roster API '+resp.status);
        const data = await resp.json();
        const gcStudents = data.students||[];
        if(!gcStudents.length){ if(statusEl) statusEl.textContent='No students in this course.'; return; }

        const batch = db.batch();
        let added = 0;
        gcStudents.forEach(gs=>{
            const profile = gs.profile||{};
            const name = profile.name||{};
            const fn = name.givenName||profile.name?.fullName?.split(' ')[0]||'Student';
            const ln = name.familyName||'';
            // Skip if already exists (match by name)
            if(students.some(s=>s.firstName===fn&&s.lastName===ln)) return;
            const data = {
                firstName: fn, lastName: ln,
                googleId:  gs.userId||'',
                tags:[], accommodations:'', notes:'', group:'', readingLevel:'',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            const ref = getYearPath().collection('students').doc();
            batch.set(ref, data);
            students.push({id:ref.id,...data});
            added++;
        });
        await batch.commit();
        students.sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||''));
        if(statusEl) statusEl.textContent = `✅ Imported ${added} new students from "${courseName}" (${gcStudents.length-added} already existed).`;
        renderRoster();
        renderGroupFilterChips();
        showToast(`✅ ${added} students imported from Google Classroom!`);
    }catch(e){ if(statusEl) statusEl.textContent='Error: '+e.message; showToast('Error: '+e.message); }
}

async function gcImportAssignments(courseId, courseName){
    const statusEl = document.getElementById('gc-import-status');
    if(statusEl) statusEl.textContent = 'Importing assignments…';
    try{
        const resp = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork?pageSize=30&orderBy=dueDate+desc`,{
            headers:{'Authorization':'Bearer '+gcAccessToken}
        });
        if(!resp.ok) throw new Error('CourseWork API '+resp.status);
        const data = await resp.json();
        const cw = data.courseWork||[];
        if(!cw.length){ if(statusEl) statusEl.textContent='No assignments in this course.'; return; }

        const batch = db.batch();
        let added = 0;
        cw.forEach(a=>{
            if(assignments.some(ex=>ex.gcId===a.id)) return;
            const dd = a.dueDate;
            const dateStr = dd ? `${dd.year}-${String(dd.month).padStart(2,'0')}-${String(dd.day).padStart(2,'0')}` : formatDate(new Date());
            const data = {
                title:    a.title||'Untitled',
                date:     dateStr,
                maxScore: a.maxPoints||100,
                category: 'homework',
                classId:  null,
                gcId:     a.id,
                scores:   {},
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            const ref = getYearPath().collection('assignments').doc();
            batch.set(ref,data);
            assignments.unshift({id:ref.id,...data});
            added++;
        });
        await batch.commit();
        if(statusEl) statusEl.textContent = `✅ Imported ${added} assignments from "${courseName}".`;
        renderGradebook();
        showToast(`✅ ${added} assignments imported from Google Classroom!`);
    }catch(e){ if(statusEl) statusEl.textContent='Error: '+e.message; }
}

// ============================================================
// CURRICULUM GENERATOR
// ============================================================

function openCurriculumGenerator() {
    const modal = document.getElementById('curriculum-gen-modal');
    if (!modal) return;

    // Build class list with editable curriculum fields
    const listEl = document.getElementById('curgen-class-list');
    if (listEl) {
        if (classes.length === 0) {
            listEl.innerHTML = '<p style="font-size:0.82rem;color:var(--text-muted);">No classes found. Add classes first.</p>';
        } else {
            listEl.innerHTML = classes.map(cls => `
                <div style="background:rgba(0,0,0,0.15);border-radius:var(--radius-md);padding:10px 12px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <input type="checkbox" class="curgen-class-check" value="${cls.id}" checked
                            style="width:16px;height:16px;cursor:pointer;">
                        <span style="font-weight:700;font-size:0.82rem;color:var(--text-primary);">${escHtml(cls.name)}</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${cls.subject || ''}</span>
                    </div>
                    <input type="text" class="form-control curgen-curriculum-input" data-class-id="${cls.id}"
                        placeholder="Curriculum program (e.g. Wonders 2023 ELA, Everyday Math Grade 1)"
                        value="${cls.curriculum || ''}"
                        style="font-size:0.78rem;padding:5px 8px;">
                </div>
            `).join('');
        }
    }

    document.getElementById('curgen-status').innerHTML = '';
    document.getElementById('curgen-prefill-lessons').checked = false;
    const btn = document.getElementById('curgen-run-btn');
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Generate Now'; }
    modal.classList.remove('hidden');
}

function closeCurriculumGenerator() {
    document.getElementById('curriculum-gen-modal')?.classList.add('hidden');
    document.getElementById('student-modal')?.classList.add('hidden');
    document.getElementById('assignment-modal')?.classList.add('hidden');
    document.getElementById('diff-modal')?.classList.add('hidden');
    document.getElementById('gc-modal')?.classList.add('hidden');
    document.getElementById('grade-settings-modal')?.classList.add('hidden');
    document.getElementById('attendance-modal')?.classList.add('hidden');
    document.getElementById('teams-modal')?.classList.add('hidden');
    document.getElementById('moodle-modal')?.classList.add('hidden');
    document.getElementById('sis-modal')?.classList.add('hidden');
    document.getElementById('comm-modal')?.classList.add('hidden');
    closeSeatPicker();
}

async function runCurriculumGenerator() {
    if (!hasEffectiveAiKey()) { showToast('Add your API key in Settings first.'); return; }

    const checkedInputs = Array.from(document.querySelectorAll('.curgen-class-check:checked'));
    if (checkedInputs.length === 0) { showToast('Select at least one class.'); return; }

    const prefillLessons = document.getElementById('curgen-prefill-lessons')?.checked;
    const btn            = document.getElementById('curgen-run-btn');
    const statusEl       = document.getElementById('curgen-status');
    const grade          = aiSettings.grade || '1';
    const sy             = settings.schoolYear || '2025-2026';
    const yearStart      = settings.yearStart  || sy.split('-')[0] + '-08-01';
    const yearEnd        = settings.yearEnd    || sy.split('-')[1] + '-05-25';

    const selectedClasses = checkedInputs.map(cb => {
        const cls = classes.find(c => c.id === cb.value);
        const inputEl = document.querySelector(`.curgen-curriculum-input[data-class-id="${cb.value}"]`);
        const curriculum = (inputEl?.value || cls?.curriculum || '').trim();
        return { cls, curriculum };
    }).filter(x => x.cls);

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

    const setStatus = (msg) => {
        if (statusEl) statusEl.innerHTML = `<div style="font-size:0.78rem;color:var(--text-secondary);padding:6px 0;">${msg}</div>`;
    };

    let totalUnitsAdded   = 0;
    let totalLessonsAdded = 0;

    for (let i = 0; i < selectedClasses.length; i++) {
        const { cls, curriculum } = selectedClasses[i];

        // Save curriculum back to class if changed
        if (curriculum && curriculum !== cls.curriculum) {
            try {
                await getYearPath().collection('classes').doc(cls.id).update({ curriculum });
                const idx = classes.findIndex(c => c.id === cls.id);
                if (idx >= 0) classes[idx].curriculum = curriculum;
            } catch(e) { console.warn('Could not save curriculum to class:', e); }
        }

        setStatus(`(${i+1}/${selectedClasses.length}) Generating units for <strong>${escHtml(cls.name)}</strong>…`);

        const unitColor = UNIT_COLORS[i % UNIT_COLORS.length];

        const unitPrompt =
            'You are planning a Grade ' + grade + ' school year for the class "' + cls.name + '"' +
            (cls.subject ? ' (' + cls.subject + ')' : '') + '.\n' +
            (curriculum ? 'Curriculum program: ' + curriculum + '\n' : '') +
            'School year: ' + yearStart + ' to ' + yearEnd + '\n\n' +
            'Generate a complete sequence of units that covers this entire school year.\n' +
            'Requirements:\n' +
            '- 8 to 14 units total, sequenced logically from simple to complex\n' +
            '- Each unit spans 2–5 weeks (no gaps, no overlaps)\n' +
            '- Start dates and end dates must stay within ' + yearStart + ' to ' + yearEnd + '\n' +
            '- Standards should reference CCSS or NGSS codes where applicable\n' +
            '- Use the specific curriculum program chapters/units if you know them\n\n' +
            'Return ONLY compact JSON array, no markdown:\n' +
            '[{\n' +
            '  "name": "<unit name>",\n' +
            '  "startDate": "YYYY-MM-DD",\n' +
            '  "endDate": "YYYY-MM-DD",\n' +
            '  "description": "<1-2 sentence learning goals>",\n' +
            '  "standards": "<2-4 CCSS or NGSS standard codes>"\n' +
            '}]';

        try {
            const raw     = (await callAIText({ prompt: unitPrompt, tier: 'fast', maxTokens: 2048 })).replace(/```json|```/g,'').trim();

            const unitList = JSON.parse(raw);

            // Save units
            const batch = db.batch();
            const newUnits = [];
            unitList.forEach((u, idx) => {
                if (!u.name || !u.startDate || !u.endDate) return;
                const data = {
                    name:        u.name,
                    classId:     cls.id,
                    startDate:   u.startDate,
                    endDate:     u.endDate,
                    description: u.description || '',
                    standards:   u.standards   || '',
                    color:       UNIT_COLORS[(i * 3 + idx) % UNIT_COLORS.length],
                    docIds:      [],
                    updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
                };
                const ref = getYearPath().collection('units').doc();
                batch.set(ref, data);
                newUnits.push({ id: ref.id, ...data });
            });
            await batch.commit();
            newUnits.forEach(u => units.push(u));
            units.sort((a, b) => a.startDate.localeCompare(b.startDate));
            totalUnitsAdded += newUnits.length;

            // Pre-fill lesson stubs if requested
            if (prefillLessons && newUnits.length > 0) {
                setStatus(`(${i+1}/${selectedClasses.length}) Generating lesson stubs for <strong>${escHtml(cls.name)}</strong>…`);

                const lessonPrompt =
                    'You are generating weekly lesson title stubs for Grade ' + grade + ' class "' + cls.name + '".\n' +
                    (curriculum ? 'Curriculum: ' + curriculum + '\n' : '') +
                    '\nFor each unit below, generate ONE lesson title per school week (Mon–Fri, skip weekends).\n' +
                    'Keep titles short (5–8 words), specific to the unit topic, and sequenced logically.\n\n' +
                    'UNITS:\n' +
                    newUnits.map(u => '- ' + u.name + ' (' + u.startDate + ' to ' + u.endDate + '): ' + (u.description || '')).join('\n') +
                    '\n\nReturn ONLY compact JSON array:\n' +
                    '[{"date":"YYYY-MM-DD","title":"<lesson title>","unitName":"<unit name>"}]';

                const lRaw = (await callAIText({ prompt: lessonPrompt, tier: 'fast', maxTokens: 4096 })).replace(/```json|```/g,'').trim();
                {
                    const lList = JSON.parse(lRaw);

                    const lBatch  = db.batch();
                    const newLessons = [];

                    lList.forEach(l => {
                        if (!l.date || !l.title) return;
                        // Skip if lesson already exists for this class/date
                        if (lessons.some(ex => ex.date === l.date && ex.classId === cls.id)) return;
                        // Skip non-school days
                        const dow = new Date(l.date + 'T00:00:00').getDay();
                        if (dow === 0 || dow === 6 || isOffDay(l.date)) return;
                        const data = {
                            title:    l.title,
                            date:     l.date,
                            classId:  cls.id,
                            subject:  cls.subject || '',
                            duration: 45,
                            standards:'',
                            flow:     '',
                            materials:'',
                            activities:'',
                            attachments:[],
                            isStub:   true,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        const ref = getYearPath().collection('lessons').doc();
                        lBatch.set(ref, data);
                        newLessons.push({ id: ref.id, ...data });
                    });

                    await lBatch.commit();
                    newLessons.forEach(l => lessons.push(l));
                    lessons.sort((a, b) => a.date.localeCompare(b.date));
                    totalLessonsAdded += newLessons.length;
                }
            }

        } catch (e) {
            console.error('Curriculum generator error for', cls.name, e);
            setStatus(`⚠️ Error for ${escHtml(cls.name)}: ${escHtml(e.message)}`);
        }
    }

    // Re-render everything
    renderUnitMap();
    renderCalendar();
    renderWeek();

    if (btn) { btn.disabled = false; btn.textContent = '🤖 Generate Now'; }

    const summary = totalUnitsAdded + ' units added'
        + (prefillLessons ? ', ' + totalLessonsAdded + ' lesson stubs created' : '') + '.';
    setStatus('✅ Done! ' + summary + ' Switch to 🗺️ Unit Map to see the result.');
    showToast('✅ ' + summary);
}

// ============================================================
// COPY LESSON PLAN
// ============================================================

function openCopyLessonPicker() {
    const picker = document.getElementById('copy-lesson-picker');
    if (!picker) return;
    picker.classList.remove('hidden');
    // Default to tomorrow
    const current = document.getElementById('lesson-date')?.value;
    if (current) {
        const d = new Date(current + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        document.getElementById('copy-lesson-date').value = formatDate(d);
    }
    // Reset the recurrence checkbox/options each time the picker opens so a
    // previous copy's "Repeat" choice doesn't silently carry over.
    const copyRecurringCheckbox = document.getElementById('copy-lesson-recurring');
    if (copyRecurringCheckbox) copyRecurringCheckbox.checked = false;
    document.getElementById('copy-recurring-options')?.classList.add('hidden');
}

function closeCopyLessonPicker() {
    document.getElementById('copy-lesson-picker')?.classList.add('hidden');
    document.getElementById('copy-day-picker')?.classList.add('hidden');
    closeCopyWeekPicker();
    document.getElementById('unit-modal')?.classList.add('hidden');
    document.getElementById('curriculum-gen-modal')?.classList.add('hidden');
    document.getElementById('student-modal')?.classList.add('hidden');
    document.getElementById('assignment-modal')?.classList.add('hidden');
    document.getElementById('diff-modal')?.classList.add('hidden');
    document.getElementById('gc-modal')?.classList.add('hidden');
    document.getElementById('grade-settings-modal')?.classList.add('hidden');
    document.getElementById('attendance-modal')?.classList.add('hidden');
    document.getElementById('teams-modal')?.classList.add('hidden');
    document.getElementById('moodle-modal')?.classList.add('hidden');
    document.getElementById('sis-modal')?.classList.add('hidden');
    document.getElementById('comm-modal')?.classList.add('hidden');
    closeSeatPicker();
    document.getElementById('unit-standards-picker')?.classList.add('hidden');
}

async function executeCopyLesson() {
    const targetDate = document.getElementById('copy-lesson-date')?.value;
    if (!targetDate) { showToast('Pick a date to copy to.'); return; }

    // Grab current form values (works even if unsaved)
    const baseLessonData = {
        title:      document.getElementById('lesson-title')?.value.trim() || '',
        classId:    document.getElementById('lesson-class')?.value || null,
        subject:    document.getElementById('lesson-subject')?.value.trim() || '',
        duration:   parseInt(document.getElementById('lesson-duration')?.value) || 45,
        standards:  document.getElementById('lesson-standards')?.value.trim() || '',
        learningTarget:  document.getElementById('lesson-learning-target')?.value.trim() || '',
        successCriteria: document.getElementById('lesson-success-criteria')?.value.trim() || '',
        flow:       document.getElementById('lesson-flow')?.value.trim() || '',
        materials:  document.getElementById('lesson-materials')?.value.trim() || '',
        activities: document.getElementById('lesson-activities')?.value.trim() || '',
        // Keep the session (v6.2.0 -- a Session 2 lesson used to land in Session 1)
        slotIndex:  parseInt(document.getElementById('lesson-slot-index')?.value || '0') || 0,
        attachments: [],
    };

    if (!baseLessonData.title) { showToast('Add a title before copying.'); return; }

    // If "Repeat" is checked, copy to the target date PLUS every subsequent
    // recurrence generated the same way "Make this a recurring lesson" does.
    const isRecurring = document.getElementById('copy-lesson-recurring')?.checked;
    let targetDates = [targetDate];

    if (isRecurring) {
        const frequency = document.getElementById('copy-recurring-frequency')?.value || 'weekly';
        const countValue = document.getElementById('copy-recurring-count')?.value || '4';
        targetDates = targetDates.concat(generateRecurringDates(targetDate, frequency, countValue));
    }

    const recurringGroupId = isRecurring ? `recurring_${Date.now()}` : null;

    try {
        showLoading();
        const createdLessons = [];
        for (let i = 0; i < targetDates.length; i++) {
            const lessonData = {
                ...baseLessonData,
                date: targetDates[i],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (recurringGroupId) {
                lessonData.recurringGroupId = recurringGroupId;
                lessonData.recurringIndex = i + 1;
            }
            try {
                const docRef = await getYearPath().collection('lessons').add(lessonData);
                createdLessons.push({ id: docRef.id, ...lessonData });
            } catch (innerErr) {
                console.error('Error copying lesson to', targetDates[i], innerErr);
            }
        }
        lessons.push(...createdLessons);
        renderCalendar();
        renderWeek();
        hideLoading();
        closeCopyLessonPicker();
        if (createdLessons.length > 1) {
            showToast(`📋 Lesson copied to ${createdLessons.length} dates!`);
        } else if (createdLessons.length === 1) {
            showToast('📋 Lesson copied to ' + new Date(targetDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '!');
        } else {
            showToast('Error copying lesson.');
        }
    } catch (e) {
        hideLoading();
        showToast('Error copying lesson: ' + e.message);
    }
}



// ============================================================
// UNIT PLANNER
// ============================================================
// units declared at top of file

const UNIT_COLORS = [
    '#7B5EA7','#D4698A','#3A86C8','#2A9D7F',
    '#E8832A','#C0392B','#8E7B4E','#4A6741',
];

// ── Load / save ───────────────────────────────────────────────────────────

async function loadUnits() {
    try {
        const snap = await getYearPath().collection('units').orderBy('startDate').get();
        units = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn('loadUnits:', e.message);
        units = [];
    }
}

// ── Year-view tab toggle ──────────────────────────────────────────────────

function switchYearTab(tab) {
    const calBtn  = document.getElementById('year-calendar-tab');
    const unitBtn = document.getElementById('year-units-tab');
    const grid    = document.getElementById('year-grid');
    const legend  = document.querySelector('.year-legend');
    const summary = document.querySelector('.year-summary');
    const unitMap = document.getElementById('unit-map-container');

    if (tab === 'units') {
        calBtn.className  = 'btn btn-sm btn-ghost';
        unitBtn.className = 'btn btn-sm btn-primary';
        if (grid)    grid.style.display    = 'none';
        if (legend)  legend.style.display  = 'none';
        if (summary) summary.style.display = 'none';
        if (unitMap) unitMap.classList.remove('hidden');
        renderUnitMap();
    } else {
        calBtn.className  = 'btn btn-sm btn-primary';
        unitBtn.className = 'btn btn-sm btn-ghost';
        if (grid)    grid.style.display    = '';
        if (legend)  legend.style.display  = '';
        if (summary) summary.style.display = '';
        if (unitMap) unitMap.classList.add('hidden');
    }
}

// ── Render the Gantt-style timeline ──────────────────────────────────────

function getUnitMapClassOrder() {
    const allIds = classes.map(c => c.id);
    const saved = Array.isArray(settings.unitMapClassOrder)
        ? settings.unitMapClassOrder.filter(id => allIds.includes(id))
        : [];
    const missing = allIds.filter(id => !saved.includes(id));
    return [...saved, ...missing];
}

async function saveUnitMapClassOrder() {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear')
            .set({ unitMapClassOrder: settings.unitMapClassOrder }, { merge: true });
    } catch (error) {
        console.error('Error saving Unit Map class order:', error);
    }
}

function moveUnitMapClass(classId, direction) {
    const order = getUnitMapClassOrder();
    const idx = order.indexOf(classId);
    if (idx === -1) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
    settings.unitMapClassOrder = order;
    saveUnitMapClassOrder();
    renderUnitMap();
}

// School year start/end for the year currently being viewed. The calendar's
// actual first-day/last-day events are the single source of truth used
// elsewhere in the app (isOffDay, the year progress bar, recurring lessons)
// -- prefer those over the separate settings.yearStart/yearEnd fields, which
// are easy to leave stale from a prior school year and previously caused the
// Unit Map timeline to silently render against the wrong year (units with
// correct current-year dates would get clipped to 0%/100% and become
// invisible). Shared by renderUnitMap() and openUnitModal()'s default dates.
function getSchoolYearBounds() {
    const sy     = settings.schoolYear || '2025-2026';
    const [sy1, sy2] = sy.split('-').map(Number);

    const firstDayEvent = events.find(e => e.type === 'first-day');
    const lastDayEvent  = events.find(e => e.type === 'last-day');

    const yearStart = firstDayEvent?.startDate
        ? new Date(firstDayEvent.startDate + 'T00:00:00')
        : (settings.yearStart ? new Date(settings.yearStart + 'T00:00:00') : new Date(sy1, 7, 1));
    const yearEnd = lastDayEvent?.startDate
        ? new Date(lastDayEvent.startDate + 'T00:00:00')
        : (settings.yearEnd ? new Date(settings.yearEnd + 'T00:00:00') : new Date(sy2, 4, 31));

    return { yearStart, yearEnd };
}

function renderUnitMap() {
    const container = document.getElementById('unit-map-timeline');
    if (!container) return;

    const { yearStart, yearEnd } = getSchoolYearBounds();
    const totalDays = (yearEnd - yearStart) / 86400000;

    // Build month columns
    const months = [];
    let cur = new Date(yearStart.getFullYear(), yearStart.getMonth(), 1);
    while (cur <= yearEnd) {
        months.push(new Date(cur));
        cur.setMonth(cur.getMonth() + 1);
    }

    // Pct helper
    const pct = (date) => {
        const d = new Date(date);
        const off = (d - yearStart) / 86400000;
        return Math.max(0, Math.min(100, (off / totalDays) * 100));
    };

    // Group units by class (null class = "All Classes" row).
    // Row order follows the user's saved Unit Map class order (reorderable via
    // the up/down buttons next to each row label), falling back to each
    // class's natural order for any class not yet in the saved order.
    const rows = [];
    const orderedClassIds = getUnitMapClassOrder();
    const classById = {};
    classes.forEach(cls => { classById[cls.id] = cls; });
    orderedClassIds.forEach(id => {
        const cls = classById[id];
        if (!cls) return;
        rows.push({ label: cls.name, classId: cls.id, units: units.filter(u => u.classId === cls.id) });
    });
    // Units not tied to a specific class
    const generalUnits = units.filter(u => !u.classId);
    if (generalUnits.length > 0 || classes.length === 0) {
        rows.unshift({ label: 'All Classes', classId: null, units: generalUnits });
    }

    // Diagnostic: confirm whether units are actually present in memory for
    // each row (vs a pure rendering/positioning problem) and whether their
    // dates fall inside the visible yearStart/yearEnd window used for pct().
    console.log(`[Unit Map render] yearStart=${formatDate(yearStart)} yearEnd=${formatDate(yearEnd)} totalDays=${totalDays}`);
    console.table(rows.map(r => ({
        row: r.label,
        classId: r.classId,
        unitCount: r.units.length,
        sample: r.units.slice(0, 2).map(u => `${u.name} (${u.startDate}→${u.endDate})`).join(' | ')
    })));

    if (rows.length === 0 || (units.length === 0 && classes.length === 0)) {
        container.innerHTML = '<div class="unit-map-empty">No classes or units yet.<br>Add classes first, then click <strong>+ Add Unit</strong> to start planning.</div>';
        return;
    }

    // Column widths as percentages
    const monthPcts = months.map(m => {
        const mStart = new Date(Math.max(m, yearStart));
        const mEnd   = new Date(Math.min(
            new Date(m.getFullYear(), m.getMonth() + 1, 0),
            yearEnd
        ));
        return Math.max(0, (mEnd - mStart) / 86400000 / totalDays * 100);
    });

    // "Today" marker position -- a vertical line across every row so it's
    // obvious at a glance where the class currently stands relative to every
    // unit, on every class row at once. Only shown when today actually falls
    // inside the visible school-year window (e.g. hidden entirely in summer).
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayRawOffset = (today - yearStart) / 86400000;
    const showTodayLine = todayRawOffset >= 0 && todayRawOffset <= totalDays;
    const todayPct = showTodayLine ? pct(today) : 0;

    // Header row -- month labels get a "'26"/"'27" year tag on January and on
    // the very first visible month, so a school year that spans two calendar
    // years never reads ambiguously (a bare "Jan" between "Dec" and "Feb"
    // could otherwise belong to either year at a glance).
    let html = '<div class="unit-map-wrap" style="position:relative;">';
    html += '<div class="unit-map-header" style="display:flex;min-width:600px;">';
    html += '<div style="width:110px;min-width:110px;border-right:1px solid rgba(255,255,255,0.08);"></div>';
    html += '<div style="flex:1;display:flex;">';
    months.forEach((m, i) => {
        const monthLabel = m.toLocaleDateString('en-US', { month: 'short' });
        const needsYear = m.getMonth() === 0 || i === 0;
        const label = needsYear ? `${monthLabel} '${String(m.getFullYear()).slice(-2)}` : monthLabel;
        const isYearBoundary = m.getMonth() === 0 && i > 0;
        html += `<div class="unit-map-month-label${isYearBoundary ? ' unit-map-month-yearline' : ''}" style="width:${monthPcts[i]}%;min-width:0;">${label}</div>`;
    });
    html += '</div></div>';

    // Rows
    const reorderableRows = rows.filter(r => r.classId);
    rows.forEach((row, rowIdx) => {
        const reorderIdx = row.classId ? reorderableRows.indexOf(row) : -1;
        const isFirstReorderable = reorderIdx === 0;
        const isLastReorderable = reorderIdx === reorderableRows.length - 1;
        html += `<div class="unit-map-row${rowIdx % 2 === 1 ? ' unit-map-row-alt' : ''}" style="min-width:600px;">`;
        html += `<div class="unit-map-row-label" title="${row.label}">`;
        if (row.classId) {
            html += `<span class="unit-map-reorder-btns">`;
            html += `<button type="button" class="unit-map-reorder-btn" onclick="moveUnitMapClass('${row.classId}', -1)" ${isFirstReorderable ? 'disabled' : ''} title="Move class up">&#9650;</button>`;
            html += `<button type="button" class="unit-map-reorder-btn" onclick="moveUnitMapClass('${row.classId}', 1)" ${isLastReorderable ? 'disabled' : ''} title="Move class down">&#9660;</button>`;
            html += `</span>`;
        }
        html += `<span class="unit-map-row-name">${row.label}</span>`;
        html += `</div>`;
        html += `<div class="unit-map-row-track" data-class-id="${row.classId || ''}">`;

        // Grid lines -- the January line gets a brighter, dashed style so the
        // calendar-year boundary is easy to spot at a glance, matching the
        // year tag added to the header label above.
        let pctAccum = 0;
        months.forEach((m, i) => {
            const isYearBoundary = m.getMonth() === 0 && i > 0;
            html += `<div class="unit-track-grid${isYearBoundary ? ' unit-track-grid-yearline' : ''}" style="left:${pctAccum}%;width:${monthPcts[i]}%;"></div>`;
            pctAccum += monthPcts[i];
        });

        // Unit bars
        row.units.forEach(u => {
            const start = new Date(u.startDate + 'T00:00:00');
            const end   = new Date(u.endDate   + 'T00:00:00');
            const left  = pct(start);
            const width = Math.max(1, pct(end) - left);
            const color = u.color || UNIT_COLORS[0];
            const weekCount = Math.round((end - start) / 604800000);
            const weekLabel = weekCount > 0 ? ` (${weekCount}w)` : '';
            html += `<div class="unit-bar" style="left:${left}%;width:${width}%;background:${color};"
                title="${escHtml(u.name)}${weekLabel} — ${u.startDate} to ${u.endDate}${u.description ? '\n' + escHtml(u.description) : ''}"
                onclick="openUnitModal('${u.id}')">${escHtml(u.name)}</div>`;
        });

        // Add button
        html += `<button class="unit-map-add-btn" onclick="openUnitModal(null,'${row.classId || ''}')">+ Add Unit</button>`;
        html += `</div></div>`;
    });

    if (showTodayLine) {
        html += `<div class="unit-map-today-line" style="left:calc(110px + (100% - 110px) * ${(todayPct / 100).toFixed(4)});" title="Today — ${formatDate(today)}"><span class="unit-map-today-flag">Today</span></div>`;
    }

    html += '</div>';

    container.innerHTML = html;
}

// Opens a landscape-formatted, printable version of the Unit Map in a new
// window (the same window.open + print() pattern used for newsletters and
// other Plany printables, chosen over jsPDF for layout reliability with a
// percentage-positioned Gantt-style timeline). Mirrors the on-screen
// timeline's month-ruler-with-year-tags and January divider, plus a
// unit-by-unit reference table underneath so every date range stays fully
// readable on paper even when a bar itself is too narrow for its label.
function printUnitMap() {
    const sy = settings.schoolYear || '2025-2026';
    const [sy1, sy2] = sy.split('-').map(Number);

    const firstDayEvent = events.find(e => e.type === 'first-day');
    const lastDayEvent  = events.find(e => e.type === 'last-day');
    const yearStart = firstDayEvent?.startDate
        ? new Date(firstDayEvent.startDate + 'T00:00:00')
        : (settings.yearStart ? new Date(settings.yearStart + 'T00:00:00') : new Date(sy1, 7, 1));
    const yearEnd = lastDayEvent?.startDate
        ? new Date(lastDayEvent.startDate + 'T00:00:00')
        : (settings.yearEnd ? new Date(settings.yearEnd + 'T00:00:00') : new Date(sy2, 4, 31));
    const totalDays = (yearEnd - yearStart) / 86400000;

    const months = [];
    let cur = new Date(yearStart.getFullYear(), yearStart.getMonth(), 1);
    while (cur <= yearEnd) { months.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }

    const pct = (date) => {
        const d = new Date(date);
        const off = (d - yearStart) / 86400000;
        return Math.max(0, Math.min(100, (off / totalDays) * 100));
    };
    const monthPcts = months.map(m => {
        const mStart = new Date(Math.max(m, yearStart));
        const mEnd   = new Date(Math.min(new Date(m.getFullYear(), m.getMonth() + 1, 0), yearEnd));
        return Math.max(0, (mEnd - mStart) / 86400000 / totalDays * 100);
    });

    const orderedClassIds = getUnitMapClassOrder();
    const classById = {};
    classes.forEach(cls => { classById[cls.id] = cls; });
    const rows = [];
    orderedClassIds.forEach(id => {
        const cls = classById[id];
        if (!cls) return;
        rows.push({ label: cls.name, classId: cls.id, units: units.filter(u => u.classId === cls.id) });
    });
    const generalUnits = units.filter(u => !u.classId);
    if (generalUnits.length > 0) rows.unshift({ label: 'All Classes', classId: null, units: generalUnits });

    if (rows.every(r => r.units.length === 0)) {
        showToast('No units on the Unit Map yet — add some before printing.');
        return;
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayRawOffset = (today - yearStart) / 86400000;
    const showTodayLine = todayRawOffset >= 0 && todayRawOffset <= totalDays;
    const todayPct = showTodayLine ? pct(today) : 0;

    const teacherName = aiSettings.teacherName || userProfile.username || 'Your Teacher';
    const grade = aiSettings.grade || '1';

    // Month ruler
    let monthRulerHtml = '<div class="pum-row-track pum-header-track">';
    let acc = 0;
    months.forEach((m, i) => {
        const monthLabel = m.toLocaleDateString('en-US', { month: 'short' });
        const needsYear = m.getMonth() === 0 || i === 0;
        const label = needsYear ? `${monthLabel} '${String(m.getFullYear()).slice(-2)}` : monthLabel;
        const isYearBoundary = m.getMonth() === 0 && i > 0;
        monthRulerHtml += `<div class="pum-month${isYearBoundary ? ' pum-yearline' : ''}" style="left:${acc}%;width:${monthPcts[i]}%;">${label}</div>`;
        acc += monthPcts[i];
    });
    monthRulerHtml += '</div>';

    // Rows
    let rowsHtml = '';
    const refTableRows = [];
    rows.forEach(row => {
        if (row.units.length === 0) return;
        let trackHtml = '';
        let gAcc = 0;
        months.forEach((m, i) => {
            const isYearBoundary = m.getMonth() === 0 && i > 0;
            trackHtml += `<div class="pum-grid${isYearBoundary ? ' pum-yearline-grid' : ''}" style="left:${gAcc}%;width:${monthPcts[i]}%;"></div>`;
            gAcc += monthPcts[i];
        });
        const sortedUnits = [...row.units].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
        sortedUnits.forEach(u => {
            const start = new Date(u.startDate + 'T00:00:00');
            const end   = new Date(u.endDate   + 'T00:00:00');
            const left  = pct(start);
            const width = Math.max(1, pct(end) - left);
            const color = u.color || UNIT_COLORS[0];
            const weekCount = Math.round((end - start) / 604800000);
            trackHtml += `<div class="pum-bar" style="left:${left}%;width:${width}%;background:${color};">${escHtml(u.name)}</div>`;
            refTableRows.push({ cls: row.label, name: u.name, start: u.startDate, end: u.endDate, weeks: weekCount });
        });
        rowsHtml += `<div class="pum-row">
            <div class="pum-row-label" title="${escHtml(row.label)}">${escHtml(row.label)}</div>
            <div class="pum-row-track">${trackHtml}</div>
        </div>`;
    });

    const todayLineHtml = showTodayLine
        ? `<div class="pum-today-line" style="left:calc(140px + (100% - 140px) * ${(todayPct / 100).toFixed(4)});"><span>Today · ${formatDate(today)}</span></div>`
        : '';

    const refTableHtml = refTableRows.map(r => `<tr>
        <td>${escHtml(r.cls)}</td>
        <td>${escHtml(r.name)}</td>
        <td>${r.start}</td>
        <td>${r.end}</td>
        <td>${r.weeks > 0 ? r.weeks + 'w' : ''}</td>
    </tr>`).join('');

    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Unit Map — ${sy}</title>
<style>
  @page { size: letter landscape; margin: 0.45in; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c1c1c; margin: 0; padding: 0; }
  h1 { font-size: 20px; color: #7B5EA7; margin: 0 0 2px; }
  .meta { font-size: 11px; color: #777; margin-bottom: 16px; }
  .pum-timeline { position: relative; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
  .pum-header-track { position: relative; height: 22px; border-bottom: 2px solid #333; background: #f4f2f8; }
  .pum-row { display: flex; align-items: stretch; border-bottom: 1px solid #eee; }
  .pum-row:last-child { border-bottom: none; }
  .pum-row-label { width: 140px; min-width: 140px; font-size: 10px; font-weight: 700; padding: 6px 8px; border-right: 1px solid #ddd; display: flex; align-items: center; background: #fafafa; }
  .pum-row-track { flex: 1; position: relative; height: 34px; min-height: 34px; }
  .pum-month { position: absolute; top: 0; bottom: 0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #888; text-align: center; padding-top: 4px; border-right: 1px solid #e2e2e2; }
  .pum-yearline { border-right: 1px dashed #9D4EDD; color: #7B5EA7; }
  .pum-grid { position: absolute; top: 0; bottom: 0; border-right: 1px solid #eee; }
  .pum-yearline-grid { border-right: 1px dashed #c9a8e6; }
  .pum-bar { position: absolute; top: 5px; height: 24px; border-radius: 4px; color: white; font-size: 8.5px; font-weight: 700; display: flex; align-items: center; padding: 0 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .pum-today-line { position: absolute; top: 22px; bottom: 0; border-left: 2px solid #FF6B9D; z-index: 3; }
  .pum-today-line span { position: absolute; top: -14px; left: 3px; background: #FF6B9D; color: white; font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 3px; white-space: nowrap; }
  table.pum-ref { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.pum-ref th { text-align: left; background: #f4f2f8; color: #7B5EA7; padding: 5px 8px; border-bottom: 2px solid #ddd; }
  table.pum-ref td { padding: 4px 8px; border-bottom: 1px solid #eee; }
  table.pum-ref tr:nth-child(even) td { background: #fafafa; }
  h2 { font-size: 13px; color: #7B5EA7; margin: 4px 0 8px; }
  .footer { font-size: 10px; color: #aaa; margin-top: 18px; border-top: 1px solid #eee; padding-top: 8px; }
</style>
</head><body>
<h1>📐 Unit Map — School Year ${sy}</h1>
<div class="meta">${escHtml(teacherName)} · Grade ${escHtml(grade)} · Generated ${new Date().toLocaleDateString()}</div>
<div class="pum-timeline">
  ${monthRulerHtml}
  ${rowsHtml}
  ${todayLineHtml}
</div>
<h2>Unit Reference</h2>
<table class="pum-ref">
  <thead><tr><th>Class</th><th>Unit</th><th>Start</th><th>End</th><th>Length</th></tr></thead>
  <tbody>${refTableHtml}</tbody>
</table>
</body></html>`, {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 400);
}

// ── Modal open / close ───────────────────────────────────────────────────

function openUnitModal(unitId, presetClassId) {
    const modal = document.getElementById('unit-modal');
    const form  = document.getElementById('unit-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('unit-id').value = '';

    // Populate class dropdown
    const classSelect = document.getElementById('unit-class');
    classSelect.innerHTML = '<option value="">All classes</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls.id;
        opt.textContent = cls.name;
        classSelect.appendChild(opt);
    });

    // Populate curriculum docs checklist
    renderUnitDocsList([]);

    // Color picker
    renderUnitColorPicker('#7B5EA7');

    // Standards picker reset
    document.getElementById('unit-standards-picker')?.classList.add('hidden');

    const deleteBtn = document.getElementById('delete-unit-btn');

    if (unitId) {
        const u = units.find(u => u.id === unitId);
        if (!u) return;
        document.getElementById('unit-modal-title').textContent = '📐 Edit Unit';
        document.getElementById('unit-id').value        = u.id;
        document.getElementById('unit-name').value      = u.name || '';
        document.getElementById('unit-class').value     = u.classId || '';
        document.getElementById('unit-start').value     = u.startDate || '';
        document.getElementById('unit-end').value       = u.endDate || '';
        document.getElementById('unit-description').value = u.description || '';
        document.getElementById('unit-standards').value = u.standards || '';
        document.getElementById('unit-color').value     = u.color || UNIT_COLORS[0];
        renderUnitColorPicker(u.color || UNIT_COLORS[0]);
        renderUnitDocsList(u.docIds || []);
        deleteBtn?.classList.remove('hidden');
    } else {
        document.getElementById('unit-modal-title').textContent = '📐 Add Unit';
        if (presetClassId) document.getElementById('unit-class').value = presetClassId;
        // Default dates: today → +4 weeks, clamped to the school year currently
        // being viewed. Using the real calendar date unclamped meant that
        // outside the school year (e.g. over summer break, or if today simply
        // falls before/after the viewed year) the new unit's dates landed
        // outside the Unit Map's visible timeline window and the unit would
        // silently render off-screen with no indication anything went wrong.
        const { yearStart, yearEnd } = getSchoolYearBounds();
        const today = new Date();
        let start = today < yearStart || today > yearEnd ? new Date(yearStart) : today;
        let end   = new Date(start); end.setDate(end.getDate() + 28);
        if (end > yearEnd) end = new Date(yearEnd);
        document.getElementById('unit-start').value = formatDate(start);
        document.getElementById('unit-end').value   = formatDate(end);
        deleteBtn?.classList.add('hidden');
    }

    modal.classList.remove('hidden');
}

function closeUnitModal() {
    document.getElementById('unit-modal')?.classList.add('hidden');
    document.getElementById('curriculum-gen-modal')?.classList.add('hidden');
    document.getElementById('student-modal')?.classList.add('hidden');
    document.getElementById('assignment-modal')?.classList.add('hidden');
    document.getElementById('diff-modal')?.classList.add('hidden');
    document.getElementById('gc-modal')?.classList.add('hidden');
    document.getElementById('grade-settings-modal')?.classList.add('hidden');
    document.getElementById('attendance-modal')?.classList.add('hidden');
    document.getElementById('teams-modal')?.classList.add('hidden');
    document.getElementById('moodle-modal')?.classList.add('hidden');
    document.getElementById('sis-modal')?.classList.add('hidden');
    document.getElementById('comm-modal')?.classList.add('hidden');
    closeSeatPicker();
}

function renderUnitColorPicker(selectedColor) {
    const picker = document.getElementById('unit-color-picker');
    if (!picker) return;
    picker.innerHTML = UNIT_COLORS.map(c =>
        `<div class="unit-color-swatch ${c === selectedColor ? 'selected' : ''}"
            style="background:${c};"
            onclick="selectUnitColor('${c}')" title="${c}"></div>`
    ).join('');
}

function selectUnitColor(color) {
    document.getElementById('unit-color').value = color;
    renderUnitColorPicker(color);
}

function renderUnitDocsList(selectedIds) {
    const el = document.getElementById('unit-docs-list');
    if (!el) return;
    if (curriculumDocs.length === 0) {
        el.innerHTML = '<div style="font-size:0.72rem;color:var(--text-muted);padding:4px;">No curriculum docs uploaded yet.</div>';
        return;
    }
    el.innerHTML = curriculumDocs.map(d =>
        `<label class="unit-doc-item">
            <input type="checkbox" class="unit-doc-check" value="${d.id}" ${selectedIds.includes(d.id) ? 'checked' : ''}>
            <span>📄 ${d.name}</span>
        </label>`
    ).join('');
}

// Unit standards picker: see STANDARDS LIBRARY (v6.7.0) -- openStdPicker('unit-standards-picker')

// ── Save / Delete ─────────────────────────────────────────────────────────

document.getElementById('unit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const unitId = document.getElementById('unit-id').value;
    const docIds = Array.from(document.querySelectorAll('.unit-doc-check:checked')).map(cb => cb.value);

    const data = {
        name:        document.getElementById('unit-name').value.trim(),
        classId:     document.getElementById('unit-class').value || null,
        startDate:   document.getElementById('unit-start').value,
        endDate:     document.getElementById('unit-end').value,
        color:       document.getElementById('unit-color').value || UNIT_COLORS[0],
        description: document.getElementById('unit-description').value.trim(),
        standards:   document.getElementById('unit-standards').value.trim(),
        docIds,
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
    };

    if (data.endDate < data.startDate) { showToast('End date must be after start date.'); return; }

    showLoading();
    try {
        if (unitId) {
            await getYearPath().collection('units').doc(unitId).update(data);
            const idx = units.findIndex(u => u.id === unitId);
            if (idx >= 0) units[idx] = { ...units[idx], ...data };
        } else {
            const ref = await getYearPath().collection('units').add(data);
            units.push({ id: ref.id, ...data });
        }
        units.sort((a, b) => a.startDate.localeCompare(b.startDate));
        hideLoading();
        closeUnitModal();
        renderUnitMap();
        showToast(unitId ? '📐 Unit updated!' : '📐 Unit added!');
    } catch (err) {
        hideLoading();
        showToast('Error saving unit: ' + err.message);
    }
});

async function deleteUnit() {
    const unitId = document.getElementById('unit-id').value;
    if (!unitId || !await planyConfirm('Delete this unit?')) return;
    showLoading();
    try {
        await getYearPath().collection('units').doc(unitId).delete();
        units = units.filter(u => u.id !== unitId);
        hideLoading();
        closeUnitModal();
        renderUnitMap();
        showToast('Unit deleted.');
    } catch (err) {
        hideLoading();
        showToast('Error: ' + err.message);
    }
}

// ── Helper: find active unit for a given date + classId ───────────────────

function getActiveUnit(dateStr, classId) {
    return units.find(u =>
        u.startDate <= dateStr && u.endDate >= dateStr &&
        (!u.classId || u.classId === classId)
    ) || null;
}

// ============================================================
// COPY DAY TO DATE
// ============================================================

function openCopyDayPicker() {
    const picker = document.getElementById('copy-day-picker');
    if (!picker) return;
    picker.classList.remove('hidden');
    // Default to next school day
    const d = new Date(currentDayDate);
    d.setDate(d.getDate() + 1);
    // Skip weekends
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    document.getElementById('copy-day-date').value = formatDate(d);
}

function closeCopyDayPicker() {
    document.getElementById('copy-day-picker')?.classList.add('hidden');
    closeCopyWeekPicker();
    document.getElementById('unit-modal')?.classList.add('hidden');
    document.getElementById('curriculum-gen-modal')?.classList.add('hidden');
    document.getElementById('student-modal')?.classList.add('hidden');
    document.getElementById('assignment-modal')?.classList.add('hidden');
    document.getElementById('diff-modal')?.classList.add('hidden');
    document.getElementById('gc-modal')?.classList.add('hidden');
    document.getElementById('grade-settings-modal')?.classList.add('hidden');
    document.getElementById('attendance-modal')?.classList.add('hidden');
    document.getElementById('teams-modal')?.classList.add('hidden');
    document.getElementById('moodle-modal')?.classList.add('hidden');
    document.getElementById('sis-modal')?.classList.add('hidden');
    document.getElementById('comm-modal')?.classList.add('hidden');
    closeSeatPicker();
    document.getElementById('unit-standards-picker')?.classList.add('hidden');
}

async function executeCopyDay() {
    const targetDate = document.getElementById('copy-day-date')?.value;
    if (!targetDate) { showToast('Pick a date to copy to.'); return; }

    const sourceDate = formatDate(currentDayDate);
    if (targetDate === sourceDate) { showToast('Target date is the same as source.'); return; }

    const dayLessons = lessons.filter(l => l.date === sourceDate);
    if (dayLessons.length === 0) {
        showToast('No lessons on this day to copy.');
        return;
    }

    // Check conflicts
    const conflicts = dayLessons.filter(l =>
        lessons.some(ex => ex.date === targetDate && ex.classId === l.classId)
    );
    if (conflicts.length > 0) {
        const names = [...new Set(conflicts.map(l => {
            const cls = classes.find(c => c.id === l.classId);
            return cls ? cls.name : 'class';
        }))].join(', ');
        if (!await planyConfirm(`${conflicts.length} lesson(s) already exist on that date for: ${names}.\n\nCopy anyway?`)) return;
    }

    showLoading();
    try {
        const batch = db.batch();
        const newLessons = [];

        dayLessons.forEach(l => {
            const { id, updatedAt, ...fields } = l;
            const newData = { ...fields, date: targetDate, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            const ref = getYearPath().collection('lessons').doc();
            batch.set(ref, newData);
            newLessons.push({ id: ref.id, ...newData });
        });

        await batch.commit();
        newLessons.forEach(l => lessons.push(l));

        // Navigate to target date
        currentDayDate = new Date(targetDate + 'T00:00:00');
        currentDate = new Date(currentDayDate);
        currentWeekStart = getWeekStart(currentDayDate);

        renderCalendar();
        renderWeek();
        renderDayView();
        hideLoading();
        closeCopyDayPicker();

        const label = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        showToast('📋 ' + dayLessons.length + ' lesson' + (dayLessons.length !== 1 ? 's' : '') + ' copied to ' + label + '!');
    } catch (e) {
        hideLoading();
        showToast('Error: ' + e.message);
    }
}

// ============================================================
// COPY WEEK FORWARD
// ============================================================

function openCopyWeekPicker() {
    const picker = document.getElementById('copy-week-picker');
    if (!picker) return;
    picker.classList.remove('hidden');
    // Default to next week
    const nextWeek = addDays(currentWeekStart, 7);
    document.getElementById('copy-week-date').value = formatDate(nextWeek);
}

function closeCopyWeekPicker() {
    document.getElementById('copy-week-picker')?.classList.add('hidden');
}

async function executeCopyWeek() {
    const targetDateVal = document.getElementById('copy-week-date')?.value;
    if (!targetDateVal) { showToast('Pick a target date.'); return; }

    // Normalise: find the Monday (or Sunday if weekends shown) of the target week
    const targetAnyDay = new Date(targetDateVal + 'T00:00:00');
    const targetStart  = getWeekStart(targetAnyDay);

    // Don't copy to the same week
    if (formatDate(targetStart) === formatDate(currentWeekStart)) {
        showToast('Target week is the same as the source week.'); return;
    }

    const weekStart = new Date(currentWeekStart);
    // Same days the week view shows (v6.2.0): Sun–Sat is offsets -1..5 from
    // Monday, weekdays-only is 0..4. The old 0..6 loop copied Mon through
    // the NEXT week's Sunday and skipped this week's Sunday.
    const offsets = settings.hideWeekends === true ? [0, 1, 2, 3, 4] : [-1, 0, 1, 2, 3, 4, 5];
    const weekLessons = [];
    for (const d of offsets) {
        const dayDate = addDays(weekStart, d);
        const dateStr = formatDate(dayDate);
        lessons.filter(l => l.date === dateStr).forEach(l =>
            weekLessons.push({ ...l, _dayOffset: d })
        );
    }

    if (weekLessons.length === 0) { showToast('No lessons this week to copy.'); return; }

    // Check for conflicts in target week
    const targetDates = {};
    offsets.forEach(d => { targetDates[d] = formatDate(addDays(targetStart, d)); });
    const conflicts = weekLessons.filter(l =>
        lessons.some(ex => ex.date === targetDates[l._dayOffset] && ex.classId === l.classId)
    );

    if (conflicts.length > 0) {
        const names = [...new Set(conflicts.map(l => {
            const cls = classes.find(c => c.id === l.classId);
            return cls ? cls.name : 'Unknown';
        }))].join(', ');
        if (!await planyConfirm(`${conflicts.length} lesson(s) already exist that week for: ${names}.\n\nCopy anyway?`)) return;
    }

    showLoading();
    try {
        const batch     = db.batch();
        const newLessons = [];
        weekLessons.forEach(l => {
            const { id, _dayOffset, updatedAt, ...fields } = l;
            const data = { ...fields, date: targetDates[_dayOffset], updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            const ref  = getYearPath().collection('lessons').doc();
            batch.set(ref, data);
            newLessons.push({ id: ref.id, ...data });
        });
        await batch.commit();
        newLessons.forEach(l => lessons.push(l));

        // Navigate to the target week (all three anchors)
        jumpToDate(targetStart);
        renderAfterJump();
        hideLoading();
        closeCopyWeekPicker();

        const label = targetStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        showToast(`📋 ${weekLessons.length} lesson${weekLessons.length!==1?'s':''} copied to week of ${label}!`);
    } catch (e) {
        hideLoading();
        showToast('Error: ' + e.message);
    }
}



// ============================================================
// 📷 SCAN & IMPORT
// ============================================================

let _scanMode = 'schedule'; // 'schedule' | 'lessons'
let _scanBase64 = null;     // base64 string (no data: prefix)
let _scanMime   = 'image/jpeg';
let _scanItems  = [];       // extracted items from Claude

const SCAN_COLORS = [
    '#FF6B9D','#9D4EDD','#00D4FF','#FF8C42','#06D6A0',
    '#FFD93D','#4CC9F0','#52B788','#C77DFF','#F4A261'
];

function openScanModal(mode) {
    _scanMode = mode || 'schedule';
    _scanBase64 = null;
    _scanItems  = [];

    const title = document.getElementById('scan-modal-title');
    const instr = document.getElementById('scan-instructions');
    if (title) title.textContent = mode === 'schedule'
        ? '📅 Scan Weekly Schedule'
        : '📋 Scan Lesson Plans';
    if (instr) instr.textContent = mode === 'schedule'
        ? 'Upload a photo of your weekly schedule — handwritten, printed, or a whiteboard shot. Claude will extract class names, subjects, rooms, and time slots.'
        : 'Upload a photo of one or more lesson plan pages. Claude will extract lesson titles, dates, objectives, activities, and materials, and match them to your existing classes.';

    document.getElementById('scan-step-upload').classList.remove('hidden');
    document.getElementById('scan-step-review').classList.add('hidden');
    resetScanUpload();
    document.getElementById('scan-modal').classList.remove('hidden');
}

function closeScanModal() {
    document.getElementById('scan-modal').classList.add('hidden');
    _scanBase64 = null;
    _scanItems  = [];
}

function resetScanUpload() {
    _scanBase64 = null;
    document.getElementById('scan-file-input').value = '';
    document.getElementById('scan-preview-wrap').classList.add('hidden');
    document.getElementById('scan-preview-img').src = '';
    document.getElementById('scan-drop-zone').classList.remove('hidden');
    document.getElementById('scan-upload-status').textContent = '';
    document.getElementById('scan-analyse-btn').disabled = true;
}

function backToScanUpload() {
    document.getElementById('scan-step-review').classList.add('hidden');
    document.getElementById('scan-step-upload').classList.remove('hidden');
}

function onScanFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        document.getElementById('scan-upload-status').textContent = '⚠️ File too large — please use an image under 10 MB.';
        return;
    }
    _scanMime = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = ev => {
        const dataUrl = ev.target.result;
        // Strip the data:...;base64, prefix
        _scanBase64 = dataUrl.split(',')[1];
        const img = document.getElementById('scan-preview-img');
        img.src = dataUrl;
        document.getElementById('scan-preview-wrap').classList.remove('hidden');
        document.getElementById('scan-drop-zone').classList.add('hidden');
        document.getElementById('scan-upload-status').textContent = '';
        document.getElementById('scan-analyse-btn').disabled = false;
    };
    reader.readAsDataURL(file);
}

// Drag-and-drop on drop zone
(function() {
    const dz = document.getElementById('scan-drop-zone');
    if (!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const inp = document.getElementById('scan-file-input');
            const dt = new DataTransfer();
            dt.items.add(file);
            inp.files = dt.files;
            onScanFileSelected({ target: inp });
        }
    });
})();

async function runScanAnalysis() {
    if (!_scanBase64) return;
    if (!hasEffectiveAiKey()) { showToast('Add your AI API key in AI & Settings first.'); return; }

    const btn = document.getElementById('scan-analyse-btn');
    const statusEl = document.getElementById('scan-upload-status');
    btn.disabled = true;
    statusEl.innerHTML = '<span class="scan-spinner"></span> Claude is reading your image…';

    const prompt = _scanMode === 'schedule'
        ? `You are reading a teacher's weekly class schedule from an image. Extract every class/subject block you can see.

Return ONLY a JSON array. Each object must have:
{
  "name": "class name (e.g. BenchMark, Reading, Math)",
  "subject": "subject area or empty string",
  "room": "room name/number or empty string",
  "schedule": {
    "mon": [{"start":"HH:MM","end":"HH:MM"}],
    "tue": [...],
    "wed": [...],
    "thu": [...],
    "fri": [...]
  },
  "everyOtherWeek": false,
  "notes": "any extra notes or empty string"
}
Only include days the class actually appears. Use 24-hour HH:MM for times. If only one slot per day, the array has one object. If a class appears at two different times on the same day, include two objects in that day's array. Return [] if nothing found. NO markdown, NO explanation — JSON only.`

        : `You are reading a teacher's lesson plan page or pages from an image. Extract every lesson you can identify.

Return ONLY a JSON array. Each object must have:
{
  "className": "the class or subject this lesson belongs to (match to existing classes if possible)",
  "date": "YYYY-MM-DD or empty string if not readable",
  "title": "lesson title",
  "subject": "subject area or empty string",
  "standards": "standards or objectives or empty string",
  "flow": "lesson flow or procedure or empty string",
  "materials": "materials list or empty string",
  "activities": "activities description or empty string",
  "notes": "any other notes"
}
Return [] if nothing found. NO markdown, NO explanation — JSON only.`;

    try {
        const raw = (await callAIText({
            prompt,
            tier: 'quality',
            maxTokens: 4096,
            imageBase64: _scanBase64,
            imageMediaType: _scanMime
        })).replace(/```json|```/g, '').trim();

        let parsed;
        try { parsed = JSON.parse(raw); } catch(e) { throw new Error('Could not parse Claude\'s response. Try a clearer photo.'); }

        if (!Array.isArray(parsed) || parsed.length === 0) {
            statusEl.textContent = '⚠️ Claude couldn\'t find any items in this image. Try a clearer or closer photo.';
            btn.disabled = false;
            return;
        }

        _scanItems = parsed;
        statusEl.textContent = '';
        btn.disabled = false;
        showScanReview();

    } catch(err) {
        statusEl.textContent = '❌ ' + (err.message || 'Something went wrong. Please try again.');
        btn.disabled = false;
    }
}

function showScanReview() {
    // Copy image to review thumb
    const thumb = document.getElementById('scan-review-thumb');
    if (thumb) thumb.src = document.getElementById('scan-preview-img').src;

    document.getElementById('scan-step-upload').classList.add('hidden');
    document.getElementById('scan-step-review').classList.remove('hidden');

    const list = document.getElementById('scan-review-list');
    list.innerHTML = '';

    if (_scanMode === 'schedule') {
        _scanItems.forEach((item, idx) => {
            // Detect conflict with existing class name
            const existingMatch = classes.find(c => c.name.toLowerCase() === (item.name||'').toLowerCase());
            const conflictBadge = existingMatch
                ? '<span class="scan-conflict-badge">⚠️ class exists — will update</span>'
                : '';

            // Build schedule summary for display
            const DOW = ['mon','tue','wed','thu','fri'];
            const DOW_LABEL = {mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri'};
            const schedSummary = DOW.filter(d => item.schedule?.[d]?.length)
                .map(d => {
                    const slots = item.schedule[d];
                    const times = slots.map(s => (s.start||'') + (s.end ? '–'+s.end : '')).join(' & ');
                    return DOW_LABEL[d] + (times ? ' ' + times : '');
                }).join(', ');

            const colorIdx = idx % SCAN_COLORS.length;
            const color = SCAN_COLORS[colorIdx];

            const card = document.createElement('div');
            card.className = 'scan-review-card';
            card.dataset.idx = idx;
            card.innerHTML = `
                <input type="checkbox" class="scan-review-check" checked onchange="this.closest('.scan-review-card').classList.toggle('excluded',!this.checked)">
                <div class="scan-review-body">
                    <div class="scan-review-type">Class ${conflictBadge}</div>
                    <div class="scan-review-fields">
                        <div class="scan-review-row">
                            <span class="scan-review-label">Name</span>
                            <input class="scan-review-input" data-field="name" value="${escHtml(item.name||'')}" placeholder="Class name">
                            <input type="color" value="${color}" data-field="color" style="width:28px;height:28px;padding:2px;border:none;border-radius:4px;cursor:pointer;flex-shrink:0;" title="Pick color">
                        </div>
                        <div class="scan-review-row">
                            <span class="scan-review-label">Subject</span>
                            <input class="scan-review-input" data-field="subject" value="${escHtml(item.subject||'')}" placeholder="Subject">
                        </div>
                        <div class="scan-review-row">
                            <span class="scan-review-label">Room</span>
                            <input class="scan-review-input" data-field="room" value="${escHtml(item.room||'')}" placeholder="Room">
                        </div>
                        <div class="scan-review-row">
                            <span class="scan-review-label">Schedule</span>
                            <span style="font-size:0.75rem;color:var(--text-secondary);flex:1;">${escHtml(schedSummary||'No schedule detected')}</span>
                        </div>
                        ${item.notes ? `<div class="scan-review-row"><span class="scan-review-label">Notes</span><span style="font-size:0.75rem;color:var(--text-muted);flex:1;">${escHtml(item.notes)}</span></div>` : ''}
                    </div>
                </div>`;
            list.appendChild(card);
        });
    } else {
        // Lesson mode
        _scanItems.forEach((item, idx) => {
            // Try to match className to existing class
            const matchedCls = classes.find(c =>
                c.name.toLowerCase().includes((item.className||'').toLowerCase()) ||
                (item.className||'').toLowerCase().includes(c.name.toLowerCase())
            );
            const classOptions = `<option value="">— unassigned —</option>`
                + classes.map(c => `<option value="${c.id}" ${matchedCls?.id === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('');

            const card = document.createElement('div');
            card.className = 'scan-review-card';
            card.dataset.idx = idx;
            card.innerHTML = `
                <input type="checkbox" class="scan-review-check" checked onchange="this.closest('.scan-review-card').classList.toggle('excluded',!this.checked)">
                <div class="scan-review-body">
                    <div class="scan-review-type">Lesson</div>
                    <div class="scan-review-fields">
                        <div class="scan-review-row">
                            <span class="scan-review-label">Title</span>
                            <input class="scan-review-input" data-field="title" value="${escHtml(item.title||'')}" placeholder="Lesson title">
                        </div>
                        <div class="scan-review-row">
                            <span class="scan-review-label">Class</span>
                            <select class="scan-review-input" data-field="classId" style="padding:3px 5px;">${classOptions}</select>
                        </div>
                        <div class="scan-review-row">
                            <span class="scan-review-label">Date</span>
                            <input class="scan-review-input" data-field="date" type="date" value="${item.date||''}" style="width:140px;">
                        </div>
                        ${item.standards ? `<div class="scan-review-row"><span class="scan-review-label">Standards</span><input class="scan-review-input" data-field="standards" value="${escHtml(item.standards)}"></div>` : ''}
                        ${item.materials ? `<div class="scan-review-row"><span class="scan-review-label">Materials</span><input class="scan-review-input" data-field="materials" value="${escHtml(item.materials)}"></div>` : ''}
                        ${item.activities ? `<div class="scan-review-row"><span class="scan-review-label">Activities</span><input class="scan-review-input" data-field="activities" value="${escHtml(item.activities)}"></div>` : ''}
                        ${item.flow ? `<div class="scan-review-row"><span class="scan-review-label">Flow</span><input class="scan-review-input" data-field="flow" value="${escHtml(item.flow)}"></div>` : ''}
                    </div>
                </div>`;
            list.appendChild(card);
        });
    }

    const count = _scanItems.length;
    document.getElementById('scan-review-status').textContent =
        `Found ${count} item${count !== 1 ? 's' : ''} — review and edit before importing.`;
    document.getElementById('scan-import-btn').textContent =
        `✓ Import ${count} item${count !== 1 ? 's' : ''}`;
}

function escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// For a value passed as an argument inside an inline on*="..." handler.
// HTML-escaping alone is not enough there: the browser decodes &#39; back
// to ' before the JS runs. JSON.stringify makes a valid JS string literal,
// then escHtml makes it safe inside the double-quoted attribute.
function jsArg(v) { return escHtml(JSON.stringify(v === null || v === undefined ? '' : String(v))); }
// Only allow image URLs we expect (https or an inline data: image).
function safeImgUrl(u) {
    const v = String(u || '').trim();
    return /^https:\/\//i.test(v) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v) ? v : '';
}

async function executeScanImport() {
    const cards = document.querySelectorAll('#scan-review-list .scan-review-card');
    const statusEl = document.getElementById('scan-review-status');
    const importBtn = document.getElementById('scan-import-btn');

    // Collect current values from the review cards
    const items = [];
    cards.forEach(card => {
        const checked = card.querySelector('.scan-review-check')?.checked;
        if (!checked) return;
        const idx = parseInt(card.dataset.idx);
        const original = _scanItems[idx];
        const fields = {};
        card.querySelectorAll('[data-field]').forEach(el => {
            fields[el.dataset.field] = el.value.trim();
        });
        // Color picker (schedule mode)
        const colorPicker = card.querySelector('input[type="color"]');
        if (colorPicker) fields.color = colorPicker.value;
        items.push({ original, fields });
    });

    if (items.length === 0) { showToast('Nothing selected to import.'); return; }

    importBtn.disabled = true;
    statusEl.innerHTML = '<span class="scan-spinner"></span> Saving…';

    try {
        const yearPath = getYearPath();
        let created = 0;
        let updated = 0;

        if (_scanMode === 'schedule') {
            for (const { original, fields } of items) {
                const name = fields.name || original.name || 'Untitled Class';
                // Build schedule from original (schedule editing happens in class modal, not here)
                const schedule = {};
                const DOW = ['mon','tue','wed','thu','fri'];
                DOW.forEach(d => {
                    const slots = original.schedule?.[d];
                    if (!slots || slots.length === 0) return;
                    if (slots.length === 1) {
                        schedule[d] = { start: slots[0].start || '', end: slots[0].end || '' };
                    } else {
                        schedule[d] = slots.map(s => ({ start: s.start || '', end: s.end || '' }));
                    }
                });

                const classData = {
                    name,
                    subject: fields.subject || original.subject || '',
                    room:    fields.room    || original.room    || '',
                    color:   fields.color  || SCAN_COLORS[0],
                    curriculum: '',
                    schedule,
                    everyOtherWeek: original.everyOtherWeek || false,
                    startingWeek: null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // Check for existing class with same name — update instead of duplicate
                const existing = classes.find(c => c.name.toLowerCase() === name.toLowerCase());
                if (existing) {
                    // v6.2.0: only update what the scan produced. This used to
                    // blank the class's curriculum and starting week and
                    // overwrite its colour, subject and room with defaults.
                    const upd = {
                        name,
                        subject: fields.subject || original.subject || existing.subject || '',
                        room:    fields.room    || original.room    || existing.room    || '',
                        color:   fields.color   || existing.color   || SCAN_COLORS[0],
                        schedule,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (original.everyOtherWeek) upd.everyOtherWeek = true;
                    await yearPath.collection('classes').doc(existing.id).update(upd);
                    const i = classes.findIndex(c => c.id === existing.id);
                    if (i >= 0) classes[i] = { ...classes[i], ...upd };
                    updated++;
                } else {
                    classData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const ref = await yearPath.collection('classes').add(classData);
                    classes.push({ id: ref.id, ...classData });
                    created++;
                }
            }

            renderClasses();
            renderCalendar();
            renderWeek();
            updateClassDropdown();
            const msg = [created && `${created} class${created>1?'es':''} created`, updated && `${updated} updated`].filter(Boolean).join(', ');
            statusEl.textContent = `✅ Done — ${msg}!`;
            showToast(`📷 Scan imported: ${msg}`);

        } else {
            // Lesson mode
            for (const { original, fields } of items) {
                const title = fields.title || original.title || 'Untitled Lesson';
                const classId = fields.classId || null;
                const date = fields.date || formatDate(new Date());
                if (!date) continue;

                const lessonData = {
                    title,
                    date,
                    classId,
                    slotIndex: 0,
                    subject:    fields.subject    || original.subject    || '',
                    standards:  fields.standards  || original.standards  || '',
                    flow:       fields.flow        || original.flow        || '',
                    materials:  fields.materials  || original.materials  || '',
                    activities: fields.activities || original.activities || '',
                    duration: 45,
                    attachments: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                const ref = await yearPath.collection('lessons').add(lessonData);
                lessons.push({ id: ref.id, ...lessonData });
                created++;
            }

            renderCalendar();
            renderWeek();
            statusEl.textContent = `✅ ${created} lesson${created>1?'s':''} imported!`;
            showToast(`📷 Scan imported ${created} lesson${created>1?'s':''}`);
        }

        importBtn.disabled = false;
        setTimeout(() => closeScanModal(), 1800);

    } catch(err) {
        console.error('Scan import error:', err);
        statusEl.textContent = '❌ Import failed: ' + (err.message || 'Unknown error');
        importBtn.disabled = false;
    }
}


// ============================================================
// 🚀 YEAR SETUP CHECKLIST
// ============================================================

const CHECKLIST_STEPS = [
    {
        id: 'school-year',
        icon: '🏫',
        title: 'Set your school year',
        hint: 'Select the correct year so all your data is scoped correctly.',
        optional: false,
        action: () => {
            // Scroll to school year selector in year setup bar
            document.getElementById('school-year')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementById('school-year')?.focus();
        },
        isDone: () => {
            // Done if school year is set to something reasonable (not default empty)
            return !!(settings.schoolYear);
        }
    },
    {
        id: 'first-last-day',
        icon: '📅',
        title: 'Add first & last day',
        hint: 'Mark your first and last day of school so the year calendar knows its boundaries.',
        optional: false,
        action: () => {
            // Open the event modal directly (works from any view)
            switchView('year');
            setTimeout(() => {
                const modal = document.getElementById('event-modal');
                if (modal) {
                    modal.classList.remove('hidden');
                    const typeSel = document.getElementById('event-type');
                    if (typeSel) typeSel.value = 'first-day';
                } else {
                    document.getElementById('day-view-add-event-btn')?.click();
                }
            }, 250);
        },
        isDone: () => {
            return events.some(e => e.type === 'first-day') && events.some(e => e.type === 'last-day');
        }
    },
    {
        id: 'breaks',
        icon: '🏖️',
        title: 'Add breaks & holidays',
        hint: 'Add winter break, spring break, and PD days so no lessons land on off days.',
        optional: false,
        action: () => {
            // Scroll to the add-break form in the year setup bar
            switchView('year');
            setTimeout(() => {
                const breakName = document.getElementById('break-name');
                if (breakName) {
                    breakName.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    breakName.focus();
                }
            }, 200);
        },
        isDone: () => {
            const hasBreakEvents = events.some(e =>
                ['break', 'holiday', 'no-school', 'professional-learning', 'grading'].includes(e.type)
            );
            return (settings.breaks && settings.breaks.length > 0) || hasBreakEvents;
        }
    },
    {
        id: 'classes',
        icon: '🎓',
        title: 'Add your classes',
        hint: 'Create at least one class with a name, subject, color, and weekly schedule.',
        optional: false,
        action: () => {
            switchView('classes');
            setTimeout(() => document.getElementById('add-class-btn')?.click(), 200);
        },
        isDone: () => classes.length > 0
    },
    {
        id: 'curriculum',
        icon: '📚',
        title: 'Upload curriculum',
        hint: 'Upload PDFs, word lists, or lesson guides to power AI Lesson Fill and Student Packets.',
        optional: true,
        action: () => {
            switchView('settings');
            setTimeout(() => {
                const accord = document.getElementById('accord-curriculum');
                if (accord) { accord.open = true; accord.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            }, 300);
        },
        isDone: () => typeof curriculumDocs !== 'undefined' && curriculumDocs.length > 0
    },
    {
        id: 'api-key',
        icon: '🔑',
        title: 'Add your API key',
        hint: 'Paste an API key from Anthropic, OpenAI, or Google Gemini to enable all AI features — lesson fill, scan, quiz generator.',
        optional: true,
        action: () => {
            switchView('settings');
            setTimeout(() => {
                const keyEl = document.getElementById('ai-api-key');
                if (keyEl) { keyEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); keyEl.focus(); }
            }, 300);
        },
        isDone: () => hasEffectiveAiKey()
    }
];

// The dismissal used to live only in a per-school-year localStorage key, so it
// came back on a new school year, on another device, in the installed app vs the
// browser, and any time site data was cleared. It is now an account-level flag
// stored with the user's settings, with localStorage kept as a fast mirror.
const CHECKLIST_DISMISS_KEY = 'checklist_dismissed_all';

function isChecklistDismissed() {
    if (settings.checklistDismissed === true) return true;
    try {
        if (localStorage.getItem(CHECKLIST_DISMISS_KEY) === 'true') return true;
        // legacy per-year key
        if (localStorage.getItem('checklist_dismissed_' + (settings.schoolYear || '')) === 'true') return true;
    } catch (e) {}
    return false;
}

async function persistChecklistDismissed(dismissed) {
    settings.checklistDismissed = dismissed;
    try {
        if (dismissed) localStorage.setItem(CHECKLIST_DISMISS_KEY, 'true');
        else localStorage.removeItem(CHECKLIST_DISMISS_KEY);
        localStorage.removeItem('checklist_dismissed_' + (settings.schoolYear || ''));
    } catch (e) {}
    try {
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid)
                .collection('settings').doc('schoolYear')
                .set({ checklistDismissed: dismissed }, { merge: true });
        }
    } catch (e) { console.warn('persistChecklistDismissed:', e.message); }
}

function getChecklistState() {
    const dismissed = isChecklistDismissed();
    const steps = CHECKLIST_STEPS.map(step => ({
        ...step,
        done: step.isDone()
    }));
    const required = steps.filter(s => !s.optional);
    const requiredDone = required.filter(s => s.done).length;
    const allRequiredDone = requiredDone === required.length;
    const totalDone = steps.filter(s => s.done).length;
    return { steps, required, requiredDone, allRequiredDone, totalDone, dismissed };
}

function updateYearChecklist() {
    const card = document.getElementById('year-checklist');
    const dot  = document.getElementById('year-setup-dot');
    if (!card) return;

    const state = getChecklistState();

    // Hide if dismissed AND all required done
    if (state.dismissed && state.allRequiredDone) {
        card.classList.add('hidden');
        if (dot) dot.classList.add('hidden');
        return;
    }

    // Hide if user dismissed and hasn't visited year view yet
    if (state.dismissed) {
        card.classList.add('hidden');
        // Keep dot visible if required steps remain
        if (dot) {
            state.allRequiredDone ? dot.classList.add('hidden') : dot.classList.remove('hidden');
        }
        return;
    }

    // Show card
    card.classList.remove('hidden');
    card.classList.toggle('all-done', state.allRequiredDone);

    // Update progress
    const progressEl = document.getElementById('checklist-progress-bar');
    const progressText = document.getElementById('checklist-progress-text');
    const pct = Math.round((state.requiredDone / state.required.length) * 100);
    if (progressEl) progressEl.style.width = pct + '%';
    if (progressText) {
        progressText.textContent = state.allRequiredDone
            ? '✓ All required steps complete!'
            : `${state.requiredDone} of ${state.required.length} required steps done`;
        progressText.style.color = state.allRequiredDone ? '#06D6A0' : '';
    }

    // Render steps
    const stepsEl = document.getElementById('checklist-steps');
    if (stepsEl) {
        stepsEl.innerHTML = state.steps.map(step => `
            <div class="checklist-step ${step.done ? 'done' : ''} ${step.optional ? 'optional' : ''}"
                 data-step-id="${step.id}" role="button" tabindex="0"
                 title="${step.done ? 'Done' : 'Click to set up'}">
                <div class="checklist-step-check">${step.done ? '✓' : ''}</div>
                <div class="checklist-step-body">
                    <div class="checklist-step-title">
                        ${step.icon} ${step.title}
                        ${step.optional ? '<span class="checklist-optional-badge">optional</span>' : ''}
                    </div>
                    <div class="checklist-step-hint">${step.hint}</div>
                </div>
                ${!step.done ? '<span class="checklist-step-arrow">›</span>' : ''}
            </div>
        `).join('');

        // Wire click handlers
        stepsEl.querySelectorAll('.checklist-step:not(.done)').forEach(el => {
            const stepId = el.dataset.stepId;
            const step = CHECKLIST_STEPS.find(s => s.id === stepId);
            if (step) {
                el.addEventListener('click', () => step.action());
                el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') step.action(); });
            }
        });
    }

    // Nav dot — show while required steps remain
    if (dot) {
        state.allRequiredDone ? dot.classList.add('hidden') : dot.classList.remove('hidden');
    }

    // Auto-dismiss card (not dot) once all required done and user has seen it
    if (state.allRequiredDone) {
        setTimeout(() => {
            if (state.allRequiredDone) {
                card.classList.add('all-done');
            }
        }, 500);
    }
}

function dismissChecklist() {
    persistChecklistDismissed(true);
    document.getElementById('year-checklist')?.classList.add('hidden');
    // Keep dot if required steps not done
    const state = getChecklistState();
    const dot = document.getElementById('year-setup-dot');
    if (dot) {
        state.allRequiredDone ? dot.classList.add('hidden') : dot.classList.remove('hidden');
    }
}

// Clicking the nav dot re-shows the checklist
document.getElementById('year-setup-dot')?.addEventListener('click', (e) => {
    e.stopPropagation();
    persistChecklistDismissed(false);
    switchView('year');
    setTimeout(updateYearChecklist, 100);
});


// ============================================================
// 🏫 PRINCIPAL / STAFF VIEW
// ============================================================

let principalLinkedTeachers = [];   // accepted links where I am the principal
let principalPendingLinks    = [];   // pending link requests I sent as principal
let teacherLinkRequests      = [];   // incoming requests asking ME (teacher) to link
let _previewTeacher          = null; // teacher object being previewed
let _previewTab              = 'year';
// Saved copies of the teacher's data while previewing
let _savedClasses = null, _savedLessons = null, _savedEvents = null, _savedSettings = null;
let _principalCommentContext = null; // { teacherUid, lessonId, lessonTitle, date }

// ── Helpers ──────────────────────────────────────────────────

function isPrincipal() {
    return userProfile?.role === 'admin' || settings.userProfile?.role === 'admin';
}

function initPrincipalView() {
    // Show/hide Staff nav item based on role
    const navItem = document.getElementById('principal-nav-item');
    if (navItem) navItem.classList.toggle('hidden', !isPrincipal());

    if (!isPrincipal()) return;

    loadPrincipalData();
}

// ── Data loading ──────────────────────────────────────────────

async function loadPrincipalData() {
    if (!currentUser || !isPrincipal()) return;
    try {
        // Links where I am principal (accepted)
        const acceptedSnap = await db.collection('principalLinks')
            .where('principalUid', '==', currentUser.uid)
            .where('status', '==', 'accepted')
            .get();
        principalLinkedTeachers = acceptedSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Links I sent that are still pending
        const pendingSnap = await db.collection('principalLinks')
            .where('principalUid', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        principalPendingLinks = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Enrich teacher profiles
        await Promise.all(principalLinkedTeachers.map(async link => {
            try {
                const prof = await db.collection('users').doc(link.teacherUid).get();
                if (prof.exists) Object.assign(link, { profile: prof.data() });
            } catch(e) {}
        }));

        renderPrincipalDashboard();
    } catch(e) {
        console.error('loadPrincipalData:', e);
    }
}

// ── Teacher loads incoming link requests (for their profile) ──

async function loadTeacherLinkRequests() {
    if (!currentUser) return;
    try {
        const snap = await db.collection('principalLinks')
            .where('teacherUid', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        teacherLinkRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTeacherLinkRequests();
    } catch(e) { console.error('loadTeacherLinkRequests:', e); }
}

function renderTeacherLinkRequests() {
    const container = document.getElementById('teacher-link-requests-section');
    if (!container) return;
    if (teacherLinkRequests.length === 0) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    const inner = document.getElementById('teacher-link-requests-inner');
    if (!inner) return;
    inner.innerHTML = teacherLinkRequests.map(req => `
        <div class="principal-link-request">
            <span>🏫 <strong>${escHtml(req.principalName || req.principalEmail)}</strong> wants to view your Plany</span>
            <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="btn btn-primary btn-sm" onclick="acceptPrincipalLink('${req.id}')">Accept</button>
                <button class="btn btn-ghost btn-sm" onclick="declinePrincipalLink('${req.id}')">Decline</button>
            </div>
        </div>`).join('');
}

async function acceptPrincipalLink(linkId) {
    try {
        await db.collection('principalLinks').doc(linkId).update({ status: 'accepted', acceptedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Principal link accepted ✓');
        loadTeacherLinkRequests();
    } catch(e) { showToast('Error accepting link'); }
}

async function declinePrincipalLink(linkId) {
    try {
        await db.collection('principalLinks').doc(linkId).update({ status: 'declined' });
        showToast('Link request declined');
        loadTeacherLinkRequests();
    } catch(e) { showToast('Error declining link'); }
}

// ── Send link request (principal → teacher) ───────────────────

async function sendTeacherLinkRequest() {
    const emailEl = document.getElementById('link-teacher-email');
    const statusEl = document.getElementById('link-teacher-status');
    const email = emailEl?.value.trim().toLowerCase();
    if (!email) { if(statusEl) statusEl.textContent = 'Please enter an email.'; return; }
    if (statusEl) statusEl.innerHTML = '<span class="scan-spinner"></span> Looking up teacher…';

    try {
        // Find teacher by email in users collection
        const snap = await db.collection('users').where('email', '==', email).limit(1).get();
        if (snap.empty) {
            if (statusEl) statusEl.textContent = '❌ No Plany account found with that email.';
            return;
        }
        const teacherDoc = snap.docs[0];
        const teacherUid = teacherDoc.id;
        const teacherData = teacherDoc.data();

        if (teacherUid === currentUser.uid) {
            if (statusEl) statusEl.textContent = '❌ You can\'t link yourself.';
            return;
        }

        // Check not already linked
        const existing = await db.collection('principalLinks')
            .where('principalUid', '==', currentUser.uid)
            .where('teacherUid', '==', teacherUid)
            .limit(1).get();
        if (!existing.empty) {
            const st = existing.docs[0].data().status;
            if (statusEl) statusEl.textContent = st === 'accepted' ? '✓ Already linked.' : '⏳ Request already pending.';
            return;
        }

        const linkId = currentUser.uid + '_' + teacherUid;
        await db.collection('principalLinks').doc(linkId).set({
            principalUid: currentUser.uid,
            principalEmail: currentUser.email,
            principalName: userProfile.username || userProfile.displayName || currentUser.email,
            teacherUid,
            teacherEmail: email,
            teacherName: teacherData.username || teacherData.displayName || email,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (statusEl) statusEl.innerHTML = '✅ Request sent! The teacher will see it in their profile.';
        if (emailEl) emailEl.value = '';
        loadPrincipalData();
    } catch(e) {
        console.error('sendTeacherLinkRequest:', e);
        if (statusEl) statusEl.textContent = '❌ Error: ' + e.message;
    }
}

// ── Remove a link ─────────────────────────────────────────────

async function removePrincipalLink(linkId) {
    if (!await planyConfirm('Remove this teacher link? The teacher will no longer be visible in your Staff view.')) return;
    try {
        await db.collection('principalLinks').doc(linkId).delete();
        showToast('Link removed');
        loadPrincipalData();
    } catch(e) { showToast('Error removing link'); }
}

// ── Render dashboard ──────────────────────────────────────────

function renderPrincipalDashboard() {
    // Pending section
    const pendingSection = document.getElementById('principal-pending-list');
    const pendingInner   = document.getElementById('principal-pending-inner');
    if (pendingSection && pendingInner) {
        if (principalPendingLinks.length > 0) {
            pendingSection.classList.remove('hidden');
            pendingInner.innerHTML = principalPendingLinks.map(link => `
                <div class="principal-link-request">
                    <span>⏳ Waiting for <strong>${escHtml(link.teacherName || link.teacherEmail)}</strong> to accept</span>
                    <button class="btn btn-ghost btn-sm" onclick="removePrincipalLink('${link.id}')">Cancel</button>
                </div>`).join('');
        } else {
            pendingSection.classList.add('hidden');
        }
    }

    // Empty / grid
    const emptyEl = document.getElementById('principal-teachers-empty');
    const gridEl  = document.getElementById('principal-teachers-grid');
    if (!emptyEl || !gridEl) return;

    if (principalLinkedTeachers.length === 0) {
        emptyEl.classList.remove('hidden');
        gridEl.innerHTML = '';
        return;
    }
    emptyEl.classList.add('hidden');

    gridEl.innerHTML = principalLinkedTeachers.map(link => {
        const p = link.profile || {};
        const name = p.username || p.displayName || link.teacherEmail;
        const grade = p.grade ? `Grade ${p.grade}` : '';
        const school = p.school || '';
        const avatarHtml = p.profilePicture
            ? `<img src="${escHtml(safeImgUrl(p.profilePicture))}" alt="">`
            : (name ? escHtml(name[0].toUpperCase()) : '👤');
        return `
        <div class="principal-teacher-card" onclick="openTeacherPreview('${link.teacherUid}',${jsArg(name)})">
            <span class="ptc-status-badge">Linked</span>
            <div class="ptc-header">
                <div class="ptc-avatar">${typeof avatarHtml === 'string' && avatarHtml.startsWith('<') ? avatarHtml : '<span>' + avatarHtml + '</span>'}</div>
                <div>
                    <div class="ptc-name">${escHtml(name)}</div>
                    <div class="ptc-meta">${escHtml([grade, school].filter(Boolean).join(' · '))}</div>
                </div>
            </div>
            <div class="ptc-actions" onclick="event.stopPropagation()">
                <button class="btn btn-primary btn-sm" onclick="openTeacherPreview('${link.teacherUid}',${jsArg(name)})">👁 View Plany</button>
                <button class="btn btn-ghost btn-sm" onclick="openPrincipalCommentForTeacher('${link.teacherUid}',${jsArg(name)})">💬 Comment</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--text-muted);" onclick="removePrincipalLink('${link.id}')" title="Unlink this teacher">🔗 Unlink Teacher</button>
            </div>
        </div>`;
    }).join('');
}

// ── Teacher preview ───────────────────────────────────────────

async function openTeacherPreview(teacherUid, teacherName) {
    const banner  = document.getElementById('principal-preview-banner');
    const dash    = document.getElementById('principal-dashboard');
    const preview = document.getElementById('principal-teacher-view');
    const nameEl  = document.getElementById('ppb-teacher-name');

    // Remember the principal's own dates to restore on exit (v6.2.0).
    if (!_previewTeacher) {
        window._prePreviewAnchors = { cd: new Date(currentDate), ws: new Date(currentWeekStart), dd: new Date(currentDayDate) };
    }
    _previewTeacher = { uid: teacherUid, name: teacherName };

    if (nameEl) nameEl.textContent = teacherName;
    if (banner)  banner.classList.remove('hidden');
    if (dash)    dash.classList.add('hidden');
    if (preview) preview.classList.remove('hidden');

    // Populate year selector for this teacher and load the TEACHER's own year
    // (never fall back to the principal's own school year).
    const resolvedYear = await populatePrincipalYearSelect(teacherUid);
    const yearSelect = document.getElementById('ppb-year-select');
    const year = yearSelect?.value || resolvedYear || settings.schoolYear;
    await loadTeacherDataForPreview(teacherUid, year);
    switchPrincipalTab('year');
}

async function populatePrincipalYearSelect(teacherUid) {
    const sel = document.getElementById('ppb-year-select');
    if (!sel) return null;

    // The teacher's OWN current school year is authoritative (a real settings
    // doc). We must NOT fall back to the principal's own school year — that's
    // what caused a linked principal to load the wrong year and see no lessons.
    let currentYear = null;
    try {
        const tset = await db.collection('users').doc(teacherUid)
            .collection('settings').doc('schoolYear').get();
        if (tset.exists && tset.data().schoolYear) currentYear = tset.data().schoolYear;
    } catch (e) { /* ignore */ }

    // Any materialized year docs (older years become listable once opened in
    // the new version). Phantom years won't appear here, but currentYear covers
    // the important case.
    let years = [];
    try {
        const yearsSnap = await db.collection('users').doc(teacherUid).collection('years').get();
        years = yearsSnap.docs.map(d => d.id);
    } catch (e) { /* ignore */ }

    if (currentYear && !years.includes(currentYear)) years.push(currentYear);
    years = [...new Set(years)].filter(Boolean).sort().reverse();
    if (!years.length) years = [currentYear || settings.schoolYear];

    const selected = (currentYear && years.includes(currentYear)) ? currentYear : years[0];
    sel.innerHTML = years.map(y => `<option value="${y}"${y === selected ? ' selected' : ''}>${y}</option>`).join('');
    sel.value = selected;
    return selected;
}

async function loadTeacherYearPreview(year) {
    if (!_previewTeacher) return;
    await loadTeacherDataForPreview(_previewTeacher.uid, year);
    switchPrincipalTab(_previewTab);
}

async function loadTeacherDataForPreview(teacherUid, year) {
    showLoading();
    try {
        const yPath = db.collection('users').doc(teacherUid).collection('years').doc(year);

        const [classesSnap, lessonsSnap, eventsSnap, breaksDoc] = await Promise.all([
            yPath.collection('classes').orderBy('name').get(),
            yPath.collection('lessons').orderBy('date').get(),
            yPath.collection('events').orderBy('startDate').get(),
            yPath.collection('settings').doc('breaks').get()
        ]);

        // Stash our own data
        if (_savedClasses === null) {
            _savedClasses  = [...classes];
            _savedLessons  = [...lessons];
            _savedEvents   = [...events];
            _savedSettings = { ...settings };
        }

        // Swap globals with teacher's data
        classes  = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        lessons  = lessonsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        events   = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        settings = { ...settings, schoolYear: year,
            breaks: breaksDoc.exists ? (breaksDoc.data().breaks || []) : [] };

        // Choose where the Month/Week/Day tabs land when opening a teacher.
        // Today, but only if today falls inside the selected school year —
        // otherwise (e.g. summer break, or viewing a past/next year) today is a
        // "No School" day and the Day tab would look empty/broken. In that case
        // land on the teacher's first planned lesson, or failing that the start
        // of the year. The principal can still tap Today / navigate anywhere.
        const _startY = parseInt(String(year).split('-')[0], 10);
        const _endY   = parseInt(String(year).split('-')[1], 10);
        const _today  = new Date();
        const _inYear = !isNaN(_startY) && !isNaN(_endY)
            && _today >= new Date(_startY, 7, 1) && _today <= new Date(_endY, 6, 31);
        let _anchor;
        if (_inYear) {
            _anchor = _today;                                       // during the year: today
        } else if (lessons.length && lessons[0].date) {
            _anchor = new Date(lessons[0].date + 'T00:00:00');      // else: first planned day
        } else {
            _anchor = new Date((isNaN(_startY) ? _today.getFullYear() : _startY), 7, 1); // else: Aug 1 of the year
        }
        currentDate      = new Date(_anchor);
        currentDayDate   = new Date(_anchor);
        currentWeekStart = getWeekStart(currentDate);

    } catch(e) {
        console.error('loadTeacherDataForPreview:', e);
        showToast('Error loading teacher data');
    }
    hideLoading();
}

function exitTeacherPreview() {
    // Restore principal's own data
    if (_savedClasses !== null) {
        classes  = _savedClasses;
        lessons  = _savedLessons;
        events   = _savedEvents;
        settings = _savedSettings;
        _savedClasses = _savedLessons = _savedEvents = _savedSettings = null;
    }
    _previewTeacher = null;
    if (window._prePreviewAnchors) {
        currentDate = window._prePreviewAnchors.cd;
        currentWeekStart = window._prePreviewAnchors.ws;
        currentDayDate = window._prePreviewAnchors.dd;
        window._prePreviewAnchors = null;
    }

    document.getElementById('principal-preview-banner')?.classList.add('hidden');
    document.getElementById('principal-dashboard')?.classList.remove('hidden');
    document.getElementById('principal-teacher-view')?.classList.add('hidden');
    const ys = document.getElementById('ppb-year-select');
    if (ys) ys.innerHTML = '';

    // Re-render the real views with the principal's own restored data —
    // they were overwritten with the teacher's content during preview
    renderCalendar();
    renderWeek();
    renderClasses();
    renderYearView();
    renderDayView();
}

// ── Principal sub-tabs ────────────────────────────────────────

function switchPrincipalTab(tab) {
    _previewTab = tab;
    document.querySelectorAll('.psn-btn').forEach(b => b.classList.toggle('active', b.dataset.ptab === tab));
    renderPrincipalTab(tab);
}

function renderPrincipalTab(tab) {
    const container = document.getElementById('principal-tab-content');
    if (!container) return;

    const readonlyNote = '<div style="font-size:0.72rem;color:var(--text-muted);font-style:italic;margin-bottom:12px;">👁 Read-only view — this is ' + (_previewTeacher?.name || 'this teacher') + '\'s Plany</div>';

    // Strategy: the teacher's data is already swapped into the global
    // classes/lessons/events/settings arrays. Render the REAL (hidden) view
    // using the normal render functions, then clone the resulting HTML into
    // the principal tab container with pointer-events disabled.

    let sourceEl = null;
    if (tab === 'year') {
        renderYearView();
        sourceEl = document.getElementById('year-grid');
    } else if (tab === 'month') {
        renderCalendar();
        sourceEl = document.getElementById('calendar-grid');
    } else if (tab === 'week') {
        renderWeek();
        sourceEl = document.getElementById('week-container');
    } else if (tab === 'day') {
        renderDayView();
        sourceEl = document.getElementById('day-view-content');
    } else if (tab === 'classes') {
        renderClasses();
        sourceEl = document.getElementById('classes-list');
    }

    // Date navigation controls for the time-based tabs (year & classes have none)
    const navBar = (tab === 'month' || tab === 'week' || tab === 'day')
        ? buildPrincipalNavBar(tab) : '';

    // The Day tab is interactive: a principal can click a lesson to open a
    // read-only detail view. Other tabs stay fully non-interactive.
    const interactive = (tab === 'day');
    const wrapStyle = interactive ? '' : 'pointer-events:none;';

    if (sourceEl) {
        const hint = interactive
            ? '<div style="font-size:0.72rem;color:var(--text-muted);margin:-4px 0 10px;">💡 Click a lesson to view its details.</div>'
            : '';
        container.innerHTML = readonlyNote + navBar + hint
            + '<div style="' + wrapStyle + '" class="' + (sourceEl.className || '') + '">'
            + sourceEl.innerHTML
            + '</div>';
        if (interactive) attachPrincipalDayClicks();
    } else {
        container.innerHTML = readonlyNote + navBar + '<p style="color:var(--text-muted);">Could not load this view.</p>';
    }
}

// Make lessons in the read-only principal Day view clickable → open the
// lesson detail viewer. Slots without a lesson are left inert.
function attachPrincipalDayClicks() {
    const container = document.getElementById('principal-tab-content');
    if (!container) return;
    container.querySelectorAll('.day-class-item').forEach(item => {
        const classId   = item.dataset.classId;
        const slotIndex = parseInt(item.dataset.slotIndex, 10);
        const dateStr   = item.dataset.date;
        const dayLessons = lessons.filter(l => l.date === dateStr);
        const lesson = findLessonForSlot(dayLessons, classId, isNaN(slotIndex) ? 0 : slotIndex);
        if (lesson) {
            item.style.cursor = 'pointer';
            item.title = 'View lesson details';
            item.addEventListener('click', () => showPrincipalLessonView(lesson));
        } else {
            item.style.cursor = 'default';
        }
    });
}

// Read-only lesson detail viewer for principals.
let _principalLessonCtx = null;
function showPrincipalLessonView(lesson) {
    if (!lesson) return;
    const modal   = document.getElementById('principal-lesson-modal');
    const body    = document.getElementById('principal-lesson-body');
    const titleEl = document.getElementById('principal-lesson-title');
    if (!modal || !body) return;

    _principalLessonCtx = lesson;

    const cls = lesson.classId ? classes.find(c => c.id === lesson.classId) : null;
    const isActivity = !!cls?.isActivity;
    const dateDisp = lesson.date ? formatDisplayDate(new Date(lesson.date + 'T00:00:00')) : '';
    if (titleEl) titleEl.textContent = '📄 ' + (lesson.title || 'Lesson');

    // Legacy support: older lessons stored standards/target/criteria combined.
    const legacy = splitStandardsBlock(lesson.standards || lesson.objectives || '');
    const standards = (lesson.learningTarget !== undefined || lesson.successCriteria !== undefined)
        ? (lesson.standards || lesson.objectives || '')
        : legacy.standards;
    const learningTarget  = lesson.learningTarget  || legacy.learningTarget  || '';
    const successCriteria = lesson.successCriteria || legacy.successCriteria || '';

    const meta = [];
    if (cls) meta.push(escHtml(cls.name));
    if (dateDisp) meta.push(escHtml(dateDisp));
    if (lesson.subject) meta.push(escHtml(lesson.subject));
    if (lesson.duration) meta.push(escHtml(String(lesson.duration)) + ' min');

    const section = (label, val) => {
        if (!val || !String(val).trim()) return '';
        return '<div style="margin-bottom:14px;">'
            + '<div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-bottom:4px;">' + label + '</div>'
            + '<div style="white-space:pre-wrap;font-size:0.9rem;line-height:1.45;">' + escHtml(String(val)) + '</div></div>';
    };

    let html = '';
    if (meta.length) html += '<div style="font-size:0.85rem;color:var(--text-secondary);margin:2px 0 16px;">' + meta.join(' · ') + '</div>';
    if (!isActivity) {
        html += section('📏 Standards & Objectives', standards);
        html += section('🎯 Learning Target', learningTarget);
        html += section('✅ Success Criteria', successCriteria);
        html += section('🗺️ Lesson Flow', lesson.flow);
        html += section('🧰 Materials', lesson.materials);
    }
    html += section(isActivity ? '📝 Instructions' : '📝 Activities & Notes', lesson.activities);

    if (Array.isArray(lesson.attachments) && lesson.attachments.length) {
        html += '<div style="margin-bottom:8px;">'
            + '<div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-bottom:4px;">📎 Attachments</div>'
            + lesson.attachments.map(a => '<div style="font-size:0.85rem;">• ' + escHtml(a.name || a.filename || 'file') + '</div>').join('')
            + '</div>';
    }

    const hasBody = standards || learningTarget || successCriteria || lesson.flow || lesson.materials || lesson.activities || (lesson.attachments || []).length;
    if (!hasBody) html += '<div style="color:var(--text-muted);font-size:0.88rem;padding:8px 0;">No lesson details were filled in for this session.</div>';

    body.innerHTML = html;
    modal.classList.remove('hidden');
}

// From the lesson viewer, jump to leaving feedback on that specific lesson.
function commentOnCurrentPrincipalLesson() {
    const lesson = _principalLessonCtx;
    if (!lesson || !_previewTeacher) return;
    document.getElementById('principal-lesson-modal')?.classList.add('hidden');
    openPrincipalCommentForLesson(_previewTeacher.uid, lesson.id, lesson.title || 'Lesson', lesson.date || '');
}

// ── Principal read-only date navigation (Prev / Today / Next + date jump) ──
// The nav bar sits OUTSIDE the pointer-events:none clone, so its controls stay
// clickable while the teacher's plans below remain read-only.
function buildPrincipalNavBar(unit) {
    let label = '', jumpVal = '';
    if (unit === 'month') {
        label   = formatMonthYear(currentDate);
        jumpVal = formatDate(currentDate);
    } else if (unit === 'week') {
        const ws = currentWeekStart || getWeekStart(currentDate);
        label   = formatDisplayDate(ws) + ' – ' + formatDisplayDate(addDays(ws, 6));
        jumpVal = formatDate(ws);
    } else if (unit === 'day') {
        label   = formatDisplayDate(currentDayDate);
        jumpVal = formatDate(currentDayDate);
    }
    return '<div class="principal-nav-bar" style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="principalNavMove(\'' + unit + '\',-1)" title="Previous ' + unit + '">◀ Prev</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="principalNavMove(\'' + unit + '\',0)" title="Jump to today">Today</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="principalNavMove(\'' + unit + '\',1)" title="Next ' + unit + '">Next ▶</button>'
        + '<span style="font-weight:600;font-size:0.9rem;margin:0 4px;">' + label + '</span>'
        + '<input type="date" value="' + jumpVal + '" class="form-control" style="width:auto;padding:4px 8px;font-size:0.8rem;" '
        + 'onchange="principalNavJump(\'' + unit + '\', this.value)" title="Jump to a specific date">'
        + '</div>';
}

function principalNavMove(unit, dir) {
    // v6.2.0: every branch moves all three anchors, so switching tabs after
    // navigating shows the same date.
    let target;
    if (dir === 0) target = new Date();
    else if (unit === 'month') target = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
    else if (unit === 'week')  target = addDays(currentWeekStart, 7 * dir);
    else                       target = addDays(currentDayDate, dir);
    jumpToDate(target);
    renderPrincipalTab(_previewTab);
}

function principalNavJump(unit, value) {
    if (!value) return;
    const d = new Date(value + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    // Sync all three anchors so whichever tab is active reflects the jump
    currentDate      = new Date(d);
    currentDayDate   = new Date(d);
    currentWeekStart = getWeekStart(d);
    renderPrincipalTab(_previewTab);
}

// ── Print principal view ──────────────────────────────────────

function printCurrentPrincipalView() {
    if (_previewTab === 'week') { printWeekPDF?.(); return; }
    if (_previewTab === 'day')  { printDayPDF?.(formatDate(currentDayDate)); return; }
    if (_previewTab === 'year') { printYearPDF?.(); return; }
    // Default: print what's in the tab content
    const html = document.getElementById('principal-tab-content')?.innerHTML || '';
    const win = openPrintWindow();
    win.document.write(preparePrintDoc('<html><head><title>Plany – ' + (_previewTeacher?.name||'Teacher') + '</title><style>body{font-family:sans-serif;padding:0;margin:0;} @media print{body{print-color-adjust:exact;}}</style></head><body>' + html + '</body></html>', {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 300);
}

// ── Comments ─────────────────────────────────────────────────────────

function openPrincipalCommentModal() {
    // Comment on current teacher view (general / no specific lesson)
    if (!_previewTeacher) return;
    _principalCommentContext = {
        teacherUid: _previewTeacher.uid,
        lessonId: null,
        lessonTitle: 'General Observation',
        date: formatDate(new Date())
    };
    showPrincipalCommentModal();
}

function openPrincipalCommentForTeacher(teacherUid, teacherName) {
    _principalCommentContext = {
        teacherUid,
        lessonId: null,
        lessonTitle: 'General Observation',
        date: formatDate(new Date())
    };
    showPrincipalCommentModal();
}

function openPrincipalCommentForLesson(teacherUid, lessonId, lessonTitle, date) {
    _principalCommentContext = { teacherUid, lessonId, lessonTitle, date };
    showPrincipalCommentModal();
}

async function showPrincipalCommentModal() {
    const modal   = document.getElementById('principal-comment-modal');
    const ctxEl   = document.getElementById('principal-comment-context');
    const existEl = document.getElementById('principal-existing-comments');
    const textEl  = document.getElementById('principal-comment-text');
    if (!modal || !_principalCommentContext) return;

    if (ctxEl) {
        const ctx = _principalCommentContext;
        ctxEl.innerHTML = `<strong>${escHtml(ctx.lessonTitle)}</strong>${ctx.date ? ' · ' + escHtml(ctx.date) : ''}`;
    }
    if (textEl) textEl.value = '';

    // Load existing comments for this context
    if (existEl) {
        existEl.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);">Loading…</div>';
        try {
            let q = db.collection('principalComments')
                .where('principalUid', '==', currentUser.uid)
                .where('teacherUid', '==', _principalCommentContext.teacherUid)
                .orderBy('createdAt', 'asc');
            if (_principalCommentContext.lessonId) {
                q = q.where('lessonId', '==', _principalCommentContext.lessonId);
            } else {
                q = q.where('lessonId', '==', null);
            }
            const snap = await q.get();
            if (snap.empty) {
                existEl.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);font-style:italic;">No feedback yet.</div>';
            } else {
                existEl.innerHTML = snap.docs.map(d => {
                    const c = d.data();
                    const ts = c.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) || '';
                    return `<div class="principal-comment-bubble">
                        <div class="pcb-header"><span>${escHtml(c.principalName || 'Principal')}</span><span>${ts}</span></div>
                        <div class="pcb-text">${escHtml(c.text)}</div>
                    </div>`;
                }).join('');
            }
        } catch(e) {
            existEl.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);">Could not load previous comments.</div>';
        }
    }

    modal.classList.remove('hidden');
}

async function savePrincipalComment() {
    const textEl   = document.getElementById('principal-comment-text');
    const statusEl = document.getElementById('principal-comment-status');
    const text = textEl?.value.trim();
    if (!text) { if(statusEl) statusEl.textContent = 'Please write something.'; return; }
    if (!_principalCommentContext) return;

    if (statusEl) statusEl.innerHTML = '<span class="scan-spinner"></span> Saving…';

    try {
        await db.collection('principalComments').add({
            principalUid:  currentUser.uid,
            principalName: userProfile.username || userProfile.displayName || currentUser.email,
            teacherUid:    _principalCommentContext.teacherUid,
            lessonId:      _principalCommentContext.lessonId || null,
            lessonTitle:   _principalCommentContext.lessonTitle || '',
            date:          _principalCommentContext.date || '',
            text,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (statusEl) statusEl.textContent = '✅ Feedback saved!';
        if (textEl) textEl.value = '';
        setTimeout(() => {
            document.getElementById('principal-comment-modal')?.classList.add('hidden');
            if (statusEl) statusEl.textContent = '';
        }, 1200);
        showToast('Feedback saved ✓');
    } catch(e) {
        console.error('savePrincipalComment:', e);
        if (statusEl) statusEl.textContent = '❌ Error: ' + e.message;
    }
}

// ── Teacher: view principal comments on their lessons ─────────────────

// ── Share links (v6.6.0) ───────────────────────────────────────────────
// A frozen, read-only snapshot in publicShares/{random token}, opened at
// plany.work/s/{token} (public/share.html) with no account. Only lesson-plan
// fields go in -- never students, notes about students or sub-plan details.
function randomShareToken() {
    const a = new Uint8Array(22);   // 22 chars; the rule requires 20+
    crypto.getRandomValues(a);
    return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
}

function buildLessonShare() {
    const id = document.getElementById('lesson-id')?.value;
    const L = lessons.find(l => l.id === id);
    if (!L) return null;
    const cls = classes.find(c => c.id === L.classId);
    return {
        kind: 'lesson',
        title: L.title || 'Lesson plan',
        snapshot: { lesson: {
            className: cls?.name || '', dateLabel: formatDisplayDate(new Date(L.date + 'T00:00:00')),
            learningTarget: L.learningTarget || '', successCriteria: L.successCriteria || '',
            standards: L.standards || L.objectives || '', flow: L.flow || '',
            materials: L.materials || '', activities: L.activities || ''
        } }
    };
}

function buildWeekShare() {
    const DOW = ['sun','mon','tue','wed','thu','fri','sat'];
    const offsets = settings.hideWeekends === true ? [0, 1, 2, 3, 4] : [-1, 0, 1, 2, 3, 4, 5];
    const days = offsets.map(o => {
        const d = addDays(currentWeekStart, o);
        const ds = formatDate(d);
        const dow = DOW[d.getDay()];
        const dayEvents = events.filter(e => e.startDate && ds >= e.startDate && ds <= (e.endDate || e.startDate));
        const off = isOffDay(ds);
        const dayLessons = lessons.filter(l => l.date === ds);
        const slots = off ? [] : getSortedClassSlots(classes.filter(c => c.schedule && c.schedule[dow] && isClassActiveOnDate(c, ds)), dow);
        return {
            label: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
            off,
            offReason: off ? (dayEvents.find(isNoSchoolEvent)?.title || '') : '',
            events: dayEvents.filter(e => !isNoSchoolEvent(e)).map(e => e.title),
            classes: slots.map(({ cls, slotIndex, slot, slotCount }) => {
                const l = findLessonForSlot(dayLessons, cls.id, slotIndex);
                return {
                    name: cls.name + (slotCount > 1 ? ` (session ${slotIndex + 1})` : ''),
                    time: slot?.start ? `${slot.start}${slot.end ? '–' + slot.end : ''}` : '',
                    title: l?.title || '', learningTarget: l?.learningTarget || '', materials: l?.materials || ''
                };
            })
        };
    }).filter(day => !(day.classes.length === 0 && !day.off && day.events.length === 0 && /^(Sat|Sun)/.test(day.label)));
    const label = document.getElementById('current-week')?.textContent || formatDate(currentWeekStart);
    return { kind: 'week', title: `Week of ${label}`, snapshot: { days } };
}

async function createShareLink(kind) {
    if (!currentUser) return;
    const base = kind === 'lesson' ? buildLessonShare() : buildWeekShare();
    if (!base) { showToast('Save the lesson first, then share it.'); return; }
    const token = randomShareToken();
    const expires = new Date(); expires.setDate(expires.getDate() + 30);
    showLoading();
    try {
        await db.collection('publicShares').doc(token).set({
            ...base,
            ownerUid: currentUser.uid,
            subtitle: (userProfile && userProfile.username) || currentUser.displayName || '',
            revoked: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: firebase.firestore.Timestamp.fromDate(expires)
        });
        const url = `https://plany.work/s/${token}`;
        const input = document.getElementById('share-link-url');
        if (input) input.value = url;
        document.getElementById('share-modal')?.classList.remove('hidden');
        refreshShareLinks();
        try { await navigator.clipboard.writeText(url); showToast('🔗 Link copied'); } catch (_) {}
    } catch (e) {
        console.error('createShareLink:', e);
        showToast('Could not create the link: ' + e.message);
    } finally { hideLoading(); }
}

function copyShareLink() {
    const input = document.getElementById('share-link-url');
    if (!input?.value) return;
    navigator.clipboard.writeText(input.value).then(() => showToast('🔗 Link copied'))
        .catch(() => { input.select(); showToast('Press Ctrl+C to copy'); });
}

async function refreshShareLinks() {
    const box = document.getElementById('share-links-list');
    if (!box || !currentUser) return;
    try {
        const snap = await db.collection('publicShares').where('ownerUid', '==', currentUser.uid).get();
        const now = Date.now();
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(x => !x.revoked && x.expiresAt?.toMillis?.() > now)
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        box.innerHTML = items.length ? items.map(x => `<div class="ai-history-row">
                <button type="button" class="ai-history-open" data-url="https://plany.work/s/${escHtml(x.id)}">
                    <span>${x.kind === 'lesson' ? '📄' : '🗓️'} ${escHtml(x.title || 'Shared plan')}</span>
                    <span class="ai-history-date">until ${escHtml(x.expiresAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>
                </button>
                <button type="button" class="btn btn-sm btn-ghost share-revoke" data-id="${escHtml(x.id)}">Turn off</button>
            </div>`).join('') : '<p class="muted" style="font-size:14px;">No active links.</p>';
        box.querySelectorAll('.ai-history-open').forEach(b => b.addEventListener('click', () => {
            const input = document.getElementById('share-link-url'); if (input) input.value = b.dataset.url;
        }));
        box.querySelectorAll('.share-revoke').forEach(b => b.addEventListener('click', async () => {
            if (!await planyConfirm('Turn off this link? Anyone who has it will no longer be able to open it.', { okText: 'Turn off', danger: true })) return;
            try { await db.collection('publicShares').doc(b.dataset.id).update({ revoked: true }); showToast('Link turned off'); refreshShareLinks(); }
            catch (e) { showToast('Could not turn it off: ' + e.message); }
        }));
    } catch (e) { console.warn('refreshShareLinks:', e.message); }
}

// ── Shift lessons: push later / pull earlier (v6.6.0) ─────────────────
// Lessons move along a class's own meeting slots (its schedule, every-other-
// week rule, sessions per day), skipping no-school days and any lesson that's
// 📌 locked to its date. Order and gaps are kept.
//
// planClassShift() is pure (no Firestore, no DOM) so tests can run it.
// Returns { moves:[{id, from, fromSlot, to, toSlot}], overflow, blocked }.
function planClassShift({ cls, classLessons, fromDate, count, endDate, isOff, slotsFor, isActive }) {
    const DOW = ['sun','mon','tue','wed','thu','fri','sat'];
    // 1. every meeting slot from fromDate to endDate
    const slots = [];
    const d = new Date(fromDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    for (let guard = 0; d <= end && guard < 800; guard++, d.setDate(d.getDate() + 1)) {
        const ds = formatDate(d);
        const dow = DOW[d.getDay()];
        if (!cls.schedule || !cls.schedule[dow] || isOff(ds) || !isActive(cls, ds)) continue;
        const n = Math.max(slotsFor(cls, dow).length, 1);
        for (let si = 0; si < n; si++) slots.push({ date: ds, si });
    }
    const slotKey = (date, si) => date + '#' + si;
    const lessonSi = l => (l.slotIndex > 0 ? l.slotIndex : 0);
    // 2. slots held by locked lessons are off limits
    const lockedKeys = new Set(classLessons.filter(l => l.lockedDate === true && l.date >= fromDate)
        .map(l => slotKey(l.date, lessonSi(l))));
    const free = slots.filter(s => !lockedKeys.has(slotKey(s.date, s.si)));
    const freeIndex = new Map(free.map((s, i) => [slotKey(s.date, s.si), i]));
    // 3. rank each movable lesson in the free-slot list (in order, no ties)
    const movable = classLessons.filter(l => l.date >= fromDate && l.lockedDate !== true)
        .sort((a, b) => a.date.localeCompare(b.date) || lessonSi(a) - lessonSi(b));
    let prev = -1;
    const ranked = movable.map(l => {
        let r = freeIndex.get(slotKey(l.date, lessonSi(l)));
        if (r === undefined) {                           // lesson sits on a non-meeting day
            r = free.findIndex(s => s.date >= l.date);
            if (r < 0) r = free.length;
        }
        r = Math.max(r, prev + 1);
        prev = r;
        return { l, r };
    });
    // 4. move by count
    const moves = [];
    let overflow = 0, blocked = 0;
    for (const { l, r } of ranked) {
        const nr = r + count;
        if (nr < 0) { blocked++; continue; }
        if (nr >= free.length) { overflow++; continue; }
        const t = free[nr];
        const toSlot = l.slotIndex === -1 ? -1 : t.si;
        if (t.date !== l.date || toSlot !== (l.slotIndex ?? 0)) {
            moves.push({ id: l.id, from: l.date, fromSlot: l.slotIndex ?? 0, to: t.date, toSlot });
        }
    }
    return { moves, overflow, blocked };
}

function shiftYearEnd() {
    const last = events.find(e => e.type === 'last-day');
    return last?.startDate || settings.yearEnd || formatDate(addDays(new Date(), 180));
}

function buildShiftPlan() {
    const fromDate = document.getElementById('shift-from')?.value;
    const classSel = document.getElementById('shift-class')?.value || 'all';
    const dir = parseInt(document.getElementById('shift-direction')?.value || '1');
    const n = parseInt(document.getElementById('shift-count')?.value || '1');
    if (!fromDate) return null;
    const targets = classSel === 'all' ? classes : classes.filter(c => c.id === classSel);
    const endDate = shiftYearEnd();
    const plan = { moves: [], overflow: 0, blocked: 0, classesTouched: 0 };
    targets.forEach(cls => {
        const r = planClassShift({
            cls, classLessons: lessons.filter(l => l.classId === cls.id), fromDate, count: dir * n,
            endDate, isOff: isOffDay, slotsFor: getTimeSlotsForDay, isActive: isClassActiveOnDate
        });
        if (r.moves.length) plan.classesTouched++;
        plan.moves.push(...r.moves);
        plan.overflow += r.overflow;
        plan.blocked += r.blocked;
    });
    return plan;
}

function renderShiftPreview() {
    const el = document.getElementById('shift-preview');
    const btn = document.getElementById('shift-apply-btn');
    const plan = buildShiftPlan();
    if (!el) return;
    if (!plan) { el.textContent = 'Pick a starting date.'; if (btn) btn.disabled = true; return; }
    const parts = [];
    parts.push(plan.moves.length
        ? `${plan.moves.length} lesson${plan.moves.length !== 1 ? 's' : ''} in ${plan.classesTouched} class${plan.classesTouched !== 1 ? 'es' : ''} will move.`
        : 'No lessons to move from that date.');
    if (plan.overflow) parts.push(`⚠️ ${plan.overflow} lesson${plan.overflow !== 1 ? 's' : ''} would run past the last day of school, so nothing will be shifted. Lock or delete lessons near the end of the year, or shift by fewer days.`);
    if (plan.blocked) parts.push(`⚠️ ${plan.blocked} lesson${plan.blocked !== 1 ? 's' : ''} can't move that much earlier, so nothing will be shifted. Try fewer days or a later starting date.`);
    el.textContent = parts.join('\n');
    if (btn) btn.disabled = !plan.moves.length || plan.overflow > 0 || plan.blocked > 0;
}

function openShiftModal() {
    const sel = document.getElementById('shift-class');
    if (sel) {
        sel.innerHTML = '<option value="all">All classes</option>' +
            classes.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');
    }
    const from = document.getElementById('shift-from');
    if (from) from.value = formatDate(currentDayDate || new Date());
    ['shift-from', 'shift-class', 'shift-direction', 'shift-count'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el._shiftBound) { el.addEventListener('change', renderShiftPreview); el._shiftBound = true; }
    });
    document.getElementById('shift-modal')?.classList.remove('hidden');
    renderShiftPreview();
}

async function writeLessonMoves(moves, forward) {
    const yearPath = getYearPath();
    for (let i = 0; i < moves.length; i += 400) {
        const batch = db.batch();
        moves.slice(i, i + 400).forEach(m => batch.update(yearPath.collection('lessons').doc(m.id),
            forward ? { date: m.to, slotIndex: m.toSlot } : { date: m.from, slotIndex: m.fromSlot }));
        await batch.commit();
    }
    moves.forEach(m => {
        const l = lessons.find(x => x.id === m.id);
        if (l) { l.date = forward ? m.to : m.from; l.slotIndex = forward ? m.toSlot : m.fromSlot; }
    });
    renderCalendar(); renderWeek();
    if (typeof renderDayView === 'function') renderDayView();
    updateStats();
}

async function applyLessonShift() {
    const plan = buildShiftPlan();
    if (!plan || !plan.moves.length || plan.overflow || plan.blocked) { renderShiftPreview(); return; }
    showLoading();
    try {
        await writeLessonMoves(plan.moves, true);
        const moves = plan.moves;
        recordAction({
            type: 'shift_lessons',
            restore: () => writeLessonMoves(moves, false),
            redo: () => writeLessonMoves(moves, true)
        });
        document.getElementById('shift-modal')?.classList.add('hidden');
        showToast(`⏩ Shifted ${moves.length} lesson${moves.length !== 1 ? 's' : ''}. Press Ctrl+Z to undo.`);
    } catch (e) {
        console.error('applyLessonShift:', e);
        showToast('Could not shift lessons: ' + e.message);
    } finally {
        hideLoading();
    }
}

// ── Principal feedback inbox (v6.4.0) ──────────────────────────────────
// Principals could leave comments on a teacher's lessons, but nothing ever
// showed them to the teacher. A 💬 button in the header (with an unread
// count) opens the list; opening it marks everything read.
let teacherFeedback = [];

async function loadTeacherPrincipalComments() {
    const btn = document.getElementById('feedback-btn');
    if (!currentUser || isPrincipal()) { btn?.classList.add('hidden'); teacherFeedback = []; return []; }
    try {
        const snap = await db.collection('principalComments')
            .where('teacherUid', '==', currentUser.uid)
            .get();
        teacherFeedback = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((x, y) => (y.createdAt?.toMillis?.() || 0) - (x.createdAt?.toMillis?.() || 0));
    } catch (e) {
        console.warn('loadTeacherPrincipalComments:', e.message);
        teacherFeedback = [];
    }
    updateFeedbackBadge();
    return teacherFeedback;
}

function updateFeedbackBadge() {
    const btn = document.getElementById('feedback-btn');
    const badge = document.getElementById('feedback-badge');
    if (!btn) return;
    btn.classList.toggle('hidden', teacherFeedback.length === 0);
    const unread = teacherFeedback.filter(c => !c.read).length;
    if (badge) {
        badge.textContent = unread > 9 ? '9+' : String(unread);
        badge.classList.toggle('hidden', unread === 0);
    }
    btn.setAttribute('aria-label', unread ? `Feedback from your principal, ${unread} unread` : 'Feedback from your principal');
}

function openFeedbackInbox() {
    const list = document.getElementById('feedback-list');
    if (!list) return;
    if (!teacherFeedback.length) {
        list.innerHTML = '<p class="empty-state">No feedback yet.</p>';
    } else {
        list.innerHTML = teacherFeedback.map(c => {
            const when = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            const lessonLine = c.lessonTitle
                ? `<button type="button" class="feedback-lesson" data-lesson="${escHtml(c.lessonId || '')}" data-date="${escHtml(c.date || '')}">📄 ${escHtml(c.lessonTitle)}${c.date ? ' · ' + escHtml(c.date) : ''}</button>`
                : '';
            return `<div class="feedback-item${c.read ? '' : ' unread'}">
                <div class="feedback-meta"><strong>${escHtml(c.principalName || 'Principal')}</strong><span>${escHtml(when)}</span></div>
                ${lessonLine}
                <div class="feedback-text">${escHtml(c.text || '')}</div>
            </div>`;
        }).join('');
        list.querySelectorAll('.feedback-lesson').forEach(b => b.addEventListener('click', () => {
            const lesson = lessons.find(l => l.id === b.dataset.lesson);
            document.getElementById('feedback-modal')?.classList.add('hidden');
            if (lesson) { jumpToDate(new Date(lesson.date + 'T00:00:00')); renderAfterJump(); openLessonModal(lesson); }
            else if (b.dataset.date) { jumpToDate(new Date(b.dataset.date + 'T00:00:00')); document.querySelector('[data-view="day"]')?.click(); }
        }));
    }
    document.getElementById('feedback-modal')?.classList.remove('hidden');
    // Mark everything read (the rule lets the teacher change only read/readAt)
    teacherFeedback.filter(c => !c.read).forEach(c => {
        c.read = true;
        db.collection('principalComments').doc(c.id)
            .update({ read: true, readAt: firebase.firestore.FieldValue.serverTimestamp() })
            .catch(e => console.warn('mark feedback read:', e.message));
    });
    updateFeedbackBadge();
}
document.getElementById('feedback-btn')?.addEventListener('click', openFeedbackInbox);

// ============================================================
// HELP & GUIDE — slide-in panel  (added v5.18.0)
// ============================================================

const HELP_SECTIONS = [
    {
        id: 'getting-started', icon: '👋', title: 'Getting Started',
        sub: 'A 60-second tour of Plany',
        img: 'help-shots/month.webp', imgCap: 'The Month view — your home base',
        lead: 'Plany keeps your whole year of teaching in one place — lessons, classes, students, sub plans, and AI helpers. Everything is reached from the bar along the bottom of the screen.',
        steps: [
            'The <strong>bottom navigation bar</strong> has seven tabs: <strong>Year, Month, Week, Day, Classes, Students,</strong> and <strong>AI</strong>. Tap any one to switch views. On a phone, <strong>Year, Classes</strong> and <strong>Students</strong> are under <strong>☰ More</strong>.',
            'The <strong>search bar</strong> at the top finds any lesson, event, or class instantly — or press <span class="help-kbd">Ctrl</span>/<span class="help-kbd">⌘</span> + <span class="help-kbd">K</span>.',
            'Your <strong>name and photo</strong> are in the top-right corner — tap them to edit your profile.',
            'Plany is a <strong>web app you can install</strong>. Look for the <strong>📲 Install</strong> button to add it to your phone or computer like a real app — it even works offline.'
        ],
        tip: { type: 'tip', text: 'New to Plany? Do these three things first, in order: set up your School Year, add your Classes, then start planning Lessons. Each section below walks you through it.' }
    },
    {
        id: 'school-year', icon: '📆', title: 'Set Up Your School Year',
        sub: 'Year tab — start here every August',
        img: 'help-shots/year.webp', imgCap: 'The Year tab shows all 12 months at a glance',
        lead: 'The Year tab is where you tell Plany when school starts and ends, and mark your breaks, holidays, and grading days. This powers the whole calendar — Plany automatically dims no-school days everywhere else.',
        steps: [
            'Tap <strong>Year</strong> in the bottom bar.',
            'Use the <strong>🏫 School Year</strong> dropdown below the calendars to pick your year (e.g. 2026–2027).',
            'Follow the <strong>🚀 Year Setup checklist</strong> at the top — it tracks the required steps: first day, last day, breaks, and grading periods.',
            'Add breaks and holidays as <strong>events</strong> (see the “No-School Days & Events” topic). They show up shaded across every view.',
            'Watch the summary bar update your <strong>Total School Days</strong> and per-quarter counts (Q1–Q4) automatically.',
            'Tap <strong>🗺️ Unit Map</strong> to plan your big teaching units across the year, or <strong>📰 Year Newsletter</strong> to generate a parent overview.'
        ],
        tip: { type: 'tip', text: 'The colored dots on each mini-calendar mean: green = first/last day, pink = break/holiday, yellow = grading day, blue = conference, and a small dot = a day that already has a lesson.' }
    },
    {
        id: 'classes', icon: '🎓', title: 'Create Your Classes',
        sub: 'Classes tab — set up once',
        img: 'help-shots/classes.webp', imgCap: 'Each class is a colored card with its weekly schedule',
        lead: 'A “class” in Plany is any recurring block in your day — a subject, an intervention group, even lunch and recess. Each one gets a color and a weekly schedule so lessons land on the right days automatically.',
        steps: [
            'Tap <strong>Classes</strong> in the bottom bar.',
            'Tap <strong>+ Add Class</strong> in the top-right.',
            'Give the class a <strong>name</strong>, pick a <strong>color</strong>, and add the <strong>room</strong> if you like.',
            'Set the <strong>weekly schedule</strong> — choose the days and start/end times. A class can meet at different times on different days, or more than once a day.',
            'Save. The class now appears in your Day and Week views on the days it meets, ready for lessons.',
            'Already have a printed schedule? Tap <strong>📷 Scan</strong> and take a photo — Plany’s AI reads it and builds your classes for you.'
        ],
        tip: { type: 'tip', text: 'Use the 📄 Weekly Schedule button to see and print your whole week of classes as a grid.' }
    },
    {
        id: 'lessons', icon: '✏️', title: 'Plan Your Lessons',
        sub: 'Day & Week tabs — your daily work',
        img: 'help-shots/day.webp', imgCap: 'The Day view lists every class and lets you add a lesson to each',
        lead: 'Lessons are the heart of Plany. You can add them from the Day, Week, or Month view — wherever you happen to be looking.',
        steps: [
            'Open the <strong>Day</strong> or <strong>Week</strong> tab and find the class you want to plan.',
            'Tap <strong>+ Add lesson</strong> next to that class (or the <strong>+ Lesson</strong> button in the Day toolbar), or press <span class="help-kbd">N</span>.',
            'Fill in the parts you want: <strong>title, objective, materials, activities,</strong> and <strong>standards</strong>. Fill only what’s useful — nothing is required.',
            'Save. The lesson shows on the calendar with the class’s color; a small ✓ marks days that already have a plan.',
            'To edit, just <strong>tap the lesson</strong> on any view.',
            'Drag a lesson to a different day to <strong>move</strong> it — hold <span class="help-kbd">Shift</span> while dragging to <strong>copy</strong> it instead.'
        ],
        tip: { type: 'tip', text: 'Short on time? The AI Lesson Fill tool (below) can draft a whole range of lessons for you in one shot. You edit from there.' }
    },
    {
        id: 'calendar-views', icon: '📅', title: 'The Calendar Views',
        sub: 'Year · Month · Week · Day',
        img: 'help-shots/week.webp', imgCap: 'The Week view — five days side by side with lesson cards',
        lead: 'The same lessons and events appear in four zoom levels. Pick whichever fits what you’re doing.',
        steps: [
            '<strong>Year</strong> — the big picture: all 12 months, school-day counts, and year setup.',
            '<strong>Month</strong> — a classic monthly grid; great for spotting events and gaps.',
            '<strong>Week</strong> — five weekdays side by side with full lesson cards. Home base for weekly planning, plus <strong>Copy Week</strong>, <strong>Anchor Charts</strong>, and <strong>Emergency Sub Plans</strong>.',
            '<strong>Day</strong> — one day in detail, class by class, with quick buttons for lessons, events, and sub plans.',
            'Use the <strong>◀ ▶ arrows</strong> to move between periods, or tap <strong>Today</strong> to jump back to the current day. Arrow keys <span class="help-kbd">←</span> <span class="help-kbd">→</span> work too.'
        ],
        tip: { type: 'tip', text: 'Press number keys 1–5 to jump straight to Year, Month, Week, Classes, or Day.' }
    },
    {
        id: 'events', icon: '📌', title: 'No-School Days & Events',
        sub: 'Breaks, holidays, meetings & more',
        img: 'help-shots/event.webp', imgCap: 'The Add Event form, with the Event Type menu',
        lead: 'Events mark anything that isn’t a lesson — holidays, breaks, grading days, assemblies, staff meetings, conferences. No-school event types automatically shade those days and cancel classes everywhere in Plany.',
        steps: [
            'From the <strong>Day</strong> view tap <strong>+ Event</strong>, or press <span class="help-kbd">E</span> from anywhere.',
            'Type an <strong>Event Title</strong> (e.g. “Fall Break”).',
            'Pick an <strong>Event Type</strong>. No-school types — break, holiday, grading day, meeting, professional learning — turn the day off automatically.',
            'Choose a <strong>Start Date</strong> (and an <strong>End Date</strong> for multi-day breaks).',
            'Leave <strong>All Day Event</strong> checked for full-day items, or uncheck it to set specific times.',
            'Save. The day now shows <strong>“No School”</strong> where it applies, and your school-day counts update.'
        ],
        tip: { type: 'tip', text: 'Have a district calendar PDF? Use Scan & Import on the AI tab to pull all the dates in at once instead of typing each event.' }
    },
    {
        id: 'sub-day', icon: '🧑‍🏫', title: 'Sub Days & Sub Packets',
        sub: 'Everything a substitute needs',
        img: 'help-shots/sub-day.webp', imgCap: 'The Sub Day Packet builder',
        lead: 'When you’re out, Plany builds a complete substitute packet — your routines, seating, class instructions, and student work — ready to print.',
        steps: [
            'Open the <strong>Day</strong> you’ll be absent and tap <strong>🧑‍🏫 Sub Day</strong>.',
            'Toggle <strong>Mark as Sub Day</strong> on so the day is flagged with a sub badge.',
            'Fill in <strong>Teacher &amp; Classroom Info</strong> — name, room, school, and the sub’s name if you know it.',
            'Add your <strong>arrival routine, per-class instructions, medical notes,</strong> and <strong>where materials are</strong>.',
            'Tap <strong>⭐ Save as Defaults</strong> so next time most of it is pre-filled.',
            'Print what you need: <strong>Print Plan</strong> (the instructions), <strong>Print Picked Pages</strong> (chosen worksheets), or <strong>Print AI Work</strong> (auto-generated student work).'
        ],
        tip: { type: 'warn', text: 'Caught off guard? The Week view has an Emergency Sub Plans button that generates a no-prep, ready-to-go packet in seconds.' }
    },
    {
        id: 'students', icon: '👥', title: 'Students, Grades & Attendance',
        sub: 'Students tab',
        img: 'help-shots/students.webp', imgCap: 'The Students tab, with its six sub-sections',
        lead: 'The Students tab is your classroom roster and record book — grades, IEP notes, seating charts, parent contact log, and attendance, all in one place.',
        steps: [
            'Tap <strong>Students</strong> in the bottom bar.',
            'Add students with <strong>+ Add Student</strong>, or import a roster with <strong>SIS / CSV</strong> or <strong>Moodle</strong>.',
            'Switch between the tabs across the top: <strong>Roster, Gradebook, IEP &amp; Differentiation, Seating Chart, Parent Log,</strong> and <strong>Attendance</strong>.',
            'Use the filter chips (<strong>All, IEP, 504, ELL, GT</strong>) to quickly narrow the roster.',
            'Open a student to see their details, grades, and any accommodations in one profile.'
        ],
        tip: { type: 'tip', text: 'IEP and differentiation notes you add here can be pulled into AI-generated student work so it’s tailored to each learner.' }
    },
    {
        id: 'ai-key', icon: '🔑', title: 'Turn On the AI Features',
        sub: 'One-time setup — do this first',
        img: 'help-shots/settings.webp', imgCap: 'AI Provider & API Key, on the AI tab',
        lead: 'Plany’s AI tools — Lesson Fill, Scan & Import, the Quiz Generator, and Student Packets — run on your own AI key. It’s a one-time setup and your key stays private to your account.',
        steps: [
            'Tap the <strong>AI</strong> tab, then scroll to <strong>⚙️ Settings → AI Provider &amp; API Key</strong>.',
            'Choose your <strong>AI Provider</strong> (Anthropic Claude is the default).',
            'Paste your <strong>API key</strong> into the box.',
            'Tap <strong>💾 Save Key</strong>. It’s stored on your device with a private backup tied to your account, so it’s restored if you sign in somewhere new.',
            'That’s it — every AI tool is now unlocked.'
        ],
        tip: { type: 'warn', text: 'If an AI tool says it needs a key, this is the screen to visit. Your key is never shared with other teachers.' }
    },
    {
        id: 'ai-lesson-fill', icon: '✨', title: 'AI Lesson Fill',
        sub: 'Draft a whole range of lessons',
        img: 'help-shots/lesson-fill.webp', imgCap: 'AI Lesson Fill — pick a class and a date range',
        lead: 'Lesson Fill writes draft lessons across as many days as you choose, so you start from a full week instead of a blank page.',
        steps: [
            'On the <strong>AI</strong> tab, open <strong>✨ AI Lesson Fill</strong>.',
            'Pick a <strong>Class</strong> (or leave it on <em>All Classes</em>).',
            'Set the <strong>From</strong> and <strong>To</strong> dates for the range you want filled.',
            'Keep <strong>Skip days that already have a lesson</strong> checked so your existing plans are never overwritten.',
            'Leave <strong>Use pacing guide if imported</strong> checked to follow any pacing document you’ve uploaded.',
            'Add anything special in <strong>Extra Context</strong> (a theme, a unit, a standard), then run it and review the drafts — every lesson is yours to edit.'
        ],
        tip: { type: 'tip', text: 'For the best results, upload your pacing guides and materials to the Curriculum Library first (next topic).' }
    },
    {
        id: 'curriculum', icon: '📚', title: 'Curriculum Library',
        sub: 'Feed the AI your real materials',
        img: 'help-shots/curriculum.webp', imgCap: 'Uploading a resource to the Curriculum Library',
        lead: 'Upload your worksheets, teacher guides, word lists, and reading passages once. Plany’s AI then draws on them to build lessons and student packets that match what you actually teach.',
        steps: [
            'On the <strong>AI</strong> tab, open <strong>📚 Curriculum Library</strong>.',
            'Choose a <strong>Subject</strong> and a <strong>Resource Type</strong> (worksheet, guide, word list, and so on).',
            'Add a short <strong>Description</strong> to help the AI pick the right resource later.',
            'Upload the file. <strong>ZIP files are unpacked automatically</strong> — every file inside becomes its own resource.',
            'Your library <strong>carries over between school years</strong>, so you build it once and reuse it.'
        ],
        tip: { type: 'tip', text: 'Supported files include PDFs, Word docs, PowerPoint (.pptx), images, and ZIPs of any of these.' }
    },
    {
        id: 'ai-tools', icon: '🤖', title: 'More AI Tools',
        sub: 'Scan & Import · Quizzes · Newsletters',
        img: 'help-shots/ai-tools.webp', imgCap: 'The AI Tools section on the AI tab',
        lead: 'Beyond Lesson Fill, Plany has a handful of AI helpers for the jobs that eat your time.',
        steps: [
            '<strong>📷 Scan &amp; Import</strong> — snap a photo of a schedule, lesson plan, or district calendar and Plany turns it into real classes and events.',
            '<strong>📝 Quiz &amp; Rubric Generator</strong> — create printable quizzes and rubrics on any topic in seconds.',
            '<strong>📰 Newsletters</strong> — from the Year or Week view, tap <strong>Newsletter</strong> to generate a parent-friendly summary of what’s coming up.',
            '<strong>Student Work Packets</strong> — build a packet of tailored student work from your lessons and curriculum, printable straight from the Sub Day or Day view.'
        ],
        tip: { type: 'tip', text: 'All of these need your AI key set up first — see “Turn On the AI Features” above.' }
    },
    {
        id: 'shortcuts', icon: '⌨️', title: 'Tips & Keyboard Shortcuts',
        sub: 'Work faster',
        lead: 'A few shortcuts and habits that make Plany quicker once you know them.',
        steps: [
            '<span class="help-kbd">Ctrl</span>/<span class="help-kbd">⌘</span> + <span class="help-kbd">K</span> — open search from anywhere.',
            '<span class="help-kbd">N</span> new lesson · <span class="help-kbd">E</span> new event · <span class="help-kbd">C</span> new class.',
            '<span class="help-kbd">1</span>–<span class="help-kbd">5</span> jump to Year, Month, Week, Classes, or Day · <span class="help-kbd">T</span> jumps to today.',
            '<span class="help-kbd">Ctrl</span>/<span class="help-kbd">⌘</span> + <span class="help-kbd">Z</span> undo · <span class="help-kbd">Esc</span> closes any panel.',
            'Deleted something by mistake? An <strong>Undo</strong> button appears in the toast at the bottom of the screen.',
            'Back up your whole plan anytime from <strong>Settings → Export / Import Data</strong>.'
        ],
        tip: { type: 'tip', text: 'Tap “Keyboard shortcuts” at the bottom of this panel for the full list any time.' }
    }
];

var _helpRendered = false;

function renderHelp() {
    const body = document.getElementById('help-body');
    const quicknav = document.getElementById('help-quicknav');
    if (!body || !quicknav) return;

    // Intro block
    let html = '<div class="help-intro help-item" data-text="welcome overview getting started">'
        + '<strong>Welcome to Plany.</strong> This guide walks through every part of the app with real screenshots. '
        + 'Tap a topic to expand it, or search above to jump straight to what you need.</div>';

    HELP_SECTIONS.forEach(sec => {
        const stepsHtml = (sec.steps || []).map(s => `<li>${s}</li>`).join('');
        const imgHtml = sec.img
            ? `<img class="help-shot" src="${sec.img}" alt="${sec.title} screenshot" loading="lazy">`
              + (sec.imgCap ? `<div class="help-shot-cap">${sec.imgCap}</div>` : '')
            : '';
        const tipHtml = sec.tip
            ? `<div class="help-tip ${sec.tip.type === 'warn' ? 'warn' : ''}"><span class="help-tip-icon">${sec.tip.type === 'warn' ? '⚠️' : '💡'}</span><span>${sec.tip.text}</span></div>`
            : '';
        const searchText = [sec.title, sec.sub, sec.lead, ...(sec.steps || []), sec.tip ? sec.tip.text : '']
            .join(' ').replace(/<[^>]+>/g, ' ').toLowerCase();

        html += `
        <div class="help-section help-item" id="help-sec-${sec.id}" data-text="${searchText.replace(/"/g, '')}">
            <button class="help-sec-head" type="button" aria-expanded="false">
                <span class="help-sec-icon">${sec.icon}</span>
                <span class="help-sec-titles">
                    <span class="help-sec-title">${sec.title}</span>
                    <span class="help-sec-sub">${sec.sub || ''}</span>
                </span>
                <span class="help-sec-caret">▶</span>
            </button>
            <div class="help-sec-body">
                ${sec.lead ? `<p class="help-sec-lead">${sec.lead}</p>` : ''}
                ${imgHtml}
                <ol class="help-steps">${stepsHtml}</ol>
                ${tipHtml}
            </div>
        </div>`;
    });

    body.innerHTML = html;

    // Quick-nav chips
    quicknav.innerHTML = HELP_SECTIONS.map(sec =>
        `<button class="help-chip" data-target="help-sec-${sec.id}">${sec.icon} ${sec.title}</button>`
    ).join('');

    // Wire accordion toggles
    body.querySelectorAll('.help-sec-head').forEach(head => {
        head.addEventListener('click', () => {
            const sec = head.closest('.help-section');
            const isOpen = sec.classList.toggle('open');
            head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    });

    // Wire quick-nav chips: open + scroll to a section
    quicknav.querySelectorAll('.help-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const target = document.getElementById(chip.dataset.target);
            if (!target) return;
            target.classList.add('open');
            target.querySelector('.help-sec-head')?.setAttribute('aria-expanded', 'true');
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    _helpRendered = true;
}

function openHelp() {
    if (!_helpRendered) renderHelp();
    const panel = document.getElementById('help-panel');
    const overlay = document.getElementById('help-overlay');
    const footer = document.getElementById('help-footer-version');
    if (footer) footer.textContent = 'Plany Help · ' + (window.APP_VERSION || document.querySelector('.nav-version')?.textContent || '');
    overlay?.classList.remove('hidden');
    // force reflow so the transition runs
    void panel?.offsetWidth;
    requestAnimationFrame(() => {
        overlay?.classList.add('show');
        panel?.classList.add('open');
    });
    panel?.setAttribute('aria-hidden', 'false');
    if (panel) panel.inert = false;
    setTimeout(() => document.getElementById('help-search')?.focus(), 320);
}

function closeHelp() {
    const panel = document.getElementById('help-panel');
    const overlay = document.getElementById('help-overlay');
    panel?.classList.remove('open');
    overlay?.classList.remove('show');
    panel?.setAttribute('aria-hidden', 'true');
    if (panel) panel.inert = true;   // v6.5.0: hidden panel's links can't be tabbed to
    setTimeout(() => overlay?.classList.add('hidden'), 320);
}

function filterHelp(query) {
    const q = (query || '').trim().toLowerCase();
    const body = document.getElementById('help-body');
    const quicknav = document.getElementById('help-quicknav');
    const noResults = document.getElementById('help-no-results');
    const clearBtn = document.getElementById('help-search-clear');
    if (!body) return;

    clearBtn?.classList.toggle('hidden', !q);

    const items = body.querySelectorAll('.help-item');
    let visible = 0;

    items.forEach(item => {
        // Clear any previous highlights
        item.querySelectorAll('.help-hl').forEach(h => {
            h.replaceWith(document.createTextNode(h.textContent));
        });
        item.normalize?.();

        if (!q) {
            item.style.display = '';
            if (item.classList.contains('help-section')) {
                item.classList.remove('open');
                item.querySelector('.help-sec-head')?.setAttribute('aria-expanded', 'false');
            }
            visible++;
            return;
        }

        const hay = (item.dataset.text || item.textContent).toLowerCase();
        const match = hay.includes(q);
        item.style.display = match ? '' : 'none';
        if (match) {
            visible++;
            if (item.classList.contains('help-section')) {
                item.classList.add('open');
                item.querySelector('.help-sec-head')?.setAttribute('aria-expanded', 'true');
                highlightHelp(item.querySelector('.help-sec-body'), q);
                highlightHelp(item.querySelector('.help-sec-title'), q);
            }
        }
    });

    quicknav?.classList.toggle('hidden', !!q);
    noResults?.classList.toggle('hidden', visible > 0);
    body.classList.toggle('hidden', visible === 0);
}

// Wrap matching text nodes in a highlight span (skips inside tags safely)
function highlightHelp(root, q) {
    if (!root || !q) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('.help-shot-cap')) continue;
        if (node.nodeValue.toLowerCase().includes(q)) targets.push(node);
    }
    targets.forEach(node => {
        const frag = document.createDocumentFragment();
        const text = node.nodeValue;
        const lower = text.toLowerCase();
        let i = 0, idx;
        while ((idx = lower.indexOf(q, i)) !== -1) {
            if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)));
            const mark = document.createElement('span');
            mark.className = 'help-hl';
            mark.textContent = text.slice(idx, idx + q.length);
            frag.appendChild(mark);
            i = idx + q.length;
        }
        if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
        node.replaceWith(frag);
    });
}

function initHelp() {
    document.getElementById('help-btn')?.addEventListener('click', openHelp);
    document.getElementById('help-close')?.addEventListener('click', closeHelp);
    document.getElementById('help-overlay')?.addEventListener('click', closeHelp);

    const search = document.getElementById('help-search');
    search?.addEventListener('input', e => filterHelp(e.target.value));

    document.getElementById('help-search-clear')?.addEventListener('click', () => {
        if (search) search.value = '';
        filterHelp('');
        search?.focus();
    });
    document.getElementById('help-nr-clear')?.addEventListener('click', () => {
        if (search) search.value = '';
        filterHelp('');
        search?.focus();
    });

    document.getElementById('help-open-shortcuts')?.addEventListener('click', () => {
        closeHelp();
        setTimeout(() => document.getElementById('keyboard-modal')?.classList.remove('hidden'), 260);
    });

    // Close on Escape (only when the panel is open)
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.getElementById('help-panel')?.classList.contains('open')) {
            closeHelp();
        }
    });
}

// Expose for other callers / console
window.openHelp = openHelp;
window.closeHelp = closeHelp;

document.addEventListener('DOMContentLoaded', () => {
    try { initHelp(); } catch (e) { console.error('Help init failed', e); }
});
