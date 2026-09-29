// ==================== DAY VIEW ====================

// ============================================================
// COLOR CONTRAST
// ============================================================
// Class colors are picked by the teacher and range from near-black to
// bright yellow, so a fixed white label is unreadable on the light ones
// (white on #FFD93D scores 1.4:1). Pick the label color from the
// background's relative luminance instead.
function textOnColor(bg) {
    const raw = String(bg || '').trim().replace('#', '');
    const hex = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#FFFFFF';
    const lin = v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const [r, g, b] = [0, 2, 4].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.21 ? '#141428' : '#FFFFFF';
}

function renderDayView() {
    const dateStr  = formatDate(currentDayDate);
    const date     = new Date(dateStr + 'T00:00:00');
    const isToday  = isSameDay(date, new Date());
    const dayIsOff = isOffDay(dateStr);
    const dowKey   = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];

    // Nav label
    const label = document.getElementById('current-day-display');
    if (label) {
        label.textContent = formatDisplayDate(date);
        label.style.color = isToday ? 'var(--neon-pink)' : '';
    }

    const content = document.getElementById('day-view-content');
    if (!content) return;
    content.innerHTML = '';

    // ── Off-day banner ──────────────────────────────────
    if (dayIsOff) {
        const banner = document.createElement('div');
        banner.className = 'day-view-section off-day-banner';
        banner.textContent = '🏖️ No School – All classes cancelled';
        content.appendChild(banner);
    }

    // ── Sub Day banner ──────────────────────────────────
    if (subDays[dateStr]?.isSubDay === true) {
        const sub = document.createElement('div');
        sub.className = 'day-view-section sub-day-banner';
        sub.innerHTML = `<span>\u{1F64B} This is a Sub Day</span>
            <button type="button" class="btn btn-sm btn-secondary" id="day-view-open-sub">Open packet</button>`;
        sub.querySelector('#day-view-open-sub').addEventListener('click', () => openSubDayModal(dateStr));
        content.appendChild(sub);
    }

    // ── Events section ──────────────────────────────────
    const dayEvents = events.filter(e => dateStr >= e.startDate && dateStr <= (e.endDate || e.startDate));
    const evSection = document.createElement('div');
    evSection.className = 'day-view-section';
    const typeIcons = { 'event':'📌','first-day':'🎒','last-day':'🎉','holiday':'🏖️','meeting':'👥','assembly':'🎤','field-trip':'🚌','testing':'📝','deadline':'⚠️' };
    evSection.innerHTML = `<div class="day-view-section-header"><span>📅</span> Events</div>`;
    if (dayEvents.length === 0) {
        evSection.innerHTML += '<div class="day-view-empty">No events today</div>';
    } else {
        const list = document.createElement('div');
        list.className = 'day-classes-list';
        dayEvents.forEach(ev => {
            const item = document.createElement('div');
            item.className = 'day-event-item';
            item.innerHTML = `
                <div class="day-event-info">
                    <span class="day-event-type">${typeIcons[ev.type] || '📌'}</span>
                    <div class="day-event-details">
                        <h4>${escHtml(ev.title)}</h4>
                        <p>${ev.startTime || 'All day'}${ev.endDate && ev.endDate !== ev.startDate ? ' · Multi-day' : ''}</p>
                    </div>
                </div>`;
            item.addEventListener('click', () => openEventModal(ev));
            list.appendChild(item);
        });
        evSection.appendChild(list);
    }
    content.appendChild(evSection);

    // ── Classes / Lessons section ────────────────────────
    const clsSection = document.createElement('div');
    clsSection.className = 'day-view-section';
    clsSection.innerHTML = `<div class="day-view-section-header" style="background:var(--gradient-synthwave)"><span>🎓</span> Classes</div>`;

    const _dayClassesRaw = dayIsOff ? [] : classes.filter(cls => cls.schedule && cls.schedule[dowKey] && isClassActiveOnDate(cls, dateStr));
    const classSlots = getSortedClassSlots(_dayClassesRaw, dowKey);
    const dayLessons = lessons.filter(l => l.date === dateStr);

    if (dayIsOff) {
        // already shown by banner
    } else if (classSlots.length === 0) {
        clsSection.innerHTML += '<div class="day-view-empty">No classes scheduled</div>';
    } else {
        const list = document.createElement('div');
        list.className = 'day-classes-list';
        classSlots.forEach(({ cls, slotIndex: si, slot, slotCount }) => {
                const slotTimeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dowKey);
                const lesson = findLessonForSlot(dayLessons, cls.id, si);
                const hasLesson = !!lesson;
                const isSpanAll = hasLesson && lesson.slotIndex === -1;
                const sessionLabel = slotCount > 1
                    ? (isSpanAll ? ' · 📋 All sessions' : ` · Session ${si + 1}`)
                    : '';
                const item = document.createElement('div');
                item.className = 'day-class-item' + (hasLesson ? ' is-expandable' : '');
                item.dataset.classId = cls.id;
                item.dataset.slotIndex = si;
                item.dataset.date    = dateStr;
                item.innerHTML = `
                    <div class="day-class-row">
                        <div class="day-class-info">
                            <div class="day-class-color" style="background:${cls.color||'#FF6B9D'}"></div>
                            <div class="day-class-details">
                                <h4>${escHtml(cls.name)}${sessionLabel}</h4>
                                <p>${slotTimeStr}${cls.room ? ' · ' + cls.room : ''}</p>
                            </div>
                        </div>
                        <span class="day-class-status ${hasLesson ? 'has-lesson' : 'no-lesson'}">
                            ${hasLesson ? '✓ ' + escHtml(lesson.title || 'Lesson planned') : '+ Add lesson'}
                        </span>
                        ${hasLesson ? '<span class="day-class-caret" aria-hidden="true">\u25BE</span>' : ''}
                    </div>
                    ${hasLesson ? `<div class="day-class-detail">${buildLessonDetailHtml(lesson)}</div>` : ''}`;

                if (hasLesson && lesson) {
                    const row = item.querySelector('.day-class-row');
                    row.setAttribute('role', 'button');
                    row.setAttribute('tabindex', '0');
                    const toggle = () => {
                        item.classList.toggle('expanded');
                        row.setAttribute('aria-expanded', item.classList.contains('expanded') ? 'true' : 'false');
                    };
                    row.addEventListener('click', toggle);
                    row.addEventListener('keydown', ev => {
                        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
                    });
                    item.querySelector('.day-lesson-edit-btn')?.addEventListener('click', ev => {
                        ev.stopPropagation();
                        openLessonModal(lesson);
                    });
                    item.querySelector('.day-lesson-print-btn')?.addEventListener('click', ev => {
                        ev.stopPropagation();
                        printLessonPDF(lesson.id);
                    });
                } else {
                    item.addEventListener('click', () => openLessonModalForClass(cls, dateStr, si));
                }
                list.appendChild(item);
        });
        clsSection.appendChild(list);
    }
    content.appendChild(clsSection);

}

