// ============================================
// PHASE 2: DUPLICATE DETECTION
// ============================================

function initDuplicateDetection() {
    const classSelect = document.getElementById('lesson-class');
    const dateInput = document.getElementById('lesson-date');
    
    classSelect?.addEventListener('change', () => {
        // Changing class invalidates any slot selection from the previous class.
        // Reset to slot 0 and hide the session chooser so the lesson can't be
        // saved into a slot index the new class doesn't have.
        const slotField = document.getElementById('lesson-slot-index');
        if (slotField) slotField.value = 0;
        document.getElementById('session-mode-chooser')?.classList.add('hidden');
        checkForDuplicate();
    });
    // Date is hidden but we'll check when opening modal
}

function checkForDuplicate() {
    const classId = document.getElementById('lesson-class')?.value;
    const date = document.getElementById('lesson-date')?.value;
    const currentLessonId = document.getElementById('lesson-id')?.value;
    const slotIndex = parseInt(document.getElementById('lesson-slot-index')?.value || '0') || 0;
    
    const warning = document.getElementById('duplicate-warning');
    if (!warning) return;
    
    if (!classId || !date) {
        warning.classList.add('hidden');
        return;
    }
    
    // Find existing lesson for this class, date, AND slot index
    // A span-all lesson (slotIndex -1) is a duplicate for every slot
    const duplicate = lessons.find(l => {
        if (l.classId !== classId || l.date !== date || l.id === currentLessonId) return false;
        if (l.slotIndex === -1) return true; // span-all conflicts with any slot
        const li = (l.slotIndex === undefined || l.slotIndex === null) ? 0 : l.slotIndex;
        return li === slotIndex || slotIndex === -1; // new span-all conflicts with any existing
    });
    
    if (duplicate) {
        warning.classList.remove('hidden');
        document.getElementById('view-duplicate-btn').onclick = () => {
            openLessonModal(duplicate);
        };
    } else {
        warning.classList.add('hidden');
    }
}

// ============================================
// PHASE 2: INITIALIZE ALL
// ============================================

function initPhase2Features() {
    initDragAndDrop();
    initRecurringLessons();
    initLessonLinking();
    initDuplicateDetection();
}

// ============================================
// SUB DAY PACKET SYSTEM
// ============================================

// subDays, subDayDefaults, subClassDefaults declared at top of file

// Fields that are the same every sub day (saved as defaults)
const SUB_DEFAULT_FIELDS = [
    'sub-teacher-name','sub-room-grade','sub-school',
    'sub-neighbor','sub-office','sub-contact-notes',
    'sub-morning','sub-attendance','sub-lunch',
    'sub-end-of-day','sub-restroom','sub-early-finishers','sub-behavior-system',
    'sub-medical','sub-student-notes','sub-helpers',
    'sub-feedback-prompt','sub-specials','sub-materials-location','sub-extras'
];

// Load all sub day packets for the current school year
async function loadSubDays() {
    if (!currentUser) return;
    try {
        const yearPath = getYearPath();
        const snap = await yearPath.collection('subDays').get();
        subDays = {};
        snap.forEach(doc => {
            subDays[doc.id] = { id: doc.id, ...doc.data() };
        });
    } catch (e) {
        console.warn('Could not load sub days:', e);
    }
    // Also load defaults (stored at user level, not per-year)
    await loadSubDayDefaults();
}

// Load sub day defaults from Firestore
async function loadSubDayDefaults() {
    if (!currentUser) return;
    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('subDayDefaults').get();
        subDayDefaults = doc.exists ? doc.data() : {};
    } catch (e) {
        console.warn('Could not load sub day defaults:', e);
        subDayDefaults = {};
    }
    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('subClassDefaults').get();
        subClassDefaults = doc.exists ? doc.data() : {};
    } catch (e) {
        console.warn('Could not load sub class defaults:', e);
        subClassDefaults = {};
    }
}

// Save current form values as defaults
async function saveSubDayDefaults() {
    // Collect general field defaults
    const data = {};
    SUB_DEFAULT_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });

    // Collect per-class instruction defaults
    const classData = {};
    document.querySelectorAll('#sub-schedule-blocks .sub-class-block').forEach(block => {
        const classId = block.dataset.classId;
        classData[classId] = {
            instructions: block.querySelector('.sub-class-instructions')?.value || '',
            materials:    block.querySelector('.sub-class-materials')?.value || '',
            notes:        block.querySelector('.sub-class-notes')?.value || ''
        };
    });

    try {
        const userSettings = db.collection('users').doc(currentUser.uid).collection('settings');
        await userSettings.doc('subDayDefaults').set(data, { merge: true });
        await userSettings.doc('subClassDefaults').set(classData, { merge: true });
        subDayDefaults   = { ...data };
        subClassDefaults = { ...subClassDefaults, ...classData };
        showToast('✅ Defaults saved! Every new Sub Day packet will pre-fill with these values.');
    } catch (e) {
        console.error('Save defaults error:', e);
        showToast('❌ Could not save defaults. Try again.');
    }
}

// Open sub day modal for a given date
function updatePacketBadge(dateStr) {
    const badge = document.getElementById('sub-packet-badge');
    if (!badge) return;
    const has = !!subDays[dateStr]?.generatedPacket;
    badge.classList.remove('hidden', 'has-packet', 'no-packet');
    if (has) {
        badge.classList.add('has-packet');
        badge.textContent = '✓ Student Packet Ready';
    } else {
        badge.classList.add('no-packet');
        badge.textContent = '○ No Packet Yet';
    }
}

