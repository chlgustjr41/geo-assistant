import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(authEnabled);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!authEnabled) return;
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      // Reset access denied when user changes (e.g. signs out and signs in with different account)
      if (!firebaseUser) setAccessDenied(false);
    });
    return unsub;
  }, []);

  const signIn = async () => {
    setError(null);
    setAccessDenied(false);
    try {
      await signInWithPopup(auth, googleProvider);
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
