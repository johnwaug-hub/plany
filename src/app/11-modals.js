// ==================== MODALS ====================

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById('standards-picker')?.classList.add('hidden');
    document.getElementById('copy-lesson-picker')?.classList.add('hidden');
    document.getElementById('copy-day-picker')?.classList.add('hidden');
    closeCopyWeekPicker();
    document.getElementById('unit-modal')?.classList.add('hidden');
    document.getElementById('curriculum-gen-modal')?.classList.add('hidden');
    document.getElementById('student-modal')?.classList.add('hidden');
    document.getElementById('assignment-modal')?.classList.add('hidden');
    document.getElementById('diff-modal')?.classList.add('hidden');
    document.getElementById('gc-modal')?.classList.add('hidden');
    document.getElementById('grade-settings-modal')?.classList.add('hidden');
    document.getElementById('attendance-modal')?.classList.add('hidden');
    document.getElementById('teams-modal')?.classList.add('hidden');
    document.getElementById('moodle-modal')?.classList.add('hidden');
    document.getElementById('sis-modal')?.classList.add('hidden');
    document.getElementById('comm-modal')?.classList.add('hidden');
    closeSeatPicker();
    document.getElementById('unit-standards-picker')?.classList.add('hidden');
}

function closeModal(modal) {
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ── Styled confirm / alert (v6.4.0) ────────────────────────────────────
// Replaces the browser's confirm()/alert() boxes, which looked foreign,
// blocked the page, and in the installed app could be suppressed entirely.
// planyConfirm(message, { okText, cancelText, danger }) -> Promise<boolean>
function _planyDialog({ message, okText = 'OK', cancelText = null, danger = false, title = '' }) {
    return new Promise(resolve => {
        const prevFocus = document.activeElement;
        const wrap = document.createElement('div');
        wrap.className = 'plany-dialog';
        wrap.innerHTML = `<div class="plany-dialog-box" role="alertdialog" aria-modal="true" aria-labelledby="plany-dialog-msg">
            ${title ? `<div class="plany-dialog-title">${escHtml(title)}</div>` : ''}
            <div class="plany-dialog-msg" id="plany-dialog-msg"></div>
            <div class="plany-dialog-actions">
                ${cancelText ? `<button type="button" class="btn btn-secondary plany-dialog-cancel">${escHtml(cancelText)}</button>` : ''}
                <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} plany-dialog-ok">${escHtml(okText)}</button>
            </div>
        </div>`;
        wrap.querySelector('.plany-dialog-msg').textContent = message;
        document.body.appendChild(wrap);
        const ok = wrap.querySelector('.plany-dialog-ok');
        const cancel = wrap.querySelector('.plany-dialog-cancel');
        const done = (val) => {
            wrap.remove();
            try { if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true }); } catch (_) {}
            resolve(val);
        };
        ok.addEventListener('click', () => done(true));
        cancel?.addEventListener('click', () => done(false));
        wrap.addEventListener('click', (e) => { if (e.target === wrap) done(false); });
        wrap.addEventListener('keydown', (e) => {
            e.stopPropagation();   // don't let Esc/Tab reach the modal handlers underneath
            if (e.key === 'Escape') { e.preventDefault(); done(false); }
            else if (e.key === 'Tab') {
                const btns = [cancel, ok].filter(Boolean);
                const i = btns.indexOf(document.activeElement);
                e.preventDefault();
                btns[(i + (e.shiftKey ? btns.length - 1 : 1)) % btns.length].focus();
            }
        });
        // Destructive questions focus Cancel, so a stray Enter doesn't delete
        (danger && cancel ? cancel : ok).focus();
    });
}
function planyConfirm(message, opts = {}) {
    const danger = opts.danger ?? /\b(delete|remove|clear|revoke|cannot be undone|without saving)\b/i.test(message);
    return _planyDialog({ message, okText: opts.okText || (danger ? 'Yes, continue' : 'OK'), cancelText: opts.cancelText || 'Cancel', danger, title: opts.title || '' });
}
function planyAlert(message, opts = {}) {
    return _planyDialog({ message, okText: opts.okText || 'OK', title: opts.title || '' });
}
function planyDialogOpen() { return !!document.querySelector('.plany-dialog'); }

// ── Unsaved-change guard (v6.2.0) ─────────────────────────────────────
// Typing in a modal marks it "dirty". Esc, the backdrop and the × button
// then ask before throwing the changes away. (Save buttons close modals
// directly and aren't affected.) The dirty flag resets whenever a modal
// is opened, and modals are tracked in the order they open so Esc closes
// only the one on top -- not the lesson modal underneath a picker.
const _modalOpenOrder = [];
(function initModalTracking() {
    const obs = new MutationObserver(muts => {
        muts.forEach(m => {
            const el = m.target;
            const visible = !el.classList.contains('hidden');
            const idx = _modalOpenOrder.indexOf(el);
            if (visible && idx === -1) { el.dataset.dirty = ''; _modalOpenOrder.push(el); onModalOpened(el); }
            if (!visible && idx !== -1) { _modalOpenOrder.splice(idx, 1); onModalClosed(el); }
        });
    });
    document.querySelectorAll('.modal').forEach(modal => {
        obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
        modal.addEventListener('input', (e) => {
            if (e.isTrusted && e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [contenteditable]')) {
                modal.dataset.dirty = '1';
            }
        });
    });
})();

// ── Accessible dialogs (v6.3.0) ───────────────────────────────────────
// Every .modal becomes a proper dialog: role/aria-modal/label, focus moves
// in when it opens, Tab stays inside it, and focus goes back to whatever
// opened it when it closes.
const FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function visibleFocusables(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE_SEL)).filter(el => el.offsetParent !== null || el === document.activeElement);
}
let _modalA11yCounter = 0;
function onModalOpened(modal) {
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (!modal.hasAttribute('aria-labelledby') && !modal.hasAttribute('aria-label')) {
        const h = modal.querySelector('h1, h2, h3');
        if (h) { if (!h.id) h.id = 'modal-title-' + (++_modalA11yCounter); modal.setAttribute('aria-labelledby', h.id); }
    }
    const opener = document.activeElement;
    if (opener && opener !== document.body && !modal.contains(opener)) modal._returnFocus = opener;
    // Let the opener finish filling the form, then focus the first field
    // (or the close button) unless something inside already has focus.
    setTimeout(() => {
        if (modal.classList.contains('hidden') || modal.contains(document.activeElement)) return;
        // On touch screens don't focus a text field (it would pop the keyboard
        // over the form); focus the dialog itself instead.
        const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const f = visibleFocusables(modal);
        let target = touch ? null : (f.find(el => el.matches('input, select, textarea')) || f[0]);
        if (!target) {
            target = modal.querySelector('.modal-content') || modal;
            if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        }
        try { target.focus({ preventScroll: true }); } catch (_) {}
    }, 60);
}
function onModalClosed(modal) {
    const back = modal._returnFocus;
    modal._returnFocus = null;
    if (back && document.contains(back) && !topOpenModalOrNull()) { try { back.focus({ preventScroll: true }); } catch (_) {} }
}
function topOpenModalOrNull() {
    for (let i = _modalOpenOrder.length - 1; i >= 0; i--) {
        if (!_modalOpenOrder[i].classList.contains('hidden')) return _modalOpenOrder[i];
    }
    return null;
}
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || planyDialogOpen()) return;
    const modal = topOpenModalOrNull();
    if (!modal) return;
    const f = visibleFocusables(modal);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// Icon-only buttons get a spoken name (their tooltip, or "Close" for ×).
