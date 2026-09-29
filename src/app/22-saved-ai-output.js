// ============================================================
// SAVED AI OUTPUT (v6.3.0)
// Everything the AI writes is kept under
//   users/{uid}/years/{year}/aiOutputs/{id}
// and shown again in the place it was made:
//   * newsletters (week / month / year) and anchor charts: one saved copy per
//     period, re-shown when that modal opens; generating again replaces it
//   * quizzes, rubrics and differentiation: a "Saved" list you can reopen,
//     re-print or delete
// (Lesson Fill, student packets, the curriculum generator, calendar and
// pacing imports already save into lessons / sub days / events.)
// ============================================================
const _aiOutputCache = {};

function aiOutputsRef() { return getYearPath().collection('aiOutputs'); }
// Cache per account + school year ("newsletter-year" exists in every year)
function aiCacheKey(id) { return (currentUser ? currentUser.uid : '') + '/' + settings.schoolYear + '/' + id; }

function aiSavedStamp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', '
        + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Save (or replace) one output. Returns the doc id, or null if it failed.
async function saveAiOutput(id, data) {
    if (!currentUser) return null;
    const savedAt = new Date().toISOString();
    const docData = { ...data, savedAt, schoolYear: settings.schoolYear, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
        const ref = id ? aiOutputsRef().doc(id) : aiOutputsRef().doc();
        await ref.set(docData);
        _aiOutputCache[aiCacheKey(ref.id)] = { id: ref.id, ...data, savedAt };
        return ref.id;
    } catch (e) {
        console.warn('saveAiOutput:', e.message);
        showToast('⚠️ Generated, but a copy could not be saved: ' + e.message);
        return null;
    }
}

async function loadAiOutput(id) {
    if (!currentUser) return null;
    const ck = aiCacheKey(id);
    if (_aiOutputCache[ck]) return _aiOutputCache[ck];
    try {
        const doc = await aiOutputsRef().doc(id).get();
        if (!doc.exists) return null;
        _aiOutputCache[ck] = { id: doc.id, ...doc.data() };
        return _aiOutputCache[ck];
    } catch (e) { console.warn('loadAiOutput:', e.message); return null; }
}

// Newest first. (Filtered client-side so no composite index is needed.)
async function listAiOutputs(types) {
    if (!currentUser) return [];
    try {
        const snap = await aiOutputsRef().where('type', 'in', types).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
    } catch (e) { console.warn('listAiOutputs:', e.message); return []; }
}

async function deleteAiOutput(id) {
    try { await aiOutputsRef().doc(id).delete(); delete _aiOutputCache[aiCacheKey(id)]; return true; }
    catch (e) { showToast('Could not delete: ' + e.message); return false; }
}

// Re-show a saved newsletter / anchor-chart set when its modal opens.
let _aiShowToken = 0;
async function showSavedAiOutput({ id, statusEl, outputArea, outputEl, outputLabelEl }) {
    const token = ++_aiShowToken;
    const saved = await loadAiOutput(id);
    if (token !== _aiShowToken || !saved || !saved.text) return;   // modal changed meanwhile / nothing saved
    outputEl.innerHTML = renderNewsletterMarkup(saved.text);
    if (outputLabelEl && saved.label) outputLabelEl.textContent = saved.label;
    outputArea.classList.remove('hidden');
    if (statusEl) {
        statusEl.innerHTML = `<div class="ai-saved-note">💾 Your saved copy from ${escHtml(aiSavedStamp(saved.savedAt))}. Generate again to replace it.</div>`;
        statusEl.classList.remove('hidden');
    }
}

function newsletterSaveId(mode) {
    if (mode === 'week') return 'newsletter-week-' + formatDate(currentWeekStart);
    if (mode === 'year') return 'newsletter-year';
    return 'newsletter-month-' + currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0');
}

async function generateNewsletterFromPrompt({ prompt, maxTokens, statusEl, outputArea, outputEl, outputLabelEl, labelText, genBtn, readyMessage, saveId = null, saveType = 'newsletter' }) {
    const providerLabel = (AI_PROVIDERS[aiSettings.provider] || AI_PROVIDERS.anthropic).label;
    if (!hasEffectiveAiKey()) {
        showToast(`Add your ${providerLabel} API key in Settings → AI Packet Generator`);
        return false;
    }

    statusEl.innerHTML = `<div class="newsletter-generating"><div class="nl-spinner"></div><span>AI is writing your newsletter…</span></div>`;
    statusEl.classList.remove('hidden');
    outputArea.classList.add('hidden');
    if (genBtn) genBtn.disabled = true;

    try {
        statusEl.classList.add('hidden');
        outputEl.innerHTML = '';
        outputArea.classList.remove('hidden');
        if (outputLabelEl) outputLabelEl.textContent = labelText;

        _aiShowToken++;   // a saved copy still loading must not overwrite this one
        const fullText = await callAITextStream({
            prompt,
            tier: 'quality',
            maxTokens,
            onDelta: (_chunk, fullText) => {
                outputEl.innerHTML = renderNewsletterMarkup(fullText);
                outputEl.scrollTop = outputEl.scrollHeight;
            }
        });

        if (saveId) {
            const ok = await saveAiOutput(saveId, { type: saveType, label: labelText, text: fullText });
            if (ok) {
                statusEl.innerHTML = `<div class="ai-saved-note">💾 Saved. It will be here next time you open this.</div>`;
                statusEl.classList.remove('hidden');
            }
        }
        showToast(readyMessage || '📰 Newsletter ready!');
        return true;

    } catch (err) {
        console.error('Newsletter generation error:', err);
        statusEl.innerHTML = `<div class="newsletter-error">❌ ${err.message || 'Generation failed. Check your API key.'}</div>`;
        statusEl.classList.remove('hidden');
        outputArea.classList.add('hidden');
        return false;
    } finally {
        if (genBtn) genBtn.disabled = false;
    }
}

