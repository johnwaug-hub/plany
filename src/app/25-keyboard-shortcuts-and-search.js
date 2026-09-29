// ============================================
// PHASE 1: KEYBOARD SHORTCUTS
// ============================================

function initKeyboardShortcuts() {
    document.addEventListener('keydown', handleKeyboardShortcut);
    
    // Keyboard help button
    document.getElementById('keyboard-help-btn')?.addEventListener('click', () => {
        document.getElementById('keyboard-modal')?.classList.remove('hidden');
    });
}

function handleKeyboardShortcut(e) {
    // Don't trigger shortcuts when typing in inputs
    const activeEl = document.activeElement;
    const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;
    
    // Allow Escape and Ctrl+K even in inputs. A modal already handled
    // this Escape above (top-most only); otherwise close any open pickers.
    if (e.key === 'Escape') {
        if (!e._planyModalHandled && !document.querySelector('.modal:not(.hidden)')) closeAllModals();
        return;
    }
    
    // Ctrl/Cmd + K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearchModal();
        return;
    }
    
    // Don't process other shortcuts if in input. (v6.0.2: this now comes
    // BEFORE undo/redo, so Ctrl+Z in a text box undoes your typing instead
    // of reverting a lesson change in the database.)
    if (isInput) return;

    const _k = (e.key || '').toLowerCase();
    if (typeof _previewTeacher !== 'undefined' && _previewTeacher && (e.ctrlKey || e.metaKey) && (_k === 'z' || _k === 'y')) return;
    // Ctrl/Cmd + Z for undo
    if ((e.ctrlKey || e.metaKey) && _k === 'z' && !e.shiftKey) {
        e.preventDefault();
        performUndo();
        return;
    }
    
    // Ctrl/Cmd + Y or Ctrl+Shift+Z for redo
    if ((e.ctrlKey || e.metaKey) && (_k === 'y' || (_k === 'z' && e.shiftKey))) {
        e.preventDefault();
        performRedo();
        return;
    }
    
    // ? for help
    if (e.key === '?') {
        document.getElementById('keyboard-modal')?.classList.remove('hidden');
        return;
    }
    
    // v6.5.0: while a principal previews a teacher's Plany (read-only),
    // the create shortcuts would have saved into the principal's own account.
    const _sk = (e.key || '').toLowerCase();
    if (typeof _previewTeacher !== 'undefined' && _previewTeacher && ['n', 'e', 'c'].includes(_sk) && !e.ctrlKey && !e.metaKey) return;

    // Navigation shortcuts. Guard against e.key being unset -- some
    // synthetic/IME key events reach this handler without a populated key.
    switch (_sk) {
        case 't':
            // Go to today
            goToToday();
            break;
        case 'n':
            // New lesson
            e.preventDefault();
            openLessonModal();
            break;
        case 'e':
            // New event
            e.preventDefault();
            openEventModal();
            break;
        case 'c':
            // New class (only if not Ctrl+C)
            if (!e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                openClassModal();
            }
            break;
        case 'arrowleft':
            navigatePrevious();
            break;
        case 'arrowright':
            navigateNext();
            break;
        case '1':
            switchView('year');
            break;
        case '2':
            switchView('calendar');
            break;
        case '3':
            switchView('week');
            break;
        case '4':
            switchView('classes');
            break;
        case '5':
            switchView('day');
            break;
        case '6':
            switchView('settings');
            break;
    }
}

// Move every view to one date -- all three anchors together.
function jumpToDate(d) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    currentDate      = new Date(day);
    currentDayDate   = new Date(day);
    currentWeekStart = getWeekStart(new Date(day));
}

// Re-render whichever view is showing, plus month/week which other code reads.
function renderAfterJump() {
    renderCalendar();
    renderWeek();
    const active = document.querySelector('.view.active')?.id;
    if (active === 'day-view' && typeof renderDayView === 'function') renderDayView();
    if (active === 'year-view' && typeof renderYearView === 'function') renderYearView();
}

