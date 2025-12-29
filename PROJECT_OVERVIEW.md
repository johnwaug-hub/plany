# Project Plany - Complete Project Overview

## 📁 Repository Structure

```
project-plany-app/
├── 📄 Configuration Files
│   ├── package.json              # Dependencies and scripts
│   ├── vite.config.js           # Vite build configuration
│   ├── firebase.json            # Firebase hosting config
│   ├── firestore.rules          # Firestore security rules
│   ├── firestore.indexes.json   # Firestore database indexes
│   ├── .env.example             # Environment variables template
│   └── .gitignore               # Git ignore patterns
│
├── 📝 Documentation
│   ├── README.md                # Main documentation
│   ├── QUICKSTART.md            # 5-minute setup guide
│   ├── DEPLOYMENT.md            # Deployment instructions
│   ├── CONTRIBUTING.md          # Contribution guidelines
│   ├── CHANGELOG.md             # Version history
│   ├── LICENSE                  # MIT License
│   └── PROJECT_OVERVIEW.md      # This file
│
├── 🎨 Frontend
│   ├── index.html               # Main HTML entry point
│   └── src/
│       ├── main.js              # Application logic
│       ├── styles.css           # Global styles
│       ├── firebase.js          # Firebase initialization
│       ├── auth.js              # Authentication service
│       └── database.js          # Firestore database service
│
└── 🔧 Build Output (generated)
    └── dist/                    # Production build (after `npm run build`)
```

## 🏗️ Architecture

### Frontend Layer
- **Technology**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Build Tool**: Vite
- **Architecture**: Modular service-based approach

### Backend Layer
- **Database**: Cloud Firestore (NoSQL)
- **Authentication**: Firebase Auth (Email/Password)
- **Hosting**: Firebase Hosting
- **Security**: Firestore Security Rules

### Data Flow
```
User Interface (HTML/CSS)
        ↓
Application Logic (main.js)
        ↓
Service Layer (auth.js, database.js)
        ↓
Firebase SDK
        ↓
Cloud Firestore / Firebase Auth
```

## 📊 Database Schema

### Collection Structure
```
users/
  {userId}/
    profile/
      data/
        - name: string
        - email: string
        - schoolYear: object
        - periodsPerDay: number
        - minutesPerPeriod: number
        - createdAt: timestamp
        - updatedAt: timestamp
    
    lessons/
      {lessonId}/
        - title: string
        - subject: string
        - date: string (YYYY-MM-DD)
        - duration: number (minutes)
        - objectives: string
        - materials: string
        - activities: string
        - createdAt: timestamp
        - updatedAt: timestamp
    
    templates/
      {templateId}/
        - name: string
        - description: string
        - subject: string
        - duration: number
        - structure: string
        - createdAt: timestamp
    
    schedule/
      {day-timeSlot}/
        - day: number (0-4)
        - timeSlot: number (0-5)
        - lessonId: string
        - updatedAt: timestamp
    
    breaks/
      {breakId}/
        - name: string
        - startDate: string
        - endDate: string
        - createdAt: timestamp
```

## 🔐 Security Model

### Firestore Rules
- Users can only read/write their own data
- All data is scoped to authenticated userId
- No cross-user data access allowed

### Authentication
- Email/Password authentication
- Session management via Firebase Auth
- Automatic token refresh

## 🎨 Design System

