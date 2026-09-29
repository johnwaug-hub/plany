// ============================================================
// CURRICULUM GENERATOR
// ============================================================

function openCurriculumGenerator() {
    const modal = document.getElementById('curriculum-gen-modal');
    if (!modal) return;

    // Build class list with editable curriculum fields
    const listEl = document.getElementById('curgen-class-list');
    if (listEl) {
        if (classes.length === 0) {
            listEl.innerHTML = '<p style="font-size:0.82rem;color:var(--text-muted);">No classes found. Add classes first.</p>';
        } else {
            listEl.innerHTML = classes.map(cls => `
                <div style="background:rgba(0,0,0,0.15);border-radius:var(--radius-md);padding:10px 12px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <input type="checkbox" class="curgen-class-check" value="${cls.id}" checked
                            style="width:16px;height:16px;cursor:pointer;">
                        <span style="font-weight:700;font-size:0.82rem;color:var(--text-primary);">${escHtml(cls.name)}</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${cls.subject || ''}</span>
                    </div>
                    <input type="text" class="form-control curgen-curriculum-input" data-class-id="${cls.id}"
                        placeholder="Curriculum program (e.g. Wonders 2023 ELA, Everyday Math Grade 1)"
                        value="${cls.curriculum || ''}"
                        style="font-size:0.78rem;padding:5px 8px;">
                </div>
            `).join('');
        }
    }

    document.getElementById('curgen-status').innerHTML = '';
    document.getElementById('curgen-prefill-lessons').checked = false;
    const btn = document.getElementById('curgen-run-btn');
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Generate Now'; }
    modal.classList.remove('hidden');
}

function closeCurriculumGenerator() {
    document.getElementById('curriculum-gen-modal')?.classList.add('hidden');
    document.getElementById('student-modal')?.classList.add('hidden');
    document.getElementById('assignment-modal')?.classList.add('hidden');
    document.getElementById('diff-modal')?.classList.add('hidden');
    document.getElementById('gc-modal')?.classList.add('hidden');
    document.getElementById('grade-settings-modal')?.classList.add('hidden');
    document.getElementById('attendance-modal')?.classList.add('hidden');
    document.getElementById('teams-modal')?.classList.add('hidden');
    document.getElementById('moodle-modal')?.classList.add('hidden');
    document.getElementById('sis-modal')?.classList.add('hidden');
    document.getElementById('comm-modal')?.classList.add('hidden');
    closeSeatPicker();
}

