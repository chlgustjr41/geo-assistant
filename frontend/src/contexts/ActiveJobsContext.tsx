import { createContext, useContext, useState, useCallback } from 'react';

/** Tracks which long-running job types are currently in progress.
 *  Used by Layout for pulsing-dot indicators and by individual
 *  components to set/clear their running state globally. */

interface ActiveJobsContextValue {
  /** Rule extraction pipeline running */
  extracting: boolean;
  setExtracting: (v: boolean) => void;

  /** Article rewrite running */
  rewriting: boolean;
  setRewriting: (v: boolean) => void;

  /** GEO evaluation running */
  evaluating: boolean;
  setEvaluating: (v: boolean) => void;

  /** Corpus import (bulk URL scrape) running */
  importing: boolean;
  setImporting: (v: boolean) => void;

  /** Query generation (LLM call) running */
  generating: boolean;
  setGenerating: (v: boolean) => void;
}

const ActiveJobsContext = createContext<ActiveJobsContextValue>({
  extracting: false, setExtracting: () => {},
  rewriting: false, setRewriting: () => {},
  evaluating: false, setEvaluating: () => {},
  importing: false, setImporting: () => {},
  generating: false, setGenerating: () => {},
});

export function ActiveJobsProvider({ children }: { children: React.ReactNode }) {
  const [extracting, _setExtracting] = useState(false);
  const [rewriting, _setRewriting] = useState(false);
  const [evaluating, _setEvaluating] = useState(false);
  const [importing, _setImporting] = useState(false);
  const [generating, _setGenerating] = useState(false);

  // Stable setters to prevent unnecessary re-renders in consumers
  const setExtracting = useCallback((v: boolean) => _setExtracting(v), []);
  const setRewriting = useCallback((v: boolean) => _setRewriting(v), []);
  const setEvaluating = useCallback((v: boolean) => _setEvaluating(v), []);
  const setImporting = useCallback((v: boolean) => _setImporting(v), []);
  const setGenerating = useCallback((v: boolean) => _setGenerating(v), []);

  return (
    <ActiveJobsContext.Provider value={{
      extracting, setExtracting,
      rewriting, setRewriting,
      evaluating, setEvaluating,
      importing, setImporting,
      generating, setGenerating,
    }}>
      {children}
    </ActiveJobsContext.Provider>
  );
}

export function useActiveJobs() {
  return useContext(ActiveJobsContext);
}

// ── Backward-compatible aliases for ExtractionContext ──
export const ExtractionProvider = ActiveJobsProvider;
export function useExtractionContext() {
  const { extracting, setExtracting } = useContext(ActiveJobsContext);
  return { extracting, setExtracting };
}
