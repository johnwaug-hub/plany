// ============================================================
// ANCHOR CHARTS  (Week view)
// AI reviews the week's lesson plans + curriculum and suggests a
// classroom-ready list of anchor charts to make for the week.
// Reuses the newsletter engine: callAITextStream + renderNewsletterMarkup.
// ============================================================

function openAnchorChartsModal() {
    const wk = document.getElementById('current-week')?.textContent || 'this week';
    document.getElementById('anchor-modal-title').textContent = `🖼️ Anchor Charts — ${wk}`;
    document.getElementById('anchor-output-area')?.classList.add('hidden');
    document.getElementById('anchor-status')?.classList.add('hidden');

    const note = document.getElementById('anchor-curriculum-note');
    if (note) {
        const n = curriculumDocs.length;
        note.textContent = n
            ? `Claude will use this week's plans + ${n} curriculum resource${n !== 1 ? 's' : ''}.`
            : `Claude will use this week's plans. Upload curriculum in the AI tab for richer ideas.`;
    }
    document.getElementById('anchor-charts-modal')?.classList.remove('hidden');
    showSavedAiOutput({
        id: 'anchor-charts-' + formatDate(currentWeekStart),
        statusEl: document.getElementById('anchor-status'),
        outputArea: document.getElementById('anchor-output-area'),
        outputEl: document.getElementById('anchor-output'),
        outputLabelEl: null
    });
}

// Gather this week's plans (+ a compact curriculum summary) as AI context
function buildAnchorChartContext() {
    const weekStart = currentWeekStart;
    const dayBlocks = [];
    const subjectsSeen = new Set();

    for (let i = 0; i < 5; i++) {
        const date = addDays(weekStart, i);
        const dateStr = formatDate(date);
        const dayName = ['Monday','Tuesday','Wednesday','Thursday','Friday'][i];
        const dow = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];

        if (isOffDay(dateStr)) { dayBlocks.push(`${dayName}: NO SCHOOL`); continue; }

        const dayClasses = sortClassesByTime(
            classes.filter(c => c.schedule && c.schedule[dow] && isClassActiveOnDate(c, dateStr) && c.type !== 'activity'),
            dow
        );
        const dayLessons = lessons.filter(l => l.date === dateStr);

        const lines = dayClasses.map(cls => {
            if (cls.subject) subjectsSeen.add(cls.subject);
            const lesson = mergedLessonForClass(dayLessons, cls.id);
            const parts = [`  • ${cls.name}${cls.subject ? ' (' + cls.subject + ')' : ''}`];
            if (lesson) {
                if (lesson.title) parts.push(`topic: ${lesson.title}`);
                const obj = lesson.objective || lesson.objectives;
                if (obj) parts.push(`objective: ${String(obj).substring(0, 140)}`);
                if (lesson.standards) parts.push(`standards: ${String(lesson.standards).substring(0, 100)}`);
            } else {
                parts.push('(no lesson planned)');
            }
            return parts.join(' — ');
        });

        dayBlocks.push([
            `${dayName} ${date.toLocaleDateString('en-US', { month:'short', day:'numeric' })}:`,
            ...(lines.length ? lines : ['  (no classes)'])
        ].join('\n'));
    }

    // Compact curriculum summary
    let curr = '';
    if (curriculumDocs.length) {
        const names = curriculumDocs.slice(0, 40)
            .map(d => `  • ${d.name}${d.subject ? ' [' + d.subject + ']' : ''}`).join('\n');
        curr = 'CURRICULUM LIBRARY (resources on hand):\n' + names;
        const relevant = curriculumDocs
            .filter(d => d.hasContent && d.content && d.content.length > 50 && subjectsSeen.has(d.subject))
            .slice(0, 4);
        if (relevant.length) {
            curr += '\n\nSAMPLE CURRICULUM CONTENT (excerpts):\n'
                + relevant.map(d => `--- ${d.name} ---\n${d.content.substring(0, 600)}`).join('\n\n');
        }
    }

    return `THIS WEEK'S PLANS:\n${dayBlocks.join('\n\n')}${curr ? '\n\n' + curr : ''}`;
}

