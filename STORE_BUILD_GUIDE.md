# Plany — App Store Build Guide
## Capacitor 6 · Android & iOS

---

## Prerequisites (install on your Mac)

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| Android Studio | Latest | https://developer.android.com/studio |
| Xcode | 15+ | Mac App Store |
| CocoaPods | Latest | `sudo gem install cocoapods` |
| Java JDK | 17+ | https://adoptium.net |

---

## Step 1 — Deploy latest web build first

```bash
firebase deploy --only hosting --project plany-waugs
```

---

## Step 2 — Install Capacitor

From inside the `plany/` folder:

```bash
cd /path/to/plany
npm install
```

This installs:
- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/android`
- `@capacitor/ios`
- `@capacitor/splash-screen`
- `@capacitor/status-bar`
- `@capacitor/keyboard`
- `@capacitor/app`
- `@capacitor/haptics`

---

## Step 3 — Initialize platforms

### Android
```bash
npx cap add android
```

### iOS
```bash
npx cap add ios
```

---

## Step 4 — Sync web assets to native

Run this every time you change the web app:

```bash
npx cap sync
```

This copies `public/` into both native projects and installs plugins.

---

## Step 5 — Android Setup

### Open in Android Studio
```bash
npx cap open android
```

### Required changes in Android Studio:

**1. App ID**
In `android/app/build.gradle`:
```gradle
applicationId "work.plany.app"
versionCode 1
versionName "4.9.5"
```

**2. App Name**
In `android/app/src/main/res/values/strings.xml`:
```xml
<string name="app_name">Plany</string>
```

**3. Minimum SDK** (already set by Capacitor)
```gradle
minSdkVersion 22
targetSdkVersion 34
```

**4. Internet Permission** (already in AndroidManifest)
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

**5. Splash Screen**
Place a 2048×2048 PNG at:
`android/app/src/main/res/drawable/splash.png`

Use the Plany purple (#9D4EDD) background with the Plany logo centered.

**6. App Icon**
Use Android Studio's Image Asset tool (File → New → Image Asset)
to generate all densities from your 1024×1024 icon PNG.
Icon should have:
- Foreground: Plany logo on transparent
- Background: #9D4EDD (purple)

**7. Build Release APK / AAB**
```
Build → Generate Signed Bundle/APK → Android App Bundle
```
Create a keystore if you don't have one. **Save the keystore file and password permanently** — you cannot update the app without it.

### Build for Play Store
```bash
# In Android Studio: Build → Generate Signed Bundle → .aab
```
Upload the `.aab` file to Google Play Console.

---

## Step 6 — iOS Setup

### Open in Xcode
```bash
npx cap open ios
```

### Required changes in Xcode:

**1. Bundle ID**
Target → General → Bundle Identifier: `work.plany.app`

**2. Display Name**
Target → General → Display Name: `Plany`

**3. Version**
Version: `4.9.5` | Build: `1`

**4. Signing**
Target → Signing & Capabilities:
- Team: Select your Apple Developer account
- Signing Certificate: Apple Distribution (for App Store)

**5. Deployment Target**
iOS 14.0 minimum (covers 99%+ of active devices)

**6. App Icons**
Add a 1024×1024 PNG to `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
Xcode will auto-generate all required sizes.

**7. Splash Screen**
Add `ios/App/App/Assets.xcassets/Splash.imageset/`
with a 2732×2732 PNG (Plany purple + centered logo)

**8. Info.plist entries** (add if not present)
```xml
<!-- Camera (for profile picture) -->
<key>NSCameraUsageDescription</key>
<string>Used to take your profile photo</string>

<!-- Photo Library (for profile picture & background) -->
<key>NSPhotoLibraryUsageDescription</key>
<string>Used to choose your profile photo or background image</string>
```

**9. Build for App Store**
```
Product → Archive → Distribute App → App Store Connect → Upload
```

---

## Step 7 — Firebase Configuration for Native

Firebase already works via the web SDK loaded from CDN. No native Firebase SDK needed.

However, for Google Sign-In on iOS, you need to add your reversed client ID:

