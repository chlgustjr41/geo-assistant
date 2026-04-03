import { useState, useEffect } from 'react';

/**
 * Drop-in replacement for useState that persists to sessionStorage.
 * Data lives for the duration of the browser tab — cleared on tab close
 * or page refresh, never written to the server.
 */
export function useSessionStorage<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Quota exceeded or private-mode restriction — fail silently
    }
  }, [key, state]);

  return [state, setState];
}
