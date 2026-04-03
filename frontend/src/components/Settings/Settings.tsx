import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '../../hooks/useSettings';
import { settingsApi } from '../../services/api';
import { queryKeys } from '../../lib/queryClient';
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
  const queryClient = useQueryClient();
  const { settings, loading, error, reload } = useSettings();
  const [defaultModel, setDefaultModel] = useState('');
  const [maxCorpusUrls, setMaxCorpusUrls] = useState('');
  const [maxQueriesPerSet, setMaxQueriesPerSet] = useState('');
  const [savingDefaults, setSavingDefaults] = useState(false);

  // Initialize controlled inputs from loaded settings
  useEffect(() => {
    if (settings) {
      setDefaultModel(settings.default_model);
      setMaxCorpusUrls(String(settings.max_corpus_urls));
      setMaxQueriesPerSet(String(settings.max_queries_per_set));
    }
  }, [settings]);

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
      const corpusUrlsNum = maxCorpusUrls ? Math.max(1, parseInt(maxCorpusUrls, 10)) : undefined;
      const queriesNum = maxQueriesPerSet ? Math.max(1, parseInt(maxQueriesPerSet, 10)) : undefined;
      await settingsApi.updateDefaults({
        default_model: defaultModel || undefined,
        max_corpus_urls: corpusUrlsNum && !isNaN(corpusUrlsNum) ? corpusUrlsNum : undefined,
        max_queries_per_set: queriesNum && !isNaN(queriesNum) ? queriesNum : undefined,
      });
      toast('success', 'Defaults saved');
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
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
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {GE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max Corpus URLs per Batch</label>
            <input
              type="number"
              min={1}
              value={maxCorpusUrls}
              onChange={(e) => setMaxCorpusUrls(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-400 mt-0.5">Limits bulk URL import in Build Corpus</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max Queries per Set</label>
            <input
              type="number"
              min={1}
              value={maxQueriesPerSet}
              onChange={(e) => setMaxQueriesPerSet(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-400 mt-0.5">Limits queries saved in a query set</p>
          </div>
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
