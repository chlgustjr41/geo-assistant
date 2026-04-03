import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { corpusApi } from '../services/api';
import { queryKeys } from '../lib/queryClient';
import { toast } from '../components/shared/Toast';

export function useCorpus() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: docs = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.corpusDocs,
    queryFn: corpusApi.list,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.corpusDocs });
    queryClient.invalidateQueries({ queryKey: queryKeys.corpusSets });
    queryClient.invalidateQueries({ queryKey: queryKeys.corpusCount });
    queryClient.invalidateQueries({ queryKey: queryKeys.corpusBinaryAudit });
  };

  const loadDocs = () => invalidate();

  const addText = async (title: string, content: string, sourceUrl?: string) => {
    setAdding(true);
    try {
      await corpusApi.addText({ title, content, source_url: sourceUrl });
      toast('success', 'Document added to corpus');
      invalidate();
    } catch {
      toast('error', 'Failed to add document');
    } finally {
      setAdding(false);
    }
  };

  const addUrl = async (url: string, sourceUrl?: string, querySetId?: string, corpusSetId?: string) => {
    setAdding(true);
    try {
      const result = await corpusApi.addUrl(url, sourceUrl, querySetId, corpusSetId);
      toast('success', `Added: ${result.title}`);
      invalidate();
    } catch {
      toast('error', 'Failed to scrape and add URL');
    } finally {
      setAdding(false);
    }
  };

  const deleteDoc = async (id: string) => {
    try {
      await corpusApi.delete(id);
      queryClient.setQueryData(queryKeys.corpusDocs, (prev: typeof docs | undefined) =>
        prev ? prev.filter((d) => d.id !== id) : [],
      );
      toast('success', 'Document removed');
      // Also refresh dependent caches
      queryClient.invalidateQueries({ queryKey: queryKeys.corpusSets });
      queryClient.invalidateQueries({ queryKey: queryKeys.corpusCount });
    } catch {
      toast('error', 'Failed to delete document');
    }
  };

  const bulkDelete = async (ids: string[]) => {
    try {
      const result = await corpusApi.bulkDelete(ids);
      queryClient.setQueryData(queryKeys.corpusDocs, (prev: typeof docs | undefined) =>
        prev ? prev.filter((d) => !ids.includes(d.id)) : [],
      );
      toast('success', `Removed ${result.deleted} documents`);
      queryClient.invalidateQueries({ queryKey: queryKeys.corpusSets });
      queryClient.invalidateQueries({ queryKey: queryKeys.corpusCount });
    } catch {
      toast('error', 'Failed to delete documents');
    }
  };

  return { docs, loading, adding, loadDocs, addText, addUrl, deleteDoc, bulkDelete };
}
