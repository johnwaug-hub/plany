// ============================================================
// 🏫 PRINCIPAL / STAFF VIEW
// ============================================================

let principalLinkedTeachers = [];   // accepted links where I am the principal
let principalPendingLinks    = [];   // pending link requests I sent as principal
let teacherLinkRequests      = [];   // incoming requests asking ME (teacher) to link
let _previewTeacher          = null; // teacher object being previewed
let _previewTab              = 'year';
// Saved copies of the teacher's data while previewing
let _savedClasses = null, _savedLessons = null, _savedEvents = null, _savedSettings = null;
let _principalCommentContext = null; // { teacherUid, lessonId, lessonTitle, date }

// ── Helpers ──────────────────────────────────────────────────

function isPrincipal() {
    return userProfile?.role === 'admin' || settings.userProfile?.role === 'admin';
}

function initPrincipalView() {
    // Show/hide Staff nav item based on role
    const navItem = document.getElementById('principal-nav-item');
    if (navItem) navItem.classList.toggle('hidden', !isPrincipal());

    if (!isPrincipal()) return;

    loadPrincipalData();
}

// ── Data loading ──────────────────────────────────────────────

async function loadPrincipalData() {
    if (!currentUser || !isPrincipal()) return;
    try {
        // Links where I am principal (accepted)
        const acceptedSnap = await db.collection('principalLinks')
            .where('principalUid', '==', currentUser.uid)
            .where('status', '==', 'accepted')
            .get();
        principalLinkedTeachers = acceptedSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Links I sent that are still pending
        const pendingSnap = await db.collection('principalLinks')
            .where('principalUid', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        principalPendingLinks = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Enrich teacher profiles
        await Promise.all(principalLinkedTeachers.map(async link => {
            try {
                const prof = await db.collection('users').doc(link.teacherUid).get();
                if (prof.exists) Object.assign(link, { profile: prof.data() });
            } catch(e) {}
        }));

        renderPrincipalDashboard();
    } catch(e) {
        console.error('loadPrincipalData:', e);
    }
}

// ── Teacher loads incoming link requests (for their profile) ──

async function loadTeacherLinkRequests() {
    if (!currentUser) return;
    try {
        const snap = await db.collection('principalLinks')
            .where('teacherUid', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        teacherLinkRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTeacherLinkRequests();
    } catch(e) { console.error('loadTeacherLinkRequests:', e); }
}

function renderTeacherLinkRequests() {
    const container = document.getElementById('teacher-link-requests-section');
    if (!container) return;
    if (teacherLinkRequests.length === 0) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    const inner = document.getElementById('teacher-link-requests-inner');
    if (!inner) return;
    inner.innerHTML = teacherLinkRequests.map(req => `
        <div class="principal-link-request">
            <span>🏫 <strong>${escHtml(req.principalName || req.principalEmail)}</strong> wants to view your Plany</span>
            <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="btn btn-primary btn-sm" onclick="acceptPrincipalLink('${req.id}')">Accept</button>
                <button class="btn btn-ghost btn-sm" onclick="declinePrincipalLink('${req.id}')">Decline</button>
            </div>
        </div>`).join('');
}

async function acceptPrincipalLink(linkId) {
    try {
        await db.collection('principalLinks').doc(linkId).update({ status: 'accepted', acceptedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Principal link accepted ✓');
        loadTeacherLinkRequests();
    } catch(e) { showToast('Error accepting link'); }
}

async function declinePrincipalLink(linkId) {
    try {
        await db.collection('principalLinks').doc(linkId).update({ status: 'declined' });
        showToast('Link request declined');
        loadTeacherLinkRequests();
    } catch(e) { showToast('Error declining link'); }
}

// ── Send link request (principal → teacher) ───────────────────

async function sendTeacherLinkRequest() {
    const emailEl = document.getElementById('link-teacher-email');
    const statusEl = document.getElementById('link-teacher-status');
    const email = emailEl?.value.trim().toLowerCase();
    if (!email) { if(statusEl) statusEl.textContent = 'Please enter an email.'; return; }
    if (statusEl) statusEl.innerHTML = '<span class="scan-spinner"></span> Looking up teacher…';

    try {
        // Find teacher by email in users collection
        const snap = await db.collection('users').where('email', '==', email).limit(1).get();
        if (snap.empty) {
            if (statusEl) statusEl.textContent = '❌ No Plany account found with that email.';
            return;
        }
        const teacherDoc = snap.docs[0];
        const teacherUid = teacherDoc.id;
        const teacherData = teacherDoc.data();

        if (teacherUid === currentUser.uid) {
            if (statusEl) statusEl.textContent = '❌ You can\'t link yourself.';
            return;
        }

        // Check not already linked
        const existing = await db.collection('principalLinks')
            .where('principalUid', '==', currentUser.uid)
            .where('teacherUid', '==', teacherUid)
            .limit(1).get();
        if (!existing.empty) {
            const st = existing.docs[0].data().status;
            if (statusEl) statusEl.textContent = st === 'accepted' ? '✓ Already linked.' : '⏳ Request already pending.';
            return;
        }

        const linkId = currentUser.uid + '_' + teacherUid;
        await db.collection('principalLinks').doc(linkId).set({
            principalUid: currentUser.uid,
            principalEmail: currentUser.email,
            principalName: userProfile.username || userProfile.displayName || currentUser.email,
            teacherUid,
            teacherEmail: email,
            teacherName: teacherData.username || teacherData.displayName || email,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (statusEl) statusEl.innerHTML = '✅ Request sent! The teacher will see it in their profile.';
        if (emailEl) emailEl.value = '';
        loadPrincipalData();
    } catch(e) {
        console.error('sendTeacherLinkRequest:', e);
        if (statusEl) statusEl.textContent = '❌ Error: ' + e.message;
    }
}

// ── Remove a link ─────────────────────────────────────────────

async function removePrincipalLink(linkId) {
    if (!await planyConfirm('Remove this teacher link? The teacher will no longer be visible in your Staff view.')) return;
    try {
        await db.collection('principalLinks').doc(linkId).delete();
        showToast('Link removed');
        loadPrincipalData();
    } catch(e) { showToast('Error removing link'); }
}

// ── Render dashboard ──────────────────────────────────────────

function renderPrincipalDashboard() {
    // Pending section
    const pendingSection = document.getElementById('principal-pending-list');
    const pendingInner   = document.getElementById('principal-pending-inner');
    if (pendingSection && pendingInner) {
        if (principalPendingLinks.length > 0) {
            pendingSection.classList.remove('hidden');
            pendingInner.innerHTML = principalPendingLinks.map(link => `
                <div class="principal-link-request">
                    <span>⏳ Waiting for <strong>${escHtml(link.teacherName || link.teacherEmail)}</strong> to accept</span>
                    <button class="btn btn-ghost btn-sm" onclick="removePrincipalLink('${link.id}')">Cancel</button>
                </div>`).join('');
        } else {
            pendingSection.classList.add('hidden');
        }
    }

    // Empty / grid
    const emptyEl = document.getElementById('principal-teachers-empty');
    const gridEl  = document.getElementById('principal-teachers-grid');
    if (!emptyEl || !gridEl) return;

    if (principalLinkedTeachers.length === 0) {
        emptyEl.classList.remove('hidden');
        gridEl.innerHTML = '';
        return;
    }
    emptyEl.classList.add('hidden');

    gridEl.innerHTML = principalLinkedTeachers.map(link => {
        const p = link.profile || {};
        const name = p.username || p.displayName || link.teacherEmail;
        const grade = p.grade ? `Grade ${p.grade}` : '';
        const school = p.school || '';
        const avatarHtml = p.profilePicture
            ? `<img src="${escHtml(safeImgUrl(p.profilePicture))}" alt="">`
            : (name ? escHtml(name[0].toUpperCase()) : '👤');
        return `
        <div class="principal-teacher-card" onclick="openTeacherPreview('${link.teacherUid}',${jsArg(name)})">
            <span class="ptc-status-badge">Linked</span>
            <div class="ptc-header">
                <div class="ptc-avatar">${typeof avatarHtml === 'string' && avatarHtml.startsWith('<') ? avatarHtml : '<span>' + avatarHtml + '</span>'}</div>
                <div>
                    <div class="ptc-name">${escHtml(name)}</div>
                    <div class="ptc-meta">${escHtml([grade, school].filter(Boolean).join(' · '))}</div>
                </div>
            </div>
            <div class="ptc-actions" onclick="event.stopPropagation()">
                <button class="btn btn-primary btn-sm" onclick="openTeacherPreview('${link.teacherUid}',${jsArg(name)})">👁 View Plany</button>
                <button class="btn btn-ghost btn-sm" onclick="openPrincipalCommentForTeacher('${link.teacherUid}',${jsArg(name)})">💬 Comment</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--text-muted);" onclick="removePrincipalLink('${link.id}')" title="Unlink this teacher">🔗 Unlink Teacher</button>
            </div>
        </div>`;
    }).join('');
}

// ── Teacher preview ───────────────────────────────────────────

async function openTeacherPreview(teacherUid, teacherName) {
    const banner  = document.getElementById('principal-preview-banner');
    const dash    = document.getElementById('principal-dashboard');
    const preview = document.getElementById('principal-teacher-view');
    const nameEl  = document.getElementById('ppb-teacher-name');

    // Remember the principal's own dates to restore on exit (v6.2.0).
    if (!_previewTeacher) {
        window._prePreviewAnchors = { cd: new Date(currentDate), ws: new Date(currentWeekStart), dd: new Date(currentDayDate) };
    }
    _previewTeacher = { uid: teacherUid, name: teacherName };

    if (nameEl) nameEl.textContent = teacherName;
    if (banner)  banner.classList.remove('hidden');
    if (dash)    dash.classList.add('hidden');
    if (preview) preview.classList.remove('hidden');

    // Populate year selector for this teacher and load the TEACHER's own year
    // (never fall back to the principal's own school year).
    const resolvedYear = await populatePrincipalYearSelect(teacherUid);
    const yearSelect = document.getElementById('ppb-year-select');
    const year = yearSelect?.value || resolvedYear || settings.schoolYear;
    await loadTeacherDataForPreview(teacherUid, year);
    switchPrincipalTab('year');
}

async function populatePrincipalYearSelect(teacherUid) {
    const sel = document.getElementById('ppb-year-select');
    if (!sel) return null;

    // The teacher's OWN current school year is authoritative (a real settings
    // doc). We must NOT fall back to the principal's own school year — that's
    // what caused a linked principal to load the wrong year and see no lessons.
    let currentYear = null;
    try {
        const tset = await db.collection('users').doc(teacherUid)
            .collection('settings').doc('schoolYear').get();
        if (tset.exists && tset.data().schoolYear) currentYear = tset.data().schoolYear;
    } catch (e) { /* ignore */ }

    // Any materialized year docs (older years become listable once opened in
    // the new version). Phantom years won't appear here, but currentYear covers
    // the important case.
    let years = [];
    try {
        const yearsSnap = await db.collection('users').doc(teacherUid).collection('years').get();
        years = yearsSnap.docs.map(d => d.id);
    } catch (e) { /* ignore */ }

    if (currentYear && !years.includes(currentYear)) years.push(currentYear);
    years = [...new Set(years)].filter(Boolean).sort().reverse();
    if (!years.length) years = [currentYear || settings.schoolYear];

    const selected = (currentYear && years.includes(currentYear)) ? currentYear : years[0];
    sel.innerHTML = years.map(y => `<option value="${y}"${y === selected ? ' selected' : ''}>${y}</option>`).join('');
    sel.value = selected;
    return selected;
}

async function loadTeacherYearPreview(year) {
    if (!_previewTeacher) return;
    await loadTeacherDataForPreview(_previewTeacher.uid, year);
    switchPrincipalTab(_previewTab);
}

async function loadTeacherDataForPreview(teacherUid, year) {
    showLoading();
    try {
        const yPath = db.collection('users').doc(teacherUid).collection('years').doc(year);

        const [classesSnap, lessonsSnap, eventsSnap, breaksDoc] = await Promise.all([
            yPath.collection('classes').orderBy('name').get(),
            yPath.collection('lessons').orderBy('date').get(),
            yPath.collection('events').orderBy('startDate').get(),
            yPath.collection('settings').doc('breaks').get()
        ]);

        // Stash our own data
        if (_savedClasses === null) {
            _savedClasses  = [...classes];
            _savedLessons  = [...lessons];
            _savedEvents   = [...events];
            _savedSettings = { ...settings };
        }

        // Swap globals with teacher's data
        classes  = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        lessons  = lessonsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        events   = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        settings = { ...settings, schoolYear: year,
            breaks: breaksDoc.exists ? (breaksDoc.data().breaks || []) : [] };

        // Choose where the Month/Week/Day tabs land when opening a teacher.
        // Today, but only if today falls inside the selected school year —
        // otherwise (e.g. summer break, or viewing a past/next year) today is a
        // "No School" day and the Day tab would look empty/broken. In that case
        // land on the teacher's first planned lesson, or failing that the start
        // of the year. The principal can still tap Today / navigate anywhere.
        const _startY = parseInt(String(year).split('-')[0], 10);
        const _endY   = parseInt(String(year).split('-')[1], 10);
        const _today  = new Date();
        const _inYear = !isNaN(_startY) && !isNaN(_endY)
            && _today >= new Date(_startY, 7, 1) && _today <= new Date(_endY, 6, 31);
        let _anchor;
        if (_inYear) {
            _anchor = _today;                                       // during the year: today
        } else if (lessons.length && lessons[0].date) {
            _anchor = new Date(lessons[0].date + 'T00:00:00');      // else: first planned day
        } else {
            _anchor = new Date((isNaN(_startY) ? _today.getFullYear() : _startY), 7, 1); // else: Aug 1 of the year
        }
        currentDate      = new Date(_anchor);
        currentDayDate   = new Date(_anchor);
        currentWeekStart = getWeekStart(currentDate);

    } catch(e) {
        console.error('loadTeacherDataForPreview:', e);
        showToast('Error loading teacher data');
    }
    hideLoading();
}

function exitTeacherPreview() {
    // Restore principal's own data
    if (_savedClasses !== null) {
        classes  = _savedClasses;
        lessons  = _savedLessons;
        events   = _savedEvents;
        settings = _savedSettings;
        _savedClasses = _savedLessons = _savedEvents = _savedSettings = null;
    }
    _previewTeacher = null;
    if (window._prePreviewAnchors) {
        currentDate = window._prePreviewAnchors.cd;
        currentWeekStart = window._prePreviewAnchors.ws;
        currentDayDate = window._prePreviewAnchors.dd;
        window._prePreviewAnchors = null;
    }

    document.getElementById('principal-preview-banner')?.classList.add('hidden');
    document.getElementById('principal-dashboard')?.classList.remove('hidden');
    document.getElementById('principal-teacher-view')?.classList.add('hidden');
    const ys = document.getElementById('ppb-year-select');
    if (ys) ys.innerHTML = '';

    // Re-render the real views with the principal's own restored data —
    // they were overwritten with the teacher's content during preview
    renderCalendar();
    renderWeek();
    renderClasses();
    renderYearView();
    renderDayView();
}

// ── Principal sub-tabs ────────────────────────────────────────

function switchPrincipalTab(tab) {
    _previewTab = tab;
    document.querySelectorAll('.psn-btn').forEach(b => b.classList.toggle('active', b.dataset.ptab === tab));
    renderPrincipalTab(tab);
}

function renderPrincipalTab(tab) {
    const container = document.getElementById('principal-tab-content');
    if (!container) return;

    const readonlyNote = '<div style="font-size:0.72rem;color:var(--text-muted);font-style:italic;margin-bottom:12px;">👁 Read-only view — this is ' + (_previewTeacher?.name || 'this teacher') + '\'s Plany</div>';

    // Strategy: the teacher's data is already swapped into the global
    // classes/lessons/events/settings arrays. Render the REAL (hidden) view
    // using the normal render functions, then clone the resulting HTML into
    // the principal tab container with pointer-events disabled.

    let sourceEl = null;
    if (tab === 'year') {
        renderYearView();
        sourceEl = document.getElementById('year-grid');
    } else if (tab === 'month') {
        renderCalendar();
        sourceEl = document.getElementById('calendar-grid');
    } else if (tab === 'week') {
        renderWeek();
        sourceEl = document.getElementById('week-container');
    } else if (tab === 'day') {
        renderDayView();
        sourceEl = document.getElementById('day-view-content');
    } else if (tab === 'classes') {
        renderClasses();
        sourceEl = document.getElementById('classes-list');
    } else if (tab === 'standards') {
        renderPrincipalStandards(container, readonlyNote);
        return;
    }

    // Date navigation controls for the time-based tabs (year & classes have none)
    const navBar = (tab === 'month' || tab === 'week' || tab === 'day')
        ? buildPrincipalNavBar(tab) : '';

    // The Day tab is interactive: a principal can click a lesson to open a
    // read-only detail view. Other tabs stay fully non-interactive.
    const interactive = (tab === 'day');
    const wrapStyle = interactive ? '' : 'pointer-events:none;';

    if (sourceEl) {
        const hint = interactive
            ? '<div style="font-size:0.72rem;color:var(--text-muted);margin:-4px 0 10px;">💡 Click a lesson to view its details.</div>'
            : '';
        container.innerHTML = readonlyNote + navBar + hint
            + '<div style="' + wrapStyle + '" class="' + (sourceEl.className || '') + '">'
            + sourceEl.innerHTML
            + '</div>';
        if (interactive) attachPrincipalDayClicks();
    } else {
        container.innerHTML = readonlyNote + navBar + '<p style="color:var(--text-muted);">Could not load this view.</p>';
    }
}

// Make lessons in the read-only principal Day view clickable → open the
// lesson detail viewer. Slots without a lesson are left inert.
function attachPrincipalDayClicks() {
    const container = document.getElementById('principal-tab-content');
    if (!container) return;
    container.querySelectorAll('.day-class-item').forEach(item => {
        const classId   = item.dataset.classId;
        const slotIndex = parseInt(item.dataset.slotIndex, 10);
        const dateStr   = item.dataset.date;
        const dayLessons = lessons.filter(l => l.date === dateStr);
        const lesson = findLessonForSlot(dayLessons, classId, isNaN(slotIndex) ? 0 : slotIndex);
        if (lesson) {
            item.style.cursor = 'pointer';
            item.title = 'View lesson details';
            item.addEventListener('click', () => showPrincipalLessonView(lesson));
        } else {
            item.style.cursor = 'default';
        }
    });
}

// Read-only lesson detail viewer for principals.
let _principalLessonCtx = null;
function showPrincipalLessonView(lesson) {
    if (!lesson) return;
    const modal   = document.getElementById('principal-lesson-modal');
    const body    = document.getElementById('principal-lesson-body');
    const titleEl = document.getElementById('principal-lesson-title');
    if (!modal || !body) return;

    _principalLessonCtx = lesson;

    const cls = lesson.classId ? classes.find(c => c.id === lesson.classId) : null;
    const isActivity = !!cls?.isActivity;
    const dateDisp = lesson.date ? formatDisplayDate(new Date(lesson.date + 'T00:00:00')) : '';
    if (titleEl) titleEl.textContent = '📄 ' + (lesson.title || 'Lesson');

    // Legacy support: older lessons stored standards/target/criteria combined.
    const legacy = splitStandardsBlock(lesson.standards || lesson.objectives || '');
    const standards = (lesson.learningTarget !== undefined || lesson.successCriteria !== undefined)
        ? (lesson.standards || lesson.objectives || '')
        : legacy.standards;
    const learningTarget  = lesson.learningTarget  || legacy.learningTarget  || '';
    const successCriteria = lesson.successCriteria || legacy.successCriteria || '';

    const meta = [];
    if (cls) meta.push(escHtml(cls.name));
    if (dateDisp) meta.push(escHtml(dateDisp));
    if (lesson.subject) meta.push(escHtml(lesson.subject));
    if (lesson.duration) meta.push(escHtml(String(lesson.duration)) + ' min');

    const section = (label, val) => {
        if (!val || !String(val).trim()) return '';
        return '<div style="margin-bottom:14px;">'
            + '<div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-bottom:4px;">' + label + '</div>'
            + '<div style="white-space:pre-wrap;font-size:0.9rem;line-height:1.45;">' + escHtml(String(val)) + '</div></div>';
    };

    let html = '';
    if (meta.length) html += '<div style="font-size:0.85rem;color:var(--text-secondary);margin:2px 0 16px;">' + meta.join(' · ') + '</div>';
    if (!isActivity) {
        html += section('📏 Standards & Objectives', standards);
        html += section('🎯 Learning Target', learningTarget);
        html += section('✅ Success Criteria', successCriteria);
        html += section('🗺️ Lesson Flow', lesson.flow);
        html += section('🧰 Materials', lesson.materials);
    }
    html += section(isActivity ? '📝 Instructions' : '📝 Activities & Notes', lesson.activities);

    if (Array.isArray(lesson.attachments) && lesson.attachments.length) {
        html += '<div style="margin-bottom:8px;">'
            + '<div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-bottom:4px;">📎 Attachments</div>'
            + lesson.attachments.map(a => '<div style="font-size:0.85rem;">• ' + escHtml(a.name || a.filename || 'file') + '</div>').join('')
            + '</div>';
    }

    const hasBody = standards || learningTarget || successCriteria || lesson.flow || lesson.materials || lesson.activities || (lesson.attachments || []).length;
    if (!hasBody) html += '<div style="color:var(--text-muted);font-size:0.88rem;padding:8px 0;">No lesson details were filled in for this session.</div>';

    body.innerHTML = html;
    modal.classList.remove('hidden');
}

// From the lesson viewer, jump to leaving feedback on that specific lesson.
function commentOnCurrentPrincipalLesson() {
    const lesson = _principalLessonCtx;
    if (!lesson || !_previewTeacher) return;
    document.getElementById('principal-lesson-modal')?.classList.add('hidden');
    openPrincipalCommentForLesson(_previewTeacher.uid, lesson.id, lesson.title || 'Lesson', lesson.date || '');
}

// ── Principal read-only date navigation (Prev / Today / Next + date jump) ──
// The nav bar sits OUTSIDE the pointer-events:none clone, so its controls stay
// clickable while the teacher's plans below remain read-only.
function buildPrincipalNavBar(unit) {
    let label = '', jumpVal = '';
    if (unit === 'month') {
        label   = formatMonthYear(currentDate);
        jumpVal = formatDate(currentDate);
    } else if (unit === 'week') {
        const ws = currentWeekStart || getWeekStart(currentDate);
        label   = formatDisplayDate(ws) + ' – ' + formatDisplayDate(addDays(ws, 6));
        jumpVal = formatDate(ws);
    } else if (unit === 'day') {
        label   = formatDisplayDate(currentDayDate);
        jumpVal = formatDate(currentDayDate);
    }
    return '<div class="principal-nav-bar" style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="principalNavMove(\'' + unit + '\',-1)" title="Previous ' + unit + '">◀ Prev</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="principalNavMove(\'' + unit + '\',0)" title="Jump to today">Today</button>'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="principalNavMove(\'' + unit + '\',1)" title="Next ' + unit + '">Next ▶</button>'
        + '<span style="font-weight:600;font-size:0.9rem;margin:0 4px;">' + label + '</span>'
        + '<input type="date" value="' + jumpVal + '" class="form-control" style="width:auto;padding:4px 8px;font-size:0.8rem;" '
        + 'onchange="principalNavJump(\'' + unit + '\', this.value)" title="Jump to a specific date">'
        + '</div>';
}

function principalNavMove(unit, dir) {
    // v6.2.0: every branch moves all three anchors, so switching tabs after
    // navigating shows the same date.
    let target;
    if (dir === 0) target = new Date();
    else if (unit === 'month') target = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
    else if (unit === 'week')  target = addDays(currentWeekStart, 7 * dir);
    else                       target = addDays(currentDayDate, dir);
    jumpToDate(target);
    renderPrincipalTab(_previewTab);
}

function principalNavJump(unit, value) {
    if (!value) return;
    const d = new Date(value + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    // Sync all three anchors so whichever tab is active reflects the jump
    currentDate      = new Date(d);
    currentDayDate   = new Date(d);
    currentWeekStart = getWeekStart(d);
    renderPrincipalTab(_previewTab);
}

// ── Print principal view ──────────────────────────────────────

function printCurrentPrincipalView() {
    if (_previewTab === 'week') { printWeekPDF?.(); return; }
    if (_previewTab === 'day')  { printDayPDF?.(formatDate(currentDayDate)); return; }
    if (_previewTab === 'year') { printYearPDF?.(); return; }
    if (_previewTab === 'standards') { printPrincipalStandards(); return; }
    // Default: print what's in the tab content
    const html = document.getElementById('principal-tab-content')?.innerHTML || '';
    const win = openPrintWindow();
    win.document.write(preparePrintDoc('<html><head><title>Plany – ' + (_previewTeacher?.name||'Teacher') + '</title><style>body{font-family:sans-serif;padding:0;margin:0;} @media print{body{print-color-adjust:exact;}}</style></head><body>' + html + '</body></html>', {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 300);
}

// ── Principal: standards coverage for a teacher (v6.9.0) ──────────────
// Same counting as the teacher's 📊 Standards coverage (computeCoverage),
// over the previewed teacher's lessons. Read-only; the principal's
// state/grade/subject choice is saved to the principal's own account.
let _pStd = null;

function principalStdLessons() {
    const cls = document.getElementById('pstd-class')?.value || '';
    const range = document.getElementById('pstd-range')?.value || 'sofar';
    const today = formatDate(new Date());
    return lessons.filter(l => (!cls || l.classId === cls) && (range === 'year' || l.date <= today));
}

async function renderPrincipalStandards(container, note) {
    const name = _previewTeacher?.name || 'this teacher';
    container.innerHTML = note + `
        <div class="coverage-controls">
            <div id="pstd-picker" class="std-controls"></div>
            <div class="std-controls">
                <select id="pstd-class" class="form-control" aria-label="Class">
                    <option value="">All classes</option>
                    ${classes.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('')}
                </select>
                <select id="pstd-range" class="form-control" aria-label="Range">
                    <option value="sofar">Taught so far (through today)</option>
                    <option value="year">Whole year, including planned</option>
                </select>
            </div>
        </div>
        <div id="pstd-summary" class="coverage-summary" aria-live="polite"></div>
        <div id="pstd-classes" class="pstd-classes"></div>
        <div id="pstd-list" class="coverage-list"></div>
        <p class="std-credit">Counted from the standard codes in ${escHtml(name)}'s lessons. Standards: Common Standards Project, CC BY 3.0 US. Common Core © NGA Center/CCSSO 2010. NGSS is a registered trademark of WestEd; not affiliated with or endorsing this product.</p>`;
    ['pstd-class', 'pstd-range'].forEach(id => document.getElementById(id)?.addEventListener('change', drawPrincipalStandards));
    await buildStdControls(document.getElementById('pstd-picker'), { withSearch: false, onChange: (sel) => { _pStd = sel; drawPrincipalStandards(); } });
}

function drawPrincipalStandards() {
    const sum = document.getElementById('pstd-summary'), list = document.getElementById('pstd-list'),
          byCls = document.getElementById('pstd-classes');
    if (!sum || !list) return;
    if (!_pStd || !_pStd.set) { sum.textContent = 'Pick a state, grade and subject.'; list.innerHTML = ''; byCls.innerHTML = ''; return; }
    const rows = computeCoverage(_pStd.set, principalStdLessons());
    const taught = rows.filter(r => r.count >= 1).length, repeated = rows.filter(r => r.count >= 2).length;
    sum.innerHTML = `<div class="cov-stat"><b>${taught}</b><span>of ${rows.length} taught</span></div>
        <div class="cov-stat"><b>${repeated}</b><span>taught 2+ times</span></div>
        <div class="cov-stat"><b>${rows.length - taught}</b><span>not yet</span></div>`;
    // Per class, only when looking at all classes
    const range = document.getElementById('pstd-range')?.value || 'sofar';
    const today = formatDate(new Date());
    if (!document.getElementById('pstd-class')?.value && rows.length) {
        byCls.innerHTML = classes.map(c => {
            const ls = lessons.filter(l => l.classId === c.id && (range === 'year' || l.date <= today));
            const n = computeCoverage(_pStd.set, ls).filter(r => r.count).length;
            if (!n) return '';
            const pct = Math.round(100 * n / rows.length);
            return `<div class="pstd-class">${escHtml(c.name)}: <b>${n}</b> of ${rows.length}<div class="pstd-bar"><i style="width:${pct}%"></i></div></div>`;
        }).join('');
    } else byCls.innerHTML = '';
    let html = '', lastDom = null;
    rows.forEach(r => {
        if (r.domain !== lastDom) { lastDom = r.domain; html += `<div class="std-domain-label">${escHtml(r.domain)}</div>`; }
        const state = r.count >= 2 ? 'rep' : r.count === 1 ? 'once' : 'none';
        html += `<div class="cov-row cov-${state}">
            <span class="cov-badge">${r.count ? r.count + '×' : 'Not yet'}</span>
            <span class="cov-code" title="${escHtml(r.code)}">${escHtml(stdShortCode(r.code))}</span>
            <span class="cov-desc">${escHtml(r.desc)}</span>
        </div>`;
    });
    list.innerHTML = html || '<p class="std-empty">This set has no coded standards to track.</p>';
}

function printPrincipalStandards() {
    if (!_pStd || !_pStd.set) { showToast('Pick a state, grade and subject first.'); return; }
    const rows = computeCoverage(_pStd.set, principalStdLessons());
    const clsName = classes.find(c => c.id === document.getElementById('pstd-class')?.value)?.name || 'All classes';
    const rangeLabel = document.getElementById('pstd-range')?.value === 'year' ? 'whole year incl. planned' : 'through ' + formatDisplayDate(new Date());
    const taught = rows.filter(r => r.count).length;
    const body = rows.map(r => `<tr><td>${escHtml(stdShortCode(r.code))}</td><td>${escHtml(r.desc)}</td><td style="text-align:center">${r.count || '—'}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Standards coverage</title><style>
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#222;margin:0}
        h1{font-size:18px;margin:0 0 4px} .meta{color:#555;margin-bottom:12px}
        table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:4px 6px;vertical-align:top}
        th{background:#f0f0f0;text-align:left} td:first-child{white-space:nowrap;font-weight:600}
        </style></head><body>
        <h1>${escHtml(_previewTeacher?.name || '')} — ${escHtml(_pStd.set.subject)}, ${_pStd.grade === 'K' ? 'Kindergarten' : 'Grade ' + escHtml(_pStd.grade)}</h1>
        <div class="meta">${escHtml(_pStd.file?.name || '')} · ${escHtml(clsName)} · ${escHtml(rangeLabel)} · ${taught} of ${rows.length} taught</div>
        <table><thead><tr><th>Code</th><th>Standard</th><th>Lessons</th></tr></thead><tbody>${body}</tbody></table>
        </body></html>`;
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(html, { v: '0.4in', h: '0.3in' }));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 300);
}

// ── Comments ─────────────────────────────────────────────────────────

function openPrincipalCommentModal() {
    // Comment on current teacher view (general / no specific lesson)
    if (!_previewTeacher) return;
    _principalCommentContext = {
        teacherUid: _previewTeacher.uid,
        lessonId: null,
        lessonTitle: 'General Observation',
        date: formatDate(new Date())
    };
    showPrincipalCommentModal();
}

function openPrincipalCommentForTeacher(teacherUid, teacherName) {
    _principalCommentContext = {
        teacherUid,
        lessonId: null,
        lessonTitle: 'General Observation',
        date: formatDate(new Date())
    };
    showPrincipalCommentModal();
}

function openPrincipalCommentForLesson(teacherUid, lessonId, lessonTitle, date) {
    _principalCommentContext = { teacherUid, lessonId, lessonTitle, date };
    showPrincipalCommentModal();
}

async function showPrincipalCommentModal() {
    const modal   = document.getElementById('principal-comment-modal');
    const ctxEl   = document.getElementById('principal-comment-context');
    const existEl = document.getElementById('principal-existing-comments');
    const textEl  = document.getElementById('principal-comment-text');
    if (!modal || !_principalCommentContext) return;

    if (ctxEl) {
        const ctx = _principalCommentContext;
        ctxEl.innerHTML = `<strong>${escHtml(ctx.lessonTitle)}</strong>${ctx.date ? ' · ' + escHtml(ctx.date) : ''}`;
    }
    if (textEl) textEl.value = '';

    // Load existing comments for this context
    if (existEl) {
        existEl.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);">Loading…</div>';
        try {
            let q = db.collection('principalComments')
                .where('principalUid', '==', currentUser.uid)
                .where('teacherUid', '==', _principalCommentContext.teacherUid)
                .orderBy('createdAt', 'asc');
            if (_principalCommentContext.lessonId) {
                q = q.where('lessonId', '==', _principalCommentContext.lessonId);
            } else {
                q = q.where('lessonId', '==', null);
            }
            const snap = await q.get();
            if (snap.empty) {
                existEl.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);font-style:italic;">No feedback yet.</div>';
            } else {
                existEl.innerHTML = snap.docs.map(d => {
                    const c = d.data();
                    const ts = c.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) || '';
                    return `<div class="principal-comment-bubble">
                        <div class="pcb-header"><span>${escHtml(c.principalName || 'Principal')}</span><span>${ts}</span></div>
                        <div class="pcb-text">${escHtml(c.text)}</div>
                    </div>`;
                }).join('');
            }
        } catch(e) {
            existEl.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);">Could not load previous comments.</div>';
        }
    }

    modal.classList.remove('hidden');
}

async function savePrincipalComment() {
    const textEl   = document.getElementById('principal-comment-text');
    const statusEl = document.getElementById('principal-comment-status');
    const text = textEl?.value.trim();
    if (!text) { if(statusEl) statusEl.textContent = 'Please write something.'; return; }
    if (!_principalCommentContext) return;

    if (statusEl) statusEl.innerHTML = '<span class="scan-spinner"></span> Saving…';

    try {
        await db.collection('principalComments').add({
            principalUid:  currentUser.uid,
            principalName: userProfile.username || userProfile.displayName || currentUser.email,
            teacherUid:    _principalCommentContext.teacherUid,
            lessonId:      _principalCommentContext.lessonId || null,
            lessonTitle:   _principalCommentContext.lessonTitle || '',
            date:          _principalCommentContext.date || '',
            text,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (statusEl) statusEl.textContent = '✅ Feedback saved!';
        if (textEl) textEl.value = '';
        setTimeout(() => {
            document.getElementById('principal-comment-modal')?.classList.add('hidden');
            if (statusEl) statusEl.textContent = '';
        }, 1200);
        showToast('Feedback saved ✓');
    } catch(e) {
        console.error('savePrincipalComment:', e);
        if (statusEl) statusEl.textContent = '❌ Error: ' + e.message;
    }
}

// ── Teacher: view principal comments on their lessons ─────────────────

// ── Share links (v6.6.0) ───────────────────────────────────────────────
// A frozen, read-only snapshot in publicShares/{random token}, opened at
// plany.work/s/{token} (public/share.html) with no account. Only lesson-plan
// fields go in -- never students, notes about students or sub-plan details.
function randomShareToken() {
    const a = new Uint8Array(22);   // 22 chars; the rule requires 20+
    crypto.getRandomValues(a);
    return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
}

function buildLessonShare() {
    const id = document.getElementById('lesson-id')?.value;
    const L = lessons.find(l => l.id === id);
    if (!L) return null;
    const cls = classes.find(c => c.id === L.classId);
    return {
        kind: 'lesson',
        title: L.title || 'Lesson plan',
        snapshot: { lesson: {
            className: cls?.name || '', dateLabel: formatDisplayDate(new Date(L.date + 'T00:00:00')),
            learningTarget: L.learningTarget || '', successCriteria: L.successCriteria || '',
            standards: L.standards || L.objectives || '', flow: L.flow || '',
            materials: L.materials || '', activities: L.activities || ''
        } }
    };
}

function buildWeekShare() {
    const DOW = ['sun','mon','tue','wed','thu','fri','sat'];
    const offsets = settings.hideWeekends === true ? [0, 1, 2, 3, 4] : [-1, 0, 1, 2, 3, 4, 5];
    const days = offsets.map(o => {
        const d = addDays(currentWeekStart, o);
        const ds = formatDate(d);
        const dow = DOW[d.getDay()];
        const dayEvents = events.filter(e => e.startDate && ds >= e.startDate && ds <= (e.endDate || e.startDate));
        const off = isOffDay(ds);
        const dayLessons = lessons.filter(l => l.date === ds);
        const slots = off ? [] : getSortedClassSlots(classes.filter(c => c.schedule && c.schedule[dow] && isClassActiveOnDate(c, ds)), dow);
        return {
            label: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
            off,
            offReason: off ? (dayEvents.find(isNoSchoolEvent)?.title || '') : '',
            events: dayEvents.filter(e => !isNoSchoolEvent(e)).map(e => e.title),
            classes: slots.map(({ cls, slotIndex, slot, slotCount }) => {
                const l = findLessonForSlot(dayLessons, cls.id, slotIndex);
                return {
                    name: cls.name + (slotCount > 1 ? ` (session ${slotIndex + 1})` : ''),
                    time: slot?.start ? `${slot.start}${slot.end ? '–' + slot.end : ''}` : '',
                    title: l?.title || '', learningTarget: l?.learningTarget || '', materials: l?.materials || ''
                };
            })
        };
    }).filter(day => !(day.classes.length === 0 && !day.off && day.events.length === 0 && /^(Sat|Sun)/.test(day.label)));
    const label = (document.getElementById('current-week')?.textContent || formatDate(currentWeekStart)).replace(/^\s*Week of\s*/i, '');
    return { kind: 'week', title: `Week of ${label}`, snapshot: { days } };
}

async function createShareLink(kind) {
    if (!currentUser) return;
    const base = kind === 'lesson' ? buildLessonShare() : buildWeekShare();
    if (!base) { showToast('Save the lesson first, then share it.'); return; }
    const token = randomShareToken();
    const expires = new Date(); expires.setDate(expires.getDate() + 30);
    showLoading();
    try {
        await db.collection('publicShares').doc(token).set({
            ...base,
            ownerUid: currentUser.uid,
            subtitle: (userProfile && userProfile.username) || currentUser.displayName || '',
            revoked: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: firebase.firestore.Timestamp.fromDate(expires)
        });
        const url = `https://plany.work/s/${token}`;
        const input = document.getElementById('share-link-url');
        if (input) input.value = url;
        _shareCurrent = { url, title: base.title };
        document.getElementById('share-link-modal')?.classList.remove('hidden');
        showShareQr(url);
        refreshShareLinks();
        try { await navigator.clipboard.writeText(url); showToast('🔗 Link copied'); } catch (_) {}
    } catch (e) {
        console.error('createShareLink:', e);
        showToast('Could not create the link: ' + e.message);
    } finally { hideLoading(); }
}

function copyShareLink() {
    const input = document.getElementById('share-link-url');
    if (!input?.value) return;
    navigator.clipboard.writeText(input.value).then(() => showToast('🔗 Link copied'))
        .catch(() => { input.select(); showToast('Press Ctrl+C to copy'); });
}

// The owner's links, newest first, with a status of active / expired / off.
async function fetchMyShareLinks() {
    if (!currentUser) return [];
    const snap = await db.collection('publicShares').where('ownerUid', '==', currentUser.uid).get();
    const now = Date.now();
    return snap.docs.map(d => {
        const x = { id: d.id, ...d.data() };
        const exp = x.expiresAt?.toMillis?.() || 0;
        x.status = x.revoked ? 'off' : exp > now ? 'active' : 'expired';
        x.url = `https://plany.work/s/${d.id}`;
        return x;
    }).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

function shareShortDate(ts) {
    const d = ts?.toDate?.();
    return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

async function turnOffShareLink(id) {
    if (!await planyConfirm('Turn off this link? Anyone who has it will no longer be able to open it.', { okText: 'Turn off', danger: true })) return false;
    try { await db.collection('publicShares').doc(id).update({ revoked: true }); showToast('Link turned off'); return true; }
    catch (e) { showToast('Could not turn it off: ' + e.message); return false; }
}

async function deleteShareLink(id, active) {
    const msg = active ? 'Delete this link? It stops working right away and is removed from your list.'
                       : 'Remove this link from your list?';
    if (!await planyConfirm(msg, { okText: 'Delete', danger: true })) return false;
    try { await db.collection('publicShares').doc(id).delete(); showToast('Link deleted'); return true; }
    catch (e) { showToast('Could not delete it: ' + e.message); return false; }
}

// Active links, inside the share window
async function refreshShareLinks() {
    const box = document.getElementById('share-links-list');
    if (!box || !currentUser) return;
    try {
        const items = (await fetchMyShareLinks()).filter(x => x.status === 'active');
        box.innerHTML = items.length ? items.map(x => `<div class="ai-history-row">
                <button type="button" class="ai-history-open" data-url="${escHtml(x.url)}" data-title="${escHtml(x.title || '')}">
                    <span>${x.kind === 'lesson' ? '📄' : '🗓️'} ${escHtml(x.title || 'Shared plan')}</span>
                    <span class="ai-history-date">until ${escHtml(x.expiresAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>
                </button>
                <button type="button" class="btn btn-sm btn-ghost share-revoke" data-id="${escHtml(x.id)}">Turn off</button>
            </div>`).join('') : '<p class="muted" style="font-size:14px;">No active links.</p>';
        box.querySelectorAll('.ai-history-open').forEach(b => b.addEventListener('click', () => {
            const input = document.getElementById('share-link-url'); if (input) input.value = b.dataset.url;
            _shareCurrent = { url: b.dataset.url, title: b.dataset.title };
            showShareQr(b.dataset.url);
        }));
        box.querySelectorAll('.share-revoke').forEach(b => b.addEventListener('click', async () => {
            if (await turnOffShareLink(b.dataset.id)) { refreshShareLinks(); renderSettingsShareLinks(); }
        }));
    } catch (e) { console.warn('refreshShareLinks:', e.message); }
}

// Every link (active, expired, turned off), in Settings -> Share links (v6.9.0)
async function renderSettingsShareLinks() {
    const box = document.getElementById('settings-share-links');
    if (!box || !currentUser) return;
    box.innerHTML = '<p class="std-empty">Loading…</p>';
    let items;
    try { items = await fetchMyShareLinks(); }
    catch (e) { box.innerHTML = `<p class="std-empty">Could not load your links (${escHtml(e.message)}).</p>`; return; }
    if (!items.length) {
        box.innerHTML = '<p class="std-empty">No share links yet. Make one from Week view → 🔗 Share, or 🔗 in a saved lesson.</p>';
        return;
    }
    const label = { active: 'Active', expired: 'Expired', off: 'Turned off' };
    box.innerHTML = items.map(x => `<div class="sl-row sl-${x.status}">
            <div style="min-width:0;">
                <div class="sl-title">${x.kind === 'lesson' ? '📄' : '🗓️'} ${escHtml(x.title || 'Shared plan')}</div>
                <div class="sl-meta"><span class="sl-status">${label[x.status]}</span>
                    · made ${escHtml(shareShortDate(x.createdAt))}
                    · ${x.status === 'expired' ? 'ended' : 'until'} ${escHtml(shareShortDate(x.expiresAt))}</div>
            </div>
            <div class="sl-actions">
                ${x.status === 'active' ? `
                <button type="button" class="btn btn-ghost btn-sm" data-act="copy" data-id="${escHtml(x.id)}">Copy</button>
                <button type="button" class="btn btn-ghost btn-sm" data-act="qr" data-id="${escHtml(x.id)}">QR</button>
                <button type="button" class="btn btn-ghost btn-sm" data-act="off" data-id="${escHtml(x.id)}">Turn off</button>` : ''}
                <button type="button" class="btn btn-ghost btn-sm" data-act="del" data-id="${escHtml(x.id)}" title="Delete">🗑️</button>
            </div>
        </div>`).join('');
    const byId = Object.fromEntries(items.map(x => [x.id, x]));
    box.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
        const x = byId[b.dataset.id]; if (!x) return;
        if (b.dataset.act === 'copy') {
            navigator.clipboard.writeText(x.url).then(() => showToast('🔗 Link copied')).catch(() => showToast(x.url));
        } else if (b.dataset.act === 'qr') {
            const input = document.getElementById('share-link-url'); if (input) input.value = x.url;
            _shareCurrent = { url: x.url, title: x.title };
            document.getElementById('share-link-modal')?.classList.remove('hidden');
            showShareQr(x.url); refreshShareLinks();
        } else if (b.dataset.act === 'off') {
            if (await turnOffShareLink(x.id)) renderSettingsShareLinks();
        } else if (b.dataset.act === 'del') {
            if (await deleteShareLink(x.id, x.status === 'active')) renderSettingsShareLinks();
        }
    }));
}

// ── QR code for a share link (v6.9.0) ─────────────────────────────────
let _shareCurrent = null;   // { url, title } shown in the share window

function shareQrSvg(url) {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR code' });
}

async function showShareQr(url) {
    const box = document.getElementById('share-link-qr');
    if (!box) return;
    box.innerHTML = '';
    try { await ensureLib('qrcode'); box.innerHTML = shareQrSvg(url); }
    catch (e) { box.innerHTML = '<p class="std-empty">QR code unavailable offline.</p>'; }
}

async function printShareQr() {
    if (!_shareCurrent?.url) return;
    try { await ensureLib('qrcode'); } catch (e) { showToast(e.message); return; }
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(_shareCurrent.title || 'Lesson plans')}</title><style>
        body{font-family:'Segoe UI',Arial,sans-serif;color:#222;margin:0;text-align:center}
        h1{font-size:26px;margin:0.6in 0 6px} p{font-size:15px;color:#555;margin:0 0 24px}
        .qr{width:4in;height:4in;margin:0 auto} .qr svg{width:100%;height:100%}
        </style></head><body>
        <h1>${escHtml(_shareCurrent.title || 'Lesson plans')}</h1>
        <p>Scan with a phone camera to view</p>
        <div class="qr">${shareQrSvg(_shareCurrent.url)}</div>
        </body></html>`;
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(html, { v: '0.4in', h: '0.3in' }));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 300);
}

// ── Shift lessons: push later / pull earlier (v6.6.0) ─────────────────
// Lessons move along a class's own meeting slots (its schedule, every-other-
// week rule, sessions per day), skipping no-school days and any lesson that's
// 📌 locked to its date. Order and gaps are kept.
//
// planClassShift() is pure (no Firestore, no DOM) so tests can run it.
// Returns { moves:[{id, from, fromSlot, to, toSlot}], overflow, blocked }.
function planClassShift({ cls, classLessons, fromDate, count, endDate, isOff, slotsFor, isActive }) {
    const DOW = ['sun','mon','tue','wed','thu','fri','sat'];
    // 1. every meeting slot from fromDate to endDate
    const slots = [];
    const d = new Date(fromDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    for (let guard = 0; d <= end && guard < 800; guard++, d.setDate(d.getDate() + 1)) {
        const ds = formatDate(d);
        const dow = DOW[d.getDay()];
        if (!cls.schedule || !cls.schedule[dow] || isOff(ds) || !isActive(cls, ds)) continue;
        const n = Math.max(slotsFor(cls, dow).length, 1);
        for (let si = 0; si < n; si++) slots.push({ date: ds, si });
    }
    const slotKey = (date, si) => date + '#' + si;
    const lessonSi = l => (l.slotIndex > 0 ? l.slotIndex : 0);
    // 2. slots held by locked lessons are off limits
    const lockedKeys = new Set(classLessons.filter(l => l.lockedDate === true && l.date >= fromDate)
        .map(l => slotKey(l.date, lessonSi(l))));
    const free = slots.filter(s => !lockedKeys.has(slotKey(s.date, s.si)));
    const freeIndex = new Map(free.map((s, i) => [slotKey(s.date, s.si), i]));
    // 3. rank each movable lesson in the free-slot list (in order, no ties)
    const movable = classLessons.filter(l => l.date >= fromDate && l.lockedDate !== true)
        .sort((a, b) => a.date.localeCompare(b.date) || lessonSi(a) - lessonSi(b));
    let prev = -1;
    const ranked = movable.map(l => {
        let r = freeIndex.get(slotKey(l.date, lessonSi(l)));
        if (r === undefined) {                           // lesson sits on a non-meeting day
            r = free.findIndex(s => s.date >= l.date);
            if (r < 0) r = free.length;
        }
        r = Math.max(r, prev + 1);
        prev = r;
        return { l, r };
    });
    // 4. move by count
    const moves = [];
    let overflow = 0, blocked = 0;
    for (const { l, r } of ranked) {
        const nr = r + count;
        if (nr < 0) { blocked++; continue; }
        if (nr >= free.length) { overflow++; continue; }
        const t = free[nr];
        const toSlot = l.slotIndex === -1 ? -1 : t.si;
        if (t.date !== l.date || toSlot !== (l.slotIndex ?? 0)) {
            moves.push({ id: l.id, from: l.date, fromSlot: l.slotIndex ?? 0, to: t.date, toSlot });
        }
    }
    return { moves, overflow, blocked };
}

function shiftYearEnd() {
    const last = events.find(e => e.type === 'last-day');
    return last?.startDate || settings.yearEnd || formatDate(addDays(new Date(), 180));
}

function buildShiftPlan() {
    const fromDate = document.getElementById('shift-from')?.value;
    const classSel = document.getElementById('shift-class')?.value || 'all';
    const dir = parseInt(document.getElementById('shift-direction')?.value || '1');
    const n = parseInt(document.getElementById('shift-count')?.value || '1');
    if (!fromDate) return null;
    const targets = classSel === 'all' ? classes : classes.filter(c => c.id === classSel);
    const endDate = shiftYearEnd();
    const plan = { moves: [], overflow: 0, blocked: 0, classesTouched: 0 };
    targets.forEach(cls => {
        const r = planClassShift({
            cls, classLessons: lessons.filter(l => l.classId === cls.id), fromDate, count: dir * n,
            endDate, isOff: isOffDay, slotsFor: getTimeSlotsForDay, isActive: isClassActiveOnDate
        });
        if (r.moves.length) plan.classesTouched++;
        plan.moves.push(...r.moves);
        plan.overflow += r.overflow;
        plan.blocked += r.blocked;
    });
    return plan;
}

function renderShiftPreview() {
    const el = document.getElementById('shift-preview');
    const btn = document.getElementById('shift-apply-btn');
    const plan = buildShiftPlan();
    if (!el) return;
    if (!plan) { el.textContent = 'Pick a starting date.'; if (btn) btn.disabled = true; return; }
    const parts = [];
    parts.push(plan.moves.length
        ? `${plan.moves.length} lesson${plan.moves.length !== 1 ? 's' : ''} in ${plan.classesTouched} class${plan.classesTouched !== 1 ? 'es' : ''} will move.`
        : 'No lessons to move from that date.');
    if (plan.overflow) parts.push(`⚠️ ${plan.overflow} lesson${plan.overflow !== 1 ? 's' : ''} would run past the last day of school, so nothing will be shifted. Lock or delete lessons near the end of the year, or shift by fewer days.`);
    if (plan.blocked) parts.push(`⚠️ ${plan.blocked} lesson${plan.blocked !== 1 ? 's' : ''} can't move that much earlier, so nothing will be shifted. Try fewer days or a later starting date.`);
    el.textContent = parts.join('\n');
    if (btn) btn.disabled = !plan.moves.length || plan.overflow > 0 || plan.blocked > 0;
}

function openShiftModal() {
    const sel = document.getElementById('shift-class');
    if (sel) {
        sel.innerHTML = '<option value="all">All classes</option>' +
            classes.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');
    }
    const from = document.getElementById('shift-from');
    if (from) from.value = formatDate(currentDayDate || new Date());
    ['shift-from', 'shift-class', 'shift-direction', 'shift-count'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el._shiftBound) { el.addEventListener('change', renderShiftPreview); el._shiftBound = true; }
    });
    document.getElementById('shift-modal')?.classList.remove('hidden');
    renderShiftPreview();
}

async function writeLessonMoves(moves, forward) {
    const yearPath = getYearPath();
    for (let i = 0; i < moves.length; i += 400) {
        const batch = db.batch();
        moves.slice(i, i + 400).forEach(m => batch.update(yearPath.collection('lessons').doc(m.id),
            forward ? { date: m.to, slotIndex: m.toSlot } : { date: m.from, slotIndex: m.fromSlot }));
        await batch.commit();
    }
    moves.forEach(m => {
        const l = lessons.find(x => x.id === m.id);
        if (l) { l.date = forward ? m.to : m.from; l.slotIndex = forward ? m.toSlot : m.fromSlot; }
    });
    renderCalendar(); renderWeek();
    if (typeof renderDayView === 'function') renderDayView();
    updateStats();
}

async function applyLessonShift() {
    const plan = buildShiftPlan();
    if (!plan || !plan.moves.length || plan.overflow || plan.blocked) { renderShiftPreview(); return; }
    showLoading();
    try {
        await writeLessonMoves(plan.moves, true);
        const moves = plan.moves;
        recordAction({
            type: 'shift_lessons',
            restore: () => writeLessonMoves(moves, false),
            redo: () => writeLessonMoves(moves, true)
        });
        document.getElementById('shift-modal')?.classList.add('hidden');
        showToast(`⏩ Shifted ${moves.length} lesson${moves.length !== 1 ? 's' : ''}. Press Ctrl+Z to undo.`);
    } catch (e) {
        console.error('applyLessonShift:', e);
        showToast('Could not shift lessons: ' + e.message);
    } finally {
        hideLoading();
    }
}

// ── Principal feedback inbox (v6.4.0) ──────────────────────────────────
// Principals could leave comments on a teacher's lessons, but nothing ever
// showed them to the teacher. A 💬 button in the header (with an unread
// count) opens the list; opening it marks everything read.
let teacherFeedback = [];

async function loadTeacherPrincipalComments() {
    const btn = document.getElementById('feedback-btn');
    if (!currentUser || isPrincipal()) { btn?.classList.add('hidden'); teacherFeedback = []; return []; }
    try {
        const snap = await db.collection('principalComments')
            .where('teacherUid', '==', currentUser.uid)
            .get();
        teacherFeedback = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((x, y) => (y.createdAt?.toMillis?.() || 0) - (x.createdAt?.toMillis?.() || 0));
    } catch (e) {
        console.warn('loadTeacherPrincipalComments:', e.message);
        teacherFeedback = [];
    }
    updateFeedbackBadge();
    return teacherFeedback;
}

function updateFeedbackBadge() {
    const btn = document.getElementById('feedback-btn');
    const badge = document.getElementById('feedback-badge');
    if (!btn) return;
    btn.classList.toggle('hidden', teacherFeedback.length === 0);
    const unread = teacherFeedback.filter(c => !c.read).length;
    if (badge) {
        badge.textContent = unread > 9 ? '9+' : String(unread);
        badge.classList.toggle('hidden', unread === 0);
    }
    btn.setAttribute('aria-label', unread ? `Feedback from your principal, ${unread} unread` : 'Feedback from your principal');
}

function openFeedbackInbox() {
    const list = document.getElementById('feedback-list');
    if (!list) return;
    if (!teacherFeedback.length) {
        list.innerHTML = '<p class="empty-state">No feedback yet.</p>';
    } else {
        list.innerHTML = teacherFeedback.map(c => {
            const when = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            const lessonLine = c.lessonTitle
                ? `<button type="button" class="feedback-lesson" data-lesson="${escHtml(c.lessonId || '')}" data-date="${escHtml(c.date || '')}">📄 ${escHtml(c.lessonTitle)}${c.date ? ' · ' + escHtml(c.date) : ''}</button>`
                : '';
            return `<div class="feedback-item${c.read ? '' : ' unread'}">
                <div class="feedback-meta"><strong>${escHtml(c.principalName || 'Principal')}</strong><span>${escHtml(when)}</span></div>
                ${lessonLine}
                <div class="feedback-text">${escHtml(c.text || '')}</div>
            </div>`;
        }).join('');
        list.querySelectorAll('.feedback-lesson').forEach(b => b.addEventListener('click', () => {
            const lesson = lessons.find(l => l.id === b.dataset.lesson);
            document.getElementById('feedback-modal')?.classList.add('hidden');
            if (lesson) { jumpToDate(new Date(lesson.date + 'T00:00:00')); renderAfterJump(); openLessonModal(lesson); }
            else if (b.dataset.date) { jumpToDate(new Date(b.dataset.date + 'T00:00:00')); document.querySelector('[data-view="day"]')?.click(); }
        }));
    }
    document.getElementById('feedback-modal')?.classList.remove('hidden');
    // Mark everything read (the rule lets the teacher change only read/readAt)
    teacherFeedback.filter(c => !c.read).forEach(c => {
        c.read = true;
        db.collection('principalComments').doc(c.id)
            .update({ read: true, readAt: firebase.firestore.FieldValue.serverTimestamp() })
            .catch(e => console.warn('mark feedback read:', e.message));
    });
    updateFeedbackBadge();
}
document.getElementById('feedback-btn')?.addEventListener('click', openFeedbackInbox);

