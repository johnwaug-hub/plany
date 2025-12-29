# Project Plany - Lesson Planning App

A comprehensive lesson planning application with Firebase/Firestore integration for teachers to manage their lessons, schedules, and school year planning.

## Features

- 📅 **Calendar Integration** - Visual monthly calendar showing planned lessons
- 📋 **Weekly Schedule Maker** - Interactive weekly timetable
- 🎓 **School Year Setup** - Configure academic year settings and breaks
- 📚 **Lesson Management** - Create, edit, duplicate, and delete lessons
- 📝 **Templates** - Pre-built and custom lesson templates
- ☁️ **Cloud Sync** - Real-time synchronization with Firebase
- 🔐 **User Authentication** - Secure login with Firebase Auth

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase account

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd project-plany-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable **Authentication** (Email/Password provider)
4. Enable **Firestore Database**
5. Get your Firebase configuration:
   - Go to Project Settings > General
   - Scroll to "Your apps" section
   - Click on the Web icon (</>)
   - Copy the configuration object

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 5. Firestore Security Rules

In Firebase Console, go to Firestore Database > Rules and add:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 6. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` to see the app.

### 7. Build for Production

```bash
npm run build
```

### 8. Deploy to Firebase Hosting (Optional)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init

# Deploy
npm run deploy
```

## Firestore Data Structure

```
users/
  {userId}/
    profile/
      - name
      - email
      - schoolYear
      - periodsPerDay
      - minutesPerPeriod
    
    lessons/
      {lessonId}/
        - title
        - subject
        - date
        - duration
        - objectives
        - materials
        - activities
        - createdAt
        - updatedAt
    
    templates/
      {templateId}/
        - name
        - description
        - subject
        - duration
        - structure
        - createdAt
    
    schedule/
      {scheduleId}/
        - day (0-4)
        - timeSlot (0-5)
        - lessonId
    
    breaks/
      {breakId}/
        - name
        - startDate
        - endDate
```

## Technologies Used

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Build Tool**: Vite
- **Backend**: Firebase/Firestore
- **Authentication**: Firebase Auth
- **Hosting**: Firebase Hosting (optional)

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
