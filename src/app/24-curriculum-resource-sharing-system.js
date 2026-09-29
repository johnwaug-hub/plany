// ============================================
// CURRICULUM RESOURCE SHARING SYSTEM
// ============================================

let sharedResourceInbox = [];  // incoming shared curriculum docs
let sharedResourceUnread = 0;

// Open the share-resource modal for a given doc
function openShareResourceModal(docId) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;

    if (friends.length === 0) {
        showToast('Add teacher friends first to share resources');
        return;
    }

    // Populate modal
    document.getElementById('share-resource-doc-name').textContent = doc.name;
    document.getElementById('share-resource-doc-id').value = docId;

    const listEl = document.getElementById('share-resource-friends-list');
    listEl.innerHTML = friends.map(f => `
        <label class="share-friend-option">
            <input type="checkbox" name="share-resource-to" value="${f.uid}">
            <span>${escHtml(f.name || f.email)}</span>
            <span style="color:var(--text-muted);font-size:0.78rem;">(${escHtml(f.email)})</span>
        </label>
    `).join('');

    document.getElementById('share-resource-note').value = '';
    document.getElementById('share-resource-modal').classList.remove('hidden');
}

// Send a shared curriculum resource
async function sendSharedResource() {
    const docId = document.getElementById('share-resource-doc-id').value;
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;

    const selectedUids = Array.from(
        document.querySelectorAll('input[name="share-resource-to"]:checked')
    ).map(cb => cb.value);

    if (selectedUids.length === 0) {
        showToast('Select at least one colleague');
        return;
    }

    const note = document.getElementById('share-resource-note').value.trim();

    showLoading();
    try {
        for (const toUid of selectedUids) {
            const friend = friends.find(f => f.uid === toUid);
            await db.collection('sharedCurriculum').add({
                fromUid:   currentUser.uid,
                fromEmail: currentUser.email,
                fromName:  userProfile.username || currentUser.displayName || currentUser.email,
                toUid,
                toEmail:   friend?.email || '',
                resource: {
                    name:         doc.name,
                    subject:      doc.subject,
                    resourceType: doc.resourceType,
                    description:  doc.description || '',
                    fileType:     doc.fileType,
                    size:         doc.size,
                    content:      doc.content || '',
                    hasContent:   doc.hasContent || false,
                    // v6.4.0: include the file's download link so a shared PDF
                    // also works in the recipient's page picker
                    storageUrl:   doc.storageUrl || null,
                },
                note,
                read: false,
                sharedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        document.getElementById('share-resource-modal').classList.add('hidden');
        showToast(`📤 Shared with ${selectedUids.length} colleague${selectedUids.length !== 1 ? 's' : ''}!`);
    } catch (e) {
        console.error('Share resource error:', e);
        showToast('❌ Could not share resource');
    }
    hideLoading();
}

// Listen for incoming shared resources in real-time
function listenForSharedResources() {
    if (!currentUser) return;
    _liveUnsubs.push(db.collection('sharedCurriculum')
        .where('toUid', '==', currentUser.uid)
        .orderBy('sharedAt', 'desc')
        .limit(30)
        .onSnapshot(snap => {
            sharedResourceInbox = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            sharedResourceUnread = sharedResourceInbox.filter(r => !r.read).length;
            renderSharedResourceInbox();
            updateResourceInboxBadge();
        }, _liveErr('shared resources')));
}

function updateResourceInboxBadge() {
    const badge = document.getElementById('shared-resource-badge');
    if (!badge) return;
    if (sharedResourceUnread > 0) {
        badge.textContent = sharedResourceUnread;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function renderSharedResourceInbox() {
    const container = document.getElementById('shared-resource-inbox-list');
    if (!container) return;

    if (sharedResourceInbox.length === 0) {
        container.innerHTML = '<p class="empty-state" style="font-size:0.85rem;">No shared resources yet. When a colleague shares a resource with you, it will appear here.</p>';
        return;
    }

    const subjectIcons = { math:'📐', ela:'📖', phonics:'🔤', science:'🔬', social:'🌍', other:'📁' };

    container.innerHTML = sharedResourceInbox.map(item => `
        <div class="shared-resource-item ${item.read ? '' : 'unread'}" data-id="${item.id}">
            <div class="shared-resource-header">
                <span class="shared-resource-icon">${subjectIcons[item.resource?.subject] || '📄'}</span>
                <div class="shared-resource-info">
                    <div class="shared-resource-name">${item.read ? '' : '<span class="unread-dot">●</span> '}<strong>${escHtml(item.resource?.name || 'Resource')}</strong></div>
                    <div class="shared-resource-meta">
                        From <strong>${escHtml(item.fromName)}</strong>
                        · ${escHtml(item.resource?.subject || 'other')} · ${formatFileSize(item.resource?.size || 0)}
                        ${item.resource?.hasContent ? '<span style="color:var(--success-color);font-size:12px;"> ✅ AI-readable</span>' : ''}
                    </div>
                    ${item.note ? `<div class="shared-resource-note">"${escHtml(item.note)}"</div>` : ''}
                </div>
            </div>
            <div class="shared-resource-actions">
                <button class="btn btn-sm btn-primary" onclick="importSharedResource('${item.id}')">
                    ⬇️ Add to My Library
                </button>
                <button class="btn btn-sm btn-ghost" onclick="dismissSharedResource('${item.id}')">✕</button>
            </div>
        </div>
    `).join('');
}

async function importSharedResource(itemId) {
    const item = sharedResourceInbox.find(r => r.id === itemId);
    if (!item) return;

    // Check duplicate by name
    const exists = curriculumDocs.find(d => d.name === item.resource.name);
    if (exists) {
        if (!await planyConfirm(`"${item.resource.name}" is already in your library. Add a copy anyway?`)) return;
    }

    showLoading();
    try {
        // v6.4.0: copy only known fields. Spreading the sender's object let
        // them set anything (including a storagePath pointing at their files).
        const r = item.resource || {};
        const url = typeof r.storageUrl === 'string' && /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/plany-waugs\.firebasestorage\.app\//.test(r.storageUrl) ? r.storageUrl : null;
        const docData = {
            name:         String(r.name || 'Shared resource').slice(0, 200),
            subject:      String(r.subject || 'other').slice(0, 40),
            resourceType: String(r.resourceType || '').slice(0, 40),
            description:  String(r.description || '').slice(0, 2000),
            fileType:     String(r.fileType || '').slice(0, 100),
            size:         Number(r.size) || 0,
            content:      typeof r.content === 'string' ? r.content : '',
            hasContent:   !!r.hasContent,
            storageUrl:   url,
            sharedBy:   item.fromName,
            sharedFrom: item.fromEmail,
            uploadedAt: new Date().toISOString()
        };
        const docRef = await db.collection('users').doc(currentUser.uid)
            .collection('curriculum').add(docData);
        curriculumDocs.unshift({ id: docRef.id, ...docData });

        // Mark as read
        await db.collection('sharedCurriculum').doc(itemId).update({ read: true });

        renderCurriculumLibrary(
            document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all'
        );
        renderSharedResourceInbox();
        showToast(`✅ "${item.resource.name}" added to your Curriculum Library!`);
    } catch (e) {
        console.error('Import shared resource error:', e);
        showToast('❌ Could not import resource');
    }
    hideLoading();
}

// v6.5.0: ✕ removes the item from your inbox (it only marked it read before)
async function dismissSharedResource(itemId) {
    try {
        await db.collection('sharedCurriculum').doc(itemId).delete();
        sharedResourceInbox = sharedResourceInbox.filter(r => r.id !== itemId);
        sharedResourceUnread = sharedResourceInbox.filter(r => !r.read).length;
        renderSharedResourceInbox();
        updateResourceInboxBadge();
    } catch(e) { console.warn('dismiss error:', e); showToast('Could not remove it. Try again.'); }
}

function initCurriculumSharing() {
    // Share form submit
    document.getElementById('share-resource-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await sendSharedResource();
    });

    // Live listener starts from startLiveListeners() (v6.4.0)
    startLiveListeners();
}

// ── AI Settings (API key only — grade + teacher name live in user profile) ──
// ── AI Settings (Provider + API key — grade + teacher name live in user profile) ──
function loadAiSettings() {
    try {
        const providerEl = document.getElementById('ai-provider-select');
        const keyEl      = document.getElementById('ai-api-key');
        const saveBtn    = document.getElementById('save-ai-settings-btn');
        const toggleBtn  = document.getElementById('toggle-api-key-vis');
        const statusEl   = document.getElementById('api-key-status');
        const linkEl     = document.getElementById('ai-key-signup-link');

        const applyProviderUI = () => {
            const provider = AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic;
            if (keyEl) keyEl.placeholder = provider.keyPlaceholder;
            if (linkEl) {
                linkEl.href = provider.signupUrl;
                linkEl.textContent = provider.signupUrl.replace(/^https?:\/\//, '');
            }
        };

        if (providerEl) providerEl.value = aiSettings.provider;
        applyProviderUI();
        if (keyEl) keyEl.value = aiSettings.apiKey;

        const updateKeyStatus = () => {
            if (!statusEl) return;
            const provider = AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic;
            const val = keyEl?.value?.trim() || aiSettings.apiKey || '';
            if (val && provider.keyLooksValid(val)) {
                statusEl.textContent = '✅';
                statusEl.title = 'API key saved';
            } else if (val) {
                statusEl.textContent = '⚠️';
                statusEl.title = `Key doesn't look like a valid ${provider.label} key`;
            } else {
                statusEl.textContent = '🔴';
                statusEl.title = 'No API key — AI features disabled';
            }
        };
        updateKeyStatus();
        window._refreshAiKeyStatus = updateKeyStatus;
        let keyTyped = false;
        keyEl?.addEventListener('input', (e) => { if (e.isTrusted && e.inputType) keyTyped = true; updateKeyStatus(); });
        // Password managers autofill this field shortly after load (it's
        // type="password"). Undo that unless the user is actually typing.
        [300, 1000, 2500].forEach(ms => setTimeout(() => {
            if (!keyEl || keyTyped) return;
            if (keyEl.value !== aiSettings.apiKey) { keyEl.value = aiSettings.apiKey; updateKeyStatus(); }
        }, ms));

        providerEl?.addEventListener('change', () => {
            aiSettings.provider = providerEl.value;
            applyProviderUI();
            if (keyEl) keyEl.value = aiSettings.apiKey; // show that provider's own saved key, if any
            updateKeyStatus();
            applyAiFeatureGating();
        });

        saveBtn?.addEventListener('click', () => {
            const typed = keyEl ? keyEl.value.trim() : '';
            if (typed && !aiKeyLooksValid(aiSettings.provider, typed)) {
                const provider = AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic;
                showToast(`⚠️ That doesn't look like a ${provider.label} key — not saved. (If your browser autofilled a password here, clear it and paste your key.)`);
                if (keyEl) keyEl.value = aiSettings.apiKey;
                updateKeyStatus();
                return;
            }
            if (keyEl) aiSettings.apiKey = typed;
            updateKeyStatus();
            updateYearChecklist();
            syncMySharedKeyDoc();
            applyAiFeatureGating();
            const msg = document.getElementById('ai-settings-saved-msg');
            if (msg) { msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2500); }
        });

        toggleBtn?.addEventListener('click', () => {
            if (keyEl) keyEl.type = keyEl.type === 'password' ? 'text' : 'password';
        });

        // Share-my-key panel
        document.getElementById('key-share-grant-btn')?.addEventListener('click', grantKeyAccess);
        document.getElementById('key-share-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); grantKeyAccess(); }
        });
        loadMyKeyGrants();

        applyAiFeatureGating();
    } catch(e) { console.warn('loadAiSettings:', e.message); }
}

// ── Refresh #ai-fill-class dropdown with current classes ─────────────────
function refreshAiFillClassDropdown() {
    const sel = document.getElementById('ai-fill-class');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">-- All Classes --</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls.id;
        opt.textContent = cls.name;
        sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
}

// ── AI Lesson Fill initialisation ─────────────────────────────────────────
let _aiFillAbort = false;

function initAiLessonFill() {
    const previewBtn = document.getElementById('ai-fill-preview-btn');
    const runBtn     = document.getElementById('ai-fill-run-btn');
    const stopBtn    = document.getElementById('ai-fill-stop-btn');
    const statusEl   = document.getElementById('ai-fill-status');

    if (!previewBtn) return;

    previewBtn.addEventListener('click', () => {
        const startVal = document.getElementById('ai-fill-start')?.value;
        const endVal   = document.getElementById('ai-fill-end')?.value;
        if (!startVal || !endVal) { showToast('Please set a start and end date.'); return; }
        if (startVal > endVal)    { showToast('Start date must be before end date.'); return; }

        const classId = document.getElementById('ai-fill-class')?.value || '';
        const skipExisting = document.getElementById('ai-fill-skip-existing')?.checked ?? true;

        // Collect school days in range
        const days = [];
        let cur = new Date(startVal + 'T00:00:00');
        const end = new Date(endVal   + 'T00:00:00');
        while (cur <= end) {
            const dateStr = formatDate(cur);
            const dow = ['sun','mon','tue','wed','thu','fri','sat'][cur.getDay()];
            const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
            if (!isWeekend && !isOffDay(dateStr)) {
                const dayClasses = classId
                    ? classes.filter(c => c.id === classId && c.schedule?.[dow] && isClassActiveOnDate(c, dateStr))
                    : classes.filter(c => c.schedule?.[dow] && isClassActiveOnDate(c, dateStr));
                dayClasses.forEach(cls => {
                    if (skipExisting && lessons.find(l => l.date === dateStr && l.classId === cls.id)) return;
                    days.push({ date: dateStr, cls });
                });
            }
            cur.setDate(cur.getDate() + 1);
        }

        if (days.length === 0) {
            statusEl.innerHTML = '<p style="color:var(--text-secondary)">No eligible lesson slots found in that range.</p>';
            runBtn.disabled = true;
            return;
        }

        statusEl.innerHTML = `<p style="color:var(--text-secondary)">Found <strong>${days.length}</strong> lesson slot${days.length !== 1 ? 's' : ''} to fill across ${[...new Set(days.map(d => d.date))].length} school day${[...new Set(days.map(d => d.date))].length !== 1 ? 's' : ''}.</p>`;
        runBtn.disabled = false;
        runBtn._fillDays = days;
    });

    runBtn.addEventListener('click', async () => {
        const days = runBtn._fillDays;
        if (!days?.length) return;
        if (!hasEffectiveAiKey()) { showToast(`Please save your ${(AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic).label} API key in AI Settings first.`); return; }

        const context = document.getElementById('ai-fill-context')?.value.trim() || '';
        const grade   = localStorage.getItem('ai_packet_grade') || '1';

        runBtn.classList.add('hidden');
        previewBtn.disabled = true;
        stopBtn.classList.remove('hidden');
        _aiFillAbort = false;

        let done = 0;
        statusEl.innerHTML = `<p>Filling lessons… <span id="ai-fill-progress">0 / ${days.length}</span></p><div id="ai-fill-log" style="margin-top:0.5rem;font-size:0.8rem;max-height:200px;overflow-y:auto;"></div>`;
        const progressEl = document.getElementById('ai-fill-progress');
        const logEl = document.getElementById('ai-fill-log');

        for (const { date, cls } of days) {
            if (_aiFillAbort) break;

            const prompt = `You are a Grade ${grade} teacher. Write a short lesson plan for ${cls.name} (${cls.subject || cls.name}) on ${date}. ${context ? 'Context: ' + context : ''}\nRespond with JSON only:\n{"title":"...","objective":"...","materials":"...","activities":"...","standards":""}`;

            try {
                const text = (await callAIText({ prompt, tier: 'fast', maxTokens: 512 })) || '{}';

                const clean = text.replace(/```json|```/g, '').trim();
                const parsed = JSON.parse(clean);

                // Save lesson to Firestore
                const lessonData = {
                    date, classId: cls.id, className: cls.name,
                    title: parsed.title || '',
                    // v6.2.0: the lesson form shows learningTarget; "objective"
                    // was saved but never displayed.
                    learningTarget: parsed.objective || '',
                    materials: parsed.materials || '',
                    activities: parsed.activities || '',
                    standards: parsed.standards || '',
                    slotIndex: 0,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                const yearPath = getYearPath();
                const existing = lessons.find(l => l.date === date && l.classId === cls.id);
                if (existing) {
                    await yearPath.collection('lessons').doc(existing.id).update(lessonData);
                    Object.assign(existing, lessonData);
                } else {
                    const ref = await yearPath.collection('lessons').add(lessonData);
                    lessons.push({ id: ref.id, ...lessonData });
                }

                done++;
                if (progressEl) progressEl.textContent = `${done} / ${days.length}`;
                if (logEl) logEl.innerHTML += `<div style="color:var(--success-color,#2ecc71)">✓ ${date} — ${escHtml(cls.name)}: ${escHtml(parsed.title || '(untitled)')}</div>`;
            } catch(e) {
                if (logEl) logEl.innerHTML += `<div style="color:var(--error-color,#e74c3c)">✗ ${date} — ${escHtml(cls.name)}: ${escHtml(e.message)}</div>`;
            }
        }

        renderCalendar(); renderWeek();
        stopBtn.classList.add('hidden');
        runBtn.classList.remove('hidden');
        previewBtn.disabled = false;
        statusEl.innerHTML += `<p style="margin-top:0.5rem;font-weight:600;">Done! Filled ${done} lesson${done !== 1 ? 's' : ''}.</p>`;
    });

    stopBtn.addEventListener('click', () => { _aiFillAbort = true; });
}

// ── Classroom Technology Tools ─────────────────────────────────────────────
async function loadTechTools() {
    if (!currentUser) return;
    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('techTools').get();
        techTools = doc.exists ? (doc.data().tools || []) : [];
    } catch(e) {
        console.warn('loadTechTools:', e.message);
        techTools = [];
    }
    renderTechToolsList();
}

async function saveTechTools() {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('techTools')
            .set({ tools: techTools }, { merge: true });
    } catch(e) {
        console.error('saveTechTools:', e);
        showToast('Error saving tech tools');
    }
}

function renderTechToolsList() {
    const list = document.getElementById('tech-tools-list');
    if (!list) return;
    if (techTools.length === 0) {
        list.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);">No tools added yet.</p>';
        return;
    }
    const deviceIcons = { iPad:'📱', Chromebook:'💻', laptop:'🖥️', desktop:'🖥️', smartboard:'📺', other:'📡' };
    list.innerHTML = techTools.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:6px;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.85rem;font-weight:600;">${deviceIcons[t.device]||'💻'} ${escHtml(t.name)}</div>
                ${t.notes ? `<div style="font-size:0.72rem;color:var(--text-secondary);margin-top:2px;">${escHtml(t.notes)}</div>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" style="flex-shrink:0;color:var(--text-muted);" onclick="removeTechTool('${t.id}')">✕</button>
        </div>`).join('');
}

async function addTechTool() {
    const device  = document.getElementById('tech-device-type')?.value || 'other';
    const name    = document.getElementById('tech-app-name')?.value.trim();
    const subject = document.getElementById('tech-app-subject')?.value || 'general';
    const notes   = document.getElementById('tech-app-notes')?.value.trim() || '';
    if (!name) { showToast('Please enter an app or website name'); return; }

    techTools.push({
        id: 'tt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        device, name, subject, notes
    });
    await saveTechTools();
    renderTechToolsList();

    // Clear inputs
    const nameEl = document.getElementById('tech-app-name');
    const notesEl = document.getElementById('tech-app-notes');
    if (nameEl) nameEl.value = '';
    if (notesEl) notesEl.value = '';
    showToast('✅ Tool added');
}

async function removeTechTool(id) {
    techTools = techTools.filter(t => t.id !== id);
    await saveTechTools();
    renderTechToolsList();
}

function initTechTools() {
    document.getElementById('add-tech-tool-btn')?.addEventListener('click', addTechTool);
    loadTechTools();
}

// Check for OAuth callback (Microsoft) before anything else
initOAuthCallback();

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            initUserProfile();
            initCurriculumLibrary();
            initFriendsSystem();
            initSmartImport();
            initKeyboardShortcuts();
            initGlobalSearch();
            initUndoSystem();
            initDataExport();
            initOfflineIndicator();
            initPhase2Features();
            loadAiSettings();
            initTechTools();
            initAiLessonFill();
            initNewsletterSystem();
            initYearNewsletter();
            initNewYearModal();
            updateSchoolYearDropdown();
            initCurriculumSharing();
            console.log('All init functions completed successfully');
        } catch (error) {
            console.error('Error during initialization:', error);
        }
    }, 1000);
});

// Re-init when user logs in
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        setTimeout(() => {
            loadUserProfile();
            loadCurriculumDocs();
            loadFriendsData();
        }, 500);
    }
});