async function generateAnchorCharts() {
    const providerLabel = (AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic).label;
    if (!hasEffectiveAiKey()) { showToast(`Add your ${providerLabel} API key in Settings first.`); return; }

    const statusEl   = document.getElementById('anchor-status');
    const outputArea = document.getElementById('anchor-output-area');
    const outputEl   = document.getElementById('anchor-output');
    const genBtn     = document.getElementById('anchor-generate-btn');

    const grade   = userProfile.grade ? formatGrade(userProfile.grade) : 'Grade 1';
    const teacher = userProfile.username || 'a teacher';
    const context = buildAnchorChartContext();

    const prompt = `You are ${teacher}, a ${grade} teacher. Review THIS WEEK'S lesson plans and curriculum below, then produce a practical, classroom-ready LIST of ANCHOR CHARTS that would best support students' learning this week.

An anchor chart is a poster the teacher makes and displays to "anchor" a concept, strategy, vocabulary set, or routine so students can refer back to it.

For EACH anchor chart use EXACTLY this format:
### <Chart Title>
- Purpose: <one sentence on why it helps this week's learning>
- Put on the chart: <3-6 short, concrete items — the exact words, steps, examples, or visuals to include>

Rules:
- Group charts by subject (start each subject with its own "### " title line if helpful).
- Only suggest charts that clearly connect to this week's ACTUAL lessons, objectives, or standards below.
- Aim for 5-9 charts total. Keep everything ${grade}-appropriate and concrete.
- Output ONLY the chart list — no preamble, no closing remarks.

${context}`;

    if (genBtn) genBtn.disabled = true;
    statusEl.innerHTML = `<div class="newsletter-generating"><div class="nl-spinner"></div><span>Reviewing this week's learning…</span></div>`;
    statusEl.classList.remove('hidden');
    outputArea.classList.add('hidden');

    try {
        statusEl.classList.add('hidden');
        outputEl.innerHTML = '';
        outputArea.classList.remove('hidden');
        _aiShowToken++;
        const fullText = await callAITextStream({
            prompt,
            tier: 'quality',
            maxTokens: 2000,
            onDelta: (_chunk, fullText) => {
                outputEl.innerHTML = renderNewsletterMarkup(fullText);
                outputEl.scrollTop = outputEl.scrollHeight;
            }
        });
        const wkLabel = document.getElementById('current-week')?.textContent || formatDate(currentWeekStart);
        if (await saveAiOutput('anchor-charts-' + formatDate(currentWeekStart), { type: 'anchor-charts', label: 'Anchor charts · ' + wkLabel, text: fullText })) {
            statusEl.innerHTML = `<div class="ai-saved-note">💾 Saved. They'll be here next time you open Anchor Charts for this week.</div>`;
            statusEl.classList.remove('hidden');
        }
        showToast('🖼️ Anchor charts ready!');
    } catch (err) {
        console.error('generateAnchorCharts:', err);
        statusEl.innerHTML = `<div class="newsletter-error">❌ ${err.message || 'Generation failed. Check your API key.'}</div>`;
        statusEl.classList.remove('hidden');
        outputArea.classList.add('hidden');
    } finally {
        if (genBtn) genBtn.disabled = false;
    }
}

function printAnchorCharts() {
    const el = document.getElementById('anchor-output');
    if (!el || !el.innerHTML.trim()) { showToast('Generate anchor charts first.'); return; }
    const wk = document.getElementById('current-week')?.textContent || '';
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Anchor Charts</title>
<style>
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:14px; color:#222; max-width:none; margin:0 auto; padding:24px 0; }
  @page { margin:0.6in; }
  h1 { font-size:22px; color:#7B5EA7; border-bottom:3px solid #7B5EA7; padding-bottom:8px; margin-bottom:4px; }
  h3.newsletter-section-heading { font-size:15px; color:#7B5EA7; margin:22px 0 8px; }
  .meta { font-size:12px; color:#888; margin-bottom:24px; }
  p { line-height:1.6; margin-bottom:12px; }
  ul.newsletter-bullets { margin:0 0 16px; padding-left:22px; }
  ul.newsletter-bullets li { line-height:1.5; margin-bottom:5px; }
  .footer { font-size:11px; color:#aaa; margin-top:32px; border-top:1px solid #eee; padding-top:10px; }
</style></head><body>
<h1>🖼️ Anchor Charts</h1>
<div class="meta">${wk}</div>
${el.innerHTML}
</body></html>`, {v:'0.5in',h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 400);
}


