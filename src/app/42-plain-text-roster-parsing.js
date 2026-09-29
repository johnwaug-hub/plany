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

