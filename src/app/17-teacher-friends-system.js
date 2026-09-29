// ============================================
// TEACHER FRIENDS SYSTEM
// ============================================

let friends = [];
let pendingRequests = [];
let sharedLessons = [];
let unreadCount = 0;
let currentFriendsSort = 'all';

// Initialize friends system
function initFriendsSystem() {
    // Add friend button (new)
    document.getElementById('add-friend-btn')?.addEventListener('click', sendFriendRequestFromInput);
    document.getElementById('friend-email-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendFriendRequestFromInput();
        }
    });
    
    // Sort tabs
    document.querySelectorAll('.sort-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFriendsSort = tab.dataset.sort;
            renderFriendsList();
        });
    });
    
    // Load friends data
    loadFriendsData();
    
    // Real-time listeners start from startLiveListeners() once the account's
    // data has loaded (v6.4.0)
    startLiveListeners();
}

// Send friend request from the settings input
async function sendFriendRequestFromInput() {
    const emailInput = document.getElementById('friend-email-input');
    if (!emailInput) return;
    
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email) {
        showToast('Please enter an email address');
        return;
    }
    
    if (email === currentUser.email.toLowerCase()) {
        showToast("You can't add yourself!");
        return;
    }
    
    // Check if already friends
    if (friends.some(f => f.email.toLowerCase() === email)) {
        showToast('Already friends!');
        return;
    }
    
    showLoading();
    
    try {
        // Find user by email
        const usersSnap = await db.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();
        
        if (usersSnap.empty) {
            showToast('No teacher found with that email');
            hideLoading();
            return;
        }
        
        const targetUser = usersSnap.docs[0];
        
        // Check for existing request
        const existingRequest = await db.collection('friendRequests')
            .where('fromUid', '==', currentUser.uid)
            .where('toUid', '==', targetUser.id)
            .where('status', '==', 'pending')
            .get();
        
        if (!existingRequest.empty) {
            showToast('Friend request already sent!');
            hideLoading();
            return;
        }
        
        // Create friend request with profile info
        await db.collection('friendRequests').add({
            fromUid: currentUser.uid,
            fromEmail: currentUser.email,
            fromName: userProfile.username || currentUser.displayName || currentUser.email,
            fromProfile: {
                role: userProfile.role,
                grade: userProfile.grade,
                school: userProfile.school,
                district: userProfile.district,
                profilePicture: userProfile.profilePicture
            },
            toUid: targetUser.id,
            toEmail: email,
            status: 'pending',
            sentAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        emailInput.value = '';
        showToast('Friend request sent!');
        
    } catch (error) {
        console.error('Error sending request:', error);
        showToast('Error sending friend request');
    }
    
    hideLoading();
}

// Load all friends data
async function loadFriendsData() {
    if (!currentUser) return;
    
    try {
        // Load friends
        const friendsSnap = await db.collection('users').doc(currentUser.uid)
            .collection('friends').get();
        
        // Fetch full profile data for each friend
        const friendPromises = friendsSnap.docs.map(async (doc) => {
            const friendData = { id: doc.id, ...doc.data() };
            
            // Try to get their full profile
            try {
                const profileDoc = await db.collection('users').doc(friendData.uid).get();
                if (profileDoc.exists) {
                    const profile = profileDoc.data();
                    friendData.username = profile.username || friendData.name;
                    friendData.name = profile.username || profile.displayName || friendData.name;
                    friendData.role = profile.role || '';
                    friendData.grade = profile.grade || '';
                    friendData.school = profile.school || '';
                    friendData.district = profile.district || '';
                    friendData.profilePicture = profile.profilePicture || '';
                }
            } catch (e) {
                console.log('Could not fetch profile for friend:', friendData.uid);
            }
            
            return friendData;
        });
        
        friends = await Promise.all(friendPromises);
        
        // Load pending requests (incoming)
        const requestsSnap = await db.collection('friendRequests')
            .where('toUid', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        pendingRequests = requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Load shared lessons
        const sharedSnap = await db.collection('sharedLessons')
            .where('toUid', '==', currentUser.uid)
            .orderBy('sharedAt', 'desc')
            .limit(20)
            .get();
        sharedLessons = sharedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Count unread
        unreadCount = pendingRequests.length + sharedLessons.filter(s => !s.read).length;
        updateUnreadBadge();
        
        // Render
        renderFriendsList();
        renderPendingRequests();
        renderSharedLessons();
        renderActivityFeed();
        
    } catch (error) {
        console.error('Error loading friends data:', error);
    }
}

// Listen for real-time updates
// ── Live listeners follow the signed-in account (v6.4.0) ───────────────
// They used to start once, 1 s after page load -- before sign-in had
// finished on a fresh login, so they never started -- and were never
// stopped, so after switching accounts the old account's queries kept
// running. Now they start after each account's data loads and stop on
// sign-out / account switch.
const _liveUnsubs = [];
let _liveUid = null;
function stopLiveListeners() {
    while (_liveUnsubs.length) { try { _liveUnsubs.pop()(); } catch (_) {} }
    _liveUid = null;
}
function startLiveListeners() {
    if (!currentUser || _liveUid === currentUser.uid) return;
    stopLiveListeners();
    _liveUid = currentUser.uid;
    listenForFriendUpdates();
    listenForSharedResources();
    loadFriendsData();
}
const _liveErr = (what) => (e) => console.warn(`live ${what} listener:`, e.message);

function listenForFriendUpdates() {
    if (!currentUser) return;
    
    // Listen for new friend requests
    _liveUnsubs.push(db.collection('friendRequests')
        .where('toUid', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            pendingRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderPendingRequests();
            updateUnreadBadge();
        }, _liveErr('friend requests')));
    
    // Listen for new shared lessons
    _liveUnsubs.push(db.collection('sharedLessons')
        .where('toUid', '==', currentUser.uid)
        .orderBy('sharedAt', 'desc')
        .limit(20)
        .onSnapshot(snapshot => {
            sharedLessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderSharedLessons();
            updateUnreadBadge();
        }, _liveErr('shared lessons')));
}

// Send friend request
// Accept friend request
async function acceptFriendRequest(requestId) {
    const request = pendingRequests.find(r => r.id === requestId);
    if (!request) return;
    
    try {
        showLoading();
        
        // Add to both users' friends lists
        const friendData = {
            uid: request.fromUid,
            email: request.fromEmail,
            name: request.fromName,
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const myDataForThem = {
            uid: currentUser.uid,
            email: currentUser.email,
            name: currentUser.displayName || currentUser.email,
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add friend to my list
        await db.collection('users').doc(currentUser.uid)
            .collection('friends').doc(request.fromUid).set(friendData);
        
        // Add me to their list
        await db.collection('users').doc(request.fromUid)
            .collection('friends').doc(currentUser.uid).set(myDataForThem);
        
        // Update request status
        await db.collection('friendRequests').doc(requestId).update({
            status: 'accepted',
            acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Reload data
        loadFriendsData();
        showToast(`You are now friends with ${request.fromName}!`);
        
    } catch (error) {
        console.error('Error accepting request:', error);
        showToast('Error accepting request');
    }
    
    hideLoading();
}

// Decline friend request
async function declineFriendRequest(requestId) {
    try {
        await db.collection('friendRequests').doc(requestId).update({
            status: 'declined'
        });
        showToast('Request declined');
        loadFriendsData();
    } catch (error) {
        console.error('Error declining:', error);
    }
}

// Remove friend
async function removeFriend(friendUid) {
    if (!await planyConfirm('Remove this friend?')) return;
    
    try {
        // Remove from both lists
        await db.collection('users').doc(currentUser.uid)
            .collection('friends').doc(friendUid).delete();
        
        await db.collection('users').doc(friendUid)
            .collection('friends').doc(currentUser.uid).delete();
        
        loadFriendsData();
        showToast('Friend removed');
    } catch (error) {
        console.error('Error removing friend:', error);
        showToast('Error removing friend');
        loadFriendsData();
    }
}

// Share lesson with friends
function openShareModal(lessonId) {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;
    
    document.getElementById('share-lesson-id').value = lessonId;
    document.getElementById('share-lesson-title').textContent = lesson.title;
    document.getElementById('share-lesson-date').textContent = formatDisplayDate(new Date(lesson.date + 'T00:00:00'));
    
    // Populate friends checklist
    const container = document.getElementById('share-friends-list');
    if (friends.length === 0) {
        container.innerHTML = '<p class="empty-state">Add friends first to share lessons!</p>';
    } else {
        container.innerHTML = friends.map(friend => `
            <label class="share-friend-option">
                <input type="checkbox" name="share-to" value="${friend.uid}">
                <span>${escHtml(friend.name)}</span>
                <span style="color: var(--text-muted); font-size: 0.8rem;">(${friend.email})</span>
            </label>
        `).join('');
    }
    
    document.getElementById('share-modal').classList.remove('hidden');
}

// Handle share form submit
document.getElementById('share-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const lessonId = document.getElementById('share-lesson-id').value;
    const lesson = lessons.find(l => l.id === lessonId);
    const message = document.getElementById('share-message').value;
    
    const selectedFriends = Array.from(document.querySelectorAll('input[name="share-to"]:checked'))
        .map(cb => cb.value);
    
    if (selectedFriends.length === 0) {
        showToast('Please select at least one friend');
        return;
    }
    
    try {
        showLoading();
        
        for (const friendUid of selectedFriends) {
            const friend = friends.find(f => f.uid === friendUid);
            
            await db.collection('sharedLessons').add({
                fromUid: currentUser.uid,
                fromEmail: currentUser.email,
                fromName: currentUser.displayName || currentUser.email,
                toUid: friendUid,
                toEmail: friend.email,
                lesson: {
                    title: lesson.title,
                    date: lesson.date,
                    subject: lesson.subject,
                    standards: lesson.standards || '',
                    learningTarget: lesson.learningTarget || '',
                    successCriteria: lesson.successCriteria || '',
                    flow: lesson.flow || '',
                    materials: lesson.materials || '',
                    activities: lesson.activities || ''
                },
                message: message,
                read: false,
                sharedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        document.getElementById('share-modal').classList.add('hidden');
        document.getElementById('share-form').reset();
        showToast(`Lesson shared with ${selectedFriends.length} friend(s)!`);
        
    } catch (error) {
        console.error('Error sharing lesson:', error);
        showToast('Error sharing lesson');
    }
    
    hideLoading();
});

// View shared lesson
function viewSharedLesson(sharedId) {
    const shared = sharedLessons.find(s => s.id === sharedId);
    if (!shared) return;
    
    // Mark as read
    if (!shared.read) {
        db.collection('sharedLessons').doc(sharedId).update({ read: true });
    }
    
    const content = document.getElementById('shared-lesson-content');
    content.innerHTML = `
        <div class="shared-from">
            <span class="friend-avatar">${escHtml((shared.fromName||'?').charAt(0).toUpperCase())}</span>
            <div>
                <strong>${escHtml(shared.fromName)}</strong> shared this with you
                ${shared.message ? `<p style="margin: 0.5rem 0 0; font-style: italic;">"${escHtml(shared.message)}"</p>` : ''}
            </div>
        </div>
        
        <h3 style="margin-bottom: 0.5rem;">${escHtml(shared.lesson.title)}</h3>
        <p style="color: var(--text-muted); margin-bottom: 1rem;">${formatDisplayDate(new Date(shared.lesson.date + 'T00:00:00'))} • ${escHtml(shared.lesson.subject || 'General')}</p>
        
        ${shared.lesson.standards ? `
        <div class="shared-lesson-section">
            <h4>Standards & Objectives</h4>
            <pre>${escHtml(shared.lesson.standards)}</pre>
        </div>` : ''}

        ${shared.lesson.learningTarget ? `
        <div class="shared-lesson-section">
            <h4>🎯 Learning Target</h4>
            <pre>${escHtml(shared.lesson.learningTarget)}</pre>
        </div>` : ''}

        ${shared.lesson.successCriteria ? `
        <div class="shared-lesson-section">
            <h4>✅ Success Criteria</h4>
            <pre>${escHtml(shared.lesson.successCriteria)}</pre>
        </div>` : ''}

        ${shared.lesson.flow ? `
        <div class="shared-lesson-section">
            <h4>Lesson Flow</h4>
            <pre>${escHtml(shared.lesson.flow)}</pre>
        </div>` : ''}
        
        ${shared.lesson.materials ? `
        <div class="shared-lesson-section">
            <h4>Materials</h4>
            <pre>${escHtml(shared.lesson.materials)}</pre>
        </div>` : ''}
        
        ${shared.lesson.activities ? `
        <div class="shared-lesson-section">
            <h4>Activities & Notes</h4>
            <pre>${escHtml(shared.lesson.activities)}</pre>
        </div>` : ''}
    `;
    
    document.getElementById('copy-shared-lesson-btn').onclick = () => copySharedLesson(shared);
    document.getElementById('view-shared-modal').classList.remove('hidden');
}

// Copy shared lesson to my lessons
async function copySharedLesson(shared) {
    // Open lesson modal with data pre-filled
    const lessonData = {
        title: shared.lesson.title + ' (Shared)',
        date: shared.lesson.date,
        subject: shared.lesson.subject,
        standards: shared.lesson.standards,
        learningTarget: shared.lesson.learningTarget,
        successCriteria: shared.lesson.successCriteria,
        flow: shared.lesson.flow,
        materials: shared.lesson.materials,
        activities: shared.lesson.activities
    };
    
    // Close the view modal
    document.getElementById('view-shared-modal').classList.add('hidden');
    
    // Open lesson modal and fill in data
    openLessonModal(shared.lesson.date);
    
    setTimeout(() => {
        document.getElementById('lesson-title').value = lessonData.title;
        document.getElementById('lesson-subject').value = lessonData.subject || '';
        document.getElementById('lesson-standards').value = lessonData.standards || '';
        document.getElementById('lesson-learning-target').value = lessonData.learningTarget || '';
        document.getElementById('lesson-success-criteria').value = lessonData.successCriteria || '';
        document.getElementById('lesson-flow').value = lessonData.flow || '';
        document.getElementById('lesson-materials').value = lessonData.materials || '';
        document.getElementById('lesson-activities').value = lessonData.activities || '';
    }, 100);
    
    showToast('Lesson copied - edit and save to add to your calendar!');
}

// Render functions
function renderFriendsList() {
    const container = document.getElementById('friends-list');
    if (!container) return;
    
    if (friends.length === 0) {
        container.innerHTML = '<p class="empty-state">No friends yet. Add a colleague above!</p>';
        return;
    }
    
    // Sort friends based on current sort tab
    let sortedFriends = [...friends];
    let groupedFriends = null;
    
    if (currentFriendsSort === 'school') {
        groupedFriends = groupBy(sortedFriends, f => f.school || 'Unknown School');
    } else if (currentFriendsSort === 'grade') {
        groupedFriends = groupBy(sortedFriends, f => formatGrade(f.grade) || 'Unknown Grade');
    } else if (currentFriendsSort === 'role') {
        groupedFriends = groupBy(sortedFriends, f => formatRole(f.role) || 'Unknown Role');
    } else if (currentFriendsSort === 'district') {
        groupedFriends = groupBy(sortedFriends, f => f.district || 'Unknown District');
    }
    
    if (groupedFriends) {
        // Render grouped
        let html = '';
        const sortedGroups = Object.keys(groupedFriends).sort();
        
        for (const group of sortedGroups) {
            const groupFriends = groupedFriends[group];
            html += `
                <div class="friends-group">
                    <div class="friends-group-header">
                        ${group}
                        <span class="friends-group-count">${groupFriends.length}</span>
                    </div>
                    <div class="friends-grid">
                        ${groupFriends.map(friend => renderFriendCard(friend)).join('')}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } else {
        // Render flat list
        container.innerHTML = `
            <div class="friends-grid">
                ${sortedFriends.map(friend => renderFriendCard(friend)).join('')}
            </div>
        `;
    }
}

// Render a single friend card
function renderFriendCard(friend) {
    const avatarContent = friend.profilePicture 
        ? `<img src="${escHtml(safeImgUrl(friend.profilePicture))}" alt="${escHtml(friend.name)}">`
        : `<div class="friend-avatar-placeholder">${escHtml(((friend.name || friend.email) || '?').charAt(0).toUpperCase())}</div>`;
    
    const badges = [];
    if (friend.grade) badges.push(`<span class="friend-badge grade">${escHtml(formatGrade(friend.grade))}</span>`);
    if (friend.role) badges.push(`<span class="friend-badge role">${escHtml(formatRole(friend.role))}</span>`);
    if (friend.school) badges.push(`<span class="friend-badge school">🏫 ${escHtml(friend.school)}</span>`);
    if (friend.district) badges.push(`<span class="friend-badge district">📍 ${escHtml(friend.district)}</span>`);
    
    return `
        <div class="friend-card" data-uid="${friend.uid}">
            <div class="friend-avatar">
                ${avatarContent}
            </div>
            <div class="friend-info">
                <div class="friend-name">${escHtml(friend.name || friend.email)}</div>
                <div class="friend-details">
                    ${badges.join('')}
                </div>
            </div>
            <div class="friend-actions">
                <button class="btn btn-icon-sm" onclick="openMessageModal('${friend.uid}', ${jsArg(friend.name)})" title="Message">💬</button>
                <button class="btn btn-icon-sm btn-danger" onclick="removeFriend('${friend.uid}')" title="Remove">✕</button>
            </div>
        </div>
    `;
}

// Group array by key
function groupBy(array, keyFn) {
    return array.reduce((result, item) => {
        const key = keyFn(item);
        if (!result[key]) result[key] = [];
        result[key].push(item);
        return result;
    }, {});
}

// Format grade for display
function formatGrade(grade) {
    if (!grade) return '';
    const gradeMap = {
        'prek': 'Pre-K',
        'k': 'Kindergarten',
        '1': '1st Grade',
        '2': '2nd Grade',
        '3': '3rd Grade',
        '4': '4th Grade',
        '5': '5th Grade',
        '6': '6th Grade',
        '7': '7th Grade',
        '8': '8th Grade',
        '9': '9th Grade',
        '10': '10th Grade',
        '11': '11th Grade',
        '12': '12th Grade',
        'multi': 'Multiple Grades'
    };
    return gradeMap[grade] || grade;
}

// Format role for display
function formatRole(role) {
    if (!role) return '';
    const roleMap = {
        'teacher': 'Teacher',
        'lead-teacher': 'Lead Teacher',
        'coach': 'Instructional Coach',
        'specialist': 'Specialist',
        'substitute': 'Substitute',
        'student-teacher': 'Student Teacher',
        'admin': 'Administrator',
        'other': 'Other'
    };
    return roleMap[role] || role;
}

function renderPendingRequests() {
    const card = document.getElementById('friend-requests-section');
    const container = document.getElementById('friend-requests-list');
    if (!card || !container) return;
    
    if (pendingRequests.length === 0) {
        card.classList.add('hidden');
        return;
    }
    
    card.classList.remove('hidden');
    container.innerHTML = pendingRequests.map(req => `
        <div class="pending-item">
            <div class="friend-avatar">${escHtml((req.fromName||'?').charAt(0).toUpperCase())}</div>
            <div class="friend-info">
                <div class="friend-name">${escHtml(req.fromName)}</div>
                <div class="friend-email">${escHtml(req.fromEmail)}</div>
            </div>
            <div class="pending-actions">
                <button class="btn btn-primary btn-sm" onclick="acceptFriendRequest('${req.id}')">Accept</button>
                <button class="btn btn-secondary btn-sm" onclick="declineFriendRequest('${req.id}')">Decline</button>
            </div>
        </div>
    `).join('');
}

function renderSharedLessons() {
    const container = document.getElementById('shared-lessons-list');
    if (!container) return;
    
    if (sharedLessons.length === 0) {
        container.innerHTML = '<p class="empty-state">No shared lessons yet.</p>';
        return;
    }
    
    container.innerHTML = sharedLessons.map(shared => `
        <div class="shared-lesson-item ${shared.read ? '' : 'unread'}" onclick="viewSharedLesson('${shared.id}')">
            <div class="shared-lesson-title">${shared.read ? '' : '🔵 '}${escHtml(shared.lesson.title)}</div>
            <div class="shared-lesson-meta">
                <span>From: ${escHtml(shared.fromName)}</span>
                <span>${escHtml(shared.lesson.date)}</span>
            </div>
        </div>
    `).join('');
}

function renderActivityFeed() {
    const container = document.getElementById('activity-feed');
    if (!container) return;
    
    const activities = [
        ...pendingRequests.map(r => ({
            type: 'request',
            icon: '👋',
            text: `${r.fromName} wants to be your friend`,
            time: r.sentAt?.toDate?.() || new Date()
        })),
        ...sharedLessons.slice(0, 5).map(s => ({
            type: 'share',
            icon: '📤',
            text: `${s.fromName} shared "${s.lesson.title}"`,
            time: s.sharedAt?.toDate?.() || new Date()
        }))
    ].sort((a, b) => b.time - a.time).slice(0, 10);
    
    if (activities.length === 0) {
        container.innerHTML = '<p class="empty-state">No recent activity.</p>';
        return;
    }
    
    container.innerHTML = activities.map(act => `
        <div class="activity-item">
            <div class="activity-icon">${act.icon}</div>
            <div class="activity-content">
                <div class="activity-text">${escHtml(act.text)}</div>
                <div class="activity-time">${formatTimeAgo(act.time)}</div>
            </div>
        </div>
    `).join('');
}

function updateUnreadBadge() {
    const badge = document.getElementById('unread-badge');
    if (!badge) return;
    
    const unreadShared = sharedLessons.filter(s => !s.read).length;
    const total = pendingRequests.length + unreadShared;
    
    if (total > 0) {
        badge.textContent = total;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Message modal
function openMessageModal(toUid, toName) {
    document.getElementById('message-to-uid').value = toUid;
    document.getElementById('message-to-name').value = toName;
    document.getElementById('message-to-display').textContent = toName;
    document.getElementById('message-modal').classList.remove('hidden');
}

// Send message (using shared lessons as a simple message system)
document.getElementById('message-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const toUid = document.getElementById('message-to-uid').value;
    const toName = document.getElementById('message-to-name').value;
    const subject = document.getElementById('message-subject').value;
    const body = document.getElementById('message-body').value;
    
    const friend = friends.find(f => f.uid === toUid);
    
    try {
        showLoading();
        
        // Use shared lessons collection as a simple message system
        await db.collection('sharedLessons').add({
            fromUid: currentUser.uid,
            fromEmail: currentUser.email,
            fromName: currentUser.displayName || currentUser.email,
            toUid: toUid,
            toEmail: friend?.email || '',
            lesson: {
                title: `💬 Message: ${subject || 'No subject'}`,
                date: formatDate(new Date()),
                subject: 'Message',
                standards: '',
                flow: body,
                materials: '',
                activities: ''
            },
            message: '',
            read: false,
            isMessage: true,
            sharedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('message-modal').classList.add('hidden');
        document.getElementById('message-form').reset();
        showToast(`Message sent to ${toName}!`);
        
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Error sending message');
    }
    
    hideLoading();
});

// Time ago helper

// Share button in lesson modal
document.getElementById('share-lesson-btn')?.addEventListener('click', () => {
    const lessonId = document.getElementById('lesson-id').value;
    if (lessonId) {
        document.getElementById('lesson-modal').classList.add('hidden');
        openShareModal(lessonId);
    } else {
        showToast('Save the lesson first to share it');
    }
});