// Wire up the AI Student Work Packet section (toggle, generate button, and
// the modal's footer action buttons) each time the Sub Day modal opens.
// Uses .onclick/.onchange (not addEventListener) so re-opening the modal for
// a different date never stacks duplicate handlers from the previous date.
function initPacketGenerator(dateStr) {
    const toggle   = document.getElementById('sub-create-student-work');
    const options   = document.getElementById('sub-ai-options');
    const statusEl  = document.getElementById('sub-ai-status');
    const stickyEl  = document.getElementById('sub-ai-sticky-status');
    const genBtn    = document.getElementById('sub-ai-generate-btn');
    const styleEl   = document.getElementById('sub-ai-style');
    const instrEl   = document.getElementById('sub-ai-instructions');
    const markedToggle = document.getElementById('sub-day-marked-toggle');

    if (statusEl) statusEl.textContent = '';
    if (stickyEl) { stickyEl.textContent = ''; stickyEl.classList.add('hidden'); }

    const saved = subDays[dateStr] || {};
    if (toggle) {
        toggle.checked = saved.createStudentWork === true;
        options?.classList.toggle('hidden', !toggle.checked);
        toggle.onchange = () => options?.classList.toggle('hidden', !toggle.checked);
    }
    if (styleEl) styleEl.value = saved.aiStyle || 'mixed';
    if (instrEl) instrEl.value = saved.aiInstructions || '';

    if (genBtn) genBtn.onclick = () => generateSubDayStudentPacket(dateStr);

    // Save immediately whenever the sub-day flag itself is toggled, so it's
    // never lost even if the teacher closes the modal without printing.
    if (markedToggle) markedToggle.onchange = () => saveSubDay();

    const defaultsBtn = document.getElementById('sub-day-defaults-btn');
    if (defaultsBtn) defaultsBtn.onclick = () => saveSubDayDefaults();

    const printPlanBtn = document.getElementById('sub-day-print-btn');
    if (printPlanBtn) printPlanBtn.onclick = async () => { await saveSubDay(); printSubPacket(); };

    const printWorkBtn = document.getElementById('sub-day-student-work-btn');
    if (printWorkBtn) printWorkBtn.onclick = () => printSubDayStudentWork(dateStr);

    const pickedPagesBtn = document.getElementById('sub-day-picked-pages-btn');
    if (pickedPagesBtn) pickedPagesBtn.onclick = () => printSubDayPickedPages(dateStr);
}

function openSubDayModal(dateStr, opts) {
    opts = opts || {};
    const date = new Date(dateStr + 'T00:00:00');
    const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    document.getElementById('sub-day-modal-title').textContent = '🙋 Sub Day Packet';
    document.getElementById('sub-day-modal-date').textContent = formatted;
    document.getElementById('sub-day-modal').dataset.date = dateStr;

    // Pre-fill teacher info from profile (fallback if no defaults saved)
    const nameInput = document.getElementById('sub-teacher-name');
    const schoolInput = document.getElementById('sub-school');
    if (!nameInput.value) nameInput.value = userProfile.username || '';
    if (!schoolInput.value) schoolInput.value = userProfile.school || '';

    const gradeInput = document.getElementById('sub-room-grade');
    if (!gradeInput.value && userProfile.grade) {
        gradeInput.value = userProfile.grade ? `${formatGrade(userProfile.grade)}` : '';
    }

    // Load saved sub day data if it exists, otherwise load defaults
    const saved = subDays[dateStr];
    if (saved) {
        fillSubDayForm(saved);
        // Show "this day has saved data" indicator
        document.getElementById('sub-defaults-status').textContent = '✏️ Editing saved packet';
    } else {
        loadSubDayFromDefaults();
        document.getElementById('sub-defaults-status').textContent =
            Object.keys(subDayDefaults).length > 0
                ? '✨ Pre-filled from your defaults'
                : '💡 Save defaults to pre-fill future packets';
    }

    // Build schedule blocks from today's classes
    buildSubScheduleBlocks(dateStr, saved);

    // Init AI packet generator (resource picker + status)
    initPacketGenerator(dateStr);

    // Set the "Mark as Sub Day" toggle from saved data. When the packet was
    // opened via "Create Sub Day" (Day view), the day is marked from the start.
    const markedToggle = document.getElementById('sub-day-marked-toggle');
    if (markedToggle) markedToggle.checked = opts.markAsSubDay === true || subDays[dateStr]?.isSubDay === true;
    document.getElementById('sub-day-modal').dataset.forceSubDay = opts.markAsSubDay === true ? '1' : '';

    // Show packet exists / not exists badge
    updatePacketBadge(dateStr);

    document.getElementById('sub-day-modal').classList.remove('hidden');
}

// Fill form fields from saved data
function fillSubDayForm(data) {
    const fields = [
        'sub-teacher-name','sub-room-grade','sub-school','sub-sub-name',
        'sub-neighbor','sub-office','sub-contact-notes',
        'sub-morning','sub-attendance','sub-lunch',
        'sub-end-of-day','sub-restroom','sub-early-finishers','sub-behavior-system',
        'sub-medical','sub-student-notes','sub-helpers',
        'sub-feedback-prompt','sub-extras','sub-specials','sub-materials-location'
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el && data[id] !== undefined) el.value = data[id];
    });
}

// Load defaults into the form (for a new, unsaved sub day)
function loadSubDayFromDefaults() {
    // Clear all fields
    const allFields = [...SUB_DEFAULT_FIELDS, 'sub-sub-name'];
    allFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Apply saved defaults
    SUB_DEFAULT_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && subDayDefaults[id] !== undefined) {
            el.value = subDayDefaults[id];
        }
    });

    // Fallback: teacher info from profile if defaults not set
    if (!document.getElementById('sub-teacher-name').value)
        document.getElementById('sub-teacher-name').value = userProfile.username || '';
    if (!document.getElementById('sub-school').value)
        document.getElementById('sub-school').value = userProfile.school || '';
    if (!document.getElementById('sub-room-grade').value && userProfile.grade)
        document.getElementById('sub-room-grade').value = formatGrade(userProfile.grade) || '';

    // Fallback feedback prompt if nothing saved
    const fp = document.getElementById('sub-feedback-prompt');
    if (fp && !fp.value)
        fp.value = 'Please leave a note describing how the day went, any concerns, or anything that was not completed. Thank you so much!';
}

