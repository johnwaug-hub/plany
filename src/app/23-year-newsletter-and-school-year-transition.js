// ============================================
// YEAR NEWSLETTER GENERATOR
// ============================================

function initYearNewsletter() {
    document.getElementById('newsletter-year-btn')?.addEventListener('click', openYearNewsletterModal);
    document.getElementById('yn-generate-btn')?.addEventListener('click', generateYearNewsletter);
    document.getElementById('yn-copy-btn')?.addEventListener('click', () => copyNewsletterOutput('yn-output'));
    document.getElementById('yn-print-btn')?.addEventListener('click', printYearNewsletter);
    document.getElementById('yn-regenerate-btn')?.addEventListener('click', generateYearNewsletter);
}

function openYearNewsletterModal() {
    const schoolYear = settings.schoolYear || '2025-2026';
    document.getElementById('year-newsletter-title').textContent = `📰 Year-at-a-Glance Newsletter — ${schoolYear}`;

    const statusEl = document.getElementById('yn-curriculum-status');
    const readable = curriculumDocs.filter(d => d.hasContent && d.content && d.content.length > 50);
    if (readable.length > 0) {
        statusEl.innerHTML = `<div class="yn-curriculum-info">📚 Using <strong>${readable.length}</strong> pacing document${readable.length !== 1 ? 's' : ''} from your Curriculum Library as source material.</div>`;
    } else if (curriculumDocs.length > 0) {
        statusEl.innerHTML = `<div class="yn-curriculum-warn">⚠️ ${curriculumDocs.length} document${curriculumDocs.length !== 1 ? 's' : ''} uploaded but none have readable text — Claude will use your class schedule and lesson titles instead.</div>`;
    } else {
        statusEl.innerHTML = `<div class="yn-curriculum-warn">📂 No curriculum documents uploaded. Upload pacing guides in <strong>Settings → Curriculum Library</strong> for richer newsletters.</div>`;
    }

    document.getElementById('yn-output-area').classList.add('hidden');
    document.getElementById('yn-status').classList.add('hidden');
    document.getElementById('year-newsletter-modal').classList.remove('hidden');
    showSavedAiOutput({
        id: newsletterSaveId('year'),
        statusEl: document.getElementById('yn-status'),
        outputArea: document.getElementById('yn-output-area'),
        outputEl: document.getElementById('yn-output'),
        outputLabelEl: document.getElementById('yn-output-label')
    });
}

