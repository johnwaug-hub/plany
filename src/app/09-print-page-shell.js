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