function labelIconButtons(root = document) {
    root.querySelectorAll('.modal-close:not([aria-label])').forEach(b => b.setAttribute('aria-label', 'Close'));
    root.querySelectorAll('button[title]:not([aria-label])').forEach(b => {
        if (!/[A-Za-z]{2,}/.test(b.textContent || '')) b.setAttribute('aria-label', b.getAttribute('title'));
    });
}
labelIconButtons();
document.getElementById('toast')?.setAttribute('aria-live', 'polite');

// v6.5.0: most form labels sat next to their field without for="", so
// screen readers read the field with no name. Connect each loose <label>
// to the field right after it, and give label-less fields their placeholder
// as a name.
let _autoFieldId = 0;
function associateFormLabels(root = document) {
    const FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea';
    root.querySelectorAll('label:not([for])').forEach(label => {
        if (label.querySelector('input, select, textarea')) return;          // wraps its field already
        let el = label.nextElementSibling, field = null;
        for (let hops = 0; el && hops < 3 && !field; hops++, el = el.nextElementSibling) {
            field = el.matches(FIELD) ? el : el.querySelector(FIELD);
        }
        if (!field) return;
        if (!field.id) field.id = 'auto-field-' + (++_autoFieldId);
        if (!document.querySelector(`label[for="${field.id}"]`)) label.htmlFor = field.id;
    });
    root.querySelectorAll(FIELD).forEach(f => {
        const named = f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') ||
            (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) || f.closest('label');
        if (named || f.type === 'file') return;
        const prevText = (f.previousElementSibling && /^(SPAN|LABEL|STRONG|B)$/.test(f.previousElementSibling.tagName))
            ? f.previousElementSibling.textContent.trim().replace(/[:：]\s*$/, '') : '';
        const name = f.placeholder || f.title || prevText ||
            (f.id ? f.id.replace(/[-_]+/g, ' ').replace(/\b(pm|gb|qr|es|sub|ai)\b/g, '').trim() : '');
        if (name) f.setAttribute('aria-label', name);
    });
}
associateFormLabels();

function topOpenModal() {
    for (let i = _modalOpenOrder.length - 1; i >= 0; i--) {
        if (!_modalOpenOrder[i].classList.contains('hidden')) return _modalOpenOrder[i];
    }
    return document.querySelector('.modal:not(.hidden)');
}

// Close a modal the user dismissed (Esc / backdrop / ×). Returns false if
// they chose to keep editing.
async function dismissModal(modal) {
    if (!modal) return true;
    if (modal.dataset.dirty === '1' && !(await planyConfirm('You have unsaved changes. Close without saving?', { okText: 'Discard changes', cancelText: 'Keep editing', danger: true }))) return false;
    modal.dataset.dirty = '';
    closeModal(modal);
    return true;
}

// Close button handlers - close only the parent modal
document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const modal = e.target.closest('.modal');
        // "Cancel" is an explicit discard; the × asks first if there are edits.
        if (btn.classList.contains('modal-cancel')) { if (modal) modal.dataset.dirty = ''; closeModal(modal); }
        else dismissModal(modal);
    });
});

// Click outside modal to close only that modal
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            dismissModal(modal);
        }
    });
});

// ESC key closes only the top-most modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !planyDialogOpen()) {
        const openModal = topOpenModal();
        if (openModal) {
            e._planyModalHandled = true;
            dismissModal(openModal);
        }
    }
});

// Day Modal
function openDayModal(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    elements.dayModalTitle.textContent = `📅 ${formatDisplayDate(date)}`;
    elements.dayModal.dataset.date = dateStr;
    
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayOfWeek = dayNames[date.getDay()];
    
    // Get classes for this day, sorted by time
    // Automatically cancel classes on holidays/off-days
    const dayIsOff = isOffDay(dateStr);
    const _modalDayClasses = dayIsOff ? [] : classes.filter(cls => cls.schedule && cls.schedule[dayOfWeek] && isClassActiveOnDate(cls, dateStr));
    const modalClassSlots = getSortedClassSlots(_modalDayClasses, dayOfWeek);
    const classesListEl = document.getElementById('day-classes-list');
    
    if (dayIsOff) {
        classesListEl.innerHTML = '<div class="empty-state">🏖️ No School – All classes cancelled for this day</div>';
    } else if (modalClassSlots.length === 0) {
        classesListEl.innerHTML = '<div class="empty-state">No classes scheduled for this day</div>';
    } else {
        const dayLessons = lessons.filter(l => l.date === dateStr);
        const rows = [];
        modalClassSlots.forEach(({ cls, slotIndex: si, slot, slotCount }) => {
                const slotTimeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dayOfWeek);
                const lesson = findLessonForSlot(dayLessons, cls.id, si);
                const hasLesson = !!lesson;
                const isSpanAll = hasLesson && lesson.slotIndex === -1;
                const sessionLabel = slotCount > 1
                    ? (isSpanAll ? ' · 📋 All sessions' : ` · Session ${si + 1}`)
                    : '';
                rows.push(`
                    <div class="day-class-item" data-class-id="${cls.id}" data-date="${dateStr}" data-slot-index="${si}">
                        <div class="day-class-info">
                            <div class="day-class-color" style="background: ${cls.color || '#FF6B9D'}"></div>
                            <div class="day-class-details">
                                <h4>${escHtml(cls.name)}${sessionLabel}</h4>
                                <p>${slotTimeStr}${cls.room ? ' • ' + cls.room : ''}</p>
                            </div>
                        </div>
                        <span class="day-class-status ${hasLesson ? 'has-lesson' : 'no-lesson'}">
                            ${hasLesson ? '✓ ' + escHtml(lesson.title || 'Lesson planned') : '+ Add lesson'}
                        </span>
                    </div>
                `);
        });
        classesListEl.innerHTML = rows.join('');
        
        // Add click handlers for class items
        classesListEl.querySelectorAll('.day-class-item').forEach(item => {
            item.addEventListener('click', () => {
                const classId = item.dataset.classId;
                const date = item.dataset.date;
                const si = parseInt(item.dataset.slotIndex || '0') || 0;
                const cls = classes.find(c => c.id === classId);
                closeAllModals();
                openLessonModalForClass(cls, date, si);
            });
        });
    }
    
    // Get events for this day
    const dayEvents = events.filter(e => {
        const start = e.startDate;
        const end = e.endDate || e.startDate;
        return dateStr >= start && dateStr <= end;
    });
    const eventsListEl = document.getElementById('day-events-list');
    
    if (dayEvents.length === 0) {
        eventsListEl.innerHTML = '<div class="empty-state">No events for this day</div>';
    } else {
        const typeIcons = {
            'event': '📌',
            'first-day': '🎒',
            'last-day': '🎉',
            'holiday': '🏖️',
            'meeting': '👥',
            'assembly': '🎤',
            'field-trip': '🚌',
            'testing': '📝',
            'deadline': '⚠️'
        };
        
        eventsListEl.innerHTML = dayEvents.map(event => `
            <div class="day-event-item" data-event-id="${event.id}">
                <div class="day-event-info">
                    <span class="day-event-type">${typeIcons[event.type] || '📌'}</span>
                    <div class="day-event-details">
                        <h4>${escHtml(event.title)}</h4>
                        <p>${event.startTime ? event.startTime : 'All day'}${event.endDate && event.endDate !== event.startDate ? ' • Multi-day' : ''}</p>
                    </div>
                </div>
            </div>
        `).join('');
        
        // Add click handlers for event items
        eventsListEl.querySelectorAll('.day-event-item').forEach(item => {
            item.addEventListener('click', () => {
                const eventId = item.dataset.eventId;
                const event = events.find(e => e.id === eventId);
                closeAllModals();
                openEventModal(event);
            });
        });
    }
    
    elements.dayModal.classList.remove('hidden');
}

