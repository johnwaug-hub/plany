// ==================== CALENDAR ====================

function renderCalendar() {
    if (!elements.calendarGrid || !elements.currentMonth) return;
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    elements.currentMonth.textContent = formatMonthYear(currentDate);
    
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    elements.calendarGrid.innerHTML = '';
    
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    
    // Check if mobile (skip weekends)
    const isMobile = window.innerWidth <= 768;
    
    // On mobile: 6 weeks × 5 days = 30 cells
    // On desktop: 6 weeks × 7 days = 42 cells
    const totalCells = isMobile ? 30 : 42;
    
    let current = new Date(startDate);
    let cellCount = 0;
    
    while (cellCount < totalCells) {
        const dayOfWeekNum = current.getDay();
        
        // Skip weekends on mobile
        if (isMobile && (dayOfWeekNum === 0 || dayOfWeekNum === 6)) {
            current.setDate(current.getDate() + 1);
            continue;
        }
        
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        
        // Add weekend class for Saturday (6) and Sunday (0) - for desktop
        if (dayOfWeekNum === 0 || dayOfWeekNum === 6) {
            dayEl.classList.add('weekend');
        }
        
        if (current.getMonth() !== month) dayEl.classList.add('other-month');
        if (isSameDay(current, new Date())) dayEl.classList.add('today');
        
        const dateStr = formatDate(current);
        const dayOfWeek = dayNames[dayOfWeekNum];
        dayEl.dataset.date = dateStr;
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = current.getDate();
        // Add 🙋 badge only if teacher explicitly marked this as a sub day
        if (subDays[dateStr]?.isSubDay === true) {
            const subBadge = document.createElement('span');
            subBadge.className = 'sub-day-badge';
            subBadge.title = 'Sub Day Packet exists';
            subBadge.textContent = '🙋';
            dayNumber.appendChild(subBadge);
        }
        dayEl.appendChild(dayNumber);
        
        // Container for events and classes
        const preview = document.createElement('div');
        preview.className = 'day-lessons-preview';
        
        // Get events for this day (including multi-day events)
        const dayEvents = events.filter(e => {
            const start = e.startDate;
            const end = e.endDate || e.startDate;
            return dateStr >= start && dateStr <= end;
        });
        
        // Show events
        dayEvents.slice(0, 2).forEach(event => {
            const eventEl = document.createElement('div');
            eventEl.className = `calendar-event event-${event.type || 'event'}`;
            eventEl.textContent = event.title;
            eventEl.addEventListener('click', (e) => {
                e.stopPropagation();
                openEventModal(event);
            });
            preview.appendChild(eventEl);
        });
        
        // Get classes scheduled for this day of week (only on weekdays)
        // Skip all classes on holidays/breaks/no-school days
        const dayIsOff = isOffDay(dateStr);
        if (dayIsOff) dayEl.classList.add('off-day');

        const dayClasses = dayIsOff ? [] : sortClassesByTime(classes.filter(cls => {
            if (!cls.schedule) return false;
            if (!cls.schedule[dayOfWeek]) return false;
            return isClassActiveOnDate(cls, dateStr);
        }), dayOfWeek);

        // Show a No School pill when off-day has no explicit event displayed yet
        if (dayIsOff && dayEvents.length === 0) {
            const noSchoolEl = document.createElement('div');
            noSchoolEl.className = 'calendar-event event-holiday';
            noSchoolEl.textContent = '🏖️ No School';
            preview.appendChild(noSchoolEl);
        }
        
        // Show classes (limit display) — each slot gets its own pill, sorted by start time
        const maxItems = dayEvents.length > 0 ? 2 : 3;
        let shownClassPills = 0;
        const classSlots = getSortedClassSlots(dayClasses, dayOfWeek);
        const totalClassSlots = classSlots.length;
        for (const { cls, slotIndex: si, slotCount } of classSlots) {
                if (shownClassPills >= maxItems) break;
                const lesson = findLessonForSlot(
                    lessons.filter(l => l.date === dateStr && l.classId === cls.id),
                    cls.id, si);
                const hasLesson = !!lesson;
                const classEl = document.createElement('div');
                classEl.className = `calendar-class ${hasLesson ? 'has-lesson' : 'no-lesson'}`;
                if (lesson?.linkGroupId) classEl.classList.add('linked');
                classEl.style.background = cls.color || '#FF6B9D';
                classEl.style.color = textOnColor(cls.color || '#FF6B9D');
                const slotLabel = slotCount > 1 ? ` S${si + 1}` : '';
                classEl.textContent = cls.name + slotLabel;
                if (hasLesson && lesson) makeLessonDraggable(classEl, lesson);
                classEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openLessonModalForClass(cls, dateStr, si);
                });
                preview.appendChild(classEl);
                shownClassPills++;
        }
        
        // Show +more indicator
        const totalItems = dayEvents.length + totalClassSlots;
        const shownItems = Math.min(dayEvents.length, 2) + shownClassPills;
        if (totalItems > shownItems) {
            const more = document.createElement('div');
            more.className = 'lesson-dot';
            more.style.background = 'rgba(255,255,255,0.2)';
            more.textContent = `+${totalItems - shownItems} more`;
            preview.appendChild(more);
        }
        
        dayEl.appendChild(preview);

        // Phone summary (v6.3.0): one dot per class period -- filled when a
        // lesson is planned, hollow when not -- plus a square per event.
        // CSS shows it instead of the text pills below 600px; the whole day
        // is the tap target and opens Day view.
        const summary = document.createElement('div');
        summary.className = 'day-mobile-summary';
        summary.setAttribute('aria-hidden', 'true');
        let plannedCount = 0;
        classSlots.forEach(({ cls, slotIndex: si }) => {
            const has = !!findLessonForSlot(lessons.filter(l => l.date === dateStr && l.classId === cls.id), cls.id, si);
            if (has) plannedCount++;
            const dot = document.createElement('span');
            dot.className = 'dms-dot' + (has ? '' : ' empty');
            dot.style.setProperty('--dot', cls.color || '#FF6B9D');
            summary.appendChild(dot);
        });
        dayEvents.forEach(() => {
            const sq = document.createElement('span');
            sq.className = 'dms-event';
            summary.appendChild(sq);
        });
        if (dayIsOff) {
            const off = document.createElement('span');
            off.className = 'dms-off';
            off.textContent = 'Off';
            summary.appendChild(off);
        }
        dayEl.appendChild(summary);

        // Keyboard + screen-reader access to the day (v6.3.0)
        const dayLabelParts = [current.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })];
        if (dayIsOff) dayLabelParts.push('no school');
        else if (totalClassSlots) dayLabelParts.push(`${plannedCount} of ${totalClassSlots} classes planned`);
        if (dayEvents.length) dayLabelParts.push(`${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}`);
        dayEl.setAttribute('role', 'button');
        dayEl.tabIndex = 0;
        dayEl.setAttribute('aria-label', dayLabelParts.join(', '));

        const openThisDay = () => {
            jumpToDate(new Date(dateStr + 'T00:00:00'));
            document.querySelector('[data-view="day"]')?.click();
        };
        // Click handler - navigate to Day view
        dayEl.addEventListener('click', (e) => {
            // Don't open if clicking on an event or class element
            if (e.target.classList.contains('calendar-event') || e.target.classList.contains('calendar-class')) {
                return;
            }
            openThisDay();
        });
        dayEl.addEventListener('keydown', (e) => {
            if (e.target === dayEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openThisDay(); }
        });
        
        elements.calendarGrid.appendChild(dayEl);
        
        current = addDays(current, 1);
        cellCount++;
    }
}

// Always step from the 1st: setMonth() on Oct 31 gives "Nov 31" = Dec 1,
// which skipped November (v6.2.0).
elements.prevMonth.addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    renderCalendar();
});

elements.nextMonth.addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    renderCalendar();
});

// Today button
document.getElementById('today-btn').addEventListener('click', () => {
    currentDate      = new Date();
    currentDayDate   = new Date();          // keep all three anchors in sync
    currentWeekStart = getWeekStart(currentDate);
    renderCalendar();
    showToast('Jumped to today');
});

// Re-render on resize/orientation change for mobile layout
window.addEventListener('resize', () => {
    const activeView = document.querySelector('.view.active')?.id;
    if (activeView === 'week-view') renderWeek();
});

// Re-render calendar on resize/orientation change for mobile weekend handling
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        renderCalendar();
    }, 250);
});

