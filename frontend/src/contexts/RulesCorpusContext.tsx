import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { querySetApi, corpusSetApi, rulesApi } from '../services/api';
import { queryKeys } from '../lib/queryClient';
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
  const queryClient = useQueryClient();

  const { data: querySets = [], isLoading: loadingQuerySets } = useQuery({
    queryKey: queryKeys.querySets,
    queryFn: querySetApi.list,
  });

  const { data: corpusSets = [], isLoading: loadingCorpusSets } = useQuery({
    queryKey: queryKeys.corpusSets,
    queryFn: corpusSetApi.list,
  });

  const { data: ruleSets = [] } = useQuery({
    queryKey: queryKeys.ruleSets,
    queryFn: rulesApi.list,
  });

  const reloadQuerySets = () => queryClient.invalidateQueries({ queryKey: queryKeys.querySets });
  const reloadCorpusSets = () => queryClient.invalidateQueries({ queryKey: queryKeys.corpusSets });
  const reloadRuleSets = () => queryClient.invalidateQueries({ queryKey: queryKeys.ruleSets });

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
