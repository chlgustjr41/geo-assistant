import { useState } from 'react';
import { CheckCircle, XCircle, Eye, EyeOff, Save } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import { settingsApi } from '../../services/api';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toast } from '../shared/Toast';
import { GE_MODELS } from '../../types';

interface KeyRowProps {
  provider: string;
  label: string;
  isSet: boolean;
  masked: string;
  onSave: (key: string) => Promise<void>;
  onTest: () => Promise<void>;
}

function KeyRow({ provider: _provider, label, isSet, masked, onSave, onTest }: KeyRowProps) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(value.trim());
      setValue('');
      toast('success', `${label} key saved`);
    } catch {
      toast('error', `Failed to save ${label} key`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await onTest();
      setTestResult(true);
      toast('success', `${label} key is valid`);
    } catch {
      setTestResult(false);
      toast('error', `${label} key test failed`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-24 shrink-0">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {isSet && (
          <p className="text-xs text-gray-400 font-mono truncate">{masked}</p>
        )}
      </div>
      <div className="flex-1 flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isSet ? 'Enter new key to update...' : 'Enter API key...'}
            className="w-full pr-8 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <button
            onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <LoadingSpinner size="sm" /> : <Save size={14} />}
          Save
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !isSet}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          title={!isSet ? 'Save a key first' : 'Test this key'}
        >
          {testing ? (
            <LoadingSpinner size="sm" />
          ) : testResult === true ? (
            <CheckCircle size={14} className="text-green-600" />
          ) : testResult === false ? (
            <XCircle size={14} className="text-red-600" />
          ) : null}
          Test
        </button>
      </div>
      <div className="w-6 shrink-0">
        {isSet && testResult === null && (
          <span className="block w-2 h-2 rounded-full bg-gray-300 mx-auto" title="Not tested" />
        )}
      </div>
    </div>
  );
}

export function Settings() {
  const { settings, loading, error, reload } = useSettings();
  const [targetWebsite, setTargetWebsite] = useState('');
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
        <button onClick={reload} className="text-sm text-blue-600 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (!settings) return null;

  const providerSaveHandler = (provider: string) => async (key: string) => {
    await settingsApi.updateApiKey(provider, key);
    reload();
  };

  const providerTestHandler = (provider: string) => async () => {
    const result = await settingsApi.testKey(provider);
    if (!result.ok) throw new Error('Key test failed');
  };

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    try {
      await settingsApi.updateDefaults({
        target_website: targetWebsite || undefined,
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">API Keys</h2>
        </div>
        <div className="px-4">
          <KeyRow
            provider="openai"
            label="OpenAI"
            isSet={settings.openai_key_set}
            masked={settings.openai_key_masked}
            onSave={providerSaveHandler('openai')}
            onTest={providerTestHandler('openai')}
          />
          <KeyRow
            provider="google"
            label="Gemini"
            isSet={settings.google_key_set}
            masked={settings.google_key_masked}
            onSave={providerSaveHandler('google')}
            onTest={providerTestHandler('google')}
          />
          <KeyRow
            provider="anthropic"
            label="Anthropic"
            isSet={settings.anthropic_key_set}
            masked={settings.anthropic_key_masked}
            onSave={providerSaveHandler('anthropic')}
            onTest={providerTestHandler('anthropic')}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Defaults</h2>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Target Website</label>
          <input
            type="url"
            defaultValue={settings.target_website}
            onChange={(e) => setTargetWebsite(e.target.value)}
            placeholder="https://careyaya.org"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Default GE Model</label>
          <select
            defaultValue={settings.default_model}
            onChange={(e) => setDefaultModel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {GE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSaveDefaults}
          disabled={savingDefaults}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {savingDefaults ? <LoadingSpinner size="sm" /> : <Save size={14} />}
          Save Defaults
        </button>
      </div>
    </div>
  );
}
