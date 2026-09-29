// ==================== UTILITY FUNCTIONS ====================

function formatDate(date) {
    // Use local date parts — toISOString() returns UTC which rolls to the
    // next day after 5pm in Arizona (UTC-7), causing off-by-one display bugs.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDisplayDate(date) {
    return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

function formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Convert 24hr time (HH:MM) to 12hr standard time (h:mm AM/PM)
// Also handles time ranges like "09:00-10:45"
function formatTime12hr(time24) {
    if (!time24) return '';
    
    // Check if it's a time range (contains hyphen with times on both sides)
    if (time24.includes('-') && time24.split('-').length === 2) {
        const [start, end] = time24.split('-');
        // Only treat as range if both parts look like times
        if (start.includes(':') && end.includes(':')) {
            return `${formatSingleTime12hr(start)}-${formatSingleTime12hr(end)}`;
        }
    }
    
    return formatSingleTime12hr(time24);
}

// Convert a single 24hr time to 12hr format
function formatSingleTime12hr(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.trim().split(':');
    const h = parseInt(hours, 10);
    if (isNaN(h)) return time24; // Return as-is if not a valid time
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes}${ampm}`;
}

// Normalize schedule[day] to always return an array of {start, end} objects
// Handles: string "09:00", object {start,end}, array [{start,end},...], falsy
function getTimeSlotsForDay(cls, day) {
    const raw = cls.schedule && cls.schedule[day];
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.filter(s => s && (s.start || s.end));
    }
    if (typeof raw === 'string') {
        const parts = raw.split('-');
        return [{ start: parts[0].trim(), end: parts[1]?.trim() || '' }];
    }
    if (typeof raw === 'object' && (raw.start || raw.end)) {
        return [{ start: raw.start || '', end: raw.end || '' }];
    }
    return [];
}

// Format a single slot as a display string
function formatTimeSlot(slot) {
    if (!slot) return '';
    const s = slot.start ? formatTime12hr(slot.start) : '';
    const e = slot.end   ? formatTime12hr(slot.end)   : '';
    return e ? s + '–' + e : s;
}

// Build a full time string for a class on a given day (all slots joined)
function buildTimeStr(cls, day) {
    const slots = getTimeSlotsForDay(cls, day);
    return slots.map(formatTimeSlot).filter(Boolean).join(' & ');
}

// Find a lesson matching a specific class, date, and slot index.
// slotIndex -1  = "spans all sessions" — matches every slot card for that class.
// slotIndex 0+  = specific session index.
// null/undefined (legacy) = slot 0 for backward compat.
// v6.5.0: for summaries/PDFs that show one line per class -- a class with
// several sessions on a day used to show only the first session's lesson.
// Returns the first lesson with every session's title joined by " / ".
function mergedLessonForClass(dayLessons, classId) {
    const list = dayLessons.filter(l => l.classId === classId)
        .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
    if (list.length <= 1) return list[0];
    return { ...list[0], title: list.map(l => l.title).filter(Boolean).join(' / ') };
}

function findLessonForSlot(dayLessons, classId, slotIndex) {
    // First: look for a span-all lesson (slotIndex === -1) — it wins for every slot
    const spanAll = dayLessons.find(l => l.classId === classId && l.slotIndex === -1);
    if (spanAll) return spanAll;
    // Then: look for a lesson specific to this slot
    return dayLessons.find(l => {
        if (l.classId !== classId) return false;
        const li = (l.slotIndex === undefined || l.slotIndex === null) ? 0 : l.slotIndex;
        return li === slotIndex;
    }) || null;
}

// Get the start time for a class on a given day (for sorting) — uses first slot
function getClassStartTime(cls, dayOfWeek) {
    const slots = getTimeSlotsForDay(cls, dayOfWeek);
    return slots.length > 0 && slots[0].start ? slots[0].start : '99:99';
}

// Sort classes by their start time for a given day
function sortClassesByTime(classesArr, dayOfWeek) {
    return [...classesArr].sort((a, b) => {
        const timeA = getClassStartTime(a, dayOfWeek);
        const timeB = getClassStartTime(b, dayOfWeek);
        return timeA.localeCompare(timeB);
    });
}

// Get the earliest scheduled day and time for a class (for Classes view sorting)
function getClassEarliestSchedule(cls) {
    if (!cls.schedule) return { day: 9, time: '99:99' };
    const dayOrder = { 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5 };
    let earliestDay = 9;
    let earliestTime = '99:99';
    for (const day of Object.keys(cls.schedule)) {
        const slots = getTimeSlotsForDay(cls, day);
        if (slots.length === 0) continue;
        const dayNum    = dayOrder[day] || 9;
        const startTime = slots[0].start || '99:99';
        if (dayNum < earliestDay || (dayNum === earliestDay && startTime < earliestTime)) {
            earliestDay  = dayNum;
            earliestTime = startTime;
        }
    }
    return { day: earliestDay, time: earliestTime };
}

// Sort classes by earliest scheduled day, then by time
function sortClassesBySchedule(classesArr) {
    return [...classesArr].sort((a, b) => {
        const schedA = getClassEarliestSchedule(a);
        const schedB = getClassEarliestSchedule(b);
        if (schedA.day !== schedB.day) return schedA.day - schedB.day;
        return schedA.time.localeCompare(schedB.time);
    });
}

// Returns the ISO week number (1-53) for a given date
function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum); // nearest Thursday
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Returns true if this class should appear on the given date,
// accounting for every-other-week scheduling.
// cls.everyOtherWeek — boolean
// cls.startingWeek   — 'A' (meets on odd ISO weeks) | 'B' (even ISO weeks)
function isClassActiveOnDate(cls, dateStr) {
    if (!cls.everyOtherWeek) return true; // normal weekly class
    const date = new Date(dateStr + 'T00:00:00');
    const isoWeek = getISOWeekNumber(date);
    const isOdd = isoWeek % 2 !== 0;
    return cls.startingWeek === 'B' ? !isOdd : isOdd; // 'A' = odd, 'B' = even
}

// Build a flat, time-sorted list of {cls, slotIndex, slot, startTime} entries for a day.
// Each slot of a multi-session class gets its own entry, sorted by its own start time.
function getSortedClassSlots(dayClasses, dow) {
    const entries = [];
    dayClasses.forEach(cls => {
        const slots = getTimeSlotsForDay(cls, dow);
        const slotCount = Math.max(slots.length, 1);
        for (let si = 0; si < slotCount; si++) {
            const slot = slots[si] || null;
            entries.push({
                cls,
                slotIndex: si,
                slot,
                slotCount,
                startTime: slot?.start || '99:99'
            });
        }
    });
    entries.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return entries;
}

// Returns the Monday that anchors the school week containing `date`.
// Sunday is treated as the FIRST day of its week (US school-calendar
// convention, matching the Sunday-first month grid and the Sun-Sat week
// columns) rather than the ISO tail of the previous week. With the old
// ISO rule, clicking "Today" on a Sunday jumped to the Mon-Fri week that
// had already ended and today's column was nowhere in the grid.
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();            // 0 = Sun ... 6 = Sat
    const diff = d.getDate() - day + 1; // Sun -> tomorrow's Monday; Mon-Sat -> this week's Monday
    return new Date(d.setDate(diff));
}

// Initialize currentWeekStart now that function is defined
currentWeekStart = getWeekStart(new Date());

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function isSameDay(date1, date2) {
    return formatDate(date1) === formatDate(date2);
}

// v6.5.0: each toast gets its full time on screen (a second toast used to
// vanish early on the first one's timer); longer messages stay longer.
let _toastTimer = null;
function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.remove('hidden');
    clearTimeout(_toastTimer);
    const ms = Math.min(8000, Math.max(3000, String(message).length * 60));
    _toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), ms);
}

function showLoading() {
    elements.loading.classList.remove('hidden');
}

function hideLoading() {
    elements.loading.classList.add('hidden');
}

// Count school days between two dates, excluding weekends and off-day events
// Check if a given dateStr (YYYY-MM-DD) falls on a holiday/break/no-school event
// Types that mean no school for students
const NO_SCHOOL_EVENT_TYPES = new Set([
    'break', 'holiday', 'no-school', 'grading', 'meeting', 'professional-learning'
]);
// Title keywords that mean "no school" when an event has no specific type.
// Whole-word matches only (v6.0.2): the old substring check let
// "Donuts with Dads Breakfast" match "break" and cancel every class that day.
const NO_SCHOOL_TITLE_RE = /\b(no school|breaks?|holidays?|grading day|professional learning|prof\. learning|planning day|induction|independence day|labor day|veterans?'? day|thanksgiving|martin luther king|mlk|rodeo|memorial day|juneteenth|school closed|non-student day)\b/;
const SCHOOL_DAY_EVENT_TYPES = new Set(['first-day', 'last-day', 'assembly', 'field-trip', 'testing']);
// A title that names something happening AT school is never a day off.
const SCHOOL_ACTIVITY_TITLE_RE = /\b(assembly|breakfast|lunch(eon)?|celebration|program|performance|parade|concert|potluck|fair|night|club)\b/;

function isNoSchoolEvent(event) {
    if (!event) return false;
    if (NO_SCHOOL_EVENT_TYPES.has(event.type)) return true;
    // These types are school happening as normal -- never a day off,
    // whatever the title says.
    if (SCHOOL_DAY_EVENT_TYPES.has(event.type)) return false;
    const t = (event.title || '').toLowerCase();
    if (SCHOOL_ACTIVITY_TITLE_RE.test(t)) return false;
    return NO_SCHOOL_TITLE_RE.test(t);
}

function isOffDay(dateStr) {
    // Dates after the last day of school are always off
    const lastDayEvent = events.find(e => e.type === 'last-day');
    if (lastDayEvent && lastDayEvent.startDate && dateStr > lastDayEvent.startDate) {
        return true;
    }
    // Dates before the first day of school are always off
    const firstDayEvent = events.find(e => e.type === 'first-day');
    if (firstDayEvent && firstDayEvent.startDate && dateStr < firstDayEvent.startDate) {
        return true;
    }
    return events.some(event => {
        if (!isNoSchoolEvent(event) || !event.startDate) return false;
        const end = event.endDate || event.startDate;
        return dateStr >= event.startDate && dateStr <= end;
    });
}

function countSchoolDaysLeft(startDate, endDate, eventsList) {
    let count = 0;
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    // v6.2.0: off days come from isNoSchoolEvent(), the single gatekeeper,
    // instead of a private copy of the rules that had drifted (it treated
    // the first and last day of school as days off and matched "break"
    // inside "Breakfast").
    const offDays = new Set();
    for (const event of (eventsList || [])) {
        if (!event || !event.startDate || !isNoSchoolEvent(event)) continue;
        const d = new Date(event.startDate + 'T00:00:00');
        const eventEnd = new Date((event.endDate || event.startDate) + 'T00:00:00');
        while (d <= eventEnd) {
            offDays.add(formatDate(d));
            d.setDate(d.getDate() + 1);
        }
    }
    
    // Count weekdays that aren't off days
    while (current <= end) {
        const dayOfWeek = current.getDay();
        const dateStr = formatDate(current);
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            if (!offDays.has(dateStr)) {
                count++;
            }
        }
        current.setDate(current.getDate() + 1);
    }
    
    return count;
}

function updateStats() {
    updateSchoolYearDisplay();
}

// Update School Year display on calendar
function updateSchoolYearDisplay() {
    // Update school year value
    const displayYear = document.getElementById('display-school-year');
    const displayStart = document.getElementById('display-year-start');
    const displayEnd = document.getElementById('display-year-end');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const breaksBanner = document.getElementById('breaks-banner');
    const breaksText = document.getElementById('breaks-text');
    
    if (displayYear) displayYear.textContent = settings.schoolYear || '2025-2026';
    
    // Find first day and last day events
    const firstDayEvent = events.find(e => e.type === 'first-day');
    const lastDayEvent = events.find(e => e.type === 'last-day');
    
    const yearStart = firstDayEvent ? firstDayEvent.startDate : null;
    const yearEnd = lastDayEvent ? lastDayEvent.startDate : null;
    
    // Format dates
    if (yearStart && displayStart) {
        const start = new Date(yearStart + 'T00:00:00');
        displayStart.textContent = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (displayStart) {
        displayStart.textContent = 'Not set';
    }
    
    if (yearEnd && displayEnd) {
        const end = new Date(yearEnd + 'T00:00:00');
        displayEnd.textContent = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (displayEnd) {
        displayEnd.textContent = 'Not set';
    }
    
    // Calculate progress
    if (yearStart && yearEnd && progressFill && progressText) {
        const start = new Date(yearStart + 'T00:00:00');
        const end = new Date(yearEnd + 'T23:59:59');
        // Normalize "now" to just the date (no time)
        const today = new Date();
        const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        if (now < start) {
            progressFill.style.width = '0%';
            progressText.textContent = 'Not started';
        } else if (now > end) {
            progressFill.style.width = '100%';
            progressText.textContent = 'Complete!';
        } else {
            const total = end - start;
            const elapsed = now - start;
            const percent = Math.round((elapsed / total) * 100);
            progressFill.style.width = percent + '%';
            progressText.textContent = percent + '% complete';
        }
        
        // Calculate school days left (excluding weekends and off days)
        const schoolDaysLeft = document.getElementById('school-days-left');
        if (schoolDaysLeft) {
            const daysLeft = countSchoolDaysLeft(now, end, events);
            if (now > end) {
                schoolDaysLeft.textContent = '';
            } else if (now < start) {
                const totalDays = countSchoolDaysLeft(start, end, events);
                schoolDaysLeft.textContent = `${totalDays} school days`;
            } else {
                schoolDaysLeft.textContent = `${daysLeft} school days left`;
            }
        }
    } else if (progressFill && progressText) {
        progressFill.style.width = '0%';
        progressText.textContent = 'Add First/Last Day events';
        const schoolDaysLeft = document.getElementById('school-days-left');
        if (schoolDaysLeft) schoolDaysLeft.textContent = '';
    }
    
    // Show upcoming or current break
    if (settings.breaks && settings.breaks.length > 0 && breaksBanner && breaksText) {
        const now = new Date();
        let upcomingBreak = null;
        let currentBreak = null;
        
        for (const brk of settings.breaks) {
            const brkStart = new Date(brk.start + 'T00:00:00');
            const brkEnd = new Date(brk.end + 'T23:59:59');
            
            if (now >= brkStart && now <= brkEnd) {
                currentBreak = brk;
                break;
            } else if (now < brkStart) {
                if (!upcomingBreak || brkStart < new Date(upcomingBreak.start + 'T00:00:00')) {
                    upcomingBreak = brk;
                }
            }
        }
        
        if (currentBreak) {
            const endDate = new Date(currentBreak.end + 'T00:00:00');
            breaksText.textContent = `🎉 Currently: ${currentBreak.name} (until ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
            breaksBanner.classList.remove('hidden');
        } else if (upcomingBreak) {
            const startDate = new Date(upcomingBreak.start + 'T00:00:00');
            const endDate = new Date(upcomingBreak.end + 'T00:00:00');
            breaksText.textContent = `Upcoming: ${upcomingBreak.name} (${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
            breaksBanner.classList.remove('hidden');
        } else {
            breaksBanner.classList.add('hidden');
        }
    } else if (breaksBanner) {
        breaksBanner.classList.add('hidden');
    }
}

