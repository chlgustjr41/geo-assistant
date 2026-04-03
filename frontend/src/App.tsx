import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Layout } from './components/Layout';
import { LoginPage } from './components/LoginPage';
import { AccessDeniedPage } from './components/AccessDeniedPage';
import { ActiveJobsProvider } from './contexts/ActiveJobsContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoadingSpinner } from './components/shared/LoadingSpinner';
import { setAccessDeniedHandler } from './services/api';

function AppContent() {
  const { user, loading, accessDenied, setAccessDenied } = useAuth();

  // Wire the API interceptor to the auth context
  useEffect(() => {
    setAccessDeniedHandler(() => setAccessDenied(true));
  }, [setAccessDenied]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const authEnabled = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

  // Show access denied screen when user is signed in but not whitelisted
  if (authEnabled && user && accessDenied) {
    return <AccessDeniedPage />;
  }

  if (authEnabled && !user) {
    return <LoginPage />;
  }

  return (
    <ActiveJobsProvider>
      <Layout />
    </ActiveJobsProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}
