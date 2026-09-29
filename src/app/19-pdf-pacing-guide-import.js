// ============================================
// PDF PACING GUIDE IMPORT (AI-parsed)
// ============================================
// District pacing guides (e.g. TUSD's dated "Pacing Guide" PDFs) are laid out
// as a weekly Mon-Fri calendar grid, not a table. Reading the PDF with plain
// left-to-right text extraction destroys that structure, so this groups text
// items by vertical position first (like pdftotext -layout) to rebuild
// readable rows before handing the text to Claude.
async function extractPdfTextGridLayout(file, maxChars = 30000) {
    await Promise.all([ensureLib('pdfjs')]);
    try {
        const ab = await readFileAsArrayBuffer(file);
        if (!ab) return '';
        if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js library not loaded');
        initPdfWorker();

        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab), isEvalSupported: false }).promise;
        let fullText = '';
        const maxPages = Math.min(pdf.numPages, 20);

        for (let p = 1; p <= maxPages; p++) {
            const page = await pdf.getPage(p);
            const textContent = await page.getTextContent();

            // Bucket text items into lines by rounded Y position (a few pts of
            // tolerance handles baseline jitter within the same visual row).
            const lineBuckets = [];
            for (const item of textContent.items) {
                if (!item.str || !item.str.trim()) continue;
                const y = item.transform[5];
                let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= 3);
                if (!bucket) {
                    bucket = { y, items: [] };
                    lineBuckets.push(bucket);
                }
                bucket.items.push({ x: item.transform[4], str: item.str });
            }

            lineBuckets.sort((a, b) => b.y - a.y); // top of page first
            for (const bucket of lineBuckets) {
                bucket.items.sort((a, b) => a.x - b.x);
                const lineText = bucket.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
                if (lineText) fullText += lineText + '\n';
            }
            fullText += '\n';
        }

        return fullText.trim().substring(0, maxChars);
    } catch (e) {
        console.warn('Pacing PDF grid extraction failed for', file.name, e);
        return '';
    }
}

// Sends extracted pacing-guide PDF text to Claude and asks for structured
// {date, title, topic, standards, subject} entries. Tuned to the two TUSD
// pacing guide formats seen in practice: Eureka Math ("M1 Lesson 5") and
// Benchmark Advance ELA ("Unit 3 Week 1 Day 2") -- but written generically
// enough to handle other district pacing calendars too.
async function parsePacingCalendarWithAI(rawText, subjectHint) {
    const schoolYear = settings.schoolYear || '2025-2026';
    const [startYear, endYear] = schoolYear.split('-');
    const trimmedText = rawText.substring(0, 30000);

    const prompt = `You are extracting a day-by-day lesson pacing calendar from a school district's pacing guide PDF. The text below was extracted from a weekly Monday-Friday calendar grid, so lines may run several date-columns together -- use the surrounding context (date headers, unit/topic headers that span the week, "Day N" labels, standards codes) to work out which content belongs under which date.

School year: ${schoolYear} (${startYear}-${endYear})
Rules:
- Months Aug-Dec belong to year ${startYear}; months Jan-Jul belong to year ${endYear}.
- Subject for this pacing guide: ${subjectHint || 'not specified - infer it from the title and standards code prefixes (OA/NBT/MD/G = Math; RL/RI/RF/W/SL/L = ELA/Reading/Writing)'}.
- For every calendar date that has an actual instructional assignment, output one entry.
- Use the lesson identifier EXACTLY as it appears in the source text as "title":
  - Eureka Math style: combine the module and lesson number, e.g. "M1 Lesson 5".
  - Benchmark Advance style: combine the Unit number, the Week number (from the section header spanning that week), and the Day number under the date, e.g. "Unit 3 Week 1 Day 2".
  - If neither pattern applies, use whatever label is shown (e.g. "Module 1 Assessment", "Unit 3 BA Assessment", "Review and Routines", "Topic A Ticket").
- If a date cell lists two day numbers together (e.g. "Day 2 & 3"), output TWO entries for that date, one per day number.
- SKIP non-instructional days entirely: "NO SCHOOL"/"No School" + a holiday name, "Grading Day", "No Students" (with no lesson also listed), "Professional Learning Day" (when that's the only thing in the cell), and multi-day breaks (Fall/Winter/Spring/Rodeo/Thanksgiving Break). Those are days off, not lessons.
- "topic" = the unit/topic name shown for that week, if any (e.g. "Unit 3: Plants and Animals Grow and Change" or "Module 1 Topic A: Count and Compare with Data").
- "standards" = any standard codes listed under that date, comma-separated, if present.
- "subject" = your best guess: Math, ELA, Science, or Social Studies.

Return ONLY a JSON array, no markdown, no explanation. Each object:
{"date": "YYYY-MM-DD", "title": "...", "topic": "...", "standards": "...", "subject": "..."}

PACING GUIDE TEXT:
${trimmedText}`;

    const text = (await callAIText({ prompt, tier: 'quality', maxTokens: 16000 })).replace(/```json|```/g, '').trim();


    // A full school year of dated pacing entries can be large enough to hit the
    // response's max_tokens limit, which cuts the JSON off mid-object. Rather than
    // failing the whole import, salvage every complete {...} entry that was
    // returned before the cutoff (these entries have no nested braces, so a plain
    // regex match is reliable) and warn if anything had to be dropped.
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        const matches = text.match(/\{[^{}]*\}/g);
        let repaired = null;
        if (matches && matches.length > 0) {
            try {
                repaired = JSON.parse('[' + matches.join(',') + ']');
            } catch (e2) {
                repaired = null;
            }
        }
        if (repaired && repaired.length > 0) {
            console.warn(`Pacing PDF response was truncated - recovered ${repaired.length} entries before the cutoff.`);
            showToast(`⚠️ Claude's response was cut off - recovered ${repaired.length} dates, but some may be missing. Try again or split the PDF by quarter if dates look incomplete.`);
            parsed = repaired;
        } else {
            throw new Error('Claude returned invalid JSON: ' + text.substring(0, 200));
        }
    }

    if (!Array.isArray(parsed)) throw new Error('Expected JSON array from Claude');

    return parsed
        .filter(item => item.date && item.title)
        .map(item => ({
            date: item.date,
            title: item.title,
            normalizedTitle: normalizeLessonName(item.title),
            topic: item.topic || '',
            standards: item.standards || '',
            subject: item.subject || subjectHint || 'Math'
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// Handle Smart Pacing upload -- JSON (structured) or PDF (AI-parsed)
async function handleSmartPacingUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    document.getElementById('smart-pacing-filename').textContent = file.name;

    if (isPdf) {
        if (!hasEffectiveAiKey()) {
            showToast('PDF pacing guides need an AI API key -- add one under Settings > AI Provider & API Key, or use a JSON pacing calendar instead.');
            e.target.value = '';
            return;
        }

        showLoading();
        document.querySelector('.loading-text').textContent = 'Reading PDF pacing guide...';

        try {
            const rawText = await extractPdfTextGridLayout(file);
            if (!rawText) throw new Error('Could not read any text from this PDF');

            document.querySelector('.loading-text').textContent = 'Asking Claude to map out the calendar...';

            const classId = document.getElementById('smart-import-class').value;
            const cls = classes.find(c => c.id === classId);
            const subjectHint = cls?.subject || '';

            const aiEntries = await parsePacingCalendarWithAI(rawText, subjectHint);

            hideLoading();

            if (aiEntries.length === 0) {
                showToast('No dated lessons found. Make sure this is the dated Pacing Guide (weekly calendar grid) and not the curriculum framework/standards document.');
                e.target.value = '';
                return;
            }

            smartPacingData = aiEntries;
            displaySmartPacingPreview();
            updateSmartMatchButton();
            showToast(`✅ Loaded ${smartPacingData.length} dates from pacing guide (AI-parsed PDF)`);

        } catch (error) {
            hideLoading();
            console.error('Smart pacing PDF error:', error);
            showToast('Error reading PDF: ' + error.message);
        }

        e.target.value = '';
        return;
    }

    // JSON path
    showLoading();
    document.querySelector('.loading-text').textContent = 'Reading pacing calendar...';

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!Array.isArray(data)) {
            throw new Error('JSON must be an array');
        }

        // Extract pacing data
        smartPacingData = data.filter(item => item.date && item.title).map(item => ({
            date: item.date,
            title: item.title,
            normalizedTitle: normalizeLessonName(item.title),
            topic: item.topic || '',
            standards: item.standards || '',
            subject: item.subject || 'Math'
        }));

        hideLoading();

        if (smartPacingData.length === 0) {
            showToast('No valid pacing data found');
            return;
        }

        // Display preview
        displaySmartPacingPreview();
        updateSmartMatchButton();
        showToast(`✅ Loaded ${smartPacingData.length} dates from pacing calendar`);

    } catch (error) {
        hideLoading();
        console.error('Smart pacing JSON error:', error);
        showToast('Error reading JSON: ' + error.message);
    }

    e.target.value = '';
}

