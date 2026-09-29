// ============================================
// PHASE 2: RECURRING LESSONS
// ============================================

function initRecurringLessons() {
    const recurringCheckbox = document.getElementById('lesson-recurring');
    const recurringOptions = document.getElementById('recurring-options');

    recurringCheckbox?.addEventListener('change', (e) => {
        if (e.target.checked) {
            recurringOptions?.classList.remove('hidden');
        } else {
            recurringOptions?.classList.add('hidden');
        }
    });

    // Same show/hide behavior for the "Copy to a different date" picker's
    // own recurrence checkbox.
    const copyRecurringCheckbox = document.getElementById('copy-lesson-recurring');
    const copyRecurringOptions = document.getElementById('copy-recurring-options');

    copyRecurringCheckbox?.addEventListener('change', (e) => {
        if (e.target.checked) {
            copyRecurringOptions?.classList.remove('hidden');
        } else {
            copyRecurringOptions?.classList.add('hidden');
        }
    });
}

// Shared date-generation logic for any "recurring" feature (new lessons,
// copying a lesson to a date, etc). Returns an array of "YYYY-MM-DD" date
// strings starting from the NEXT occurrence after `startDate` (the start
// date itself is never included -- callers add it separately if needed).
//
// Prefers the calendar's actual "last day of school" event as the source of
// truth for "Rest of year"/"Rest of semester" (same source isOffDay and the
// year progress bar use), falling back to settings.yearEnd only if it's
// chronologically after the start date, then to a computed May 31 default.
function generateRecurringDates(startDate, frequency, countValue) {
    const dates = [];
    const start = new Date(startDate + 'T00:00:00');

    const lastDayEvent = events.find(e => e.type === 'last-day');
    let yearEnd = lastDayEvent?.startDate ? new Date(lastDayEvent.startDate + 'T00:00:00') : null;

    if (!yearEnd && settings.yearEnd) {
        const candidate = new Date(settings.yearEnd + 'T00:00:00');
        if (candidate > start) yearEnd = candidate;
    }

    if (!yearEnd) {
        // Last resort: assume a typical school year ending in late May, the
        // year after `start` if `start` falls in the Jul-Dec half of the year.
        const fallbackYear = start.getMonth() >= 6 ? start.getFullYear() + 1 : start.getFullYear();
        yearEnd = new Date(`${fallbackYear}-05-31T00:00:00`);
        showToast('No "last day of school" event found -- assuming the year ends May 31. Add a Last Day event for an exact end date.');
    }

    let maxWeeks;
    if (countValue === 'semester') {
        // Approximately 18 weeks
        maxWeeks = 18;
    } else if (countValue === 'year') {
        // Calculate weeks until year end
        maxWeeks = Math.floor((yearEnd - start) / (7 * 24 * 60 * 60 * 1000));
    } else {
        maxWeeks = parseInt(countValue);
    }

    const weekIncrement = frequency === 'biweekly' ? 2 : 1;

    let current = new Date(start);
    current.setDate(current.getDate() + (7 * weekIncrement)); // Start from next occurrence

    for (let i = 0; i < maxWeeks && current <= yearEnd; i++) {
        // Skip weekends and no-school days (v6.2.0 -- recurring lessons were
        // being created during Thanksgiving and winter break)
        if (current.getDay() !== 0 && current.getDay() !== 6 && !isOffDay(formatDate(current))) {
            dates.push(formatDate(current));
        }
        current.setDate(current.getDate() + (7 * weekIncrement));
    }

    return dates;
}

async function createRecurringLessons(baseLessonData, startDate) {
    const frequency = document.getElementById('recurring-frequency')?.value || 'weekly';
    const countValue = document.getElementById('recurring-count')?.value || '4';

    const dates = generateRecurringDates(startDate, frequency, countValue);

    // Create a recurring group ID
    const recurringGroupId = `recurring_${Date.now()}`;
    
    // Create lessons for each date
    const createdLessons = [];
    for (let i = 0; i < dates.length; i++) {
        const lessonData = {
            ...baseLessonData,
            date: dates[i],
            recurringGroupId: recurringGroupId,
            recurringIndex: i + 2, // Start lesson is index 1
            createdAt: new Date().toISOString()
        };
        
        try {
            const docRef = await getYearPath().collection('lessons').add(lessonData);
            createdLessons.push({ id: docRef.id, ...lessonData });
        } catch (error) {
            console.error('Error creating recurring lesson:', error);
        }
    }
    
    // Add to local array
    lessons.push(...createdLessons);
    
    return createdLessons.length;
}

// ============================================
// PHASE 2: LESSON LINKING (MULTI-DAY LESSONS)
// ============================================

let lessonLinkGroups = {};

function initLessonLinking() {
    const linkGroupSelect = document.getElementById('lesson-link-group');
    const partSelector = document.getElementById('link-part-selector');
    
    linkGroupSelect?.addEventListener('change', (e) => {
        if (e.target.value === 'new' || e.target.value) {
            partSelector?.classList.remove('hidden');
        } else {
            partSelector?.classList.add('hidden');
        }
    });
    
    // Load existing link groups
    loadLinkGroups();
}

function loadLinkGroups() {
    lessonLinkGroups = {};
    
    lessons.forEach(lesson => {
        if (lesson.linkGroupId) {
            if (!lessonLinkGroups[lesson.linkGroupId]) {
                lessonLinkGroups[lesson.linkGroupId] = [];
            }
            lessonLinkGroups[lesson.linkGroupId].push(lesson);
        }
    });
    
    // Sort each group by part number
    Object.keys(lessonLinkGroups).forEach(groupId => {
        lessonLinkGroups[groupId].sort((a, b) => (a.partNumber || 1) - (b.partNumber || 1));
    });
    
    updateLinkGroupSelect();
}

function updateLinkGroupSelect() {
    const select = document.getElementById('lesson-link-group');
    if (!select) return;
    
    // Keep first two options
    select.innerHTML = `
        <option value="">Not part of a series</option>
        <option value="new">+ Create new series</option>
    `;
    
    // Add existing groups
    Object.keys(lessonLinkGroups).forEach(groupId => {
        const group = lessonLinkGroups[groupId];
        if (group.length > 0) {
            const firstLesson = group[0];
            const option = document.createElement('option');
            option.value = groupId;
            option.textContent = `${firstLesson.title} (${group.length} parts)`;
            select.appendChild(option);
        }
    });
}

function renderLinkedLessonsNav(currentLesson) {
    const nav = document.getElementById('linked-lessons-nav');
    if (!nav || !currentLesson.linkGroupId) {
        nav?.classList.add('hidden');
        return;
    }
    
    const group = lessonLinkGroups[currentLesson.linkGroupId] || [];
    if (group.length < 2) {
        nav.classList.add('hidden');
        return;
    }
    
    nav.classList.remove('hidden');
    nav.innerHTML = `
        <h5>🔗 Linked Lessons (${group.length} parts)</h5>
        ${group.map(lesson => `
            <div class="linked-lesson-item ${lesson.id === currentLesson.id ? 'current' : ''}" 
                 onclick="navigateToLinkedLesson('${lesson.id}')">
                <span class="linked-lesson-part">Part ${lesson.partNumber || '?'}</span>
                <span class="linked-lesson-date">${formatDisplayDate(new Date(lesson.date + 'T00:00:00'))}</span>
            </div>
        `).join('')}
    `;
}

function navigateToLinkedLesson(lessonId) {
    const lesson = lessons.find(l => l.id === lessonId);
    if (lesson) {
        openLessonModal(lesson);
    }
}

