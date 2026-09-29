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


