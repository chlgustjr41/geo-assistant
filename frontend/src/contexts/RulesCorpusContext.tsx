import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { querySetApi, corpusSetApi, rulesApi } from '../services/api';
import type { QuerySet, CorpusSet, RuleSet } from '../types';

interface RulesCorpusContextValue {
  querySets: QuerySet[];
  corpusSets: CorpusSet[];
  ruleSets: RuleSet[];
  loadingQuerySets: boolean;
  loadingCorpusSets: boolean;
  reloadQuerySets: () => void;
  reloadCorpusSets: () => void;
  reloadRuleSets: () => void;
}

const RulesCorpusContext = createContext<RulesCorpusContextValue | null>(null);

export function RulesCorpusProvider({ children }: { children: ReactNode }) {
  const [querySets, setQuerySets] = useState<QuerySet[]>([]);
  const [corpusSets, setCorpusSets] = useState<CorpusSet[]>([]);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [loadingQuerySets, setLoadingQuerySets] = useState(false);
  const [loadingCorpusSets, setLoadingCorpusSets] = useState(false);

  const reloadQuerySets = useCallback(() => {
    setLoadingQuerySets(true);
    querySetApi.list()
      .then(setQuerySets)
      .catch(() => {})
      .finally(() => setLoadingQuerySets(false));
  }, []);

  const reloadCorpusSets = useCallback(() => {
    setLoadingCorpusSets(true);
    corpusSetApi.list()
      .then(setCorpusSets)
      .catch(() => {})
      .finally(() => setLoadingCorpusSets(false));
  }, []);

  const reloadRuleSets = useCallback(() => {
    rulesApi.list().then(setRuleSets).catch(() => {});
  }, []);

  // Load all on mount
  useEffect(() => {
    reloadQuerySets();
    reloadCorpusSets();
    reloadRuleSets();
  }, []);

  return (
    <RulesCorpusContext.Provider value={{
      querySets, corpusSets, ruleSets,
      loadingQuerySets, loadingCorpusSets,
      reloadQuerySets, reloadCorpusSets, reloadRuleSets,
    }}>
      {children}
    </RulesCorpusContext.Provider>
  );
}

export function useRulesCorpusContext() {
  const ctx = useContext(RulesCorpusContext);
  if (!ctx) throw new Error('useRulesCorpusContext must be used within RulesCorpusProvider');
  return ctx;
}
