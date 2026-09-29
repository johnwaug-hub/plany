// ============================================
// PHASE 1: UNDO/REDO SYSTEM
// ============================================

const undoStack = [];
const redoStack = [];
const MAX_UNDO_STACK = 50;
let undoToastTimer = null;

function initUndoSystem() {
    // Nothing to initialize, actions will call recordAction()
}

function recordAction(action) {
    // action = { type: 'delete_lesson', data: {...}, restore: async function }
    undoStack.push(action);
    if (undoStack.length > MAX_UNDO_STACK) {
        undoStack.shift();
    }
    // Clear redo stack when new action is performed
    redoStack.length = 0;
    
    // Show undo toast
    showUndoToast(action);
}

function showUndoToast(action) {
    const toast = document.getElementById('undo-toast');
    const message = document.getElementById('undo-message');
    
    if (!toast || !message) return;
    
    const messages = {
        'delete_lesson': 'Lesson deleted',
        'delete_event': 'Event deleted',
        'delete_class': 'Class deleted',
        'update_lesson': 'Lesson updated',
        'update_event': 'Event updated',
        'create_lesson': 'Lesson created',
        'create_event': 'Event created',
        'move_lesson': 'Lesson moved',
        'copy_lesson': 'Lesson copied'
    };
    
    message.textContent = messages[action.type] || 'Action completed';
    toast.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    clearTimeout(undoToastTimer);
    undoToastTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, 5000);
    
    // Undo button handler
    document.getElementById('undo-btn').onclick = () => {
        performUndo();
        toast.classList.add('hidden');
    };
    
    // Dismiss button
    document.getElementById('undo-dismiss').onclick = () => {
        toast.classList.add('hidden');
    };
}

async function performUndo() {
    if (undoStack.length === 0) {
        showToast('Nothing to undo');
        return;
    }
    
    const action = undoStack.pop();
    
    try {
        await action.restore();
        redoStack.push(action);
        showToast('↩️ Undone');
    } catch (error) {
        console.error('Undo failed:', error);
        showToast('Undo failed');
        undoStack.push(action); // Put it back
    }
}

async function performRedo() {
    if (redoStack.length === 0) {
        showToast('Nothing to redo');
        return;
    }
    
    const action = redoStack.pop();
    
    try {
        await action.redo();
        undoStack.push(action);
        showToast('↪️ Redone');
    } catch (error) {
        console.error('Redo failed:', error);
        showToast('Redo failed');
        redoStack.push(action);
    }
}

// ============================================
// PHASE 1: DATA EXPORT/IMPORT
// ============================================

function initDataExport() {
    document.getElementById('open-export-modal-btn')?.addEventListener('click', () => {
        document.getElementById('export-modal')?.classList.remove('hidden');
    });
    
    document.getElementById('export-data-btn')?.addEventListener('click', exportData);
    
    document.getElementById('import-data-btn')?.addEventListener('click', () => {
        document.getElementById('import-file-input')?.click();
    });
    
    document.getElementById('import-file-input')?.addEventListener('change', handleImportFile);
}

