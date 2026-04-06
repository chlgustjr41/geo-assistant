import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // Use the Hosting domain as authDomain so redirect/popup auth stays same-origin
  // and avoids third-party storage partitioning issues across browsers.
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN_OVERRIDE
    || `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.web.app`,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
