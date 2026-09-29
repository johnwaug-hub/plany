// ============================================
// PARENT NEWSLETTER GENERATOR
// ============================================

let newsletterMode = 'week'; // 'week' | 'month'

function initNewsletterSystem() {
    document.getElementById('newsletter-week-btn')?.addEventListener('click', () => {
        openNewsletterModal('week');
    });
    document.getElementById('newsletter-month-btn')?.addEventListener('click', () => {
        openNewsletterModal('month');
    });
    document.getElementById('newsletter-generate-btn')?.addEventListener('click', generateNewsletter);
    document.getElementById('newsletter-copy-btn')?.addEventListener('click', () => copyNewsletterOutput('newsletter-output'));
    document.getElementById('newsletter-print-btn')?.addEventListener('click', printNewsletter);
    document.getElementById('newsletter-regenerate-btn')?.addEventListener('click', generateNewsletter);

    // Anchor Charts (Week view)
    document.getElementById('anchor-charts-week-btn')?.addEventListener('click', openAnchorChartsModal);
    document.getElementById('anchor-generate-btn')?.addEventListener('click', generateAnchorCharts);
    document.getElementById('anchor-regenerate-btn')?.addEventListener('click', generateAnchorCharts);
    document.getElementById('anchor-copy-btn')?.addEventListener('click', () => copyNewsletterOutput('anchor-output'));
    document.getElementById('anchor-print-btn')?.addEventListener('click', printAnchorCharts);
}

function openNewsletterModal(mode) {
    newsletterMode = mode;
    const title = mode === 'week'
        ? `📰 Weekly Parent Newsletter — ${document.getElementById('current-week')?.textContent || ''}`
        : `📰 Monthly Parent Newsletter — ${document.getElementById('current-month')?.textContent || ''}`;
    document.getElementById('newsletter-modal-title').textContent = title;

    // Reset output, then bring back the saved copy for this week/month if any
    document.getElementById('newsletter-output-area').classList.add('hidden');
    document.getElementById('newsletter-status').classList.add('hidden');
    document.getElementById('newsletter-modal').classList.remove('hidden');
    showSavedAiOutput({
        id: newsletterSaveId(mode),
        statusEl: document.getElementById('newsletter-status'),
        outputArea: document.getElementById('newsletter-output-area'),
        outputEl: document.getElementById('newsletter-output'),
        outputLabelEl: document.getElementById('newsletter-output-label')
    });
}

function buildNewsletterContext() {
    if (newsletterMode === 'week') {
        // ── WEEKLY ──────────────────────────────────────────
        const weekStart = currentWeekStart;
        const days = [];
        for (let i = 0; i < 5; i++) {
            const date = addDays(weekStart, i);
            const dateStr = formatDate(date);
            const dayName = ['Monday','Tuesday','Wednesday','Thursday','Friday'][i];
            const dayOfWeek = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];

            const dayIsOff = isOffDay(dateStr);
            const dayClasses = dayIsOff ? [] : sortClassesByTime(
                classes.filter(cls => cls.schedule && cls.schedule[dayOfWeek] && isClassActiveOnDate(cls, dateStr)), dayOfWeek
            );
            const dayEvents = events.filter(e => dateStr >= e.startDate && dateStr <= (e.endDate || e.startDate));
            const dayLessons = lessons.filter(l => l.date === dateStr);

            const classLines = dayClasses.map(cls => {
                const lesson = mergedLessonForClass(dayLessons, cls.id);
                if (lesson) {
                    return `  • ${cls.name}${cls.subject ? ' (' + cls.subject + ')' : ''}: ${lesson.title}${lesson.standards ? ' — ' + lesson.standards.substring(0, 80) : ''}`;
                }
                return `  • ${cls.name}${cls.subject ? ' (' + cls.subject + ')' : ''}: (no lesson planned)`;
            });

            const eventLines = dayEvents.map(e => `  📌 ${e.title}`);

            if (dayIsOff) {
                days.push(`${dayName} ${date.toLocaleDateString('en-US',{month:'short',day:'numeric'})}: NO SCHOOL`);
            } else {
                days.push([
                    `${dayName} ${date.toLocaleDateString('en-US',{month:'short',day:'numeric'})}:`,
                    ...classLines,
                    ...eventLines
                ].join('\n'));
            }
        }
        return days.join('\n\n');

    } else {
        // ── MONTHLY ─────────────────────────────────────────
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // Collect all lessons and events for the month
        const monthLessons = lessons.filter(l => {
            if (!l.date) return false;
            const d = new Date(l.date + 'T00:00:00');
            return d.getFullYear() === year && d.getMonth() === month;
        });

        // Group lessons by class, collect unique titles
        const byClass = {};
        monthLessons.forEach(l => {
            const cls = classes.find(c => c.id === l.classId);
            const name = cls ? cls.name : 'General';
            if (!byClass[name]) byClass[name] = [];
            if (l.title && !byClass[name].includes(l.title)) {
                byClass[name].push(l.title);
            }
        });

        const monthEvents = events.filter(e => {
            if (!e.startDate) return false;
            const d = new Date(e.startDate + 'T00:00:00');
            return d.getFullYear() === year && d.getMonth() === month;
        }).sort((a, b) => a.startDate.localeCompare(b.startDate));

        const classLines = Object.entries(byClass).map(([name, titles]) =>
            `  ${name}: ${titles.slice(0, 6).join(', ')}${titles.length > 6 ? '…' : ''}`
        );

        const eventLines = monthEvents.map(e =>
            `  • ${new Date(e.startDate + 'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}: ${e.title}`
        );

        return [
            `Month: ${monthName}`,
            '',
            'LESSONS PLANNED FOR THIS MONTH:',
            ...classLines,
            '',
            'SCHOOL EVENTS:',
            ...(eventLines.length > 0 ? eventLines : ['  (No events this month)'])
        ].join('\n');
    }
}

