// ============================================================
// 📷 SCAN & IMPORT
// ============================================================

let _scanMode = 'schedule'; // 'schedule' | 'lessons'
let _scanBase64 = null;     // base64 string (no data: prefix)
let _scanMime   = 'image/jpeg';
let _scanItems  = [];       // extracted items from Claude

const SCAN_COLORS = [
    '#FF6B9D','#9D4EDD','#00D4FF','#FF8C42','#06D6A0',
    '#FFD93D','#4CC9F0','#52B788','#C77DFF','#F4A261'
];

function openScanModal(mode) {
    _scanMode = mode || 'schedule';
    _scanBase64 = null;
    _scanItems  = [];

    const title = document.getElementById('scan-modal-title');
    const instr = document.getElementById('scan-instructions');
    if (title) title.textContent = mode === 'schedule'
        ? '📅 Scan Weekly Schedule'
        : '📋 Scan Lesson Plans';
    if (instr) instr.textContent = mode === 'schedule'
        ? 'Upload a photo of your weekly schedule — handwritten, printed, or a whiteboard shot. Claude will extract class names, subjects, rooms, and time slots.'
        : 'Upload a photo of one or more lesson plan pages. Claude will extract lesson titles, dates, objectives, activities, and materials, and match them to your existing classes.';

    document.getElementById('scan-step-upload').classList.remove('hidden');
    document.getElementById('scan-step-review').classList.add('hidden');
    resetScanUpload();
    document.getElementById('scan-modal').classList.remove('hidden');
}

function closeScanModal() {
    document.getElementById('scan-modal').classList.add('hidden');
    _scanBase64 = null;
    _scanItems  = [];
}

function resetScanUpload() {
    _scanBase64 = null;
    document.getElementById('scan-file-input').value = '';
    document.getElementById('scan-preview-wrap').classList.add('hidden');
    document.getElementById('scan-preview-img').src = '';
    document.getElementById('scan-drop-zone').classList.remove('hidden');
    document.getElementById('scan-upload-status').textContent = '';
    document.getElementById('scan-analyse-btn').disabled = true;
}

function backToScanUpload() {
    document.getElementById('scan-step-review').classList.add('hidden');
    document.getElementById('scan-step-upload').classList.remove('hidden');
}

function onScanFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        document.getElementById('scan-upload-status').textContent = '⚠️ File too large — please use an image under 10 MB.';
        return;
    }
    _scanMime = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = ev => {
        const dataUrl = ev.target.result;
        // Strip the data:...;base64, prefix
        _scanBase64 = dataUrl.split(',')[1];
        const img = document.getElementById('scan-preview-img');
        img.src = dataUrl;
        document.getElementById('scan-preview-wrap').classList.remove('hidden');
        document.getElementById('scan-drop-zone').classList.add('hidden');
        document.getElementById('scan-upload-status').textContent = '';
        document.getElementById('scan-analyse-btn').disabled = false;
    };
    reader.readAsDataURL(file);
}

// Drag-and-drop on drop zone
(function() {
    const dz = document.getElementById('scan-drop-zone');
    if (!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const inp = document.getElementById('scan-file-input');
            const dt = new DataTransfer();
            dt.items.add(file);
            inp.files = dt.files;
            onScanFileSelected({ target: inp });
        }
    });
})();