function buildYearNewsletterContext() {
    const schoolYear = settings.schoolYear || '2025-2026';

    const classLines = classes.map(cls => {
        const dayList = Object.entries(cls.schedule || {})
            .filter(([, v]) => v)
            .map(([d]) => d.charAt(0).toUpperCase() + d.slice(1))
            .join(', ');
        return `  • ${cls.name}${cls.subject ? ' (' + cls.subject + ')' : ''}${dayList ? ' — ' + dayList : ''}`;
    });

    const keyTypes = ['first-day','last-day','holiday','break','no-school','grading','conference'];
    // v6.5.0: every key date (was capped at 20, which dropped spring break and
    // the last day on a detailed district calendar), no-school via the single
    // gatekeeper, and events without a start date can't crash the sort.
    const keyEvents = events
        .filter(e => e.startDate && (keyTypes.includes(e.type) || isNoSchoolEvent(e)))
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 60)
        .map(e => {
            const d = new Date(e.startDate + 'T00:00:00');
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endStr = e.endDate && e.endDate !== e.startDate
                ? ' – ' + new Date(e.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '';
            return `  • ${dateStr}${endStr}: ${e.title}`;
        });

    const readable = curriculumDocs.filter(d => d.hasContent && d.content && d.content.length > 50);
    const bySubject = {};
    readable.forEach(doc => {
        const subj = doc.subject || 'other';
        if (!bySubject[subj]) bySubject[subj] = [];
        bySubject[subj].push(doc);
    });

    const pacingBlocks = Object.entries(bySubject).map(([subj, docs]) => {
        const names = docs.map(d => d.name).join(', ');
        // v6.5.0: sample every document in the subject (was the first 1,000
        // characters of the first one only)
        const perDoc = Math.max(600, Math.floor(4000 / docs.length));
        const excerpt = docs.slice(0, 6).map(d => d.content.substring(0, perDoc).replace(/\s+/g, ' ').trim()).join('\n...\n');
        return 'SUBJECT: ' + subj.toUpperCase() + '\nDocuments: ' + names + '\nContent:\n' + excerpt;
    });

    const lessonSamples = classes.slice(0, 6).map(cls => {
        const titles = lessons
            .filter(l => l.classId === cls.id && l.title)
            .slice(0, 8)
            .map(l => l.title);
        if (titles.length === 0) return '';
        return '  ' + cls.name + ': ' + titles.join(' | ');
    }).filter(Boolean);

    const parts = [
        'SCHOOL YEAR: ' + schoolYear,
        '',
        'CLASSES:',
        ...classLines,
        '',
        'KEY SCHOOL EVENTS & BREAKS:',
        ...(keyEvents.length > 0 ? keyEvents : ['  (No events added yet)']),
        '',
        'LESSON SAMPLES:',
        ...lessonSamples,
    ];
    if (pacingBlocks.length > 0) {
        parts.push('', 'PACING DOCUMENTS (primary source — use these for curriculum details):');
        pacingBlocks.forEach((b, i) => {
            parts.push('', '--- Document ' + (i+1) + ' ---');
            parts.push(b);
        });
    } else {
        parts.push('', '(No pacing documents uploaded — using class and lesson data only)');
    }
    return parts.join('\n');
}

async function generateYearNewsletter() {
    const tone = document.getElementById('yn-tone')?.value || 'warm';
    const language = document.getElementById('yn-language')?.value || 'English';
    const includeCurriculum = document.getElementById('yn-include-curriculum')?.checked;
    const includeEvents = document.getElementById('yn-include-events')?.checked;
    const includeGoals = document.getElementById('yn-include-goals')?.checked;
    const extra = document.getElementById('yn-extra')?.value?.trim() || '';

    const schoolYear = settings.schoolYear || '2025-2026';
    const teacherName = aiSettings.teacherName || userProfile.username || 'Your Teacher';
    const grade = aiSettings.grade || '1';
    const context = buildYearNewsletterContext();

    const toneMap = {
        warm: 'warm, welcoming, and encouraging',
        professional: 'professional and informative',
        brief: 'concise with bullet points, under 200 words'
    };

    const sections = [];
    if (includeCurriculum) sections.push('what students will study this year');
    if (includeEvents) sections.push('key dates (first day, breaks, holidays, last day)');
    if (includeGoals) sections.push('main learning goals and skills students will build');

    const prompt = buildNewsletterPrompt({
        teacherName, grade, scopeLabel: `${schoolYear} school year`, toneMap, tone, language,
        context, sections, extra, wordLimit: 400,
        extraGuidance: 'Draw curriculum highlights DIRECTLY from the pacing documents in the data above — use real unit names, topics, and skills rather than generic phrases.'
    });

    await generateNewsletterFromPrompt({
        prompt,
        maxTokens: 2000,
        statusEl: document.getElementById('yn-status'),
        outputArea: document.getElementById('yn-output-area'),
        outputEl: document.getElementById('yn-output'),
        outputLabelEl: document.getElementById('yn-output-label'),
        labelText: `Year newsletter · ${schoolYear}`,
        genBtn: document.getElementById('yn-generate-btn'),
        readyMessage: '📰 Year newsletter ready!',
        saveId: newsletterSaveId('year')
    });
}

