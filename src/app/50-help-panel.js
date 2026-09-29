// ============================================================
// HELP & GUIDE — slide-in panel  (added v5.18.0)
// ============================================================

const HELP_SECTIONS = [
    {
        id: 'getting-started', icon: '👋', title: 'Getting Started',
        sub: 'A 60-second tour of Plany',
        img: 'help-shots/month.webp', imgCap: 'The Month view — your home base',
        lead: 'Plany keeps your whole year of teaching in one place — lessons, classes, students, sub plans, and AI helpers. Everything is reached from the bar along the bottom of the screen.',
        steps: [
            'The <strong>bottom navigation bar</strong> has seven tabs: <strong>Year, Month, Week, Day, Classes, Students,</strong> and <strong>AI</strong>. Tap any one to switch views. On a phone, <strong>Year, Classes</strong> and <strong>Students</strong> are under <strong>☰ More</strong>.',
            'The <strong>search bar</strong> at the top finds any lesson, event, or class instantly — or press <span class="help-kbd">Ctrl</span>/<span class="help-kbd">⌘</span> + <span class="help-kbd">K</span>.',
            'Your <strong>name and photo</strong> are in the top-right corner — tap them to edit your profile.',
            'Plany is a <strong>web app you can install</strong>. Look for the <strong>📲 Install</strong> button to add it to your phone or computer like a real app — it even works offline.'
        ],
        tip: { type: 'tip', text: 'New to Plany? Do these three things first, in order: set up your School Year, add your Classes, then start planning Lessons. Each section below walks you through it.' }
    },
    {
        id: 'school-year', icon: '📆', title: 'Set Up Your School Year',
        sub: 'Year tab — start here every August',
        img: 'help-shots/year.webp', imgCap: 'The Year tab shows all 12 months at a glance',
        lead: 'The Year tab is where you tell Plany when school starts and ends, and mark your breaks, holidays, and grading days. This powers the whole calendar — Plany automatically dims no-school days everywhere else.',
        steps: [
            'Tap <strong>Year</strong> in the bottom bar.',
            'Use the <strong>🏫 School Year</strong> dropdown below the calendars to pick your year (e.g. 2026–2027).',
            'Follow the <strong>🚀 Year Setup checklist</strong> at the top — it tracks the required steps: first day, last day, breaks, and grading periods.',
            'Add breaks and holidays as <strong>events</strong> (see the “No-School Days & Events” topic). They show up shaded across every view.',
            'Watch the summary bar update your <strong>Total School Days</strong> and per-quarter counts (Q1–Q4) automatically.',
            'Tap <strong>🗺️ Unit Map</strong> to plan your big teaching units across the year, or <strong>📰 Year Newsletter</strong> to generate a parent overview.'
        ],
        tip: { type: 'tip', text: 'The colored dots on each mini-calendar mean: green = first/last day, pink = break/holiday, yellow = grading day, blue = conference, and a small dot = a day that already has a lesson.' }
    },
    {
        id: 'classes', icon: '🎓', title: 'Create Your Classes',
        sub: 'Classes tab — set up once',
        img: 'help-shots/classes.webp', imgCap: 'Each class is a colored card with its weekly schedule',
        lead: 'A “class” in Plany is any recurring block in your day — a subject, an intervention group, even lunch and recess. Each one gets a color and a weekly schedule so lessons land on the right days automatically.',
        steps: [
            'Tap <strong>Classes</strong> in the bottom bar.',
            'Tap <strong>+ Add Class</strong> in the top-right.',
            'Give the class a <strong>name</strong>, pick a <strong>color</strong>, and add the <strong>room</strong> if you like.',
            'Set the <strong>weekly schedule</strong> — choose the days and start/end times. A class can meet at different times on different days, or more than once a day.',
            'Save. The class now appears in your Day and Week views on the days it meets, ready for lessons.',
            'Already have a printed schedule? Tap <strong>📷 Scan</strong> and take a photo — Plany’s AI reads it and builds your classes for you.'
        ],
        tip: { type: 'tip', text: 'Use the 📄 Weekly Schedule button to see and print your whole week of classes as a grid.' }
    },
    {
        id: 'lessons', icon: '✏️', title: 'Plan Your Lessons',
        sub: 'Day & Week tabs — your daily work',
        img: 'help-shots/day.webp', imgCap: 'The Day view lists every class and lets you add a lesson to each',
        lead: 'Lessons are the heart of Plany. You can add them from the Day, Week, or Month view — wherever you happen to be looking.',
        steps: [
            'Open the <strong>Day</strong> or <strong>Week</strong> tab and find the class you want to plan.',
            'Tap <strong>+ Add lesson</strong> next to that class (or the <strong>+ Lesson</strong> button in the Day toolbar), or press <span class="help-kbd">N</span>.',
            'Fill in the parts you want: <strong>title, objective, materials, activities,</strong> and <strong>standards</strong>. Fill only what’s useful — nothing is required.',
            'Save. The lesson shows on the calendar with the class’s color; a small ✓ marks days that already have a plan.',
            'To edit, just <strong>tap the lesson</strong> on any view.',
            'Drag a lesson to a different day to <strong>move</strong> it — hold <span class="help-kbd">Shift</span> while dragging to <strong>copy</strong> it instead.'
        ],
        tip: { type: 'tip', text: 'Short on time? The AI Lesson Fill tool (below) can draft a whole range of lessons for you in one shot. You edit from there.' }
    },
    {
        id: 'calendar-views', icon: '📅', title: 'The Calendar Views',
        sub: 'Year · Month · Week · Day',
        img: 'help-shots/week.webp', imgCap: 'The Week view — five days side by side with lesson cards',
        lead: 'The same lessons and events appear in four zoom levels. Pick whichever fits what you’re doing.',
        steps: [
            '<strong>Year</strong> — the big picture: all 12 months, school-day counts, and year setup.',
            '<strong>Month</strong> — a classic monthly grid; great for spotting events and gaps.',
            '<strong>Week</strong> — five weekdays side by side with full lesson cards. Home base for weekly planning, plus <strong>Copy Week</strong>, <strong>Anchor Charts</strong>, and <strong>Emergency Sub Plans</strong>.',
            '<strong>Day</strong> — one day in detail, class by class, with quick buttons for lessons, events, and sub plans.',
            'Use the <strong>◀ ▶ arrows</strong> to move between periods, or tap <strong>Today</strong> to jump back to the current day. Arrow keys <span class="help-kbd">←</span> <span class="help-kbd">→</span> work too.'
        ],
        tip: { type: 'tip', text: 'Press number keys 1–5 to jump straight to Year, Month, Week, Classes, or Day.' }
    },
    {
        id: 'events', icon: '📌', title: 'No-School Days & Events',
        sub: 'Breaks, holidays, meetings & more',
        img: 'help-shots/event.webp', imgCap: 'The Add Event form, with the Event Type menu',
        lead: 'Events mark anything that isn’t a lesson — holidays, breaks, grading days, assemblies, staff meetings, conferences. No-school event types automatically shade those days and cancel classes everywhere in Plany.',
        steps: [
            'From the <strong>Day</strong> view tap <strong>+ Event</strong>, or press <span class="help-kbd">E</span> from anywhere.',
            'Type an <strong>Event Title</strong> (e.g. “Fall Break”).',
            'Pick an <strong>Event Type</strong>. No-school types — break, holiday, grading day, meeting, professional learning — turn the day off automatically.',
            'Choose a <strong>Start Date</strong> (and an <strong>End Date</strong> for multi-day breaks).',
            'Leave <strong>All Day Event</strong> checked for full-day items, or uncheck it to set specific times.',
            'Save. The day now shows <strong>“No School”</strong> where it applies, and your school-day counts update.'
        ],
        tip: { type: 'tip', text: 'Have a district calendar PDF? Use Scan & Import on the AI tab to pull all the dates in at once instead of typing each event.' }
    },
    {
        id: 'sub-day', icon: '🧑‍🏫', title: 'Sub Days & Sub Packets',
        sub: 'Everything a substitute needs',
        img: 'help-shots/sub-day.webp', imgCap: 'The Sub Day Packet builder',
        lead: 'When you’re out, Plany builds a complete substitute packet — your routines, seating, class instructions, and student work — ready to print.',
        steps: [
            'Open the <strong>Day</strong> you’ll be absent and tap <strong>🧑‍🏫 Sub Day</strong>.',
            'Toggle <strong>Mark as Sub Day</strong> on so the day is flagged with a sub badge.',
            'Fill in <strong>Teacher &amp; Classroom Info</strong> — name, room, school, and the sub’s name if you know it.',
            'Add your <strong>arrival routine, per-class instructions, medical notes,</strong> and <strong>where materials are</strong>.',
            'Tap <strong>⭐ Save as Defaults</strong> so next time most of it is pre-filled.',
            'Print what you need: <strong>Print Plan</strong> (the instructions), <strong>Print Picked Pages</strong> (chosen worksheets), or <strong>Print AI Work</strong> (auto-generated student work).'
        ],
        tip: { type: 'warn', text: 'Caught off guard? The Week view has an Emergency Sub Plans button that generates a no-prep, ready-to-go packet in seconds.' }
    },
    {
        id: 'students', icon: '👥', title: 'Students, Grades & Attendance',
        sub: 'Students tab',
        img: 'help-shots/students.webp', imgCap: 'The Students tab, with its six sub-sections',
        lead: 'The Students tab is your classroom roster and record book — grades, IEP notes, seating charts, parent contact log, and attendance, all in one place.',
        steps: [
            'Tap <strong>Students</strong> in the bottom bar.',
            'Add students with <strong>+ Add Student</strong>, or import a roster with <strong>SIS / CSV</strong> or <strong>Moodle</strong>.',
            'Switch between the tabs across the top: <strong>Roster, Gradebook, IEP &amp; Differentiation, Seating Chart, Parent Log,</strong> and <strong>Attendance</strong>.',
            'Use the filter chips (<strong>All, IEP, 504, ELL, GT</strong>) to quickly narrow the roster.',
            'Open a student to see their details, grades, and any accommodations in one profile.'
        ],
        tip: { type: 'tip', text: 'IEP and differentiation notes you add here can be pulled into AI-generated student work so it’s tailored to each learner.' }
    },
    {
        id: 'ai-key', icon: '🔑', title: 'Turn On the AI Features',
        sub: 'One-time setup — do this first',
        img: 'help-shots/settings.webp', imgCap: 'AI Provider & API Key, on the AI tab',
        lead: 'Plany’s AI tools — Lesson Fill, Scan & Import, the Quiz Generator, and Student Packets — run on your own AI key. It’s a one-time setup and your key stays private to your account.',
        steps: [
            'Tap the <strong>AI</strong> tab, then scroll to <strong>⚙️ Settings → AI Provider &amp; API Key</strong>.',
            'Choose your <strong>AI Provider</strong> (Anthropic Claude is the default).',
            'Paste your <strong>API key</strong> into the box.',
            'Tap <strong>💾 Save Key</strong>. It’s stored on your device with a private backup tied to your account, so it’s restored if you sign in somewhere new.',
            'That’s it — every AI tool is now unlocked.'
        ],
        tip: { type: 'warn', text: 'If an AI tool says it needs a key, this is the screen to visit. Your key is never shared with other teachers.' }
    },
    {
        id: 'ai-lesson-fill', icon: '✨', title: 'AI Lesson Fill',
        sub: 'Draft a whole range of lessons',
        img: 'help-shots/lesson-fill.webp', imgCap: 'AI Lesson Fill — pick a class and a date range',
        lead: 'Lesson Fill writes draft lessons across as many days as you choose, so you start from a full week instead of a blank page.',
        steps: [
            'On the <strong>AI</strong> tab, open <strong>✨ AI Lesson Fill</strong>.',
            'Pick a <strong>Class</strong> (or leave it on <em>All Classes</em>).',
            'Set the <strong>From</strong> and <strong>To</strong> dates for the range you want filled.',
            'Keep <strong>Skip days that already have a lesson</strong> checked so your existing plans are never overwritten.',
            'Leave <strong>Use pacing guide if imported</strong> checked to follow any pacing document you’ve uploaded.',
            'Add anything special in <strong>Extra Context</strong> (a theme, a unit, a standard), then run it and review the drafts — every lesson is yours to edit.'
        ],
        tip: { type: 'tip', text: 'For the best results, upload your pacing guides and materials to the Curriculum Library first (next topic).' }
    },
    {
        id: 'curriculum', icon: '📚', title: 'Curriculum Library',
        sub: 'Feed the AI your real materials',
        img: 'help-shots/curriculum.webp', imgCap: 'Uploading a resource to the Curriculum Library',
        lead: 'Upload your worksheets, teacher guides, word lists, and reading passages once. Plany’s AI then draws on them to build lessons and student packets that match what you actually teach.',
        steps: [
            'On the <strong>AI</strong> tab, open <strong>📚 Curriculum Library</strong>.',
            'Choose a <strong>Subject</strong> and a <strong>Resource Type</strong> (worksheet, guide, word list, and so on).',
            'Add a short <strong>Description</strong> to help the AI pick the right resource later.',
            'Upload the file. <strong>ZIP files are unpacked automatically</strong> — every file inside becomes its own resource.',
            'Your library <strong>carries over between school years</strong>, so you build it once and reuse it.'
        ],
        tip: { type: 'tip', text: 'Supported files include PDFs, Word docs, PowerPoint (.pptx), images, and ZIPs of any of these.' }
    },
    {
        id: 'ai-tools', icon: '🤖', title: 'More AI Tools',
        sub: 'Scan & Import · Quizzes · Newsletters',
        img: 'help-shots/ai-tools.webp', imgCap: 'The AI Tools section on the AI tab',
        lead: 'Beyond Lesson Fill, Plany has a handful of AI helpers for the jobs that eat your time.',
        steps: [
            '<strong>📷 Scan &amp; Import</strong> — snap a photo of a schedule, lesson plan, or district calendar and Plany turns it into real classes and events.',
            '<strong>📝 Quiz &amp; Rubric Generator</strong> — create printable quizzes and rubrics on any topic in seconds.',
            '<strong>📰 Newsletters</strong> — from the Year or Week view, tap <strong>Newsletter</strong> to generate a parent-friendly summary of what’s coming up.',
            '<strong>Student Work Packets</strong> — build a packet of tailored student work from your lessons and curriculum, printable straight from the Sub Day or Day view.'
        ],
        tip: { type: 'tip', text: 'All of these need your AI key set up first — see “Turn On the AI Features” above.' }
    },
    {
        id: 'shortcuts', icon: '⌨️', title: 'Tips & Keyboard Shortcuts',
        sub: 'Work faster',
        lead: 'A few shortcuts and habits that make Plany quicker once you know them.',
        steps: [
            '<span class="help-kbd">Ctrl</span>/<span class="help-kbd">⌘</span> + <span class="help-kbd">K</span> — open search from anywhere.',
            '<span class="help-kbd">N</span> new lesson · <span class="help-kbd">E</span> new event · <span class="help-kbd">C</span> new class.',
            '<span class="help-kbd">1</span>–<span class="help-kbd">5</span> jump to Year, Month, Week, Classes, or Day · <span class="help-kbd">T</span> jumps to today.',
            '<span class="help-kbd">Ctrl</span>/<span class="help-kbd">⌘</span> + <span class="help-kbd">Z</span> undo · <span class="help-kbd">Esc</span> closes any panel.',
            'Deleted something by mistake? An <strong>Undo</strong> button appears in the toast at the bottom of the screen.',
            'Back up your whole plan anytime from <strong>Settings → Export / Import Data</strong>.'
        ],
        tip: { type: 'tip', text: 'Tap “Keyboard shortcuts” at the bottom of this panel for the full list any time.' }
    }
];

