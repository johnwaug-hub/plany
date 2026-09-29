// ============================================================
// PRINT: WHOLE DAY, WITH EVERY LESSON IN FULL
// ============================================================
function printDayFull(dateStr) {
    dateStr = dateStr || formatDate(currentDayDate);
    const date = new Date(dateStr + 'T00:00:00');
    const dow  = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];
    const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const dayIsOff  = isOffDay(dateStr);
    const isSub     = subDays[dateStr]?.isSubDay === true;

    const dayEvents = events.filter(e => dateStr >= e.startDate && dateStr <= (e.endDate || e.startDate));
    const dayClasses = dayIsOff ? [] : classes.filter(c => c.schedule && c.schedule[dow] && isClassActiveOnDate(c, dateStr));
    const slots = getSortedClassSlots(dayClasses, dow);
    const dayLessons = lessons.filter(l => l.date === dateStr);

    const eventsHtml = dayEvents.length
        ? `<section class="pd-block">
             <h2>Events</h2>
             <ul class="pd-events">${dayEvents.map(e => `<li><strong>${escHtml(e.title)}</strong>${e.startTime ? ' \u00B7 ' + escHtml(e.startTime) : ' \u00B7 All day'}</li>`).join('')}</ul>
           </section>`
        : '';

    const classesHtml = slots.map(({ cls, slotIndex: si, slot, slotCount }) => {
        const timeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dow);
        const lesson  = findLessonForSlot(dayLessons, cls.id, si);
        const session = slotCount > 1 ? (lesson && lesson.slotIndex === -1 ? ' \u00B7 All sessions' : ` \u00B7 Session ${si + 1}`) : '';
        const color   = cls.color || '#FF6B9D';

        const fields = lesson
            ? LESSON_DETAIL_FIELDS
                .filter(([key]) => (lesson[key] || '').toString().trim())
                .map(([key, label]) => `
                    <div class="pd-field">
                        <div class="pd-field-label">${label.replace(/^[^ ]+ /, '')}</div>
                        <div class="pd-field-value">${detailText(lesson[key])}</div>
                    </div>`).join('')
            : '';

        const atts = lesson && Array.isArray(lesson.attachments) ? lesson.attachments : [];

        return `
            <section class="pd-class">
                <div class="pd-class-head" style="border-left-color:${color}">
                    <div class="pd-class-name">${escHtml(cls.name)}${session}</div>
                    <div class="pd-class-time">${escHtml(timeStr || '')}${cls.room ? ' \u00B7 ' + escHtml(cls.room) : ''}</div>
                </div>
                ${lesson
                    ? `<div class="pd-lesson">
                           <div class="pd-lesson-title">${escHtml(lesson.title || 'Untitled lesson')}</div>
                           ${fields || '<div class="pd-empty">No lesson details recorded.</div>'}
                           ${atts.length ? `<div class="pd-field"><div class="pd-field-label">Attachments</div><div class="pd-field-value">${atts.map(a => escHtml(a.name || a.fileName || 'File')).join(', ')}</div></div>` : ''}
                       </div>`
                    : '<div class="pd-empty">No lesson planned.</div>'}
            </section>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Daily Plan \u2014 ${escHtml(formatted)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; }
  @page { margin: 0.5in 0.55in; }
  .pd-head { border-bottom: 3px solid #9D4EDD; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  .pd-head h1 { font-size: 20px; color: #9D4EDD; }
  .pd-head .pd-sub { font-size: 11px; color: #666; margin-top: 2px; }
  .pd-flag { font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #fff; background: #E8832A; padding: 3px 9px; border-radius: 3px; }
  .pd-block { margin-bottom: 14px; }
  .pd-block h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #7B5EA7; margin-bottom: 5px; }
  .pd-events { list-style: none; font-size: 12px; }
  .pd-events li { padding: 2px 0; }
  .pd-class { border: 1px solid #e2e2ea; border-radius: 5px; margin-bottom: 11px; page-break-inside: avoid; overflow: hidden; }
  .pd-class-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; background: #f6f5fa; border-left: 5px solid #FF6B9D; padding: 7px 11px; }
  .pd-class-name { font-size: 13px; font-weight: 700; }
  .pd-class-time { font-size: 11px; color: #555; white-space: nowrap; }
  .pd-lesson { padding: 9px 12px 11px; }
  .pd-lesson-title { font-size: 12.5px; font-weight: 700; color: #1a1a2e; margin-bottom: 7px; }
  .pd-field { margin-bottom: 7px; }
  .pd-field-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #8a8aa0; margin-bottom: 1px; }
  .pd-field-value { font-size: 11.5px; line-height: 1.5; white-space: normal; }
  .pd-empty { padding: 9px 12px; font-size: 11px; color: #999; font-style: italic; }
</style></head><body>
  <div class="pd-head">
    <div>
      <h1>Daily Plan</h1>
      <div class="pd-sub">${escHtml(formatted)}${userProfile?.username ? ' \u00B7 ' + escHtml(userProfile.username) : ''}</div>
    </div>
    ${isSub ? '<div class="pd-flag">Sub Day</div>' : ''}
  </div>
  ${dayIsOff ? '<div class="pd-block"><strong>No School \u2014 all classes cancelled.</strong></div>' : ''}
  ${eventsHtml}
  ${classesHtml || (dayIsOff ? '' : '<div class="pd-empty">No classes scheduled for this day.</div>')}
</body></html>`;

    const win = openPrintWindow();
    if (!win) { printHtmlViaIframe(preparePrintDoc(html, {v:'0.4in',h:'0.3in'})); return; }
    win.document.write(preparePrintDoc(html, {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 400);
}

document.getElementById('prev-day-btn')?.addEventListener('click', () => {
    currentDayDate = addDays(currentDayDate, -1);
    currentDate = new Date(currentDayDate);
    currentWeekStart = getWeekStart(currentDayDate);
    renderDayView();
});

document.getElementById('next-day-btn')?.addEventListener('click', () => {
    currentDayDate = addDays(currentDayDate, 1);
    currentDate = new Date(currentDayDate);
    currentWeekStart = getWeekStart(currentDayDate);
    renderDayView();
});

document.getElementById('day-view-print-btn')?.addEventListener('click', () => {
    printDayFull(formatDate(currentDayDate));
});

document.getElementById('day-view-sub-btn')?.addEventListener('click', () => {
    // Opened from the Day view: this IS the "make today a sub day" action, so
    // the day is marked as a sub day up front instead of relying on the toggle.
    openSubDayModal(formatDate(currentDayDate), { markAsSubDay: true });
});

document.getElementById('day-view-add-event-btn')?.addEventListener('click', () => {
    openEventModal(null, formatDate(currentDayDate));
});

document.getElementById('today-day-btn')?.addEventListener('click', () => {
    currentDayDate = new Date();
    currentDate = new Date();
    currentWeekStart = getWeekStart(currentDate);
    renderDayView();
    renderCalendar();
    renderWeek();
    showToast('📅 Jumped to today');
});

document.getElementById('add-lesson-day-view-btn')?.addEventListener('click', () => {
    openLessonModal(null, formatDate(currentDayDate));
});

// ==================== CLASSES ====================

function renderClasses() {
    if (!elements.classesList) return;
    
    if (classes.length === 0) {
        elements.classesList.innerHTML = `
            <div class="no-classes">
                <p>No classes yet</p>
                <p>Add your first class to get started!</p>
            </div>
        `;
        return;
    }
    
    // Sort classes by earliest scheduled day/time
    const sortedClasses = sortClassesBySchedule(classes);
    
    elements.classesList.innerHTML = sortedClasses.map(cls => {
        // Sort schedule entries by day order
        const dayOrder = { 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5 };
        const scheduleHtml = Object.entries(cls.schedule || {})
            .filter(([_, time]) => time)
            .sort((a, b) => (dayOrder[a[0]] || 9) - (dayOrder[b[0]] || 9))
            .map(([day]) => {
                const slots = getTimeSlotsForDay(cls, day);
                const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
                if (slots.length === 0) return '';
                return slots.map(slot =>
                    `<span class="schedule-badge">${dayLabel} ${formatTimeSlot(slot)}</span>`
                ).join('');
            })
            .join('');
        
        return `
            <div class="class-card" data-id="${cls.id}">
                <div class="class-card-header" style="background: ${cls.color || '#FF6B9D'}; color: ${textOnColor(cls.color || '#FF6B9D')}">
                    <h3>${escHtml(cls.name)}</h3>
                    ${cls.room ? `<div class="room-badge">${cls.room}</div>` : ''}
                </div>
                <div class="class-card-body">
                    ${cls.subject ? `<p class="class-subject">${cls.subject}</p>` : ''}
                    <div class="class-schedule">${scheduleHtml || '<span class="schedule-badge">No schedule set</span>'}</div>
                </div>
            </div>
        `;
    }).join('');
    
    elements.classesList.querySelectorAll('.class-card').forEach(card => {
        card.addEventListener('click', () => {
            const cls = classes.find(c => c.id === card.dataset.id);
            openClassModal(cls);
        });
    });
}

