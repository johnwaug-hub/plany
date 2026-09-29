// ==================== EVENT MODAL ====================

function openEventModal(event = null, dateStr = null) {
    const form = document.getElementById('event-form');
    form.reset();
    document.getElementById('event-id').value = '';
    
    const deleteBtn = document.getElementById('delete-event-btn');
    const allDayCheckbox = document.getElementById('event-all-day');
    const timeInputs = document.querySelectorAll('#event-start-time, #event-end-time');
    
    // Toggle time inputs based on all-day checkbox
    const toggleTimeInputs = () => {
        timeInputs.forEach(input => {
            input.disabled = allDayCheckbox.checked;
            if (allDayCheckbox.checked) input.value = '';
        });
    };
    
    allDayCheckbox.removeEventListener('change', toggleTimeInputs);
    allDayCheckbox.addEventListener('change', toggleTimeInputs);
    
    if (event) {
        document.getElementById('event-modal-title').textContent = '📌 Edit Event';
        document.getElementById('event-id').value = event.id;
        document.getElementById('event-title').value = event.title;
        document.getElementById('event-type').value = event.type || 'event';
        document.getElementById('event-start').value = event.startDate;
        document.getElementById('event-end').value = event.endDate || '';
        document.getElementById('event-start-time').value = event.startTime || '';
        document.getElementById('event-end-time').value = event.endTime || '';
        document.getElementById('event-all-day').checked = !event.startTime;
        document.getElementById('event-notes').value = event.notes || '';
        
        timeInputs.forEach(input => input.disabled = !event.startTime);
        deleteBtn.classList.remove('hidden');
    } else {
        document.getElementById('event-modal-title').textContent = '📌 Add Event';
        document.getElementById('event-start').value = dateStr || formatDate(new Date());
        deleteBtn.classList.add('hidden');
        timeInputs.forEach(input => input.disabled = true);
    }
    
    document.getElementById('event-modal').classList.remove('hidden');
}

// Event form submit
document.getElementById('event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    console.log('Event form submitted');
    
    const eventData = {
        title: document.getElementById('event-title').value.trim(),
        type: document.getElementById('event-type').value,
        startDate: document.getElementById('event-start').value,
        endDate: document.getElementById('event-end').value || document.getElementById('event-start').value,
        startTime: document.getElementById('event-all-day').checked ? null : document.getElementById('event-start-time').value,
        endTime: document.getElementById('event-all-day').checked ? null : document.getElementById('event-end-time').value,
        notes: document.getElementById('event-notes').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    console.log('Event data:', eventData);
    
    showLoading();
    try {
        const eventId = document.getElementById('event-id').value;
        const yearPath = getYearPath();
        if (eventId) {
            await yearPath.collection('events').doc(eventId).update(eventData);
            const index = events.findIndex(e => e.id === eventId);
            events[index] = { ...events[index], ...eventData };
            showToast('Event updated!');
        } else {
            eventData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await yearPath.collection('events').add(eventData);
            events.push({ id: docRef.id, ...eventData });
            console.log('Events array now:', events);
            showToast('Event added!');
        }
        
        closeAllModals();
        renderCalendar();
        renderWeek();
        updateYearChecklist();
        updateSchoolYearDisplay();
        console.log('Calendar re-rendered');
    } catch (error) {
        console.error('Error saving event:', error);
        showToast('Error saving event');
    }
    hideLoading();
});

// Delete event
document.getElementById('delete-event-btn').addEventListener('click', async () => {
    if (!await planyConfirm('Delete this event?')) return;
    
    const eventId = document.getElementById('event-id').value;
    showLoading();
    try {
        await getYearPath().collection('events').doc(eventId).delete();
        events = events.filter(e => e.id !== eventId);
        closeAllModals();
        renderCalendar();
        renderWeek();
        updateSchoolYearDisplay();
        showToast('Event deleted');
    } catch (error) {
        showToast('Error deleting event');
    }
    hideLoading();
});

// Add event to day button
document.getElementById('add-event-to-day').addEventListener('click', () => {
    const dateStr = elements.dayModal.dataset.date;
    // Open event modal on top of day modal (don't close day modal)
    openEventModal(null, dateStr);
});

// FAB removed

// ==================== CALENDAR PDF IMPORT ====================

