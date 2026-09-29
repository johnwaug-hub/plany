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