async function runScanAnalysis() {
    if (!_scanBase64) return;
    if (!hasEffectiveAiKey()) { showToast('Add your AI API key in AI & Settings first.'); return; }

    const btn = document.getElementById('scan-analyse-btn');
    const statusEl = document.getElementById('scan-upload-status');
    btn.disabled = true;
    statusEl.innerHTML = '<span class="scan-spinner"></span> Claude is reading your image…';

    const prompt = _scanMode === 'schedule'
        ? `You are reading a teacher's weekly class schedule from an image. Extract every class/subject block you can see.

Return ONLY a JSON array. Each object must have:
{
  "name": "class name (e.g. BenchMark, Reading, Math)",
  "subject": "subject area or empty string",
  "room": "room name/number or empty string",
  "schedule": {
    "mon": [{"start":"HH:MM","end":"HH:MM"}],
    "tue": [...],
    "wed": [...],
    "thu": [...],
    "fri": [...]
  },
  "everyOtherWeek": false,
  "notes": "any extra notes or empty string"
}
Only include days the class actually appears. Use 24-hour HH:MM for times. If only one slot per day, the array has one object. If a class appears at two different times on the same day, include two objects in that day's array. Return [] if nothing found. NO markdown, NO explanation — JSON only.`

        : `You are reading a teacher's lesson plan page or pages from an image. Extract every lesson you can identify.

Return ONLY a JSON array. Each object must have:
{
  "className": "the class or subject this lesson belongs to (match to existing classes if possible)",
  "date": "YYYY-MM-DD or empty string if not readable",
  "title": "lesson title",
  "subject": "subject area or empty string",
  "standards": "standards or objectives or empty string",
  "flow": "lesson flow or procedure or empty string",
  "materials": "materials list or empty string",
  "activities": "activities description or empty string",
  "notes": "any other notes"
}
Return [] if nothing found. NO markdown, NO explanation — JSON only.`;

    try {
        const raw = (await callAIText({
            prompt,
            tier: 'quality',
            maxTokens: 4096,
            imageBase64: _scanBase64,
            imageMediaType: _scanMime
        })).replace(/```json|```/g, '').trim();

        let parsed;
        try { parsed = JSON.parse(raw); } catch(e) { throw new Error('Could not parse Claude\'s response. Try a clearer photo.'); }

        if (!Array.isArray(parsed) || parsed.length === 0) {
            statusEl.textContent = '⚠️ Claude couldn\'t find any items in this image. Try a clearer or closer photo.';
            btn.disabled = false;
            return;
        }

        _scanItems = parsed;
        statusEl.textContent = '';
        btn.disabled = false;
        showScanReview();

    } catch(err) {
        statusEl.textContent = '❌ ' + (err.message || 'Something went wrong. Please try again.');
        btn.disabled = false;
    }
}

