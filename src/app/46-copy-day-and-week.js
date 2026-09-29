// ============================================================
// COPY DAY TO DATE
// ============================================================

function openCopyDayPicker() {
    const picker = document.getElementById('copy-day-picker');
    if (!picker) return;
    picker.classList.remove('hidden');
    // Default to next school day
    const d = new Date(currentDayDate);
    d.setDate(d.getDate() + 1);
    // Skip weekends
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    document.getElementById('copy-day-date').value = formatDate(d);
}

function closeCopyDayPicker() {
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

async function executeCopyDay() {
    const targetDate = document.getElementById('copy-day-date')?.value;
    if (!targetDate) { showToast('Pick a date to copy to.'); return; }

    const sourceDate = formatDate(currentDayDate);
    if (targetDate === sourceDate) { showToast('Target date is the same as source.'); return; }

    const dayLessons = lessons.filter(l => l.date === sourceDate);
    if (dayLessons.length === 0) {
        showToast('No lessons on this day to copy.');
        return;
    }

    // Check conflicts
    const conflicts = dayLessons.filter(l =>
        lessons.some(ex => ex.date === targetDate && ex.classId === l.classId)
    );
    if (conflicts.length > 0) {
        const names = [...new Set(conflicts.map(l => {
            const cls = classes.find(c => c.id === l.classId);
            return cls ? cls.name : 'class';
        }))].join(', ');
        if (!await planyConfirm(`${conflicts.length} lesson(s) already exist on that date for: ${names}.\n\nCopy anyway?`)) return;
    }

    showLoading();
    try {
        const batch = db.batch();
        const newLessons = [];

        dayLessons.forEach(l => {
            const { id, updatedAt, ...fields } = l;
            const newData = { ...fields, date: targetDate, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            const ref = getYearPath().collection('lessons').doc();
            batch.set(ref, newData);
            newLessons.push({ id: ref.id, ...newData });
        });

        await batch.commit();
        newLessons.forEach(l => lessons.push(l));

        // Navigate to target date
        currentDayDate = new Date(targetDate + 'T00:00:00');
        currentDate = new Date(currentDayDate);
        currentWeekStart = getWeekStart(currentDayDate);

        renderCalendar();
        renderWeek();
        renderDayView();
        hideLoading();
        closeCopyDayPicker();

        const label = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        showToast('📋 ' + dayLessons.length + ' lesson' + (dayLessons.length !== 1 ? 's' : '') + ' copied to ' + label + '!');
    } catch (e) {
        hideLoading();
        showToast('Error: ' + e.message);
    }
}

// ============================================================
// COPY WEEK FORWARD
// ============================================================

function openCopyWeekPicker() {
    const picker = document.getElementById('copy-week-picker');
    if (!picker) return;
    picker.classList.remove('hidden');
    // Default to next week
    const nextWeek = addDays(currentWeekStart, 7);
    document.getElementById('copy-week-date').value = formatDate(nextWeek);
}

function closeCopyWeekPicker() {
    document.getElementById('copy-week-picker')?.classList.add('hidden');
}

async function executeCopyWeek() {
    const targetDateVal = document.getElementById('copy-week-date')?.value;
    if (!targetDateVal) { showToast('Pick a target date.'); return; }

    // Normalise: find the Monday (or Sunday if weekends shown) of the target week
    const targetAnyDay = new Date(targetDateVal + 'T00:00:00');
    const targetStart  = getWeekStart(targetAnyDay);

    // Don't copy to the same week
    if (formatDate(targetStart) === formatDate(currentWeekStart)) {
        showToast('Target week is the same as the source week.'); return;
    }

    const weekStart = new Date(currentWeekStart);
    // Same days the week view shows (v6.2.0): Sun–Sat is offsets -1..5 from
    // Monday, weekdays-only is 0..4. The old 0..6 loop copied Mon through
    // the NEXT week's Sunday and skipped this week's Sunday.
    const offsets = settings.hideWeekends === true ? [0, 1, 2, 3, 4] : [-1, 0, 1, 2, 3, 4, 5];
    const weekLessons = [];
    for (const d of offsets) {
        const dayDate = addDays(weekStart, d);
        const dateStr = formatDate(dayDate);
        lessons.filter(l => l.date === dateStr).forEach(l =>
            weekLessons.push({ ...l, _dayOffset: d })
        );
    }

    if (weekLessons.length === 0) { showToast('No lessons this week to copy.'); return; }

    // Check for conflicts in target week
    const targetDates = {};
    offsets.forEach(d => { targetDates[d] = formatDate(addDays(targetStart, d)); });
    const conflicts = weekLessons.filter(l =>
        lessons.some(ex => ex.date === targetDates[l._dayOffset] && ex.classId === l.classId)
    );

    if (conflicts.length > 0) {
        const names = [...new Set(conflicts.map(l => {
            const cls = classes.find(c => c.id === l.classId);
            return cls ? cls.name : 'Unknown';
        }))].join(', ');
        if (!await planyConfirm(`${conflicts.length} lesson(s) already exist that week for: ${names}.\n\nCopy anyway?`)) return;
    }

    showLoading();
    try {
        const batch     = db.batch();
        const newLessons = [];
        weekLessons.forEach(l => {
            const { id, _dayOffset, updatedAt, ...fields } = l;
            const data = { ...fields, date: targetDates[_dayOffset], updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            const ref  = getYearPath().collection('lessons').doc();
            batch.set(ref, data);
            newLessons.push({ id: ref.id, ...data });
        });
        await batch.commit();
        newLessons.forEach(l => lessons.push(l));

        // Navigate to the target week (all three anchors)
        jumpToDate(targetStart);
        renderAfterJump();
        hideLoading();
        closeCopyWeekPicker();

        const label = targetStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        showToast(`📋 ${weekLessons.length} lesson${weekLessons.length!==1?'s':''} copied to week of ${label}!`);
    } catch (e) {
        hideLoading();
        showToast('Error: ' + e.message);
    }
}