// ── On-demand libraries (v6.3.0) ───────────────────────────────────────
// Loaded the first time a feature needs them (and pre-loaded quietly after
// sign-in), instead of blocking every page load.
const LIBS = {
    // v6.5.0: PDF.js 4.10.38 (legacy build, for older classroom devices),
    // served from plany.work itself -- an ES module, so it's imported rather
    // than added as a script tag, and its worker runs same-origin.
    pdfjs: { module: '/vendor/pdfjs/pdf.min.mjs', ready: () => typeof pdfjsLib !== 'undefined',
             after: () => { pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs'; } },
    jspdf: { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', ready: () => !!window.jspdf },
    xlsx:  { src: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', ready: () => typeof XLSX !== 'undefined' },
    jszip: { src: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', ready: () => typeof JSZip !== 'undefined' }
};
const _libPromises = {};
function ensureLib(name) {
    const lib = LIBS[name];
    if (!lib) return Promise.reject(new Error('Unknown library ' + name));
    if (lib.ready()) { if (lib.after && !lib._done) { lib.after(); lib._done = true; } return Promise.resolve(); }
    if (_libPromises[name]) return _libPromises[name];
    if (lib.module) {
        _libPromises[name] = import(lib.module).then(m => {
            window.pdfjsLib = m;
            if (lib.after) { lib.after(); lib._done = true; }
        }).catch(e => {
            delete _libPromises[name];
            throw new Error('Could not load a tool Plany needs. Check your internet connection and try again.');
        });
        return _libPromises[name];
    }
    _libPromises[name] = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = lib.src;
        el.async = true;
        el.onload = () => { if (lib.after) { lib.after(); lib._done = true; } resolve(); };
        el.onerror = () => { delete _libPromises[name]; el.remove(); reject(new Error('Could not load a tool Plany needs. Check your internet connection and try again.')); };
        document.head.appendChild(el);
    });
    return _libPromises[name];
}
// Home-screen shortcuts from manifest.json (v6.3.0 -- they did nothing before)
function handleLaunchShortcut() {
    let q;
    try { q = new URLSearchParams(window.location.search); } catch (_) { return; }
    const action = q.get('action'), view = q.get('view');
    if (!action && !view) return;
    try { window.history.replaceState({}, document.title, '/'); } catch (_) {}
    if (view === 'week') {
        jumpToDate(new Date());
        document.querySelector('[data-view="week"]')?.click();
    }
    if (action === 'add-lesson') {
        jumpToDate(new Date());
        openLessonModal(null, formatDate(new Date()));
    }
}

function preloadLibsWhenIdle() {
    const go = () => Object.keys(LIBS).forEach(n => ensureLib(n).catch(() => {}));
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 8000 }); else setTimeout(go, 4000);
}

// Set PDF.js worker - retry if not loaded yet
function initPdfWorker() {
    if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
        return true;
    }
    return false;
}

// Try to initialize, and retry a few times if library not loaded yet
if (!initPdfWorker()) {
    setTimeout(initPdfWorker, 500);
    setTimeout(initPdfWorker, 1500);
}

let pendingImportEvents = [];

// Only add JS event listener (remove the inline onclick from HTML is recommended)
document.getElementById('import-calendar-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = document.getElementById('calendar-pdf-input');
    if (input) {
        input.value = ''; // Reset to allow re-selecting same file
        input.click();
    }
});

