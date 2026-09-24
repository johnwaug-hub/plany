// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBV6H2WbqG5sOA6jL_qiS8cKx5_GHNrqcw",
    authDomain: "plany-waugs.firebaseapp.com",
    projectId: "plany-waugs",
    storageBucket: "plany-waugs.firebasestorage.app",
    messagingSenderId: "197671183385",
    appId: "1:197671183385:web:c3260c32ac53cfa8adb688",
    measurementId: "G-CE68NR5P0B"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Enable offline persistence with new API
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    merge: true
});

db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
        if (err.code === 'failed-precondition') {
            // Multiple tabs open, persistence can only be enabled in one tab at a time
            console.log('Persistence unavailable: multiple tabs open');
        } else if (err.code === 'unimplemented') {
            // Current browser doesn't support persistence
            console.log('Persistence not supported by browser');
        }
    });

console.log('Firebase initialized');