async function runCurriculumGenerator() {
    if (!hasEffectiveAiKey()) { showToast('Add your API key in Settings first.'); return; }

    const checkedInputs = Array.from(document.querySelectorAll('.curgen-class-check:checked'));
    if (checkedInputs.length === 0) { showToast('Select at least one class.'); return; }

    const prefillLessons = document.getElementById('curgen-prefill-lessons')?.checked;
    const btn            = document.getElementById('curgen-run-btn');
    const statusEl       = document.getElementById('curgen-status');
    const grade          = aiSettings.grade || '1';
    const sy             = settings.schoolYear || '2025-2026';
    const yearStart      = settings.yearStart  || sy.split('-')[0] + '-08-01';
    const yearEnd        = settings.yearEnd    || sy.split('-')[1] + '-05-25';

    const selectedClasses = checkedInputs.map(cb => {
        const cls = classes.find(c => c.id === cb.value);
        const inputEl = document.querySelector(`.curgen-curriculum-input[data-class-id="${cb.value}"]`);
        const curriculum = (inputEl?.value || cls?.curriculum || '').trim();
        return { cls, curriculum };
    }).filter(x => x.cls);

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

    const setStatus = (msg) => {
        if (statusEl) statusEl.innerHTML = `<div style="font-size:0.78rem;color:var(--text-secondary);padding:6px 0;">${msg}</div>`;
    };

    let totalUnitsAdded   = 0;
    let totalLessonsAdded = 0;

    for (let i = 0; i < selectedClasses.length; i++) {
        const { cls, curriculum } = selectedClasses[i];

        // Save curriculum back to class if changed
        if (curriculum && curriculum !== cls.curriculum) {
            try {
                await getYearPath().collection('classes').doc(cls.id).update({ curriculum });
                const idx = classes.findIndex(c => c.id === cls.id);
                if (idx >= 0) classes[idx].curriculum = curriculum;
            } catch(e) { console.warn('Could not save curriculum to class:', e); }
        }

        setStatus(`(${i+1}/${selectedClasses.length}) Generating units for <strong>${escHtml(cls.name)}</strong>…`);

        const unitColor = UNIT_COLORS[i % UNIT_COLORS.length];

        const unitPrompt =
            'You are planning a Grade ' + grade + ' school year for the class "' + cls.name + '"' +
            (cls.subject ? ' (' + cls.subject + ')' : '') + '.\n' +
            (curriculum ? 'Curriculum program: ' + curriculum + '\n' : '') +
            'School year: ' + yearStart + ' to ' + yearEnd + '\n\n' +
            'Generate a complete sequence of units that covers this entire school year.\n' +
            'Requirements:\n' +
            '- 8 to 14 units total, sequenced logically from simple to complex\n' +
            '- Each unit spans 2–5 weeks (no gaps, no overlaps)\n' +
            '- Start dates and end dates must stay within ' + yearStart + ' to ' + yearEnd + '\n' +
            '- Standards should reference CCSS or NGSS codes where applicable\n' +
            '- Use the specific curriculum program chapters/units if you know them\n\n' +
            'Return ONLY compact JSON array, no markdown:\n' +
            '[{\n' +
            '  "name": "<unit name>",\n' +
            '  "startDate": "YYYY-MM-DD",\n' +
            '  "endDate": "YYYY-MM-DD",\n' +
            '  "description": "<1-2 sentence learning goals>",\n' +
            '  "standards": "<2-4 CCSS or NGSS standard codes>"\n' +
            '}]';

        try {
            const raw     = (await callAIText({ prompt: unitPrompt, tier: 'fast', maxTokens: 2048 })).replace(/```json|```/g,'').trim();

            const unitList = JSON.parse(raw);

            // Save units
            const batch = db.batch();
            const newUnits = [];
            unitList.forEach((u, idx) => {
                if (!u.name || !u.startDate || !u.endDate) return;
                const data = {
                    name:        u.name,
                    classId:     cls.id,
                    startDate:   u.startDate,
                    endDate:     u.endDate,
                    description: u.description || '',
                    standards:   u.standards   || '',
                    color:       UNIT_COLORS[(i * 3 + idx) % UNIT_COLORS.length],
                    docIds:      [],
                    updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
                };
                const ref = getYearPath().collection('units').doc();
                batch.set(ref, data);
                newUnits.push({ id: ref.id, ...data });
            });
            await batch.commit();
            newUnits.forEach(u => units.push(u));
            units.sort((a, b) => a.startDate.localeCompare(b.startDate));
            totalUnitsAdded += newUnits.length;

            // Pre-fill lesson stubs if requested
            if (prefillLessons && newUnits.length > 0) {
                setStatus(`(${i+1}/${selectedClasses.length}) Generating lesson stubs for <strong>${escHtml(cls.name)}</strong>…`);

                const lessonPrompt =
                    'You are generating weekly lesson title stubs for Grade ' + grade + ' class "' + cls.name + '".\n' +
                    (curriculum ? 'Curriculum: ' + curriculum + '\n' : '') +
                    '\nFor each unit below, generate ONE lesson title per school week (Mon–Fri, skip weekends).\n' +
                    'Keep titles short (5–8 words), specific to the unit topic, and sequenced logically.\n\n' +
                    'UNITS:\n' +
                    newUnits.map(u => '- ' + u.name + ' (' + u.startDate + ' to ' + u.endDate + '): ' + (u.description || '')).join('\n') +
                    '\n\nReturn ONLY compact JSON array:\n' +
                    '[{"date":"YYYY-MM-DD","title":"<lesson title>","unitName":"<unit name>"}]';

                const lRaw = (await callAIText({ prompt: lessonPrompt, tier: 'fast', maxTokens: 4096 })).replace(/```json|```/g,'').trim();
                {
                    const lList = JSON.parse(lRaw);

                    const lBatch  = db.batch();
                    const newLessons = [];

                    lList.forEach(l => {
                        if (!l.date || !l.title) return;
                        // Skip if lesson already exists for this class/date
                        if (lessons.some(ex => ex.date === l.date && ex.classId === cls.id)) return;
                        // Skip non-school days
                        const dow = new Date(l.date + 'T00:00:00').getDay();
                        if (dow === 0 || dow === 6 || isOffDay(l.date)) return;
                        const data = {
                            title:    l.title,
                            date:     l.date,
                            classId:  cls.id,
                            subject:  cls.subject || '',
                            duration: 45,
                            standards:'',
                            flow:     '',
                            materials:'',
                            activities:'',
                            attachments:[],
                            isStub:   true,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        const ref = getYearPath().collection('lessons').doc();
                        lBatch.set(ref, data);
                        newLessons.push({ id: ref.id, ...data });
                    });

                    await lBatch.commit();
                    newLessons.forEach(l => lessons.push(l));
                    lessons.sort((a, b) => a.date.localeCompare(b.date));
                    totalLessonsAdded += newLessons.length;
                }
            }

        } catch (e) {
            console.error('Curriculum generator error for', cls.name, e);
            setStatus(`⚠️ Error for ${escHtml(cls.name)}: ${escHtml(e.message)}`);
        }
    }

    // Re-render everything
    renderUnitMap();
    renderCalendar();
    renderWeek();

    if (btn) { btn.disabled = false; btn.textContent = '🤖 Generate Now'; }

    const summary = totalUnitsAdded + ' units added'
        + (prefillLessons ? ', ' + totalLessonsAdded + ' lesson stubs created' : '') + '.';
    setStatus('✅ Done! ' + summary + ' Switch to 🗺️ Unit Map to see the result.');
    showToast('✅ ' + summary);
}

