// ============================================
// USER PROFILE SYSTEM
// ============================================

let userProfile = {
    username: '',
    role: '',
    grade: '',
    school: '',
    district: '',
    profilePicture: ''
};

// Reset all in-memory, account-specific state to defaults. Called on every
// auth change so a newly signed-in account never inherits the previous user's
// profile/settings that live only in memory. (Firestore data is per-uid and
// reloads cleanly; these globals otherwise persist across account switches.)
function resetUserState() {
    // Undo history belongs to the previous account/year (v6.0.2).
    try { undoStack.length = 0; redoStack.length = 0; } catch (_) { /* not initialised yet */ }
    settings = {
        schoolYear: '2025-2026',
        yearStart: '2025-08-05',
        yearEnd: '2026-05-22',
        breaks: [],
        background: 'classroom'
    };
    userProfile = {
        username: '', role: '', grade: '', school: '', district: '', profilePicture: ''
    };

    // Wipe every account-scoped in-memory collection so a newly signed-in
    // account can never see the previous account's data before/if its own
    // loaders run. Firestore loaders repopulate these per-uid on login.
    classes = [];
    lessons = [];
    events = [];
    students = [];
    assignments = [];
    attendance = {};
    communications = [];
    units = [];
    techTools = [];
    subDays = {};
    emergencySubPlans = { general: {}, days: {} };
    classGradeSettings = {};
    friends = [];
    sharedLessons = [];
    principalLinkedTeachers = [];
    teacherLinkRequests = [];
    // v6.4.0: these also belonged to the previous account (a shared AI key,
    // the curriculum library, inboxes and badges)
    try {
        stopLiveListeners();
        incomingKeyShare = null;
        myKeyGrants = [];
        curriculumDocs = [];
        pendingRequests = [];
        unreadCount = 0;
        sharedResourceInbox = [];
        sharedResourceUnread = 0;
        teacherFeedback = [];
        seatingData = { rows: 5, cols: 6, seats: {} };
        window._commsYear = null;
    } catch (_) { /* declared later in the file; fine before first load */ }

    // Clear principal-preview scratch state
    _previewTeacher = null;
    _savedClasses = _savedLessons = _savedEvents = _savedSettings = null;

    // Clear in-memory Microsoft / Moodle connection state
    if (typeof msAccessToken !== 'undefined') { msAccessToken = null; msUserEmail = ''; msUserId = ''; }
    if (typeof moodleUrl !== 'undefined')      { moodleUrl = ''; moodleToken = ''; }
}

// Device-local (localStorage) state that belongs to a specific account. Purged
// when a DIFFERENT account signs in on the same device (see the auth handler),
// so AI keys/name, Microsoft/Moodle tokens, and cached prefs never bleed across
// accounts. localStorage is shared by every account on a device, so resetting
// in-memory globals alone is not enough — these keys must be removed too.
// Only the sensitive keys -- used on sign-out. (UI preferences such as the
// dismissed-checklist flags are kept so they don't reappear every login.)
function clearAccountSecrets() {
    try {
        [
            'ai_key_anthropic', 'ai_key_openai', 'ai_key_gemini', 'anthropic_api_key',
            'ms_token', 'ms_refresh', 'ms_user_id', 'ms_user_email', 'moodle_token'
        ].forEach(k => localStorage.removeItem(k));
    } catch (e) { console.warn('clearAccountSecrets:', e); }
}

function clearAccountStorage() {
    try {
        [
            'ai_provider', 'ai_key_anthropic', 'ai_key_openai', 'ai_key_gemini',
            'anthropic_api_key', 'ai_packet_grade', 'ai_teacher_name', 'ai_ignore_shared_key',
            'ms_client_id', 'ms_token', 'ms_refresh', 'ms_user_id', 'ms_user_email',
            'moodle_url', 'moodle_token', 'plany_last_school_year'
        ].forEach(k => localStorage.removeItem(k));

        // Prefix-keyed per-account flags (one entry per school year)
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('checklist_dismissed_') || k.startsWith('plany_new_year_dismissed_')) {
                localStorage.removeItem(k);
            }
        });
    } catch (e) { console.warn('clearAccountStorage:', e); }
}

// Initialize user profile system
function initUserProfile() {
    // Load profile data
    loadUserProfile();
}

// Load user profile from Firestore
async function loadUserProfile() {
    if (!currentUser) return;
    
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists) {
            const data = doc.data();
            // v6.0.2: msUserId was readable by every user and was the input
            // to the old derived Microsoft password. Scrub it from our doc.
            if (data.msUserId !== undefined || data.msConnected !== undefined) {
                db.collection('users').doc(currentUser.uid).update({
                    msUserId: firebase.firestore.FieldValue.delete(),
                    msConnected: firebase.firestore.FieldValue.delete()
                }).catch(() => {});
            }
            userProfile = {
                username: data.username || data.displayName || currentUser.displayName || '',
                role: data.role || '',
                grade: data.grade || '',
                school: data.school || '',
                district: data.district || '',
                profilePicture: data.profilePicture || ''
            };
            
        } else {
            userProfile = { username: '', role: '', grade: '', school: '', district: '', profilePicture: '' };
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}


// Handle profile picture upload
async function handleProfilePictureUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file');
        return;
    }
    
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be less than 2MB');
        return;
    }
    
    showLoading();
    
    try {
        // Convert to base64 for storage (for simplicity; could use Firebase Storage)
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target.result;
            
            // Resize image if needed
            const resized = await resizeImage(base64, 200, 200);
            userProfile.profilePicture = resized;
            
            // Save to Firestore
            await db.collection('users').doc(currentUser.uid).set({
                profilePicture: resized,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            showToast('Profile picture updated!');
            hideLoading();
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Error uploading picture:', error);
        showToast('Error uploading picture');
        hideLoading();
    }
}

// Resize image helper
function resizeImage(base64, maxWidth, maxHeight) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = base64;
    });
}