// Open lesson modal for a specific class
// Shows/wires the session-mode chooser (One lesson spans all sessions / This
// session only) for a multi-slot class. Used both when creating a brand new
// lesson AND when editing an existing per-session lesson, so a lesson that
// was originally created for just one session can later be promoted to span
// every session that day (or narrowed back down) without deleting it.
// Bulk-converts every Session 1 lesson for a class to "spans all sessions,"
// merging away any sibling per-slot lesson on the same day (e.g. a separate
// Session 2 lesson that's now redundant). Backs the class-level "Spread
// Session 1 lessons across all sessions" toggle so a whole class's lesson
// history can be migrated at once instead of switching one lesson at a time.
async function bulkSpreadSessionsForClass(classId) {
    const session1Lessons = lessons.filter(l =>
        l.classId === classId &&
        (l.slotIndex === 0 || l.slotIndex === undefined || l.slotIndex === null)
    );
    if (session1Lessons.length === 0) return { converted: 0, merged: 0 };

    const yearPath = getYearPath();
    const ops = [];
    const deleteIds = [];
    let converted = 0;

    session1Lessons.forEach(lesson => {
        ops.push({ type: 'update', ref: yearPath.collection('lessons').doc(lesson.id), data: { slotIndex: -1 } });
        lesson.slotIndex = -1;
        converted++;

        lessons.filter(l =>
            l.id !== lesson.id &&
            l.classId === classId &&
            l.date === lesson.date &&
            l.slotIndex !== -1
        ).forEach(sibling => {
            ops.push({ type: 'delete', ref: yearPath.collection('lessons').doc(sibling.id) });
            deleteIds.push(sibling.id);
        });
    });

    // Chunk writes to stay safely under Firestore's 500-operation batch limit.
    const CHUNK = 400;
    for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = db.batch();
        ops.slice(i, i + CHUNK).forEach(op => {
            if (op.type === 'update') batch.update(op.ref, op.data);
            else batch.delete(op.ref);
        });
        await batch.commit();
    }

    if (deleteIds.length > 0) {
        lessons = lessons.filter(l => !deleteIds.includes(l.id));
    }
    return { converted, merged: deleteIds.length };
}

// Computes a lesson's duration (in minutes) straight from the class's actual
// scheduled time for that day, instead of teachers having to remember and
// re-type their own bell schedule every time. Returns null when there's no
// usable start/end time to compute from (leaves the field as-is in that case).
function computeClassDurationMinutes(cls, dateStr, slotIndex) {
    if (!cls || !dateStr) return null;
    const dow = ['sun','mon','tue','wed','thu','fri','sat'][new Date(dateStr + 'T00:00:00').getDay()];
    const slots = getTimeSlotsForDay(cls, dow);
    if (slots.length === 0) return null;

    const slotMinutes = (slot) => {
        if (!slot?.start || !slot?.end) return null;
        const [sh, sm] = slot.start.split(':').map(Number);
        const [eh, em] = slot.end.split(':').map(Number);
        if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return null;
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        return diff > 0 ? diff : null;
    };

    if (slotIndex === -1) {
        // "Spans all sessions" -- total actual instructional minutes across
        // every session that day, not the elapsed clock time between them.
        const total = slots.reduce((sum, s) => sum + (slotMinutes(s) || 0), 0);
        return total > 0 ? total : null;
    }

    return slotMinutes(slots[slotIndex] || slots[0]);
}

// Re-reads the currently selected class/date/slot and fills the Duration
// field from the class's schedule. Only wired to genuine user actions
// (picking a class, toggling session mode, or pre-filling a brand-new
// lesson) -- never called on a bare modal open, so it can't silently
// overwrite a duration someone already saved for an existing lesson.
function autoFillLessonDuration(slotIndexOverride) {
    const classId = elements.lessonClass?.value;
    const cls = classId ? classes.find(c => c.id === classId) : null;
    const dateStr = elements.lessonDate?.value;
    const slotIndex = slotIndexOverride !== undefined
        ? slotIndexOverride
        : (parseInt(document.getElementById('lesson-slot-index')?.value || '0') || 0);
    const mins = computeClassDurationMinutes(cls, dateStr, slotIndex);
    if (mins && elements.lessonDuration) elements.lessonDuration.value = mins;
}

function setupSessionModeChooser(cls, dateStr, slotIndex, defaultToSpan) {
    const slotField = document.getElementById('lesson-slot-index');
    const chooser = document.getElementById('session-mode-chooser');
    if (!chooser || !cls || !dateStr) { chooser?.classList.add('hidden'); return; }

    const dow = ['sun','mon','tue','wed','thu','fri','sat'][new Date(dateStr + 'T00:00:00').getDay()];
    const slots = getTimeSlotsForDay(cls, dow);
    if (slots.length <= 1) { chooser.classList.add('hidden'); return; }

    // The "this session only" label always shows the specific session number,
    // even while "span all" is selected, so switching back is unambiguous.
    const specificSlot = slotIndex === -1 ? 0 : slotIndex;
    const splitLabel = document.getElementById('session-mode-split-label-text');
    if (splitLabel) splitLabel.textContent = `Session ${specificSlot + 1} of ${slots.length}`;

    const spanRadio = document.getElementById('session-mode-span');
    const splitRadio = document.getElementById('session-mode-split');
    const useSpan = defaultToSpan !== undefined ? defaultToSpan : (slotIndex === -1);
    if (spanRadio) spanRadio.checked = useSpan;
    if (splitRadio) splitRadio.checked = !useSpan;
    if (slotField) slotField.value = useSpan ? -1 : specificSlot;
    chooser.classList.remove('hidden');

    // Wire radio change to update the hidden slot index (clone first to drop
    // any listeners from a previous time this modal was opened).
    chooser.querySelectorAll('input[name="session-mode"]').forEach(radio => {
        const fresh = radio.cloneNode(true);
        radio.parentNode.replaceChild(fresh, radio);
    });
    document.getElementById('session-mode-span')?.addEventListener('change', () => {
        if (slotField) slotField.value = -1; // span-all sentinel
        autoFillLessonDuration(-1);
    });
    document.getElementById('session-mode-split')?.addEventListener('change', () => {
        if (slotField) slotField.value = specificSlot;
        autoFillLessonDuration(specificSlot);
    });
}

