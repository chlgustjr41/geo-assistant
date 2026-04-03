import { ShieldX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function AccessDeniedPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 w-full max-w-sm text-center space-y-5">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <ShieldX size={28} className="text-red-500" />
          </div>
        </div>

        <div>
          <h1 className="text-lg font-bold text-gray-900">Access Denied</h1>
          <p className="text-sm text-gray-500 mt-2">
            The account <strong className="text-gray-700">{user?.email}</strong> is
            not authorized to use this application.
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Contact the administrator to request access.
          </p>
        </div>

        <button
          onClick={signOut}
          className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Sign out and try another account
        </button>
      </div>
    </div>
  );
}
