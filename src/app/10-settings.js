// ==================== SETTINGS ====================

// Background Picker
function applyBackground(bg, customUrl = null) {
    document.body.classList.remove('bg-classroom', 'bg-beach', 'bg-mountains', 'bg-forest', 'bg-custom');
    
    // Remove any custom background image
    document.body.style.removeProperty('--custom-bg');
    const beforeStyle = document.getElementById('custom-bg-style');
    if (beforeStyle) beforeStyle.remove();
    
    if (bg && bg !== 'classroom') {
        document.body.classList.add(`bg-${bg}`);
    }
    
    // Apply custom background image
    if (bg === 'custom' && customUrl) {
        const style = document.createElement('style');
        style.id = 'custom-bg-style';
        style.textContent = `body.bg-custom::before { background-image: url('${customUrl}') !important; }`;
        document.head.appendChild(style);
    }
}

function initBackgroundPicker() {
    const bgOptions = document.querySelectorAll('input[name="background"]');
    const customUploadSection = document.getElementById('custom-upload-section');
    const bgUpload = document.getElementById('bg-upload');
    const customPreview = document.getElementById('custom-bg-preview');
    
    bgOptions.forEach(option => {
        option.addEventListener('change', async (e) => {
            const bg = e.target.value;
            settings.background = bg;
            
            // Show/hide custom upload section
            if (bg === 'custom') {
                customUploadSection.classList.remove('hidden');
                // Apply existing custom background if available
                if (settings.customBgUrl) {
                    applyBackground(bg, settings.customBgUrl);
                } else {
                    applyBackground(bg);
                }
            } else {
                customUploadSection.classList.add('hidden');
                applyBackground(bg);
            }
            
            // Save to Firestore
            if (currentUser) {
                try {
                    await db.collection('users').doc(currentUser.uid)
                        .collection('settings').doc('schoolYear').set(settings);
                    showToast('Background updated!');
                } catch (error) {
                    console.error('Error saving background:', error);
                }
            }
        });
    });
    
    // Handle custom image upload
    bgUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Check file size (max 2MB for localStorage)
        if (file.size > 2 * 1024 * 1024) {
            showToast('Image too large. Please use an image under 2MB.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const dataUrl = event.target.result;
            
            // Update preview
            customPreview.style.backgroundImage = `url('${dataUrl}')`;
            customPreview.style.backgroundSize = 'cover';
            customPreview.style.backgroundPosition = 'center';
            customPreview.querySelector('.bg-icon').style.display = 'none';
            
            // Save to settings and apply
            settings.customBgUrl = dataUrl;
            settings.background = 'custom';
            applyBackground('custom', dataUrl);
            
            // Save to Firestore
            if (currentUser) {
                try {
                    await db.collection('users').doc(currentUser.uid)
                        .collection('settings').doc('schoolYear').set(settings);
                    showToast('Custom background saved!');
                } catch (error) {
                    console.error('Error saving background:', error);
                    showToast('Error saving background');
                }
            }
        };
        reader.readAsDataURL(file);
    });
}

// Initialize background picker on DOM ready
document.addEventListener('DOMContentLoaded', initBackgroundPicker);

// School year change handler
elements.schoolYear.addEventListener('change', async () => {
    const newYear = elements.schoolYear.value;
    const prevYear = settings.schoolYear;
    settings.schoolYear = newYear;
    
    showLoading();
    try {
        // Load data for the new school year FIRST; only remember the choice
        // once it loaded (v6.2.0 -- a failed load used to leave the spinner up
        // and point every later save at the new year while old data showed).
        await loadSchoolYearData(newYear);

        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('schoolYear').set(settings, { merge: true });
        try { localStorage.setItem('plany_last_school_year', settings.schoolYear); } catch(e) {}
        
        // Month view opens on August of the new year; week view stays on this week
        const startYear = parseInt(newYear.split('-')[0]);
        currentDate = new Date(startYear, 7, 1);
        currentWeekStart = getWeekStart(new Date());
        
        updateSchoolYearDisplay();
        showToast(`Switched to ${newYear}`);
    } catch (error) {
        console.error('Error switching school year:', error);
        settings.schoolYear = prevYear;
        elements.schoolYear.value = prevYear;
        try { await loadSchoolYearData(prevYear); } catch (e2) { console.error('Reloading previous year failed:', e2); }
        showToast(`Couldn't open ${newYear}. You're still in ${prevYear}. Check your connection and try again.`);
    } finally {
        hideLoading();
    }
});

function renderBreaks() {
    if (!elements.breaksList) return;
    
    if (!settings.breaks || settings.breaks.length === 0) {
        elements.breaksList.innerHTML = '';
        return;
    }
    
    elements.breaksList.innerHTML = settings.breaks.map((brk, i) => `
        <div class="break-item">
            <div class="break-info">
                <div>${escHtml(brk.name)}</div>
                <div class="break-dates">${brk.start} to ${brk.end}</div>
            </div>
            <button class="btn btn-icon" data-index="${i}" title="Delete">×</button>
        </div>
    `).join('');
    
    elements.breaksList.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', async () => {
            settings.breaks.splice(parseInt(btn.dataset.index), 1);
            const yearPath = db.collection('users').doc(currentUser.uid).collection('years').doc(settings.schoolYear);
            await yearPath.collection('settings').doc('breaks').set({ breaks: settings.breaks });
            renderBreaks();
            updateSchoolYearDisplay();
            showToast('Break removed');
        });
    });
}

elements.addBreakBtn.addEventListener('click', async () => {
    const name = elements.breakName.value.trim();
    const start = elements.breakStart.value;
    const end = elements.breakEnd.value;
    
    if (!name || !start || !end) {
        showToast('Please fill all break fields');
        return;
    }
    
    if (!settings.breaks) settings.breaks = [];
    settings.breaks.push({ name, start, end });
    
    try {
        const yearPath = db.collection('users').doc(currentUser.uid).collection('years').doc(settings.schoolYear);
        await yearPath.collection('settings').doc('breaks').set({ breaks: settings.breaks });
        elements.breakName.value = '';
        elements.breakStart.value = '';
        elements.breakEnd.value = '';
        renderBreaks();
        updateSchoolYearDisplay();
        updateYearChecklist();
        showToast('Break added!');
    } catch (error) {
        showToast('Error adding break');
    }
});

