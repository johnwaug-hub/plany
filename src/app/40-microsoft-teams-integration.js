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


