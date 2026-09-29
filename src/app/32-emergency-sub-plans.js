// ============================================================
// EMERGENCY SUB PLANS  (Week view)
// Up to 5 ready-to-go weekday plans (Mon–Fri), each auto-built from
// that weekday's class schedule, with hand-picked student-work pages
// (via the shared page picker). User-scoped: persists across years.
// ============================================================

let emergencySubPlans = { general: {}, days: {} };

const ES_DOWS = ['mon','tue','wed','thu','fri'];
const ES_DOW_LABELS = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday' };
const ES_GENERAL_FIELDS = [
    'es-teacher-name','es-room-grade','es-school',
    'es-morning','es-attendance','es-lunch','es-end-of-day',
    'es-restroom','es-early-finishers','es-behavior',
    'es-medical','es-student-notes','es-helpers',
    'es-neighbor','es-office','es-contact-notes',
    'es-materials-location','es-feedback-prompt'
];
// es- field -> matching saved sub-default key (reuse the teacher's sub defaults)
const ES_DEFAULT_MAP = {
    'es-teacher-name':'sub-teacher-name','es-room-grade':'sub-room-grade','es-school':'sub-school',
    'es-morning':'sub-morning','es-attendance':'sub-attendance','es-lunch':'sub-lunch','es-end-of-day':'sub-end-of-day',
    'es-restroom':'sub-restroom','es-early-finishers':'sub-early-finishers','es-behavior':'sub-behavior-system',
    'es-medical':'sub-medical','es-student-notes':'sub-student-notes','es-helpers':'sub-helpers',
    'es-neighbor':'sub-neighbor','es-office':'sub-office','es-contact-notes':'sub-contact-notes',
    'es-materials-location':'sub-materials-location','es-feedback-prompt':'sub-feedback-prompt'
};

async function loadEmergencySubPlans() {
    if (!currentUser) return;
    try {
        const doc = await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('emergencySubPlans').get();
        emergencySubPlans = doc.exists ? (doc.data() || {}) : {};
    } catch (e) {
        console.warn('loadEmergencySubPlans:', e.message);
        emergencySubPlans = {};
    }
    if (!emergencySubPlans.general) emergencySubPlans.general = {};
    if (!emergencySubPlans.days) emergencySubPlans.days = {};
}

function openEmergencySubPlans() {
    const modal = document.getElementById('emergency-sub-modal');
    if (!modal) return;
    const g = emergencySubPlans.general || {};

    ES_GENERAL_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const savedKey = id.replace('es-', '');
        let val = g[savedKey];
        if (val === undefined || val === '') {
            const defKey = ES_DEFAULT_MAP[id];
            if (defKey && typeof subDayDefaults !== 'undefined' && subDayDefaults[defKey] !== undefined) val = subDayDefaults[defKey];
        }
        el.value = val || '';
    });

    // Profile fallbacks
    const nameEl = document.getElementById('es-teacher-name');
    if (nameEl && !nameEl.value) nameEl.value = userProfile.username || '';
    const schoolEl = document.getElementById('es-school');
    if (schoolEl && !schoolEl.value) schoolEl.value = userProfile.school || '';
    const gradeEl = document.getElementById('es-room-grade');
    if (gradeEl && !gradeEl.value && userProfile.grade) gradeEl.value = formatGrade(userProfile.grade) || '';
    const fbEl = document.getElementById('es-feedback-prompt');
    if (fbEl && !fbEl.value) fbEl.value = 'Please leave a note describing how the day went, any concerns, or anything not completed. Thank you so much!';

    emergencyWorkPages = {}; // reset picker working state
    const firstWithClasses = ES_DOWS.find(d => classes.some(c => c.schedule && c.schedule[d])) || 'mon';
    modal.dataset.dow = '';
    switchEmergencyDay(firstWithClasses);
    modal.classList.remove('hidden');
}