// ============================================================
// LESSON DETAIL (shared by the Day view accordion and the Day print)
// ============================================================
const LESSON_DETAIL_FIELDS = [
    ['standards',       '\u{1F3AF} Standards & Objectives'],
    ['learningTarget',  '\u{1F3AF} Learning Target'],
    ['successCriteria', '\u2705 Success Criteria'],
    ['flow',            '\u{1F4CB} Lesson Flow'],
    ['materials',       '\u{1F4E6} Materials'],
    ['activities',      '\u{1F4DD} Activities & Notes']
];

function lessonHasDetail(lesson) {
    return !!lesson && LESSON_DETAIL_FIELDS.some(([k]) => (lesson[k] || '').toString().trim());
}

// Multiline text -> escaped HTML with line breaks preserved.
function detailText(v) {
    return escHtml(String(v || '').trim()).replace(/\n/g, '<br>');
}

// Inline lesson body shown when a Day view class row is expanded.
function buildLessonDetailHtml(lesson) {
    const blocks = LESSON_DETAIL_FIELDS
        .filter(([key]) => (lesson[key] || '').toString().trim())
        .map(([key, label]) => `
            <div class="day-lesson-field">
                <div class="day-lesson-field-label">${label}</div>
                <div class="day-lesson-field-value">${detailText(lesson[key])}</div>
            </div>`)
        .join('');

    const atts = Array.isArray(lesson.attachments) ? lesson.attachments : [];
    const attHtml = atts.length
        ? `<div class="day-lesson-field">
               <div class="day-lesson-field-label">\u{1F4CE} Attachments</div>
               <div class="day-lesson-field-value">${atts.map(a => escHtml(a.name || a.fileName || 'File')).join(', ')}</div>
           </div>`
        : '';

    const meta = [
        lesson.subject ? escHtml(lesson.subject) : '',
        lesson.duration ? escHtml(lesson.duration) + ' min' : ''
    ].filter(Boolean).join(' \u00B7 ');

    return `
        ${meta ? `<div class="day-lesson-meta">${meta}</div>` : ''}
        ${blocks || attHtml ? blocks + attHtml : '<div class="day-lesson-empty">No lesson details yet \u2014 open it to fill them in.</div>'}
        <div class="day-lesson-actions">
            <button type="button" class="btn btn-sm btn-secondary day-lesson-edit-btn">\u270F\uFE0F Edit lesson</button>
            <button type="button" class="btn btn-sm btn-ghost day-lesson-print-btn">\u{1F5A8}\uFE0F Print this lesson</button>
        </div>`;
}