function goToToday() {
    jumpToDate(new Date());
    renderAfterJump();                       // v6.2.0: Day/Year view redraw too
    showToast('📅 Jumped to today');
}

function navigatePrevious() {
    const currentView = document.querySelector('.view.active')?.id;
    if (currentView === 'calendar-view' || currentView === 'year-view') {
        document.getElementById('prev-month')?.click();
    } else if (currentView === 'week-view') {
        document.getElementById('prev-week')?.click();
    } else if (currentView === 'day-view') {
        document.getElementById('prev-day-btn')?.click();
    }
}

function navigateNext() {
    const currentView = document.querySelector('.view.active')?.id;
    if (currentView === 'calendar-view' || currentView === 'year-view') {
        document.getElementById('next-month')?.click();
    } else if (currentView === 'week-view') {
        document.getElementById('next-week')?.click();
    } else if (currentView === 'day-view') {
        document.getElementById('next-day-btn')?.click();
    }
}

function switchView(viewName) {
    const navItem = document.querySelector(`[data-view="${viewName}"]`);
    if (navItem) {
        navItem.click();
    }
}

// ============================================
// PHASE 1: GLOBAL SEARCH
// ============================================

let searchDebounceTimer = null;

function initGlobalSearch() {
    // Header search input
    const headerSearch = document.getElementById('global-search-input');
    headerSearch?.addEventListener('focus', openSearchModal);
    headerSearch?.addEventListener('click', openSearchModal);
    
    // Modal search input
    const modalSearch = document.getElementById('search-modal-input');
    modalSearch?.addEventListener('input', handleSearchInput);
    
    // Search filters
    document.querySelectorAll('#search-lessons, #search-events, #search-classes').forEach(cb => {
        cb.addEventListener('change', () => performSearch(modalSearch?.value));
    });
    
    // Date filters
    document.getElementById('search-date-from')?.addEventListener('change', () => performSearch(modalSearch?.value));
    document.getElementById('search-date-to')?.addEventListener('change', () => performSearch(modalSearch?.value));
}

function openSearchModal() {
    const modal = document.getElementById('search-modal');
    modal?.classList.remove('hidden');
    
    setTimeout(() => {
        document.getElementById('search-modal-input')?.focus();
    }, 100);
}

function handleSearchInput(e) {
    const query = e.target.value;
    
    // Debounce search
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        performSearch(query);
    }, 200);
}

