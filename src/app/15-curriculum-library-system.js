// ============================================
// CURRICULUM LIBRARY SYSTEM
// ============================================

let curriculumDocs = [];

// ── Extractors ──────────────────────────────────────────────────────────────

async function readFileAsText(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result || '');
        reader.onerror = () => resolve('');
        reader.readAsText(file);
    });
}

async function readFileAsArrayBuffer(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsArrayBuffer(file);
    });
}

// Extract text from a PDF file using PDF.js (already loaded for calendar import)
async function extractTextFromPdf(file) {
    await Promise.all([ensureLib('pdfjs')]);
    try {
        const ab = await readFileAsArrayBuffer(file);
        if (!ab) return '';
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab), isEvalSupported: false }).promise;
        let fullText = '';
        const maxPages = Math.min(pdf.numPages, 20); // cap at 20 pages
        for (let p = 1; p <= maxPages; p++) {
            const page = await pdf.getPage(p);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        try { pdf.destroy(); } catch (_) {}
        return fullText.trim().substring(0, 12000);
    } catch (e) {
        console.warn('PDF text extraction failed for', file.name, e);
        return '';
    }
}

// Extract readable text from a single file object
// Extract text from a PowerPoint (.pptx) file using JSZip + XML parsing
async function extractTextFromPptx(file) {
    await Promise.all([ensureLib('jszip')]);
    try {
        const ab = await readFileAsArrayBuffer(file);
        if (!ab) return '';
        const zip = await JSZip.loadAsync(ab);

        // Collect all slide XML files in order
        const slideKeys = Object.keys(zip.files)
            .filter(k => k.match(/^ppt\/slides\/slide\d+\.xml$/))
            .sort((a, b) => {
                const na = parseInt(a.match(/\d+/)[0]);
                const nb = parseInt(b.match(/\d+/)[0]);
                return na - nb;
            });

        let fullText = '';
        for (const key of slideKeys) {
            const xml = await zip.files[key].async('string');
            // Extract all <a:t> text nodes (DrawingML text runs)
            const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
            const slideText = matches
                .map(m => m.replace(/<[^>]+>/g, '').trim())
                .filter(Boolean)
                .join(' ');
            if (slideText) fullText += slideText + '\n';
        }

        // Also grab notes if present
        const noteKeys = Object.keys(zip.files)
            .filter(k => k.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/));
        for (const key of noteKeys.slice(0, 10)) {
            const xml = await zip.files[key].async('string');
            const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
            const noteText = matches
                .map(m => m.replace(/<[^>]+>/g, '').trim())
                .filter(Boolean)
                .join(' ');
            if (noteText) fullText += '[Notes] ' + noteText + '\n';
        }

        return fullText.trim().substring(0, 12000);
    } catch (e) {
        console.warn('PPTX extraction failed:', file.name, e);
        return '';
    }
}

async function extractContentFromFile(file) {
    const name = file.name.toLowerCase();
    const type = file.type || '';

    // PDFs — extract text using PDF.js
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
        return await extractTextFromPdf(file);
    }

    // PowerPoint — extract text via JSZip + DrawingML XML parsing
    if (name.endsWith('.pptx') ||
        type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        return await extractTextFromPptx(file);
    }

    // Plain text / markdown / CSV / JSON
    if (type === 'text/plain' || type === 'text/csv' || type === 'application/json'
        || name.endsWith('.txt') || name.endsWith('.md')
        || name.endsWith('.csv') || name.endsWith('.json')) {
        const text = await readFileAsText(file);
        return text.substring(0, 12000);
    }

    return '';
}

