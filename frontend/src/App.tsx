import { Layout } from './components/Layout';
import { LoginPage } from './components/LoginPage';
import { ExtractionProvider } from './contexts/ExtractionContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoadingSpinner } from './components/shared/LoadingSpinner';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // When auth is not configured (VITE_FIREBASE_API_KEY empty), user is null
  // but loading is false — show the app directly (local dev mode).
  const authEnabled = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);
  if (authEnabled && !user) {
    return <LoginPage />;
  }

  return (
    <ExtractionProvider>
      <Layout />
    </ExtractionProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