// Shared copy-to-clipboard handler for any newsletter output element.
function copyNewsletterOutput(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const text = el.innerText || el.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Copied!');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('📋 Copied!');
    });
}

// Shared print template for any newsletter type — one visual style for all three.
function openNewsletterPrintWindow({ title, subtitle, bodyHtml, v = '0.4in' }) {   // spec: 0.5in only for the year newsletter
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #222; margin: 0; }
  @page { margin: 0.6in; }
  h1 { font-size: 22px; color: #FF6B9D; border-bottom: 3px solid #FF6B9D; padding-bottom: 8px; margin-bottom: 4px; }
  h3.newsletter-section-heading { font-size: 15px; color: #7B5EA7; margin: 22px 0 8px; }
  .meta { font-size: 12px; color: #888; margin-bottom: 24px; }
  p { line-height: 1.7; margin-bottom: 14px; }
  ul.newsletter-bullets { margin: 0 0 16px; padding-left: 22px; }
  ul.newsletter-bullets li { line-height: 1.6; margin-bottom: 6px; }
  hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
  .footer { font-size: 11px; color: #aaa; margin-top: 32px; border-top: 1px solid #eee; padding-top: 10px; }
</style>
</head><body>
<h1>📰 ${title}</h1>
${subtitle ? `<div class="meta">${subtitle}</div>` : ''}
${bodyHtml}
</body></html>`, {v, h:'0.3in'}));
    win.document.close();
    win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 400);
}

async function generateNewsletter() {
    const tone = document.getElementById('newsletter-tone')?.value || 'warm';
    const language = document.getElementById('newsletter-language')?.value || 'English';
    const includeUpcoming = document.getElementById('nl-include-upcoming')?.checked;
    const includeEvents = document.getElementById('nl-include-events')?.checked;
    const includeReminders = document.getElementById('nl-include-reminders')?.checked;
    const extra = document.getElementById('newsletter-extra')?.value?.trim() || '';

    const context = buildNewsletterContext();
    const teacherName = aiSettings.teacherName || userProfile.username || 'Your Teacher';
    const grade = aiSettings.grade || '1';
    const isWeek = newsletterMode === 'week';
    const period = isWeek
        ? document.getElementById('current-week')?.textContent || 'This Week'
        : document.getElementById('current-month')?.textContent || 'This Month';

    const toneMap = {
        warm: 'warm, friendly, and encouraging — like a letter from a caring teacher',
        professional: 'professional and informative, clear and concise',
        brief: 'very brief — use bullet points and keep it under 150 words total'
    };

    const sections = [];
    if (includeUpcoming) sections.push('what students are learning');
    if (includeEvents) sections.push('upcoming school events and important dates');
    if (includeReminders) sections.push('homework or preparation reminders');

    const prompt = buildNewsletterPrompt({
        teacherName, grade, scopeLabel: period, toneMap, tone, language,
        context, sections, extra, wordLimit: 300
    });

    await generateNewsletterFromPrompt({
        prompt,
        maxTokens: 1500,
        statusEl: document.getElementById('newsletter-status'),
        outputArea: document.getElementById('newsletter-output-area'),
        outputEl: document.getElementById('newsletter-output'),
        outputLabelEl: document.getElementById('newsletter-output-label'),
        labelText: isWeek ? `Week newsletter · ${period}` : `Monthly newsletter · ${period}`,
        genBtn: document.getElementById('newsletter-generate-btn'),
        readyMessage: '📰 Newsletter ready!',
        saveId: newsletterSaveId(isWeek ? 'week' : 'month')
    });
}

function printNewsletter() {
    const el = document.getElementById('newsletter-output');
    const label = document.getElementById('newsletter-output-label')?.textContent || 'Newsletter';
    const teacherName = aiSettings.teacherName || userProfile.username || 'Teacher';
    if (!el || !el.innerHTML.trim()) { showToast('Generate a newsletter first'); return; }

    openNewsletterPrintWindow({
        title: label,
        subtitle: '',
        bodyHtml: el.innerHTML
    });
}