// Unpack a ZIP and return array of { name, subject, content, size, fileType }
async function extractZipContents(file, subject, resourceType, description) {
    await Promise.all([ensureLib('jszip'), ensureLib('pdfjs')]);
    const ab = await readFileAsArrayBuffer(file);
    if (!ab) return [];
    const zip   = await JSZip.loadAsync(ab);
    const items = [];
    const skipPrefixes = ['__MACOSX/', '.'];

    for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const filename = path.split('/').pop();
        if (!filename || skipPrefixes.some(p => path.startsWith(p) || filename.startsWith('.'))) continue;

        const ext = filename.split('.').pop().toLowerCase();
        const textExts = ['txt','md','csv','json'];
        let content = '';
        let fileType = ext;

        if (textExts.includes(ext)) {
            const raw = await entry.async('string');
            content = raw.substring(0, 12000);
            fileType = 'text/' + ext;
        } else if (ext === 'pdf') {
            // Extract text from PDF inside ZIP using PDF.js
            try {
                const pdfBytes = await entry.async('uint8array');
                const pdf = await pdfjsLib.getDocument({ data: pdfBytes, isEvalSupported: false }).promise;
                let pdfText = '';
                const maxPages = Math.min(pdf.numPages, 20);
                for (let p = 1; p <= maxPages; p++) {
                    const page = await pdf.getPage(p);
                    const tc = await page.getTextContent();
                    pdfText += tc.items.map(i => i.str).join(' ') + '\n';
                }
                content = pdfText.trim().substring(0, 12000);
            } catch (e) {
                console.warn('PDF extract failed inside ZIP:', filename, e);
            }
            fileType = 'application/pdf';
        } else if (ext === 'pptx') {
            // Extract text from PowerPoint inside ZIP
            try {
                const pptxBytes = await entry.async('uint8array');
                const pptxBlob = new Blob([pptxBytes]);
                const pptxFile = new File([pptxBlob], filename);
                content = await extractTextFromPptx(pptxFile);
            } catch (e) {
                console.warn('PPTX extract failed inside ZIP:', filename, e);
            }
            fileType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        }

        const blob = await entry.async('uint8array');

        // Keep the ORIGINAL of every unpacked file in Storage — stored as-is,
        // regardless of type. PDFs also become viewable in the page picker.
        let storageUrl = null, storagePath = null;
        {
            const _lt = document.querySelector('.loading-text');
            if (_lt) _lt.textContent = `Saving ${filename} to cloud…`;
            const ctMap = {
                pdf:  'application/pdf',
                pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                png:  'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
                txt:  'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json'
            };
            const up = await uploadBytesToStorage(blob, filename, currentUser.uid, ctMap[ext] || undefined);
            storageUrl = up.storageUrl;
            storagePath = up.storagePath;
        }

        items.push({
            name: filename,
            fromZip: file.name,
            subject,
            resourceType,
            description: description || '',
            content,
            size: blob.length,
            fileType,
            hasContent: content.length > 0,
            storageUrl,
            storagePath,
            uploadedAt: new Date().toISOString()
        });
    }
    return items;
}

// ── Curriculum Library ───────────────────────────────────────────────────────

function initCurriculumLibrary() {
    const uploadBtn    = document.getElementById('upload-curriculum-btn');
    const fileInput    = document.getElementById('curriculum-file-upload');
    const zipBtn       = document.getElementById('upload-curriculum-zip-btn');
    const zipInput     = document.getElementById('curriculum-zip-upload');

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleCurriculumUpload);
    }
    if (zipBtn && zipInput) {
        zipBtn.addEventListener('click', () => zipInput.click());
        zipInput.addEventListener('change', handleCurriculumUpload);
    }

    // Filter buttons
    document.querySelectorAll('.curriculum-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.curriculum-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderCurriculumLibrary(btn.dataset.filter);
        });
    });

    loadCurriculumDocs();
}

async function loadCurriculumDocs() {
    if (!currentUser) return;
    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('curriculum').orderBy('uploadedAt', 'desc').get();
        curriculumDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCurriculumLibrary();
    } catch (error) {
        console.error('Error loading curriculum:', error);
    }
}


// ── Upload a file to Firebase Storage and return its download URL ────────
async function uploadFileToStorage(file, uid) {
    try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `users/${uid}/curriculum/${Date.now()}_${safeName}`;
        const ref = storage.ref(path);
        const snapshot = await ref.put(file);
        const url = await snapshot.ref.getDownloadURL();
        return { storageUrl: url, storagePath: path };
    } catch (e) {
        console.warn('Storage upload failed (text extraction only):', e.message);
        return { storageUrl: null, storagePath: null };
    }
}