function switchEmergencyDay(dow) {
    const modal = document.getElementById('emergency-sub-modal');
    if (!modal) return;
    const prev = modal.dataset.dow;
    if (prev && prev !== dow) captureEmergencyDayIntoState(prev);
    modal.dataset.dow = dow;
    document.querySelectorAll('.es-day-tab').forEach(t => t.classList.toggle('active', t.dataset.dow === dow));
    renderEmergencyDayBlocks(dow);
}

function renderEmergencyDayBlocks(dow) {
    const container = document.getElementById('es-day-blocks');
    const emptyEl = document.getElementById('es-day-empty');
    if (!container) return;

    const dayClasses = classes.filter(cls => cls.schedule && cls.schedule[dow]);
    const slots = getSortedClassSlots(dayClasses, dow);
    const savedDay = emergencySubPlans.days?.[dow]?.periods || {};

    if (slots.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    container.innerHTML = slots.map(({ cls, slotIndex: si, slot, slotCount }) => {
        const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
        const storeKey = `${dow}::${slotKey}`;
        // Seed picker working state from saved
        emergencyWorkPages[storeKey] = (savedDay[slotKey]?.workPages) || [];
        const timeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dow);
        const sessionLabel = slotCount > 1 ? ` · Session ${si + 1}` : '';
        const saved = savedDay[slotKey] || {};
        const everyOther = cls.everyOtherWeek
            ? `<span class="es-eow-badge" title="This class meets every other week — check the date before using this plan.">↔ every other week</span>` : '';

        return `
        <div class="es-period-block" data-slot-key="${slotKey}" data-class-id="${cls.id}" style="border-left:4px solid ${cls.color || '#FF6B9D'}">
            <div class="es-period-head">
                <div class="es-period-dot" style="background:${cls.color || '#FF6B9D'}"></div>
                <div class="es-period-title">
                    <strong>${escHtml(cls.name)}${sessionLabel}</strong>
                    <span class="es-period-time">${escHtml(timeStr)}${cls.room ? ' · ' + escHtml(cls.room) : ''}</span>
                </div>
                ${everyOther}
            </div>
            <div class="form-group">
                <label>📌 Generic Sub Instructions <span class="subwork-hint">(shared with this class's Sub Day plans)</span></label>
                <textarea class="form-control es-period-instructions" rows="2"
                    placeholder="What should the sub do this period, no matter the date?">${escHtml((subClassDefaults[cls.id]?.instructions) || saved.instructions || '')}</textarea>
            </div>
            <div class="subwork-section">
                <div class="subwork-head">
                    <label>📄 Student Work Pages <span class="subwork-hint">(hand-pick actual PDF pages)</span></label>
                    <button type="button" class="btn btn-ghost btn-xs" onclick="openPagePicker('${slotKey}','emergency','${dow}')">➕ Pick pages</button>
                </div>
                <div class="subwork-chips">${subWorkChipsHTML(storeKey, 'emergency')}</div>
            </div>
        </div>`;
    }).join('');
}

function captureEmergencyDayIntoState(dow) {
    if (!emergencySubPlans.days) emergencySubPlans.days = {};
    const periods = {};
    document.querySelectorAll('#es-day-blocks .es-period-block').forEach(block => {
        const slotKey = block.dataset.slotKey;
        const classId = block.dataset.classId;
        const storeKey = `${dow}::${slotKey}`;
        const instr = block.querySelector('.es-period-instructions')?.value || '';
        // Generic instructions are per-class and SHARED with the Sub Day builder
        // (both read/write subClassDefaults[classId].instructions).
        if (classId) {
            if (!subClassDefaults[classId]) subClassDefaults[classId] = {};
            subClassDefaults[classId].instructions = instr;
        }
        periods[slotKey] = { workPages: emergencyWorkPages[storeKey] || [] };
    });
    emergencySubPlans.days[dow] = { periods };
}