// ── Shared newsletter engine ─────────────────────────────────────────────
// Weekly, Monthly, and Year-at-a-Glance newsletters each build their own
// context (buildNewsletterContext / buildYearNewsletterContext), but share
// one prompt skeleton, one Claude streaming call, one markup renderer, one
// copy handler, and one print template. This keeps the three newsletter
// types visually and structurally consistent, and puts the parent-facing
// content in a fixed order so the most important information (concrete
// dates and action items) is never buried inside a wall of narrative text.

function buildNewsletterPrompt({ teacherName, grade, scopeLabel, toneMap, tone, language, context, sections, extra, wordLimit, extraGuidance }) {
    const langInstruction = language === 'both'
        ? 'Write the full newsletter in English first, then provide the complete Spanish translation below a divider line "---".'
        : language === 'Spanish'
        ? 'Write entirely in Spanish.'
        : 'Write in English.';

    const allSections = extra ? [...sections, `this special note from the teacher: "${extra}"`] : sections;

    return `You are ${teacherName}, a Grade ${grade} teacher writing a parent newsletter.

SCOPE: ${scopeLabel}
TONE: ${toneMap[tone] || toneMap.warm}
LANGUAGE: ${langInstruction}

CLASS DATA:
${context}

Write a parent newsletter covering: ${allSections.join(', ') || 'what students are learning'}.

Use exactly this structure so busy parents can find what matters most at a glance:
1. Open with a direct greeting to families, written out as the actual greeting itself (for example: "Good morning, Grade ${grade} families!" or "Hi everyone!"). Do NOT describe, announce, or preview the greeting ("Here's a warm sentence to...") — just write the greeting.
2. "### 📚 What We're Learning" followed by a short plain-language paragraph, no jargon.${extraGuidance ? ' ' + extraGuidance : ''}
3. "### 📌 Important Dates & Reminders" followed by "- " bullet points, one concrete date or action item per line. Put the single most time-sensitive item first. ONLY include this section if the data above actually contains real dates, events, or reminders — omit it entirely otherwise.
4. A brief warm sign-off as ${teacherName}.

Formatting rules:
- Use "### " immediately before each section title, exactly as written above.
- Use "- " for every bullet point, one per line, no sub-bullets.
- No other markdown — no **bold**, no numbered lists, no extra "#" headers.
- Keep the total length under ${wordLimit} words${language === 'both' ? ' per language' : ''}.

TENSE — this is the most important rule: Write entirely in a forward-looking, "here's what's coming up" tone. Use future/upcoming phrasing like "will be learning," "coming up," "next," "this week we'll." NEVER describe things as already finished — avoid past tense like "we learned," "we covered," "students explored," or "last week." Even if some of the data above reflects days that have already passed, present everything to parents as what's ahead, not a recap of what already happened.`;
}

// Renders the ### headers / - bullets / paragraph structure above into HTML.
function renderNewsletterMarkup(text) {
    return text.split(/\n\s*\n/).map(block => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('### ')) {
            const lines = trimmed.split('\n');
            const heading = lines[0].replace(/^###\s*/, '').trim();
            const rest = lines.slice(1).join('\n').trim();
            return `<h3 class="newsletter-section-heading">${heading}</h3>` + (rest ? renderNewsletterBody(rest) : '');
        }
        return renderNewsletterBody(trimmed);
    }).join('');
}

function renderNewsletterBody(block) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const isBulletList = lines.length > 0 && lines.every(l => l.startsWith('- ') || l.startsWith('• '));
    if (isBulletList) {
        return '<ul class="newsletter-bullets">' + lines.map(l => `<li>${l.replace(/^[-•]\s*/, '')}</li>`).join('') + '</ul>';
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
}

// Shared fetch + stream + render loop used by every newsletter type.
// Shared fetch + stream + render loop used by every newsletter type.