// Build per-class instruction blocks
function buildSubScheduleBlocks(dateStr, saved) {
    subWorkPages = {}; // reset picked-pages state for this packet
    const container = document.getElementById('sub-schedule-blocks');
    const noClassesEl = document.getElementById('sub-no-classes');
    const date = new Date(dateStr + 'T00:00:00');
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    const dayKey = dayNames[date.getDay()];

    const dayClassesRaw = classes.filter(cls => cls.schedule && cls.schedule[dayKey] && isClassActiveOnDate(cls, dateStr));
    const classSlots = getSortedClassSlots(dayClassesRaw, dayKey);

    if (classSlots.length === 0) {
        container.innerHTML = '';
        noClassesEl.classList.remove('hidden');
        return;
    }
    noClassesEl.classList.add('hidden');
    const dayLessons = lessons.filter(l => l.date === dateStr);
    container.innerHTML = classSlots.map(({ cls, slotIndex: si, slot, slotCount }) => {
        // Key for per-slot saved data: "classId_slotIndex" for multi-slot, "classId" for single
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        // v6.9.1: saved.workPicks is written the moment pages are picked;
        // classInstructions[..].workPages is what older full saves wrote.
        subWorkPages[slotKey] = saved?.workPicks?.[slotKey]
            || (saved?.classInstructions?.[slotKey]?.workPages) || (subClassDefaults[cls.id]?.workPages) || [];
        const timeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dayKey);
        const sessionLabel = slotCount > 1 ? ` · Session ${si + 1}` : '';
        const savedInstructions = saved?.classInstructions?.[slotKey];
        const classDefault      = subClassDefaults[cls.id] || {};
        const lesson = findLessonForSlot(dayLessons, cls.id, si);
        const lessonText = lesson
            ? `Lesson: ${lesson.title || ''}${lesson.objectives ? '\nObjectives: ' + lesson.objectives : ''}${lesson.activities ? '\nActivities: ' + lesson.activities : ''}${lesson.materials ? '\nMaterials: ' + lesson.materials : ''}`
            : '';

        // Priority: saved-for-this-date > class default > lesson plan text
        const instructionsVal = savedInstructions !== undefined
            ? savedInstructions.instructions
            : (classDefault.instructions || lessonText);
        const materialsVal = savedInstructions !== undefined
            ? savedInstructions.materials
            : (classDefault.materials || '');
        const notesVal = savedInstructions !== undefined
            ? savedInstructions.notes
            : (classDefault.notes || '');

        const hasLesson = !!lesson;
        const lessonBadge = hasLesson
            ? `<span class="sub-lesson-badge" title="${escHtml(lesson.title || 'Lesson planned')}">📋 ${lesson.title ? escHtml(lesson.title.substring(0,30)) + (lesson.title.length > 30 ? '…' : '') : 'Lesson planned'}</span>`
            : `<span class="sub-lesson-badge sub-lesson-none">No lesson planned</span>`;

        const lessonDataAttr = hasLesson
            ? `data-lesson-instructions="${encodeURIComponent(lessonText)}"
               data-lesson-materials="${encodeURIComponent(lesson.materials || '')}"
               data-lesson-notes="${encodeURIComponent(lesson.notes || '')}"`
            : '';

        const defaultDataAttr = `data-default-instructions="${encodeURIComponent(classDefault.instructions || '')}"
               data-default-materials="${encodeURIComponent(classDefault.materials || '')}"
               data-default-notes="${encodeURIComponent(classDefault.notes || '')}"`;

        const deviceIcons = { iPad:'📱', Chromebook:'💻', laptop:'🖥️', desktop:'🖥️', smartboard:'📺', other:'📡' };

        // Saved approved tools for this class
        const savedComputer = savedInstructions?.computerTime || classDefault.computerTime || {};
        const approvedToolIds = savedComputer.approvedToolIds || (savedComputer.enabled && savedComputer.toolId ? [savedComputer.toolId] : []);
        const compNotes = savedComputer.notes || '';

        // Build tech pills
        const techPillsHtml = techTools.length > 0
            ? techTools.map(t => {
                const active = approvedToolIds.includes(t.id);
                return `<button type="button"
                    class="tech-pill ${active ? 'tech-pill-active' : ''}"
                    data-tool-id="${t.id}"
                    data-class-id="${cls.id}"
                    onclick="toggleTechPill(this)"
                    title="${escHtml(t.notes || t.name)}">${deviceIcons[t.device]||'💻'} ${escHtml(t.name)}</button>`;
              }).join('')
            : '<span style="font-size:0.78rem;color:var(--text-muted);">No tech tools added yet — add them in Settings → Classroom Technology</span>';

        const savedIncluded = savedInstructions?.included !== false; // default true

        return `
        <div class="sub-class-block${savedIncluded ? '' : ' excluded'}" data-class-id="${cls.id}" data-slot-key="${slotKey}" style="border-left: 4px solid ${cls.color || '#FF6B9D'}">
            <div class="sub-class-block-header">
                <div class="sub-class-block-color-dot" style="background:${cls.color || '#FF6B9D'}"></div>
                <div class="sub-class-block-title">
                    <strong>${escHtml(cls.name)}${sessionLabel}</strong>
                    <span class="sub-class-time">${timeStr}${cls.room ? ' · ' + escHtml(cls.room) : ''}</span>
                </div>
                <label class="sub-class-include-label" title="Include this class when generating the AI Student Work Packet">
                    <input type="checkbox" class="sub-class-include" data-class-id="${cls.id}"
                        ${savedIncluded ? 'checked' : ''}
                        onchange="toggleSubClassInclude(this)">
                    <span>📝 AI work</span>
                </label>
            </div>
            <div class="sub-lesson-row">
                ${lessonBadge}
                <div class="sub-lesson-actions">
                    ${hasLesson ? `<button type="button" class="btn btn-ghost btn-xs sub-push-lesson-btn"
                        ${lessonDataAttr}
                        data-class-id="${cls.id}"
                        onclick="pushLessonToSub(this)"
                        title="Fill sub instructions from this lesson plan">📋 Push Lesson</button>` : ''}
                    ${classDefault.instructions ? `<button type="button" class="btn btn-ghost btn-xs sub-use-default-btn"
                        ${defaultDataAttr}
                        data-class-id="${cls.id}"
                        onclick="pushDefaultToSub(this)"
                        title="Fill from your saved sub defaults">🔄 Use Default</button>` : ''}
                </div>
            </div>
            <div class="form-group">
                <label>📌 Sub Instructions for This Class</label>
                <textarea class="form-control sub-class-instructions" data-class-id="${cls.id}" rows="4"
                    placeholder="What should the sub do during this period? Be specific...">${escHtml(instructionsVal)}</textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>📦 Materials / Location</label>
                    <input type="text" class="form-control sub-class-materials" data-class-id="${cls.id}"
                        placeholder="e.g. Worksheet in red folder on desk"
                        value="${escHtml(materialsVal)}">
                </div>
                <div class="form-group">
                    <label>⚠️ Notes / Heads Up</label>
                    <input type="text" class="form-control sub-class-notes" data-class-id="${cls.id}"
                        placeholder="e.g. Noisy group — use quiet signal"
                        value="${escHtml(notesVal)}">
                </div>
            </div>
            <div class="subwork-section">
                <div class="subwork-head">
                    <label>📄 Student Work Pages <span class="subwork-hint">(hand-pick actual pages from your PDFs)</span></label>
                    <button type="button" class="btn btn-ghost btn-xs" onclick="openPagePicker('${slotKey}')">➕ Pick pages</button>
                </div>
                <div class="subwork-chips">${subWorkChipsHTML(slotKey)}</div>
            </div>
            <!-- Tech Pills -->
            ${techTools.length > 0 ? `
            <div class="sub-class-tech-pills">
                <div class="sub-class-tech-label">✅ Approved tech this period:</div>
                <div class="sub-class-tech-pill-row" data-class-id="${cls.id}">
                    ${techPillsHtml}
                </div>
                ${approvedToolIds.length > 0 ? `
                <div class="form-group" style="margin-top:0.4rem;">
                    <input type="text" class="form-control sub-class-computer-notes" data-class-id="${cls.id}"
                        placeholder="Sub notes for tech time (e.g. 15 min, earn 3 stars)"
                        value="${escHtml(compNotes)}" style="font-size:0.82rem;">
                </div>` : ''}
            </div>` : ''}
        </div>`;
    }).join('');
}

