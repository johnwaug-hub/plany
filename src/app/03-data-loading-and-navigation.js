// ==================== DATA LOADING ====================

async function loadUserData() {
    showLoading();
    try {
        // Load settings first to get current school year
        const settingsDoc = await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear').get();
        if (settingsDoc.exists) {
            settings = { ...settings, ...settingsDoc.data() };
            if (elements.schoolYear) elements.schoolYear.value = settings.schoolYear;
            try { localStorage.setItem('plany_last_school_year', settings.schoolYear); } catch(e) {}
            
            // Apply saved user profile
            if (settings.userProfile) {
                const _nt2 = document.getElementById('user-name-text');
                if (_nt2 && settings.userProfile.displayName) _nt2.textContent = settings.userProfile.nickname || settings.userProfile.displayName;
                if (typeof applyProfileAvatar === 'function') applyProfileAvatar(settings.userProfile.avatarUrl || '');
            }

            // Apply saved background
            if (settings.background) {
                applyBackground(settings.background, settings.customBgUrl);
                const bgRadio = document.querySelector(`input[name="background"][value="${settings.background}"]`);
                if (bgRadio) bgRadio.checked = true;
                
                // Show custom upload section if custom is selected
                if (settings.background === 'custom') {
                    const customUploadSection = document.getElementById('custom-upload-section');
                    if (customUploadSection) customUploadSection.classList.remove('hidden');
                    
                    // Update preview if custom image exists
                    if (settings.customBgUrl) {
                        const customPreview = document.getElementById('custom-bg-preview');
                        if (customPreview) {
                            customPreview.style.backgroundImage = `url('${settings.customBgUrl}')`;
                            customPreview.style.backgroundSize = 'cover';
                            customPreview.style.backgroundPosition = 'center';
                            const icon = customPreview.querySelector('.bg-icon');
                            if (icon) icon.style.display = 'none';
                        }
                    }
                }
            }
        }
        
        // Apply weekend visibility preference
        applyWeekendsVisibility();
        
        // Load data for current school year
        await loadSchoolYearData(settings.schoolYear);

        // Check for year-end transitions
        checkEndOfYearReminder();
        await checkSchoolYearTransition();
        
    } catch (error) {
        console.error('Error loading data:', error);
        console.error('Error stack:', error.stack);
        showToast('Error loading data: ' + error.message);
    }
    hideLoading();
}

// Helper to get the current school year's data path
function getYearPath() {
    return db.collection('users').doc(currentUser.uid).collection('years').doc(settings.schoolYear);
}

// Load data for a specific school year.
// v6.5.0: loads run one at a time, in the order they were asked for, so a
// slow earlier load (quick year switching, or signing out and in as someone
// else) can never finish last and overwrite the newer data.
let _yearLoadChain = Promise.resolve();
function loadSchoolYearData(schoolYear) {
    const run = () => _loadSchoolYearDataNow(schoolYear);
    const p = _yearLoadChain.then(run, run);
    _yearLoadChain = p.catch(() => {});
    return p;
}

