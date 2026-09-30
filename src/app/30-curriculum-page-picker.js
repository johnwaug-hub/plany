// ============================================================
// CURRICULUM PAGE PICKER  (Sub Day student work)
// View a curriculum PDF and hand-pick the exact pages to hand
// out for a given class. Selected pages print as ACTUAL pages.
// Selection is stored per class slot in subWorkPages and saved
// with the sub-day packet (classInstructions[slotKey].workPages).
// ============================================================

let subWorkPages = {};                 // { slotKey: [ {resourceId, name, pages:[1,3]} ] }
let emergencyWorkPages = {};           // { "dow::slotKey": [ {resourceId, name, pages} ] }
let _ppCtx = { scope: 'sub', slotKey: null, storeKey: null, resourceId: null, numPages: 0, selected: new Set() };

// Picker scope helpers — the page picker serves both the Sub Day modal and
// the Emergency Sub Plans modal.
function _ppStore(scope) { return scope === 'emergency' ? emergencyWorkPages : subWorkPages; }
function _ppContainerSel(scope) { return scope === 'emergency' ? '#es-day-blocks' : '#sub-schedule-blocks'; }
function _ppBlockSel(scope) { return scope === 'emergency' ? '.es-period-block' : '.sub-class-block'; }
function _ppRawSlot(storeKey, scope) { return scope === 'emergency' ? storeKey.split('::').slice(1).join('::') : storeKey; }
function _ppChipHost(storeKey, scope) {
    const raw = _ppRawSlot(storeKey, scope);
    return document.querySelector(`${_ppContainerSel(scope)} ${_ppBlockSel(scope)}[data-slot-key="${raw}"] .subwork-chips`);
}

// PDF resources we can actually render pages from (need the stored original)
function pickablePdfDocs(subject) {
    const renderable = d => d.storageUrl && (d.fileType === 'application/pdf' || /\.pdf$/i.test(d.name || ''));
    const list = curriculumDocs.filter(renderable);
    list.sort((a, b) => {
        const am = subject && a.subject === subject ? 0 : 1;
        const bm = subject && b.subject === subject ? 0 : 1;
        return am - bm || (a.name || '').localeCompare(b.name || '');
    });
    return list;
}

// Compress a page list to a short label: [1,2,3,5] -> "pp. 1-3, 5"
function summarizePages(pages) {
    if (!pages || !pages.length) return 'no pages';
    const sorted = [...pages].sort((a, b) => a - b);
    const runs = [];
    let start = sorted[0], prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === prev + 1) { prev = sorted[i]; continue; }
        runs.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = prev = sorted[i];
    }
    runs.push(start === prev ? `${start}` : `${start}-${prev}`);
    return (sorted.length === 1 ? 'p. ' : 'pp. ') + runs.join(', ');
}

// Chips shown under each class block
function subWorkChipsHTML(storeKey, scope = 'sub') {
    const sel = _ppStore(scope)[storeKey] || [];
    if (sel.length === 0) return '<span class="subwork-empty">No pages picked yet.</span>';
    return sel.map(s => {
        const nm = (s.name || 'Resource');
        const short = nm.length > 26 ? nm.substring(0, 25) + '…' : nm;
        return `<span class="subwork-chip" title="${escHtml(nm)} — ${escHtml(summarizePages(s.pages))}">📄 ${escHtml(short)} · ${escHtml(summarizePages(s.pages))}<button type="button" class="subwork-chip-x" title="Remove" onclick="removeSubWork('${storeKey}','${s.resourceId}','${scope}')">✕</button></span>`;
    }).join('');
}

function removeSubWork(storeKey, resourceId, scope = 'sub') {
    const store = _ppStore(scope);
    store[storeKey] = (store[storeKey] || []).filter(s => s.resourceId !== resourceId);
    const host = _ppChipHost(storeKey, scope);
    if (host) host.innerHTML = subWorkChipsHTML(storeKey, scope);
    persistPickedPages(scope, storeKey);
}