// Toggle a class block's included/excluded state
function toggleSubClassInclude(checkbox) {
    const block = checkbox.closest('.sub-class-block');
    if (!block) return;
    if (checkbox.checked) {
        block.classList.remove('excluded');
    } else {
        block.classList.add('excluded');
    }
}

// Collect all form values into a data object
function collectSubDayData(dateStr) {
    const data = { date: dateStr };
    const fields = [
        'sub-teacher-name','sub-room-grade','sub-school','sub-sub-name',
        'sub-neighbor','sub-office','sub-contact-notes',
        'sub-morning','sub-attendance','sub-lunch',
        'sub-end-of-day','sub-restroom','sub-early-finishers','sub-behavior-system',
        'sub-medical','sub-student-notes','sub-helpers',
        'sub-feedback-prompt','sub-extras','sub-specials','sub-materials-location'
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });

    // Collect per-class instructions + approved tech pills
    // Key is slotKey (classId_slotIndex for multi-slot, classId for single-slot)
    data.workPicks = JSON.parse(JSON.stringify(subWorkPages || {}));
    data.classInstructions = {};
    document.querySelectorAll('#sub-schedule-blocks .sub-class-block').forEach(block => {
        const classId = block.dataset.classId;
        const slotKey = block.dataset.slotKey || classId;
        // Collect all active tech pill tool IDs
        const activePills = Array.from(block.querySelectorAll('.tech-pill-active'));
        const approvedToolIds = activePills.map(p => p.dataset.toolId);
        const approvedTools = approvedToolIds.map(id => techTools.find(t => t.id === id)).filter(Boolean);
        const includeCheckbox = block.querySelector('.sub-class-include');
        data.classInstructions[slotKey] = {
            included:     includeCheckbox ? includeCheckbox.checked : true,
            instructions: block.querySelector('.sub-class-instructions')?.value || '',
            materials:    block.querySelector('.sub-class-materials')?.value || '',
            notes:        block.querySelector('.sub-class-notes')?.value || '',
            workPages:    subWorkPages[slotKey] || [],   // kept for older versions
            computerTime: {
                enabled:       approvedToolIds.length > 0,
                approvedToolIds,
                toolId:        approvedToolIds[0] || '',
                toolName:      approvedTools.map(t => t.name).join(', '),
                toolNotes:     approvedTools.map(t => t.notes).filter(Boolean).join('; '),
                device:        approvedTools[0]?.device || '',
                notes:         block.querySelector('.sub-class-computer-notes')?.value || ''
            }
        };
    });

    return data;
}

