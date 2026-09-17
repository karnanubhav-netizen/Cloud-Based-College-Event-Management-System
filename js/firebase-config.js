import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAaRSpYYducWvqlGGfYXrwxEas1dARpb2o",
  authDomain: "sgoc-college-event-management.firebaseapp.com",
  projectId: "sgoc-college-event-management",
  storageBucket: "sgoc-college-event-management.firebasestorage.app",
  messagingSenderId: "1087249828638",
  appId: "1:1087249828638:web:91e802bc1b081cf8b2570f",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

setPersistence(auth, browserSessionPersistence)
  .catch((error) => {
    console.error("Failed to set session persistence:", error);
  });

export const db = getFirestore(app);
export const storage = getStorage(app);

export const COLLECTIONS = {
  USERS: "users",
  EVENTS: "events",
  REGISTRATIONS: "registrations",
  GALLERIES: "galleries",
};

export const ROLES = {
  STUDENT: "student",
  ADMIN: "admin",
};

export const EVENT_STATUS = {
  UPCOMING: "upcoming",
  ONGOING: "ongoing",
  COMPLETED: "completed",
};
