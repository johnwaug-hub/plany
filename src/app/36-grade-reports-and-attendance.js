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