document.getElementById('calendar-pdf-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
        console.log('No file selected');
        return;
    }
    
    console.log('Processing PDF:', file.name, file.size, 'bytes');
    document.getElementById('import-filename').textContent = file.name;
    showLoading();
    
    try {
        // Ensure PDF.js worker is initialized
        await ensureLib('pdfjs');
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js library not loaded');
        }
        initPdfWorker();
        
        const arrayBuffer = await file.arrayBuffer();
        console.log('ArrayBuffer loaded, size:', arrayBuffer.byteLength);
        
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false }).promise;
        console.log('PDF loaded, pages:', pdf.numPages);
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        
        console.log('Extracted text length:', fullText.length);
        console.log('First 500 chars:', fullText.substring(0, 500));
        
        // Parse calendar: AI-first (more reliable with messy PDF text),
        // regex fallback if no API key or AI fails.
        if (hasEffectiveAiKey()) {
            document.querySelector('.loading-text') && (document.querySelector('.loading-text').textContent = 'Asking Claude to parse calendar…');
            try {
                const aiEvents = await parseCalendarWithAI(fullText);
                if (aiEvents && aiEvents.length > 0) {
                    pendingImportEvents = aiEvents;
                    displayImportPreview(aiEvents);
                    hideLoading();
                    return;
                }
                // AI returned 0 events — fall through to regex
                console.warn('AI returned 0 events, falling back to regex parser');
            } catch (aiErr) {
                console.error('AI calendar parse error:', aiErr, '— falling back to regex');
            }
        }
        
        // Regex fallback (or primary when no API key)
        const parsedEvents = parseCalendarText(fullText);
        console.log('Regex parsed events:', parsedEvents.length);
        
        if (parsedEvents.length === 0) {
            showToast('No events found. The PDF may not be a recognized school calendar.');
            hideLoading();
            return;
        }
        
        pendingImportEvents = parsedEvents;
        displayImportPreview(parsedEvents);
        
    } catch (error) {
        console.error('Error parsing PDF:', error);
        showToast('Error reading PDF: ' + error.message);
    }
    
    hideLoading();
});