function showScanReview() {
    // Copy image to review thumb
    const thumb = document.getElementById('scan-review-thumb');
    if (thumb) thumb.src = document.getElementById('scan-preview-img').src;

    document.getElementById('scan-step-upload').classList.add('hidden');
    document.getElementById('scan-step-review').classList.remove('hidden');

    const list = document.getElementById('scan-review-list');
    list.innerHTML = '';

    if (_scanMode === 'schedule') {
        _scanItems.forEach((item, idx) => {
            // Detect conflict with existing class name
            const existingMatch = classes.find(c => c.name.toLowerCase() === (item.name||'').toLowerCase());
            const conflictBadge = existingMatch
                ? '<span class="scan-conflict-badge">⚠️ class exists — will update</span>'
                : '';

            // Build schedule summary for display
            const DOW = ['mon','tue','wed','thu','fri'];
            const DOW_LABEL = {mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri'};
            const schedSummary = DOW.filter(d => item.schedule?.[d]?.length)
                .map(d => {
                    const slots = item.schedule[d];
                    const times = slots.map(s => (s.start||'') + (s.end ? '–'+s.end : '')).join(' & ');
                    return DOW_LABEL[d] + (times ? ' ' + times : '');
                }).join(', ');

            const colorIdx = idx % SCAN_COLORS.length;
            const color = SCAN_COLORS[colorIdx];

            const card = document.createElement('div');
            card.className = 'scan-review-card';
            card.dataset.idx = idx;
            card.innerHTML = `
                <input type="checkbox" class="scan-review-check" checked onchange="this.closest('.scan-review-card').classList.toggle('excluded',!this.checked)">
                <div class="scan-review-body">
                    <div class="scan-review-type">Class ${conflictBadge}</div>
                    <div class="scan-review-fields">
                        <div class="scan-review-row">
                            <span class="scan-review-label">Name</span>
                            <input class="scan-review-input" data-field="name" value="${escHtml(item.name||'')}" placeholder="Class name">
                            <input type="color" value="${color}" data-field="color" style="width:28px;height:28px;padding:2px;border:none;border-radius:4px;cursor:pointer;flex-shrink:0;" title="Pick color">
                        </div>
                        <div class="scan-review-row">
                            <span class="scan-review-label">Subject</span>
                            <input class="scan-review-input" data-field="subject" value="${escHtml(item.subject||'')}" placeholder="Subject">
                        </div>
                        <div class="scan-review-row">
                            <span class="scan-review-label">Room</span>
                            <input class="scan-review-input" data-field="room" value="${escHtml(item.room||'')}" placeholder="Room">
                        </div>
                        <div class="scan-review-row">
                            <span class="scan-review-label">Schedule</span>
                            <span style="font-size:0.75rem;color:var(--text-secondary);flex:1;">${escHtml(schedSummary||'No schedule detected')}</span>
                        </div>
                        ${item.notes ? `<div class="scan-review-row"><span class="scan-review-label">Notes</span><span style="font-size:0.75rem;color:var(--text-muted);flex:1;">${escHtml(item.notes)}</span></div>` : ''}
                    </div>
                </div>`;
            list.appendChild(card);
        });
    } else {
        // Lesson mode
        _scanItems.forEach((item, idx) => {
            // Try to match className to existing class
            const matchedCls = classes.find(c =>
                c.name.toLowerCase().includes((item.className||'').toLowerCase()) ||
                (item.className||'').toLowerCase().includes(c.name.toLowerCase())
            );
            const classOptions = `<option value="">— unassigned —</option>`
                + classes.map(c => `<option value="${c.id}" ${matchedCls?.id === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('');

            const card = document.createElement('div');
            card.className = 'scan-review-card';
            card.dataset.idx = idx;
            card.innerHTML = `
                <input type="checkbox" class="scan-review-check" checked onchange="this.closest('.scan-review-card').classList.toggle('excluded',!this.checked)">
                <div class="scan-review-body">
                    <div class="scan-review-type">Lesson</div>
                    <div class="scan-review-fields">
                        <div class="scan-review-row">
                            <span class="scan-review-label">Title</span>
                            <input class="scan-review-input" data-field="title" value="${escHtml(item.title||'')}" placeholder="Lesson title">
                        </div>
                        <div class="scan-review-row">
                            <span class="scan-review-label">Class</span>
                            <select class="scan-review-input" data-field="classId" style="padding:3px 5px;">${classOptions}</select>
                        </div>
                        <div class="scan-review-row">
                            <span class="scan-review-label">Date</span>
                            <input class="scan-review-input" data-field="date" type="date" value="${item.date||''}" style="width:140px;">
                        </div>
                        ${item.standards ? `<div class="scan-review-row"><span class="scan-review-label">Standards</span><input class="scan-review-input" data-field="standards" value="${escHtml(item.standards)}"></div>` : ''}
                        ${item.materials ? `<div class="scan-review-row"><span class="scan-review-label">Materials</span><input class="scan-review-input" data-field="materials" value="${escHtml(item.materials)}"></div>` : ''}
                        ${item.activities ? `<div class="scan-review-row"><span class="scan-review-label">Activities</span><input class="scan-review-input" data-field="activities" value="${escHtml(item.activities)}"></div>` : ''}
                        ${item.flow ? `<div class="scan-review-row"><span class="scan-review-label">Flow</span><input class="scan-review-input" data-field="flow" value="${escHtml(item.flow)}"></div>` : ''}
                    </div>
                </div>`;
            list.appendChild(card);
        });
    }

    const count = _scanItems.length;
    document.getElementById('scan-review-status').textContent =
        `Found ${count} item${count !== 1 ? 's' : ''} — review and edit before importing.`;
    document.getElementById('scan-import-btn').textContent =
        `✓ Import ${count} item${count !== 1 ? 's' : ''}`;
}

function escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// For a value passed as an argument inside an inline on*="..." handler.
// HTML-escaping alone is not enough there: the browser decodes &#39; back
// to ' before the JS runs. JSON.stringify makes a valid JS string literal,
// then escHtml makes it safe inside the double-quoted attribute.
function jsArg(v) { return escHtml(JSON.stringify(v === null || v === undefined ? '' : String(v))); }
// Only allow image URLs we expect (https or an inline data: image).
function safeImgUrl(u) {
    const v = String(u || '').trim();
    return /^https:\/\//i.test(v) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v) ? v : '';
}

async function executeScanImport() {
    const cards = document.querySelectorAll('#scan-review-list .scan-review-card');
    const statusEl = document.getElementById('scan-review-status');
    const importBtn = document.getElementById('scan-import-btn');

    // Collect current values from the review cards
    const items = [];
    cards.forEach(card => {
        const checked = card.querySelector('.scan-review-check')?.checked;
        if (!checked) return;
        const idx = parseInt(card.dataset.idx);
        const original = _scanItems[idx];
        const fields = {};
        card.querySelectorAll('[data-field]').forEach(el => {
            fields[el.dataset.field] = el.value.trim();
        });
        // Color picker (schedule mode)
        const colorPicker = card.querySelector('input[type="color"]');
        if (colorPicker) fields.color = colorPicker.value;
        items.push({ original, fields });
    });

    if (items.length === 0) { showToast('Nothing selected to import.'); return; }

    importBtn.disabled = true;
    statusEl.innerHTML = '<span class="scan-spinner"></span> Saving…';

    try {
        const yearPath = getYearPath();
        let created = 0;
        let updated = 0;

        if (_scanMode === 'schedule') {
            for (const { original, fields } of items) {
                const name = fields.name || original.name || 'Untitled Class';
                // Build schedule from original (schedule editing happens in class modal, not here)
                const schedule = {};
                const DOW = ['mon','tue','wed','thu','fri'];
                DOW.forEach(d => {
                    const slots = original.schedule?.[d];
                    if (!slots || slots.length === 0) return;
                    if (slots.length === 1) {
                        schedule[d] = { start: slots[0].start || '', end: slots[0].end || '' };
                    } else {
                        schedule[d] = slots.map(s => ({ start: s.start || '', end: s.end || '' }));
                    }
                });

                const classData = {
                    name,
                    subject: fields.subject || original.subject || '',
                    room:    fields.room    || original.room    || '',
                    color:   fields.color  || SCAN_COLORS[0],
                    curriculum: '',
                    schedule,
                    everyOtherWeek: original.everyOtherWeek || false,
                    startingWeek: null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // Check for existing class with same name — update instead of duplicate
                const existing = classes.find(c => c.name.toLowerCase() === name.toLowerCase());
                if (existing) {
                    // v6.2.0: only update what the scan produced. This used to
                    // blank the class's curriculum and starting week and
                    // overwrite its colour, subject and room with defaults.
                    const upd = {
                        name,
                        subject: fields.subject || original.subject || existing.subject || '',
                        room:    fields.room    || original.room    || existing.room    || '',
                        color:   fields.color   || existing.color   || SCAN_COLORS[0],
                        schedule,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (original.everyOtherWeek) upd.everyOtherWeek = true;
                    await yearPath.collection('classes').doc(existing.id).update(upd);
                    const i = classes.findIndex(c => c.id === existing.id);
                    if (i >= 0) classes[i] = { ...classes[i], ...upd };
                    updated++;
                } else {
                    classData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const ref = await yearPath.collection('classes').add(classData);
                    classes.push({ id: ref.id, ...classData });
                    created++;
                }
            }

            renderClasses();
            renderCalendar();
            renderWeek();
            updateClassDropdown();
            const msg = [created && `${created} class${created>1?'es':''} created`, updated && `${updated} updated`].filter(Boolean).join(', ');
            statusEl.textContent = `✅ Done — ${msg}!`;
            showToast(`📷 Scan imported: ${msg}`);

        } else {
            // Lesson mode
            for (const { original, fields } of items) {
                const title = fields.title || original.title || 'Untitled Lesson';
                const classId = fields.classId || null;
                const date = fields.date || formatDate(new Date());
                if (!date) continue;

                const lessonData = {
                    title,
                    date,
                    classId,
                    slotIndex: 0,
                    subject:    fields.subject    || original.subject    || '',
                    standards:  fields.standards  || original.standards  || '',
                    flow:       fields.flow        || original.flow        || '',
                    materials:  fields.materials  || original.materials  || '',
                    activities: fields.activities || original.activities || '',
                    duration: 45,
                    attachments: [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                const ref = await yearPath.collection('lessons').add(lessonData);
                lessons.push({ id: ref.id, ...lessonData });
                created++;
            }

            renderCalendar();
            renderWeek();
            statusEl.textContent = `✅ ${created} lesson${created>1?'s':''} imported!`;
            showToast(`📷 Scan imported ${created} lesson${created>1?'s':''}`);
        }

        importBtn.disabled = false;
        setTimeout(() => closeScanModal(), 1800);

    } catch(err) {
        console.error('Scan import error:', err);
        statusEl.textContent = '❌ Import failed: ' + (err.message || 'Unknown error');
        importBtn.disabled = false;
    }
}


