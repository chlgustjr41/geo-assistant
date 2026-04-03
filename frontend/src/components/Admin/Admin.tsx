import { useEffect, useState } from 'react';
import { Shield, Plus, Trash2, Crown } from 'lucide-react';
import { adminApi } from '../../services/api';
import { toast } from '../shared/Toast';
import { LoadingSpinner } from '../shared/LoadingSpinner';

export function Admin() {
  const [emails, setEmails] = useState<string[]>([]);
  const [superAdmin, setSuperAdmin] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  const loadWhitelist = async () => {
    try {
      const data = await adminApi.getWhitelist();
      setEmails(data.emails);
      setSuperAdmin(data.super_admin);
    } catch {
      toast('error', 'Failed to load whitelist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWhitelist(); }, []);

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast('error', 'Enter a valid email address');
      return;
    }
    setAdding(true);
    try {
      const res = await adminApi.addEmail(email);
      if (res.ok) {
        setEmails(res.emails);
        setNewEmail('');
        toast('success', res.already_exists ? 'Email already in whitelist' : `Added ${email}`);
      }
    } catch {
      toast('error', 'Failed to add email');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (email: string) => {
    if (!confirm(`Remove ${email} from the whitelist?\n\nThey will lose access immediately.`)) return;
    setRemovingEmail(email);
    try {
      const res = await adminApi.removeEmail(email);
      if (res.ok) {
        setEmails(res.emails);
        toast('success', `Removed ${email}`);
      } else {
        toast('error', res.error || 'Failed to remove');
      }
    } catch {
      toast('error', 'Failed to remove email');
    } finally {
      setRemovingEmail(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Shield size={20} className="text-primary-600" />
          Access Control
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage which Google accounts can access the application.
          Only whitelisted accounts can sign in and use the LLM-powered features.
        </p>
      </div>

      {/* Add new email */}
      <div className="flex gap-2">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="user@gmail.com"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newEmail.trim()}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {adding ? <LoadingSpinner size="sm" /> : <Plus size={14} />}
          Add
        </button>
      </div>

      {/* Email list */}
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {emails.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No accounts in whitelist
          </div>
        ) : (
          emails.map((email) => {
            const isSuperAdmin = email === superAdmin;
            return (
              <div
                key={email}
                className="flex items-center gap-3 px-4 py-3 group hover:bg-gray-50 transition-colors"
              >
                <span className="flex-1 text-sm text-gray-700 font-mono">
                  {email}
                </span>
                {isSuperAdmin ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full">
                    <Crown size={10} />
                    Super Admin
                  </span>
                ) : (
                  <button
                    onClick={() => handleRemove(email)}
                    disabled={removingEmail === email}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 rounded hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 disabled:opacity-50 transition-all"
                    title="Remove access"
                  >
                    {removingEmail === email ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    Remove
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-gray-400">
        The super-admin account is hardcoded in the backend and cannot be removed through this interface.
        Changes take effect immediately — removed users will be signed out on their next API call.
      </p>
    </div>
  );
}
