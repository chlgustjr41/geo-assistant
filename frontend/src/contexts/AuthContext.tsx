import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  accessDenied: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setAccessDenied: (denied: boolean) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  accessDenied: false,
  signIn: async () => {},
  signOut: async () => {},
  setAccessDenied: () => {},
});

/** True when Firebase config env vars are present. */
const authEnabled = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

const LAST_UID_KEY = 'geo_last_uid';

// All app-level localStorage keys that should be cleared on account switch.
// Keep in sync with LOCAL_STORAGE_KEYS in Layout.tsx.
const APP_LOCAL_STORAGE_KEYS = [
  'geo_article_text',
  'geo_selected_rule_sets',
  'geo_extractor_topic',
  'geo_extractor_queries',
  'geo_extractor_name',
  'geo_extractor_models',
  'geo_extractor_results',
  'geo_extractor_use_corpus',
  'geo_extra_corpus_ids',
  'geo_removed_default_corpus_ids',
];

/** Clear all app storage (localStorage keys + sessionStorage). */
function clearAppStorage() {
  APP_LOCAL_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
  sessionStorage.clear();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(authEnabled);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!authEnabled) return;

    // Handle redirect result (fires once after returning from Google sign-in)
    getRedirectResult(auth).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      setError(msg);
      setLoading(false);
    });

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Detect account switch: if a different user signs in, clear stale data
        const prevUid = localStorage.getItem(LAST_UID_KEY);
        if (prevUid && prevUid !== firebaseUser.uid) {
          clearAppStorage();
        }
        localStorage.setItem(LAST_UID_KEY, firebaseUser.uid);
      } else {
        setAccessDenied(false);
      }
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async () => {
    setError(null);
    setAccessDenied(false);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      setError(msg);
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setAccessDenied(false);
  };

  if (!authEnabled) {
    return (
      <AuthContext.Provider
        value={{ user: null, loading: false, error: null, accessDenied: false, signIn, signOut, setAccessDenied }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, accessDenied, signIn, signOut, setAccessDenied }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
