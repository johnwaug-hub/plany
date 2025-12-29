# PLANY Deployment Guide

This guide will help you deploy PLANY to Firebase Hosting with Firestore integration.

## Prerequisites

- Node.js and npm installed
- Firebase account
- Firebase CLI installed globally

## Step-by-Step Deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Firebase Project

#### Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name: `project-plany-app` (or your preferred name)
4. Follow the setup wizard

#### Enable Authentication
1. In Firebase Console, go to **Build > Authentication**
2. Click "Get started"
3. Enable **Email/Password** sign-in method
4. Click "Save"

#### Enable Firestore Database
1. In Firebase Console, go to **Build > Firestore Database**
2. Click "Create database"
3. Choose **Start in production mode** (we'll update rules later)
4. Select your preferred location
5. Click "Enable"

### 3. Get Firebase Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll to "Your apps" section
3. Click the **Web** icon (`</>`)
4. Register your app with a nickname (e.g., "PLANY Web")
5. Copy the configuration object

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and paste your Firebase configuration:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 5. Deploy Firestore Security Rules

```bash
# Install Firebase CLI if you haven't
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init

# Select:
# - Firestore: Configure security rules and indexes files
# - Hosting: Configure files for Firebase Hosting
# Use existing files (firestore.rules, firestore.indexes.json, firebase.json)
# Set public directory to: dist
# Configure as single-page app: Yes
# Don't overwrite index.html

# Deploy Firestore rules
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 6. Test Locally

```bash
npm run dev
```

Visit `http://localhost:5173` to test the app.

### 7. Build for Production

```bash
npm run build
```

This creates an optimized build in the `dist` folder.

### 8. Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

Or use the npm script:

```bash
npm run deploy
```

### 9. Access Your Deployed App

After deployment, Firebase will provide a URL like:
```
https://your-project-id.web.app
```

## Post-Deployment

### Verify Firestore Rules

In Firebase Console > Firestore Database > Rules, verify:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Test the App

1. Register a new account
2. Create a lesson
3. Add to calendar
4. Create a template
5. Build a weekly schedule

### Monitor Usage

- Go to Firebase Console > Build > Authentication to see registered users
- Go to Firestore Database to see stored data
- Go to Hosting to see deployment history and analytics

## Troubleshooting

### Build Errors

If you encounter build errors:
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Authentication Issues

- Verify Email/Password is enabled in Firebase Console
- Check that environment variables are correct
- Ensure `.env` file is not committed to Git

### Firestore Permission Errors

- Verify security rules are deployed
- Check that user is authenticated
- Ensure userId matches authenticated user

### Deployment Fails

```bash
# Re-initialize Firebase
firebase init

# Try deploying individual services
firebase deploy --only firestore
firebase deploy --only hosting
```

## Updating the App

```bash
# Make your changes
# Build the app
npm run build

# Deploy
npm run deploy
```

## Custom Domain (Optional)

1. Go to Firebase Console > Hosting
2. Click "Add custom domain"
3. Follow the DNS configuration steps
4. Wait for SSL certificate provisioning (can take up to 24 hours)

## Environment-Specific Builds

For multiple environments (dev, staging, prod):

1. Create separate `.env.development` and `.env.production` files
2. Create separate Firebase projects
3. Use different deployment commands

## Security Best Practices

1. ✅ Never commit `.env` file (it's in .gitignore)
2. ✅ Keep Firebase API keys secure (they're already restricted in Firebase Console)
3. ✅ Review and test Firestore security rules regularly
4. ✅ Enable App Check for additional security
5. ✅ Set up backup policies in Firestore

## Support

For issues:
1. Check Firebase Console logs
2. Check browser console for errors
3. Review Firestore security rules
4. Open an issue on GitHub

---

Happy teaching with PLANY! 📚✨