// Find a header (case-insensitive) matching one of the given aliases.
// Tries an exact match first, then falls back to a substring match, so a
// header like "Lesson Number" still matches the alias "lesson number" and
// "Lesson #" matches "lesson #". `headers` is expected to already be
// lowercased; aliases should be lowercase too.
// Read an .xlsx/.xls file (via SheetJS) into an array of row objects keyed by
// the header row - e.g. [{ "Module": 1, "Lesson #": 5, "Title": "..." }, ...].
// Used by the Smart Import Excel Lesson Library uploaders.
async function readExcelFile(file) {
    await Promise.all([ensureLib('xlsx')]);
    const buf = await file.arrayBuffer();
    if (!window.XLSX) {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

// Splits a legacy combined "standards" text block (which may have Learning Target /
// Success Criteria / Key Vocabulary stacked in as labeled sections from older imports)
// back out into separate pieces for display. Lessons imported after v5.6.4 store these
// in their own dedicated fields already, so this is purely a fallback for old data.
function splitStandardsBlock(text) {
    const result = { standards: text || '', learningTarget: '', successCriteria: '', vocabulary: '' };
    if (!text) return result;

    const labels = [
        { key: 'learningTarget', re: /\n\nLearning Target:\n/ },
        { key: 'successCriteria', re: /\n\nSuccess Criteria:\n/ },
        { key: 'vocabulary', re: /\n\nKey Vocabulary:\n/ }
    ];

    // Find earliest label match to know where the base "standards" text ends
    let cut = text.length;
    const found = [];
    for (const { key, re } of labels) {
        const m = text.match(re);
        if (m) {
            found.push({ key, index: m.index, contentStart: m.index + m[0].length });
            cut = Math.min(cut, m.index);
        }
    }
    if (found.length === 0) return result;

    found.sort((a, b) => a.index - b.index);
    result.standards = text.substring(0, cut).trim();
    for (let i = 0; i < found.length; i++) {
        const start = found[i].contentStart;
        const end = (i + 1 < found.length) ? found[i + 1].index : text.length;
        result[found[i].key] = text.substring(start, end).trim();
    }
    return result;
}

function findColumn(headers, aliases) {
    for (const alias of aliases) {
        const exact = headers.find(h => h === alias);
        if (exact) return exact;
    }
    for (const alias of aliases) {
        const partial = headers.find(h => h.includes(alias));
        if (partial) return partial;
    }
    return null;
}

// Handle Smart Lessons Excel upload
async function handleSmartLessonsUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    document.getElementById('smart-lessons-filename').textContent = file.name;
    showLoading();
    document.querySelector('.loading-text').textContent = 'Reading lesson library...';
    
    try {
        const data = await readExcelFile(file);
        
        if (!data || data.length === 0) {
            throw new Error('No data found in Excel file');
        }
        
        // Find columns
        const headers = Object.keys(data[0]).map(h => h.toLowerCase());
        const headerKeys = Object.keys(data[0]);
        
        // Detect format: Eureka Math (Module + Lesson #) OR Benchmark (Unit + Week + Day)
        let moduleCol = findColumn(headers, ['module', 'mod']);
        let lessonNumCol = findColumn(headers, ['lesson #', 'lesson number', 'lesson num']);
        let unitCol = findColumn(headers, ['unit']);
        let weekCol = findColumn(headers, ['week']);
        let dayCol = findColumn(headers, ['day']);
        
        // Other common columns
        let titleCol = findColumn(headers, ['title', 'primary skill', 'skill']);
        let objectivesCol = findColumn(headers, ['learning target', 'learning targets', 'objectives', 'i can', 'objective']);
        let successCriteriaCol = findColumn(headers, ['success criteria', 'success criterion', 'criteria for success']);
        let vocabularyCol = findColumn(headers, ['key vocabulary', 'vocabulary', 'vocab']);
        let standardsCol = findColumn(headers, ['standard', 'standards']);
        let materialsCol = findColumn(headers, ['material', 'materials']);
        let flowCol = findColumn(headers, ['lesson flow', 'flow']);
        let notesCol = findColumn(headers, ['activities & notes', 'activities', 'notes']);
        
        const getCol = (col) => col ? headerKeys.find(k => k.toLowerCase() === col) : null;
        
        const actualModuleCol = getCol(moduleCol);
        const actualLessonNumCol = getCol(lessonNumCol);
        const actualUnitCol = getCol(unitCol);
        const actualWeekCol = getCol(weekCol);
        const actualDayCol = getCol(dayCol);
        const actualTitleCol = getCol(titleCol);
        const actualObjectivesCol = getCol(objectivesCol);
        const actualSuccessCriteriaCol = getCol(successCriteriaCol);
        const actualVocabularyCol = getCol(vocabularyCol);
        const actualStandardsCol = getCol(standardsCol);
        const actualMaterialsCol = getCol(materialsCol);
        const actualFlowCol = getCol(flowCol);
        const actualNotesCol = getCol(notesCol);
        
        // Determine format
        const isEurekaFormat = actualModuleCol && actualLessonNumCol;
        const isBenchmarkFormat = actualUnitCol && actualWeekCol && actualDayCol;
        
        if (!isEurekaFormat && !isBenchmarkFormat) {
            throw new Error('Could not detect Excel format. Need Module+Lesson# or Unit+Week+Day columns.');
        }
        
        // Extract lesson library
        smartLessonLibrary = [];
        
        for (const row of data) {
            let lessonId;
            
            if (isEurekaFormat) {
                // Eureka Math format: "M1 Lesson 5"
                const moduleVal = row[actualModuleCol];
                const lessonNumVal = row[actualLessonNumCol];
                if (!moduleVal || !lessonNumVal) continue;
                lessonId = `M${moduleVal} Lesson ${lessonNumVal}`;
            } else if (isBenchmarkFormat) {
                // Benchmark format: "Unit 1 Week 2 Day 3"
                const unitVal = row[actualUnitCol];
                const weekVal = row[actualWeekCol];
                const dayVal = row[actualDayCol];
                if (unitVal === undefined || weekVal === undefined || dayVal === undefined) continue;
                lessonId = `Unit ${unitVal} Week ${weekVal} Day ${dayVal}`;
            }
            
            // Standards stays its own field; Learning Target and Success Criteria get their
            // own dedicated fields. Key Vocabulary (no dedicated schema field) is folded
            // into the standards text block as a labeled section.
            let standardsText = actualStandardsCol ? String(row[actualStandardsCol] || '').trim() : '';
            const learningTargetText = actualObjectivesCol ? String(row[actualObjectivesCol] || '').trim() : '';
            const successCriteriaText = actualSuccessCriteriaCol ? String(row[actualSuccessCriteriaCol] || '').trim() : '';
            if (actualVocabularyCol) {
                const vocabulary = String(row[actualVocabularyCol] || '').trim();
                if (vocabulary) {
                    standardsText = standardsText ? `${standardsText}\n\nKey Vocabulary:\n${vocabulary}` : `Key Vocabulary:\n${vocabulary}`;
                }
            }

            smartLessonLibrary.push({
                lessonId: lessonId,
                normalizedId: normalizeLessonName(lessonId),
                title: actualTitleCol ? String(row[actualTitleCol] || '').trim() : '',
                standards: standardsText,
                learningTarget: learningTargetText,
                successCriteria: successCriteriaText,
                materials: actualMaterialsCol ? String(row[actualMaterialsCol] || '').trim() : '',
                flow: actualFlowCol ? String(row[actualFlowCol] || '').trim() : '',
                notes: actualNotesCol ? String(row[actualNotesCol] || '').trim() : ''
            });
        }
        
        hideLoading();
        
        if (smartLessonLibrary.length === 0) {
            showToast('No valid lesson data found');
            return;
        }
        
        // Display preview
        displaySmartLessonsPreview();
        updateSmartMatchButton();
        showToast(`✅ Loaded ${smartLessonLibrary.length} lessons from library`);
        
    } catch (error) {
        hideLoading();
        console.error('Smart lessons Excel error:', error);
        showToast('Error reading Excel: ' + error.message);
    }
    
    e.target.value = '';
}

// Display Smart Pacing preview
function displaySmartPacingPreview() {
    const container = document.getElementById('smart-pacing-preview-list');
    const preview = document.getElementById('smart-pacing-preview');
    const summary = document.getElementById('smart-pacing-summary');
    
    const previewEntries = smartPacingData.slice(0, 8);
    
    container.innerHTML = previewEntries.map(entry => `
        <div class="import-event-item">
            <span class="import-event-date">${formatDisplayDateShort(entry.date)}</span>
            <span class="import-event-title">${entry.title}</span>
        </div>
    `).join('');
    
    if (smartPacingData.length > 8) {
        container.innerHTML += `<p style="color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem;">...and ${smartPacingData.length - 8} more dates</p>`;
    }
    
    const firstDate = smartPacingData[0]?.date;
    const lastDate = smartPacingData[smartPacingData.length - 1]?.date;
    summary.innerHTML = `<strong>${smartPacingData.length}</strong> dates: ${formatDisplayDateShort(firstDate)} → ${formatDisplayDateShort(lastDate)}`;
    
    preview.classList.remove('hidden');
}

// Display Smart Lessons preview
function displaySmartLessonsPreview() {
    const container = document.getElementById('smart-lessons-preview-list');
    const preview = document.getElementById('smart-lessons-preview');
    const summary = document.getElementById('smart-lessons-summary');
    
    const previewLessons = smartLessonLibrary.slice(0, 8);
    
    container.innerHTML = previewLessons.map(lesson => `
        <div class="import-event-item">
            <span class="import-event-title" style="flex: 1;">${lesson.lessonId}</span>
            <span class="import-event-meta" style="color: var(--text-muted); font-size: 0.7rem;">${escHtml(lesson.title.substring(0, 25))}${lesson.title.length > 25 ? '...' : ''}</span>
        </div>
    `).join('');
    
    if (smartLessonLibrary.length > 8) {
        container.innerHTML += `<p style="color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem;">...and ${smartLessonLibrary.length - 8} more lessons</p>`;
    }
    
    summary.innerHTML = `<strong>${smartLessonLibrary.length}</strong> lessons in library`;
    
    preview.classList.remove('hidden');
}

// Update Smart Match button state
function updateSmartMatchButton() {
    const matchBtn = document.getElementById('smart-match-btn');
    if (matchBtn) {
        matchBtn.disabled = !(smartPacingData.length > 0 && smartLessonLibrary.length > 0);
    }
}

// Extracts a loose (unit, day) key from a lesson-ID-like string, ignoring any
// "Week" number in between. Only meaningful for Unit 0 (Launch/Foundations
// placeholder units), where Day is a globally unique running count 1-N.
// Regular numbered units reset Day to 1-5 each week, so Unit+Day alone is NOT
// a safe unique key there - this fallback deliberately only applies to Unit 0
// to avoid mismatching a real unit's Week 2 Day 3 with its own Week 1 Day 3.
function extractUnitDayKey(str) {
    if (!str) return null;
    const nums = (String(str).match(/\d+/g) || []).map(Number);
    if (nums.length >= 2 && nums[0] === 0) {
        return `${nums[0]}_${nums[nums.length - 1]}`;
    }
    return null;
}

// Some pacing calendars reuse one generic label (e.g. "Review and Routines") on
// several non-consecutive dates instead of giving each occurrence a unique
// title. There's no way to uniquely match those to one specific library row,
// so instead we cycle through the Module/Unit 0 routine rows round-robin,
// giving each occurrence a different routine lesson instead of failing to match.
function isGenericRoutineTitle(title) {
    return !!title && /routine/i.test(title);
}

// Pulls a "unit" grouping key + a reasonable fallback display name out of a
// pacing lessonId, so Smart Import can auto-populate the Unit Map without
// requiring a separate units file. Handles both id formats produced by the
// library parser: Benchmark-style ("Unit X Week Y Day Z") and Eureka-style
// ("M<module> Lesson <n>").
function extractUnitGroupKey(lessonId) {
    if (!lessonId) return null;
    const str = String(lessonId).trim();

    let m = str.match(/^Unit\s+(.+?)\s+Week\s+(.+?)\s+Day\s+(.+)$/i);
    if (m) {
        const unitRaw = m[1].trim();
        const fallbackName = /^\d+$/.test(unitRaw) ? `Unit ${unitRaw}` : unitRaw;
        return { key: `unit:${unitRaw}`, fallbackName, weekRaw: m[2].trim(), dayRaw: m[3].trim() };
    }
    m = str.match(/^M(\S+)\s+Lesson\s+(.+)$/i);
    if (m) {
        return { key: `module:${m[1].trim()}`, fallbackName: `Module ${m[1].trim()}`, weekRaw: null, dayRaw: m[2].trim() };
    }

    // Looser fallbacks for pacing entries that don't fit either strict
    // pattern -- AI-parsed pacing guides can also emit labels like
    // "Unit 3 BA Assessment" or "Module 1 Topic A: ..." when the source PDF
    // doesn't cleanly break into Week/Day or Lesson# columns. Group by
    // whichever Unit/Module token leads the id rather than dropping these
    // lessons out of the Unit Map entirely.
    m = str.match(/^Unit\s+(\S+)/i);
    if (m) {
        const unitRaw = m[1].replace(/[:,]$/, '');
        return { key: `unit:${unitRaw}`, fallbackName: `Unit ${unitRaw}`, weekRaw: null, dayRaw: null };
    }
    m = str.match(/^Module\s+(\S+)/i);
    if (m) {
        const modRaw = m[1].replace(/[:,]$/, '');
        return { key: `module:${modRaw}`, fallbackName: `Module ${modRaw}`, weekRaw: null, dayRaw: null };
    }

    // Last resort: some libraries (RISE, CharacterStrong, FOSS Science) and
    // round-robin-matched "routine" pacing entries carry a curriculumRef
    // that's just the bare topic/unit name repeated across every day in that
    // unit (e.g. "Kindness Kickoff", "Sound and Light", "Review and
    // Routines") with no Unit/Module prefix at all. That string IS already a
    // perfectly good unit name, so group and name the unit by it directly
    // rather than dropping these lessons out of the Unit Map.
    if (str.length > 0) {
        return { key: `raw:${str.toLowerCase()}`, fallbackName: str, weekRaw: null, dayRaw: null };
    }

    return null;
}

// Converts a Week/Day pair into a single increasing number so a run of
// lessons can be checked for whether it's progressing forward (Week 1 Day 1,
// Week 1 Day 2, Week 2 Day 1...) or has jumped back to the start -- the
// tell-tale sign of a repeating rotation template (PE's 6-week rotation,
// RISE's per-group cycle) starting over. Returns null when Week/Day aren't
// plain numbers, so non-numeric labels never trigger a false split.
function computeSeqIndex(weekRaw, dayRaw) {
    const w = parseInt(weekRaw, 10);
    const d = parseInt(dayRaw, 10);
    if (Number.isNaN(w) || Number.isNaN(d)) return null;
    return w * 1000 + d;
}

// Splits one unit-key's lessons into separate contiguous "runs" -- one per
// actual scheduled block -- instead of collapsing every occurrence into a
// single min-to-max span. This is what turns something like "PE Rotation
// (Repeat Every 6 Weeks)" from one giant bar spanning the whole year into
// one bar per real 6-week rotation, and "RISE Cycle 1 (Repeat for Each New
// Group/Cycle)" into one bar per group's actual cycle.
//
// A new run starts whenever either signal fires:
//   - a real gap in the calendar (no lesson in this group for GAP_DAYS+), or
//   - the Week/Day sequence goes backward or repeats (Week 1 Day 1 again
//     after having already reached a later Week/Day) -- this catches
//     back-to-back rotations that repeat with zero calendar gap.
function splitLessonsIntoRuns(entries) {
    const GAP_DAYS = 21;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const runs = [];
    let current = [];
    let prevIndex = null;
    let prevDate = null;

    sorted.forEach(entry => {
        const idx = computeSeqIndex(entry.weekRaw, entry.dayRaw);
        const gapDays = prevDate
            ? (new Date(entry.date + 'T00:00:00') - new Date(prevDate + 'T00:00:00')) / 86400000
            : 0;
        const isNewRun = current.length > 0 && (
            gapDays > GAP_DAYS ||
            (idx !== null && prevIndex !== null && idx <= prevIndex)
        );
        if (isNewRun) {
            runs.push(current);
            current = [];
        }
        current.push(entry);
        if (idx !== null) prevIndex = idx;
        prevDate = entry.date;
    });
    if (current.length > 0) runs.push(current);
    return runs;
}

// Groups a batch of just-imported lessons by unit and creates/extends the
// matching Unit Map entries so units fill in automatically as pacing
// calendars are imported, instead of requiring separate manual entry.
async function syncUnitsFromImportedLessons(importedLessons, classId) {
    if (!importedLessons || importedLessons.length === 0) return 0;

    const groups = new Map();
    for (const lesson of importedLessons) {
        const info = extractUnitGroupKey(lesson.curriculumRef || lesson.title);
        if (!info) continue;
        if (!groups.has(info.key)) {
            groups.set(info.key, { fallbackName: info.fallbackName, entries: [] });
        }
        // lesson.title is "<lessonId>: <lessonTitle>" or just "<lessonId>" --
        // strip the id prefix so repeated theme titles (e.g. ELA/CharacterStrong/
        // FOSS, which repeat the same unit theme as every row's title) can be
        // detected and reused as a friendlier unit name.
        const bare = lesson.title.includes(': ') ? lesson.title.split(': ').slice(1).join(': ') : '';
        groups.get(info.key).entries.push({
            date: lesson.date,
            title: bare,
            weekRaw: info.weekRaw,
            dayRaw: info.dayRaw
        });
    }

    if (groups.size === 0) return 0;

    let unitIdx = units.filter(u => u.classId === classId).length;
    let created = 0;
    const GAP_DAYS = 21;
    const claimedIds = new Set(); // prevents two runs in this call from matching the same existing unit

    for (const [, g] of groups) {
        // Friendlier display name: if most entries for this unit key share the
        // same descriptive title, use that instead of the raw Unit/Module id.
        let name = g.fallbackName;
        const titledEntries = g.entries.filter(e => e.title);
        if (titledEntries.length > 0) {
            const counts = new Map();
            titledEntries.forEach(e => counts.set(e.title, (counts.get(e.title) || 0) + 1));
            const [topTitle, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
            if (topCount > titledEntries.length / 2) name = topTitle;
        }

        const runs = splitLessonsIntoRuns(g.entries);

        for (const run of runs) {
            const dates = run.map(e => e.date);
            const minDate = dates.reduce((a, b) => (b < a ? b : a));
            const maxDate = dates.reduce((a, b) => (b > a ? b : a));

            // Multiple units can now legitimately share a name (one per
            // rotation/cycle), so match this run to an existing unit by name
            // AND actual date-range overlap -- NOT proximity. Runs from
            // splitLessonsIntoRuns are deliberately back-to-back with only a
            // few days between rotations, so a proximity pad here (as big as
            // or bigger than that gap) would immediately re-merge adjacent
            // runs back into one unit within this same sync call, undoing
            // the split. Requiring real overlap only matches a run against
            // its own previously-saved unit from an earlier sync (e.g. when
            // more lessons get added later to the same rotation), never a
            // neighboring rotation. claimedIds guards against two runs in
            // the same call matching the same existing unit.
            const existing = units.find(u => {
                if (u.classId !== classId) return false;
                if (claimedIds.has(u.id)) return false;
                if ((u.name || '').trim().toLowerCase() !== name.trim().toLowerCase()) return false;
                if (!u.startDate || !u.endDate) return false;
                const uStart = new Date(u.startDate + 'T00:00:00').getTime();
                const uEnd = new Date(u.endDate + 'T00:00:00').getTime();
                const rStart = new Date(minDate + 'T00:00:00').getTime();
                const rEnd = new Date(maxDate + 'T00:00:00').getTime();
                return rStart <= uEnd && rEnd >= uStart;
            });
            if (existing) claimedIds.add(existing.id);

            try {
                if (existing) {
                    const newStart = existing.startDate && existing.startDate < minDate ? existing.startDate : minDate;
                    const newEnd   = existing.endDate && existing.endDate > maxDate ? existing.endDate : maxDate;
                    if (newStart !== existing.startDate || newEnd !== existing.endDate) {
                        await getYearPath().collection('units').doc(existing.id).update({ startDate: newStart, endDate: newEnd });
                        existing.startDate = newStart;
                        existing.endDate = newEnd;
                    }
                } else {
                    const data = {
                        name,
                        classId: classId || null,
                        startDate: minDate,
                        endDate: maxDate,
                        color: UNIT_COLORS[unitIdx % UNIT_COLORS.length],
                        description: 'Auto-created from Smart Import.',
                        standards: '',
                        docIds: [],
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    const ref = await getYearPath().collection('units').add(data);
                    units.push({ id: ref.id, ...data });
                    unitIdx++;
                    created++;
                }
            } catch (err) {
                console.warn('syncUnitsFromImportedLessons: could not save unit', name, err.message);
            }
        }
    }

    units.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    return created;
}

// One-time catch-up for lessons imported via Smart Import BEFORE the Unit
// Map auto-sync existed. Scans every already-saved lesson that carries a
// curriculumRef (the marker Smart Import stamps on each lesson), regroups
// them per class, and runs them through the same unit-creation logic new
// imports use -- so classes imported earlier this session backfill their
// Unit Map without needing to re-import anything.
async function bulkSyncUnitsFromExistingLessons() {
    // Smart Import stamps curriculumRef on every lesson it creates, but some
    // lessons predate that field or came from other flows (recurring
    // lessons, manual entry) -- those can't be grouped into units, so we
    // report on them separately instead of silently skipping.
    const allLessons = lessons.slice();
    const importedLessons = allLessons.filter(l => l.curriculumRef);
    const noRefLessons = allLessons.filter(l => !l.curriculumRef);

    console.log(`[Unit Map backfill] ${allLessons.length} total lessons, ${importedLessons.length} have curriculumRef, ${noRefLessons.length} do not.`);

    if (importedLessons.length === 0) {
        showToast('No Smart-Imported lessons found to backfill from.');
        return;
    }

    showLoading();
    document.querySelector('.loading-text').textContent = 'Scanning imported lessons for units...';

    try {
        const byClass = new Map();
        for (const lesson of importedLessons) {
            const key = lesson.classId || '__none__';
            if (!byClass.has(key)) byClass.set(key, []);
            byClass.get(key).push(lesson);
        }

        // Clean up fully orphaned auto-created units -- ones whose class no
        // longer has ANY currently-imported lessons at all (the class was
        // cleared, re-imported under a new id, or the lessons were deleted).
        // The per-class cleanup below only runs for classes that appear in
        // byClass, so a class with zero remaining imported lessons would
        // otherwise keep its old auto-created units forever with no way to
        // regenerate or replace them.
        const classIdsWithLessons = new Set([...byClass.keys()].map(k => k === '__none__' ? null : k));
        const orphanedUnits = units.filter(u => u.description === 'Auto-created from Smart Import.' && !classIdsWithLessons.has(u.classId));
        for (const u of orphanedUnits) {
            try {
                await getYearPath().collection('units').doc(u.id).delete();
            } catch (err) {
                console.warn('bulkSyncUnitsFromExistingLessons: could not delete orphaned unit', u.name, err.message);
            }
        }
        if (orphanedUnits.length > 0) {
            const orphanIds = new Set(orphanedUnits.map(u => u.id));
            for (let i = units.length - 1; i >= 0; i--) {
                if (orphanIds.has(units[i].id)) units.splice(i, 1);
            }
            console.log(`[Unit Map backfill] Removed ${orphanedUnits.length} orphaned unit(s) with no remaining imported lessons.`);
        }
        let totalCreated = 0;
        const diagnostics = [];

        for (const [classKey, classLessons] of byClass) {
            const classId = classKey === '__none__' ? null : classKey;
            const clsName = classes.find(c => c.id === classId)?.name || '(no class)';

            // Delete this class's previously auto-created units before
            // regenerating. This fix changes unit creation from "one giant
            // span per repeating template" to "one unit per actual
            // rotation/cycle run" -- if we left the old giant units in place,
            // the new proximity-based matching in syncUnitsFromImportedLessons
            // would just match every new smaller run inside the old giant
            // range and no-op, so stale merged units would never get
            // replaced. Manually-created/edited units (no auto-created
            // description, or a description that's been changed) are left
            // untouched.
            const staleUnits = units.filter(u => u.classId === classId && u.description === 'Auto-created from Smart Import.');
            for (const u of staleUnits) {
                try {
                    await getYearPath().collection('units').doc(u.id).delete();
                } catch (err) {
                    console.warn('bulkSyncUnitsFromExistingLessons: could not delete stale unit', u.name, err.message);
                }
            }
            if (staleUnits.length > 0) {
                const staleIds = new Set(staleUnits.map(u => u.id));
                for (let i = units.length - 1; i >= 0; i--) {
                    if (staleIds.has(units[i].id)) units.splice(i, 1);
                }
            }

            // Diagnose how many of this class's lessons actually produced a
            // parseable unit key, and sample a few that didn't so we can see
            // exactly what format they're in.
            const unparsed = [];
            let parsedCount = 0;
            for (const l of classLessons) {
                const info = extractUnitGroupKey(l.curriculumRef);
                if (info) parsedCount++;
                else if (unparsed.length < 3) unparsed.push(l.curriculumRef);
            }

            const createdForClass = await syncUnitsFromImportedLessons(classLessons, classId);
            totalCreated += createdForClass;

            diagnostics.push({
                class: clsName,
                classId,
                totalLessons: classLessons.length,
                parsedIntoUnitKey: parsedCount,
                unitsCreatedOrUpdated: createdForClass,
                sampleUnparsedCurriculumRef: unparsed
            });
        }
        console.log('[Unit Map backfill] Per-class breakdown:');
        console.table(diagnostics.map(d => ({
            class: d.class, classId: d.classId, totalLessons: d.totalLessons,
            parsedIntoUnitKey: d.parsedIntoUnitKey, unitsCreatedOrUpdated: d.unitsCreatedOrUpdated
        })));
        diagnostics.filter(d => d.sampleUnparsedCurriculumRef.length > 0).forEach(d => {
            console.log(`[Unit Map backfill] "${d.class}" -- sample curriculumRef values that didn't match a known pattern:`, d.sampleUnparsedCurriculumRef);
        });

        renderUnitMap();
        hideLoading();

        const anyUnparsed = diagnostics.some(d => d.parsedIntoUnitKey < d.totalLessons);
        const orphanNote = orphanedUnits.length > 0 ? ` Removed ${orphanedUnits.length} stale unit(s) with no remaining lessons.` : '';
        if (totalCreated > 0) {
            showToast(`📐 Backfilled ${totalCreated} units from ${importedLessons.length} imported lessons!${anyUnparsed ? ' (some lessons had an unrecognized id format -- see console for details)' : ''}${orphanNote}`);
        } else if (anyUnparsed) {
            showToast(`⚠️ Found imported lessons but couldn't recognize their unit format. Check the browser console for details.${orphanNote}`);
        } else if (orphanedUnits.length > 0) {
            showToast(`Unit Map updated.${orphanNote}`);
        } else {
            showToast('Unit Map is already up to date with your imported lessons.');
        }
    } catch (err) {
        hideLoading();
        console.error('bulkSyncUnitsFromExistingLessons:', err);
        showToast('Error backfilling units: ' + err.message);
    }
}

// Match pacing to lessons
function smartMatchLessons() {
    if (smartPacingData.length === 0 || smartLessonLibrary.length === 0) {
        showToast('Please load both files first');
        return;
    }
    
    // Create lookup map
    const lessonMap = new Map();
    const lessonMapByUnitDay = new Map();
    for (const lesson of smartLessonLibrary) {
        lessonMap.set(lesson.normalizedId, lesson);
        const udKey = extractUnitDayKey(lesson.lessonId);
        if (udKey && !lessonMapByUnitDay.has(udKey)) {
            lessonMapByUnitDay.set(udKey, lesson);
        }
    }

    // Routine rows (Module/Unit 0) for round-robin assignment against generic
    // "routine"-labeled pacing entries that don't carry a unique identifier.
    const routineLessons = smartLessonLibrary.filter(l => {
        const nums = (l.lessonId.match(/\d+/g) || []).map(Number);
        return nums.length > 0 && nums[0] === 0;
    });
    let routineRoundRobinIndex = 0;
    
    // Match each pacing entry
    smartMatchedLessons = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    
    for (const pacing of smartPacingData) {
        let lessonData = lessonMap.get(pacing.normalizedTitle);

        // Fallback: if the exact Unit+Week+Day string didn't match, try
        // matching by Unit+Day alone (ignoring Week) before giving up.
        if (!lessonData) {
            const udKey = extractUnitDayKey(pacing.title);
            if (udKey) lessonData = lessonMapByUnitDay.get(udKey);
        }

        // Fallback: generic repeated "routine" label - cycle through the
        // routine lessons in order so repeated occurrences don't all fail.
        if (!lessonData && routineLessons.length > 0 && isGenericRoutineTitle(pacing.title)) {
            lessonData = routineLessons[routineRoundRobinIndex % routineLessons.length];
            routineRoundRobinIndex++;
        }

        if (lessonData) {
            smartMatchedLessons.push({
                date: pacing.date,
                lessonId: pacing.title,
                lessonTitle: lessonData.title,
                topic: pacing.topic,
                standards: lessonData.standards || pacing.standards,
                learningTarget: lessonData.learningTarget || '',
                successCriteria: lessonData.successCriteria || '',
                materials: lessonData.materials,
                flow: lessonData.flow,
                notes: lessonData.notes,
                subject: pacing.subject,
                matched: true,
                selected: true
            });
            matchedCount++;
        } else {
            // Unmatched - use pacing data only
            smartMatchedLessons.push({
                date: pacing.date,
                lessonId: pacing.title,
                lessonTitle: '',
                topic: pacing.topic,
                standards: pacing.standards,
                learningTarget: '',
                successCriteria: '',
                materials: '',
                flow: '',
                notes: '',
                subject: pacing.subject,
                matched: false,
                selected: true
            });
            unmatchedCount++;
        }
    }
    
    // Display matched results
    displaySmartMatchPreview(matchedCount, unmatchedCount);
    
    // Enable import button
    const importBtn = document.getElementById('smart-import-btn');
    if (importBtn) {
        importBtn.disabled = smartMatchedLessons.length === 0;
    }
}

// Display matched lessons preview
function displaySmartMatchPreview(matchedCount, unmatchedCount) {
    const container = document.getElementById('smart-match-list');
    const preview = document.getElementById('smart-match-preview');
    const summary = document.getElementById('smart-match-summary');
    
    const previewLessons = smartMatchedLessons.slice(0, 12);
    
    container.innerHTML = previewLessons.map((lesson, index) => `
        <div class="import-event-item ${lesson.matched ? 'matched' : 'unmatched'}">
            <input type="checkbox" id="smart-lesson-${index}" ${lesson.selected ? 'checked' : ''} data-index="${index}">
            <span class="import-event-date">${formatDisplayDateShort(lesson.date)}</span>
            <span class="import-event-title">${lesson.lessonId}</span>
            <span class="match-indicator" style="font-size: 11px; padding: 0.15rem 0.35rem; border-radius: 3px; ${lesson.matched ? 'background: rgba(95,227,155,0.18); color: var(--success-color);' : 'background: rgba(255,138,128,0.18); color: var(--error-color);'}">${lesson.matched ? '✓' : '?'}</span>
        </div>
    `).join('');
    
    if (smartMatchedLessons.length > 12) {
        container.innerHTML += `<p style="color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem;">...and ${smartMatchedLessons.length - 12} more lessons</p>`;
    }
    
    // Add checkbox listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (index < smartMatchedLessons.length) {
                smartMatchedLessons[index].selected = e.target.checked;
            }
        });
    });
    
    summary.innerHTML = `<span style="color: var(--success-color);"><strong>${matchedCount}</strong> matched with full content</span> | <span style="color: var(--error-color);"><strong>${unmatchedCount}</strong> title only</span>`;
    
    preview.classList.remove('hidden');
}

