// ============================================
// SMART EXCEL IMPORT SYSTEM
// ============================================

// Smart Excel Import data
let smartExcelAllLessons = [];     // All lessons from Excel file
let smartExcelSections = [];       // Available sections (modules/units)
let smartExcelSelectedLessons = []; // Lessons from selected section
// excelOnlyLessons is declared above in Smart Import section

// Raw Excel data and headers for manual mapping
let smartExcelRawData = [];
let smartExcelHeaders = [];

// Initialize Smart Excel Import UI
function initExcelOnlyImport() {
    console.log('Initializing Smart Excel Import...');
    
    // Update class dropdown
    updateExcelOnlyClassDropdown();
    
    // File select button
    const selectBtn = document.getElementById('excel-only-select-btn');
    const fileInput = document.getElementById('excel-only-file-input');
    
    if (selectBtn && fileInput) {
        selectBtn.addEventListener('click', () => {
            const classId = document.getElementById('excel-only-class').value;
            
            if (!classId) {
                showToast('Please select a class first');
                return;
            }
            
            fileInput.click();
        });
    }
    
    // File input change
    if (fileInput) {
        fileInput.addEventListener('change', handleSmartExcelUpload);
    }
    
    // Apply mapping button
    const applyMappingBtn = document.getElementById('apply-mapping-btn');
    if (applyMappingBtn) {
        applyMappingBtn.addEventListener('click', applyColumnMapping);
    }
    
    // Section select change
    const sectionSelect = document.getElementById('excel-section-select');
    if (sectionSelect) {
        sectionSelect.addEventListener('change', handleSectionChange);
    }
    
    // Start date change - regenerate preview with dates
    const startDateInput = document.getElementById('excel-only-start-date');
    if (startDateInput) {
        startDateInput.addEventListener('change', generateDatedPreview);
    }
    
    // Days per lesson change - regenerate preview
    const daysPerLessonSelect = document.getElementById('excel-days-per-lesson');
    if (daysPerLessonSelect) {
        daysPerLessonSelect.addEventListener('change', generateDatedPreview);
    }
    
    // Import button
    const importBtn = document.getElementById('excel-only-import-btn');
    if (importBtn) {
        importBtn.addEventListener('click', excelOnlyImportLessons);
    }
    
    console.log('Smart Excel Import initialized');
}

// Update Excel Only class dropdown
function updateExcelOnlyClassDropdown() {
    const select = document.getElementById('excel-only-class');
    if (select) {
        select.innerHTML = '<option value="">Select a class...</option>' +
            classes.map(cls => `<option value="${cls.id}">${escHtml(cls.name)}</option>`).join('');
    }
}

// Handle Smart Excel file upload (Step 2) - Now just loads file and shows mapping UI
async function handleSmartExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    document.getElementById('excel-only-filename').textContent = file.name;
    showLoading();
    document.querySelector('.loading-text').textContent = 'Reading Excel file...';
    
    try {
        const data = await readExcelFile(file);
        
        if (!data || data.length === 0) {
            throw new Error('No data found in Excel file');
        }
        
        // Store raw data and headers
        smartExcelRawData = data;
        smartExcelHeaders = Object.keys(data[0]);
        
        console.log('Excel headers found:', smartExcelHeaders);
        
        hideLoading();
        
        // Populate mapping dropdowns
        populateMappingDropdowns();
        
        // Show mapping step
        const mappingStep = document.getElementById('excel-mapping-step');
        if (mappingStep) {
            mappingStep.style.display = 'block';
        }
        
        showToast(`✅ Loaded ${data.length} rows - now map your columns`);
        
    } catch (error) {
        hideLoading();
        console.error('Smart Excel import error:', error);
        showToast('Error reading Excel: ' + error.message);
    }
    
    e.target.value = '';
}

