// ============================================================
// PARENT COMMUNICATION LOG
// ============================================================
// communications declared at top of file

async function loadCommunications() {
    try {
        const snap = await getYearPath().collection('communications').orderBy('date','desc').get();
        communications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window._commsYear = settings.schoolYear;   // v6.2.0: reload after a year switch
    } catch(e) { console.warn('loadCommunications:', e.message); communications = []; }
}

function populateCommsFilters() {
    const sel = document.getElementById('comms-student-filter');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">All students</option>';
    students.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.firstName + ' ' + (s.lastName||'');
        sel.appendChild(o);
    });
    sel.value = cur;

    const cSel = document.getElementById('comm-student');
    if (cSel) {
        cSel.innerHTML = '<option value="">Select student…</option>';
        students.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id;
            o.textContent = s.firstName + ' ' + (s.lastName||'');
            cSel.appendChild(o);
        });
    }
}

function renderCommsLog() {
    const wrap = document.getElementById('comms-log-wrap');
    if (!wrap) return;
    const sFilter = document.getElementById('comms-student-filter')?.value || '';
    const mFilter = document.getElementById('comms-method-filter')?.value || '';

    let list = communications;
    if (sFilter) list = list.filter(c => c.studentId === sFilter);
    if (mFilter) list = list.filter(c => c.method === mFilter);

    if (!list.length) {
        wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;padding:1rem 0;">No contacts logged yet. Click <strong>+ Log Contact</strong> to start.</p>';
        return;
    }

    const methodIcon = { phone:'📞', email:'📧', conference:'🤝', note:'📝', text:'💬', other:'📋' };
    const methodColor = { phone:'rgba(30,136,229,.2)', email:'rgba(67,160,71,.2)', conference:'rgba(156,39,176,.2)', note:'rgba(251,140,0,.2)', text:'rgba(0,188,212,.2)', other:'rgba(120,144,156,.2)' };

    let html = '<table class="comms-table"><thead><tr><th>Date</th><th>Student</th><th>Method</th><th>Contact</th><th>By</th><th>Notes</th><th></th></tr></thead><tbody>';
    list.forEach(c => {
        const d = new Date(c.date + 'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
        const icon = methodIcon[c.method] || '📋';
        const bg   = methodColor[c.method] || '';
        const fu   = c.followUp ? '<span class="comm-followup-dot" title="Needs follow-up"></span> ' : '';
        const notes = (c.notes||'').substring(0, 60) + ((c.notes||'').length > 60 ? '…' : '');
        html += `<tr class="comms-row" onclick="openCommModal('${c.id}')">
            <td>${d}</td>
            <td>${c.studentName||'—'}</td>
            <td><span class="comm-method-badge" style="background:${bg}">${icon} ${c.method}</span></td>
            <td style="color:var(--text-secondary)">${c.contactName||'—'}</td>
            <td style="color:var(--text-muted);font-size:0.7rem;">${c.initiatedBy==='parent'?'Parent':'Teacher'}</td>
            <td style="color:var(--text-secondary)">${fu}${notes}</td>
            <td><button class="btn btn-icon" style="font-size:0.7rem;opacity:0.5;" onclick="event.stopPropagation();deleteComm('${c.id}')">🗑️</button></td>
        </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
}

function openCommModal(id) {
    const modal = document.getElementById('comm-modal');
    if (!modal) return;
    document.getElementById('comm-form').reset();
    document.getElementById('comm-id').value = '';
    populateCommsFilters();
    const del = document.getElementById('delete-comm-btn');
    if (id) {
        const c = communications.find(x => x.id === id);
        if (!c) return;
        document.getElementById('comm-modal-title').textContent = '✏️ Edit Contact Log';
        document.getElementById('comm-id').value          = c.id;
        document.getElementById('comm-date').value        = c.date || '';
        document.getElementById('comm-student').value     = c.studentId || '';
        document.getElementById('comm-contact').value     = c.contactName || '';
        document.getElementById('comm-method').value      = c.method || 'phone';
        document.getElementById('comm-initiated').value   = c.initiatedBy || 'teacher';
        document.getElementById('comm-followup').checked  = !!c.followUp;
        document.getElementById('comm-notes').value       = c.notes || '';
        del?.classList.remove('hidden');
    } else {
        document.getElementById('comm-modal-title').textContent = '📞 Log Parent Contact';
        document.getElementById('comm-date').value = formatDate(new Date());
        del?.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

function closeCommModal() {
    document.getElementById('comm-modal')?.classList.add('hidden');
}

document.getElementById('comm-form')?.addEventListener('submit', async(e) => {
    e.preventDefault();
    const sid   = document.getElementById('comm-student').value;
    const s     = students.find(x => x.id === sid);
    const data  = {
        date:        document.getElementById('comm-date').value,
        studentId:   sid,
        studentName: s ? s.firstName + ' ' + (s.lastName||'') : '',
        contactName: document.getElementById('comm-contact').value.trim(),
        method:      document.getElementById('comm-method').value,
        initiatedBy: document.getElementById('comm-initiated').value,
        followUp:    document.getElementById('comm-followup').checked,
        notes:       document.getElementById('comm-notes').value.trim(),
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
    };
    showLoading();
    try {
        const cid = document.getElementById('comm-id').value;
        if (cid) {
            await getYearPath().collection('communications').doc(cid).update(data);
            const i = communications.findIndex(c => c.id === cid);
            if (i >= 0) communications[i] = { ...communications[i], ...data };
        } else {
            const ref = await getYearPath().collection('communications').add(data);
            communications.unshift({ id: ref.id, ...data });
        }
        closeCommModal();
        renderCommsLog();
        showToast('📞 Contact logged!');
    } catch(err) { showToast('Error: ' + err.message); }
    hideLoading();
});

async function deleteComm(id) {
    const cid = id || document.getElementById('comm-id').value;
    if (!cid || !await planyConfirm('Delete this log entry?')) return;
    showLoading();
    try {
        await getYearPath().collection('communications').doc(cid).delete();
        communications = communications.filter(c => c.id !== cid);
        closeCommModal();
        renderCommsLog();
        showToast('Entry deleted.');
    } catch(err) { showToast('Error: ' + err.message); }
    hideLoading();
}


// ============================================================
// QUIZ & RUBRIC GENERATOR
// ============================================================

// Strips common Markdown syntax so AI output displays as clean plain text
// in the preview <div> and the print window (neither renders Markdown).
function stripMarkdown(text) {
    if (!text) return text;
    return text
        .replace(/^#{1,6}\s+/gm, '')          // # Headings
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // ***bold italic***
        .replace(/\*\*(.+?)\*\*/g, '$1')      // **bold**
        .replace(/__(.+?)__/g, '$1')          // __bold__
        .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '$1') // *italic*
        .replace(/(?<!_)_(?!_)(.+?)_(?!_)/g, '$1')      // _italic_
        .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // `code`
        .replace(/^\s*[-*+]\s+/gm, '• ')      // - bullet / * bullet
        .replace(/^\s*>\s?/gm, '');           // > blockquote
}

function setQrMode(mode) {
    _qrMode = mode;
    document.getElementById('qr-quiz-btn')?.classList.toggle('btn-primary', mode === 'quiz');
    document.getElementById('qr-quiz-btn')?.classList.toggle('btn-ghost',   mode !== 'quiz');
    document.getElementById('qr-rubric-btn')?.classList.toggle('btn-primary', mode === 'rubric');
    document.getElementById('qr-rubric-btn')?.classList.toggle('btn-ghost',   mode !== 'rubric');
    document.getElementById('qr-quiz-fields')?.classList.toggle('hidden',   mode !== 'quiz');
    document.getElementById('qr-rubric-fields')?.classList.toggle('hidden', mode !== 'rubric');
    document.getElementById('qr-preview')?.classList.add('hidden');
    document.getElementById('qr-print-btn')?.classList.add('hidden');
    document.getElementById('qr-status').textContent = '';
    _qrOutput = '';
}

async function runQuizRubricGenerator() {
    if (!hasEffectiveAiKey()) { showToast('Add your API key first.'); return; }
    const statusEl  = document.getElementById('qr-status');
    const previewEl = document.getElementById('qr-preview');
    const printBtn  = document.getElementById('qr-print-btn');
    const genBtn    = document.getElementById('qr-generate-btn');
    const grade     = aiSettings.grade || '1';
    const standards = document.getElementById('qr-standards')?.value.trim() || '';

    let prompt = '';
    if (_qrMode === 'quiz') {
        const topic  = document.getElementById('qr-topic')?.value.trim();
        if (!topic) { showToast('Enter a topic.'); return; }
        const numQ   = document.getElementById('qr-num-q')?.value || '10';
        const qtype  = document.getElementById('qr-qtype')?.value || 'mixed';
        const ansKey = document.getElementById('qr-answer-key')?.checked;
        const qtypeLabel = { mixed:'a mix of multiple choice, short answer, true/false, and fill-in-the-blank', multiple_choice:'multiple choice (A/B/C/D)', short_answer:'short answer', true_false:'true/false', fill_blank:'fill in the blank' }[qtype] || qtype;

        prompt = `Create a ${numQ}-question Grade ${grade} quiz on: "${topic}"\n`
            + `Question types: ${qtypeLabel}\n`
            + (standards ? `Standards: ${standards}\n` : '')
            + `\nFormat:\n- Title at the top\n- Name/Date line\n- Numbered questions clearly formatted\n- For multiple choice: indent answer choices A B C D\n- Leave space for student answers on short answer questions\n`
            + (ansKey ? `\nAfter all questions, add an ANSWER KEY section clearly separated by a divider line.\n` : '')
            + `\nWrite for Grade ${grade} reading level. Keep language clear and age-appropriate.`
            + `\nPlain text only — do not use Markdown syntax (no **, ##, backticks, etc.).`;
    } else {
        const task     = document.getElementById('qr-rubric-task')?.value.trim();
        if (!task) { showToast('Enter a task or assignment name.'); return; }
        const criteria = document.getElementById('qr-criteria')?.value || '4';
        const scale    = document.getElementById('qr-scale')?.value || '4';
        prompt = `Create a ${criteria}-criteria, ${scale}-point rubric for Grade ${grade} for the following task: "${task}"\n`
            + (standards ? `Standards: ${standards}\n` : '')
            + `\nFor each criterion provide:\n- A clear criterion name\n- ${scale} performance level descriptions (${Array.from({length:parseInt(scale)},(_,i)=>scale-i).join(', ')} points)\n`
            + `\nFormat as a clear text table with criterion names in the first column and point levels across the top.\nAfter the table, add a Total Points row.\nKeep language positive and descriptive. Write for Grade ${grade}.`
            + `\nPlain text only — do not use Markdown syntax (no **, ##, backticks, etc.).`;
    }

    statusEl.textContent  = '🤖 Generating…';
    previewEl.classList.add('hidden');
    printBtn.classList.add('hidden');
    if (genBtn) genBtn.disabled = true;
    _qrOutput = '';

    try {
        _qrOutput = await callAIText({ prompt, tier: 'fast', maxTokens: 2000 });
        _qrOutput = stripMarkdown(_qrOutput);

        previewEl.textContent = _qrOutput;
        previewEl.classList.remove('hidden');
        printBtn.classList.remove('hidden');
        statusEl.textContent = '';
        const qrTitle = _qrMode === 'quiz'
            ? (document.getElementById('qr-topic')?.value.trim() || 'Quiz')
            : (document.getElementById('qr-rubric-task')?.value.trim() || 'Rubric');
        if (await saveAiOutput(null, { type: _qrMode === 'quiz' ? 'quiz' : 'rubric', label: qrTitle, text: _qrOutput, standards })) {
            statusEl.textContent = '💾 Saved to your list below.';
            refreshQrHistory();
        }
    } catch(e) {
        statusEl.textContent = 'Error: ' + e.message;
    }
    if (genBtn) genBtn.disabled = false;
}

// Saved quizzes & rubrics, listed under the generator
async function refreshQrHistory() {
    const previewEl = document.getElementById('qr-preview');
    if (!previewEl) return;
    let box = document.getElementById('qr-history');
    if (!box) {
        box = document.createElement('div');
        box.id = 'qr-history';
        box.className = 'ai-history';
        previewEl.insertAdjacentElement('afterend', box);
    }
    const items = await listAiOutputs(['quiz', 'rubric']);
    renderAiHistory(box, items, 'Saved quizzes & rubrics', (item) => {
        _qrMode = item.type === 'rubric' ? 'rubric' : 'quiz';
        if (typeof setQrMode === 'function') { try { setQrMode(_qrMode); } catch (_) {} }
        const titleInput = document.getElementById(_qrMode === 'quiz' ? 'qr-topic' : 'qr-rubric-task');
        if (titleInput) titleInput.value = item.label || '';
        _qrOutput = item.text || '';
        previewEl.textContent = _qrOutput;
        previewEl.classList.remove('hidden');
        document.getElementById('qr-print-btn')?.classList.remove('hidden');
        const st = document.getElementById('qr-status');
        if (st) st.textContent = `💾 Saved ${aiSavedStamp(item.savedAt)}`;
    }, refreshQrHistory);
}

document.getElementById('accord-quiz')?.addEventListener('toggle', (e) => { if (e.target.open) refreshQrHistory(); });

// Shared list renderer: title · date · Open · ✕
function renderAiHistory(box, items, heading, onOpen, onChanged) {
    if (!items.length) { box.innerHTML = ''; return; }
    const icon = { quiz: '📝', rubric: '📋', differentiation: '🎯' };
    box.innerHTML = `<div class="ai-history-head">${escHtml(heading)}</div>` + items.map(it => `
        <div class="ai-history-row">
            <button type="button" class="ai-history-open" data-id="${escHtml(it.id)}">
                <span>${icon[it.type] || '✨'} ${escHtml(it.label || 'Untitled')}</span>
                <span class="ai-history-date">${escHtml(aiSavedStamp(it.savedAt))}</span>
            </button>
            <button type="button" class="btn btn-icon-sm ai-history-del" data-id="${escHtml(it.id)}" aria-label="Delete ${escHtml(it.label || 'saved item')}" title="Delete">✕</button>
        </div>`).join('');
    box.querySelectorAll('.ai-history-open').forEach(b => b.addEventListener('click', () => {
        const it = items.find(x => x.id === b.dataset.id);
        if (it) onOpen(it);
    }));
    box.querySelectorAll('.ai-history-del').forEach(b => b.addEventListener('click', async () => {
        const it = items.find(x => x.id === b.dataset.id);
        if (!it || !await planyConfirm(`Delete "${it.label || 'this item'}"?`)) return;
        if (await deleteAiOutput(it.id)) { showToast('Deleted'); onChanged(); }
    }));
}

function printQuizRubric() {
    if (!_qrOutput) return;
    const grade = aiSettings.grade || '1';
    const title = _qrMode === 'quiz'
        ? (document.getElementById('qr-topic')?.value || 'Quiz')
        : (document.getElementById('qr-rubric-task')?.value || 'Rubric');
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>${title}</title>
        <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111; max-width: none; margin: 24px 0; padding: 0; }
        h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
        pre { white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; }
        .no-print { background: #eaf3fb; border: 1px solid #aad4f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
        @media print { .no-print { display: none !important; } }
        </style></head><body>
        <div class="no-print">
            <button onclick="window.print()" style="padding:6px 16px;cursor:pointer;background:#2980b9;color:white;border:none;border-radius:4px;">🖨️ Print</button>
            <span style="margin-left:12px;font-size:13px;color:#555;">Or use browser File → Save as PDF</span>
        </div>
        <pre>${_qrOutput.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
        </body></html>`, {v:'0.4in',h:'0.3in'}));
    win.document.close();
}