**iOS: Info.plist**
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>GoogleSignIn</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <!-- Get this from Firebase Console → Project Settings → iOS app → GoogleService-Info.plist -->
      <string>com.googleusercontent.apps.YOUR_REVERSED_CLIENT_ID</string>
    </array>
  </dict>
</array>
```

**Android: AndroidManifest.xml** (in `<application>`)
```xml
<activity
    android:name="com.google.android.gms.auth.api.signin.internal.SignInHubActivity"
    android:excludeFromRecents="true"
    android:exported="false"
    android:theme="@android:style/Theme.Translucent.NoTitleBar" />
```

---

## Step 8 — Store Listings

### App Name
`Plany — Teacher Lesson Planner`

### Short Description (Google Play, 80 chars)
`Smart lesson planning, sub day packets, and AI tools for teachers.`

### Long Description
```
Plany is the all-in-one lesson planning app built for teachers.

LESSON PLANNING
• Monthly, weekly, and year-at-a-glance calendar views
• Class schedule management with multi-slot and every-other-week support
• Drag and drop lessons between days
• Recurring and linked multi-day lessons
• Print lesson plans, weekly plans, and monthly calendars

AI-POWERED TOOLS
• AI Lesson Fill — auto-generate lesson plans across a date range
• AI Student Work Packet — build printable student packets for sub days
• AI Parent Newsletter — weekly, monthly, and year-at-a-glance newsletters
• AI Calendar Import — parse any district calendar PDF automatically

CURRICULUM LIBRARY
• Upload PDFs, PowerPoints, Word docs, and ZIPs
• AI reads and references your actual pacing guides
• Share resources with colleague teachers

SUB DAY MANAGEMENT
• Full substitute teacher packet builder
• Per-class instructions, tech tools, and student work in one print
• Mark as sub day — shows on calendar

SCHOOL YEAR
• Automatic year rollover on June 1
• Copy classes to new school year
• School day counter with accurate holiday detection
• NGSS and standard tracking

COLLABORATION
• Share lessons with teacher friends
• Curriculum library resource sharing

Plany works offline and installs as a native app.
```

### Category
**Education** (Primary) / **Productivity** (Secondary)

### Keywords (iOS)
`lesson planning, teacher, classroom, substitute, curriculum, NGSS, schedule, school, education, planner`

### Content Rating
**Everyone** / **4+** (no objectionable content)

### Screenshots needed
- 6.7" iPhone (1290×2796): Week view, Calendar, Sub Day modal, AI Newsletter, Settings
- 12.9" iPad (2048×2732): Week view, Settings/Curriculum Library
- Android phone (1080×1920): Same screens

---

## Step 9 — Ongoing Update Workflow

```bash
# 1. Make changes to web app
# 2. Deploy to Firebase hosting
firebase deploy --only hosting --project plany-waugs

# 3. Sync to native
npx cap sync

# 4. Open and build in native IDE
npx cap open android   # or ios

# 5. Increment build number in native project
# 6. Archive and upload to Play Console / App Store Connect
```

---

## Firestore Security Rules

No changes needed — the app already uses Firebase Auth properly and all Firestore rules are UID-scoped.

---

## Known Considerations

| Issue | Status | Notes |
|---|---|---|
| Google Sign-In on iOS | Requires reversed client ID in Info.plist | See Step 7 |
| Anthropic API CORS | Works — `anthropic-dangerous-direct-browser-access: true` header handles it | No server needed |
| Service Worker | Disabled by Capacitor automatically on native | App loads directly, no SW conflicts |
| File uploads | `<input type="file">` works in Capacitor WebView | |
| PDF.js | Works in Capacitor WebView | |
| JSZip | Works in Capacitor WebView | |

---

## Apple Developer Program

- Cost: $99/year
- Enrollment: https://developer.apple.com/programs/enroll/
- Review time: 1–3 days

## Google Play Console

- Cost: $25 one-time
- Enrollment: https://play.google.com/console
- Review time: 1–7 days (first submission)

---

*Plany v4.9.5 · Capacitor 6 · Generated by Plany build system*