// Populate mapping dropdown selects with Excel headers
function populateMappingDropdowns() {
    const mappingIds = [
        'map-lesson-id', 'map-title', 'map-standards', 'map-objectives',
        'map-success-criteria', 'map-vocabulary',
        'map-materials', 'map-flow', 'map-notes', 'map-section'
    ];

    // Smart auto-detect suggestions
    const suggestions = {
        'map-lesson-id': ['lesson', 'lesson #', 'lesson number', 'lesson id', 'id'],
        'map-title': ['title', 'lesson title', 'name', 'topic', 'skill', 'primary skill'],
        'map-standards': ['standard', 'standards', 'ccss', 'teks'],
        'map-objectives': ['objective', 'objectives', 'i can', 'learning target'],
        'map-success-criteria': ['success criteria', 'success criterion', 'criteria for success'],
        'map-vocabulary': ['key vocabulary', 'vocabulary', 'vocab'],
        'map-materials': ['material', 'materials', 'resources'],
        'map-flow': ['flow', 'lesson flow', 'procedure', 'steps'],
        'map-notes': ['notes', 'activities', 'description', 'activities & notes'],
        'map-section': ['module', 'unit', 'section', 'topic', 'chapter']
    };
    
    mappingIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        
        // Build options
        let html = '<option value="">-- None --</option>';
        smartExcelHeaders.forEach(header => {
            html += `<option value="${header}">${header}</option>`;
        });
        select.innerHTML = html;
        
        // Try to auto-select based on suggestions
        const suggestList = suggestions[id] || [];
        for (const suggest of suggestList) {
            const match = smartExcelHeaders.find(h => 
                h.toLowerCase().trim() === suggest.toLowerCase() ||
                h.toLowerCase().trim().includes(suggest.toLowerCase())
            );
            if (match) {
                select.value = match;
                break;
            }
        }
    });
}

// Apply column mapping and process lessons
function applyColumnMapping() {
    const lessonIdCol = document.getElementById('map-lesson-id').value;
    
    if (!lessonIdCol) {
        showToast('Please select a Lesson ID column');
        return;
    }
    
    const titleCol = document.getElementById('map-title').value;
    const standardsCol = document.getElementById('map-standards').value;
    const objectivesCol = document.getElementById('map-objectives').value;
    const successCriteriaCol = document.getElementById('map-success-criteria').value;
    const vocabularyCol = document.getElementById('map-vocabulary').value;
    const materialsCol = document.getElementById('map-materials').value;
    const flowCol = document.getElementById('map-flow').value;
    const notesCol = document.getElementById('map-notes').value;
    const sectionCol = document.getElementById('map-section').value;
    
    // Process lessons with mapping
    smartExcelAllLessons = [];
    smartExcelSections = [];
    const sectionSet = new Set();
    
    for (const row of smartExcelRawData) {
        const lessonId = row[lessonIdCol];
        if (!lessonId) continue;
        
        // Determine section
        let section = 'All Lessons';
        if (sectionCol && row[sectionCol]) {
            section = String(row[sectionCol]).trim();
        }
        
        // Track sections
        if (!sectionSet.has(section)) {
            sectionSet.add(section);
            smartExcelSections.push(section);
        }
        
        // Standards and Objectives(->Learning Target)/Success Criteria get their own fields.
        // Key Vocabulary (no dedicated schema field) is folded into the standards text block.
        let standardsText = standardsCol ? String(row[standardsCol] || '').trim() : '';
        const learningTargetText = objectivesCol ? String(row[objectivesCol] || '').trim() : '';
        const successCriteriaText = successCriteriaCol ? String(row[successCriteriaCol] || '').trim() : '';
        if (vocabularyCol) {
            const vocabulary = String(row[vocabularyCol] || '').trim();
            if (vocabulary) {
                standardsText = standardsText
                    ? `${standardsText}\n\nKey Vocabulary:\n${vocabulary}`
                    : `Key Vocabulary:\n${vocabulary}`;
            }
        }

        smartExcelAllLessons.push({
            lessonId: String(lessonId).trim(),
            section: section,
            title: titleCol ? String(row[titleCol] || '').trim() : '',
            standards: standardsText,
            learningTarget: learningTargetText,
            successCriteria: successCriteriaText,
            materials: materialsCol ? String(row[materialsCol] || '').trim() : '',
            flow: flowCol ? String(row[flowCol] || '').trim() : '',
            notes: notesCol ? String(row[notesCol] || '').trim() : ''
        });
    }
    
    if (smartExcelAllLessons.length === 0) {
        showToast('No valid lessons found with selected mapping');
        return;
    }
    
    // Populate section dropdown and show next steps
    populateSectionDropdown();
    showToast(`✅ Mapped ${smartExcelAllLessons.length} lessons in ${smartExcelSections.length} sections`);
}

