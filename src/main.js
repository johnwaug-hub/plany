import { authService } from './auth.js';
import { dbService } from './database.js';
import './styles.css';

class ProjectPlanyApp {
  constructor() {
    this.currentDate = new Date();
    this.lessons = [];
    this.templates = [];
    this.weeklySchedule = Array(6).fill(null).map(() => Array(5).fill(null));
    this.breaks = [];
    this.editingLessonId = null;
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
        this.loadLessons(),
        this.loadTemplates(),
        this.loadSchedule(),
        this.loadBreaks()
      ]);
      this.renderCalendar();
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
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');

    if (sectionId === 'calendar') this.renderCalendar();
    if (sectionId === 'weekly') this.renderWeeklySchedule();
    if (sectionId === 'lessons') this.renderLessons();
    if (sectionId === 'templates') this.renderTemplates();
  }

  // Calendar functions
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
      const dayLessons = this.lessons.filter(l => l.date === dateStr);
      
      if (dayLessons.length > 0) {
        dayEl.classList.add('has-lesson');
      }
      
      dayEl.innerHTML = `
        <div class="day-number">${day}</div>
        ${dayLessons.length > 0 ? `<div class="lesson-indicator">${dayLessons.length} lesson(s)</div>` : ''}
      `;
      
      dayEl.onclick = () => {
        if (dayLessons.length > 0) {
          alert(`Lessons on ${dateStr}:\n${dayLessons.map(l => `• ${l.title}`).join('\n')}`);
        }
      };
      
      grid.appendChild(dayEl);
    }
  }

  prevMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.renderCalendar();
  }

  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.renderCalendar();
  }

  // Weekly Schedule
  renderWeeklySchedule() {
    const schedule = document.getElementById('weekSchedule');
    const times = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM'];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    schedule.innerHTML = '<div class="time-slot time-label"></div><div class="day-row">' + 
      days.map(d => `<div class="time-slot time-label">${d}</div>`).join('') + '</div>';
    
    times.forEach((time, timeIdx) => {
      schedule.innerHTML += `<div class="time-slot time-label">${time}</div>`;
      schedule.innerHTML += '<div class="day-row">' + 
        days.map((_, dayIdx) => {
          const lesson = this.weeklySchedule[timeIdx][dayIdx];
          return `<div class="time-slot lesson-slot ${lesson ? 'filled' : ''}" onclick="app.editScheduleSlot(${timeIdx}, ${dayIdx})">
            ${lesson ? `<div class="lesson-title">${lesson.title}</div><div class="lesson-subject">${lesson.subject}</div>` : ''}
          </div>`;
        }).join('') + 
      '</div>';
    });
  }

  async editScheduleSlot(time, day) {
    const lesson = this.weeklySchedule[time][day];
    if (lesson) {
      if (confirm(`Remove "${lesson.title}" from schedule?`)) {
        await dbService.saveScheduleSlot(day, time, null);
        this.weeklySchedule[time][day] = null;
        this.renderWeeklySchedule();
      }
    } else {
      this.showAddLessonModal(time, day);
    }
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
    document.getElementById('lessonsCount').textContent = this.lessons.length;
    document.getElementById('templatesCount').textContent = this.templates.length;
  }
}

// Initialize app
const app = new ProjectPlanyApp();
app.init();

// Make app globally available for onclick handlers
window.app = app;
