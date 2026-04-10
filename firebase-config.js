// ── Firebase Configuration ────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDBRDOA_hRK8XgJnQJaH6pQN-ILgZuNcQc",
  authDomain:        "dev-journal-20.firebaseapp.com",
  projectId:         "dev-journal-20",
  storageBucket:     "dev-journal-20.firebasestorage.app",
  messagingSenderId: "498112513616",
  appId:             "1:498112513616:web:7552aa725cc8f389617355",
  measurementId:     "G-T6G32X6T81"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