// Populate section dropdown (Step 3)
function populateSectionDropdown() {
    const sectionSelect = document.getElementById('excel-section-select');
    const sectionStep = document.getElementById('excel-section-step');
    
    if (sectionSelect) {
        sectionSelect.innerHTML = '<option value="all">All Lessons (' + smartExcelAllLessons.length + ')</option>' +
            smartExcelSections.map(section => {
                const count = smartExcelAllLessons.filter(l => l.section === section).length;
                return `<option value="${section}">${section} (${count} lessons)</option>`;
            }).join('');
    }
    
    // Show section step
    if (sectionStep) {
        sectionStep.style.display = 'block';
    }
    
    // Trigger initial section selection
    handleSectionChange();
}

// Handle section selection change
function handleSectionChange() {
    const sectionSelect = document.getElementById('excel-section-select');
    const selectedSection = sectionSelect?.value || 'all';
    
    // Filter lessons by section
    if (selectedSection === 'all') {
        smartExcelSelectedLessons = [...smartExcelAllLessons];
    } else {
        smartExcelSelectedLessons = smartExcelAllLessons.filter(l => l.section === selectedSection);
    }
    
    // Display section preview
    displaySectionPreview();
    
    // Show step 4 (date & import)
    const dateStep = document.getElementById('excel-date-step');
    if (dateStep) {
        dateStep.style.display = 'block';
    }
    
    // Set default start date to today if not set
    const startDateInput = document.getElementById('excel-only-start-date');
    if (startDateInput && !startDateInput.value) {
        startDateInput.value = formatDate(new Date());
    }
    
    // Generate dated preview if date is set
    if (startDateInput?.value) {
        generateDatedPreview();
    }
}

// Display section preview (without dates)
function displaySectionPreview() {
    const container = document.getElementById('excel-section-preview-list');
    const preview = document.getElementById('excel-section-preview');
    const summary = document.getElementById('excel-section-summary');
    
    const previewLessons = smartExcelSelectedLessons.slice(0, 6);
    
    container.innerHTML = previewLessons.map(lesson => `
        <div class="import-event-item">
            <span class="import-event-title">${lesson.lessonId}</span>
            ${lesson.title ? `<span class="import-event-meta" style="color: var(--text-muted); font-size: 0.65rem; margin-left: 0.5rem;">${escHtml(lesson.title.substring(0, 25))}${lesson.title.length > 25 ? '...' : ''}</span>` : ''}
        </div>
    `).join('');
    
    if (smartExcelSelectedLessons.length > 6) {
        container.innerHTML += `<p style="color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem;">...and ${smartExcelSelectedLessons.length - 6} more lessons</p>`;
    }
    
    summary.innerHTML = `<strong>${smartExcelSelectedLessons.length}</strong> lessons selected`;
    preview.classList.remove('hidden');
}

