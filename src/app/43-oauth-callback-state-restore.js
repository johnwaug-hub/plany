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

