// ============================================================
// 🚀 YEAR SETUP CHECKLIST
// ============================================================

const CHECKLIST_STEPS = [
    {
        id: 'school-year',
        icon: '🏫',
        title: 'Set your school year',
        hint: 'Select the correct year so all your data is scoped correctly.',
        optional: false,
        action: () => {
            // Scroll to school year selector in year setup bar
            document.getElementById('school-year')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementById('school-year')?.focus();
        },
        isDone: () => {
            // Done if school year is set to something reasonable (not default empty)
            return !!(settings.schoolYear);
        }
    },
    {
        id: 'first-last-day',
        icon: '📅',
        title: 'Add first & last day',
        hint: 'Mark your first and last day of school so the year calendar knows its boundaries.',
        optional: false,
        action: () => {
            // Open the event modal directly (works from any view)
            switchView('year');
            setTimeout(() => {
                const modal = document.getElementById('event-modal');
                if (modal) {
                    modal.classList.remove('hidden');
                    const typeSel = document.getElementById('event-type');
                    if (typeSel) typeSel.value = 'first-day';
                } else {
                    document.getElementById('day-view-add-event-btn')?.click();
                }
            }, 250);
        },
        isDone: () => {
            return events.some(e => e.type === 'first-day') && events.some(e => e.type === 'last-day');
        }
    },
    {
        id: 'breaks',
        icon: '🏖️',
        title: 'Add breaks & holidays',
        hint: 'Add winter break, spring break, and PD days so no lessons land on off days.',
        optional: false,
        action: () => {
            // Scroll to the add-break form in the year setup bar
            switchView('year');
            setTimeout(() => {
                const breakName = document.getElementById('break-name');
                if (breakName) {
                    breakName.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    breakName.focus();
                }
            }, 200);
        },
        isDone: () => {
            const hasBreakEvents = events.some(e =>
                ['break', 'holiday', 'no-school', 'professional-learning', 'grading'].includes(e.type)
            );
            return (settings.breaks && settings.breaks.length > 0) || hasBreakEvents;
        }
    },
    {
        id: 'classes',
        icon: '🎓',
        title: 'Add your classes',
        hint: 'Create at least one class with a name, subject, color, and weekly schedule.',
        optional: false,
        action: () => {
            switchView('classes');
            setTimeout(() => document.getElementById('add-class-btn')?.click(), 200);
        },
        isDone: () => classes.length > 0
    },
    {
        id: 'curriculum',
        icon: '📚',
        title: 'Upload curriculum',
        hint: 'Upload PDFs, word lists, or lesson guides to power AI Lesson Fill and Student Packets.',
        optional: true,
        action: () => {
            switchView('settings');
            setTimeout(() => {
                const accord = document.getElementById('accord-curriculum');
                if (accord) { accord.open = true; accord.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            }, 300);
        },
        isDone: () => typeof curriculumDocs !== 'undefined' && curriculumDocs.length > 0
    },
    {
        id: 'api-key',
        icon: '🔑',
        title: 'Add your API key',
        hint: 'Paste an API key from Anthropic, OpenAI, or Google Gemini to enable all AI features — lesson fill, scan, quiz generator.',
        optional: true,
        action: () => {
            switchView('settings');
            setTimeout(() => {
                const keyEl = document.getElementById('ai-api-key');
                if (keyEl) { keyEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); keyEl.focus(); }
            }, 300);
        },
        isDone: () => hasEffectiveAiKey()
    }
];

// The dismissal used to live only in a per-school-year localStorage key, so it
// came back on a new school year, on another device, in the installed app vs the
// browser, and any time site data was cleared. It is now an account-level flag
// stored with the user's settings, with localStorage kept as a fast mirror.
const CHECKLIST_DISMISS_KEY = 'checklist_dismissed_all';

function isChecklistDismissed() {
    if (settings.checklistDismissed === true) return true;
    try {
        if (localStorage.getItem(CHECKLIST_DISMISS_KEY) === 'true') return true;
        // legacy per-year key
        if (localStorage.getItem('checklist_dismissed_' + (settings.schoolYear || '')) === 'true') return true;
    } catch (e) {}
    return false;
}