// Generate dated preview based on start date and class schedule
function generateDatedPreview() {
    const classId = document.getElementById('excel-only-class').value;
    const startDate = document.getElementById('excel-only-start-date').value;
    const daysPerLesson = parseInt(document.getElementById('excel-days-per-lesson')?.value || '1');
    
    if (!classId || !startDate || smartExcelSelectedLessons.length === 0) {
        return;
    }
    
    // Get the selected class to check its schedule
    const selectedClass = classes.find(c => c.id === classId);
    if (!selectedClass) return;
    
    // Build class schedule day map
    const dayNameToNum = { 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5 };
    const classScheduleDays = new Set();
    if (selectedClass.schedule) {
        Object.keys(selectedClass.schedule).forEach(day => {
            if (selectedClass.schedule[day]) {
                classScheduleDays.add(dayNameToNum[day]);
            }
        });
    }
    const hasSchedule = classScheduleDays.size > 0;
    
    // Build set of off days from events
    const offDays = new Set();
    for (const event of events) {
        const isOffDay = isNoSchoolEvent(event);   // v6.2.0: single gatekeeper
        
        if (isOffDay && event.startDate) {
            const eventStart = new Date(event.startDate + 'T00:00:00');
            const eventEnd = event.endDate ? new Date(event.endDate + 'T00:00:00') : eventStart;
            
            const d = new Date(eventStart);
            while (d <= eventEnd) {
                offDays.add(formatDate(d));
                d.setDate(d.getDate() + 1);
            }
        }
    }
    
    // Helper function to check if a date is a valid class day
    function isValidClassDay(date) {
        const dayOfWeek = date.getDay();
        const dateStr = formatDate(date);
        
        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) return false;
        
        // Skip off days (incl. before the first / after the last day of school)
        if (offDays.has(dateStr) || isOffDay(dateStr)) return false;
        
        // If class has a schedule, only use days the class meets
        if (hasSchedule && !classScheduleDays.has(dayOfWeek)) return false;
        
        return true;
    }
    
    // Get next valid class day
    function getNextValidClassDay(date) {
        let current = new Date(date);
        let maxIterations = 365;
        while (!isValidClassDay(current) && maxIterations > 0) {
            current = addDays(current, 1);
            maxIterations--;
        }
        return current;
    }
    
    // Assign dates to lessons (with support for multiple days per lesson)
    excelOnlyLessons = [];
    let currentDate = new Date(startDate + 'T00:00:00');
    
    for (const lesson of smartExcelSelectedLessons) {
        // Add the same lesson for each day specified
        for (let dayNum = 1; dayNum <= daysPerLesson; dayNum++) {
            currentDate = getNextValidClassDay(currentDate);
            
            excelOnlyLessons.push({
                ...lesson,
                date: formatDate(currentDate),
                selected: true,
                dayLabel: daysPerLesson > 1 ? `Day ${dayNum}/${daysPerLesson}` : null
            });
            
            currentDate = addDays(currentDate, 1);
        }
    }
    
    // Display dated preview
    displayExcelOnlyPreview(hasSchedule, classScheduleDays, offDays.size, daysPerLesson);
}

// Display Excel Only preview (with dates)
function displayExcelOnlyPreview(hasSchedule, classScheduleDays, offDaysCount, daysPerLesson = 1) {
    const container = document.getElementById('excel-only-preview-list');
    const preview = document.getElementById('excel-only-preview');
    const summary = document.getElementById('excel-only-summary');
    const importBtn = document.getElementById('excel-only-import-btn');
    
    const previewLessons = excelOnlyLessons.slice(0, 10);
    
    // Day number to name for display
    const dayNumToName = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };
    
    container.innerHTML = previewLessons.map((lesson, index) => {
        const lessonDate = new Date(lesson.date + 'T00:00:00');
        const dayName = lessonDate.toLocaleDateString('en-US', { weekday: 'short' });
        const dayLabel = lesson.dayLabel ? `<span style="color: var(--cyan-blue); font-size: 0.65rem; margin-left: 0.25rem;">${lesson.dayLabel}</span>` : '';
        return `
            <div class="import-event-item">
                <input type="checkbox" id="excel-only-lesson-${index}" ${lesson.selected ? 'checked' : ''} data-index="${index}">
                <span class="import-event-date">${dayName} ${formatDisplayDateShort(lesson.date)}</span>
                <span class="import-event-title">${lesson.lessonId}${dayLabel}</span>
            </div>
        `;
    }).join('');
    
    if (excelOnlyLessons.length > 10) {
        container.innerHTML += `<p style="color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem;">...and ${excelOnlyLessons.length - 10} more lessons</p>`;
    }
    
    // Add checkbox listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (index < excelOnlyLessons.length) {
                excelOnlyLessons[index].selected = e.target.checked;
            }
        });
    });
    
    const firstDate = excelOnlyLessons[0]?.date;
    const lastDate = excelOnlyLessons[excelOnlyLessons.length - 1]?.date;
    
    // Build schedule info
    let scheduleInfo = '';
    if (hasSchedule) {
        const dayNames = Array.from(classScheduleDays).sort().map(d => dayNumToName[d]).join('/');
        scheduleInfo = ` • ${dayNames}`;
    }
    if (offDaysCount > 0) {
        scheduleInfo += ` • Skipping ${offDaysCount} off days`;
    }
    
    // Show days per lesson info
    const uniqueLessons = smartExcelSelectedLessons.length;
    let daysInfo = '';
    if (daysPerLesson > 1) {
        daysInfo = ` (${uniqueLessons} lessons × ${daysPerLesson} days)`;
    }
    
    summary.innerHTML = `<strong>${excelOnlyLessons.length}</strong> lesson entries${daysInfo}: ${formatDisplayDateShort(firstDate)} → ${formatDisplayDateShort(lastDate)}${scheduleInfo}`;
    
    preview.classList.remove('hidden');
    if (importBtn) importBtn.disabled = false;
}

