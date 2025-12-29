import { authService } from './auth.js';
import { dbService } from './database.js';
import './styles.css';

class ProjectPlanyApp {
  constructor() {
    this.currentDate = new Date();
    this.recurringClasses = []; // Teacher's recurring weekly schedule
    this.lessonPlans = [];      // Specific lesson plans for specific dates
    this.templates = [];
    this.breaks = [];
    this.editingLessonId = null;
    this.selectedClassSession = null; // For adding lesson plans to a session
    this.isLoading = false;
  }

  async init() {
    // Initialize auth
    await authService.init();
    
    // Check if user is logged in
    if (authService.isAuthenticated()) {
      this.showApp();
      await this.loadAllData();
    } else {
      this.showAuth();
    }

    // Setup auth UI handlers
    this.setupAuthHandlers();
    this.setupAppHandlers();
  }

  showAuth() {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
  }

  showApp() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    
    const user = authService.getCurrentUser();
    if (user) {
      document.getElementById('user-name').textContent = user.displayName || user.email;
    }
  }

  setupAuthHandlers() {
    // Toggle between login and register
    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'block';
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-form').style.display = 'none';
      document.getElementById('login-form').style.display = 'block';
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      
      try {
        await authService.login(email, password);
        this.showApp();
        await this.loadAllData();
      } catch (error) {
        alert('Login failed: ' + error.message);
      }
    });

    // Register form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('register-name').value;
      const email = document.getElementById('register-email').value;
      const password = document.getElementById('register-password').value;
      
      try {
        await authService.register(email, password, name);
        this.showApp();
        await this.initializeDefaultTemplates();
        await this.loadAllData();
      } catch (error) {
        alert('Registration failed: ' + error.message);
      }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await authService.logout();
      this.showAuth();
      this.lessons = [];
      this.templates = [];
      this.weeklySchedule = Array(6).fill(null).map(() => Array(5).fill(null));
      this.breaks = [];
    });
  }

  async initializeDefaultTemplates() {
    const defaultTemplates = [
      {
        name: 'Standard Lecture',
        description: 'Traditional lecture format with Q&A',
        subject: 'General',
        duration: 45,
        structure: 'Introduction (5min)\nMain Content (30min)\nDiscussion (10min)'
      },
      {
        name: 'Interactive Workshop',
        description: 'Hands-on learning activities',
        subject: 'General',
        duration: 60,
        structure: 'Brief Intro (5min)\nGroup Activity (40min)\nReflection (15min)'
      },
      {
        name: 'Lab Experiment',
        description: 'Science lab format',
        subject: 'Science',
        duration: 90,
        structure: 'Safety & Setup (10min)\nExperiment (60min)\nCleanup & Conclusion (20min)'
      }
    ];

    for (const template of defaultTemplates) {
      await dbService.createTemplate(template);
    }
  }

  setupAppHandlers() {
    // Modal close handlers
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
  }

  async loadAllData() {
    this.showLoading(true);
    try {
      await Promise.all([
        this.loadLessonPlans(),
        this.loadRecurringClasses(),
        this.loadTemplates(),
        this.loadBreaks()
      ]);
      this.renderCalendarView();
      this.updateStats();
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Error loading data. Please refresh the page.');
    } finally {
      this.showLoading(false);
    }
  }

  async loadLessons() {
    this.lessons = await dbService.getLessons();
    this.renderLessons();
  }

  async loadTemplates() {
    this.templates = await dbService.getTemplates();
    this.renderTemplates();
  }

  async loadSchedule() {
    this.weeklySchedule = await dbService.getSchedule();
    this.renderWeeklySchedule();
  }

  async loadBreaks() {
    this.breaks = await dbService.getBreaks();
    this.renderBreaks();
  }

  showLoading(show) {
    this.isLoading = show;
    const loader = document.getElementById('loading-overlay');
    if (loader) {
      loader.style.display = show ? 'flex' : 'none';
    }
  }

  // Navigation
  showSection(sectionId) {
    // Remove active class from all sections and nav buttons
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Add active class to current section and button
    document.getElementById(sectionId).classList.add('active');
    const activeBtn = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Render appropriate content
    if (sectionId === 'calendar') this.renderCalendarView();
    if (sectionId === 'weekly') this.renderWeeklySchedule();
  }

  // Calendar view state
  calendarView = 'month'; // 'month', 'week', or 'day'

  setCalendarView(view) {
    this.calendarView = view;
    
    // Update button states
    document.querySelectorAll('#monthViewBtn, #weekViewBtn, #dayViewBtn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.getElementById(`${view}ViewBtn`).classList.add('active');
    
    this.renderCalendarView();
  }

  renderCalendarView() {
    if (this.calendarView === 'month') {
      this.renderMonthView();
    } else if (this.calendarView === 'week') {
      this.renderWeekView();
    } else if (this.calendarView === 'day') {
      this.renderDayView();
    }
  }

  prevPeriod() {
    if (this.calendarView === 'month') {
      this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    } else if (this.calendarView === 'week') {
      this.currentDate.setDate(this.currentDate.getDate() - 7);
    } else if (this.calendarView === 'day') {
      this.currentDate.setDate(this.currentDate.getDate() - 1);
    }
    this.renderCalendarView();
  }

  nextPeriod() {
    if (this.calendarView === 'month') {
      this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    } else if (this.calendarView === 'week') {
      this.currentDate.setDate(this.currentDate.getDate() + 7);
    } else if (this.calendarView === 'day') {
      this.currentDate.setDate(this.currentDate.getDate() + 1);
    }
    this.renderCalendarView();
  }

  // Calendar functions
  renderMonthView() {
    // Hide other views
    document.getElementById('calendarGrid').style.display = 'grid';
    document.getElementById('weekViewContainer').style.display = 'none';
    document.getElementById('dayViewContainer').style.display = 'none';
    
    this.renderCalendar();
  }

  renderCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
    
    document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;
    
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    days.forEach(day => {
      const header = document.createElement('div');
      header.className = 'calendar-header';
      header.textContent = day;
      grid.appendChild(header);
    });
    
    const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
    
    for (let i = 0; i < adjustedFirstDay; i++) {
      grid.appendChild(document.createElement('div'));
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day';
      
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const sessions = this.getSessionsForDate(dateStr);
      const plansCount = sessions.filter(s => s.lessonPlan).length;
      const totalSessions = sessions.length;
      
      if (totalSessions > 0) {
        dayEl.classList.add('has-sessions');
        if (plansCount === totalSessions) {
          dayEl.classList.add('all-planned');
        }
      }
      
      dayEl.innerHTML = `
        <div class="day-number">${day}</div>
        ${totalSessions > 0 ? `<div class="session-indicator">${plansCount}/${totalSessions} planned</div>` : ''}
      `;
      
      dayEl.onclick = () => {
        this.showDaySessions(dateStr, sessions);
      };
      
      grid.appendChild(dayEl);
    }
  }

  showDaySessions(dateStr, sessions) {
    if (sessions.length === 0) {
      return;
    }
    
    // Switch to day view and show the sessions
    this.currentDate = new Date(dateStr);
    this.setCalendarView('day');
  }

  renderWeekView() {
    // Show week view, hide others
    document.getElementById('calendarGrid').style.display = 'none';
    document.getElementById('weekViewContainer').style.display = 'block';
    document.getElementById('dayViewContainer').style.display = 'none';
    
    const container = document.getElementById('weekViewContainer');
    const weekStart = new Date(this.currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Start on Monday
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    document.getElementById('currentMonth').textContent = 
      `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()} - ${monthNames[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
    
    let html = '<div class="week-view-grid">';
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const sessions = this.getSessionsForDate(dateStr);
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      const plannedCount = sessions.filter(s => s.lessonPlan).length;
      const totalCount = sessions.length;
      
      html += `
        <div class="week-day-card ${totalCount > 0 ? 'has-sessions' : ''} ${plannedCount === totalCount && totalCount > 0 ? 'all-planned' : ''}" onclick="app.showDaySessions('${dateStr}', ${JSON.stringify(sessions).replace(/"/g, '&quot;')})">
          <div class="week-day-header">
            <div class="week-day-name">${dayNames[day.getDay()]}</div>
            <div class="week-day-date">${monthNames[day.getMonth()]} ${day.getDate()}</div>
          </div>
          <div class="week-day-sessions">
            ${totalCount === 0 ? '<div class="no-sessions">No classes</div>' : 
              sessions.map(s => `
                <div class="week-session-item ${s.lessonPlan ? 'planned' : 'unplanned'}">
                  <div class="week-session-name">${s.recurringClass.name}</div>
                  <div class="week-session-status">${s.lessonPlan ? '✓' : '○'} ${s.recurringClass.time}</div>
                </div>
              `).join('')}
          </div>
          ${totalCount > 0 ? `
            <div class="week-day-summary">
              ${plannedCount}/${totalCount} planned
            </div>
          ` : ''}
        </div>
      `;
    }
    
    html += '</div>';
    container.innerHTML = html;
  }

  renderDayView() {
    // Show day view, hide others
    document.getElementById('calendarGrid').style.display = 'none';
    document.getElementById('weekViewContainer').style.display = 'none';
    document.getElementById('dayViewContainer').style.display = 'block';
    
    const container = document.getElementById('dayViewContainer');
    const day = this.currentDate;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    document.getElementById('currentMonth').textContent = 
      `${dayNames[day.getDay()]}, ${monthNames[day.getMonth()]} ${day.getDate()}, ${day.getFullYear()}`;
    
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const sessions = this.getSessionsForDate(dateStr);
    
    let html = `
      <div class="day-view-container">
        <div class="day-view-header">
          <h3>${dayNames[day.getDay()]}</h3>
          <p>${monthNames[day.getMonth()]} ${day.getDate()}, ${day.getFullYear()}</p>
        </div>
        <div class="day-view-sessions">
    `;
    
    if (sessions.length === 0) {
      html += '<div class="no-sessions-message">No classes scheduled for this day. <a href="#" onclick="app.showSection(\'weekly\'); return false;">Set up your weekly schedule</a></div>';
    } else {
      sessions.forEach(session => {
        const { recurringClass, lessonPlan } = session;
        
        html += `
          <div class="session-card ${lessonPlan ? 'has-plan' : 'needs-plan'}">
            <div class="session-header">
              <div class="session-info">
                <h4>${recurringClass.name}</h4>
                <div class="session-meta">
                  <span>📚 ${recurringClass.subject}</span>
                  <span>🕐 ${recurringClass.time}</span>
                  <span>⏱️ ${recurringClass.duration} min</span>
                  ${recurringClass.location ? `<span>📍 ${recurringClass.location}</span>` : ''}
                </div>
              </div>
              <span class="session-tag ${lessonPlan ? 'planned' : 'unplanned'}">${lessonPlan ? '✓ Planned' : 'Not Planned'}</span>
            </div>
        `;
        
        if (lessonPlan) {
          html += `
            <div class="lesson-plan-content">
              <div class="lesson-plan-title">
                <strong>Lesson:</strong> ${lessonPlan.title}
              </div>
              ${lessonPlan.objectives ? `
                <div class="lesson-plan-section">
                  <strong>Learning Objectives:</strong>
                  <p>${lessonPlan.objectives}</p>
                </div>
              ` : ''}
              ${lessonPlan.materials ? `
                <div class="lesson-plan-section">
                  <strong>Materials:</strong>
                  <p>${lessonPlan.materials}</p>
                </div>
              ` : ''}
              ${lessonPlan.activities ? `
                <div class="lesson-plan-section">
                  <strong>Activities:</strong>
                  <p>${lessonPlan.activities}</p>
                </div>
              ` : ''}
              ${lessonPlan.homework ? `
                <div class="lesson-plan-section">
                  <strong>Homework:</strong>
                  <p>${lessonPlan.homework}</p>
                </div>
              ` : ''}
              ${lessonPlan.notes ? `
                <div class="lesson-plan-section">
                  <strong>Notes:</strong>
                  <p>${lessonPlan.notes}</p>
                </div>
              ` : ''}
              <div class="lesson-plan-actions">
                <button class="btn btn-outline btn-sm" onclick="app.editLessonPlan('${lessonPlan.id}', '${dateStr}', ${JSON.stringify(recurringClass).replace(/"/g, '&quot;')})">✏️ Edit</button>
                <button class="btn btn-outline btn-sm" onclick="app.deleteLessonPlan('${lessonPlan.id}')">🗑️ Delete</button>
              </div>
            </div>
          `;
        } else {
          html += `
            <div class="no-plan-content">
              <p>No lesson plan created yet for this session.</p>
              <button class="btn btn-primary" onclick='app.showAddLessonPlanModal("${dateStr}", ${JSON.stringify(recurringClass).replace(/"/g, '&quot;')})'>+ Add Lesson Plan</button>
            </div>
          `;
        }
        
        html += `</div>`;
      });
    }
    
    html += `
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }

  // Weekly Schedule
  renderWeeklySchedule() {
    const schedule = document.getElementById('weekSchedule');
    
    if (this.recurringClasses.length === 0) {
      schedule.innerHTML = `
        <div class="empty-schedule">
          <p>You haven't set up any recurring classes yet.</p>
          <p>Click "+ Add Recurring Class" to get started.</p>
        </div>
      `;
      return;
    }
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    // Group classes by day
    const classesByDay = {};
    days.forEach((_, idx) => {
      classesByDay[idx] = this.recurringClasses
        .filter(c => c.day === idx)
        .sort((a, b) => a.time.localeCompare(b.time));
    });
    
    let html = '<div class="recurring-schedule-grid">';
    
    days.forEach((dayName, dayIdx) => {
      html += `
        <div class="schedule-day-column">
          <div class="schedule-day-header">${dayName}</div>
          <div class="schedule-day-classes">
      `;
      
      const dayClasses = classesByDay[dayIdx];
      
      if (dayClasses.length === 0) {
        html += '<div class="no-classes">No classes</div>';
      } else {
        dayClasses.forEach(cls => {
          html += `
            <div class="recurring-class-card">
              <div class="recurring-class-time">${cls.time}</div>
              <div class="recurring-class-name">${cls.name}</div>
              <div class="recurring-class-subject">${cls.subject}</div>
              ${cls.location ? `<div class="recurring-class-location">📍 ${cls.location}</div>` : ''}
              <div class="recurring-class-duration">${cls.duration} min</div>
              <div class="recurring-class-actions">
                <button class="icon-btn" onclick="app.editRecurringClass('${cls.id}')" title="Edit">✏️</button>
                <button class="icon-btn" onclick="app.deleteRecurringClass('${cls.id}')" title="Delete">🗑️</button>
              </div>
            </div>
          `;
        });
      }
      
      html += `
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    schedule.innerHTML = html;
  }

  async editRecurringClass(id) {
    // TODO: Implement edit functionality
    alert('Edit functionality coming soon. For now, delete and recreate the class.');
  }

  // Lessons
  renderLessons() {
    const list = document.getElementById('lessonsList');
    if (this.lessons.length === 0) {
      list.innerHTML = '<p style="text-align: center; color: var(--soft-gray); padding: 2rem;">No lessons created yet. Click "Create New Lesson" to get started!</p>';
      return;
    }
    
    list.innerHTML = this.lessons.map(lesson => `
      <div class="lesson-item">
        <h3 style="font-family: 'Crimson Pro', serif; color: var(--deep-teal); margin-bottom: 0.5rem;">${lesson.title}</h3>
        <div class="lesson-meta">
          <span class="tag">${lesson.subject}</span>
          <span>📅 ${lesson.date}</span>
          <span>⏱️ ${lesson.duration} min</span>
        </div>
        <div class="action-buttons">
          <button class="icon-btn" onclick="app.copyLesson('${lesson.id}')" title="Duplicate">📋</button>
          <button class="icon-btn" onclick="app.editLesson('${lesson.id}')" title="Edit">✏️</button>
          <button class="icon-btn" onclick="app.deleteLesson('${lesson.id}')" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  async copyLesson(id) {
    const lesson = this.lessons.find(l => l.id === id);
    const newLesson = {
      title: lesson.title + ' (Copy)',
      subject: lesson.subject,
      date: '',
      duration: lesson.duration,
      objectives: lesson.objectives || '',
      materials: lesson.materials || '',
      activities: lesson.activities || ''
    };
    
    await dbService.createLesson(newLesson);
    await this.loadLessons();
    alert('Lesson copied! Edit the date before adding to calendar.');
  }

  editLesson(id) {
    const lesson = this.lessons.find(l => l.id === id);
    document.getElementById('lessonTitle').value = lesson.title;
    document.getElementById('lessonSubject').value = lesson.subject;
    document.getElementById('lessonDate').value = lesson.date;
    document.getElementById('lessonDuration').value = lesson.duration;
    document.getElementById('lessonObjectives').value = lesson.objectives || '';
    document.getElementById('lessonMaterials').value = lesson.materials || '';
    document.getElementById('lessonActivities').value = lesson.activities || '';
    
    this.editingLessonId = id;
    document.getElementById('createLessonModal').classList.add('active');
  }

  async deleteLesson(id) {
    if (confirm('Are you sure you want to delete this lesson?')) {
      await dbService.deleteLesson(id);
      await this.loadLessons();
      this.renderCalendar();
    }
  }

  // Templates
  renderTemplates() {
    const list = document.getElementById('templatesList');
    list.innerHTML = this.templates.map(t => `
      <div class="template-card" onclick="app.useTemplate('${t.id}')">
        <h3 class="template-title">${t.name}</h3>
        <p class="template-desc">${t.description}</p>
        <div style="margin-top: 1rem; font-size: 0.85rem; color: var(--soft-gray);">
          ${t.subject} • ${t.duration} min
        </div>
      </div>
    `).join('');
  }

  useTemplate(id) {
    const template = this.templates.find(t => t.id === id);
    document.getElementById('lessonSubject').value = template.subject;
    document.getElementById('lessonDuration').value = template.duration;
    document.getElementById('lessonActivities').value = template.structure;
    this.showCreateLessonModal();
  }

  // Modals
  showCreateLessonModal() {
    document.getElementById('lessonTitle').value = '';
    document.getElementById('lessonSubject').value = '';
    document.getElementById('lessonDate').value = '';
    document.getElementById('lessonDuration').value = '45';
    document.getElementById('lessonObjectives').value = '';
    document.getElementById('lessonMaterials').value = '';
    document.getElementById('lessonActivities').value = '';
    this.editingLessonId = null;
    document.getElementById('createLessonModal').classList.add('active');
  }

  showCreateTemplateModal() {
    document.getElementById('createTemplateModal').classList.add('active');
  }

  showAddLessonModal(timeSlot, daySlot) {
    const select = document.getElementById('scheduleLesson');
    select.innerHTML = '<option value="">Choose a lesson...</option>' + 
      this.lessons.map(l => `<option value="${l.id}">${l.title} - ${l.subject}</option>`).join('');
    
    if (timeSlot !== undefined) {
      document.getElementById('scheduleTime').value = timeSlot;
      document.getElementById('scheduleDay').value = daySlot;
    }
    
    document.getElementById('addLessonModal').classList.add('active');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  async saveLesson() {
    const title = document.getElementById('lessonTitle').value;
    const subject = document.getElementById('lessonSubject').value;
    const date = document.getElementById('lessonDate').value;
    const duration = document.getElementById('lessonDuration').value;
    const objectives = document.getElementById('lessonObjectives').value;
    const materials = document.getElementById('lessonMaterials').value;
    const activities = document.getElementById('lessonActivities').value;
    
    if (!title || !subject || !date) {
      alert('Please fill in title, subject, and date');
      return;
    }
    
    const lessonData = {
      title,
      subject,
      date,
      duration: parseInt(duration),
      objectives,
      materials,
      activities
    };
    
    if (this.editingLessonId) {
      await dbService.updateLesson(this.editingLessonId, lessonData);
    } else {
      await dbService.createLesson(lessonData);
    }
    
    this.closeModal('createLessonModal');
    await this.loadLessons();
    this.renderCalendar();
  }

  async saveTemplate() {
    const name = document.getElementById('templateName').value;
    const description = document.getElementById('templateDesc').value;
    const subject = document.getElementById('templateSubject').value;
    const duration = document.getElementById('templateDuration').value;
    const structure = document.getElementById('templateStructure').value;
    
    if (!name || !description) {
      alert('Please fill in name and description');
      return;
    }
    
    await dbService.createTemplate({
      name,
      description,
      subject: subject || 'General',
      duration: parseInt(duration),
      structure
    });
    
    this.closeModal('createTemplateModal');
    await this.loadTemplates();
  }

  async addToSchedule() {
    const lessonId = document.getElementById('scheduleLesson').value;
    const day = parseInt(document.getElementById('scheduleDay').value);
    const time = parseInt(document.getElementById('scheduleTime').value);
    
    if (!lessonId) {
      alert('Please select a lesson');
      return;
    }
    
    await dbService.saveScheduleSlot(day, time, lessonId);
    await this.loadSchedule();
    this.closeModal('addLessonModal');
  }

  // School Year
  updateSchoolYear() {
    const selectedYear = document.getElementById('schoolYearSelector').value;
    const [startYear, endYear] = selectedYear.split('-');
    
    // Update the display
    document.getElementById('currentSchoolYear').textContent = `${selectedYear} School Year`;
    
    // Update default dates based on selected year
    // Typical US school year: mid-August to early June
    const yearStart = `${startYear}-08-18`;
    const yearEnd = `${endYear}-06-12`;
    
    document.getElementById('yearStart').value = yearStart;
    document.getElementById('yearEnd').value = yearEnd;
  }

  async saveYearSettings() {
    const selectedYear = document.getElementById('schoolYearSelector').value;
    const yearStart = document.getElementById('yearStart').value;
    const yearEnd = document.getElementById('yearEnd').value;
    const periodsPerDay = parseInt(document.getElementById('periodsPerDay').value);
    const minutesPerPeriod = parseInt(document.getElementById('minutesPerPeriod').value);
    
    await dbService.updateUserProfile({
      selectedYear,
      schoolYear: { start: yearStart, end: yearEnd },
      periodsPerDay,
      minutesPerPeriod
    });
    
    alert('School year settings saved!');
  }

  async addBreak() {
    const name = document.getElementById('breakName').value;
    const start = document.getElementById('breakStart').value;
    const end = document.getElementById('breakEnd').value;
    
    if (!name || !start || !end) {
      alert('Please fill in all break details');
      return;
    }
    
    await dbService.createBreak({ name, startDate: start, endDate: end });
    await this.loadBreaks();
    
    document.getElementById('breakName').value = '';
    document.getElementById('breakStart').value = '';
    document.getElementById('breakEnd').value = '';
  }

  renderBreaks() {
    const list = document.getElementById('breaksList');
    list.innerHTML = this.breaks.map(b => `
      <div class="lesson-item">
        <h3 style="font-family: 'Crimson Pro', serif; color: var(--terracotta);">${b.name}</h3>
        <div class="lesson-meta">
          <span>${b.startDate} to ${b.endDate}</span>
        </div>
        <button class="icon-btn" onclick="app.deleteBreak('${b.id}')">🗑️</button>
      </div>
    `).join('');
  }

  async deleteBreak(id) {
    await dbService.deleteBreak(id);
    await this.loadBreaks();
  }

  updateStats() {
    document.getElementById('lessonsCount').textContent = this.lessonPlans.length;
    document.getElementById('templatesCount').textContent = this.recurringClasses.length;
  }

  // ========== RECURRING CLASSES ==========
  
  showAddRecurringClassModal() {
    document.getElementById('addRecurringClassModal').classList.add('active');
  }

  async saveRecurringClass() {
    const name = document.getElementById('recurringClassName').value;
    const subject = document.getElementById('recurringClassSubject').value;
    const day = parseInt(document.getElementById('recurringDay').value);
    const time = document.getElementById('recurringTime').value;
    const duration = parseInt(document.getElementById('recurringDuration').value);
    const location = document.getElementById('recurringLocation').value;
    
    if (!name || !subject) {
      alert('Please fill in class name and subject');
      return;
    }
    
    const recurringClass = {
      name,
      subject,
      day,
      time,
      duration,
      location
    };
    
    await dbService.createRecurringClass(recurringClass);
    await this.loadRecurringClasses();
    this.closeModal('addRecurringClassModal');
    
    // Clear form
    document.getElementById('recurringClassName').value = '';
    document.getElementById('recurringClassSubject').value = '';
    document.getElementById('recurringLocation').value = '';
  }

  async loadRecurringClasses() {
    this.recurringClasses = await dbService.getRecurringClasses();
    this.renderWeeklySchedule();
    this.renderCalendarView(); // Refresh calendar to show recurring classes
  }

  async deleteRecurringClass(id) {
    if (confirm('Delete this recurring class? This will not delete existing lesson plans.')) {
      await dbService.deleteRecurringClass(id);
      await this.loadRecurringClasses();
    }
  }

  // ========== LESSON PLANS ==========
  
  showAddLessonPlanModal(date, recurringClass) {
    this.selectedClassSession = { date, recurringClass };
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dateObj = new Date(date);
    
    document.getElementById('lessonModalTitle').textContent = `Add Lesson Plan - ${recurringClass.name}`;
    document.getElementById('lessonModalDescription').textContent = 
      `${dayNames[dateObj.getDay()]}, ${dateObj.toLocaleDateString()} • ${recurringClass.subject}`;
    
    // Clear previous values
    document.getElementById('dailyLessonTitle').value = '';
    document.getElementById('dailyLessonObjectives').value = '';
    document.getElementById('dailyLessonMaterials').value = '';
    document.getElementById('dailyLessonActivities').value = '';
    document.getElementById('dailyLessonHomework').value = '';
    document.getElementById('dailyLessonNotes').value = '';
    
    document.getElementById('addLessonToClassModal').classList.add('active');
  }

  async saveLessonPlan() {
    if (!this.selectedClassSession) return;
    
    const { date, recurringClass, editingPlanId } = this.selectedClassSession;
    
    const lessonPlan = {
      date,
      recurringClassId: recurringClass.id,
      className: recurringClass.name,
      subject: recurringClass.subject,
      title: document.getElementById('dailyLessonTitle').value,
      objectives: document.getElementById('dailyLessonObjectives').value,
      materials: document.getElementById('dailyLessonMaterials').value,
      activities: document.getElementById('dailyLessonActivities').value,
      homework: document.getElementById('dailyLessonHomework').value,
      notes: document.getElementById('dailyLessonNotes').value
    };
    
    if (!lessonPlan.title) {
      alert('Please add a lesson title');
      return;
    }
    
    if (editingPlanId) {
      await dbService.updateLessonPlan(editingPlanId, lessonPlan);
    } else {
      await dbService.createLessonPlan(lessonPlan);
    }
    
    await this.loadLessonPlans();
    this.closeModal('addLessonToClassModal');
    this.selectedClassSession = null;
  }

  async loadLessonPlans() {
    this.lessonPlans = await dbService.getLessonPlans();
    this.renderCalendarView(); // Refresh calendar
  }

  async deleteLessonPlan(id) {
    if (confirm('Delete this lesson plan?')) {
      await dbService.deleteLessonPlan(id);
      await this.loadLessonPlans();
    }
  }

  // Get recurring classes for a specific day of week
  getRecurringClassesForDay(dayOfWeek) {
    return this.recurringClasses.filter(c => c.day === dayOfWeek);
  }

  // Get lesson plans for a specific date
  getLessonPlansForDate(dateStr) {
    return this.lessonPlans.filter(lp => lp.date === dateStr);
  }

  // Get sessions (recurring classes + lesson plans) for a date
  getSessionsForDate(dateStr) {
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();
    const dayOfWeekAdjusted = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Mon=0, Sun=6
    
    const recurring = this.getRecurringClassesForDay(dayOfWeekAdjusted);
    const plans = this.getLessonPlansForDate(dateStr);
    
    return recurring.map(rc => {
      const plan = plans.find(p => p.recurringClassId === rc.id);
      return {
        recurringClass: rc,
        lessonPlan: plan || null
      };
    });
  }

  // Edit lesson plan
  editLessonPlan(planId, dateStr, recurringClass) {
    const plan = this.lessonPlans.find(p => p.id === planId);
    if (!plan) return;
    
    this.selectedClassSession = { date: dateStr, recurringClass, editingPlanId: planId };
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dateObj = new Date(dateStr);
    
    document.getElementById('lessonModalTitle').textContent = `Edit Lesson Plan - ${recurringClass.name}`;
    document.getElementById('lessonModalDescription').textContent = 
      `${dayNames[dateObj.getDay()]}, ${dateObj.toLocaleDateString()} • ${recurringClass.subject}`;
    
    document.getElementById('dailyLessonTitle').value = plan.title || '';
    document.getElementById('dailyLessonObjectives').value = plan.objectives || '';
    document.getElementById('dailyLessonMaterials').value = plan.materials || '';
    document.getElementById('dailyLessonActivities').value = plan.activities || '';
    document.getElementById('dailyLessonHomework').value = plan.homework || '';
    document.getElementById('dailyLessonNotes').value = plan.notes || '';
    
    document.getElementById('addLessonToClassModal').classList.add('active');
  }

}

// Initialize app
const app = new ProjectPlanyApp();
app.init();

// Make app globally available for onclick handlers
window.app = app;