async function _loadSchoolYearDataNow(schoolYear) {
    if (!currentUser) return;
    const loadUid = currentUser.uid;
    const stale = () => !currentUser || currentUser.uid !== loadUid;
    const yearPath = db.collection('users').doc(currentUser.uid).collection('years').doc(schoolYear);

    // Materialize this year document (give it a field) so it appears in
    // collection('years') queries. A parent that only holds subcollections is a
    // Firestore "phantom" and is invisible to collection reads — which left the
    // principal view unable to discover a teacher's school years, so it fell
    // back to the wrong year and showed no lessons. Non-blocking.
    yearPath.set({ schoolYear, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
        .catch(() => {});

    // Set initial date: today if within this school year, else Aug 1 of that year
    const startYear = parseInt(schoolYear.split('-')[0]);
    const _endYear  = parseInt(schoolYear.split('-')[1]);
    const _today    = new Date();
    const _syStart  = new Date(startYear, 7, 1);   // Aug 1
    const _syEnd    = new Date(_endYear,  6, 31);  // Jul 31
    if (_today >= _syStart && _today <= _syEnd) {
        // Separate Date objects: month navigation mutates currentDate and
        // must not drag the Day view along with it (v6.2.0).
        currentDate    = new Date(_today);
        currentDayDate = new Date(_today);
    } else {
        // Viewing a different school year (past or future) — start at August 1
        currentDate    = new Date(startYear, 7, 1);
        currentDayDate = new Date(startYear, 7, 1);
    }
    currentWeekStart = getWeekStart(currentDate);
    // Persist the school year being viewed so hard refresh restores it
    try { localStorage.setItem('plany_last_school_year', schoolYear); } catch(e) {}
    
    // Load classes, lessons, events and breaks together (v6.5.0: in parallel,
    // and only applied if the same account is still signed in)
    const [classesSnap, lessonsSnap, eventsSnap, breaksDoc] = await Promise.all([
        yearPath.collection('classes').orderBy('name').get(),
        yearPath.collection('lessons').orderBy('date').get(),
        yearPath.collection('events').orderBy('startDate').get(),
        yearPath.collection('settings').doc('breaks').get()
    ]);
    if (stale()) return;
    classes = classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    lessons = lessonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    events = eventsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (breaksDoc.exists) {
        settings.breaks = breaksDoc.data().breaks || [];
    } else {
        settings.breaks = [];
    }

    // Load sub day packets
    await loadSubDays();
    await loadEmergencySubPlans();

    // Load units
    await loadUnits();

    // Load students, assignments, grade settings, attendance
    await loadStudents();
    await loadAssignments();
    await loadClassGradeSettings();
    await loadAttendance();
    if (stale()) return;

    // Render everything
    renderCalendar();
    renderWeek();
    renderClasses();
    renderBreaks();
    updateClassDropdown();
    updateStats();
    updateSchoolYearDisplay();
    refreshAiFillClassDropdown();
    updateYearChecklist();
    initPrincipalView();
    loadTeacherLinkRequests();
    loadTeacherPrincipalComments();
    startLiveListeners();
    await restoreAiKeyFromCloud();
    await ensureAiKeyCloudBackup();
    await checkIncomingKeyShare();
    applyAiFeatureGating();
    preloadLibsWhenIdle();   // v6.3.0: fetch the PDF/Excel tools in the background
    handleLaunchShortcut();
    
    // Update import dropdowns (functions defined later, check if they exist)
    console.log('Classes loaded:', classes.length, classes);
    if (typeof updateSmartImportClassDropdown === 'function') {
        console.log('Calling updateSmartImportClassDropdown');
        updateSmartImportClassDropdown();
    } else {
        console.log('updateSmartImportClassDropdown not defined yet');
    }
}

// ==================== NAVIGATION ====================

// ── Phone bottom nav: Month · Week · Day · AI · More (v6.4.0) ───────────
// Seven tabs didn't fit a 390px phone ("CLASSESSTUDENTS"). On phones, CSS
// hides Year / Classes / Students and this "More" button lists them.
// The button is created here (not in the markup) so it isn't one of the
// view-switching .nav-item buttons wired up just below.
(function initNavMore() {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    const MORE_VIEWS = ['year', 'classes', 'students'];
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'nav-item nav-more';
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.innerHTML = '<span class="nav-icon" aria-hidden="true">☰</span><span class="nav-label">More</span>';
    const menu = document.createElement('div');
    menu.className = 'nav-more-menu hidden';
    menu.setAttribute('role', 'menu');
    const close = () => { menu.classList.add('hidden'); more.setAttribute('aria-expanded', 'false'); };
    MORE_VIEWS.forEach(v => {
        const src = nav.querySelector(`.nav-item[data-view="${v}"]`);
        if (!src) return;
        const icon = (src.querySelector('.nav-icon')?.childNodes[0]?.textContent || '').trim();
        const label = src.querySelector('.nav-label')?.textContent || v;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nav-more-item';
        b.setAttribute('role', 'menuitem');
        b.innerHTML = `<span aria-hidden="true">${escHtml(icon)}</span><span>${escHtml(label)}</span>`;
        b.addEventListener('click', () => { close(); src.click(); syncMore(); });
        menu.appendChild(b);
    });
    function syncMore() {
        const activeView = nav.querySelector('.nav-item.active[data-view]')?.dataset.view;
        more.classList.toggle('active', MORE_VIEWS.includes(activeView));
    }
    more.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !open);
        more.setAttribute('aria-expanded', String(open));
        if (open) menu.querySelector('button')?.focus();
    });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== more) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.classList.contains('hidden')) { close(); more.focus(); } });
    nav.addEventListener('click', () => setTimeout(syncMore, 0));
    const version = nav.querySelector('.nav-version');
    nav.insertBefore(more, version || null);
    document.body.appendChild(menu);
})();