// Import Excel Only lessons
async function excelOnlyImportLessons() {
    const classId = document.getElementById('excel-only-class').value;
    if (!classId) {
        showToast('Please select a class');
        return;
    }
    
    const selectedLessons = excelOnlyLessons.filter(l => l.selected);
    
    if (selectedLessons.length === 0) {
        showToast('No lessons selected');
        return;
    }
    
    showLoading();
    document.querySelector('.loading-text').textContent = 'Importing lessons...';
    
    try {
        const yearPath = getYearPath();
        const cls = classes.find(c => c.id === classId);
        const subject = cls?.subject || 'Math';
        let imported = 0;
        let skipped = 0;
        const newlyImported = [];

        for (const lesson of selectedLessons) {
            // Check if lesson already exists on that date for that class
            const exists = lessons.find(l =>
                l.date === lesson.date &&
                l.classId === classId
            );

            if (exists) {
                skipped++;
                continue;
            }
            
            // Build lesson title
            const title = lesson.title 
                ? `${lesson.lessonId}: ${lesson.title}`
                : lesson.lessonId;
            
            // Build activities text
            let activitiesText = '';
            if (lesson.notes) {
                activitiesText = lesson.notes;
            }
            
            const lessonData = {
                title: title,
                date: lesson.date,
                classId: classId,
                subject: subject,
                duration: 60,
                standards: lesson.standards || '',
                learningTarget: lesson.learningTarget || '',
                successCriteria: lesson.successCriteria || '',
                flow: lesson.flow || '',
                materials: lesson.materials || '',
                activities: activitiesText.trim(),
                curriculumRef: lesson.lessonId,
                attachments: [],
                smartImported: true,
                smartExcelImport: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await yearPath.collection('lessons').add(lessonData);
            lessons.push({ id: docRef.id, ...lessonData });
            newlyImported.push(lessonData);
            imported++;
        }

        // Auto-populate the Unit Map from this import so units show up
        // without any separate manual step.
        const unitsCreated = await syncUnitsFromImportedLessons(newlyImported, classId);
        if (typeof renderUnitMap === 'function') renderUnitMap();

        // Reset UI
        resetSmartExcelUI();

        // Refresh views
        renderCalendar();
        renderWeek();
        updateStats();

        if (skipped > 0) {
            showToast(`Imported ${imported} lessons (${skipped} dates already had lessons)${unitsCreated > 0 ? ` and added ${unitsCreated} units to the Unit Map` : ''}`);
        } else {
            showToast(`✅ Imported ${imported} lessons${unitsCreated > 0 ? ` and added ${unitsCreated} units to the Unit Map` : ''}!`);
        }

    } catch (error) {
        console.error('Error importing lessons:', error);
        showToast('Error importing lessons');
    }

    hideLoading();
}

// Reset Smart Excel UI
function resetSmartExcelUI() {
    smartExcelAllLessons = [];
    smartExcelSections = [];
    smartExcelSelectedLessons = [];
    smartExcelRawData = [];
    smartExcelHeaders = [];
    excelOnlyLessons = [];
    
    document.getElementById('excel-only-filename').textContent = '';
    document.getElementById('excel-section-preview')?.classList.add('hidden');
    document.getElementById('excel-only-preview')?.classList.add('hidden');
    
    // Hide steps 3, 4 and 5
    const mappingStep = document.getElementById('excel-mapping-step');
    const sectionStep = document.getElementById('excel-section-step');
    const dateStep = document.getElementById('excel-date-step');
    if (mappingStep) mappingStep.style.display = 'none';
    if (sectionStep) sectionStep.style.display = 'none';
    if (dateStep) dateStep.style.display = 'none';
    
    const importBtn = document.getElementById('excel-only-import-btn');
    if (importBtn) importBtn.disabled = true;
}

// Initialize on load

