import { useState } from 'react';
import { CheckCircle, XCircle, Save } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import { settingsApi } from '../../services/api';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toast } from '../shared/Toast';
import { GE_MODELS } from '../../types';

function ProviderStatus({ label, isSet }: { label: string; isSet: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
      {isSet
        ? <CheckCircle size={14} className="text-green-500 shrink-0" />
        : <XCircle size={14} className="text-gray-300 shrink-0" />}
      <span className="text-sm text-gray-700">{label}</span>
      <span className={`ml-auto text-xs font-medium ${isSet ? 'text-green-600' : 'text-gray-400'}`}>
        {isSet ? 'Configured' : 'Not set in .env'}
      </span>
    </div>
  );
}

export function Settings() {
  const { settings, loading, error, reload } = useSettings();
  const [defaultModel, setDefaultModel] = useState('');
  const [savingDefaults, setSavingDefaults] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-2">{error}</p>
        <button onClick={reload} className="text-sm text-primary-600 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (!settings) return null;

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    try {
      await settingsApi.updateDefaults({
        default_model: defaultModel || undefined,
      });
      toast('success', 'Defaults saved');
      reload();
    } catch {
      toast('error', 'Failed to save defaults');
    } finally {
      setSavingDefaults(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">API Keys</h2>
          <p className="text-xs text-gray-400 mt-0.5">Managed via <code className="bg-gray-100 px-1 rounded">backend/.env</code></p>
        </div>
        <div className="px-4">
          <ProviderStatus label="OpenAI" isSet={settings.openai_key_set} />
          <ProviderStatus label="Google (Gemini)" isSet={settings.google_key_set} />
          <ProviderStatus label="Anthropic (Claude)" isSet={settings.anthropic_key_set} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Defaults</h2>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Default Pipeline Model</label>
          <select
            defaultValue={settings.default_model}
            onChange={(e) => setDefaultModel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {GE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSaveDefaults}
          disabled={savingDefaults}
          className="flex items-center gap-2 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50"
        >
          {savingDefaults ? <LoadingSpinner size="sm" /> : <Save size={14} />}
          Save Defaults
        </button>
      </div>
    </div>
  );
}
