// ==================== WEEK VIEW ====================


function renderWeek() {
    if (!elements.currentWeek || !elements.weekContainer) return;

    const weekStart = currentWeekStart; // always a Monday
    const hideWknd = settings.hideWeekends === true;

    // Nav label: "Aug 31 – Sep 5, 2026". Must match the columns actually
    // rendered below: 5d = Mon..Fri, 7d = Sun..Sat (Sunday sits at offset -1).
    const labelStart = addDays(weekStart, hideWknd ? 0 : -1);
    const labelEnd   = addDays(weekStart, hideWknd ? 4 : 5);
    elements.currentWeek.textContent =
        `${labelStart.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ` +
        `${labelEnd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;

    // Sync 5d/7d button state
    ['toggle-weekends-btn','toggle-weekends-week-btn'].forEach(id => {
        const b = document.getElementById(id);
        if (!b) return;
        b.textContent = hideWknd ? '7d' : '5d';
        b.classList.toggle('active', hideWknd);
        b.title = hideWknd ? 'Show weekends' : 'Hide weekends';
    });


    // Determine columns: Mon-Fri (5) or Sun-Sat (7)
    const offsets = hideWknd ? [0,1,2,3,4] : [-1,0,1,2,3,4,5];
    const dayDates = offsets.map(o => addDays(weekStart, o));

    const container = elements.weekContainer;
    container.innerHTML = '';
    const isMobileView = window.innerWidth <= 768;
    if (isMobileView) {
        container.style.gridTemplateColumns = '';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
    } else {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${dayDates.length}, minmax(0, 1fr))`;
    }

    dayDates.forEach(dayDate => {
        const dateStr  = formatDate(dayDate);
        const isToday  = isSameDay(dayDate, new Date());
        const dayIsOff = isOffDay(dateStr);
        const dow      = ['sun','mon','tue','wed','thu','fri','sat'][dayDate.getDay()];
        const dayNameFull = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayDate.getDay()];

        const dayCol = document.createElement('div');
        dayCol.className = `week-day-col${isToday ? ' today-col' : ''}${dayIsOff ? ' off-day' : ''}`;

        // ── Header (gradient like month view, today gets circle) ──
        const header = document.createElement('div');
        header.className = `week-day-header${isToday ? ' today' : ''}`;
        header.innerHTML = `
            <span class="week-day-name">${dayNameFull}</span>
            <span class="week-day-number">${dayDate.getDate()}</span>`;
        header.title = 'Open day view';
        header.addEventListener('click', () => {
            currentDayDate = new Date(dayDate);
            switchView('day');
        });
        dayCol.appendChild(header);

        // ── Sub day flag ──
        if (subDays[dateStr]?.isSubDay === true) {
            dayCol.classList.add('sub-day-col');
            const subFlag = document.createElement('div');
            subFlag.className = 'week-day-sub-banner';
            subFlag.textContent = '\u{1F64B} Sub Day';
            subFlag.title = 'Open the Sub Day packet';
            subFlag.addEventListener('click', (ev) => { ev.stopPropagation(); openSubDayModal(dateStr); });
            dayCol.appendChild(subFlag);
        }

        // ── Events (same pill styles as month view) ──
        const dayEvents = events.filter(e => dateStr >= e.startDate && dateStr <= (e.endDate || e.startDate));
        if (dayEvents.length > 0) {
            const evEl = document.createElement('div');
            evEl.className = 'week-day-events';
            dayEvents.forEach(ev => {
                const pill = document.createElement('div');
                pill.className = `week-event event-${ev.type || 'event'}`;
                pill.textContent = ev.title;
                pill.addEventListener('click', () => openEventModal(ev));
                evEl.appendChild(pill);
            });
            dayCol.appendChild(evEl);
        }

        // ── Off-day banner ──
        if (dayIsOff) {
            const banner = document.createElement('div');
            banner.className = 'week-day-off-banner';
            banner.textContent = '🏖️ No School';
            dayCol.appendChild(banner);
            container.appendChild(dayCol);
            return;
        }

        // ── Lessons (color-coded by fill state) ──
        const lessonsEl = document.createElement('div');
        lessonsEl.className = 'week-day-lessons';

        const dayLessons = lessons.filter(l => l.date === dateStr)
            .sort((a,b) => (a.time||'').localeCompare(b.time||''));
        const dayClasses = classes.filter(cls => cls.schedule && cls.schedule[dow] && isClassActiveOnDate(cls, dateStr));
        const classSlots = getSortedClassSlots(dayClasses, dow);

        if (classSlots.length === 0) {
            lessonsEl.innerHTML = '<div class="week-day-empty">No classes</div>';
        } else {
            classSlots.forEach(({ cls, slotIndex: si, slot, slotCount }) => {
                    const slotTimeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dow);
                    const lesson = findLessonForSlot(dayLessons, cls.id, si);
                    const hasLesson = !!lesson;
                    const isSpanAll = hasLesson && lesson.slotIndex === -1;
                    const sessionLabel = slotCount > 1
                        ? (isSpanAll && si === 0 ? ` <span class="slot-badge span-badge">📋 all</span>`
                           : isSpanAll ? ` <span class="slot-badge span-badge muted-badge">📋</span>`
                           : ` <span class="slot-badge">S${si + 1}</span>`)
                        : '';
                    const clsEl = document.createElement('div');
                    clsEl.className = `week-lesson ${hasLesson ? 'has-lesson' : 'no-lesson'}`;
                    clsEl.innerHTML = `
                        <div class="lesson-color-bar" style="background:${cls.color||'#FF6B9D'}"></div>
                        <div class="lesson-info">
                            <h4>${escHtml(cls.name)}${sessionLabel}</h4>
                            <p>${hasLesson && lesson?.title ? escHtml(lesson.title) : escHtml(cls.subject || 'No lesson planned')}</p>
                            ${slotTimeStr ? `<span class="lesson-time">${slotTimeStr}</span>` : ''}
                        </div>
                        <span class="lesson-status">${hasLesson ? '✓' : '+'}</span>`;
                    clsEl.addEventListener('click', () => {
                        if (hasLesson && lesson) openLessonModal(lesson);
                        else openLessonModalForClass(cls, dateStr, si);
                    });
                    lessonsEl.appendChild(clsEl);
            });
        }

        lessonsEl.addEventListener('click', e => {
            if (e.target === lessonsEl || e.target.classList.contains('week-day-empty'))
                openLessonModal(null, dateStr);
        });

        dayCol.appendChild(lessonsEl);
        container.appendChild(dayCol);
    });
}

elements.prevWeek.addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    currentDate = new Date(addDays(currentWeekStart, 2)); // keep month in sync
    renderWeek();
});

elements.nextWeek.addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    currentDate = new Date(addDays(currentWeekStart, 2));
    renderWeek();
});

document.getElementById('today-week-btn')?.addEventListener('click', () => {
    currentDate      = new Date();
    currentDayDate   = new Date();          // keep all three anchors in sync
    currentWeekStart = getWeekStart(currentDate);
    renderWeek();
    renderCalendar();
    showToast('📅 Jumped to today');
});

document.getElementById('toggle-weekends-week-btn')?.addEventListener('click', async () => {
    settings.hideWeekends = !settings.hideWeekends;
    applyWeekendsVisibility();
    renderWeek();
    renderCalendar();
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear')
            .set({ hideWeekends: settings.hideWeekends }, { merge: true });
    } catch (e) { console.warn('Could not save weekend preference:', e); }
});


