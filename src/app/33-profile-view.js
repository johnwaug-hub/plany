// ============================================================
// PROFILE VIEW
// ============================================================

let _profilePrevView = 'calendar'; // which view to return to on back

function openProfileView() {
    _profilePrevView = document.querySelector('.view.active')?.id?.replace('-view','') || 'calendar';
    populateProfileView();
    // Switch all views to hidden, show profile
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
    const pv = document.getElementById('profile-view');
    pv.classList.remove('hidden');
    pv.classList.add('active');
    // Deactivate nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

function closeProfileView() {
    document.getElementById('profile-view').classList.remove('active');
    document.getElementById('profile-view').classList.add('hidden');
    switchView(_profilePrevView);
}

function populateProfileView() {
    const emailEl = document.getElementById('account-email');
    if (emailEl && currentUser) emailEl.textContent = currentUser.email || '';
    const p = settings.userProfile || {};
    const _s = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    _s('pm-display-name', p.displayName);
    _s('pm-nickname',     p.nickname);
    _s('pm-grade',        p.grade);
    _s('pm-role',         p.role);
    _s('pm-school',       p.school);
    _s('pm-district',     p.district);
    _s('pm-birthday',     p.birthday);
    _s('pm-years-teaching', p.yearsTeaching != null ? String(p.yearsTeaching) : '');
    _s('pm-subjects',     p.subjects);
    _s('pm-room',         p.room);
    _s('pm-bio',          p.bio);
    _s('pm-bitmoji-url',     p.avatarUrl      || '');
    _s('pm-start-teaching-date', p.startTeachingDate || '');
    _s('pm-retirement-date',    p.retirementDate    || '');
    _s('pm-days-per-year',   p.daysPerYear ? String(p.daysPerYear) : '');
    applyProfileAvatar(p.avatarUrl || '');
    // Restore last retirement calculation if available
    if (p.lastCalc) {
        const _c = p.lastCalc;
        if (_c.experience) {
            const _expEl = document.getElementById('experience-result');
            if (_expEl) renderStatsCard(_expEl, _c.experience, 'experience');
        }
        if (_c.countdown) {
            const _retEl = document.getElementById('retirement-result');
            if (_retEl) renderStatsCard(_retEl, _c.countdown, 'countdown');
        }
    }
}

function applyProfileAvatar(url) {
    // Update profile-view avatar
    const img = document.getElementById('pm-avatar-img');
    const ph  = document.getElementById('pm-avatar-placeholder');
    if (img && ph) {
        if (url) { img.src = url; img.classList.remove('hidden'); ph.classList.add('hidden'); }
        else      { img.src = ''; img.classList.add('hidden');    ph.classList.remove('hidden'); }
    }
    // Update header pill avatar
    const hImg = document.getElementById('user-avatar-img');
    const hPh  = document.getElementById('user-avatar-placeholder');
    if (hImg && hPh) {
        if (url) { hImg.src = url; hImg.classList.remove('hidden'); hPh.classList.add('hidden'); }
        else      { hImg.src = ''; hImg.classList.add('hidden');    hPh.classList.remove('hidden'); }
    }
}

async function saveProfile() {
    const _g = id => document.getElementById(id)?.value?.trim() || '';
    const p = {
        displayName:    _g('pm-display-name'),
        nickname:       _g('pm-nickname'),
        grade:          _g('pm-grade'),
        role:           _g('pm-role'),
        school:         _g('pm-school'),
        district:       _g('pm-district'),
        birthday:       _g('pm-birthday'),
        yearsTeaching:  parseInt(_g('pm-years-teaching')) || 0,
        subjects:       _g('pm-subjects'),
        room:           _g('pm-room'),
        bio:            _g('pm-bio'),
        avatarUrl:      settings.userProfile?.avatarUrl || _g('pm-bitmoji-url'),
        startTeachingDate: _g('pm-start-teaching-date'),
        retirementDate:    _g('pm-retirement-date'),
        daysPerYear:       parseInt(_g('pm-days-per-year')) || 0,
        lastCalc:          settings.userProfile?.lastCalc || null,
    };
    // Bitmoji URL field overrides stored value if filled
    const urlField = _g('pm-bitmoji-url');
    if (urlField) p.avatarUrl = urlField;

    settings.userProfile = p;

    // Update header pill text
    const _nt = document.getElementById('user-name-text');
    if (_nt) _nt.textContent = p.nickname || p.displayName || _nt.textContent;

    applyProfileAvatar(p.avatarUrl || '');

    if (!currentUser) { showToast('Not signed in'); return; }
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear')
            .set({ userProfile: p }, { merge: true });

        // Also sync public-facing fields to the top-level users/{uid} doc.
        // Cross-user features (friends, principal links) read THIS doc, so it
        // must stay in sync with the live pm-* profile system.
        await db.collection('users').doc(currentUser.uid).set({
            email: currentUser.email,
            displayName: p.displayName || currentUser.displayName || '',
            username: p.nickname || p.displayName || '',
            role: p.role || '',
            grade: p.grade || '',
            school: p.school || '',
            district: p.district || '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Keep the in-memory global in sync so isPrincipal() etc. work immediately
        userProfile = { ...userProfile,
            username: p.nickname || p.displayName || userProfile.username,
            role: p.role || '',
            grade: p.grade || '',
            school: p.school || '',
            district: p.district || ''
        };
        initPrincipalView();

        showToast('✅ Profile saved');
        closeProfileView();
    } catch (e) {
        console.error('Profile save error', e);
        showToast('Error saving profile: ' + e.message);
    }
}

// Wire up profile view buttons (elements always in DOM — no lazy getter needed)
document.getElementById('user-name')?.addEventListener('click', openProfileView);
document.getElementById('profile-back-btn')?.addEventListener('click', closeProfileView);
document.getElementById('profile-save-btn')?.addEventListener('click', saveProfile);

// Photo upload
document.getElementById('pm-upload-btn')?.addEventListener('click', () => {
    document.getElementById('pm-photo-input').click();
});
document.getElementById('pm-change-photo-btn')?.addEventListener('click', () => {
    document.getElementById('pm-photo-input').click();
});
document.getElementById('pm-photo-input')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Compress before storing: resize to max 256px via canvas
    const reader = new FileReader();
    reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
            const MAX = 256;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            if (!settings.userProfile) settings.userProfile = {};
            settings.userProfile.avatarUrl = dataUrl;
            document.getElementById('pm-bitmoji-url').value = '';
            applyProfileAvatar(dataUrl);
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

// Bitmoji URL live preview
document.getElementById('pm-bitmoji-url')?.addEventListener('input', e => {
    const url = e.target.value.trim();
    applyProfileAvatar(url);
    if (settings.userProfile) settings.userProfile.avatarUrl = url;
});