function captureEmergencyGeneralIntoState() {
    const g = {};
    ES_GENERAL_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) g[id.replace('es-', '')] = el.value;
    });
    emergencySubPlans.general = g;
}

async function saveEmergencySubPlans() {
    const modal = document.getElementById('emergency-sub-modal');
    if (!currentUser) { showToast('Sign in to save.'); return; }
    captureEmergencyGeneralIntoState();
    if (modal?.dataset.dow) captureEmergencyDayIntoState(modal.dataset.dow);

    const payload = {
        general: emergencySubPlans.general || {},
        days: emergencySubPlans.days || {},
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const clean = JSON.parse(JSON.stringify(payload, (k, v) => v === undefined ? null : v));
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('emergencySubPlans').set(clean, { merge: true });
        // Persist the shared per-class generic instructions too, so Sub Day sees them.
        await db.collection('users').doc(currentUser.uid)
            .collection('settings').doc('subClassDefaults').set(subClassDefaults, { merge: true });
        emergencySubPlans = { ...emergencySubPlans, general: clean.general, days: clean.days };
        showToast('✅ Emergency sub plans saved!');
    } catch (e) {
        console.error('saveEmergencySubPlans:', e);
        showToast('❌ Could not save: ' + (e.code || e.message || 'Unknown error'));
    }
}