var _helpRendered = false;

function renderHelp() {
    const body = document.getElementById('help-body');
    const quicknav = document.getElementById('help-quicknav');
    if (!body || !quicknav) return;

    // Intro block
    let html = '<div class="help-intro help-item" data-text="welcome overview getting started">'
        + '<strong>Welcome to Plany.</strong> This guide walks through every part of the app with real screenshots. '
        + 'Tap a topic to expand it, or search above to jump straight to what you need.</div>';

    HELP_SECTIONS.forEach(sec => {
        const stepsHtml = (sec.steps || []).map(s => `<li>${s}</li>`).join('');
        const imgHtml = sec.img
            ? `<img class="help-shot" src="${sec.img}" alt="${sec.title} screenshot" loading="lazy">`
              + (sec.imgCap ? `<div class="help-shot-cap">${sec.imgCap}</div>` : '')
            : '';
        const tipHtml = sec.tip
            ? `<div class="help-tip ${sec.tip.type === 'warn' ? 'warn' : ''}"><span class="help-tip-icon">${sec.tip.type === 'warn' ? '⚠️' : '💡'}</span><span>${sec.tip.text}</span></div>`
            : '';
        const searchText = [sec.title, sec.sub, sec.lead, ...(sec.steps || []), sec.tip ? sec.tip.text : '']
            .join(' ').replace(/<[^>]+>/g, ' ').toLowerCase();

        html += `
        <div class="help-section help-item" id="help-sec-${sec.id}" data-text="${searchText.replace(/"/g, '')}">
            <button class="help-sec-head" type="button" aria-expanded="false">
                <span class="help-sec-icon">${sec.icon}</span>
                <span class="help-sec-titles">
                    <span class="help-sec-title">${sec.title}</span>
                    <span class="help-sec-sub">${sec.sub || ''}</span>
                </span>
                <span class="help-sec-caret">▶</span>
            </button>
            <div class="help-sec-body">
                ${sec.lead ? `<p class="help-sec-lead">${sec.lead}</p>` : ''}
                ${imgHtml}
                <ol class="help-steps">${stepsHtml}</ol>
                ${tipHtml}
            </div>
        </div>`;
    });

    body.innerHTML = html;

    // Quick-nav chips
    quicknav.innerHTML = HELP_SECTIONS.map(sec =>
        `<button class="help-chip" data-target="help-sec-${sec.id}">${sec.icon} ${sec.title}</button>`
    ).join('');

    // Wire accordion toggles
    body.querySelectorAll('.help-sec-head').forEach(head => {
        head.addEventListener('click', () => {
            const sec = head.closest('.help-section');
            const isOpen = sec.classList.toggle('open');
            head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    });

    // Wire quick-nav chips: open + scroll to a section
    quicknav.querySelectorAll('.help-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const target = document.getElementById(chip.dataset.target);
            if (!target) return;
            target.classList.add('open');
            target.querySelector('.help-sec-head')?.setAttribute('aria-expanded', 'true');
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    _helpRendered = true;
}

function openHelp() {
    if (!_helpRendered) renderHelp();
    const panel = document.getElementById('help-panel');
    const overlay = document.getElementById('help-overlay');
    const footer = document.getElementById('help-footer-version');
    if (footer) footer.textContent = 'Plany Help · ' + (window.APP_VERSION || document.querySelector('.nav-version')?.textContent || '');
    overlay?.classList.remove('hidden');
    // force reflow so the transition runs
    void panel?.offsetWidth;
    requestAnimationFrame(() => {
        overlay?.classList.add('show');
        panel?.classList.add('open');
    });
    panel?.setAttribute('aria-hidden', 'false');
    if (panel) panel.inert = false;
    setTimeout(() => document.getElementById('help-search')?.focus(), 320);
}

function closeHelp() {
    const panel = document.getElementById('help-panel');
    const overlay = document.getElementById('help-overlay');
    panel?.classList.remove('open');
    overlay?.classList.remove('show');
    panel?.setAttribute('aria-hidden', 'true');
    if (panel) panel.inert = true;   // v6.5.0: hidden panel's links can't be tabbed to
    setTimeout(() => overlay?.classList.add('hidden'), 320);
}

function filterHelp(query) {
    const q = (query || '').trim().toLowerCase();
    const body = document.getElementById('help-body');
    const quicknav = document.getElementById('help-quicknav');
    const noResults = document.getElementById('help-no-results');
    const clearBtn = document.getElementById('help-search-clear');
    if (!body) return;

    clearBtn?.classList.toggle('hidden', !q);

    const items = body.querySelectorAll('.help-item');
    let visible = 0;

    items.forEach(item => {
        // Clear any previous highlights
        item.querySelectorAll('.help-hl').forEach(h => {
            h.replaceWith(document.createTextNode(h.textContent));
        });
        item.normalize?.();

        if (!q) {
            item.style.display = '';
            if (item.classList.contains('help-section')) {
                item.classList.remove('open');
                item.querySelector('.help-sec-head')?.setAttribute('aria-expanded', 'false');
            }
            visible++;
            return;
        }

        const hay = (item.dataset.text || item.textContent).toLowerCase();
        const match = hay.includes(q);
        item.style.display = match ? '' : 'none';
        if (match) {
            visible++;
            if (item.classList.contains('help-section')) {
                item.classList.add('open');
                item.querySelector('.help-sec-head')?.setAttribute('aria-expanded', 'true');
                highlightHelp(item.querySelector('.help-sec-body'), q);
                highlightHelp(item.querySelector('.help-sec-title'), q);
            }
        }
    });

    quicknav?.classList.toggle('hidden', !!q);
    noResults?.classList.toggle('hidden', visible > 0);
    body.classList.toggle('hidden', visible === 0);
}

// Wrap matching text nodes in a highlight span (skips inside tags safely)
function highlightHelp(root, q) {
    if (!root || !q) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('.help-shot-cap')) continue;
        if (node.nodeValue.toLowerCase().includes(q)) targets.push(node);
    }
    targets.forEach(node => {
        const frag = document.createDocumentFragment();
        const text = node.nodeValue;
        const lower = text.toLowerCase();
        let i = 0, idx;
        while ((idx = lower.indexOf(q, i)) !== -1) {
            if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)));
            const mark = document.createElement('span');
            mark.className = 'help-hl';
            mark.textContent = text.slice(idx, idx + q.length);
            frag.appendChild(mark);
            i = idx + q.length;
        }
        if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
        node.replaceWith(frag);
    });
}

function initHelp() {
    document.getElementById('help-btn')?.addEventListener('click', openHelp);
    document.getElementById('help-close')?.addEventListener('click', closeHelp);
    document.getElementById('help-overlay')?.addEventListener('click', closeHelp);

    const search = document.getElementById('help-search');
    search?.addEventListener('input', e => filterHelp(e.target.value));

    document.getElementById('help-search-clear')?.addEventListener('click', () => {
        if (search) search.value = '';
        filterHelp('');
        search?.focus();
    });
    document.getElementById('help-nr-clear')?.addEventListener('click', () => {
        if (search) search.value = '';
        filterHelp('');
        search?.focus();
    });

    document.getElementById('help-open-shortcuts')?.addEventListener('click', () => {
        closeHelp();
        setTimeout(() => document.getElementById('keyboard-modal')?.classList.remove('hidden'), 260);
    });

    // Close on Escape (only when the panel is open)
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.getElementById('help-panel')?.classList.contains('open')) {
            closeHelp();
        }
    });
}

// Expose for other callers / console
window.openHelp = openHelp;
window.closeHelp = closeHelp;

document.addEventListener('DOMContentLoaded', () => {
    try { initHelp(); } catch (e) { console.error('Help init failed', e); }
});
