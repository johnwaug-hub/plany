// ==================== YEAR VIEW ====================

function renderYearView() {
    const yearGrid = document.getElementById('year-grid');
    const yearTitle = document.getElementById('year-view-title');
    
    if (!yearGrid) return;

    // Refresh checklist state whenever year view renders
    updateYearChecklist();

    // Get school year from settings
    const schoolYear = settings.schoolYear || '2025-2026';
    const [startYear, endYear] = schoolYear.split('-').map(y => parseInt(y));
    
    yearTitle.textContent = schoolYear;
    
    // School year months: July through June
    const months = [
        { month: 6, year: startYear, name: 'July' },
        { month: 7, year: startYear, name: 'August' },
        { month: 8, year: startYear, name: 'September' },
        { month: 9, year: startYear, name: 'October' },
        { month: 10, year: startYear, name: 'November' },
        { month: 11, year: startYear, name: 'December' },
        { month: 0, year: endYear, name: 'January' },
        { month: 1, year: endYear, name: 'February' },
        { month: 2, year: endYear, name: 'March' },
        { month: 3, year: endYear, name: 'April' },
        { month: 4, year: endYear, name: 'May' },
        { month: 5, year: endYear, name: 'June' }
    ];
    
    // Build event lookup by date
    const eventsByDate = {};
    for (const event of events) {
        if (!event.startDate) continue;
        
        const start = new Date(event.startDate + 'T00:00:00');
        const end = event.endDate ? new Date(event.endDate + 'T00:00:00') : start;
        
        const d = new Date(start);
        while (d <= end) {
            const dateStr = formatDate(d);
            if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
            eventsByDate[dateStr].push(event);
            d.setDate(d.getDate() + 1);
        }
    }
    
    // Build lessons lookup by date
    const lessonsByDate = {};
    for (const lesson of lessons) {
        if (!lesson.date) continue;
        lessonsByDate[lesson.date] = true;
    }

    // Get school year boundaries from first/last day events
    const firstDayEvt = events.find(e => e.type === 'first-day');
    const lastDayEvt  = events.find(e => e.type === 'last-day');
    const yearFirstDate = firstDayEvt?.startDate || null;
    const yearLastDate  = lastDayEvt?.startDate  || null;
    
    // Get today's date string
    const today = formatDate(new Date());
    
    // Render each month
    yearGrid.innerHTML = months.map(m => {
        const firstDay = new Date(m.year, m.month, 1);
        const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
        const startDayOfWeek = firstDay.getDay();
        
        let daysHTML = '';
        
        // Day headers
        const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        daysHTML += dayNames.map(d => `<div class="mini-day-header">${d}</div>`).join('');
        
        // Empty cells before first day
        for (let i = 0; i < startDayOfWeek; i++) {
            daysHTML += '<div class="mini-day empty"></div>';
        }
        
        // Days of month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(m.year, m.month, day);
            const dateStr = formatDate(date);
            const dayOfWeek = date.getDay();
            
            let classes = ['mini-day'];
            
            // Weekend
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                classes.push('weekend');
            }
            
            // Today
            if (dateStr === today) {
                classes.push('today');
            }
            
            // Events
            const dayEvents = eventsByDate[dateStr] || [];
            for (const evt of dayEvents) {
                if (evt.type === 'first-day' || evt.type === 'last-day') {
                    classes.push('first-last');
                } else if (evt.type === 'grading') {
                    classes.push('grading');
                } else if (evt.type === 'conference' || 
                           (evt.title && /\bconferences?\b/i.test(evt.title))) {
                    classes.push('conference');
                } else if (isNoSchoolEvent(evt)) {
                    // v6.2.0: shade every no-school day the same way the month
                    // and week views treat it (meetings, professional
                    // learning, title-only holidays were missed before).
                    classes.push('break');
                }
            }
            
            // Mark days outside school year boundaries as out-of-year
            const pastYearEnd   = yearLastDate  && dateStr > yearLastDate;
            const beforeYearStart = yearFirstDate && dateStr < yearFirstDate;
            const outOfYear = pastYearEnd || beforeYearStart;
            if (outOfYear) classes.push('out-of-year');

            // Has lesson (only on school days within the school year)
            if (!outOfYear && lessonsByDate[dateStr] && !isOffDay(dateStr)) {
                classes.push('has-lesson');
            }

            // Sub day — same rule as the month calendar badge
            const isSubDay = !outOfYear && subDays[dateStr]?.isSubDay === true;
            if (isSubDay) classes.push('sub-day');

            daysHTML += `<div class="${classes.join(' ')}" data-date="${dateStr}"${isSubDay ? ' title="Sub Day"' : ''}>${day}</div>`;
        }
        
        return `
            <div class="mini-month">
                <div class="mini-month-header">${m.name} ${m.year}</div>
                <div class="mini-month-grid">${daysHTML}</div>
            </div>
        `;
    }).join('');
    
    // Add click handlers to days → navigate to Day view for exact date
    yearGrid.querySelectorAll('.mini-day:not(.empty)').forEach(day => {
        day.style.cursor = 'pointer';
        day.addEventListener('click', () => {
            const dateStr = day.dataset.date;
            if (!dateStr) return;
            // Set currentDate so the nav handler (prevActive=year-view) passes it straight to currentDayDate
            currentDate      = new Date(dateStr + 'T00:00:00');
            currentWeekStart = getWeekStart(currentDate);
            document.querySelector('[data-view="day"]')?.click();
        });
    });
    
    // Update summary
    updateYearSummary();
}

function updateYearSummary() {
    const firstDayEvent = events.find(e => e.type === 'first-day');
    const lastDayEvent = events.find(e => e.type === 'last-day');
    
    if (!firstDayEvent || !lastDayEvent) return;
    
    const start = new Date(firstDayEvent.startDate + 'T00:00:00');
    const end = new Date(lastDayEvent.startDate + 'T00:00:00');
    
    const totalDays = countSchoolDaysLeft(start, end, events);
    document.getElementById('year-total-days').textContent = totalDays;
    
    // Calculate quarters (approximate - divide into 4 roughly equal parts)
    // This is simplified - a real implementation would use grading period events
    const totalCalendarDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    const quarterLength = Math.round(totalCalendarDays / 4);
    
    const q1End = new Date(start);
    q1End.setDate(q1End.getDate() + quarterLength);
    const q2End = new Date(q1End);
    q2End.setDate(q2End.getDate() + quarterLength);
    const q3End = new Date(q2End);
    q3End.setDate(q3End.getDate() + quarterLength);
    
    // Each quarter starts the day AFTER the previous one ends, so a boundary
    // day isn't counted twice and the quarters add up to the total.
    const dayAfter = d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; };
    document.getElementById('year-q1-days').textContent = countSchoolDaysLeft(start, q1End, events);
    document.getElementById('year-q2-days').textContent = countSchoolDaysLeft(dayAfter(q1End), q2End, events);
    document.getElementById('year-q3-days').textContent = countSchoolDaysLeft(dayAfter(q2End), q3End, events);
    document.getElementById('year-q4-days').textContent = countSchoolDaysLeft(dayAfter(q3End), end, events);
}