function printYearNewsletter() {
    const el = document.getElementById('yn-output');
    const teacherName = aiSettings.teacherName || userProfile.username || 'Teacher';
    const schoolYear = settings.schoolYear || '2025-2026';
    if (!el?.innerHTML.trim()) { showToast('Generate a newsletter first'); return; }

    openNewsletterPrintWindow({
        title: `Year-at-a-Glance · ${schoolYear}`,
        subtitle: '',
        v: '0.5in',
        bodyHtml: el.innerHTML
    });
}


// ============================================
// SCHOOL YEAR TRANSITION SYSTEM
// ============================================
// Runs on login. Detects June 1+ and prompts rollover.
// May 31 = last save day for current year.
// June 1+ = new year prompt until dismissed or acted on.

async function checkSchoolYearTransition() {
    if (!currentUser) return;

    const today = new Date();
    const month = today.getMonth(); // 0-indexed: 5 = June
    const day   = today.getDate();

    // Determine the "end year" of the current school year
    const yearParts = (settings.schoolYear || '2025-2026').split('-');
    const endCalYear = parseInt(yearParts[1]);  // e.g. 2026

    // Only trigger if today is June 1 or later in the end calendar year
    const isPostYear = (today.getFullYear() === endCalYear && month >= 5)  // June+ of end year
                    || (today.getFullYear() > endCalYear);                   // any later year

    if (!isPostYear) return;

    // Check if user already dismissed or switched this cycle
    const dismissKey = 'plany_new_year_dismissed_' + settings.schoolYear;
    const dismissed = localStorage.getItem(dismissKey);
    if (dismissed) return;

    // Calculate the next school year
    const nextYear = endCalYear + '-' + (endCalYear + 1);

    // Populate the new year select
    const sel = document.getElementById('new-year-select');
    if (sel) {
        sel.innerHTML = [nextYear, (endCalYear+1) + '-' + (endCalYear+2)]
            .map(y => `<option value="${y}">${y}</option>`)
            .join('');
        sel.value = nextYear;
    }

    // Show class preview in modal
    const classListEl = document.getElementById('new-year-class-list');
    if (classListEl) {
        if (classes.length === 0) {
            classListEl.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.4rem;">No classes in current year to copy.</p>';
            const copyChk = document.getElementById('new-year-copy-classes');
            if (copyChk) { copyChk.checked = false; copyChk.disabled = true; }
        } else {
            classListEl.innerHTML = classes.map(cls => `
                <div class="new-year-class-chip" style="border-left:3px solid ${cls.color || '#FF6B9D'}">
                    <span class="chip-dot" style="background:${cls.color || '#FF6B9D'}"></span>
                    <span class="chip-name">${escHtml(cls.name)}</span>
                    ${cls.subject ? `<span class="chip-subject">${cls.subject}</span>` : ''}
                </div>
            `).join('');
        }
    }

    // Update heading
    const heading = document.getElementById('new-year-heading');
    const subtext  = document.getElementById('new-year-subtext');
    if (heading) heading.textContent = month === 5 && day === 1
        ? "It's June 1st — New Year Time!"
        : `The ${settings.schoolYear} school year has ended!`;
    if (subtext) subtext.textContent =
        `Your ${settings.schoolYear} data is safely saved and archived. Let's set up ${nextYear}.`;

    document.getElementById('new-year-modal').classList.remove('hidden');
}