function openLessonModalForClass(cls, dateStr, slotIndex = 0) {
    const dayLessons = lessons.filter(l => l.date === dateStr && l.classId === cls.id);
    const existingLesson = findLessonForSlot(dayLessons, cls.id, slotIndex);

    if (existingLesson) {
        // Existing lesson — open it directly. openLessonModal() itself now
        // re-shows the session-mode chooser so it can still be promoted to
        // (or demoted from) "spans all sessions" from here.
        openLessonModal(existingLesson);
        return;
    }

    // New lesson — open blank modal pre-filled with class + slot
    openLessonModal(null, dateStr);
    elements.lessonClass.value = cls.id;
    const slotField = document.getElementById('lesson-slot-index');
    if (slotField) slotField.value = slotIndex;

    // openLessonModal() already ran updateLessonFormForClassType() once, but
    // at that point the class dropdown was still blank (it's set above, right
    // after). Re-run it now so Activity classes correctly hide the academic
    // fields on a brand-new lesson instead of only after the user manually
    // touches the class dropdown.
    updateLessonFormForClassType();
    // Pre-fill Duration from the class's actual scheduled time for this slot
    // instead of leaving the generic 45-minute default.
    autoFillLessonDuration(slotIndex);

    // Show session-mode chooser only when class has multiple slots on this day.
    // Defaults to "this session only" for a brand new lesson.
    setupSessionModeChooser(cls, dateStr, slotIndex, false);
}

elements.addLessonToDay.addEventListener('click', () => {
    const dateStr = elements.dayModal.dataset.date;
    closeAllModals();
    openLessonModal(null, dateStr);
});

// Current lesson attachments (in-memory while editing)
let currentLessonAttachments = [];

// Lesson Modal
function openLessonModal(lesson = null, dateStr = null) {
    elements.lessonForm.reset();
    elements.lessonId.value = '';
    currentLessonAttachments = [];
    // Always hide chooser on open — openLessonModalForClass re-shows it when appropriate
    document.getElementById('session-mode-chooser')?.classList.add('hidden');
    
    const printBtn = document.getElementById('print-lesson-btn');
    const shareBtn = document.getElementById('share-lesson-btn');
    const recurringSection = document.getElementById('recurring-section');
    const recurringCheckbox = document.getElementById('lesson-recurring');
    const recurringOptions = document.getElementById('recurring-options');
    const linkGroupSelect = document.getElementById('lesson-link-group');
    const partSelector = document.getElementById('link-part-selector');
    
    // Reset recurring options
    if (recurringCheckbox) recurringCheckbox.checked = false;
    if (recurringOptions) recurringOptions.classList.add('hidden');
    
    // Reset linking options
    if (linkGroupSelect) linkGroupSelect.value = '';
    if (partSelector) partSelector.classList.add('hidden');
    
    if (lesson) {
        document.getElementById('modal-title').textContent = '✏️ Edit Lesson';
        // Show active unit badge
        const _activeUnit = lesson.classId ? getActiveUnit(lesson.date, lesson.classId) : null;
        const _badgeEl = document.getElementById('lesson-unit-badge-area');
        if (_badgeEl) _badgeEl.innerHTML = _activeUnit
            ? `<span class="lesson-unit-badge" style="background:${_activeUnit.color||'#7B5EA7'}">📐 ${_activeUnit.name}</span>`
            : '';
        elements.lessonId.value = lesson.id;
        elements.lessonDate.value = lesson.date;
        const lockEl = document.getElementById('lesson-locked');
        if (lockEl) lockEl.checked = lesson.lockedDate === true;
        elements.lessonTitle.value = lesson.title;
        elements.lessonClass.value = lesson.classId || '';
        // Restore slot index (default 0 for legacy lessons)
        const slotField = document.getElementById('lesson-slot-index');
        const _restoredSlotIndex = (lesson.slotIndex === undefined || lesson.slotIndex === null) ? 0 : lesson.slotIndex;
        if (slotField) slotField.value = _restoredSlotIndex;
        // Re-show the session-mode chooser for multi-slot classes so an existing
        // per-session lesson can be promoted to "spans all sessions" (or back)
        // without deleting and recreating it.
        {
            const _lessonCls = lesson.classId ? classes.find(c => c.id === lesson.classId) : null;
            setupSessionModeChooser(_lessonCls, lesson.date, _restoredSlotIndex);
        }
        elements.lessonSubject.value = lesson.subject || '';
        elements.lessonDuration.value = lesson.duration || 45;
        {
            const legacySplit = splitStandardsBlock(lesson.standards || lesson.objectives || '');
            elements.lessonStandards.value = (lesson.learningTarget !== undefined || lesson.successCriteria !== undefined)
                ? (lesson.standards || lesson.objectives || '')
                : legacySplit.standards;
            elements.lessonLearningTarget.value = lesson.learningTarget || legacySplit.learningTarget || '';
            elements.lessonSuccessCriteria.value = lesson.successCriteria || legacySplit.successCriteria || '';
        }
        elements.lessonFlow.value = lesson.flow || '';
        elements.lessonMaterials.value = lesson.materials || '';
        elements.lessonActivities.value = lesson.activities || '';
        currentLessonAttachments = lesson.attachments || [];
        elements.deleteLessonBtn.classList.remove('hidden');
        if (shareBtn) shareBtn.classList.remove('hidden');
        document.getElementById('link-lesson-btn')?.classList.remove('hidden');
        const _cpBtn = document.getElementById('copy-lesson-btn'); if (_cpBtn) _cpBtn.classList.remove('hidden');
        
        // Hide recurring section for existing lessons
        if (recurringSection) recurringSection.style.display = 'none';
        
        // Handle lesson linking
        if (lesson.linkGroupId) {
            if (linkGroupSelect) {
                updateLinkGroupSelect();
                linkGroupSelect.value = lesson.linkGroupId;
            }
            if (partSelector) {
                partSelector.classList.remove('hidden');
                document.getElementById('lesson-part-number').value = lesson.partNumber || 1;
                document.getElementById('lesson-total-parts').value = lesson.totalParts || 3;
            }
            renderLinkedLessonsNav(lesson);
        }
        
        // Check for duplicate
        setTimeout(checkForDuplicate, 100);
    } else {
        document.getElementById('modal-title').textContent = '✏️ Add Lesson';
        elements.lessonDate.value = dateStr || formatDate(new Date());
        elements.deleteLessonBtn.classList.add('hidden');
        if (shareBtn) shareBtn.classList.add('hidden');
        document.getElementById('link-lesson-btn')?.classList.add('hidden');
        const _cpBtnNew = document.getElementById('copy-lesson-btn'); if (_cpBtnNew) _cpBtnNew.classList.add('hidden');
        
        // Show recurring section for new lessons
        if (recurringSection) recurringSection.style.display = 'block';
        
        // Hide linked lessons nav
        document.getElementById('linked-lessons-nav')?.classList.add('hidden');
    }
    
    // Always show print button (works for both new and existing lessons)
    if (printBtn) printBtn.classList.remove('hidden');
    
    // Show/hide the academic lesson-plan fields based on whether the
    // selected class is a placeholder Activity (Lunch, Recess, Electives...).
    updateLessonFormForClassType();
    
    renderLessonAttachments();
    elements.lessonModal.classList.remove('hidden');
}