// Upload raw bytes (e.g. a file unpacked from a ZIP) so the ORIGINAL is kept —
// this is what lets PDFs render as actual pages in the page picker.
async function uploadBytesToStorage(bytes, filename, uid, contentType) {
    try {
        const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        const rand = Math.random().toString(36).slice(2, 7);
        const path = `users/${uid}/curriculum/${Date.now()}_${rand}_${safeName}`;
        const ref = storage.ref(path);
        const snapshot = await ref.put(bytes, contentType ? { contentType } : undefined);
        const url = await snapshot.ref.getDownloadURL();
        return { storageUrl: url, storagePath: path };
    } catch (e) {
        console.warn('Storage bytes upload failed:', filename, e.message);
        return { storageUrl: null, storagePath: null };
    }
}

async function handleCurriculumUpload(e) {
    const files   = Array.from(e.target.files || []);
    if (!files.length) return;

    const subject      = document.getElementById('curriculum-subject')?.value || 'other';
    const resourceType = document.getElementById('curriculum-resource-type')?.value || 'other';
    const description  = document.getElementById('curriculum-description')?.value?.trim() || '';

    showLoading();
    document.querySelector('.loading-text').textContent = 'Processing resources...';

    let totalAdded = 0;

    for (const file of files) {
        const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';

        if (isZip) {
            // Unpack zip and save each file as its own resource
            document.querySelector('.loading-text').textContent = `Unpacking ${file.name}...`;
            try {
                const items = await extractZipContents(file, subject, resourceType, description);
                for (const item of items) {
                    const docRef = await db.collection('users').doc(currentUser.uid)
                        .collection('curriculum').add(item);
                    curriculumDocs.unshift({ id: docRef.id, ...item });
                    totalAdded++;
                }
                updateYearChecklist();
                showToast(`✅ Unpacked ${items.length} files from ${file.name}`);
            } catch (err) {
                console.error('ZIP error:', err);
                showToast(`❌ Could not unpack ${file.name}`);
            }
        } else {
            // Single file
            const isPdf  = file.name.toLowerCase().endsWith('.pdf');
            const isPptx = file.name.toLowerCase().endsWith('.pptx');
            document.querySelector('.loading-text').textContent = isPdf
                ? `Extracting text from ${file.name}…`
                : isPptx
                ? `Reading slides from ${file.name}…`
                : `Processing ${file.name}...`;
            try {
                const content = await extractContentFromFile(file);
                document.querySelector('.loading-text').textContent = `Saving ${file.name} to cloud…`;
                const { storageUrl, storagePath } = await uploadFileToStorage(file, currentUser.uid);
                const docData = {
                    name: file.name,
                    subject,
                    resourceType,
                    description,
                    fileType: file.type || file.name.split('.').pop(),
                    size: file.size,
                    content,
                    hasContent: content.length > 0,
                    storageUrl: storageUrl || null,
                    storagePath: storagePath || null,
                    uploadedAt: new Date().toISOString()
                };
                const docRef = await db.collection('users').doc(currentUser.uid)
                    .collection('curriculum').add(docData);
                curriculumDocs.unshift({ id: docRef.id, ...docData });
                totalAdded++;
                if (!storageUrl) {
                    // Original file did NOT store — only text/metadata was saved.
                    showToast(`⚠️ ${file.name}: saved, but the original file couldn't upload (deploy Storage rules).`);
                } else {
                    showToast(`✅ Added: ${file.name}`);
                }
            } catch (err) {
                console.error('Upload error:', err);
                showToast(`❌ Error uploading ${file.name}`);
            }
        }
    }

    e.target.value = '';
    renderCurriculumLibrary();
    hideLoading();
    if (totalAdded > 1) showToast(`✅ ${totalAdded} resources added to your library`);
}