### Color Palette
- **Primary**: Terracotta (#D97757)
- **Secondary**: Sage (#8FA998)
- **Accent**: Deep Teal (#4A7C7E)
- **Background**: Cream (#FAF7F0)
- **Text**: Charcoal (#2C3639)

### Typography
- **Headings**: Crimson Pro (serif)
- **Body**: DM Sans (sans-serif)

### Components
- Cards with shadows and hover effects
- Modals with backdrop blur
- Responsive grid layouts
- Smooth animations and transitions

## 🚀 Available Scripts

```bash
# Development
npm run dev          # Start dev server (localhost:5173)

# Production
npm run build        # Build for production
npm run preview      # Preview production build

# Deployment
npm run deploy       # Build and deploy to Firebase
```

## 📱 Features Implementation

### 1. Calendar View
- **File**: `src/main.js` (renderCalendar function)
- **Features**: Monthly view, lesson indicators, navigation
- **Data Source**: Firestore `lessons` collection

### 2. Weekly Schedule
- **File**: `src/main.js` (renderWeeklySchedule function)
- **Features**: 6x5 grid, add/remove lessons
- **Data Source**: Firestore `schedule` collection

### 3. Lesson Management
- **File**: `src/main.js` (lesson CRUD functions)
- **Features**: Create, read, update, delete, duplicate
- **Data Source**: Firestore `lessons` collection

### 4. Templates
- **File**: `src/main.js` (template functions)
- **Features**: Pre-built and custom templates
- **Data Source**: Firestore `templates` collection

### 5. School Year Setup
- **File**: `src/main.js` (school year functions)
- **Features**: Configure dates, periods, breaks
- **Data Source**: Firestore `profile` and `breaks` collections

## 🔌 API Services

### AuthService (`src/auth.js`)
```javascript
- init()                          // Initialize auth state
- register(email, password, name) // Register new user
- login(email, password)          // Login user
- logout()                        // Logout user
- onAuthStateChange(callback)     // Listen to auth changes
- getCurrentUser()                // Get current user
- isAuthenticated()               // Check if authenticated
```

### DatabaseService (`src/database.js`)
```javascript
// Lessons
- createLesson(lessonData)
- updateLesson(lessonId, lessonData)
- deleteLesson(lessonId)
- getLessons()
- getLesson(lessonId)
- getLessonsByDate(date)

// Templates
- createTemplate(templateData)
- updateTemplate(templateId, templateData)
- deleteTemplate(templateId)
- getTemplates()

// Schedule
- saveScheduleSlot(day, timeSlot, lessonId)
- getSchedule()

// Breaks
- createBreak(breakData)
- deleteBreak(breakId)
- getBreaks()

// Profile
- updateUserProfile(profileData)
- getUserProfile()
```

## 🎯 User Flows

### First Time User
1. Land on login page
2. Click "Register"
3. Create account
4. Default templates created automatically
5. Shown empty app state with helpful messages

### Creating a Lesson
1. Navigate to "My Lessons"
2. Click "+ Create New Lesson"
3. Fill in form (or use template)
4. Save lesson
5. Lesson appears in list and calendar

### Building a Schedule
1. Create lessons first
2. Navigate to "Weekly Schedule"
3. Click "+ Add Lesson to Schedule"
4. Select lesson, day, and time
5. Lesson appears in schedule grid

## 🔧 Configuration

### Environment Variables (.env)
```env
VITE_FIREBASE_API_KEY=           # Firebase API key
VITE_FIREBASE_AUTH_DOMAIN=       # Auth domain
VITE_FIREBASE_PROJECT_ID=        # Project ID
VITE_FIREBASE_STORAGE_BUCKET=    # Storage bucket
VITE_FIREBASE_MESSAGING_SENDER_ID= # Sender ID
VITE_FIREBASE_APP_ID=            # App ID
```

### Firebase Configuration
- **Authentication**: Email/Password enabled
- **Firestore**: Database created
- **Security Rules**: User-scoped access
- **Hosting**: Static site hosting

## 📈 Performance

### Optimizations
- Lazy loading of data
- Efficient Firestore queries with indexes
- CSS animations (no JS for simple transitions)
- Vite for fast builds and HMR
- Minimal dependencies

### Loading Strategy
1. Show loading overlay during data fetch
2. Progressive rendering as data arrives
3. Cache user data in memory
4. Real-time updates via Firestore listeners (future)

## 🐛 Error Handling

### Authentication Errors
- Displayed in alert dialogs
- User-friendly error messages
- Automatic retry on network issues

### Database Errors
- Console logging for debugging
- User notifications for failed operations
- Graceful degradation

## 🔄 State Management

### In-Memory State
```javascript
- currentDate      // Calendar navigation
- lessons          // Array of lesson objects
- templates        // Array of template objects
- weeklySchedule   // 2D array for schedule
- breaks           // Array of break periods
- editingLessonId  // Currently editing lesson
- isLoading        // Loading state
```

### Data Synchronization
- Load all data on app initialization
- Individual updates pushed to Firestore
- Reload affected views after changes

## 🚀 Deployment Checklist

- [ ] Set up Firebase project
- [ ] Enable Authentication (Email/Password)
- [ ] Enable Firestore Database
- [ ] Get Firebase configuration
- [ ] Create `.env` file with config
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Build app: `npm run build`
- [ ] Deploy to hosting: `firebase deploy --only hosting`
- [ ] Test deployed app
- [ ] Verify authentication works
- [ ] Verify data persistence
- [ ] Check mobile responsiveness

## 📚 Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Vite Documentation](https://vitejs.dev/)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Authentication](https://firebase.google.com/docs/auth)

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

---

Built with ❤️ for teachers everywhere