// Import matched lessons
async function smartImportLessons() {
    const classId = document.getElementById('smart-import-class').value;
    if (!classId) {
        showToast('Please select a class');
        return;
    }
    
    const selectedLessons = smartMatchedLessons.filter(l => l.selected);
    
    if (selectedLessons.length === 0) {
        showToast('No lessons selected');
        return;
    }
    
    showLoading();
    document.querySelector('.loading-text').textContent = 'Importing lessons...';
    
    try {
        const yearPath = getYearPath();
        const cls = classes.find(c => c.id === classId);
        const subject = cls?.subject || 'Math';
        let imported = 0;
        let skipped = 0;
        const newlyImported = [];
        const importedOnDate = {};   // date -> lesson created by THIS import

        for (const lesson of selectedLessons) {
            // v6.5.0: a pacing cell like "Day 2 & 3" gives two lessons for one
            // date. The second used to be skipped as a duplicate; now it's
            // merged into the lesson this import just created for that date.
            const mine = importedOnDate[lesson.date];
            if (mine) {
                const extraTitle = lesson.lessonTitle ? `${lesson.lessonId}: ${lesson.lessonTitle}` : lesson.lessonId;
                const extraText = [lesson.topic ? `Topic: ${lesson.topic}` : '', lesson.notes || ''].filter(Boolean).join('\n\n');
                mine.title = `${mine.title} + ${extraTitle}`;
                if (extraText) mine.activities = [mine.activities, extraText].filter(Boolean).join('\n\n---\n\n');
                mine.curriculumRef = `${mine.curriculumRef}, ${lesson.lessonId}`;
                await yearPath.collection('lessons').doc(mine.id).update({
                    title: mine.title, activities: mine.activities, curriculumRef: mine.curriculumRef,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                const local = lessons.find(l => l.id === mine.id);
                if (local) Object.assign(local, { title: mine.title, activities: mine.activities, curriculumRef: mine.curriculumRef });
                continue;
            }

            // Check if lesson already exists
            const exists = lessons.find(l =>
                l.date === lesson.date &&
                l.classId === classId
            );

            if (exists) {
                skipped++;
                continue;
            }

            // Build lesson title
            const title = lesson.lessonTitle
                ? `${lesson.lessonId}: ${lesson.lessonTitle}`
                : lesson.lessonId;

            // Build activities text
            let activitiesText = '';
            if (lesson.topic) {
                activitiesText += `Topic: ${lesson.topic}\n\n`;
            }
            if (lesson.notes) {
                activitiesText += lesson.notes;
            }

            const lessonData = {
                title: title,
                date: lesson.date,
                classId: classId,
                subject: subject,
                duration: 60,
                standards: lesson.standards || '',
                learningTarget: lesson.learningTarget || '',
                successCriteria: lesson.successCriteria || '',
                flow: lesson.flow || '',
                materials: lesson.materials || '',
                activities: activitiesText.trim(),
                curriculumRef: lesson.lessonId,
                attachments: [],
                smartImported: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await yearPath.collection('lessons').add(lessonData);
            lessons.push({ id: docRef.id, ...lessonData });
            newlyImported.push(lessonData);
            importedOnDate[lesson.date] = { id: docRef.id, title: lessonData.title, activities: lessonData.activities, curriculumRef: lessonData.curriculumRef };
            imported++;
        }

        // Auto-populate the Unit Map from this import so units show up
        // without any separate manual step.
        const unitsCreated = await syncUnitsFromImportedLessons(newlyImported, classId);
        if (typeof renderUnitMap === 'function') renderUnitMap();

        // Reset UI
        resetSmartImportUI();

        // Refresh views
        renderCalendar();
        renderWeek();
        updateStats();

        if (skipped > 0) {
            showToast(`Imported ${imported} lessons (${skipped} dates already had lessons)${unitsCreated > 0 ? ` and added ${unitsCreated} units to the Unit Map` : ''}`);
        } else {
            showToast(`✅ Imported ${imported} lessons${unitsCreated > 0 ? ` and added ${unitsCreated} units to the Unit Map` : ''}!`);
        }

    } catch (error) {
        console.error('Error importing lessons:', error);
        showToast('Error importing lessons');
    }

    hideLoading();
}

// Reset Smart Import UI
function resetSmartImportUI() {
    smartPacingData = [];
    smartLessonLibrary = [];
    smartMatchedLessons = [];
    
    document.getElementById('smart-pacing-filename').textContent = '';
    document.getElementById('smart-lessons-filename').textContent = '';
    document.getElementById('smart-pacing-preview')?.classList.add('hidden');
    document.getElementById('smart-lessons-preview')?.classList.add('hidden');
    document.getElementById('smart-match-preview')?.classList.add('hidden');
    
    const matchBtn = document.getElementById('smart-match-btn');
    const importBtn = document.getElementById('smart-import-btn');
    if (matchBtn) matchBtn.disabled = true;
    if (importBtn) importBtn.disabled = true;
}

