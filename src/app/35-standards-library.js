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


