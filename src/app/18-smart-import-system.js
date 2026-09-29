// ============================================
// SMART IMPORT SYSTEM (JSON/PDF Pacing + Excel Library)
// ============================================

let smartPacingData = [];       // Array of {date, title} from JSON or AI-parsed PDF
let smartLessonLibrary = [];    // Array of lesson content from Excel
let smartMatchedLessons = [];   // Merged data ready to import

// Normalize a lesson identifier for matching between the pacing calendar
// and the Excel lesson library (e.g. "M1 Lesson 5" <-> "m1 lesson 5" <-> "M1  Lesson  5").
// Strips everything but letters/digits and lowercases, so formatting/spacing
// differences between sources don't break the match.
function normalizeLessonName(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .trim();
}

// Excel Only mode data
let excelOnlyLessons = [];      // Array of lessons from Excel for direct import

// Initialize Smart Import UI
function initSmartImport() {
    console.log('Initializing Smart Import...');
    updateSmartImportClassDropdown();
    
    // Mode toggle buttons
    const fullModeBtn = document.getElementById('smart-mode-full-btn');
    const excelModeBtn = document.getElementById('smart-mode-excel-btn');
    const fullModeDiv = document.getElementById('smart-import-full-mode');
    const excelModeDiv = document.getElementById('smart-import-excel-mode');
    
    if (fullModeBtn && excelModeBtn) {
        fullModeBtn.addEventListener('click', () => {
            fullModeBtn.classList.add('active');
            excelModeBtn.classList.remove('active');
            fullModeDiv.classList.remove('hidden');
            excelModeDiv.classList.add('hidden');
        });
        
        excelModeBtn.addEventListener('click', () => {
            excelModeBtn.classList.add('active');
            fullModeBtn.classList.remove('active');
            excelModeDiv.classList.remove('hidden');
            fullModeDiv.classList.add('hidden');
        });
    }
    
    // Set default start date to today
    const startDateInput = document.getElementById('excel-only-start-date');
    if (startDateInput) {
        startDateInput.value = formatDate(new Date());
    }
    
    // Excel Only mode event listeners
    initExcelOnlyImport();
    
    // Pacing JSON button
    const pacingBtn = document.getElementById('smart-import-pacing-btn');
    const pacingInput = document.getElementById('smart-pacing-json-input');
    console.log('Pacing btn:', pacingBtn, 'Pacing input:', pacingInput);
    
    if (pacingBtn) {
        pacingBtn.addEventListener('click', () => {
            const classId = document.getElementById('smart-import-class').value;
            if (!classId) {
                showToast('Please select a class first');
                return;
            }
            pacingInput.click();
        });
    }
    
    // Pacing JSON file input
    if (pacingInput) {
        pacingInput.addEventListener('change', handleSmartPacingUpload);
    }
    
    // Lesson Excel button
    const lessonsBtn = document.getElementById('smart-import-lessons-btn');
    const lessonsInput = document.getElementById('smart-lessons-excel-input');
    console.log('Lessons btn:', lessonsBtn, 'Lessons input:', lessonsInput);
    
    if (lessonsBtn) {
        lessonsBtn.addEventListener('click', () => {
            const classId = document.getElementById('smart-import-class').value;
            if (!classId) {
                showToast('Please select a class first');
                return;
            }
            lessonsInput.click();
        });
    }
    
    // Lesson Excel file input
    if (lessonsInput) {
        lessonsInput.addEventListener('change', handleSmartLessonsUpload);
    }
    
    // Match button
    const matchBtn = document.getElementById('smart-match-btn');
    if (matchBtn) {
        matchBtn.addEventListener('click', smartMatchLessons);
    }
    
    // Import button
    const importBtn = document.getElementById('smart-import-btn');
    if (importBtn) {
        importBtn.addEventListener('click', smartImportLessons);
    }
    
    // Delete all lessons button
    const deleteBtn = document.getElementById('smart-delete-lessons-btn');
    console.log('Delete btn:', deleteBtn);
    if (deleteBtn) {
        deleteBtn.addEventListener('click', smartDeleteAllLessons);
    }
    
    console.log('Smart Import initialized');
}

// Delete all lessons for selected class
async function smartDeleteAllLessons() {
    const classId = document.getElementById('smart-delete-class').value;
    
    if (!classId) {
        showToast('Please select a class first');
        return;
    }
    
    const className = classes.find(c => c.id === classId)?.name || 'selected class';
    
    // Find ALL lessons for this class
    const classLessons = lessons.filter(l => l.classId === classId);
    
    if (classLessons.length === 0) {
        showToast('No lessons found for this class');
        return;
    }
    
    if (!await planyConfirm(`Delete ALL ${classLessons.length} lessons from "${className}"?\n\nThis will delete every lesson for this class and cannot be undone.`)) {
        return;
    }
    
    showLoading();
    document.querySelector('.loading-text').textContent = 'Deleting lessons...';
    
    try {
        const yearPath = getYearPath();
        let deleted = 0;
        
        for (const lesson of classLessons) {
            await yearPath.collection('lessons').doc(lesson.id).delete();
            deleted++;
        }
        
        // Remove from local array
        lessons = lessons.filter(l => l.classId !== classId);
        
        // Refresh views
        renderCalendar();
        renderWeek();
        updateStats();
        
        showToast(`🗑️ Deleted ${deleted} lessons from ${className}`);
        
    } catch (error) {
        console.error('Error deleting lessons:', error);
        showToast('Error deleting lessons');
    }
    
    hideLoading();
}

// Update class dropdown for Smart Import
function updateSmartImportClassDropdown() {
    console.log('updateSmartImportClassDropdown called, classes:', classes.length);
    
    const selects = [
        document.getElementById('smart-import-class'),
        document.getElementById('smart-delete-class'),
        document.getElementById('excel-only-class')
    ];
    
    const optionsHtml = '<option value="">Select a class...</option>' +
        classes.map(cls => `<option value="${cls.id}">${escHtml(cls.name)}</option>`).join('');
    
    selects.forEach((select, i) => {
        if (select) {
            select.innerHTML = optionsHtml;
            console.log('Updated dropdown', i, 'with', classes.length, 'classes');
        } else {
            console.log('Dropdown', i, 'not found');
        }
    });
}

// Also make it globally accessible for debugging
window.updateSmartImportClassDropdown = updateSmartImportClassDropdown;
window.getClasses = () => classes;