async function persistChecklistDismissed(dismissed) {
    settings.checklistDismissed = dismissed;
    try {
        if (dismissed) localStorage.setItem(CHECKLIST_DISMISS_KEY, 'true');
        else localStorage.removeItem(CHECKLIST_DISMISS_KEY);
        localStorage.removeItem('checklist_dismissed_' + (settings.schoolYear || ''));
    } catch (e) {}
    try {
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid)
                .collection('settings').doc('schoolYear')
                .set({ checklistDismissed: dismissed }, { merge: true });
        }
    } catch (e) { console.warn('persistChecklistDismissed:', e.message); }
}

function getChecklistState() {
    const dismissed = isChecklistDismissed();
    const steps = CHECKLIST_STEPS.map(step => ({
        ...step,
        done: step.isDone()
    }));
    const required = steps.filter(s => !s.optional);
    const requiredDone = required.filter(s => s.done).length;
    const allRequiredDone = requiredDone === required.length;
    const totalDone = steps.filter(s => s.done).length;
    return { steps, required, requiredDone, allRequiredDone, totalDone, dismissed };
}

function updateYearChecklist() {
    const card = document.getElementById('year-checklist');
    const dot  = document.getElementById('year-setup-dot');
    if (!card) return;

    const state = getChecklistState();

    // Hide if dismissed AND all required done
    if (state.dismissed && state.allRequiredDone) {
        card.classList.add('hidden');
        if (dot) dot.classList.add('hidden');
        return;
    }

    // Hide if user dismissed and hasn't visited year view yet
    if (state.dismissed) {
        card.classList.add('hidden');
        // Keep dot visible if required steps remain
        if (dot) {
            state.allRequiredDone ? dot.classList.add('hidden') : dot.classList.remove('hidden');
        }
        return;
    }

    // Show card
    card.classList.remove('hidden');
    card.classList.toggle('all-done', state.allRequiredDone);

    // Update progress
    const progressEl = document.getElementById('checklist-progress-bar');
    const progressText = document.getElementById('checklist-progress-text');
    const pct = Math.round((state.requiredDone / state.required.length) * 100);
    if (progressEl) progressEl.style.width = pct + '%';
    if (progressText) {
        progressText.textContent = state.allRequiredDone
            ? '✓ All required steps complete!'
            : `${state.requiredDone} of ${state.required.length} required steps done`;
        progressText.style.color = state.allRequiredDone ? '#06D6A0' : '';
    }

    // Render steps
    const stepsEl = document.getElementById('checklist-steps');
    if (stepsEl) {
        stepsEl.innerHTML = state.steps.map(step => `
            <div class="checklist-step ${step.done ? 'done' : ''} ${step.optional ? 'optional' : ''}"
                 data-step-id="${step.id}" role="button" tabindex="0"
                 title="${step.done ? 'Done' : 'Click to set up'}">
                <div class="checklist-step-check">${step.done ? '✓' : ''}</div>
                <div class="checklist-step-body">
                    <div class="checklist-step-title">
                        ${step.icon} ${step.title}
                        ${step.optional ? '<span class="checklist-optional-badge">optional</span>' : ''}
                    </div>
                    <div class="checklist-step-hint">${step.hint}</div>
                </div>
                ${!step.done ? '<span class="checklist-step-arrow">›</span>' : ''}
            </div>
        `).join('');

        // Wire click handlers
        stepsEl.querySelectorAll('.checklist-step:not(.done)').forEach(el => {
            const stepId = el.dataset.stepId;
            const step = CHECKLIST_STEPS.find(s => s.id === stepId);
            if (step) {
                el.addEventListener('click', () => step.action());
                el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') step.action(); });
            }
        });
    }

    // Nav dot — show while required steps remain
    if (dot) {
        state.allRequiredDone ? dot.classList.add('hidden') : dot.classList.remove('hidden');
    }

    // Auto-dismiss card (not dot) once all required done and user has seen it
    if (state.allRequiredDone) {
        setTimeout(() => {
            if (state.allRequiredDone) {
                card.classList.add('all-done');
            }
        }, 500);
    }
}

function dismissChecklist() {
    persistChecklistDismissed(true);
    document.getElementById('year-checklist')?.classList.add('hidden');
    // Keep dot if required steps not done
    const state = getChecklistState();
    const dot = document.getElementById('year-setup-dot');
    if (dot) {
        state.allRequiredDone ? dot.classList.add('hidden') : dot.classList.remove('hidden');
    }
}

// Clicking the nav dot re-shows the checklist
document.getElementById('year-setup-dot')?.addEventListener('click', (e) => {
    e.stopPropagation();
    persistChecklistDismissed(false);
    switchView('year');
    setTimeout(updateYearChecklist, 100);
});


