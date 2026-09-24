// ============================================================
// PLANY — Cloud Functions
// ============================================================
// aiProxy only. (The Clever token exchange was removed in v6.1.0 -- Clever
// itself was removed from the app in v5.19.1.)
// ============================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// ============================================================
// AI PROXY  —  POST /api/ai   (Hosting rewrite -> aiProxy)
// ============================================================
// Why this exists:
//   Plany calls the AI provider straight from the browser. That works on a
//   home network, but school districts (TUSD included) filter
//   api.anthropic.com at the network edge, so every AI feature dies with a
//   bare "Failed to fetch" on a school machine — the request never leaves
//   the building. Routing the call through plany.work instead means the
//   browser only ever talks to an origin the district already allows, and
//   the outbound call to the provider happens from Google's network.
//
//   The client falls back to calling the provider directly if this route
//   isn't reachable, so a missing/failed function deploy degrades to the
//   old behaviour rather than breaking AI everywhere.
//
// Request:  POST /api/ai
//   headers: Authorization:      Bearer <Firebase ID token>   (required, v6.1.0)
//            x-plany-provider:   anthropic | openai | gemini
//            x-plany-key:        the caller's own provider API key, OR
//            x-plany-share-from: uid of a teacher who granted the caller
//                                access to their key (looked up here, never
//                                sent to the caller's browser)
//   body:    the provider's own JSON payload, passed through untouched
// Response: the provider's response, passed through untouched (including
//           text/event-stream when the payload sets "stream": true).
//
// Keys are never logged. A shared key is read from aiKeys/{ownerUid}, which
// no client except its owner can read.
// ============================================================

const AI_UPSTREAMS = {
    anthropic: {
        url: 'https://api.anthropic.com/v1/messages',
        headers: (key) => ({
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01'
        })
    },
    openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` })
    },
    gemini: {
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` })
    }
};

// Only these origins may use the proxy, so it can't be repurposed as an
// open relay to the AI providers by anyone who finds the URL.
const AI_ALLOWED_ORIGINS = [
    'https://plany.work',
    'https://www.plany.work',      // v6.3.1: the www address serves the same app
    'https://plany-waugs.web.app',
    'https://plany-waugs.firebaseapp.com',
    'capacitor://localhost',   // Capacitor iOS
    'https://localhost',       // Capacitor 6 Android (androidScheme: https)
    'http://localhost'         // older Capacitor Android / local dev
];

// Upper bound on output tokens per request (the biggest job, the student
// packet, uses 16,000).
const MAX_OUTPUT_TOKENS = 16384;

async function resolveSharedKey(decoded, ownerUid) {
    // A grant is keyed to the grantee's email, so the email must be proven.
    const provider = decoded.firebase && decoded.firebase.sign_in_provider;
    if (!decoded.email || !(decoded.email_verified || provider === 'google.com')) {
        return { error: 403, message: 'Verify your email address to use a shared AI key. Open Settings → AI and tap "Send verification email".' };
    }
    const email = String(decoded.email).toLowerCase();
    const db = admin.firestore();
    const grant = await db.collection('apiKeyGrants').doc(ownerUid + '_' + email).get();
    if (!grant.exists || grant.data().status !== 'active') {
        return { error: 403, message: 'That shared AI key is no longer available to you.' };
    }
    const keyDoc = await db.collection('aiKeys').doc(ownerUid).get();
    const k = keyDoc.exists ? keyDoc.data() : null;
    if (!k || !k.apiKey) {
        return { error: 409, message: 'The teacher who shared their AI key needs to open Plany once so the key is set up for sharing.' };
    }
    return { apiKey: k.apiKey, provider: k.provider || 'anthropic' };
}

exports.aiProxy = functions
    .runWith({ timeoutSeconds: 300, memory: '512MB', maxInstances: 10 })
    .https.onRequest(async (req, res) => {
        const origin = req.get('origin') || '';
        const allowed = AI_ALLOWED_ORIGINS.includes(origin);

        // Same-origin calls through the Hosting rewrite send no Origin header
        // at all; those are fine. A cross-origin call must be on the list.
        if (origin && !allowed) {
            res.status(403).json({ error: { type: 'origin_not_allowed', message: 'AI only works when Plany is opened at plany.work. Open https://plany.work and try again.' } });
            return;
        }

        if (origin) {
            res.set('Access-Control-Allow-Origin', origin);
            res.set('Vary', 'Origin');
        }
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-plany-provider, x-plany-key, x-plany-share-from');

        if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
        if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

        // v6.1.0: signed-in Plany users only. Without this the proxy was an
        // open relay anyone could run long jobs through on our bill.
        const authHeader = req.get('Authorization') || '';
        const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        let decoded;
        try {
            if (!idToken) throw new Error('missing token');
            decoded = await admin.auth().verifyIdToken(idToken);
        } catch (e) {
            res.status(401).json({ error: { message: 'Please sign in to Plany again to use AI features.' } });
            return;
        }

        let providerId = (req.get('x-plany-provider') || 'anthropic').toLowerCase();
        let apiKey = req.get('x-plany-key') || '';
        const shareFrom = req.get('x-plany-share-from') || '';

        if (!apiKey && shareFrom) {
            try {
                const shared = await resolveSharedKey(decoded, shareFrom);
                if (shared.error) { res.status(shared.error).json({ error: { message: shared.message } }); return; }
                apiKey = shared.apiKey;
                providerId = shared.provider;
            } catch (e) {
                console.error('aiProxy shared-key lookup failed:', e.message);
                res.status(500).json({ error: { message: 'Could not load the shared AI key. Try again.' } });
                return;
            }
        }

        const upstream = AI_UPSTREAMS[providerId];
        if (!upstream) { res.status(400).json({ error: { message: 'Unknown AI provider.' } }); return; }
        if (!apiKey) { res.status(400).json({ error: { message: 'No AI API key was provided.' } }); return; }

        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        if (typeof body.max_tokens === 'number' && body.max_tokens > MAX_OUTPUT_TOKENS) body.max_tokens = MAX_OUTPUT_TOKENS;
        if (typeof body.max_completion_tokens === 'number' && body.max_completion_tokens > MAX_OUTPUT_TOKENS) body.max_completion_tokens = MAX_OUTPUT_TOKENS;

        try {
            const upstreamResp = await fetch(upstream.url, {
                method: 'POST',
                headers: upstream.headers(apiKey),
                body: JSON.stringify(body)
            });

            const contentType = upstreamResp.headers.get('content-type') || 'application/json';
            res.status(upstreamResp.status);
            res.set('Content-Type', contentType);

            // Streaming (SSE): forward chunks as they arrive so the newsletter
            // generator still paints text live instead of waiting for the end.
            if (contentType.includes('text/event-stream') && upstreamResp.body) {
                res.set('Cache-Control', 'no-cache');
                res.set('Connection', 'keep-alive');
                res.set('X-Accel-Buffering', 'no');
                const reader = upstreamResp.body.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(Buffer.from(value));
                }
                res.end();
                return;
            }

            res.send(Buffer.from(await upstreamResp.arrayBuffer()));
        } catch (e) {
            console.error('aiProxy upstream error:', e.message);
            res.status(502).json({ error: { message: 'AI provider unreachable from the server: ' + e.message } });
        }
    });