// ── Printing: instruction packet per weekday ──
function buildEmergencyDayPrintHtml(dow) {
    // v6.0.2: the form saves kebab-case keys ('teacher-name', 'end-of-day'…)
    // but this printout reads camelCase (g.teacherName, g.endOfDay…), so most
    // of the general section printed blank. Read both spellings.
    const rawG = emergencySubPlans.general || {};
    const g = {};
    Object.keys(rawG).forEach(k => {
        g[k] = rawG[k];
        g[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = rawG[k];
    });
    const label = ES_DOW_LABELS[dow] || dow;
    const S = sanitizeForPDF;

    const dayClasses = classes.filter(cls => cls.schedule && cls.schedule[dow]);
    const slots = getSortedClassSlots(dayClasses, dow);
    const periods = emergencySubPlans.days?.[dow]?.periods || {};

    const scheduleHtml = slots.length === 0
        ? '<p style="color:#999;font-style:italic;padding:8px 0;">No classes scheduled for ' + S(label) + '.</p>'
        : slots.map(({ cls, slotIndex: si, slot, slotCount }) => {
            const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
            const timeStr = slot ? formatTimeSlot(slot) : buildTimeStr(cls, dow);
            const sessionLabel = slotCount > 1 ? ' · Session ' + (si + 1) : '';
            const p = periods[slotKey] || {};
            const instrText = (subClassDefaults[cls.id]?.instructions) || p.instructions || '';
            const instr = instrText
                ? '<p style="margin:0 0 6px;white-space:pre-wrap;font-size:13px;">' + S(instrText) + '</p>'
                : '<p style="color:#999;font-size:13px;font-style:italic;">See attached student work pages.</p>';
            const workNote = (p.workPages && p.workPages.length)
                ? '<p style="margin:4px 0;font-size:11px;color:#8e44ad;">📄 Student work: ' + p.workPages.map(w => S(w.name)).join(', ') + ' (see Student Work packet)</p>' : '';
            return '<div style="border-left:5px solid ' + (cls.color || '#FF6B9D') + ';margin-bottom:14px;padding:12px 16px;background:#fafafa;border-radius:4px;page-break-inside:avoid;">'
                + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
                + '<div style="width:14px;height:14px;border-radius:50%;background:' + (cls.color || '#FF6B9D') + ';"></div>'
                + '<strong style="font-size:15px;">' + S(cls.name) + sessionLabel + '</strong>'
                + '<span style="color:#666;font-size:13px;">' + S(timeStr) + (cls.room ? ' · ' + S(cls.room) : '') + '</span>'
                + '</div>' + instr + workNote + '</div>';
        }).join('');

    const field = (val) => val ? '<div class="pf"><div class="pv">' + S(val) + '</div></div>' : '';
    const labeled = (lab, val) => val ? '<div class="pf"><div class="pl">' + lab + '</div><div class="pv">' + S(val) + '</div></div>' : '';

    return `
<div class="es-packet">
  <div class="es-head">
    <div class="es-head-left"><div class="es-badge">🆘 EMERGENCY SUB PLAN</div><h1>${S(label)}</h1></div>
    <div class="es-head-right">
      ${g.teacherName ? '<div class="ir"><strong>Teacher:</strong> ' + S(g.teacherName) + '</div>' : ''}
      ${g.roomGrade ? '<div class="ir"><strong>Room / Grade:</strong> ' + S(g.roomGrade) + '</div>' : ''}
      ${g.school ? '<div class="ir"><strong>School:</strong> ' + S(g.school) + '</div>' : ''}
    </div>
  </div>
  <div class="sec b"><h2>🌅 Morning Routine</h2>${field(g.morning)}${labeled('Attendance', g.attendance)}${labeled('Lunch Count', g.lunch)}${(!g.morning && !g.attendance && !g.lunch) ? '<div class="pf"><div class="pv em">Follow the posted morning routine.</div></div>' : ''}</div>
  <div class="sec g"><h2>📋 Classroom Procedures</h2>${labeled('Restroom', g.restroom)}${labeled('Early Finishers', g.earlyFinishers)}${labeled('Behavior System', g.behavior)}</div>
  <div class="sec r"><h2>⚠️ Student Alerts</h2>${labeled('Medical / Allergy', g.medical)}${labeled('Behavioral Notes', g.studentNotes)}${labeled('Helpers / Leaders', g.helpers)}</div>
  <div class="sec o"><h2>🗂️ Where to Find Things</h2>${g.materialsLocation ? field(g.materialsLocation) : '<div class="pf"><div class="pv em">See the desk for the emergency folder.</div></div>'}</div>
  <div class="sec p"><h2>🗓️ ${S(label)} Schedule &amp; Instructions</h2>${scheduleHtml}</div>
  <div class="sec b"><h2>🌇 End of Day</h2>${g.endOfDay ? field(g.endOfDay) : '<div class="pf"><div class="pv em">Follow the posted end-of-day routine.</div></div>'}</div>
  <div class="sec r"><h2>📞 Emergency Contacts</h2>${labeled('Neighbor / Go-To Teacher', g.neighbor)}${labeled('Office / Admin', g.office)}${labeled('Other', g.contactNotes)}</div>
  <div class="es-feedback">
    <h2>📝 Please Leave a Note for ${g.teacherName ? S(g.teacherName) : 'the Teacher'}</h2>
    <p style="font-size:12px;color:#555;margin-bottom:10px;">${g.feedbackPrompt ? S(g.feedbackPrompt) : 'Please leave a note about how the day went and anything not completed.'}</p>
    <div class="fl"></div><div class="fl"></div><div class="fl"></div><div class="fl"></div>
  </div>
  <div class="es-foot"><span>Emergency Sub Plan · ${S(label)}</span><span>Thank you for being here today! 💙</span></div>
</div>`;
}

function emergencyPrintShell(bodyHtml, titleText) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${titleText}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; color:#222; background:#fff; }
  @page { margin:0.4in 0.45in; }
  .es-packet { page-break-after:always; }
  .es-packet:last-child { page-break-after:auto; }
  .es-head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #8e44ad; padding-bottom:8px; margin-bottom:12px; }
  .es-badge { display:inline-block; font-size:9px; font-weight:700; letter-spacing:0.5px; color:#fff; background:#8e44ad; padding:2px 7px; border-radius:3px; margin-bottom:4px; }
  .es-head-left h1 { font-size:22px; color:#8e44ad; }
  .es-head-right { text-align:right; }
  .es-head-right .ir { font-size:11px; color:#444; margin-bottom:2px; }
  .sec { margin-bottom:10px; }
  .sec h2 { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:#fff; background:#2c3e50; padding:3px 7px; border-radius:2px; margin-bottom:5px; }
  .sec.b h2 { background:#2980b9; } .sec.g h2 { background:#27ae60; } .sec.o h2 { background:#e67e22; }
  .sec.r h2 { background:#c0392b; } .sec.p h2 { background:#e91e8c; }
  .pf { margin-bottom:4px; } .pl { font-weight:700; font-size:9px; color:#666; margin-bottom:1px; }
  .pv { font-size:11px; color:#222; white-space:pre-wrap; line-height:1.4; } .pv.em { color:#aaa; font-style:italic; }
  .es-feedback { margin-top:12px; border:2px dashed #8e44ad; padding:8px; border-radius:4px; page-break-inside:avoid; }
  .es-feedback h2 { font-size:11px; color:#8e44ad; margin-bottom:5px; }
  .fl { border-bottom:1px solid #ddd; height:20px; margin-bottom:3px; }
  .es-foot { margin-top:10px; border-top:1px solid #ddd; padding-top:6px; display:flex; justify-content:space-between; font-size:9px; color:#999; }
</style></head><body>${bodyHtml}</body></html>`;
}

function printEmergencyDay() {
    const modal = document.getElementById('emergency-sub-modal');
    const dow = modal?.dataset.dow || 'mon';
    captureEmergencyGeneralIntoState();
    captureEmergencyDayIntoState(dow);
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(emergencyPrintShell(buildEmergencyDayPrintHtml(dow), (ES_DOW_LABELS[dow] || dow) + ' Emergency Sub Plan'), {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => { setTimeout(() => { win.focus(); win.print(); }, 300); };
}

function printEmergencyAll() {
    const modal = document.getElementById('emergency-sub-modal');
    captureEmergencyGeneralIntoState();
    if (modal?.dataset.dow) captureEmergencyDayIntoState(modal.dataset.dow);
    const usable = ES_DOWS.filter(d => classes.some(c => c.schedule && c.schedule[d]));
    const dows = usable.length ? usable : ['mon'];
    const win = openPrintWindow();
    win.document.write(preparePrintDoc(emergencyPrintShell(dows.map(buildEmergencyDayPrintHtml).join('\n'), 'Emergency Sub Plans'), {v:'0.4in',h:'0.3in'}));
    win.document.close();
    win.onload = () => { setTimeout(() => { win.focus(); win.print(); }, 300); };
}

// Print the hand-picked student work pages (this day or all 5) via the shared printer
function printEmergencyStudentWork(allDays) {
    const modal = document.getElementById('emergency-sub-modal');
    if (modal?.dataset.dow) captureEmergencyDayIntoState(modal.dataset.dow);
    const dows = allDays
        ? ES_DOWS.filter(d => classes.some(c => c.schedule && c.schedule[d]))
        : [modal?.dataset.dow || 'mon'];
    const groups = [];
    dows.forEach(dow => {
        const dayClasses = classes.filter(c => c.schedule && c.schedule[dow]);
        const savedDay = emergencySubPlans.days?.[dow]?.periods || {};
        getSortedClassSlots(dayClasses, dow).forEach(({ cls, slotIndex: si, slotCount }) => {
            const slotKey = slotCount > 1 ? `${cls.id}_${si}` : cls.id;
            const storeKey = `${dow}::${slotKey}`;
            const sel = emergencyWorkPages[storeKey] || savedDay[slotKey]?.workPages || [];
            if (sel.length) groups.push({ className: (allDays ? ES_DOW_LABELS[dow] + ' · ' : '') + cls.name, sel });
        });
    });
    printPickedPagesPacket(groups, allDays ? 'Emergency Student Work — All Days' : (ES_DOW_LABELS[modal?.dataset.dow] || 'Emergency') + ' — Student Work');
}