// Shows the full academic lesson form (Standards, Learning Target, Success
// Criteria, Lesson Flow, Materials) for normal classes, or hides all of that
// and relabels "Activities & Notes" to "Instructions" for classes marked as
// an Activity via the Class modal's "This is an activity" toggle.
function updateLessonFormForClassType() {
    const classId = elements.lessonClass?.value;
    const cls = classId ? classes.find(c => c.id === classId) : null;
    const isActivity = !!cls?.isActivity;

    const academicFields = document.getElementById('lesson-academic-fields');
    if (academicFields) academicFields.classList.toggle('hidden', isActivity);

    const activitiesLabel = document.getElementById('lesson-activities-label');
    if (activitiesLabel) activitiesLabel.textContent = isActivity ? '📝 Instructions' : '📝 Activities & Notes';

    const activitiesTextarea = document.getElementById('lesson-activities');
    if (activitiesTextarea) {
        activitiesTextarea.placeholder = isActivity
            ? 'Instructions for this activity — procedures, expectations, what to bring, etc.'
            : 'Additional activities, differentiation strategies, notes...';
    }
}
elements.lessonClass?.addEventListener('change', () => {
    updateLessonFormForClassType();
    // Picking a class is a deliberate action, so it's safe to refresh
    // Duration to match that class's schedule here too.
    autoFillLessonDuration();
});

