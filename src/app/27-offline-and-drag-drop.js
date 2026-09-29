// ============================================
// PHASE 1: OFFLINE INDICATOR
// ============================================

let lastSyncTime = null;

function initOfflineIndicator() {
    updateOnlineStatus();
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Also check periodically (helps with DevTools offline mode)
    setInterval(checkOnlineStatus, 10000); // Every 10 seconds
    
    // Track last sync time
    lastSyncTime = new Date();
}

async function checkOnlineStatus() {
    // Use the browser's built-in online status — avoids noisy 404s from Firestore root
    updateOnlineStatus(navigator.onLine);
}

function updateOnlineStatus(forceOnline = null) {
    const indicator = document.getElementById('offline-indicator');
    const lastSyncedEl = document.getElementById('last-synced');
    
    if (!indicator) return;
    
    const isOnline = forceOnline !== null ? forceOnline : navigator.onLine;
    
    if (isOnline) {
        indicator.classList.add('hidden');
        lastSyncTime = new Date();
    } else {
        indicator.classList.remove('hidden');
        if (lastSyncedEl && lastSyncTime) {
            lastSyncedEl.textContent = `Last synced: ${formatTimeAgo(lastSyncTime)}`;
        }
    }
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// ============================================
// PHASE 2: DRAG AND DROP LESSONS
// ============================================

let draggedLesson = null;
let draggedElement = null;
let dragGhost = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

function initDragAndDrop() {
    // Add drag events to calendar grid
    const calendarGrid = document.getElementById('calendar-grid');
    if (calendarGrid) {
        calendarGrid.addEventListener('dragover', handleDragOver);
        calendarGrid.addEventListener('drop', handleDrop);
        calendarGrid.addEventListener('dragleave', handleDragLeave);
    }
    
    // Touch support for mobile
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
}

function makeLessonDraggable(element, lesson) {
    element.draggable = true;
    element.classList.add('draggable');
    element.dataset.lessonId = lesson.id;
    
    element.addEventListener('dragstart', (e) => {
        draggedLesson = lesson;
        draggedElement = element;
        element.classList.add('dragging');
        
        e.dataTransfer.setData('text/plain', lesson.id);
        e.dataTransfer.effectAllowed = 'copyMove';
        
        // Show drag indicator
        showDragIndicator();
    });
    
    element.addEventListener('dragend', () => {
        element.classList.remove('dragging');
        draggedLesson = null;
        draggedElement = null;
        hideDragIndicator();
        
        // Remove drag-over from all days
        document.querySelectorAll('.calendar-day.drag-over').forEach(day => {
            day.classList.remove('drag-over');
        });
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
    
    const dayEl = e.target.closest('.calendar-day');
    if (dayEl && !dayEl.classList.contains('drag-over')) {
        // Remove from others
        document.querySelectorAll('.calendar-day.drag-over').forEach(day => {
            day.classList.remove('drag-over');
        });
        dayEl.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const dayEl = e.target.closest('.calendar-day');
    if (dayEl && !dayEl.contains(e.relatedTarget)) {
        dayEl.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    
    const dayEl = e.target.closest('.calendar-day');
    if (!dayEl) return;
    
    dayEl.classList.remove('drag-over');
    
    // Check if we have a valid dragged lesson
    if (!draggedLesson || !draggedLesson.id) {
        console.log('No valid lesson being dragged');
        return;
    }
    
    const newDate = dayEl.dataset.date;
    const isCopy = e.shiftKey;
    
    if (newDate === draggedLesson.date && !isCopy) {
        // Same day, no change needed
        return;
    }
    
    // Capture values before async operations
    const lessonToMove = { ...draggedLesson };
    const lessonId = draggedLesson.id;
    const oldDate = draggedLesson.date;
    
    showLoading();
    
    try {
        if (isCopy) {
            // Copy lesson to new date
            const { id, ...lessonData } = lessonToMove;
            const newLesson = {
                ...lessonData,
                date: newDate,
                copiedFrom: lessonId,
                createdAt: new Date().toISOString()
            };
            
            const docRef = await getYearPath().collection('lessons').add(newLesson);
            lessons.push({ id: docRef.id, ...newLesson });
            showToast(`📋 Lesson copied to ${formatDisplayDate(new Date(newDate + 'T00:00:00'))}`);
        } else {
            // Move lesson to new date
            await getYearPath().collection('lessons').doc(lessonId).update({
                date: newDate
            });
            
            // Update local array
            const lesson = lessons.find(l => l.id === lessonId);
            if (lesson) {
                lesson.date = newDate;
            }
            
            // Record for undo (capture lessonId in closure)
            recordAction({
                type: 'move_lesson',
                data: { lessonId, oldDate, newDate },
                restore: async () => {
                    await getYearPath().collection('lessons').doc(lessonId).update({
                        date: oldDate
                    });
                    const l = lessons.find(x => x.id === lessonId);
                    if (l) l.date = oldDate;
                    renderCalendar();
                    renderWeek();
                },
                redo: async () => {
                    await getYearPath().collection('lessons').doc(lessonId).update({
                        date: newDate
                    });
                    const l = lessons.find(x => x.id === lessonId);
                    if (l) l.date = newDate;
                    renderCalendar();
                    renderWeek();
                }
            });
            // Undo toast already shows via recordAction
        }
        
        renderCalendar();
        renderWeek();
        
    } catch (error) {
        console.error('Error moving/copying lesson:', error);
        showToast('Error moving lesson');
    }
    
    hideLoading();
}

function showDragIndicator() {
    let indicator = document.querySelector('.drag-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'drag-indicator';
        indicator.innerHTML = `
            <span>Drag to move</span>
            <span>•</span>
            <span>Hold <kbd>Shift</kbd> to copy</span>
        `;
        document.body.appendChild(indicator);
    }
    indicator.style.display = 'flex';
}

function hideDragIndicator() {
    const indicator = document.querySelector('.drag-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Touch support for mobile drag
function handleTouchStart(e) {
    const lessonEl = e.target.closest('.calendar-class[data-lesson-id], .lesson-item[data-lesson-id]');
    if (!lessonEl) return;
    
    const lessonId = lessonEl.dataset.lessonId;
    draggedLesson = lessons.find(l => l.id === lessonId);
    if (!draggedLesson) return;
    
    draggedElement = lessonEl;
    dragStartX = e.touches[0].clientX;
    dragStartY = e.touches[0].clientY;
    
    // Long press to initiate drag
    draggedElement._touchTimer = setTimeout(() => {
        isDragging = true;
        draggedElement.classList.add('dragging');
        showDragIndicator();
        
        // Create ghost element
        dragGhost = draggedElement.cloneNode(true);
        dragGhost.className = 'drag-ghost';
        dragGhost.style.width = draggedElement.offsetWidth + 'px';
        document.body.appendChild(dragGhost);
    }, 500);
}

function handleTouchMove(e) {
    if (!isDragging || !dragGhost) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    dragGhost.style.left = touch.clientX - 20 + 'px';
    dragGhost.style.top = touch.clientY - 20 + 'px';
    
    // Find day under touch
    const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    const dayEl = elemBelow?.closest('.calendar-day');
    
    document.querySelectorAll('.calendar-day.drag-over').forEach(day => {
        day.classList.remove('drag-over');
    });
    
    if (dayEl) {
        dayEl.classList.add('drag-over');
    }
}

function handleTouchEnd(e) {
    if (draggedElement?._touchTimer) {
        clearTimeout(draggedElement._touchTimer);
    }
    
    if (!isDragging) {
        draggedLesson = null;
        draggedElement = null;
        return;
    }
    
    // Find target day
    const dayEl = document.querySelector('.calendar-day.drag-over');
    if (dayEl && draggedLesson) {
        handleDrop({ 
            preventDefault: () => {},
            target: dayEl,
            shiftKey: false
        });
    }
    
    // Cleanup
    if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
    }
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
    }
    document.querySelectorAll('.calendar-day.drag-over').forEach(day => {
        day.classList.remove('drag-over');
    });
    
    hideDragIndicator();
    isDragging = false;
    draggedLesson = null;
    draggedElement = null;
}