async function exportData() {
    if (!currentUser) {
        showToast('Please log in first');
        return;
    }
    
    showLoading();
    
    try {
        const exportObj = {
            version: '4.9.14',
            exportDate: new Date().toISOString(),
            userId: currentUser.uid,
            userEmail: currentUser.email
        };
        
        if (document.getElementById('export-lessons')?.checked) {
            exportObj.lessons = lessons;
        }
        
        if (document.getElementById('export-classes')?.checked) {
            exportObj.classes = classes;
        }
        
        if (document.getElementById('export-events')?.checked) {
            exportObj.events = events;
        }
        
        if (document.getElementById('export-settings')?.checked) {
            exportObj.settings = settings;
        }
        
        if (document.getElementById('export-curriculum')?.checked) {
            exportObj.curriculum = curriculumDocs;
        }
        
        // Create and download file
        const dataStr = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `plany-backup-${formatDate(new Date())}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('✅ Backup downloaded!');
        document.getElementById('export-modal')?.classList.add('hidden');
        
    } catch (error) {
        console.error('Export failed:', error);
        showToast('Export failed');
    }
    
    hideLoading();
}

async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
        showToast('Please select a JSON backup file');
        return;
    }
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.version) {
            showToast('Invalid backup file');
            return;
        }
        
        if (!await planyConfirm(`Import backup from ${data.exportDate?.split('T')[0] || 'unknown date'}?\n\nThis will add to your existing data.`)) {
            return;
        }
        
        await importData(data);
        
    } catch (error) {
        console.error('Import error:', error);
        showToast('Failed to read backup file');
    }
    
    e.target.value = '';
}

async function importData(data) {
    if (!currentUser) return;
    
    showLoading();
    let imported = { lessons: 0, classes: 0, events: 0 };
    // v6.0.2: everything is written under the CURRENT school year
    // (users/{uid}/years/{year}/...), which is where the app reads from.
    // Before this, import wrote to the pre-v5 top-level paths, so a restore
    // reported success and then vanished on reload.
    const yearPath = getYearPath();
    const classIdMap = {};   // backup's class id -> id in this account

    try {
        // Import classes first (lessons depend on them)
        if (data.classes && Array.isArray(data.classes)) {
            for (const cls of data.classes) {
                // Check if class with same name exists
                const existing = classes.find(c => c.name === cls.name);
                if (existing) {
                    if (cls.id) classIdMap[cls.id] = existing.id;
                } else {
                    const { id, ...clsData } = cls;
                    const docRef = await yearPath
                        .collection('classes').add({
                            ...clsData,
                            importedAt: new Date().toISOString()
                        });
                    classes.push({ id: docRef.id, ...clsData });
                    if (id) classIdMap[id] = docRef.id;
                    imported.classes++;
                }
            }
        }
        
        // Import lessons
        if (data.lessons && Array.isArray(data.lessons)) {
            for (const lesson of data.lessons) {
                const { id, ...lessonData } = lesson;
                // Point the lesson at this account's copy of its class.
                if (lessonData.classId && classIdMap[lessonData.classId]) {
                    lessonData.classId = classIdMap[lessonData.classId];
                }
                // Check for duplicate (same class + title + date)
                const existing = lessons.find(l => l.title === lessonData.title && l.date === lessonData.date &&
                    (l.classId || null) === (lessonData.classId || null));
                if (!existing) {
                    const docRef = await yearPath
                        .collection('lessons').add({
                            ...lessonData,
                            importedAt: new Date().toISOString()
                        });
                    lessons.push({ id: docRef.id, ...lessonData });
                    imported.lessons++;
                }
            }
        }
        
        // Import events
        if (data.events && Array.isArray(data.events)) {
            for (const event of data.events) {
                const existing = events.find(e => e.title === event.title && e.startDate === event.startDate);
                if (!existing) {
                    const { id, ...eventData } = event;
                    const docRef = await yearPath
                        .collection('events').add({
                            ...eventData,
                            importedAt: new Date().toISOString()
                        });
                    events.push({ id: docRef.id, ...eventData });
                    imported.events++;
                }
            }
        }
        
        // Import settings
        if (data.settings) {
            // Never let a backup switch the active school year out from under
            // the data that's loaded -- that would point later saves at
            // another year.
            const { schoolYear: _ignoredYear, ...importedSettings } = data.settings;
            settings = { ...settings, ...importedSettings };
            // Save merged settings to Firestore
            if (currentUser) {
                try {
                    await db.collection('users').doc(currentUser.uid)
                        .collection('settings').doc('schoolYear').set(settings, { merge: true });
                } catch(e) { console.warn('Could not save imported settings:', e); }
            }
        }
        
        // Refresh views
        lessons.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        renderCalendar();
        renderWeek();
        renderClasses();
        if (typeof updateClassDropdown === 'function') updateClassDropdown();
        
        showToast(`✅ Imported: ${imported.lessons} lessons, ${imported.classes} classes, ${imported.events} events`);
        document.getElementById('export-modal')?.classList.add('hidden');
        
    } catch (error) {
        console.error('Import failed:', error);
        showToast('Import failed');
    }
    
    hideLoading();
}