function initNewYearModal() {
    document.getElementById('new-year-start-btn')?.addEventListener('click', async () => {
        const sel = document.getElementById('new-year-select');
        const newYear = sel?.value;
        if (!newYear) return;

        const copyClasses = document.getElementById('new-year-copy-classes')?.checked === true;
        const oldYear = settings.schoolYear;
        const classesToCopy = copyClasses ? [...classes] : [];

        // Save dismissal
        localStorage.setItem('plany_new_year_dismissed_' + oldYear, '1');
        document.getElementById('new-year-modal').classList.add('hidden');

        // Switch to new school year
        settings.schoolYear = newYear;
        if (elements.schoolYear) elements.schoolYear.value = newYear;

        try {
            await db.collection('users').doc(currentUser.uid)
                .collection('settings').doc('schoolYear')
                .set(settings, { merge: true });
        } catch(e) { console.warn('Could not save new year setting:', e); }

        showLoading();
        document.querySelector('.loading-text') && (document.querySelector('.loading-text').textContent = 'Setting up new school year...');

        // Copy classes into the new year before loading
        if (classesToCopy.length > 0) {
            try {
                const newYearPath = db.collection('users').doc(currentUser.uid).collection('years').doc(newYear);
                // Check if new year already has classes
                const existingSnap = await newYearPath.collection('classes').limit(1).get();
                if (existingSnap.empty) {
                    for (const cls of classesToCopy) {
                        const { id, ...clsData } = cls;
                        clsData.copiedFromYear = oldYear;
                        clsData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                        clsData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                        await newYearPath.collection('classes').add(clsData);
                    }
                    console.log(`Copied ${classesToCopy.length} classes to ${newYear}`);
                }
            } catch(e) {
                console.warn('Could not copy classes:', e);
            }
        }

        await loadSchoolYearData(newYear);
        hideLoading();

        const copiedMsg = classesToCopy.length > 0
            ? ` Copied ${classesToCopy.length} class${classesToCopy.length !== 1 ? 'es' : ''} from ${oldYear}.`
            : '';
        showToast(`🎉 Welcome to ${newYear}!${copiedMsg}`);

        // Go to settings so they can upload new pacing docs
        setTimeout(() => {
            const settingsNav = document.querySelector('[data-view="settings"]');
            if (settingsNav) settingsNav.click();
        }, 800);
    });

    document.getElementById('new-year-dismiss-btn')?.addEventListener('click', () => {
        localStorage.setItem('plany_new_year_dismissed_' + settings.schoolYear, '1');
        document.getElementById('new-year-modal').classList.add('hidden');
    });
}

// May 31 — show end-of-year save reminder banner
function checkEndOfYearReminder() {
    const today = new Date();
    const month = today.getMonth(); // 4 = May
    const day   = today.getDate();
    const yearParts = (settings.schoolYear || '2025-2026').split('-');
    const endCalYear = parseInt(yearParts[1]);

    const isMay31 = today.getFullYear() === endCalYear && month === 4 && day === 31;
    if (!isMay31) return;

    const key = 'plany_may31_banner_' + settings.schoolYear;
    if (localStorage.getItem(key)) return;

    const banner = document.createElement('div');
    banner.id = 'end-of-year-banner';
    banner.innerHTML = `
        <span>📦 Last day of school! Your year data is automatically saved. Export a backup for safekeeping.</span>
        <button onclick="document.getElementById('open-export-modal-btn')?.click(); this.parentElement.remove();">💾 Export Backup</button>
        <button onclick="localStorage.setItem('${key}','1'); this.parentElement.remove();">✕</button>
    `;
    banner.style.cssText = `
        position:fixed; top:0; left:0; right:0; z-index:9999;
        background:linear-gradient(135deg,#FF6B9D,#9D4EDD);
        color:#fff; padding:10px 20px; display:flex; align-items:center;
        justify-content:center; gap:12px; font-size:0.88rem; font-weight:500;
    `;
    banner.querySelectorAll('button').forEach(b => {
        b.style.cssText = 'background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;padding:4px 12px;border-radius:5px;cursor:pointer;';
    });
    document.body.prepend(banner);
}

// Update the school year dropdown to always include current + next 2 years
function updateSchoolYearDropdown() {
    const sel = elements.schoolYear;
    if (!sel) return;
    const today = new Date();
    const cy = today.getFullYear();
    // Generate options for past 1 year through next 2 years
    const years = [];
    for (let y = cy - 1; y <= cy + 2; y++) {
        years.push(`${y}-${y+1}`);
    }
    const current = settings.schoolYear || `${cy}-${cy+1}`;
    sel.innerHTML = years.map(y =>
        `<option value="${y}"${y === current ? ' selected' : ''}>${y}</option>`
    ).join('');
}