function renderCurriculumLibrary(filter = 'all') {
    const container = document.getElementById('curriculum-library-list');
    if (!container) return;

    const filtered = filter === 'all'
        ? curriculumDocs
        : curriculumDocs.filter(d => d.subject === filter);

    if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-state">${filter === 'all' ? 'No resources uploaded yet.' : 'No ' + filter + ' resources yet.'}</p>`;
        return;
    }

    const subjectIcons = { math:'📐', ela:'📖', phonics:'🔤', science:'🔬', social:'🌍', other:'📁' };
    const typeLabels   = { worksheet:'📝 Worksheet', reading:'📖 Reading', 'word-list':'🔤 Word List',
        activity:'🎮 Activity', 'lesson-guide':'📋 Guide', 'answer-key':'✅ Answer Key', other:'📁 Other' };

    const isPdfDoc = d => d.fileType === 'application/pdf' || (d.name || '').toLowerCase().endsWith('.pdf');

    const bulkBar = `
        <div class="curr-bulk-bar">
            <label class="curr-selectall"><input type="checkbox" id="curr-select-all" onchange="toggleSelectAllCurriculum(this)"> Select all</label>
            <span class="curr-bulk-hint">${filtered.length} shown</span>
            <button type="button" id="curr-delete-selected" class="btn btn-sm btn-danger" onclick="deleteCurriculumSelected()" disabled>🗑️ Delete selected (0)</button>
        </div>`;

    container.innerHTML = bulkBar + filtered.map(doc => {
        const pdf = isPdfDoc(doc);
        const pageStatus = pdf
            ? (doc.storageUrl
                ? '<span class="curriculum-content-badge curr-pages-yes">📄 pages ready</span>'
                : '<span class="curriculum-content-badge curr-pages-no">⚠️ no file — attach to use pages</span>')
            : '';
        return `
        <div class="curriculum-doc-item" data-id="${doc.id}">
            <input type="checkbox" class="curr-select" value="${doc.id}" onchange="updateCurrSelCount()" title="Select for bulk delete">
            <span class="curriculum-doc-icon">${subjectIcons[doc.subject] || '📄'}</span>
            <div class="curriculum-doc-info">
                <div class="curriculum-doc-name">${escHtml(doc.name)}</div>
                <div class="curriculum-doc-meta curriculum-doc-meta-editable">
                    <select class="curriculum-inline-select" data-id="${doc.id}" data-field="subject"
                        onchange="updateCurriculumField('${doc.id}','subject',this.value)"
                        title="Edit subject">
                        ${['math','ela','phonics','science','social','other'].map(s =>
                            `<option value="${s}" ${doc.subject===s?'selected':''}>${subjectIcons[s]||'📁'} ${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
                        ).join('')}
                    </select>
                    <select class="curriculum-inline-select" data-id="${doc.id}" data-field="resourceType"
                        onchange="updateCurriculumField('${doc.id}','resourceType',this.value)"
                        title="Edit resource type">
                        ${Object.entries(typeLabels).map(([k,v]) =>
                            `<option value="${k}" ${doc.resourceType===k?'selected':''}>${v}</option>`
                        ).join('')}
                    </select>
                    <span class="curriculum-doc-size">${formatFileSize(doc.size)}</span>
                    ${doc.fromZip ? `<span class="curriculum-zip-badge" title="From ${doc.fromZip}">🗜️ ZIP</span>` : ''}
                </div>
                ${doc.description ? `<div class="curriculum-doc-desc">${doc.description}</div>` : ''}
                ${doc.hasContent
                    ? `<span class="curriculum-content-badge curriculum-content-yes">✅ AI-readable</span>`
                    : `<span class="curriculum-content-badge curriculum-content-no">📄 Name only</span>`}
                ${pageStatus}
            </div>
            <div class="curriculum-doc-actions">
                ${doc.content ? `<button class="btn btn-icon-sm" onclick="previewCurriculumDoc('${doc.id}')" title="Preview content">👁</button>` : ''}
                ${!doc.storageUrl ? `<button class="btn btn-icon-sm" onclick="attachOriginalToDoc('${doc.id}')" title="Attach the original file so it's stored as-is${pdf ? ' and usable in the page picker' : ''}">📎</button>` : ''}
                ${!doc.hasContent && (doc.fileType === 'application/pdf' || doc.name?.endsWith('.pdf'))
                    ? `<button class="btn btn-icon-sm" onclick="reExtractPdf('${doc.id}')" title="Extract text from PDF">🔄</button>` : ''}
                ${!doc.hasContent && (doc.name?.toLowerCase().endsWith('.pptx') ||
                    doc.fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
                    ? `<button class="btn btn-icon-sm" onclick="reExtractPptx('${doc.id}')" title="Extract text from PowerPoint">🔄</button>` : ''}
                ${friends.length > 0 ? `<button class="btn btn-icon-sm btn-share-resource" onclick="openShareResourceModal('${doc.id}')" title="Share with a colleague">📤</button>` : ''}
                <button class="btn btn-icon-sm btn-danger" onclick="deleteCurriculumDoc('${doc.id}')" title="Delete">🗑️</button>
            </div>
        </div>`;
    }).join('');
    updateCurrSelCount();
}

function previewCurriculumDoc(docId) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc || !doc.content) return;
    const preview = doc.content.substring(0, 800);
    planyAlert(`${preview}${doc.content.length > 800 ? '\n\n[... content continues ...]' : ''}`, { title: `📄 ${doc.name}` });
}

// Re-extract text from a PDF that was previously uploaded without text
function reExtractPdf(docId) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.name !== doc.name) {
            showToast('⚠️ Please select the same file: ' + doc.name);
            return;
        }
        showLoading();
        document.querySelector('.loading-text').textContent = 'Extracting text from ' + file.name + '…';
        try {
            const content = await extractTextFromPdf(file);
            if (!content) { showToast('⚠️ No text found — PDF may be a scanned image'); hideLoading(); return; }
            await db.collection('users').doc(currentUser.uid)
                .collection('curriculum').doc(docId).update({ content, hasContent: true });
            doc.content = content;
            doc.hasContent = true;
            const activeFilter = document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all';
            renderCurriculumLibrary(activeFilter);
            showToast('✅ Extracted ' + content.length + ' characters from ' + file.name);
        } catch (err) {
            console.error('Re-extract error:', err);
            showToast('❌ Could not extract text from PDF');
        }
        hideLoading();
    };
    input.click();
}


// Re-extract text from a PPTX that was previously uploaded without text
function reExtractPptx(docId) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pptx';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.name !== doc.name) {
            showToast('⚠️ Please select the same file: ' + doc.name);
            return;
        }
        showLoading();
        document.querySelector('.loading-text').textContent = 'Reading slides from ' + file.name + '…';
        try {
            const content = await extractTextFromPptx(file);
            if (!content) {
                showToast('⚠️ No text found — slides may contain only images');
                hideLoading();
                return;
            }
            await db.collection('users').doc(currentUser.uid)
                .collection('curriculum').doc(docId).update({ content, hasContent: true });
            doc.content = content;
            doc.hasContent = true;
            const activeFilter = document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all';
            renderCurriculumLibrary(activeFilter);
            showToast('✅ Extracted ' + content.length.toLocaleString() + ' characters from ' + file.name);
        } catch (err) {
            console.error('Re-extract PPTX error:', err);
            showToast('❌ Could not extract text from PowerPoint');
        }
        hideLoading();
    };
    input.click();
}

async function updateCurriculumField(docId, field, value) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;
    doc[field] = value;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('curriculum').doc(docId).update({ [field]: value });
        // Re-render to update icon and active filter if subject changed
        const activeFilter = document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all';
        renderCurriculumLibrary(activeFilter);
    } catch (e) {
        console.error('Update curriculum field error:', e);
        showToast('❌ Could not save change');
    }
}

async function deleteCurriculumDoc(docId) {
    if (!await planyConfirm('Delete this resource?')) return;
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('curriculum').doc(docId).delete();
        curriculumDocs = curriculumDocs.filter(d => d.id !== docId);
        renderCurriculumLibrary(
            document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all'
        );
        showToast('Resource deleted');
    } catch (error) {
        console.error('Error deleting:', error);
    }
}

// ── Multi-select delete ──────────────────────────────────────────────
function updateCurrSelCount() {
    const checked = document.querySelectorAll('.curr-select:checked').length;
    const total = document.querySelectorAll('.curr-select').length;
    const btn = document.getElementById('curr-delete-selected');
    if (btn) {
        btn.textContent = `🗑️ Delete selected (${checked})`;
        btn.disabled = checked === 0;
    }
    const all = document.getElementById('curr-select-all');
    if (all) {
        all.checked = total > 0 && checked === total;
        all.indeterminate = checked > 0 && checked < total;
    }
}

function toggleSelectAllCurriculum(cb) {
    document.querySelectorAll('.curr-select').forEach(c => { c.checked = cb.checked; });
    updateCurrSelCount();
}

async function deleteCurriculumSelected() {
    const ids = Array.from(document.querySelectorAll('.curr-select:checked')).map(c => c.value);
    if (ids.length === 0) return;
    if (!await planyConfirm(`Delete ${ids.length} selected resource${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;

    showLoading();
    const lt = document.querySelector('.loading-text');
    if (lt) lt.textContent = `Deleting ${ids.length} resource${ids.length !== 1 ? 's' : ''}…`;
    let ok = 0;
    const deleted = new Set();
    try {
        const col = db.collection('users').doc(currentUser.uid).collection('curriculum');
        // Firestore batches cap at 500 writes
        for (let i = 0; i < ids.length; i += 400) {
            const chunk = ids.slice(i, i + 400);
            const batch = db.batch();
            chunk.forEach(id => batch.delete(col.doc(id)));
            await batch.commit();
            ok += chunk.length;
            chunk.forEach(id => deleted.add(id));
            // Best-effort: also remove any stored original files
            chunk.forEach(id => {
                const d = curriculumDocs.find(x => x.id === id);
                if (d?.storagePath) { try { storage.ref(d.storagePath).delete().catch(() => {}); } catch (e) {} }
            });
        }
        showToast(`🗑️ Deleted ${ok} resource${ok !== 1 ? 's' : ''}`);
    } catch (e) {
        console.error('Bulk delete error:', e);
        showToast(`❌ Deleted ${ok} of ${ids.length}; the rest failed: ` + (e.message || 'error'));
    } finally {
        // v6.5.0: drop whatever WAS deleted from the list, even after a failure
        curriculumDocs = curriculumDocs.filter(d => !deleted.has(d.id));
        renderCurriculumLibrary(document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all');
        hideLoading();
    }
}

// ── Attach an original file to an existing doc (backfill storageUrl) ──
// Lets a PDF that was uploaded without its original become viewable in the
// page picker — no need to delete and re-create the resource.
function attachOriginalToDoc(docId) {
    const doc = curriculumDocs.find(d => d.id === docId);
    if (!doc) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        showLoading();
        const lt = document.querySelector('.loading-text');
        if (lt) lt.textContent = `Attaching ${file.name}…`;
        try {
            const { storageUrl, storagePath } = await uploadFileToStorage(file, currentUser.uid);
            if (!storageUrl) {
                showToast('❌ File could not upload — deploy the Storage rules first.');
                return;
            }
            const update = { storageUrl, storagePath };
            const t = file.type || '';
            if (t) update.fileType = t;                       // keep the real type
            else if (/\.pdf$/i.test(file.name)) update.fileType = 'application/pdf';
            await db.collection('users').doc(currentUser.uid).collection('curriculum').doc(docId).update(update);
            Object.assign(doc, update);
            renderCurriculumLibrary(document.querySelector('.curriculum-filter-btn.active')?.dataset?.filter || 'all');
            const isPdfNow = (update.fileType || doc.fileType) === 'application/pdf' || /\.pdf$/i.test(doc.name || '');
            showToast(`✅ Original stored for “${doc.name}”${isPdfNow ? ' — now usable in the page picker' : ''}`);
        } catch (e) {
            console.error('attachOriginalToDoc:', e);
            showToast('❌ Could not attach file: ' + (e.message || 'error'));
        } finally {
            hideLoading();
        }
    };
    input.click();
}