function parseCalendarText(text) {
    const events = [];
    const currentYear = parseInt(settings.schoolYear.split('-')[0]);
    const nextYear = currentYear + 1;
    
    // Normalize text - handle various spacing and formatting issues from PDF extraction
    const normalizedText = text
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .replace(/[\u2013\u2014]/g, '-')  // Normalize dashes
        .replace(/[\u2018\u2019]/g, "'")  // Normalize quotes
        .trim();
    
    console.log('Normalized text sample:', normalizedText.substring(0, 300));
    
    const monthMap = {
        'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
        'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'sept': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    
    // TUSD calendar event patterns - more flexible matching
    // Patterns try to match both "Event Month Day" and table format variations
    // Day-range separator: dash, en-dash, or space (PDF.js sometimes strips dashes from table cells)
    const SEP = '[\u2013\-\s]';
    
    const eventPatterns = [
        // Single day events
        { regex: /Independence\s+Day\s+(\w+)\s+(\d+)/i, title: 'Independence Day', type: 'holiday' },
        { regex: /First\s+Day\s+(?:for\s+)?Students?\s+(\w+)\s+(\d+)/i, title: 'First Day of School', type: 'first-day' },
        { regex: /Last\s+Day\s+(?:for\s+)?Students?\s+(\w+)\s+(\d+)/i, title: 'Last Day of School', type: 'last-day' },
        { regex: /Labor\s+Day\s+(\w+)\s+(\d+)/i, title: 'Labor Day', type: 'holiday' },
        { regex: /Veteran['']?s?\s+Day\s+(\w+)\s+(\d+)/i, title: "Veteran's Day", type: 'holiday' },
        { regex: /Martin\s+Luther\s+King[,.]?\s*Jr\.?\s*Day\s+(\w+)\s+(\d+)/i, title: 'MLK Day', type: 'holiday' },
        { regex: /Memorial\s+Day\s+(\w+)\s+(\d+)/i, title: 'Memorial Day', type: 'holiday' },
        { regex: /Juneteenth\s+(\w+)\s+(\d+)/i, title: 'Juneteenth', type: 'holiday' },
        
        // Multi-day events in same month (SEP handles dash, en-dash, or space from PDF extraction)
        { regex: new RegExp('Thanksgiving\\s+Break\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Thanksgiving Break', type: 'holiday', multiDay: true },
        { regex: new RegExp('Fall\\s+Break\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Fall Break', type: 'holiday', multiDay: true },
        { regex: new RegExp('Spring\\s+Break\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Spring Break', type: 'holiday', multiDay: true },
        { regex: new RegExp('Rodeo\\s+Break\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Rodeo Break', type: 'holiday', multiDay: true },
        { regex: new RegExp('Graduation\\s+(?:Day)?\\s*(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Graduation', type: 'event', multiDay: true },
        
        // Cross-month events (Winter Break: "December-January 21-1")
        { regex: new RegExp('Winter\\s+Break\\s+(\\w+)[\\u2013\\-\\s](\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Winter Break', type: 'holiday', crossMonth: true },
        
        // Conferences - K-8 multi-day
        { regex: new RegExp('Parent\\/?Teacher\\s+Conference[s]?\\s*\\(?(?:grades?\\s*)?K[\\u2013\\-]?8\\)?\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Parent/Teacher Conferences (K-8)', type: 'meeting', multiDay: true },
        // Conferences - 9-12 single day
        { regex: /Parent\/?Teacher\s+Conference[s]?\s*\(?(?:grades?\s*)?9[\u2013\-]?12\)?\s+(\w+)\s+(\d+)/i, title: 'Parent/Teacher Conferences (9-12)', type: 'meeting' },
        
        // Teacher Planning Days (no school for students, listed as G in TUSD calendar)
        { regex: new RegExp('Teacher\\s+Planning\\s+Days?\\s+(\\w+)\\s+(\\d+)' + SEP + '(\\d+)', 'i'), title: 'Teacher Planning Days (No School)', type: 'holiday', multiDay: true },
        
        // Professional days and grading days - multiple instances, handle ranges
        { regex: /Grading\s+Day\s+(\w+)\s+(\d+)/gi, title: 'Grading Day (No School)', type: 'holiday', findAll: true },
        { regex: new RegExp('Prof(?:essional)?[.]?\\s*Learning\\s+Days?\\s*(?:Staff)?\\s*\\(?(?:No\\s*School)?\\)?\\s+(\\w+)\\s+(\\d+)(?:' + SEP + '(\\d+))?', 'gi'), title: 'Professional Learning Day (No School)', type: 'holiday', findAll: true, maybeMultiDay: true },
    ];
    
    for (const pattern of eventPatterns) {
        if (pattern.findAll) {
            // Find all matches for events that occur multiple times
            const matches = [...normalizedText.matchAll(pattern.regex)];
            for (const match of matches) {
                processMatch(match, pattern, events, currentYear, nextYear, monthMap);
            }
        } else {
            const match = normalizedText.match(pattern.regex);
            if (match) {
                processMatch(match, pattern, events, currentYear, nextYear, monthMap);
            }
        }
    }
    
    // Helper function to process a match
    function processMatch(match, pattern, events, currentYear, nextYear, monthMap) {
        let startDate, endDate;
        
        try {
            if (pattern.crossMonth) {
                const startMonth = monthMap[match[1].toLowerCase()];
                const endMonth = monthMap[match[2].toLowerCase()];
                if (startMonth === undefined || endMonth === undefined) {
                    console.log('Failed to parse months for', pattern.title, ':', match[1], match[2]);
                    return;
                }
                const startDay = parseInt(match[3]);
                const endDay = parseInt(match[4]);
                
                const startYear = startMonth >= 6 ? currentYear : nextYear;
                const endYear = endMonth >= 6 ? currentYear : nextYear;
                
                startDate = formatDate(new Date(startYear, startMonth, startDay));
                endDate = formatDate(new Date(endYear, endMonth, endDay));
            } else if (pattern.multiDay || (pattern.maybeMultiDay && match[3])) {
                const month = monthMap[match[1].toLowerCase()];
                if (month === undefined) {
                    console.log('Failed to parse month for', pattern.title, ':', match[1]);
                    return;
                }
                const startDay = parseInt(match[2]);
                const endDay = parseInt(match[3]);
                
                const year = month >= 6 ? currentYear : nextYear;
                
                startDate = formatDate(new Date(year, month, startDay));
                endDate = formatDate(new Date(year, month, endDay));
            } else {
                const month = monthMap[match[1].toLowerCase()];
                if (month === undefined) {
                    console.log('Failed to parse month for', pattern.title, ':', match[1]);
                    return;
                }
                const day = parseInt(match[2]);
                
                const year = month >= 6 ? currentYear : nextYear;
                
                startDate = formatDate(new Date(year, month, day));
                endDate = startDate;
            }
            
            // Check if event already exists
            const exists = events.find(e => e.title === pattern.title && e.startDate === startDate);
            if (!exists && startDate) {
                console.log('Found event:', pattern.title, startDate, endDate);
                events.push({
                    title: pattern.title,
                    type: pattern.type,
                    startDate,
                    endDate: endDate !== startDate ? endDate : null,
                    selected: true
                });
            }
        } catch (err) {
            console.error('Error processing match for', pattern.title, ':', err);
        }
    }
    
    // Sort by date
    events.sort((a, b) => a.startDate.localeCompare(b.startDate));
    
    console.log('Total events found:', events.length);
    return events;
}