// Toggle a tech pill on/off for a class period
function toggleTechPill(btn) {
    btn.classList.toggle('tech-pill-active');
    const block = btn.closest('.sub-class-block');
    const classId = btn.dataset.classId;
    const pillRow = btn.closest('.sub-class-tech-pill-row');

    // Show/hide notes field based on whether any pill is active
    const anyActive = pillRow.querySelectorAll('.tech-pill-active').length > 0;
    let notesField = block.querySelector('.sub-class-computer-notes');
    if (anyActive && !notesField) {
        // Inject notes field dynamically
        const techDiv = block.querySelector('.sub-class-tech-pills');
        const noteDiv = document.createElement('div');
        noteDiv.className = 'form-group';
        noteDiv.style.marginTop = '0.4rem';
        noteDiv.innerHTML = `<input type="text" class="form-control sub-class-computer-notes" data-class-id="${classId}"
            placeholder="Sub notes for tech time (e.g. 15 min, earn 3 stars)" style="font-size:0.82rem;">`;
        techDiv.appendChild(noteDiv);
    } else if (!anyActive && notesField) {
        notesField.closest('.form-group')?.remove();
    }
}

// Legacy — keep for backward compat
function toggleComputerTime(checkbox) {}

// Push existing lesson plan into the sub instructions fields
function pushLessonToSub(btn) {
    const block = btn.closest('.sub-class-block');
    const classId = btn.dataset.classId;
    const instructions = decodeURIComponent(btn.dataset.lessonInstructions || '');
    const materials    = decodeURIComponent(btn.dataset.lessonMaterials || '');
    const notes        = decodeURIComponent(btn.dataset.lessonNotes || '');
    const ta = block.querySelector('.sub-class-instructions');
    const mat = block.querySelector('.sub-class-materials');
    const nt  = block.querySelector('.sub-class-notes');
    if (ta) ta.value = instructions;
    if (mat && materials) mat.value = materials;
    if (nt && notes) nt.value = notes;
    showToast('📋 Lesson pushed to sub instructions');
}

// Push saved sub defaults into the sub instructions fields
function pushDefaultToSub(btn) {
    const block = btn.closest('.sub-class-block');
    const instructions = decodeURIComponent(btn.dataset.defaultInstructions || '');
    const materials    = decodeURIComponent(btn.dataset.defaultMaterials || '');
    const notes        = decodeURIComponent(btn.dataset.defaultNotes || '');
    const ta = block.querySelector('.sub-class-instructions');
    const mat = block.querySelector('.sub-class-materials');
    const nt  = block.querySelector('.sub-class-notes');
    if (ta) ta.value = instructions;
    if (mat) mat.value = materials;
    if (nt) nt.value = notes;
    showToast('🔄 Default sub instructions restored');
}

