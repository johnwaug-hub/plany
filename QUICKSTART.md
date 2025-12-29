# PLANY Quick Start Guide

Get up and running with PLANY in 5 minutes!

## 🚀 Quick Setup

### 1. Install Node.js
Download and install from [nodejs.org](https://nodejs.org/) (v16 or higher)

### 2. Get the Code
```bash
git clone <your-repo-url>
cd project-plany-app
npm install
```

### 3. Set Up Firebase

#### Create Firebase Project
1. Visit [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Name it (e.g., "project-plany-app")
4. Disable Google Analytics (optional)
5. Click "Create project"

#### Enable Authentication
1. Click "Authentication" in left sidebar
2. Click "Get started"
3. Select "Email/Password"
4. Enable and Save

#### Enable Firestore
1. Click "Firestore Database" in left sidebar
2. Click "Create database"
3. Start in "production mode"
4. Choose location
5. Click "Enable"

#### Get Your Config
1. Go to Project Settings (⚙️ icon)
2. Scroll to "Your apps"
3. Click Web icon `</>`
4. Register app with a nickname
5. Copy the config object

### 4. Configure Environment
```bash
# Copy example file
cp .env.example .env

# Edit .env and paste your Firebase config
# Use any text editor
nano .env
```

Paste your values:
```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
```

### 5. Run the App
```bash
npm run dev
```

Visit: http://localhost:5173

### 6. Create Your First Account
1. Click "Register"
2. Enter your name, email, and password
3. Click "Register"
4. You're in! 🎉

## 🎯 First Steps

### Create a Lesson
1. Click "📚 My Lessons"
2. Click "+ Create New Lesson"
3. Fill in the details
4. Click "Save Lesson"

### Add to Calendar
1. Go to "📅 Calendar"
2. Click on any day to see lessons
3. Lessons with dates appear automatically

### Build a Schedule
1. Go to "📋 Weekly Schedule"
2. Click "+ Add Lesson to Schedule"
3. Select lesson, day, and time
4. Click "Add to Schedule"

### Use Templates
1. Go to "📝 Templates"
2. Click any template to use it
3. Or create your own custom template

## 🚢 Deploy to Production

### Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### Initialize Firebase
```bash
firebase init
```
Select:
- Firestore
- Hosting
- Use existing files
- Public directory: `dist`
- Single-page app: Yes

### Deploy
```bash
npm run build
firebase deploy
```

Your app is live! 🌐

## 📱 Features Overview

| Feature | Description |
|---------|-------------|
| 📅 Calendar | Monthly view with lesson indicators |
| 📋 Weekly Schedule | 6-period x 5-day timetable |
| 📚 My Lessons | Full lesson management |
| 📝 Templates | Reusable lesson templates |
| 🎓 School Year | Configure academic settings |
| ☁️ Cloud Sync | Automatic synchronization |

## 🆘 Troubleshooting

### "Firebase config not found"
- Check `.env` file exists
- Verify all `VITE_FIREBASE_*` variables are set
- Restart dev server: `npm run dev`

### "Permission denied" in Firestore
```bash
# Deploy security rules
firebase deploy --only firestore:rules
```

### Build errors
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 📚 Next Steps

- Read the full [README.md](README.md)
- Check [DEPLOYMENT.md](DEPLOYMENT.md) for production setup
- See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute

## 💬 Need Help?

- Open an issue on GitHub
- Check Firebase Console for errors
- Review browser console logs

---

Happy teaching with PLANY! ✨
