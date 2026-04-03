import { useEffect, useRef, useState } from 'react';
import { Globe, Plus, Link, FileText, CheckSquare, Square, ChevronDown, ChevronUp, Database, Pencil } from 'lucide-react';
import { corpusApi, corpusSetApi, jobsApi, getAuthHeaders, apiUrl } from '../../services/api';
import type { DiscoverResult } from '../../services/api';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toast } from '../shared/Toast';
import { useCorpus } from '../../hooks/useCorpus';
import { useRulesCorpusContext } from '../../contexts/RulesCorpusContext';
import { useActiveJobs } from '../../contexts/ActiveJobsContext';

interface Props {
  onCorpusChanged?: () => void;
}

function formatSetName(qsName: string): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${qsName} — ${date}`;
}

export function BuildCorpus({ onCorpusChanged }: Props) {
  const { docs, loadDocs, addText, addUrl, adding } = useCorpus();
  const { querySets, corpusSets, reloadCorpusSets } = useRulesCorpusContext();

  const [selectedQsId, setSelectedQsId] = useState('');
  const [maxUrls, setMaxUrls] = useState(20);

  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoverResult[] | null>(null);
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);
  const [showQueries, setShowQueries] = useState(false);
  const [pickedUrls, setPickedUrls] = useState<Set<string>>(new Set());
  const { importing, setImporting } = useActiveJobs();
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number; added: number; failedCount: number } | null>(null);
  const [importFailures, setImportFailures] = useState<Array<{ url: string; error: string }>>([]);

  // Corpus set naming for the import batch
  const [corpusSetName, setCorpusSetName] = useState('');
  const [editingSetName, setEditingSetName] = useState(false);

  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  // For manual add — allow assigning to existing or new corpus set
  const [manualCorpusSetId, setManualCorpusSetId] = useState('');

  useEffect(() => {
    loadDocs();
  }, []);

  // Auto-select first query set when list loads
  useEffect(() => {
    if (!selectedQsId && querySets.length > 0) {
      setSelectedQsId(querySets[0].id);
      setCorpusSetName(formatSetName(querySets[0].name));
    }
  }, [querySets]);

  const selectedQs = querySets.find((q) => q.id === selectedQsId);
  const taggedDocs = docs.filter((d) => d.query_set_id === selectedQsId);

  const handleQsChange = (id: string) => {
    setSelectedQsId(id);
    setDiscovered(null);
    const qs = querySets.find((q) => q.id === id);
    if (qs) setCorpusSetName(formatSetName(qs.name));
  };

  const handleDiscover = async () => {
    if (!selectedQsId) { toast('error', 'Select a query set first'); return; }
    setDiscovering(true);
    setDiscovered(null);
    setPickedUrls(new Set());
    setImportFailures([]);
    try {
      const res = await corpusApi.discoverFromQuerySet({ query_set_id: selectedQsId, max_urls: maxUrls });
      setDiscovered(res.urls);
      setQueriesUsed(res.queries_used);
      setPickedUrls(new Set(res.urls.map((u) => u.url)));
      toast('success', `Found ${res.urls.length} sources`);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast('error', detail || 'Discovery failed');
    } finally {
      setDiscovering(false);
    }
  };

  const togglePick = (url: string) => {
    setPickedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const toggleAll = () => {
    if (!discovered) return;
    setPickedUrls(pickedUrls.size === discovered.length ? new Set() : new Set(discovered.map((u) => u.url)));
  };

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref to track active-job flag ID for cleanup after polling completes
  const activeJobFlagRef = useRef<string | null>(null);

  // Start polling a running corpus import job by job_id
  const startPolling = (jobId: string) => {
    sessionStorage.setItem('geo_corpus_import_job_id', jobId);
    setImporting(true);
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const j = await jobsApi.get(jobId);
        if (j.status === 'running') {
          const pr = j.progress as Record<string, number> | undefined;
          if (pr && 'completed' in pr) {
            setImportProgress({ completed: pr.completed, total: pr.total, added: pr.added ?? 0, failedCount: pr.failed_count ?? 0 });
          }
        } else if (j.status === 'complete') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          sessionStorage.removeItem('geo_corpus_import_job_id');
          setImporting(false);
          setImportProgress(null);
          const result = j.result as { added?: number; failed?: Array<{ url: string; error: string }> } | null;
          if (result?.added) toast('success', `Added ${result.added} docs to corpus`);
          if (result?.failed?.length) setImportFailures(result.failed);
          setDiscovered(null);
          setPickedUrls(new Set());
          await loadDocs();
          reloadCorpusSets();
          onCorpusChanged?.();
          // Clean up persistent flag
          if (activeJobFlagRef.current) {
            jobsApi.deleteActive(activeJobFlagRef.current).catch(() => {});
            activeJobFlagRef.current = null;
          }
        } else {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          sessionStorage.removeItem('geo_corpus_import_job_id');
          setImporting(false);
          setImportProgress(null);
          toast('error', j.error || 'Import failed');
          if (activeJobFlagRef.current) {
            jobsApi.deleteActive(activeJobFlagRef.current).catch(() => {});
            activeJobFlagRef.current = null;
          }
        }
      } catch {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        sessionStorage.removeItem('geo_corpus_import_job_id');
        setImporting(false);
        setImportProgress(null);
      }
    }, 3000);
  };

  // ── Recover running import job on mount ──
  // Checks sessionStorage first (same-session refresh), then persistent DB flags (sign-out/sign-in)
  useEffect(() => {
    const savedJobId = sessionStorage.getItem('geo_corpus_import_job_id');

    if (savedJobId) {
      // Same-session refresh recovery
      let cancelled = false;
      jobsApi.get(savedJobId).then((job) => {
        if (cancelled) return;
        if (job.status === 'running') {
          const p = job.progress as Record<string, number> | undefined;
          if (p && 'completed' in p) {
            setImportProgress({ completed: p.completed, total: p.total, added: p.added ?? 0, failedCount: p.failed_count ?? 0 });
          }
          startPolling(savedJobId);
        } else if (job.status === 'complete') {
          sessionStorage.removeItem('geo_corpus_import_job_id');
          const result = job.result as { added?: number; failed?: Array<{ url: string; error: string }> } | null;
          if (result?.added) toast('success', `Added ${result.added} docs to corpus`);
          if (result?.failed?.length) setImportFailures(result.failed);
          loadDocs();
          reloadCorpusSets();
        } else {
          sessionStorage.removeItem('geo_corpus_import_job_id');
        }
      }).catch(() => {
        sessionStorage.removeItem('geo_corpus_import_job_id');
      });
      return () => { cancelled = true; if (pollingRef.current) clearInterval(pollingRef.current); };
    }

    // Cross-session recovery: check persistent DB flags
    jobsApi.listActive().then(({ active_jobs }) => {
      for (const aj of active_jobs) {
        if (aj.job_type !== 'corpus_import') continue;
        const cfg = aj.config as Record<string, unknown> | null;

        // Restore query set selection from config
        if (cfg?.query_set_id && typeof cfg.query_set_id === 'string') {
          setSelectedQsId(cfg.query_set_id);
        }

        if (aj.status === 'running') {
          activeJobFlagRef.current = aj.id;
          startPolling(aj.job_id);
          // Set progress from initial info
          if (cfg?.url_count) {
            setImportProgress({ completed: 0, total: cfg.url_count as number, added: 0, failedCount: 0 });
          }
        } else if (aj.status === 'complete' && aj.result) {
          const result = aj.result as { added?: number; failed?: Array<{ url: string; error: string }> };
          if (result.added) toast('success', `Corpus import completed while you were away (${result.added} docs added)`);
          if (result.failed?.length) setImportFailures(result.failed);
          loadDocs();
          reloadCorpusSets();
          onCorpusChanged?.();
          jobsApi.deleteActive(aj.id).catch(() => {});
        } else {
          if (aj.status === 'stale') toast('error', 'A previous corpus import was interrupted by a server restart');
          else if (aj.status === 'error') toast('error', aj.error || 'A previous corpus import failed');
          jobsApi.deleteActive(aj.id).catch(() => {});
        }
        break; // Only handle first corpus_import flag
      }
    }).catch(() => { /* auth not ready or API unavailable */ });

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const handleImport = async () => {
    if (pickedUrls.size === 0) { toast('error', 'Select at least one URL'); return; }
    setImporting(true);
    setImportFailures([]);
    setImportProgress({ completed: 0, total: pickedUrls.size, added: 0, failedCount: 0 });
    try {
      // Create the corpus set first
      const name = corpusSetName.trim() || formatSetName(selectedQs?.name || 'Corpus');
      const newSet = await corpusSetApi.create({ name, query_set_id: selectedQsId || undefined });

      const headers = await getAuthHeaders();
      const response = await fetch(apiUrl('/api/corpus/bulk-add-urls'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          urls: Array.from(pickedUrls),
          query_set_id: selectedQsId || undefined,
          corpus_set_id: newSet.id,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const failures: Array<{ url: string; error: string }> = [];
      let totalAdded = 0;

      let currentJobId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.status === 'started' && data.job_id) {
              currentJobId = data.job_id;
              sessionStorage.setItem('geo_corpus_import_job_id', data.job_id);
            } else if (data.status === 'progress') {
              setImportProgress({ completed: data.completed, total: data.total, added: data.added, failedCount: data.failed_count });
              if (!data.success) failures.push({ url: data.url, error: data.error });
              totalAdded = data.added;
            } else if (data.status === 'complete') {
              sessionStorage.removeItem('geo_corpus_import_job_id');
              if (data.failed?.length) failures.push(...data.failed);
            } else if (data.status === 'error') {
              throw new Error(data.message);
            }
          } catch { /* skip malformed lines */ }
        }
      }

      if (totalAdded > 0) {
        toast('success', `Added ${totalAdded} doc${totalAdded !== 1 ? 's' : ''} to corpus set "${name}"`);
        await loadDocs();
        reloadCorpusSets();
        onCorpusChanged?.();
      }
      if (failures.length > 0) setImportFailures(failures);
      setDiscovered(null);
      setPickedUrls(new Set());
      if (selectedQs) setCorpusSetName(formatSetName(selectedQs.name));

      // Clean up persistent active-job flag (created by backend)
      if (currentJobId) {
        jobsApi.listActive().then(({ active_jobs }) => {
          active_jobs
            .filter((a) => a.job_type === 'corpus_import')
            .forEach((a) => jobsApi.deleteActive(a.id).catch(() => {}));
        }).catch(() => {});
      }
    } catch {
      toast('error', 'Import failed');
      sessionStorage.removeItem('geo_corpus_import_job_id');
      // Clean up persistent flag on error too
      jobsApi.listActive().then(({ active_jobs }) => {
        active_jobs
          .filter((a) => a.job_type === 'corpus_import')
          .forEach((a) => jobsApi.deleteActive(a.id).catch(() => {}));
      }).catch(() => {});
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;
    await addUrl(urlInput.trim(), undefined, selectedQsId || undefined, manualCorpusSetId || undefined);
    setUrlInput('');
    reloadCorpusSets();
    onCorpusChanged?.();
  };

  const handleAddText = async () => {
    if (!textContent.trim()) return;
    await addText(textTitle.trim(), textContent.trim(), undefined);
    setTextTitle('');
    setTextContent('');
    onCorpusChanged?.();
  };

  return (
    <div className="space-y-4">
      {/* Query Set selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Build Corpus from Query Set</h3>
          <p className="text-xs text-gray-500">
            Discover web articles via a query set. Each import batch is saved as a named
            <strong> Corpus Set</strong> — independently selectable during rule extraction and evaluation.
          </p>
        </div>

        {querySets.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No query sets found. Create one in the <strong>Query Sets</strong> tab first.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Query Set</label>
              <select
                value={selectedQsId}
                onChange={(e) => handleQsChange(e.target.value)}
                className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                {querySets.map((qs) => (
                  <option key={qs.id} value={qs.id}>
                    {qs.name} ({qs.num_queries} queries)
                  </option>
                ))}
              </select>
              {selectedQs && (
                <p className="text-xs text-gray-400 mt-1">
                  {taggedDocs.length} corpus doc{taggedDocs.length !== 1 ? 's' : ''} already tagged to this query set
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max results</label>
              <input
                type="number"
                min={1}
                max={200}
                value={maxUrls}
                onChange={(e) => setMaxUrls(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="e.g. 20"
              />
            </div>
          </div>
        )}

        {querySets.length > 0 && (
          <button
            onClick={handleDiscover}
            disabled={discovering || !selectedQsId}
            className="flex items-center gap-2 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50"
          >
            {discovering ? <LoadingSpinner size="sm" /> : <Globe size={13} />}
            {discovering ? 'Searching the web…' : 'Search the Web'}
          </button>
        )}

        {queriesUsed.length > 0 && (
          <div className="bg-primary-100 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowQueries((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-primary-600"
            >
              <span>{queriesUsed.length} queries searched</span>
              {showQueries ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showQueries && (
              <ul className="px-3 pb-2 space-y-0.5 max-h-40 overflow-y-auto">
                {queriesUsed.map((q, i) => (
                  <li key={i} className="text-xs text-primary-500 truncate">&bull; {q}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {discovered && discovered.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Corpus set name bar */}
            <div className="px-3 py-2 bg-primary-50 border-b border-primary-100 flex items-center gap-2">
              <Database size={12} className="text-primary-600 shrink-0" />
              <span className="text-xs text-primary-700 font-medium">Save as corpus set:</span>
              {editingSetName ? (
                <input
                  autoFocus
                  value={corpusSetName}
                  onChange={(e) => setCorpusSetName(e.target.value)}
                  onBlur={() => setEditingSetName(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingSetName(false)}
                  className="flex-1 text-xs px-2 py-0.5 border border-primary-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              ) : (
                <button
                  onClick={() => setEditingSetName(true)}
                  className="flex items-center gap-1 text-xs text-primary-700 font-semibold hover:underline"
                >
                  {corpusSetName || 'Unnamed set'}
                  <Pencil size={10} />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
              <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800">
                {pickedUrls.size === discovered.length
                  ? <CheckSquare size={13} className="text-primary-600" />
                  : <Square size={13} />}
                {pickedUrls.size} / {discovered.length} selected
              </button>
              <button
                onClick={handleImport}
                disabled={importing || pickedUrls.size === 0}
                className="flex items-center gap-1.5 px-3 py-1 bg-primary-400 text-white rounded text-xs font-medium hover:bg-primary-500 disabled:opacity-50"
              >
                {importing ? <LoadingSpinner size="sm" /> : <Plus size={12} />}
                {importing ? `Scraping ${pickedUrls.size}…` : `Add ${pickedUrls.size} to Corpus`}
              </button>
            </div>
            {/* Import progress bar */}
            {importing && importProgress && (
              <div className="px-3 py-2 bg-primary-50 border-b border-primary-100 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-primary-700 font-medium">
                    Scraping URLs… {importProgress.completed}/{importProgress.total}
                  </span>
                  <span className="text-primary-500">
                    {importProgress.added} added{importProgress.failedCount > 0 ? `, ${importProgress.failedCount} failed` : ''}
                  </span>
                </div>
                <div className="w-full bg-primary-200 rounded-full h-1.5">
                  <div
                    className="bg-primary-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((importProgress.completed / Math.max(importProgress.total, 1)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {discovered.map((item) => (
                <label key={item.url} className="flex items-start gap-2.5 px-3 py-3 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={pickedUrls.has(item.url)} onChange={() => togglePick(item.url)} className="mt-0.5 rounded shrink-0" />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-xs font-medium text-gray-800 line-clamp-1">{item.title}</p>
                    <p className="text-xs text-gray-400 truncate">{item.url}</p>
                    {item.snippet && <p className="text-xs text-gray-500 line-clamp-2">{item.snippet}</p>}
                  </div>
                  {item.hit_count > 1 && (
                    <span className="shrink-0 text-xs text-primary-500 bg-primary-100 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                      {item.hit_count}× matched
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {discovered && discovered.length === 0 && (
          <p className="text-xs text-gray-400 italic">No results. DuckDuckGo may be rate-limiting — wait and try again.</p>
        )}

        {importFailures.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-red-700">{importFailures.length} URL{importFailures.length !== 1 ? 's' : ''} failed to scrape</p>
            {importFailures.map((f) => {
              const reason = f.error.includes('403') ? '403 — site blocks bots'
                : f.error.includes('404') ? '404 — page not found'
                : f.error.includes('timeout') || f.error.includes('Timeout') ? 'Timed out'
                : f.error.split('\n')[0];
              return (
                <div key={f.url} className="flex items-start gap-2">
                  <span className="shrink-0 text-xs font-medium text-red-500 mt-0.5">{reason}</span>
                  <span className="text-xs text-red-400 truncate">{f.url}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Existing corpus sets summary */}
      {corpusSets.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <Database size={12} className="text-primary-600" />
            {corpusSets.length} corpus set{corpusSets.length !== 1 ? 's' : ''} available
          </p>
          <div className="space-y-1.5">
            {corpusSets.map((cs) => (
              <div key={cs.id} className="flex items-center justify-between py-1 px-2 bg-primary-50 rounded-lg">
                <span className="text-xs font-medium text-primary-800 truncate">{cs.name}</span>
                <span className="text-xs text-primary-500 shrink-0 ml-2">{cs.num_docs} doc{cs.num_docs !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual add */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700">Add Manually</p>
        <div className="flex gap-2 mb-1">
          <button onClick={() => setMode('url')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === 'url' ? 'bg-primary-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Link size={12} /> Add by URL
          </button>
          <button onClick={() => setMode('text')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === 'text' ? 'bg-primary-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <FileText size={12} /> Paste Text
          </button>
        </div>

        {/* Corpus set assignment for manual add */}
        {corpusSets.length > 0 && mode === 'url' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Add to corpus set (optional)</label>
            <select
              value={manualCorpusSetId}
              onChange={(e) => setManualCorpusSetId(e.target.value)}
              className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">— None (unassigned) —</option>
              {corpusSets.map((cs) => (
                <option key={cs.id} value={cs.id}>{cs.name} ({cs.num_docs} docs)</option>
              ))}
            </select>
          </div>
        )}

        {mode === 'url' ? (
          <div className="flex gap-2">
            <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
              placeholder="https://example.com/article"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button onClick={handleAddUrl} disabled={adding || !urlInput.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50">
              {adding ? <LoadingSpinner size="sm" /> : <Plus size={14} />} Add
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input type="text" value={textTitle} onChange={(e) => setTextTitle(e.target.value)} placeholder="Title (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Paste article content here…" rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
            <button onClick={handleAddText} disabled={adding || !textContent.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50">
              {adding ? <LoadingSpinner size="sm" /> : <Plus size={14} />} Add Document
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
