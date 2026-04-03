import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../services/api';
import { queryKeys } from '../lib/queryClient';

export function useSettings() {
  const { data: settings, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: queryKeys.settings,
    queryFn: settingsApi.get,
  });

  return {
    settings: settings ?? null,
    loading,
    error: queryError ? 'Failed to load settings. Is the backend running?' : null,
    reload: () => { refetch(); },
  };
}