function performSearch(query) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    if (!query || query.trim().length < 2) {
        resultsContainer.innerHTML = '<p class="search-hint">Start typing to search...</p>';
        return;
    }
    
    const searchLessons = document.getElementById('search-lessons')?.checked ?? true;
    const searchEvents = document.getElementById('search-events')?.checked ?? true;
    const searchClasses = document.getElementById('search-classes')?.checked ?? true;
    
    const dateFrom = document.getElementById('search-date-from')?.value;
    const dateTo = document.getElementById('search-date-to')?.value;
    
    const queryLower = query.toLowerCase();
    const results = [];
    
    // Debug logging
    console.log('Search debug:', {
        query: queryLower,
        searchLessons,
        searchEvents, 
        searchClasses,
        lessonsCount: lessons.length,
        eventsCount: events.length,
        classesCount: classes.length
    });
    
    // Search lessons
    if (searchLessons && lessons.length > 0) {
        lessons.forEach(lesson => {
            if (matchesDateFilter(lesson.date, dateFrom, dateTo) && matchesQuery(lesson, queryLower, ['title', 'subject', 'standards', 'flow', 'materials', 'activities'])) {
                const cls = classes.find(c => c.id === lesson.classId);
                results.push({
                    type: 'lesson',
                    icon: '📝',
                    title: lesson.title,
                    meta: `${formatDisplayDate(new Date(lesson.date + 'T00:00:00'))} • ${cls?.name || 'No class'}`,
                    data: lesson,
                    score: getSearchScore(lesson, queryLower, ['title', 'subject'])
                });
            }
        });
    }
    
    // Search events
    if (searchEvents && events.length > 0) {
        events.forEach(event => {
            if (matchesDateFilter(event.startDate, dateFrom, dateTo) && matchesQuery(event, queryLower, ['title', 'description'])) {
                const startDateObj = new Date(event.startDate + 'T00:00:00');
                const endDateObj = event.endDate ? new Date(event.endDate + 'T00:00:00') : null;
                results.push({
                    type: 'event',
                    icon: getEventIcon(event.type),
                    title: event.title,
                    meta: formatDisplayDate(startDateObj) + (endDateObj && event.endDate !== event.startDate ? ` - ${formatDisplayDate(endDateObj)}` : ''),
                    data: event,
                    score: getSearchScore(event, queryLower, ['title'])
                });
            }
        });
    }
    
    // Search classes
    if (searchClasses) {
        classes.forEach(cls => {
            if (matchesQuery(cls, queryLower, ['name', 'subject'])) {
                results.push({
                    type: 'class',
                    icon: '🎓',
                    title: cls.name,
                    meta: cls.subject || 'No subject',
                    data: cls,
                    score: getSearchScore(cls, queryLower, ['name'])
                });
            }
        });
    }
    
    // Sort by score (higher is better)
    results.sort((a, b) => b.score - a.score);
    
    // Render results
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="search-no-results">No results found</div>';
    } else {
        resultsContainer.innerHTML = results.slice(0, 50).map(result => `
            <div class="search-result-item" onclick="handleSearchResultClick('${result.type}', '${result.data.id}')">
                <span class="search-result-icon">${result.icon}</span>
                <div class="search-result-content">
                    <div class="search-result-title">${highlightMatch(result.title, query)}</div>
                    <div class="search-result-meta">${result.meta}</div>
                </div>
                <span class="search-result-type">${result.type}</span>
            </div>
        `).join('');
    }
}

function matchesQuery(obj, query, fields) {
    return fields.some(field => {
        const value = obj[field];
        return value && value.toString().toLowerCase().includes(query);
    });
}

function matchesDateFilter(date, from, to) {
    if (!date) return true;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
}

function getSearchScore(obj, query, priorityFields) {
    let score = 0;
    priorityFields.forEach((field, index) => {
        const value = obj[field];
        if (value && value.toString().toLowerCase().includes(query)) {
            score += (priorityFields.length - index) * 10;
            if (value.toString().toLowerCase().startsWith(query)) {
                score += 20;
            }
        }
    });
    return score;
}

function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="search-result-highlight">$1</span>');
}

function getEventIcon(type) {
    const icons = {
        'first-day': '🎉',
        'last-day': '🏁',
        'break': '🏖️',
        'holiday': '🎄',
        'grading': '📊',
        'conference': '👥',
        'professional': '📚',
        'event': '📌'
    };
    return icons[type] || '📌';
}

function handleSearchResultClick(type, id) {
    closeAllModals();
    
    if (type === 'lesson') {
        const lesson = lessons.find(l => l.id === id);
        if (lesson) {
            // Local-midnight parse (plain new Date('YYYY-MM-DD') is UTC and
            // lands on the previous day in Arizona) + all three anchors.
            jumpToDate(new Date(lesson.date + 'T00:00:00'));
            renderAfterJump();
            setTimeout(() => openLessonModal(lesson), 200);
        }
    } else if (type === 'event') {
        const event = events.find(e => e.id === id);
        if (event) {
            jumpToDate(new Date(event.startDate + 'T00:00:00'));
            renderAfterJump();
            setTimeout(() => openEventModal(event), 200);
        }
    } else if (type === 'class') {
        switchView('classes');
        const cls = classes.find(c => c.id === id);
        if (cls) {
            setTimeout(() => openClassModal(cls), 200);
        }
    }
}

