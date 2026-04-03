import { useState, useCallback } from 'react';
import { corpusApi } from '../services/api';
import type { CorpusDocument } from '../types';
import { toast } from '../components/shared/Toast';

export function useCorpus() {
  const [docs, setDocs] = useState<CorpusDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await corpusApi.list());
    } catch {
      toast('error', 'Failed to load corpus');
    } finally {
      setLoading(false);
    }
  }, []);

  const addText = async (title: string, content: string, sourceUrl?: string) => {
    setAdding(true);
    try {
      await corpusApi.addText({ title, content, source_url: sourceUrl });
      toast('success', 'Document added to corpus');
      await loadDocs();
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
      await loadDocs();
    } catch {
      toast('error', 'Failed to scrape and add URL');
    } finally {
      setAdding(false);
    }
  };

  const deleteDoc = async (id: string) => {
    try {
      await corpusApi.delete(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast('success', 'Document removed');
    } catch {
      toast('error', 'Failed to delete document');
    }
  };

  const bulkDelete = async (ids: string[]) => {
    try {
      const result = await corpusApi.bulkDelete(ids);
      setDocs((prev) => prev.filter((d) => !ids.includes(d.id)));
      toast('success', `Removed ${result.deleted} documents`);
    } catch {
      toast('error', 'Failed to delete documents');
    }
  };

  return { docs, loading, adding, loadDocs, addText, addUrl, deleteDoc, bulkDelete };
}