elements.navItems.forEach(item => {
    item.addEventListener('click', () => {
        const view = item.dataset.view;

        // Principal view is a special overlay — not in elements.views
        if (view === 'principal') {
            elements.navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            elements.views.forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
            const pv = document.getElementById('principal-view');
            if (pv) { pv.classList.remove('hidden'); pv.classList.add('active'); }
            if (!_previewTeacher) renderPrincipalDashboard();
            return;
        }

        // Exit principal preview if active
        if (_previewTeacher) exitTeacherPreview();

        // Capture which view is active NOW — before we switch away from it
        const prevActive = document.querySelector('.view.active')?.id;

        elements.navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        elements.views.forEach(v => {
            v.classList.remove('active');
            v.classList.add('hidden');
        });
        
        const viewEl = document.getElementById(`${view}-view`);
        viewEl.classList.remove('hidden');
        viewEl.classList.add('active');

        // ── Three-way sync: month ↔ week ↔ day ──────────────────────
        if (view === 'week') {
            // Entering Week: sync from whichever view we came from
            if (prevActive === 'day-view') {
                currentWeekStart = getWeekStart(currentDayDate);
                currentDate = new Date(currentDayDate);
            } else {
                currentWeekStart = getWeekStart(currentDate);
            }
            renderWeek();

        } else if (view === 'day') {
            const _t = new Date();
            if (prevActive === 'calendar-view') {
                const _dispM = currentDate.getMonth();
                const _dispY = currentDate.getFullYear();
                if (currentDayDate.getMonth() === _dispM && currentDayDate.getFullYear() === _dispY) {
                    // Day cell click already set currentDayDate to a date within this month — keep it
                } else if (_t.getMonth() === _dispM && _t.getFullYear() === _dispY) {
                    currentDayDate = _t;  // today is in the displayed month
                } else {
                    currentDayDate = new Date(_dispY, _dispM, 1);  // default to 1st
                }
            } else if (prevActive === 'year-view') {
                // Year view sets currentDate to the exact clicked date — use it directly
                currentDayDate = new Date(currentDate);
            } else if (prevActive === 'week-view') {
                const _wHide  = settings.hideWeekends === true;
                const _wStart = formatDate(addDays(currentWeekStart, _wHide ? 0 : -1));
                const _wEnd   = formatDate(addDays(currentWeekStart, _wHide ? 4 : 5));
                const _dStr   = formatDate(currentDayDate);
                const _tStr   = formatDate(_t);
                if (_dStr >= _wStart && _dStr <= _wEnd) {
                    // Header click already set a valid day within this week — keep it
                } else if (_tStr >= _wStart && _tStr <= _wEnd) {
                    currentDayDate = _t;   // today is in this week
                } else {
                    currentDayDate = new Date(currentWeekStart); // default Monday
                }
            }
            renderDayView();

        } else if (view === 'calendar') {
            // Entering Month: sync from whichever view we came from
            if (prevActive === 'day-view') {
                currentDate = new Date(currentDayDate);
                currentWeekStart = getWeekStart(currentDayDate);
            } else {
                currentDate = new Date(addDays(currentWeekStart, 2));
            }
            renderCalendar();
        }

        // Render year view when selected
        if (view === 'students') {
            loadStudentsView();
        }
        if (view === 'year') {
            renderYearView();
        }
        
        // Refresh dropdowns when Settings view is opened
        if (view === 'settings') {
            if (typeof updateSmartImportClassDropdown === 'function') {
                updateSmartImportClassDropdown();
            }
            if (typeof updateExcelOnlyClassDropdown === 'function') {
                updateExcelOnlyClassDropdown();
            }
        }
    });
});

