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