// v6.9.1: save picked pages right away, so they're on every computer even if
// the packet's Save button is never pressed.
//  - Sub Day: an existing packet gets just its workPicks map updated; a day
//    with no saved packet yet is saved in full (same as pressing Save), so the
//    rest of the form isn't left half-empty on the other computer.
//  - Emergency plans: only that period's workPages.
async function persistPickedPages(scope, storeKey) {
    if (!currentUser || (typeof _previewTeacher !== 'undefined' && _previewTeacher)) return;
    try {
        if (scope === 'emergency') {
            const dow = storeKey.split('::')[0], slotKey = _ppRawSlot(storeKey, scope);
            const workPages = JSON.parse(JSON.stringify(emergencyWorkPages[storeKey] || []));
            await db.collection('users').doc(currentUser.uid).collection('settings').doc('emergencySubPlans')
                .set({ days: { [dow]: { periods: { [slotKey]: { workPages } } } } }, { merge: true });
            if (!emergencySubPlans.days) emergencySubPlans.days = {};
            if (!emergencySubPlans.days[dow]) emergencySubPlans.days[dow] = { periods: {} };
            if (!emergencySubPlans.days[dow].periods) emergencySubPlans.days[dow].periods = {};
            emergencySubPlans.days[dow].periods[slotKey] = { ...(emergencySubPlans.days[dow].periods[slotKey] || {}), workPages };
            return;
        }
        const dateStr = document.getElementById('sub-day-modal')?.dataset.date;
        if (!dateStr) return;
        if (!subDays[dateStr]) { await saveSubDay({ quiet: true }); return; }
        const workPicks = JSON.parse(JSON.stringify(subWorkPages || {}));
        await getYearPath().collection('subDays').doc(dateStr).set({
            workPicks, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        subDays[dateStr] = { ...subDays[dateStr], workPicks };
    } catch (e) {
        console.warn('persistPickedPages:', e.message);
        showToast('⚠️ Pages picked, but not saved to your account yet — press Save.');
    }
}

// Open the picker for a class slot. scope 'sub' (default) or 'emergency'.
async function openPagePicker(slotKey, scope = 'sub', dow = null) {
    const modal = document.getElementById('page-picker-modal');
    if (!modal) return;
    const storeKey = scope === 'emergency' ? `${dow}::${slotKey}` : slotKey;
    // Derive subject + class name from the block
    const block = document.querySelector(`${_ppContainerSel(scope)} ${_ppBlockSel(scope)}[data-slot-key="${slotKey}"]`);
    const classId = block?.dataset.classId;
    const cls = classes.find(c => c.id === classId);
    const subject = cls?.subject || '';
    const clsName = cls?.name || 'Class';

    _ppCtx = { scope, slotKey, storeKey, resourceId: null, numPages: 0, selected: new Set() };
    document.getElementById('pp-title').textContent = '📄 Pick Pages · ' + clsName;

    const sel = document.getElementById('pp-resource-select');
    const thumbs = document.getElementById('pp-thumbs');
    const status = document.getElementById('pp-status');
    thumbs.innerHTML = '';
    sel.innerHTML = '<option value="">…</option>';
    status.textContent = 'Loading your resources…';
    modal.classList.remove('hidden');

    // Self-heal a stale library: if we see no viewable PDFs, re-pull from the
    // cloud in case files were uploaded/attached after this session loaded.
    let pdfs = pickablePdfDocs(subject);
    if (pdfs.length === 0 && typeof loadCurriculumDocs === 'function') {
        try { await loadCurriculumDocs(); } catch (e) { console.warn('picker refresh failed:', e.message); }
        pdfs = pickablePdfDocs(subject);
    }

    if (pdfs.length === 0) {
        sel.innerHTML = '<option value="">— none available —</option>';
        status.innerHTML = 'No viewable PDFs found. A PDF shows up here once its original file is stored — use 📎 Attach (or re-upload it) in the AI tab → Curriculum Library. If you just did that, refresh the page.';
        updatePpCount();
        return;
    }
    sel.innerHTML = '<option value="">— choose a resource —</option>' +
        pdfs.map(d => `<option value="${d.id}">${escHtml(d.name)}${subject && d.subject === subject ? ' ★' : ''}</option>`).join('');
    status.textContent = `Choose a resource above to view its pages. (${pdfs.length} available)`;
    updatePpCount();
}

// Render a chosen resource's pages as tappable thumbnails
async function pagePickerLoadResource(resourceId) {
    await Promise.all([ensureLib('pdfjs')]);
    if (!resourceId) { document.getElementById('pp-thumbs').innerHTML = ''; return; }
    const doc = curriculumDocs.find(d => d.id === resourceId);
    if (!doc || !doc.storageUrl) { showToast('That resource has no viewable file.'); return; }
    _ppCtx.resourceId = resourceId;

    // Seed from any existing selection for this slot + resource
    const existing = (_ppStore(_ppCtx.scope)[_ppCtx.storeKey] || []).find(s => s.resourceId === resourceId);
    _ppCtx.selected = new Set(existing?.pages || []);

    const thumbs = document.getElementById('pp-thumbs');
    const status = document.getElementById('pp-status');
    thumbs.innerHTML = '';
    status.textContent = 'Loading pages…';

    try {
        if (typeof initPdfWorker === 'function') initPdfWorker();
        const resp = await fetch(doc.storageUrl);
        if (!resp.ok) throw new Error('could not fetch file');
        const buf = await resp.arrayBuffer();
        // v6.5.0: free the previous PDF, and stop an older render loop if the
        // teacher switched resources mid-way (thumbnails used to mix).
        const runId = (_ppCtx.runId = (_ppCtx.runId || 0) + 1);
        try { _ppCtx.pdf?.destroy(); } catch (_) {}
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
        if (runId !== _ppCtx.runId) { pdf.destroy(); return; }
        _ppCtx.pdf = pdf;
        _ppCtx.numPages = pdf.numPages;
        const cap = Math.min(pdf.numPages, 300); // safety ceiling only
        for (let p = 1; p <= cap; p++) {
            if (runId !== _ppCtx.runId) return;
            status.textContent = `Rendering pages… ${p} / ${cap}`;
            try {
                const page = await pdf.getPage(p);
                const viewport = page.getViewport({ scale: 0.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                const url = canvas.toDataURL('image/jpeg', 0.7);
                const div = document.createElement('div');
                div.className = 'pp-thumb' + (_ppCtx.selected.has(p) ? ' selected' : '');
                div.dataset.page = p;
                div.innerHTML = `<img src="${url}" alt="page ${p}"><div class="pp-thumb-num">${p}</div><div class="pp-thumb-check">✓</div>`;
                div.onclick = () => togglePpThumb(div);
                thumbs.appendChild(div);
            } catch (pageErr) {
                // A single bad page must NOT stop the rest — add a selectable placeholder.
                console.warn('page render failed:', p, pageErr.message);
                const div = document.createElement('div');
                div.className = 'pp-thumb pp-thumb-failed' + (_ppCtx.selected.has(p) ? ' selected' : '');
                div.dataset.page = p;
                div.innerHTML = `<div class="pp-thumb-fail">Page ${p}<span>preview unavailable</span></div><div class="pp-thumb-num">${p}</div><div class="pp-thumb-check">✓</div>`;
                div.onclick = () => togglePpThumb(div);
                thumbs.appendChild(div);
            }
        }
        status.textContent = pdf.numPages > cap
            ? `Showing first ${cap} of ${pdf.numPages} pages. Tap pages to select.`
            : `${pdf.numPages} page${pdf.numPages !== 1 ? 's' : ''}. Tap pages to select.`;
        updatePpCount();
    } catch (e) {
        console.error('pagePickerLoadResource:', e);
        status.textContent = '❌ Could not load this PDF (' + (e.message || 'error') + ').';
    }
}

function togglePpThumb(div) {
    const p = parseInt(div.dataset.page, 10);
    if (_ppCtx.selected.has(p)) { _ppCtx.selected.delete(p); div.classList.remove('selected'); }
    else { _ppCtx.selected.add(p); div.classList.add('selected'); }
    updatePpCount();
}

function pagePickerSelectAll(all) {
    document.querySelectorAll('#pp-thumbs .pp-thumb').forEach(div => {
        const p = parseInt(div.dataset.page, 10);
        if (all) { _ppCtx.selected.add(p); div.classList.add('selected'); }
        else { _ppCtx.selected.delete(p); div.classList.remove('selected'); }
    });
    updatePpCount();
}

function updatePpCount() {
    const c = document.getElementById('pp-count');
    const n = _ppCtx.selected?.size || 0;
    if (c) c.textContent = `${n} page${n !== 1 ? 's' : ''} selected`;
}

function pagePickerSave() {
    const { storeKey, scope, resourceId } = _ppCtx;
    if (!resourceId) { showToast('Choose a resource first.'); return; }
    const doc = curriculumDocs.find(d => d.id === resourceId);
    const pages = [..._ppCtx.selected].sort((a, b) => a - b);
    const store = _ppStore(scope);
    if (!store[storeKey]) store[storeKey] = [];
    // Replace any prior selection for this resource
    const arr = store[storeKey].filter(s => s.resourceId !== resourceId);
    if (pages.length > 0) arr.push({ resourceId, name: doc?.name || 'Resource', pages });
    store[storeKey] = arr;

    const host = _ppChipHost(storeKey, scope);
    if (host) host.innerHTML = subWorkChipsHTML(storeKey, scope);
    document.getElementById('page-picker-modal').classList.add('hidden');
    showToast(pages.length ? `✅ ${pages.length} page${pages.length !== 1 ? 's' : ''} added` : 'Selection cleared for that resource');
    persistPickedPages(scope, storeKey);
}

// Render specific page numbers of a PDF to full-size JPEG data URLs
async function renderPdfPagesByNumber(url, pageNums) {
    await Promise.all([ensureLib('pdfjs')]);
    const out = [];
    try {
        if (typeof initPdfWorker === 'function') initPdfWorker();
        const resp = await fetch(url);
        if (!resp.ok) return out;
        const buf = await resp.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
        for (const p of pageNums) {
            if (p < 1 || p > pdf.numPages) continue;
            const page = await pdf.getPage(p);
            const viewport = page.getViewport({ scale: 1.6 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            out.push(canvas.toDataURL('image/jpeg', 0.85));
        }
        try { pdf.destroy(); } catch (_) {}
    } catch (e) {
        console.warn('renderPdfPagesByNumber:', e.message);
    }
    return out;
}

// Print the hand-picked pages as a student work packet, grouped by class
async function printSubDayPickedPages(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];
    const dayClasses = classes.filter(c => c.schedule && c.schedule[dayKey] && isClassActiveOnDate(c, dateStr));
    const slots = getSortedClassSlots(dayClasses, dayKey);

    const groups = [];
    slots.forEach(({ cls, slotIndex: si, slot, slotCount }) => {
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        const sel = subWorkPages[slotKey] || [];
        if (sel.length) groups.push({ className: cls.name, sel });
    });
    printPickedPagesPacket(groups, `Student Work — ${date.toLocaleDateString('en-US')}`);
}

// Print arbitrary HTML via a hidden iframe (fallback when window.open is
// blocked, e.g. inside the packaged desktop app).
// v6.2.0: a print window that still works when pop-ups are blocked (common
// in the installed desktop app). If window.open() is refused, the HTML is
// collected and printed from a hidden iframe instead of crashing on
// win.document.
function openPrintWindow() {
    const w = window.open('', '_blank');
    if (w) return w;
    let buf = '', printed = false;
    const flush = () => { if (printed || !buf) return; printed = true; printHtmlViaIframe(buf); };
    return {
        document: {
            open() { buf = ''; printed = false; },
            write(h) { buf += h; },
            close() { flush(); },
            querySelectorAll() { return []; }
        },
        focus() {}, print() {}, close() {},
        set onload(_fn) {}, get onload() { return null; }
    };
}

function printHtmlViaIframe(html) {
    const old = document.getElementById('pk-print-frame');
    if (old) old.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'pk-print-frame';
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const d = iframe.contentWindow.document;
    d.open();
    d.write(html);
    d.close();
    setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {} }, 600);
}

// Shared: render hand-picked pages (groups = [{className, sel:[{resourceId,pages}]}]) to a print window.
async function printPickedPagesPacket(groups, title) {
    if (!groups || groups.length === 0) {
        showToast('No pages picked yet — use “➕ Pick pages” under a class.');
        return;
    }
    const win = window.open('', '_blank');
    if (win) {
        win.document.write('<!DOCTYPE html><body style="font-family:Segoe UI,Arial,sans-serif;padding:48px;color:#666;">📄 Rendering your selected pages…</body>');
        win.document.close();
    }
    showLoading();
    const lt = document.querySelector('.loading-text');
    if (lt) lt.textContent = 'Rendering selected pages…';

    try {
        let body = '';
        for (const g of groups) {
            for (const s of g.sel) {
                const doc = curriculumDocs.find(d => d.id === s.resourceId);
                if (!doc || !doc.storageUrl) continue;
                const imgs = await renderPdfPagesByNumber(doc.storageUrl, s.pages);
                imgs.forEach((src, i) => {
                    body += `<div class="pk-page"><img src="${src}"></div>`;
                });
            }
        }
        if (!body) { showToast('Could not render the selected pages.'); if (win) win.close(); return; }
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          html, body { margin:0; padding:0; }
          @page { margin:0; }
          .pk-page { page-break-after:always; page-break-inside:avoid; text-align:center; line-height:0; }
          .pk-page:last-child { page-break-after:auto; }
          /* Fit each worksheet within a single page in BOTH dimensions so it
             never overflows onto a second (near-blank) page. */
          .pk-page img { display:inline-block; width:auto; height:auto; max-width:100%; max-height:100vh; vertical-align:top; }
        </style></head><body>${body}</body></html>`;
        if (win) {
            win.document.open();
            win.document.write(html);
            win.document.close();
            // Images are inline base64, so don't wait on onload (it may have
            // already fired for the placeholder doc) — print after a short beat.
            setTimeout(() => { try { win.focus(); win.print(); } catch (e) {} }, 500);
        } else {
            // Pop-up blocked (common in the desktop app) — print via hidden iframe.
            printHtmlViaIframe(html);
        }
    } catch (e) {
        console.error('printPickedPagesPacket:', e);
        showToast('❌ Could not build the packet: ' + (e.message || 'error'));
        if (win) win.close();
    } finally {
        hideLoading();
    }
}


