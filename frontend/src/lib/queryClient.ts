import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // Data considered fresh for 30s
      gcTime: 5 * 60_000,      // Keep unused cache for 5min
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Centralized query keys — every cache entry uses one of these
export const queryKeys = {
  settings: ['settings'] as const,
  ruleSets: ['ruleSets'] as const,
  querySets: ['querySets'] as const,
  corpusSets: ['corpusSets'] as const,
  corpusDocs: ['corpusDocs'] as const,
  corpusCount: ['corpusCount'] as const,
  corpusBinaryAudit: ['corpusBinaryAudit'] as const,
  articleHistory: ['articleHistory'] as const,
  articleDetail: (id: string) => ['articleDetail', id] as const,
  activeJobs: ['activeJobs'] as const,
};