// Render attachments list in lesson modal
function renderLessonAttachments() {
    const list = elements.lessonAttachmentsList;
    if (!list) return;
    
    if (currentLessonAttachments.length === 0) {
        list.innerHTML = '<div class="attachments-empty">No files attached</div>';
        return;
    }
    
    list.innerHTML = currentLessonAttachments.map((attachment, index) => {
        const icon = getFileIcon(attachment.type || attachment.name);
        const isCurriculum = attachment.isCurriculumSource;
        
        return `
            <div class="attachment-item ${isCurriculum ? 'curriculum-source' : ''}" data-index="${index}">
                <div class="attachment-info">
                    <span class="attachment-icon">${icon}</span>
                    <div class="attachment-details">
                        <div class="attachment-name">${attachment.name}</div>
                        <div class="attachment-meta">
                            ${attachment.size ? formatFileSize(attachment.size) : ''}
                            ${isCurriculum ? '<span class="attachment-badge">📚 Curriculum Source</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="attachment-actions">
                    <button type="button" class="btn-icon-sm" onclick="removeLessonAttachment(${index})" title="Remove">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// Get file icon based on type/extension
function getFileIcon(typeOrName) {
    const name = (typeOrName || '').toLowerCase();
    if (name.includes('pdf')) return '📄';
    if (name.includes('ppt') || name.includes('presentation')) return '📊';
    if (name.includes('doc') || name.includes('word')) return '📝';
    if (name.includes('xls') || name.includes('sheet')) return '📈';
    if (name.includes('image') || name.includes('png') || name.includes('jpg')) return '🖼️';
    return '📎';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Remove attachment from lesson
function removeLessonAttachment(index) {
    currentLessonAttachments.splice(index, 1);
    renderLessonAttachments();
}

// Add attachment button click
if (elements.addAttachmentBtn) {
    elements.addAttachmentBtn.addEventListener('click', () => {
        elements.lessonFileInput.click();
    });
}

// File input change
if (elements.lessonFileInput) {
    elements.lessonFileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files.length) return;
        
        for (const file of files) {
            // Store file reference (we'll upload on save)
            currentLessonAttachments.push({
                name: file.name,
                type: file.type,
                size: file.size,
                file: file, // Keep file object for upload
                isCurriculumSource: false
            });
        }
        
        renderLessonAttachments();
        e.target.value = ''; // Reset input
    });
}

elements.lessonForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Prepare attachments (remove file objects, keep metadata)
    const attachmentsToSave = currentLessonAttachments.map(att => ({
        name: att.name,
        type: att.type,
        size: att.size,
        isCurriculumSource: att.isCurriculumSource || false,
        curriculumDocId: att.curriculumDocId || null
    }));
    
    // Handle lesson linking
    const linkGroupSelect = document.getElementById('lesson-link-group');
    let linkGroupId = null;
    let partNumber = null;
    let totalParts = null;
    
    if (linkGroupSelect?.value === 'new') {
        linkGroupId = `link_${Date.now()}`;
        partNumber = parseInt(document.getElementById('lesson-part-number')?.value) || 1;
        totalParts = parseInt(document.getElementById('lesson-total-parts')?.value) || 3;
    } else if (linkGroupSelect?.value) {
        linkGroupId = linkGroupSelect.value;
        partNumber = parseInt(document.getElementById('lesson-part-number')?.value) || 1;
        const existingGroup = lessonLinkGroups[linkGroupId];
        totalParts = existingGroup?.[0]?.totalParts || parseInt(document.getElementById('lesson-total-parts')?.value) || 3;
    }
    
    const lessonData = {
        title: elements.lessonTitle.value.trim(),
        date: elements.lessonDate.value,
        classId: elements.lessonClass.value || null,
        slotIndex: parseInt(document.getElementById('lesson-slot-index')?.value || '0') || 0,
        subject: elements.lessonSubject.value.trim(),
        duration: parseInt(elements.lessonDuration.value) || 45,
        standards: elements.lessonStandards.value.trim(),
        learningTarget: elements.lessonLearningTarget.value.trim(),
        successCriteria: elements.lessonSuccessCriteria.value.trim(),
        flow: elements.lessonFlow.value.trim(),
        materials: elements.lessonMaterials.value.trim(),
        activities: elements.lessonActivities.value.trim(),
        attachments: attachmentsToSave,
        lockedDate: document.getElementById('lesson-locked')?.checked === true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Add linking data if applicable
    if (linkGroupId) {
        lessonData.linkGroupId = linkGroupId;
        lessonData.partNumber = partNumber;
        lessonData.totalParts = totalParts;
    }
    
    showLoading();
    try {
        const lessonId = elements.lessonId.value;
        const yearPath = getYearPath();
        
        if (lessonId) {
            // Update existing lesson
            await yearPath.collection('lessons').doc(lessonId).update(lessonData);
            const index = lessons.findIndex(l => l.id === lessonId);
            if (index >= 0) lessons[index] = { ...lessons[index], ...lessonData };
            else lessons.push({ id: lessonId, ...lessonData });   // v6.5.0: never write lessons[-1]

            // If this lesson was just promoted to "spans all sessions," any
            // other per-session lesson still sitting on a different slot that
            // same class/day is now redundant (findLessonForSlot always lets
            // the span-all lesson win, so it would otherwise become an
            // invisible orphan). Clean those up so the merge is complete.
            if (lessonData.slotIndex === -1 && lessonData.classId) {
                const orphans = lessons.filter(l =>
                    l.id !== lessonId &&
                    l.classId === lessonData.classId &&
                    l.date === lessonData.date &&
                    l.slotIndex !== -1
                );
                if (orphans.length > 0) {
                    await Promise.all(orphans.map(o => yearPath.collection('lessons').doc(o.id).delete()));
                    const orphanIds = new Set(orphans.map(o => o.id));
                    lessons = lessons.filter(l => !orphanIds.has(l.id));
                    showToast(`Lesson updated! Merged ${orphans.length} other session${orphans.length > 1 ? 's' : ''} into this one.`);
                } else {
                    showToast('Lesson updated!');
                }
            } else {
                showToast('Lesson updated!');
            }
        } else {
            // Create new lesson
            lessonData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await yearPath.collection('lessons').add(lessonData);
            const newLesson = { id: docRef.id, ...lessonData };
            lessons.push(newLesson);
            
            // Handle recurring lessons
            const isRecurring = document.getElementById('lesson-recurring')?.checked;
            if (isRecurring) {
                // Mark the first lesson with recurring info
                newLesson.recurringGroupId = `recurring_${Date.now()}`;
                newLesson.recurringIndex = 1;
                await yearPath.collection('lessons').doc(docRef.id).update({
                    recurringGroupId: newLesson.recurringGroupId,
                    recurringIndex: 1
                });
                
                // Create additional recurring lessons
                const count = await createRecurringLessons(lessonData, lessonData.date);
                showToast(`Lesson added! Created ${count + 1} recurring lessons.`);
            } else {
                showToast('Lesson added!');
            }
        }
        
        // Reload link groups
        loadLinkGroups();
        
        closeAllModals();
        renderCalendar();
        renderWeek();
        updateStats();
    } catch (error) {
        console.error(error);
        showToast('Error saving lesson');
    }
    hideLoading();
});

elements.deleteLessonBtn.addEventListener('click', async () => {
    if (!await planyConfirm('Delete this lesson?')) return;

    const lessonId = elements.lessonId.value;
    const deletedLesson = lessons.find(l => l.id === lessonId);

    // Offer to shift all later lessons in the same class back one slot to fill the gap.
    // Each lesson takes the previous slot's old date, so the shift always lands on a
    // date the class already met on - no need to separately compute "school days".
    let shiftLessons = [];
    let shiftOldDates = [];
    if (deletedLesson && deletedLesson.classId) {
        const laterLessons = lessons
            .filter(l => l.classId === deletedLesson.classId && l.id !== lessonId && l.date > deletedLesson.date)
            .sort((a, b) => a.date.localeCompare(b.date));
        if (laterLessons.length > 0) {
            const doShift = await planyConfirm(`Also shift the ${laterLessons.length} later lesson(s) in this class back to fill the gap?`, { okText: 'Shift them back', cancelText: 'Leave them', danger: false });
            if (doShift) {
                shiftLessons = laterLessons;
                shiftOldDates = laterLessons.map(l => l.date);
            }
        }
    }

    // New dates for the shifted lessons: lesson[0] takes the deleted date,
    // lesson[1] takes lesson[0]'s old date, and so on down the chain.
    const shiftNewDates = [];
    if (shiftLessons.length > 0) {
        let prevDate = deletedLesson.date;
        for (let i = 0; i < shiftLessons.length; i++) {
            shiftNewDates.push(prevDate);
            prevDate = shiftOldDates[i];
        }
    }

    async function applyShift(dates) {
        if (shiftLessons.length === 0) return;
        const yearPath = getYearPath();
        const batch = db.batch();
        for (let i = 0; i < shiftLessons.length; i++) {
            batch.update(yearPath.collection('lessons').doc(shiftLessons[i].id), { date: dates[i] });
        }
        await batch.commit();
        for (let i = 0; i < shiftLessons.length; i++) {
            const idx = lessons.findIndex(l => l.id === shiftLessons[i].id);
            if (idx !== -1) lessons[idx] = { ...lessons[idx], date: dates[i] };
        }
    }

    showLoading();
    try {
        await getYearPath().collection('lessons').doc(lessonId).delete();
        lessons = lessons.filter(l => l.id !== lessonId);
        await applyShift(shiftNewDates);
        closeAllModals();
        renderCalendar();
        renderWeek();
        updateStats();

        // Record undo action
        if (deletedLesson) {
            let restoredId = null;
            recordAction({
                type: 'delete_lesson',
                data: deletedLesson,
                restore: async () => {
                    await applyShift(shiftOldDates);
                    const { id, ...lessonData } = deletedLesson;
                    const docRef = await getYearPath().collection('lessons').add(lessonData);
                    lessons.push({ id: docRef.id, ...lessonData });
                    restoredId = docRef.id;   // v6.5.0: redo deletes exactly this one
                    renderCalendar();
                    renderWeek();
                    updateStats();
                },
                redo: async () => {
                    const lessonToDelete = lessons.find(l => l.id === restoredId);
                    if (lessonToDelete) {
                        await getYearPath().collection('lessons').doc(lessonToDelete.id).delete();
                        lessons = lessons.filter(l => l.id !== lessonToDelete.id);
                        await applyShift(shiftNewDates);
                        renderCalendar();
                        renderWeek();
                        updateStats();
                    }
                }
            });
        }

        showToast(shiftLessons.length > 0 ? `Lesson deleted - ${shiftLessons.length} later lesson(s) shifted back` : 'Lesson deleted');
    } catch (error) {
        showToast('Error deleting lesson');
    }
    hideLoading();
});

// Class Modal
function openClassModal(cls = null) {
    elements.classForm.reset();
    elements.classId.value = '';
    
    // Reset schedule checkboxes and time inputs
    document.querySelectorAll('.schedule-day input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    document.querySelectorAll('.schedule-day input[type="time"]').forEach(ti => {
        ti.value = '';
    });
    // Remove any extra slot rows from previous edit
    document.querySelectorAll('.schedule-slot-extra').forEach(el => el.remove());
    // Re-show all add-slot buttons in case any were hidden at max capacity
    document.querySelectorAll('.add-slot-btn').forEach(btn => btn.style.display = '');
    
    // Reset every other week
    const everyOtherWeekCb = document.getElementById('every-other-week');
    const weekTypeSelector = document.getElementById('week-type-selector');
    const startingWeekSelect = document.getElementById('starting-week');
    if (everyOtherWeekCb) everyOtherWeekCb.checked = false;
    if (weekTypeSelector) weekTypeSelector.classList.add('hidden');
    if (startingWeekSelect) startingWeekSelect.value = 'A';

    // Reset spread-sessions toggle
    const spreadSessionsCb = document.getElementById('class-spread-sessions');
    if (spreadSessionsCb) spreadSessionsCb.checked = false;

    // Reset activity toggle
    const isActivityCb = document.getElementById('class-is-activity');
    if (isActivityCb) isActivityCb.checked = false;
    
    document.querySelector('input[name="class-color"][value="#FF6B9D"]').checked = true;
    // Reset custom swatch to its default state
    const _csr = document.getElementById('class-color-custom-radio');
    const _csi = document.getElementById('class-color-custom-input');
    const _css = document.getElementById('class-color-custom-swatch');
    if (_csr) { _csr.value = '__custom__'; }
    if (_csi) { _csi.value = '#FF6B9D'; }
    if (_css) { _css.style.background = ''; _css.textContent = '＋'; }
    
    if (cls) {
        document.getElementById('class-modal-title').textContent = '🎓 Edit Class';
        elements.classId.value = cls.id;
        elements.className.value = cls.name;
        elements.classSubject.value = cls.subject || '';
        elements.classRoom.value = cls.room || '';
    const _curEl = document.getElementById('class-curriculum'); if (_curEl) _curEl.value = cls.curriculum || '';
        
        if (cls.color) {
            const colorInput = document.querySelector(`input[name="class-color"][value="${cls.color}"]`);
            if (colorInput) {
                colorInput.checked = true;
            } else {
                // Custom color not in palette — select the custom swatch and set its value
                const customRadio = document.getElementById('class-color-custom-radio');
                const customInput = document.getElementById('class-color-custom-input');
                const customSwatch = document.getElementById('class-color-custom-swatch');
                if (customRadio && customInput && customSwatch) {
                    customRadio.value = cls.color;
                    customRadio.checked = true;
                    customInput.value = cls.color;
                    customSwatch.style.background = cls.color;
                    customSwatch.textContent = '';
                }
            }
        }
        
        if (cls.schedule) {
            Object.entries(cls.schedule).forEach(([day]) => {
                const checkbox = document.querySelector(`input[name="schedule-${day}"]`);
                if (!checkbox) return;
                const slots = getTimeSlotsForDay(cls, day);
                if (slots.length === 0) return;
                checkbox.checked = true;

                // Reset to one slot first
                const slotsContainer = document.querySelector(`.schedule-slots[data-day="${day}"]`);
                if (!slotsContainer) return;
                // Remove any extra slots from a previous edit session
                slotsContainer.querySelectorAll('.schedule-slot:not(:first-child)').forEach(el => el.remove());
                // Re-show add button in case it was hidden at max
                const addBtnRestore = document.querySelector(`.add-slot-btn[data-day="${day}"]`);
                if (addBtnRestore) addBtnRestore.style.display = '';

                // Restore slot 0 into the fixed first row
                const firstSlotEl = slotsContainer.querySelector('.schedule-slot');
                if (firstSlotEl) {
                    const inputs = firstSlotEl.querySelectorAll('input[type="time"]');
                    if (inputs[0]) inputs[0].value = slots[0].start || '';
                    if (inputs[1]) inputs[1].value = slots[0].end   || '';
                }
                // Restore all additional slots (slots[1], slots[2], …)
                for (let si = 1; si < slots.length; si++) {
                    addScheduleSlot(day, slots[si].start, slots[si].end);
                }
            });
        }
        
        // Set every other week options
        if (cls.everyOtherWeek && everyOtherWeekCb) {
            everyOtherWeekCb.checked = true;
            if (weekTypeSelector) weekTypeSelector.classList.remove('hidden');
            if (startingWeekSelect && cls.startingWeek) {
                startingWeekSelect.value = cls.startingWeek;
            }
        }
        if (spreadSessionsCb) spreadSessionsCb.checked = !!cls.spreadSessions;
        if (isActivityCb) isActivityCb.checked = !!cls.isActivity;
        
        elements.deleteClassBtn.classList.remove('hidden');
    } else {
        document.getElementById('class-modal-title').textContent = '🎓 Add Class';
        elements.deleteClassBtn.classList.add('hidden');
    }
    
    elements.classModal.classList.remove('hidden');
}

// Schedule day checkbox handlers
document.querySelectorAll('.schedule-day input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
        // Time inputs stay editable either way, but when a day gets unchecked we
        // must fully clear its time value(s) — a native <input type="time"> can be
        // left in a browser-internal "incomplete" validity state even after being
        // visually emptied (e.g. user typed a time, then unchecked the day without
        // finishing/clearing it). That stale invalid state silently blocks the whole
        // form's native validation on submit with zero visible error to the user.
        // Explicitly resetting .value (and firing 'input' so any listeners update)
        // clears that stale state.
        if (!cb.checked) {
            const dayContainer = cb.closest('.schedule-day');
            dayContainer?.querySelectorAll('input[type="time"]').forEach(ti => {
                ti.value = '';
                ti.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
    });
});

// Add a second time slot row to a day
function addScheduleSlot(day, startVal = '', endVal = '') {
    const container = document.querySelector(`.schedule-slots[data-day="${day}"]`);
    if (!container) return;
    const MAX_SLOTS = 5;
    if (container.querySelectorAll('.schedule-slot').length >= MAX_SLOTS) return;
    const slot = document.createElement('div');
    slot.className = 'schedule-slot schedule-slot-extra';
    slot.innerHTML = `
        <input type="time" class="time-slot-extra" data-day="${day}" value="${startVal}" placeholder="Start">
        <span class="time-separator">to</span>
        <input type="time" class="time-end-slot-extra" data-day="${day}" value="${endVal}" placeholder="End">
        <button type="button" class="remove-slot-btn" title="Remove session">✕</button>
    `;
    slot.querySelector('.remove-slot-btn').addEventListener('click', () => {
        slot.remove();
        const addBtn = document.querySelector(`.add-slot-btn[data-day="${day}"]`);
        if (addBtn) addBtn.style.display = '';
    });
    container.appendChild(slot);
    const cb = document.querySelector(`input[name="schedule-${day}"]`);
    if (cb) cb.checked = true;
    const addBtn = document.querySelector(`.add-slot-btn[data-day="${day}"]`);
    if (addBtn && container.querySelectorAll('.schedule-slot').length >= MAX_SLOTS) {
        addBtn.style.display = 'none';
    }
}

// Custom color picker wiring
(function () {
    const customLabel = document.querySelector('.color-option-custom');
    const customRadio = document.getElementById('class-color-custom-radio');
    const customInput = document.getElementById('class-color-custom-input');
    const customSwatch = document.getElementById('class-color-custom-swatch');
    if (!customLabel || !customRadio || !customInput || !customSwatch) return;

    // Clicking the custom swatch opens the native color picker
    customLabel.addEventListener('click', (e) => {
        e.preventDefault();
        customInput.click();
    });

    // When user picks a color from the native picker
    customInput.addEventListener('input', () => {
        const hex = customInput.value;
        customRadio.value = hex;   // make the radio's value = the actual hex
        customRadio.checked = true;
        customSwatch.style.background = hex;
        customSwatch.textContent = '';
    });

    // Also trigger on change (for browsers that only fire change, not input)
    customInput.addEventListener('change', () => {
        const hex = customInput.value;
        customRadio.value = hex;
        customRadio.checked = true;
        customSwatch.style.background = hex;
        customSwatch.textContent = '';
    });
})();

// Wire ＋ Add Slot buttons via delegation on the schedule-picker
document.querySelector('.schedule-picker')?.addEventListener('click', (e) => {
    // Add second slot
    const addBtn = e.target.closest('.add-slot-btn');
    if (addBtn) {
        addScheduleSlot(addBtn.dataset.day);
        return;
    }

    // Copy time from previous day
    const copyBtn = e.target.closest('.copy-time-btn');
    if (!copyBtn) return;

    const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const currentDay = copyBtn.dataset.day;
    const currentIndex = days.indexOf(currentDay);

    if (currentIndex > 0) {
        const prevDay = days[currentIndex - 1];
        const prevSlots  = document.querySelector(`.schedule-slots[data-day="${prevDay}"]`);
        const currSlots  = document.querySelector(`.schedule-slots[data-day="${currentDay}"]`);
        const prevChecked = document.querySelector(`input[name="schedule-${prevDay}"]`)?.checked;
        if (!prevSlots) { showToast('No previous day to copy from'); return; }

        const prevInputs = prevSlots.querySelectorAll('.schedule-slot:first-child input[type="time"]');
        if (!prevInputs[0]?.value) { showToast('No time set for previous day'); return; }

        // Copy first slot
        const currInputs = currSlots?.querySelectorAll('.schedule-slot:first-child input[type="time"]');
        if (currInputs?.[0]) currInputs[0].value = prevInputs[0].value;
        if (currInputs?.[1] && prevInputs[1]) currInputs[1].value = prevInputs[1].value;
        document.querySelector(`input[name="schedule-${currentDay}"]`).checked = prevChecked;

        // Copy all extra slots from previous day
        prevSlots.querySelectorAll('.schedule-slot-extra').forEach(extraEl => {
            const pInputs = extraEl.querySelectorAll('input[type="time"]');
            addScheduleSlot(currentDay, pInputs[0]?.value || '', pInputs[1]?.value || '');
        });
        const dayNames = {mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday'};
        showToast(`Copied from ${dayNames[prevDay]}`);
    } else {
        showToast('No previous day to copy from');
    }
});

// Select all days button
document.getElementById('select-all-days-btn')?.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.schedule-day input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => { cb.checked = !allChecked; });
    showToast(allChecked ? 'All days deselected' : 'All days selected');
});

// Every other week toggle
const everyOtherWeekCheckbox = document.getElementById('every-other-week');
const weekTypeSelector = document.getElementById('week-type-selector');

if (everyOtherWeekCheckbox && weekTypeSelector) {
    everyOtherWeekCheckbox.addEventListener('change', () => {
        weekTypeSelector.classList.toggle('hidden', !everyOtherWeekCheckbox.checked);
    });
}

elements.classForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const schedule = {};
    ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(day => {
        const checkbox = document.querySelector(`input[name="schedule-${day}"]`);
        if (!checkbox || !checkbox.checked) return;

        const slotsContainer = document.querySelector(`.schedule-slots[data-day="${day}"]`);
        const slots = [];

        if (slotsContainer) {
            // Read all slots generically (supports 1–5 sessions per day)
            slotsContainer.querySelectorAll('.schedule-slot').forEach((slotEl, idx) => {
                const inputs = slotEl.querySelectorAll('input[type="time"]');
                const s = { start: inputs[0]?.value || '', end: inputs[1]?.value || '' };
                // Always push slot 0; only push extras if they have a time set
                if (idx === 0 || s.start || s.end) slots.push(s);
            });
        }

        // Store as array if multiple slots, single object if 1 (backward compat)
        if (slots.length > 1) {
            schedule[day] = slots;
        } else if (slots.length === 1) {
            schedule[day] = slots[0];
        } else {
            schedule[day] = { start: '', end: '' };
        }
    });
    
    // Every other week settings
    const everyOtherWeek = document.getElementById('every-other-week')?.checked || false;
    const startingWeek = document.getElementById('starting-week')?.value || 'A';
    
    const spreadSessions = document.getElementById('class-spread-sessions')?.checked || false;
    const isActivity = document.getElementById('class-is-activity')?.checked || false;

    const classData = {
        name: elements.className.value.trim(),
        subject: elements.classSubject.value.trim(),
        room: elements.classRoom.value.trim(),
        curriculum: (document.getElementById('class-curriculum')?.value || '').trim(),
        color: (() => {
            const checked = document.querySelector('input[name="class-color"]:checked');
            const val = checked ? checked.value : '#FF6B9D';
            // If somehow __custom__ slipped through (no color chosen yet), fall back to default
            return (val && val !== '__custom__') ? val : '#FF6B9D';
        })(),
        schedule,
        everyOtherWeek,
        startingWeek: everyOtherWeek ? startingWeek : null,
        spreadSessions,
        isActivity,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    showLoading();
    try {
        const classId = elements.classId.value;
        const yearPath = getYearPath();
        let finalClassId = classId;
        if (classId) {
            await yearPath.collection('classes').doc(classId).update(classData);
            const index = classes.findIndex(c => c.id === classId);
            classes[index] = { ...classes[index], ...classData };
        } else {
            classData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await yearPath.collection('classes').add(classData);
            classes.push({ id: docRef.id, ...classData });
            finalClassId = docRef.id;
        }

        // Keep the "spread Session 1 across all sessions" invariant up to date
        // every time the class is saved with the toggle on — this both handles
        // a fresh toggle-on and picks up any Session-1 lessons added since.
        if (spreadSessions) {
            const result = await bulkSpreadSessionsForClass(finalClassId);
            if (result.converted > 0 || result.merged > 0) {
                showToast(`Class saved! Spread ${result.converted} Session 1 lesson${result.converted === 1 ? '' : 's'} across all sessions${result.merged > 0 ? ` (merged ${result.merged} other session lesson${result.merged === 1 ? '' : 's'})` : ''}.`);
            } else {
                showToast(classId ? 'Class updated!' : 'Class added!');
            }
        } else {
            showToast(classId ? 'Class updated!' : 'Class added!');
        }
        
        closeAllModals();
        renderClasses();
        renderCalendar();
        renderWeek();
        updateClassDropdown();
        updateYearChecklist();
        if (typeof updateSmartImportClassDropdown === 'function') updateSmartImportClassDropdown();
        updateStats();
    } catch (error) {
        console.error(error);
        showToast('Error saving class');
    }
    hideLoading();
});

elements.deleteClassBtn.addEventListener('click', async () => {
    if (!await planyConfirm('Delete this class?')) return;
    
    const classId = elements.classId.value;
    showLoading();
    try {
        await getYearPath().collection('classes').doc(classId).delete();
        classes = classes.filter(c => c.id !== classId);
        closeAllModals();
        renderClasses();
        updateClassDropdown();
        if (typeof updateSmartImportClassDropdown === 'function') updateSmartImportClassDropdown();
        updateStats();
        showToast('Class deleted');
    } catch (error) {
        showToast('Error deleting class');
    }
    hideLoading();
});

