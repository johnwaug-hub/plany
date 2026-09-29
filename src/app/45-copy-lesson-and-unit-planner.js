// ============================================================
// COPY LESSON PLAN
// ============================================================

function openCopyLessonPicker() {
    const picker = document.getElementById('copy-lesson-picker');
    if (!picker) return;
    picker.classList.remove('hidden');
    // Default to tomorrow
    const current = document.getElementById('lesson-date')?.value;
    if (current) {
        const d = new Date(current + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        document.getElementById('copy-lesson-date').value = formatDate(d);
    }
    // Reset the recurrence checkbox/options each time the picker opens so a
    // previous copy's "Repeat" choice doesn't silently carry over.
    const copyRecurringCheckbox = document.getElementById('copy-lesson-recurring');
    if (copyRecurringCheckbox) copyRecurringCheckbox.checked = false;
    document.getElementById('copy-recurring-options')?.classList.add('hidden');
}

function closeCopyLessonPicker() {
    document.getElementById('copy-lesson-picker')?.classList.add('hidden');
    document.getElementById('copy-day-picker')?.classList.add('hidden');
    closeCopyWeekPicker();
    document.getElementById('unit-modal')?.classList.add('hidden');
    document.getElementById('curriculum-gen-modal')?.classList.add('hidden');
    document.getElementById('student-modal')?.classList.add('hidden');
    document.getElementById('assignment-modal')?.classList.add('hidden');
    document.getElementById('diff-modal')?.classList.add('hidden');
    document.getElementById('gc-modal')?.classList.add('hidden');
    document.getElementById('grade-settings-modal')?.classList.add('hidden');
    document.getElementById('attendance-modal')?.classList.add('hidden');
    document.getElementById('teams-modal')?.classList.add('hidden');
    document.getElementById('moodle-modal')?.classList.add('hidden');
    document.getElementById('sis-modal')?.classList.add('hidden');
    document.getElementById('comm-modal')?.classList.add('hidden');
    closeSeatPicker();
    document.getElementById('unit-standards-picker')?.classList.add('hidden');
}

async function executeCopyLesson() {
    const targetDate = document.getElementById('copy-lesson-date')?.value;
    if (!targetDate) { showToast('Pick a date to copy to.'); return; }

    // Grab current form values (works even if unsaved)
    const baseLessonData = {
        title:      document.getElementById('lesson-title')?.value.trim() || '',
        classId:    document.getElementById('lesson-class')?.value || null,
        subject:    document.getElementById('lesson-subject')?.value.trim() || '',
        duration:   parseInt(document.getElementById('lesson-duration')?.value) || 45,
        standards:  document.getElementById('lesson-standards')?.value.trim() || '',
        learningTarget:  document.getElementById('lesson-learning-target')?.value.trim() || '',
        successCriteria: document.getElementById('lesson-success-criteria')?.value.trim() || '',
        flow:       document.getElementById('lesson-flow')?.value.trim() || '',
        materials:  document.getElementById('lesson-materials')?.value.trim() || '',
        activities: document.getElementById('lesson-activities')?.value.trim() || '',
        // Keep the session (v6.2.0 -- a Session 2 lesson used to land in Session 1)
        slotIndex:  parseInt(document.getElementById('lesson-slot-index')?.value || '0') || 0,
        attachments: [],
    };

    if (!baseLessonData.title) { showToast('Add a title before copying.'); return; }

    // If "Repeat" is checked, copy to the target date PLUS every subsequent
    // recurrence generated the same way "Make this a recurring lesson" does.
    const isRecurring = document.getElementById('copy-lesson-recurring')?.checked;
    let targetDates = [targetDate];

    if (isRecurring) {
        const frequency = document.getElementById('copy-recurring-frequency')?.value || 'weekly';
        const countValue = document.getElementById('copy-recurring-count')?.value || '4';
        targetDates = targetDates.concat(generateRecurringDates(targetDate, frequency, countValue));
    }

    const recurringGroupId = isRecurring ? `recurring_${Date.now()}` : null;

    try {
        showLoading();
        const createdLessons = [];
        for (let i = 0; i < targetDates.length; i++) {
            const lessonData = {
                ...baseLessonData,
                date: targetDates[i],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (recurringGroupId) {
                lessonData.recurringGroupId = recurringGroupId;
                lessonData.recurringIndex = i + 1;
            }
            try {
                const docRef = await getYearPath().collection('lessons').add(lessonData);
                createdLessons.push({ id: docRef.id, ...lessonData });
            } catch (innerErr) {
                console.error('Error copying lesson to', targetDates[i], innerErr);
            }
        }
        lessons.push(...createdLessons);
        renderCalendar();
        renderWeek();
        hideLoading();
        closeCopyLessonPicker();
        if (createdLessons.length > 1) {
            showToast(`📋 Lesson copied to ${createdLessons.length} dates!`);
        } else if (createdLessons.length === 1) {
            showToast('📋 Lesson copied to ' + new Date(targetDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '!');
        } else {
            showToast('Error copying lesson.');
        }
    } catch (e) {
        hideLoading();
        showToast('Error copying lesson: ' + e.message);
    }
}



// ============================================================
// UNIT PLANNER
// ============================================================
// units declared at top of file

const UNIT_COLORS = [
    '#7B5EA7','#D4698A','#3A86C8','#2A9D7F',
    '#E8832A','#C0392B','#8E7B4E','#4A6741',
];

// ── Load / save ───────────────────────────────────────────────────────────

async function loadUnits() {
    try {
        const snap = await getYearPath().collection('units').orderBy('startDate').get();
        units = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn('loadUnits:', e.message);
        units = [];
    }
}

// ── Year-view tab toggle ──────────────────────────────────────────────────

function switchYearTab(tab) {
    const calBtn  = document.getElementById('year-calendar-tab');
    const unitBtn = document.getElementById('year-units-tab');
    const grid    = document.getElementById('year-grid');
    const legend  = document.querySelector('.year-legend');
    const summary = document.querySelector('.year-summary');
    const unitMap = document.getElementById('unit-map-container');

    if (tab === 'units') {
        calBtn.className  = 'btn btn-sm btn-ghost';
        unitBtn.className = 'btn btn-sm btn-primary';
        if (grid)    grid.style.display    = 'none';
        if (legend)  legend.style.display  = 'none';
        if (summary) summary.style.display = 'none';
        if (unitMap) unitMap.classList.remove('hidden');
        renderUnitMap();
    } else {
        calBtn.className  = 'btn btn-sm btn-primary';
        unitBtn.className = 'btn btn-sm btn-ghost';
        if (grid)    grid.style.display    = '';
        if (legend)  legend.style.display  = '';
        if (summary) summary.style.display = '';
        if (unitMap) unitMap.classList.add('hidden');
    }
}

// ── Render the Gantt-style timeline ──────────────────────────────────────

function getUnitMapClassOrder() {
    const allIds = classes.map(c => c.id);
    const saved = Array.isArray(settings.unitMapClassOrder)
        ? settings.unitMapClassOrder.filter(id => allIds.includes(id))
        : [];
    const missing = allIds.filter(id => !saved.includes(id));
    return [...saved, ...missing];
}

async function saveUnitMapClassOrder() {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear')
            .set({ unitMapClassOrder: settings.unitMapClassOrder }, { merge: true });
    } catch (error) {
        console.error('Error saving Unit Map class order:', error);
    }
}

function moveUnitMapClass(classId, direction) {
    const order = getUnitMapClassOrder();
    const idx = order.indexOf(classId);
    if (idx === -1) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
    settings.unitMapClassOrder = order;
    saveUnitMapClassOrder();
    renderUnitMap();
}

// School year start/end for the year currently being viewed. The calendar's
// actual first-day/last-day events are the single source of truth used
// elsewhere in the app (isOffDay, the year progress bar, recurring lessons)
// -- prefer those over the separate settings.yearStart/yearEnd fields, which
// are easy to leave stale from a prior school year and previously caused the
// Unit Map timeline to silently render against the wrong year (units with
// correct current-year dates would get clipped to 0%/100% and become
// invisible). Shared by renderUnitMap() and openUnitModal()'s default dates.
function getSchoolYearBounds() {
    const sy     = settings.schoolYear || '2025-2026';
    const [sy1, sy2] = sy.split('-').map(Number);

    const firstDayEvent = events.find(e => e.type === 'first-day');
    const lastDayEvent  = events.find(e => e.type === 'last-day');

    const yearStart = firstDayEvent?.startDate
        ? new Date(firstDayEvent.startDate + 'T00:00:00')
        : (settings.yearStart ? new Date(settings.yearStart + 'T00:00:00') : new Date(sy1, 7, 1));
    const yearEnd = lastDayEvent?.startDate
        ? new Date(lastDayEvent.startDate + 'T00:00:00')
        : (settings.yearEnd ? new Date(settings.yearEnd + 'T00:00:00') : new Date(sy2, 4, 31));

    return { yearStart, yearEnd };
}

function renderUnitMap() {
    const container = document.getElementById('unit-map-timeline');
    if (!container) return;

    const { yearStart, yearEnd } = getSchoolYearBounds();
    const totalDays = (yearEnd - yearStart) / 86400000;

    // Build month columns
    const months = [];
    let cur = new Date(yearStart.getFullYear(), yearStart.getMonth(), 1);
    while (cur <= yearEnd) {
        months.push(new Date(cur));
        cur.setMonth(cur.getMonth() + 1);
    }

    // Pct helper
    const pct = (date) => {
        const d = new Date(date);
        const off = (d - yearStart) / 86400000;
        return Math.max(0, Math.min(100, (off / totalDays) * 100));
    };

    // Group units by class (null class = "All Classes" row).
    // Row order follows the user's saved Unit Map class order (reorderable via
    // the up/down buttons next to each row label), falling back to each
    // class's natural order for any class not yet in the saved order.
    const rows = [];
    const orderedClassIds = getUnitMapClassOrder();
    const classById = {};
    classes.forEach(cls => { classById[cls.id] = cls; });
    orderedClassIds.forEach(id => {
        const cls = classById[id];
        if (!cls) return;
        rows.push({ label: cls.name, classId: cls.id, units: units.filter(u => u.classId === cls.id) });
    });
    // Units not tied to a specific class
    const generalUnits = units.filter(u => !u.classId);
    if (generalUnits.length > 0 || classes.length === 0) {
        rows.unshift({ label: 'All Classes', classId: null, units: generalUnits });
    }

    // Diagnostic: confirm whether units are actually present in memory for
    // each row (vs a pure rendering/positioning problem) and whether their
    // dates fall inside the visible yearStart/yearEnd window used for pct().
    console.log(`[Unit Map render] yearStart=${formatDate(yearStart)} yearEnd=${formatDate(yearEnd)} totalDays=${totalDays}`);
    console.table(rows.map(r => ({
        row: r.label,
        classId: r.classId,
        unitCount: r.units.length,
        sample: r.units.slice(0, 2).map(u => `${u.name} (${u.startDate}→${u.endDate})`).join(' | ')
    })));

    if (rows.length === 0 || (units.length === 0 && classes.length === 0)) {
        container.innerHTML = '<div class="unit-map-empty">No classes or units yet.<br>Add classes first, then click <strong>+ Add Unit</strong> to start planning.</div>';
        return;
    }

    // Column widths as percentages
    const monthPcts = months.map(m => {
        const mStart = new Date(Math.max(m, yearStart));
        const mEnd   = new Date(Math.min(
            new Date(m.getFullYear(), m.getMonth() + 1, 0),
            yearEnd
        ));
        return Math.max(0, (mEnd - mStart) / 86400000 / totalDays * 100);
    });

    // "Today" marker position -- a vertical line across every row so it's
    // obvious at a glance where the class currently stands relative to every
    // unit, on every class row at once. Only shown when today actually falls
    // inside the visible school-year window (e.g. hidden entirely in summer).
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayRawOffset = (today - yearStart) / 86400000;
    const showTodayLine = todayRawOffset >= 0 && todayRawOffset <= totalDays;
    const todayPct = showTodayLine ? pct(today) : 0;

    // Header row -- month labels get a "'26"/"'27" year tag on January and on
    // the very first visible month, so a school year that spans two calendar
    // years never reads ambiguously (a bare "Jan" between "Dec" and "Feb"
    // could otherwise belong to either year at a glance).
    let html = '<div class="unit-map-wrap" style="position:relative;">';
    html += '<div class="unit-map-header" style="display:flex;min-width:600px;">';
    html += '<div style="width:110px;min-width:110px;border-right:1px solid rgba(255,255,255,0.08);"></div>';
    html += '<div style="flex:1;display:flex;">';
    months.forEach((m, i) => {
        const monthLabel = m.toLocaleDateString('en-US', { month: 'short' });
        const needsYear = m.getMonth() === 0 || i === 0;
        const label = needsYear ? `${monthLabel} '${String(m.getFullYear()).slice(-2)}` : monthLabel;
        const isYearBoundary = m.getMonth() === 0 && i > 0;
        html += `<div class="unit-map-month-label${isYearBoundary ? ' unit-map-month-yearline' : ''}" style="width:${monthPcts[i]}%;min-width:0;">${label}</div>`;
    });
    html += '</div></div>';

    // Rows
    const reorderableRows = rows.filter(r => r.classId);
    rows.forEach((row, rowIdx) => {
        const reorderIdx = row.classId ? reorderableRows.indexOf(row) : -1;
        const isFirstReorderable = reorderIdx === 0;
        const isLastReorderable = reorderIdx === reorderableRows.length - 1;
        html += `<div class="unit-map-row${rowIdx % 2 === 1 ? ' unit-map-row-alt' : ''}" style="min-width:600px;">`;
        html += `<div class="unit-map-row-label" title="${row.label}">`;
        if (row.classId) {
            html += `<span class="unit-map-reorder-btns">`;
            html += `<button type="button" class="unit-map-reorder-btn" onclick="moveUnitMapClass('${row.classId}', -1)" ${isFirstReorderable ? 'disabled' : ''} title="Move class up">&#9650;</button>`;
            html += `<button type="button" class="unit-map-reorder-btn" onclick="moveUnitMapClass('${row.classId}', 1)" ${isLastReorderable ? 'disabled' : ''} title="Move class down">&#9660;</button>`;
            html += `</span>`;
        }
        html += `<span class="unit-map-row-name">${row.label}</span>`;
        html += `</div>`;
        html += `<div class="unit-map-row-track" data-class-id="${row.classId || ''}">`;

        // Grid lines -- the January line gets a brighter, dashed style so the
        // calendar-year boundary is easy to spot at a glance, matching the
        // year tag added to the header label above.
        let pctAccum = 0;
        months.forEach((m, i) => {
            const isYearBoundary = m.getMonth() === 0 && i > 0;
            html += `<div class="unit-track-grid${isYearBoundary ? ' unit-track-grid-yearline' : ''}" style="left:${pctAccum}%;width:${monthPcts[i]}%;"></div>`;
            pctAccum += monthPcts[i];
        });

        // Unit bars
        row.units.forEach(u => {
            const start = new Date(u.startDate + 'T00:00:00');
            const end   = new Date(u.endDate   + 'T00:00:00');
            const left  = pct(start);
            const width = Math.max(1, pct(end) - left);
            const color = u.color || UNIT_COLORS[0];
            const weekCount = Math.round((end - start) / 604800000);
            const weekLabel = weekCount > 0 ? ` (${weekCount}w)` : '';
            html += `<div class="unit-bar" style="left:${left}%;width:${width}%;background:${color};"
                title="${escHtml(u.name)}${weekLabel} — ${u.startDate} to ${u.endDate}${u.description ? '\n' + escHtml(u.description) : ''}"
                onclick="openUnitModal('${u.id}')">${escHtml(u.name)}</div>`;
        });

        // Add button
        html += `<button class="unit-map-add-btn" onclick="openUnitModal(null,'${row.classId || ''}')">+ Add Unit</button>`;
        html += `</div></div>`;
    });

    if (showTodayLine) {
        html += `<div class="unit-map-today-line" style="left:calc(110px + (100% - 110px) * ${(todayPct / 100).toFixed(4)});" title="Today — ${formatDate(today)}"><span class="unit-map-today-flag">Today</span></div>`;
    }

    html += '</div>';

    container.innerHTML = html;
}

// Opens a landscape-formatted, printable version of the Unit Map in a new
// window (the same window.open + print() pattern used for newsletters and
// other Plany printables, chosen over jsPDF for layout reliability with a
// percentage-positioned Gantt-style timeline). Mirrors the on-screen
// timeline's month-ruler-with-year-tags and January divider, plus a
// unit-by-unit reference table underneath so every date range stays fully
// readable on paper even when a bar itself is too narrow for its label.
function printUnitMap() {
    const sy = settings.schoolYear || '2025-2026';
    const [sy1, sy2] = sy.split('-').map(Number);

    const firstDayEvent = events.find(e => e.type === 'first-day');
    const lastDayEvent  = events.find(e => e.type === 'last-day');
    const yearStart = firstDayEvent?.startDate
        ? new Date(firstDayEvent.startDate + 'T00:00:00')
        : (settings.yearStart ? new Date(settings.yearStart + 'T00:00:00') : new Date(sy1, 7, 1));
    const yearEnd = lastDayEvent?.startDate
        ? new Date(lastDayEvent.startDate + 'T00:00:00')
        : (settings.yearEnd ? new Date(settings.yearEnd + 'T00:00:00') : new Date(sy2, 4, 31));
    const totalDays = (yearEnd - yearStart) / 86400000;

    const months = [];
    let cur = new Date(yearStart.getFullYear(), yearStart.getMonth(), 1);
    while (cur <= yearEnd) { months.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }

    const pct = (date) => {
        const d = new Date(date);
        const off = (d - yearStart) / 86400000;
        return Math.max(0, Math.min(100, (off / totalDays) * 100));
    };
    const monthPcts = months.map(m => {
        const mStart = new Date(Math.max(m, yearStart));
        const mEnd   = new Date(Math.min(new Date(m.getFullYear(), m.getMonth() + 1, 0), yearEnd));
        return Math.max(0, (mEnd - mStart) / 86400000 / totalDays * 100);
    });

    const orderedClassIds = getUnitMapClassOrder();
    const classById = {};
    classes.forEach(cls => { classById[cls.id] = cls; });
    const rows = [];
    orderedClassIds.forEach(id => {
        const cls = classById[id];
        if (!cls) return;
        rows.push({ label: cls.name, classId: cls.id, units: units.filter(u => u.classId === cls.id) });
    });
    const generalUnits = units.filter(u => !u.classId);
    if (generalUnits.length > 0) rows.unshift({ label: 'All Classes', classId: null, units: generalUnits });

    if (rows.every(r => r.units.length === 0)) {
        showToast('No units on the Unit Map yet — add some before printing.');
        return;
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayRawOffset = (today - yearStart) / 86400000;
    const showTodayLine = todayRawOffset >= 0 && todayRawOffset <= totalDays;
    const todayPct = showTodayLine ? pct(today) : 0;

    const teacherName = aiSettings.teacherName || userProfile.username || 'Your Teacher';
    const grade = aiSettings.grade || '1';

    // Month ruler
    let monthRulerHtml = '<div class="pum-row-track pum-header-track">';
    let acc = 0;
    months.forEach((m, i) => {
        const monthLabel = m.toLocaleDateString('en-US', { month: 'short' });
        const needsYear = m.getMonth() === 0 || i === 0;
        const label = needsYear ? `${monthLabel} '${String(m.getFullYear()).slice(-2)}` : monthLabel;
        const isYearBoundary = m.getMonth() === 0 && i > 0;
        monthRulerHtml += `<div class="pum-month${isYearBoundary ? ' pum-yearline' : ''}" style="left:${acc}%;width:${monthPcts[i]}%;">${label}</div>`;
        acc += monthPcts[i];
    });
    monthRulerHtml += '</div>';

    // Rows
    let rowsHtml = '';
    const refTableRows = [];
    rows.forEach(row => {
        if (row.units.length === 0) return;
        let trackHtml = '';
        let gAcc = 0;
        months.forEach((m, i) => {
            const isYearBoundary = m.getMonth() === 0 && i > 0;
            trackHtml += `<div class="pum-grid${isYearBoundary ? ' pum-yearline-grid' : ''}" style="left:${gAcc}%;width:${monthPcts[i]}%;"></div>`;
            gAcc += monthPcts[i];
        });
        const sortedUnits = [...row.units].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
        sortedUnits.forEach(u => {
            const start = new Date(u.startDate + 'T00:00:00');
            const end   = new Date(u.endDate   + 'T00:00:00');
            const left  = pct(start);
            const width = Math.max(1, pct(end) - left);
            const color = u.color || UNIT_COLORS[0];
            const weekCount = Math.round((end - start) / 604800000);
            trackHtml += `<div class="pum-bar" style="left:${left}%;width:${width}%;background:${color};">${escHtml(u.name)}</div>`;
            refTableRows.push({ cls: row.label, name: u.name, start: u.startDate, end: u.endDate, weeks: weekCount });
        });
        rowsHtml += `<div class="pum-row">
            <div class="pum-row-label" title="${escHtml(row.label)}">${escHtml(row.label)}</div>
            <div class="pum-row-track">${trackHtml}</div>
        </div>`;
    });

    const todayLineHtml = showTodayLine
        ? `<div class="pum-today-line" style="left:calc(140px + (100% - 140px) * ${(todayPct / 100).toFixed(4)});"><span>Today · ${formatDate(today)}</span></div>`
        : '';

    const refTableHtml = refTableRows.map(r => `<tr>
        <td>${escHtml(r.cls)}</td>
        <td>${escHtml(r.name)}</td>
        <td>${r.start}</td>
        <td>${r.end}</td>
        <td>${r.weeks > 0 ? r.weeks + 'w' : ''}</td>
    </tr>`).join('');

    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Unit Map — ${sy}</title>
<style>
  @page { size: letter landscape; margin: 0.45in; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c1c1c; margin: 0; padding: 0; }
  h1 { font-size: 20px; color: #7B5EA7; margin: 0 0 2px; }
  .meta { font-size: 11px; color: #777; margin-bottom: 16px; }
  .pum-timeline { position: relative; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
  .pum-header-track { position: relative; height: 22px; border-bottom: 2px solid #333; background: #f4f2f8; }
  .pum-row { display: flex; align-items: stretch; border-bottom: 1px solid #eee; }
  .pum-row:last-child { border-bottom: none; }
  .pum-row-label { width: 140px; min-width: 140px; font-size: 10px; font-weight: 700; padding: 6px 8px; border-right: 1px solid #ddd; display: flex; align-items: center; background: #fafafa; }
  .pum-row-track { flex: 1; position: relative; height: 34px; min-height: 34px; }
  .pum-month { position: absolute; top: 0; bottom: 0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #888; text-align: center; padding-top: 4px; border-right: 1px solid #e2e2e2; }
  .pum-yearline { border-right: 1px dashed #9D4EDD; color: #7B5EA7; }
  .pum-grid { position: absolute; top: 0; bottom: 0; border-right: 1px solid #eee; }
  .pum-yearline-grid { border-right: 1px dashed #c9a8e6; }
  .pum-bar { position: absolute; top: 5px; height: 24px; border-radius: 4px; color: white; font-size: 8.5px; font-weight: 700; display: flex; align-items: center; padding: 0 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .pum-today-line { position: absolute; top: 22px; bottom: 0; border-left: 2px solid #FF6B9D; z-index: 3; }
  .pum-today-line span { position: absolute; top: -14px; left: 3px; background: #FF6B9D; color: white; font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 3px; white-space: nowrap; }
  table.pum-ref { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.pum-ref th { text-align: left; background: #f4f2f8; color: #7B5EA7; padding: 5px 8px; border-bottom: 2px solid #ddd; }
  table.pum-ref td { padding: 4px 8px; border-bottom: 1px solid #eee; }
  table.pum-ref tr:nth-child(even) td { background: #fafafa; }
  h2 { font-size: 13px; color: #7B5EA7; margin: 4px 0 8px; }
  .footer { font-size: 10px; color: #aaa; margin-top: 18px; border-top: 1px solid #eee; padding-top: 8px; }
</style>
</head><body>
<h1>📐 Unit Map — School Year ${sy}</h1>
<div class="meta">${escHtml(teacherName)} · Grade ${escHtml(grade)} · Generated ${new Date().toLocaleDateString()}</div>
<div class="pum-timeline">
  ${monthRulerHtml}
  ${rowsHtml}
  ${todayLineHtml}
</div>
<h2>Unit Reference</h2>
<table class="pum-ref">
  <thead><tr><th>Class</th><th>Unit</th><th>Start</th><th>End</th><th>Length</th></tr></thead>
  <tbody>${refTableHtml}</tbody>
</table>
</body></html>`, {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 400);
}

// ── Modal open / close ───────────────────────────────────────────────────

function openUnitModal(unitId, presetClassId) {
    const modal = document.getElementById('unit-modal');
    const form  = document.getElementById('unit-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('unit-id').value = '';

    // Populate class dropdown
    const classSelect = document.getElementById('unit-class');
    classSelect.innerHTML = '<option value="">All classes</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls.id;
        opt.textContent = cls.name;
        classSelect.appendChild(opt);
    });

    // Populate curriculum docs checklist
    renderUnitDocsList([]);

    // Color picker
    renderUnitColorPicker('#7B5EA7');

    // Standards picker reset
    document.getElementById('unit-standards-picker')?.classList.add('hidden');

    const deleteBtn = document.getElementById('delete-unit-btn');

    if (unitId) {
        const u = units.find(u => u.id === unitId);
        if (!u) return;
        document.getElementById('unit-modal-title').textContent = '📐 Edit Unit';
        document.getElementById('unit-id').value        = u.id;
        document.getElementById('unit-name').value      = u.name || '';
        document.getElementById('unit-class').value     = u.classId || '';
        document.getElementById('unit-start').value     = u.startDate || '';
        document.getElementById('unit-end').value       = u.endDate || '';
        document.getElementById('unit-description').value = u.description || '';
        document.getElementById('unit-standards').value = u.standards || '';
        document.getElementById('unit-color').value     = u.color || UNIT_COLORS[0];
        renderUnitColorPicker(u.color || UNIT_COLORS[0]);
        renderUnitDocsList(u.docIds || []);
        deleteBtn?.classList.remove('hidden');
    } else {
        document.getElementById('unit-modal-title').textContent = '📐 Add Unit';
        if (presetClassId) document.getElementById('unit-class').value = presetClassId;
        // Default dates: today → +4 weeks, clamped to the school year currently
        // being viewed. Using the real calendar date unclamped meant that
        // outside the school year (e.g. over summer break, or if today simply
        // falls before/after the viewed year) the new unit's dates landed
        // outside the Unit Map's visible timeline window and the unit would
        // silently render off-screen with no indication anything went wrong.
        const { yearStart, yearEnd } = getSchoolYearBounds();
        const today = new Date();
        let start = today < yearStart || today > yearEnd ? new Date(yearStart) : today;
        let end   = new Date(start); end.setDate(end.getDate() + 28);
        if (end > yearEnd) end = new Date(yearEnd);
        document.getElementById('unit-start').value = formatDate(start);
        document.getElementById('unit-end').value   = formatDate(end);
        deleteBtn?.classList.add('hidden');
    }

    modal.classList.remove('hidden');
}

function closeUnitModal() {
    document.getElementById('unit-modal')?.classList.add('hidden');
    document.getElementById('curriculum-gen-modal')?.classList.add('hidden');
    document.getElementById('student-modal')?.classList.add('hidden');
    document.getElementById('assignment-modal')?.classList.add('hidden');
    document.getElementById('diff-modal')?.classList.add('hidden');
    document.getElementById('gc-modal')?.classList.add('hidden');
    document.getElementById('grade-settings-modal')?.classList.add('hidden');
    document.getElementById('attendance-modal')?.classList.add('hidden');
    document.getElementById('teams-modal')?.classList.add('hidden');
    document.getElementById('moodle-modal')?.classList.add('hidden');
    document.getElementById('sis-modal')?.classList.add('hidden');
    document.getElementById('comm-modal')?.classList.add('hidden');
    closeSeatPicker();
}

function renderUnitColorPicker(selectedColor) {
    const picker = document.getElementById('unit-color-picker');
    if (!picker) return;
    picker.innerHTML = UNIT_COLORS.map(c =>
        `<div class="unit-color-swatch ${c === selectedColor ? 'selected' : ''}"
            style="background:${c};"
            onclick="selectUnitColor('${c}')" title="${c}"></div>`
    ).join('');
}

function selectUnitColor(color) {
    document.getElementById('unit-color').value = color;
    renderUnitColorPicker(color);
}

function renderUnitDocsList(selectedIds) {
    const el = document.getElementById('unit-docs-list');
    if (!el) return;
    if (curriculumDocs.length === 0) {
        el.innerHTML = '<div style="font-size:0.72rem;color:var(--text-muted);padding:4px;">No curriculum docs uploaded yet.</div>';
        return;
    }
    el.innerHTML = curriculumDocs.map(d =>
        `<label class="unit-doc-item">
            <input type="checkbox" class="unit-doc-check" value="${d.id}" ${selectedIds.includes(d.id) ? 'checked' : ''}>
            <span>📄 ${d.name}</span>
        </label>`
    ).join('');
}

// Unit standards picker: see STANDARDS LIBRARY (v6.7.0) -- openStdPicker('unit-standards-picker')

// ── Save / Delete ─────────────────────────────────────────────────────────

document.getElementById('unit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const unitId = document.getElementById('unit-id').value;
    const docIds = Array.from(document.querySelectorAll('.unit-doc-check:checked')).map(cb => cb.value);

    const data = {
        name:        document.getElementById('unit-name').value.trim(),
        classId:     document.getElementById('unit-class').value || null,
        startDate:   document.getElementById('unit-start').value,
        endDate:     document.getElementById('unit-end').value,
        color:       document.getElementById('unit-color').value || UNIT_COLORS[0],
        description: document.getElementById('unit-description').value.trim(),
        standards:   document.getElementById('unit-standards').value.trim(),
        docIds,
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
    };

    if (data.endDate < data.startDate) { showToast('End date must be after start date.'); return; }

    showLoading();
    try {
        if (unitId) {
            await getYearPath().collection('units').doc(unitId).update(data);
            const idx = units.findIndex(u => u.id === unitId);
            if (idx >= 0) units[idx] = { ...units[idx], ...data };
        } else {
            const ref = await getYearPath().collection('units').add(data);
            units.push({ id: ref.id, ...data });
        }
        units.sort((a, b) => a.startDate.localeCompare(b.startDate));
        hideLoading();
        closeUnitModal();
        renderUnitMap();
        showToast(unitId ? '📐 Unit updated!' : '📐 Unit added!');
    } catch (err) {
        hideLoading();
        showToast('Error saving unit: ' + err.message);
    }
});

async function deleteUnit() {
    const unitId = document.getElementById('unit-id').value;
    if (!unitId || !await planyConfirm('Delete this unit?')) return;
    showLoading();
    try {
        await getYearPath().collection('units').doc(unitId).delete();
        units = units.filter(u => u.id !== unitId);
        hideLoading();
        closeUnitModal();
        renderUnitMap();
        showToast('Unit deleted.');
    } catch (err) {
        hideLoading();
        showToast('Error: ' + err.message);
    }
}

// ── Helper: find active unit for a given date + classId ───────────────────

function getActiveUnit(dateStr, classId) {
    return units.find(u =>
        u.startDate <= dateStr && u.endDate >= dateStr &&
        (!u.classId || u.classId === classId)
    ) || null;
}

