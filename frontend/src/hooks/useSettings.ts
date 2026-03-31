import { useState, useEffect, useCallback } from 'react';
import { settingsApi } from '../services/api';
import type { AppSettings } from '../types';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await settingsApi.get();
      setSettings(data);
    } catch {
      setError('Failed to load settings. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { settings, loading, error, reload: load };
}
