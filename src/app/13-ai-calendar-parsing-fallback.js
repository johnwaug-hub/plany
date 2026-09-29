// ============================================
// AI CALENDAR PARSING FALLBACK
// ============================================
// Called when regex parser finds 0 events — sends extracted PDF text to Claude
// and asks it to return structured JSON of school calendar events.

async function parseCalendarWithAI(rawText) {
    const schoolYear = settings.schoolYear || '2025-2026';
    const [startYear, endYear] = schoolYear.split('-');

    // Trim text to stay within token limits (~12k chars is plenty for a calendar)
    const trimmedText = rawText.substring(0, 12000);

    const prompt = `You are parsing a school district calendar. Extract every school event from the text below.

School year: ${schoolYear} (${startYear}–${endYear})
Rules:
- Months Aug–Dec belong to year ${startYear}
- Months Jan–Jul belong to year ${endYear}
- For multi-day events use startDate AND endDate (YYYY-MM-DD)
- For single-day events endDate = startDate
- type must be one of: first-day, last-day, holiday, break, grading, conference, testing, meeting, event

Return ONLY a JSON array, no markdown, no explanation. Each object:
{"title": "...", "type": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}

CALENDAR TEXT:
${trimmedText}`;

    const text = (await callAIText({ prompt, tier: 'fast', maxTokens: 4096 })).replace(/```json|```/g, '').trim();


    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        throw new Error('Claude returned invalid JSON: ' + text.substring(0, 200));
    }

    if (!Array.isArray(parsed)) throw new Error('Expected JSON array from Claude');

    // Validate and mark all as selected
    return parsed
        .filter(ev => ev.title && ev.startDate)
        .map(ev => ({
            title: ev.title,
            type: ev.type || 'event',
            startDate: ev.startDate,
            endDate: ev.endDate && ev.endDate !== ev.startDate ? ev.endDate : null,
            selected: true,
            aiParsed: true
        }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
}


function displayImportPreview(eventsList) {
    const container = document.getElementById('import-events-list');
    const preview = document.getElementById('import-preview');
    
    const typeIcons = {
        'event': '📌',
        'first-day': '🎒',
        'last-day': '🎉',
        'holiday': '🏖️',
        'meeting': '👥',
        'assembly': '🎤',
        'field-trip': '🚌',
        'testing': '📝',
        'deadline': '⚠️'
    };
    
    container.innerHTML = eventsList.map((event, index) => {
        const dateDisplay = event.endDate 
            ? `${formatDisplayDateShort(event.startDate)} - ${formatDisplayDateShort(event.endDate)}`
            : formatDisplayDateShort(event.startDate);
        
        return `
            <div class="import-event-item">
                <input type="checkbox" id="import-event-${index}" checked data-index="${index}">
                <span class="import-event-type">${typeIcons[event.type] || '📌'}</span>
                <span class="import-event-date">${dateDisplay}</span>
                <span class="import-event-title">${escHtml(event.title)}</span>
                ${event.aiParsed ? '<span style="font-size:0.65rem;background:#9D4EDD;color:#fff;padding:1px 5px;border-radius:3px;margin-left:4px;">AI</span>' : ''}
            </div>
        `;
    }).join('');
    
    // Add checkbox listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            pendingImportEvents[index].selected = e.target.checked;
        });
    });
    
    preview.classList.remove('hidden');
}

function formatDisplayDateShort(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

document.getElementById('cancel-import-btn').addEventListener('click', () => {
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-filename').textContent = '';
    document.getElementById('calendar-pdf-input').value = '';
    pendingImportEvents = [];
});

document.getElementById('confirm-import-btn').addEventListener('click', async () => {
    const selectedEvents = pendingImportEvents.filter(e => e.selected);
    
    if (selectedEvents.length === 0) {
        showToast('No events selected');
        return;
    }
    
    showLoading();
    
    try {
        const yearPath = getYearPath();
        let imported = 0;
        let skipped = 0;
        
        for (const event of selectedEvents) {
            // Check if similar event already exists
            const exists = events.find(e => 
                e.title === event.title && e.startDate === event.startDate
            );
            
            if (exists) {
                skipped++;
                continue;
            }
            
            const eventData = {
                title: event.title,
                type: event.type,
                startDate: event.startDate,
                endDate: event.endDate || event.startDate,
                startTime: '',
                endTime: '',
                description: 'Imported from district calendar',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            const docRef = await yearPath.collection('events').add(eventData);
            // Add to local array with actual values (not serverTimestamp)
            events.push({ 
                id: docRef.id, 
                title: event.title,
                type: event.type,
                startDate: event.startDate,
                endDate: event.endDate || event.startDate,
                startTime: '',
                endTime: '',
                description: 'Imported from district calendar'
            });
            imported++;
        }
        
        // Reset import UI
        document.getElementById('import-preview').classList.add('hidden');
        document.getElementById('import-filename').textContent = '';
        document.getElementById('calendar-pdf-input').value = '';
        pendingImportEvents = [];
        
        // Refresh views
        renderCalendar();
        renderWeek();
        updateSchoolYearDisplay();
        
        if (skipped > 0) {
            showToast(`Imported ${imported} events (${skipped} already existed)`);
        } else {
            showToast(`Imported ${imported} events!`);
        }
        
    } catch (error) {
        console.error('Error importing events:', error);
        showToast('Error importing events');
    }
    
    hideLoading();
});