// Save sub day to Firestore
async function saveSubDay(opts) {
    const quiet = !!(opts && opts.quiet === true);
    const modal = document.getElementById('sub-day-modal');
    const dateStr = modal.dataset.date;
    if (!dateStr) { showToast('❌ No date set — reopen the packet'); return; }

    const isSubDay = document.getElementById('sub-day-marked-toggle')?.checked === true
        || modal.dataset.forceSubDay === '1';
    const markedToggleEl = document.getElementById('sub-day-marked-toggle');
    if (markedToggleEl && isSubDay) markedToggleEl.checked = true;
    const data = collectSubDayData(dateStr);
    data.isSubDay = isSubDay;
    data.createStudentWork = document.getElementById('sub-create-student-work')?.checked === true;
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    // Preserve any generated packet already in memory
    if (subDays[dateStr]?.generatedPacket && !data.generatedPacket) {
        data.generatedPacket = subDays[dateStr].generatedPacket;
    }

    // Strip undefined values — Firestore rejects them and silently skips the write
    const cleanData = JSON.parse(JSON.stringify(data, (k, v) => v === undefined ? null : v));

    try {
        const yearPath = getYearPath();
        // Use set+merge for the full packet, then explicitly update isSubDay
        // so the toggle always persists even if other fields fail validation
        await yearPath.collection('subDays').doc(dateStr).set(cleanData, { merge: true });
        subDays[dateStr] = { ...subDays[dateStr], ...cleanData };
        renderCalendar();
        if (typeof renderDayView === 'function' && !document.getElementById('day-view')?.classList.contains('hidden')) renderDayView();
        if (!quiet) showToast(isSubDay ? '✅ Saved — this day is now a Sub Day' : '✅ Sub Day packet saved!');
        const st = document.getElementById('sub-defaults-status');
        if (st) st.textContent = '✏️ Editing saved packet';
    } catch (e) {
        console.error('Save sub day error:', e.code, e.message, e);
        // If the full save failed, try to at least save the isSubDay flag
        try {
            const yearPath = getYearPath();
            await yearPath.collection('subDays').doc(dateStr).set(
                { isSubDay, date: dateStr, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                { merge: true }
            );
            subDays[dateStr] = { ...subDays[dateStr], isSubDay, date: dateStr };
            renderCalendar();
            if (typeof renderDayView === 'function' && !document.getElementById('day-view')?.classList.contains('hidden')) renderDayView();
            showToast('⚠️ Packet partially saved (toggle saved, other fields may not have)');
        } catch (e2) {
            showToast('❌ Could not save: ' + (e.code || e.message || 'Unknown error'));
        }
    }
}

// Generate and print the sub packet
function printSubPacket() {
    const modal = document.getElementById('sub-day-modal');
    const dateStr = modal.dataset.date;
    const data = collectSubDayData(dateStr);

    const date = new Date(dateStr + 'T00:00:00');
    const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Build class schedule HTML — one block per slot
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    const dayKey = dayNames[date.getDay()];
    const _printDayClasses = classes.filter(cls => cls.schedule && cls.schedule[dayKey] && isClassActiveOnDate(cls, dateStr));
    const _printClassSlots = getSortedClassSlots(_printDayClasses, dayKey);
    const _printDayLessons = lessons.filter(l => l.date === dateStr);

    const scheduleHtml = _printClassSlots.map(({ cls, slotIndex: si, slot, slotCount }) => {
        const timeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dayKey);
        const sessionLabel = slotCount > 1 ? ` · Session ${si + 1}` : '';
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        const ci = data.classInstructions?.[slotKey] || {};
        const ct = ci.computerTime || {};
        const computerHtml = ct.enabled && ct.toolName
            ? '<div style="margin-top:8px;padding:8px 10px;background:#e3f2fd;border-left:3px solid #2980b9;border-radius:3px;">'
              + '<strong style="font-size:12px;color:#2980b9;">💻 Computer Time' + (ct.duration ? ' · ' + ct.duration : '') + ': ' + ct.toolName + '</strong>'
              + (ct.toolNotes ? '<p style="margin:3px 0 0;font-size:11px;color:#555;">' + ct.toolNotes + '</p>' : '')
              + (ct.notes ? '<p style="margin:3px 0 0;font-size:11px;color:#555;font-style:italic;">' + ct.notes + '</p>' : '')
              + '</div>'
            : '';
        const instrHtml = ci.instructions
            ? '<p style="margin:0 0 6px;white-space:pre-wrap;font-size:13px;">' + ci.instructions + '</p>'
            : '<p style="color:#999;font-size:13px;font-style:italic;">No specific instructions provided.</p>';
        const matHtml = ci.materials
            ? '<p style="margin:4px 0;font-size:12px;color:#444;"><strong>📦 Materials:</strong> ' + ci.materials + '</p>'
            : '';
        const noteHtml = ci.notes
            ? '<p style="margin:4px 0;font-size:12px;color:#c0392b;"><strong>⚠️ Note:</strong> ' + ci.notes + '</p>'
            : '';
        return '<div class="print-class-block" style="border-left:5px solid ' + (cls.color || '#FF6B9D') + '; margin-bottom:16px; padding:12px 16px; background:#fafafa; border-radius:4px; page-break-inside:avoid;">'
            + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
            + '<div style="width:14px;height:14px;border-radius:50%;background:' + (cls.color || '#FF6B9D') + ';flex-shrink:0;"></div>'
            + '<strong style="font-size:15px;">' + cls.name + sessionLabel + '</strong>'
            + '<span style="color:#666;font-size:13px;">' + timeStr + (cls.room ? ' · ' + cls.room : '') + '</span>'
            + '</div>'
            + instrHtml + matHtml + noteHtml + computerHtml
            + '</div>';
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} Sub Plan</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #222; background: #fff; }
  @page { margin: 0.4in 0.45in; }

  .packet-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #FF6B9D; padding-bottom: 8px; margin-bottom: 12px;
  }
  .packet-header-left h1 { font-size: 20px; color: #FF6B9D; margin-bottom: 2px; }
  .packet-header-left p { font-size: 12px; color: #555; }
  .packet-header-right { text-align: right; }
  .packet-header-right .info-row { font-size: 11px; color: #444; margin-bottom: 2px; }
  .packet-header-right .info-row strong { color: #222; }

  .print-section { margin-bottom: 10px; }
  .print-section h2 {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
    color: #fff; background: #2c3e50; padding: 3px 7px; border-radius: 2px;
    margin-bottom: 5px;
  }
  .print-section.accent-pink h2   { background: #e91e8c; }
  .print-section.accent-blue h2   { background: #2980b9; }
  .print-section.accent-green h2  { background: #27ae60; }
  .print-section.accent-orange h2 { background: #e67e22; }
  .print-section.accent-red h2    { background: #c0392b; }
  .print-section.accent-purple h2 { background: #8e44ad; }
  .print-section-empty { display: none !important; }

  .print-field { margin-bottom: 4px; }
  .print-field .label { font-weight: 700; font-size: 9px; color: #666; margin-bottom: 1px; }
  .print-field .value { font-size: 11px; color: #222; white-space: pre-wrap; line-height: 1.4; }
  .print-field .value.empty { color: #aaa; font-style: italic; }

  /* Class blocks in the schedule column */
  .print-class-block { margin-bottom: 10px; }

  .feedback-box {
    margin-top: 12px; border: 2px dashed #FF6B9D; padding: 8px; border-radius: 4px;
  }
  .feedback-box h2 { font-size: 11px; color: #FF6B9D; margin-bottom: 5px; }
  .feedback-line { border-bottom: 1px solid #ddd; height: 20px; margin-bottom: 3px; }

  .packet-footer {
    margin-top: 10px; border-top: 1px solid #ddd; padding-top: 6px;
    display: flex; justify-content: space-between; font-size: 9px; color: #999;
  }
</style>
</head>
<body>

<!-- HEADER -->
<div class="packet-header">
  <div class="packet-header-left">
    <h1>🙋 Substitute Teacher Packet</h1>
    <p>${formatted}</p>
  </div>
  <div class="packet-header-right">
    ${data['sub-teacher-name'] ? `<div class="info-row"><strong>Teacher:</strong> ${data['sub-teacher-name']}</div>` : ''}
    ${data['sub-room-grade'] ? `<div class="info-row"><strong>Room / Grade:</strong> ${data['sub-room-grade']}</div>` : ''}
    ${data['sub-school'] ? `<div class="info-row"><strong>School:</strong> ${data['sub-school']}</div>` : ''}
    ${data['sub-sub-name'] ? `<div class="info-row"><strong>Sub:</strong> ${data['sub-sub-name']}</div>` : ''}
  </div>
</div>

<!-- Morning Routine -->
<div class="print-section accent-blue">
  <h2>🌅 Morning Routine</h2>
  ${data['sub-morning'] ? `<div class="print-field"><div class="value">${data['sub-morning']}</div></div>` : ''}
  ${data['sub-attendance'] ? `<div class="print-field"><div class="label">Attendance</div><div class="value">${data['sub-attendance']}</div></div>` : ''}
  ${data['sub-lunch'] ? `<div class="print-field"><div class="label">Lunch Count</div><div class="value">${data['sub-lunch']}</div></div>` : ''}
</div>

<!-- End of Day -->
<div class="print-section accent-blue">
  <h2>🌇 End of Day</h2>
  ${data['sub-end-of-day'] ? `<div class="print-field"><div class="value">${data['sub-end-of-day']}</div></div>` : '<div class="print-field"><div class="value empty">No end-of-day routine specified.</div></div>'}
</div>

<!-- Classroom Procedures -->
<div class="print-section accent-green">
  <h2>📋 Classroom Procedures</h2>
  ${data['sub-restroom'] ? `<div class="print-field"><div class="label">Restroom</div><div class="value">${data['sub-restroom']}</div></div>` : ''}
  ${data['sub-early-finishers'] ? `<div class="print-field"><div class="label">Early Finishers</div><div class="value">${data['sub-early-finishers']}</div></div>` : ''}
  ${data['sub-behavior-system'] ? `<div class="print-field"><div class="label">Behavior System</div><div class="value">${data['sub-behavior-system']}</div></div>` : ''}
</div>

<!-- Student Alerts -->
<div class="print-section accent-red">
  <h2>⚠️ Student Alerts</h2>
  ${data['sub-medical'] ? `<div class="print-field"><div class="label">Medical / Allergy</div><div class="value">${data['sub-medical']}</div></div>` : ''}
  ${data['sub-student-notes'] ? `<div class="print-field"><div class="label">Behavioral Notes</div><div class="value">${data['sub-student-notes']}</div></div>` : ''}
  ${data['sub-helpers'] ? `<div class="print-field"><div class="label">Helpers / Leaders Today</div><div class="value">${data['sub-helpers']}</div></div>` : ''}
</div>

<!-- Special Info -->
<div class="print-section accent-purple">
  <h2>📌 Special Schedule Notes</h2>
  ${data['sub-specials'] ? `<div class="print-field"><div class="value">${data['sub-specials']}</div></div>` : '<div class="print-field"><div class="value empty">No specials noted.</div></div>'}
</div>

<!-- Where to Find Things -->
<div class="print-section accent-orange">
  <h2>🗂️ Where to Find Things</h2>
  ${data['sub-materials-location'] ? `<div class="print-field"><div class="value">${data['sub-materials-location']}</div></div>` : '<div class="print-field"><div class="value empty">See desk for materials.</div></div>'}
</div>

<!-- Extra Time -->
${data['sub-extras'] ? `<div class="print-section">
  <h2>➕ Extra / Free Time</h2>
  <div class="print-field"><div class="value">${data['sub-extras']}</div></div>
</div>` : ''}

<!-- Emergency Contacts -->
<div class="print-section accent-red">
  <h2>📞 Emergency Contacts</h2>
  ${data['sub-neighbor'] ? `<div class="print-field"><div class="label">Neighbor / Go-To Teacher</div><div class="value">${data['sub-neighbor']}</div></div>` : ''}
  ${data['sub-office'] ? `<div class="print-field"><div class="label">Office / Admin</div><div class="value">${data['sub-office']}</div></div>` : ''}
  ${data['sub-contact-notes'] ? `<div class="print-field"><div class="label">Other</div><div class="value">${data['sub-contact-notes']}</div></div>` : ''}
</div>

<!-- SCHEDULE -->
<div class="print-section accent-pink">
  <h2>🗓️ Today's Schedule & Instructions</h2>
  ${_printDayClasses.length > 0 ? scheduleHtml : '<p style="color:#999;font-style:italic;padding:8px 0;">No classes found for this day.</p>'}
</div>

<!-- FEEDBACK BOX -->
<div class="feedback-box">
  <h2>📝 Please Leave a Note for ${data['sub-teacher-name'] || 'the Teacher'}</h2>
  <p style="font-size:12px;color:#555;margin-bottom:10px;">${data['sub-feedback-prompt'] || 'Please leave a note about how the day went, any concerns, or anything not completed.'}</p>
  <div class="feedback-lines">
    <div class="feedback-line"></div>
    <div class="feedback-line"></div>
    <div class="feedback-line"></div>
    <div class="feedback-line"></div>
    <div class="feedback-line"></div>
  </div>
</div>

<!-- FOOTER -->
<div class="packet-footer">
  <span>Substitute Packet · ${formatted}</span>
  <span>Thank you for being here today! 💙</span>
</div>

${subDays[dateStr] && subDays[dateStr].generatedPacket
    ? '<div style="page-break-before:always;"><style>'      + 'table{display:block!important;width:100%!important;}'      + 'tr{display:block!important;width:100%!important;}'      + 'td{display:block!important;width:100%!important;border:none!important;padding:0!important;}'      + '[style*="page-break-before"]{page-break-before:always!important;break-before:page!important;}'      + 'p,li{page-break-inside:avoid;}'      + '</style>' + subDays[dateStr].generatedPacket + '</div>'
    : ''}

</body>
</html>`;

    const win = openPrintWindow();
    win.document.write(preparePrintDoc(html, {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => {
        // Hide any print-section that has no visible content (only an h2 child)
        win.document.querySelectorAll('.print-section').forEach(sec => {
            const hasContent = Array.from(sec.children).some(el => el.tagName !== 'H2' && el.offsetHeight > 0);
            if (!hasContent) sec.classList.add('print-section-empty');
        });
        setTimeout(() => {
            win.focus();
            win.print();
        }, 400);
    };
}

// Build the AI Student Work Packet for a sub day: one activity set per
// scheduled class, using that class's lesson (if any) and typed sub
// instructions as context. Streams into the modal's status area, then
// saves the finished HTML onto subDays[dateStr].generatedPacket so it's
// available both from "Print Student Work" and embedded in the full plan.
async function generateSubDayStudentPacket(dateStr) {
    const statusEl = document.getElementById('sub-ai-status');
    const stickyEl = document.getElementById('sub-ai-sticky-status');
    const genBtn   = document.getElementById('sub-ai-generate-btn');
    const styleEl  = document.getElementById('sub-ai-style');
    const instrEl  = document.getElementById('sub-ai-instructions');
    const printWorkBtn = document.getElementById('sub-day-student-work-btn');

    if (!hasEffectiveAiKey()) { showToast('Add your AI API key in Settings first.'); return; }

    const date = new Date(dateStr + 'T00:00:00');
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    const dayKey = dayNames[date.getDay()];
    const dayClasses = classes.filter(cls => cls.schedule && cls.schedule[dayKey] && isClassActiveOnDate(cls, dateStr) && cls.type !== 'activity');
    const classSlots = getSortedClassSlots(dayClasses, dayKey);
    const dayLessons = lessons.filter(l => l.date === dateStr);
    const formData = collectSubDayData(dateStr);

    if (classSlots.length === 0) {
        showToast('No classes scheduled this day — nothing to generate a packet for.');
        return;
    }

    const styleLabel = {
        worksheets: 'worksheets and practice problems',
        activities: 'hands-on activities and games',
        mixed: '2 activities per class period, each roughly one full printed page',
        reading: 'a short reading passage with comprehension questions'
    }[styleEl?.value] || '2 activities per class period';
    const grade = userProfile.grade ? formatGrade(userProfile.grade) : '1st Grade';
    const specialInstructions = instrEl?.value.trim() || '';

    // v6.2.0: honour the per-class "📝 AI work" checkbox -- unchecked
    // classes used to get activities anyway.
    const includedSlots = classSlots.filter(({ cls, slotIndex: si, slotCount }) => {
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        return formData.classInstructions?.[slotKey]?.included !== false;
    });
    if (includedSlots.length === 0) {
        showToast('Every class is unchecked for AI work — tick at least one "📝 AI work" box.');
        return;
    }

    const classContext = includedSlots.map(({ cls, slotIndex: si, slotCount }) => {
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        const lesson = findLessonForSlot(dayLessons, cls.id, si);
        const ci = formData.classInstructions?.[slotKey] || {};
        return `Class: ${cls.name}${cls.subject ? ' (' + cls.subject + ')' : ''}\n`
            + (lesson?.title ? `Today's lesson: ${lesson.title}\n` : '')
            + (lesson?.notes ? `Lesson notes: ${lesson.notes}\n` : '')
            + (ci.instructions ? `Sub instructions: ${ci.instructions}\n` : '');
    }).join('\n');

    const prompt = `Create a printable student work packet for a substitute-teacher day in a ${grade} classroom.\n`
        + `For EACH class period below, create ${styleLabel} that a substitute can hand out with no special prep.\n`
        + `Give every class period exactly 2 activities.\n`
        + (specialInstructions ? `Special instructions: ${specialInstructions}\n` : '')
        + `\nClasses today:\n${classContext}\n`
        + `\nFormat the output as clean semantic HTML fragments only (use <h2> for each class name, <h3> for each activity title, <p>, <ol>/<li>, and simple <table> where useful). `
        + `Do not include <html>, <head>, or <body> tags, and do not use Markdown syntax (no **, ##, backticks). `
        + `Start each class's section with <div style="page-break-before:always;"> and close it with </div> so each class prints on its own page. `
        + `Write for a ${grade} reading level — clear, simple, age-appropriate language and short instructions.`;

    statusEl.innerHTML = '🤖 Generating student packet…';
    stickyEl.textContent = '🤖 Generating student packet…';
    stickyEl.classList.remove('hidden');
    if (genBtn) genBtn.disabled = true;
    if (printWorkBtn) printWorkBtn.disabled = true;

    try {
        let full = '';
        await callAITextStream({
            prompt,
            tier: 'quality',
            maxTokens: 16000,
            onDelta: (_chunk, fullText) => {
                full = fullText;
                statusEl.innerHTML = `🤖 Generating… (${fullText.length.toLocaleString()} characters so far)`;
            }
        });

        subDays[dateStr] = { ...subDays[dateStr], generatedPacket: full, aiStyle: styleEl?.value || null, aiInstructions: specialInstructions };
        // v6.2.0: write the packet to the date it was generated FOR. Before,
        // saveSubDay() read whichever date the modal showed ~2 minutes later,
        // so opening another day meanwhile lost the packet.
        await getYearPath().collection('subDays').doc(dateStr).set({
            date: dateStr,
            generatedPacket: full,
            aiStyle: styleEl?.value || null,
            aiInstructions: specialInstructions,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        const subModal = document.getElementById('sub-day-modal');
        if (subModal && subModal.dataset.date === dateStr && !subModal.classList.contains('hidden')) {
            await saveSubDay();   // also keep the rest of the open form
        }
        updatePacketBadge(dateStr);
        statusEl.innerHTML = '✅ Student packet ready!';
        showToast('✅ Student packet generated and saved!');
    } catch (e) {
        console.error('generateSubDayStudentPacket:', e);
        statusEl.innerHTML = '❌ ' + (e.message || 'Generation failed.');
        showToast('❌ Could not generate packet: ' + (e.message || 'Unknown error'));
    } finally {
        stickyEl.classList.add('hidden');
        if (genBtn) genBtn.disabled = false;
        if (printWorkBtn) printWorkBtn.disabled = false;
    }
}

// Print just the AI-generated student packet (no sub instructions), for
// running copies to hand to students.
function printSubDayStudentWork(dateStr) {
    const packet = subDays[dateStr]?.generatedPacket;
    if (!packet) {
        showToast('No student packet generated yet — click "✨ Generate Student Packet" first.');
        return;
    }
    const date = new Date(dateStr + 'T00:00:00');
    const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Student Work Packet — ${formatted}</title>
        <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #222; margin: 0; }
        table { display:block!important; width:100%!important; }
        tr { display:block!important; width:100%!important; }
        td { display:block!important; width:100%!important; border:none!important; padding:0!important; }
        [style*="page-break-before"] { page-break-before: always !important; break-before: page !important; }
        p, li { page-break-inside: avoid; }
        </style></head><body>${packet}</body></html>`, {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => { setTimeout(() => { win.focus(); win.print(); }, 400); };
}


