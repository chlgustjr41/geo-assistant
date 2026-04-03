import { useEffect, useRef, useState } from 'react';
import { Play, AlertTriangle, Database, Info } from 'lucide-react';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toast } from '../shared/Toast';
import { GE_MODELS } from '../../types';
import { jobsApi, getAuthHeaders, apiUrl } from '../../services/api';
import type { ActiveJobFlag } from '../../services/api';
import { useRulesCorpusContext } from '../../contexts/RulesCorpusContext';
import { useExtractionContext } from '../../contexts/ActiveJobsContext';

interface ProgressState {
  stage: string;
  completed: number;
  total: number;
  model: string;
  model_index: number;
  model_total: number;
}

interface ExtractionResult {
  model: string;
  rule_set_id?: string;
  num_rules?: number;
  error?: string;
}

const STAGE_LABELS: Record<string, string> = {
  bm25_retrieval: 'BM25 retrieval from corpus',
  explainer: 'Explainer: analyzing visibility differences',
  extractor: 'Extractor: distilling rules',
  merger: 'Merger: consolidating rules',
  filter: 'Filter: removing ambiguous rules',
};

function modelLabel(id: string): string {
  return GE_MODELS.find((m) => m.id === id)?.label ?? id;
}

const MODEL_GROUPS = [
  { provider: 'Anthropic', models: GE_MODELS.filter((m) => m.provider === 'anthropic') },
  { provider: 'OpenAI',    models: GE_MODELS.filter((m) => m.provider === 'openai') },
  { provider: 'Google',    models: GE_MODELS.filter((m) => m.provider === 'google') },
];

interface Props {
  onRuleSetSaved?: () => void;
}

export function ExtractRules({ onRuleSetSaved }: Props) {
  const { querySets, corpusSets } = useRulesCorpusContext();

  const [selectedQsId, setSelectedQsId] = useState('');
  const [selectedCorpusSetIds, setSelectedCorpusSetIds] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>(['claude-sonnet-4-6']);
  const [ruleSetName, setRuleSetName] = useState('');
  const [extractionResults, setExtractionResults] = useState<ExtractionResult[]>([]);

  const [corpusDocCount, setCorpusDocCount] = useState<number | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [step, setStep] = useState<'config' | 'extracting' | 'done'>('config');

  const { extracting, setExtracting } = useExtractionContext();

  // Auto-select first query set and its linked corpus sets when lists load
  useEffect(() => {
    if (!selectedQsId && querySets.length > 0) {
      const firstQs = querySets[0];
      setSelectedQsId(firstQs.id);
      const linked = corpusSets.filter((s) => s.query_set_id === firstQs.id).map((s) => s.id);
      if (linked.length > 0) setSelectedCorpusSetIds(linked);
    }
  }, [querySets, corpusSets]);

  // When query set changes, auto-select its linked corpus sets
  const handleQsChange = (qsId: string) => {
    setSelectedQsId(qsId);
    const linked = corpusSets.filter((cs) => cs.query_set_id === qsId).map((cs) => cs.id);
    setSelectedCorpusSetIds(linked);
  };

  // Recompute corpus doc count from selected sets
  useEffect(() => {
    if (selectedCorpusSetIds.length === 0) {
      // No sets selected — will use all sets linked to query set
      const linked = corpusSets.filter((cs) => cs.query_set_id === selectedQsId);
      setCorpusDocCount(linked.reduce((acc, cs) => acc + cs.num_docs, 0));
    } else {
      const selected = corpusSets.filter((cs) => selectedCorpusSetIds.includes(cs.id));
      setCorpusDocCount(selected.reduce((acc, cs) => acc + cs.num_docs, 0));
    }
  }, [selectedCorpusSetIds, selectedQsId, corpusSets]);

  const selectedQs = querySets.find((q) => q.id === selectedQsId);
  const linkedSets = corpusSets.filter((cs) => cs.query_set_id === selectedQsId);
  const otherSets = corpusSets.filter((cs) => cs.query_set_id !== selectedQsId);
  const effectiveSetIds = selectedCorpusSetIds.length > 0
    ? selectedCorpusSetIds
    : linkedSets.map((cs) => cs.id);
  const hasEnoughCorpus = (corpusDocCount ?? 0) >= 5;

  const toggleModel = (id: string) => {
    setSelectedModels((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
  };

  const toggleCorpusSet = (id: string) => {
    setSelectedCorpusSetIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobRef = useRef<ActiveJobFlag | null>(null);

  /** Restore form fields from the active job's config. */
  const restoreConfigFromFlag = (flag: ActiveJobFlag) => {
    const cfg = flag.config as Record<string, unknown> | null;
    if (!cfg) return;
    if (cfg.rule_set_name) setRuleSetName(String(cfg.rule_set_name));
    if (Array.isArray(cfg.engine_models)) setSelectedModels(cfg.engine_models as string[]);
    if (cfg.query_set_id) setSelectedQsId(String(cfg.query_set_id));
    if (Array.isArray(cfg.corpus_set_ids)) setSelectedCorpusSetIds(cfg.corpus_set_ids as string[]);
  };

  /** Start polling an in-memory job by its job_id, with optional persistent active-job flag ID. */
  const startPolling = (memJobId: string, activeFlag?: ActiveJobFlag | null) => {
    if (activeFlag) activeJobRef.current = activeFlag;
    setExtracting(true);
    setStep('extracting');
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const j = await jobsApi.get(memJobId);
        if (j.status === 'running' && j.progress && 'stage' in j.progress) {
          const p = j.progress as Record<string, unknown>;
          setProgress({
            stage: String(p.stage ?? ''),
            completed: Number(p.completed ?? 0),
            total: Number(p.total ?? 1),
            model: String(p.model ?? ''),
            model_index: Number(p.model_index ?? 0),
            model_total: Number(p.model_total ?? 1),
          });
        } else if (j.status === 'complete') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setStep('done');
          setExtracting(false);
          if (Array.isArray(j.result)) setExtractionResults(j.result as ExtractionResult[]);
          // Clean up persistent flag
          if (activeJobRef.current) {
            jobsApi.deleteActive(activeJobRef.current.id).catch(() => {});
            activeJobRef.current = null;
          }
          onRuleSetSaved?.();
          toast('success', 'Rule extraction complete');
        } else if (j.status === 'error') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setStep('config');
          setExtracting(false);
          if (activeJobRef.current) {
            jobsApi.deleteActive(activeJobRef.current.id).catch(() => {});
            activeJobRef.current = null;
          }
          toast('error', j.error || 'Extraction failed');
        }
      } catch {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setStep('config');
        setExtracting(false);
        if (activeJobRef.current) {
          jobsApi.deleteActive(activeJobRef.current.id).catch(() => {});
          activeJobRef.current = null;
        }
      }
    }, 3000);
  };

  // ── Recover running job on mount (checks persistent DB flags) ──
  useEffect(() => {
    let cancelled = false;
    const recover = async () => {
      try {
        const { active_jobs } = await jobsApi.listActive();
        if (cancelled) return;
        const extractionJob = active_jobs.find((j) => j.job_type === 'extraction');
        if (!extractionJob) return;

        if (extractionJob.status === 'running') {
          // Restore form fields from config
          restoreConfigFromFlag(extractionJob);
          // Job is still running in memory — resume polling
          if (extractionJob.progress && 'stage' in extractionJob.progress) {
            const p = extractionJob.progress;
            setProgress({
              stage: String(p.stage ?? ''),
              completed: Number(p.completed ?? 0),
              total: Number(p.total ?? 1),
              model: String(p.model ?? ''),
              model_index: Number(p.model_index ?? 0),
              model_total: Number(p.model_total ?? 1),
            });
          }
          startPolling(extractionJob.job_id, extractionJob);
        } else if (extractionJob.status === 'complete') {
          // Restore form fields so user sees what was configured
          restoreConfigFromFlag(extractionJob);
          // Job finished while user was away — show results
          setStep('done');
          if (Array.isArray(extractionJob.result)) {
            setExtractionResults(extractionJob.result as ExtractionResult[]);
          }
          onRuleSetSaved?.();
          toast('success', 'Rule extraction completed while you were away');
          jobsApi.deleteActive(extractionJob.id).catch(() => {});
        } else if (extractionJob.status === 'error') {
          toast('error', extractionJob.error || 'A previous extraction failed');
          jobsApi.deleteActive(extractionJob.id).catch(() => {});
        } else if (extractionJob.status === 'stale') {
          // Server restarted — job is lost
          toast('error', 'A previous extraction was interrupted by a server restart');
          jobsApi.deleteActive(extractionJob.id).catch(() => {});
        }
      } catch {
        // API not available yet or auth not ready — ignore
      }
    };
    recover();
    return () => { cancelled = true; if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const handleExtract = async () => {
    if (!selectedQsId || !selectedQs) { toast('error', 'Select a query set first'); return; }
    if (!ruleSetName.trim()) { toast('error', 'Enter a name for the rule set'); return; }
    if (selectedModels.length === 0) { toast('error', 'Select at least one GE model'); return; }
    if (!hasEnoughCorpus) { toast('error', 'Need at least 5 corpus documents. Build corpus first.'); return; }

    setExtracting(true);
    setStep('extracting');
    setProgress(null);
    setExtractionResults([]);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(apiUrl('/api/rules/extract'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          queries: selectedQs.queries,
          engine_models: selectedModels,
          rule_set_name: ruleSetName,
          query_set_id: selectedQsId,
          corpus_set_ids: selectedCorpusSetIds,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.status === 'corpus_info') {
              // The backend already persisted the active-job flag in DB;
              // just track the in-memory job_id for SSE fallback polling
              if (data.job_id) sessionStorage.setItem('geo_extraction_job_id', data.job_id);
            } else if (data.stage) {
              setProgress({ stage: data.stage, completed: data.completed, total: data.total, model: data.model ?? '', model_index: data.model_index ?? 0, model_total: data.model_total ?? 1 });
            } else if (data.status === 'model_complete') {
              setExtractionResults((prev) => [...prev, data.result]);
              if (!data.result.error) {
                toast('success', `Saved: ${modelLabel(data.result.model)} — ${data.result.num_rules} rules`);
                onRuleSetSaved?.();
              } else {
                toast('error', `${modelLabel(data.result.model)}: ${data.result.error}`);
              }
            } else if (data.status === 'complete') {
              sessionStorage.removeItem('geo_extraction_job_id');
              setStep('done');
              setExtracting(false);
              onRuleSetSaved?.();
              toast('success', 'Rule extraction complete');
              // Clean up persistent active-job flag
              jobsApi.listActive().then(({ active_jobs }) => {
                active_jobs
                  .filter((a) => a.job_type === 'extraction')
                  .forEach((a) => jobsApi.deleteActive(a.id).catch(() => {}));
              }).catch(() => {});
            } else if (data.status === 'error') {
              throw new Error(data.message);
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Extraction failed');
      sessionStorage.removeItem('geo_extraction_job_id');
      setStep('config');
    } finally {
      setExtracting(false);
    }
  };

  const progressPct = progress
    ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100)
    : 0;

  return (
    <div className="space-y-4">

      {/* Query Set */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Query Set</h3>
        {querySets.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No query sets yet. Create one in the <strong>Query Sets</strong> tab first.
          </p>
        ) : (
          <>
            <select
              value={selectedQsId}
              onChange={(e) => handleQsChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {querySets.map((qs) => (
                <option key={qs.id} value={qs.id}>
                  {qs.name} — {qs.num_queries} queries{qs.topic ? ` (${qs.topic})` : ''}
                </option>
              ))}
            </select>
            {selectedQs && (
              <div className="max-h-24 overflow-y-auto space-y-0.5">
                {selectedQs.queries.slice(0, 4).map((q, i) => (
                  <p key={i} className="text-xs text-gray-500 truncate">{i + 1}. {q}</p>
                ))}
                {selectedQs.queries.length > 4 && (
                  <p className="text-xs text-gray-400 italic">&hellip;and {selectedQs.queries.length - 4} more</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Corpus — required, auto-linked to query set */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Corpus</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Your local substitute for ClueWeb22 — BM25 retrieves the top {5} docs per query.
            </p>
          </div>
          {corpusDocCount !== null && (
            <span className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${hasEnoughCorpus ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              <Database size={11} />
              {corpusDocCount} docs
            </span>
          )}
        </div>

        {corpusSets.length === 0 ? (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              No corpus sets yet. Go to <strong>Build Corpus</strong> to search and import web articles for your query set.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Sets linked to selected query set */}
            {linkedSets.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500">Linked to this query set</p>
                {linkedSets.map((cs) => {
                  const checked = selectedCorpusSetIds.length === 0 || selectedCorpusSetIds.includes(cs.id);
                  return (
                    <label key={cs.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${checked ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (selectedCorpusSetIds.length === 0) {
                            // was using all linked — now explicitly deselect this one
                            setSelectedCorpusSetIds(linkedSets.map((s) => s.id).filter((id) => id !== cs.id));
                          } else {
                            toggleCorpusSet(cs.id);
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="flex-1 text-xs font-medium text-gray-800 truncate">{cs.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{cs.num_docs} docs</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Other corpus sets (different query set) */}
            {otherSets.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500">Other corpus sets</p>
                {otherSets.map((cs) => {
                  const checked = selectedCorpusSetIds.includes(cs.id);
                  const linkedQs = querySets.find((q) => q.id === cs.query_set_id);
                  return (
                    <label key={cs.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${checked ? 'border-primary-300 bg-primary-100' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCorpusSet(cs.id)}
                        className="rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-gray-800 truncate block">{cs.name}</span>
                        {linkedQs && <span className="text-xs text-primary-500">{linkedQs.name}</span>}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{cs.num_docs} docs</span>
                    </label>
                  );
                })}
              </div>
            )}

            {linkedSets.length === 0 && (
              <div className="flex items-start gap-2 bg-primary-50 border border-primary-200 rounded-lg px-3 py-2">
                <Info size={13} className="text-primary-500 shrink-0 mt-0.5" />
                <p className="text-xs text-primary-700">
                  No corpus sets are linked to this query set. Build corpus using this query set, or select from other sets above.
                </p>
              </div>
            )}

            {!hasEnoughCorpus && (corpusDocCount ?? 0) > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                <AlertTriangle size={12} className="shrink-0" />
                Need at least 5 documents. Add more in Build Corpus.
              </div>
            )}
          </div>
        )}

        {effectiveSetIds.length > 0 && hasEnoughCorpus && (
          <p className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
            {corpusDocCount} docs from {effectiveSetIds.length} set{effectiveSetIds.length !== 1 ? 's' : ''} — BM25 will retrieve top 5 per query
          </p>
        )}
      </div>

      {/* GE Model selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Target GE Models</h3>
        <p className="text-xs text-gray-500">Each model produces a separate rule set.</p>
        <div className="space-y-2">
          {MODEL_GROUPS.map(({ provider, models }) => (
            <div key={provider}>
              <p className="text-xs text-gray-400 mb-1">{provider}</p>
              <div className="flex flex-wrap gap-2">
                {models.map((m) => {
                  const checked = selectedModels.includes(m.id);
                  return (
                    <label key={m.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition-colors ${checked ? 'bg-primary-400 text-white border-primary-400' : 'bg-white text-gray-600 border-gray-300 hover:border-primary-300'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleModel(m.id)} className="hidden" />
                      {m.label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Name + Extract */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Extract Rules</h3>
        <div className="flex items-center gap-3">
          <input
            value={ruleSetName}
            onChange={(e) => setRuleSetName(e.target.value)}
            placeholder="Rule set name (e.g. alzheimers-v1)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={handleExtract}
            disabled={extracting || !selectedQsId || !ruleSetName.trim() || selectedModels.length === 0 || !hasEnoughCorpus}
            className="flex items-center gap-2 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50 whitespace-nowrap"
          >
            {extracting ? <LoadingSpinner size="sm" /> : <Play size={14} />}
            Extract Rules
          </button>
        </div>
      </div>

      {/* Progress */}
      {step === 'extracting' && (
        <div className="bg-white rounded-lg border border-primary-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Extracting Rules…</h3>
          {progress ? (
            <>
              {progress.model_total > 1 && (
                <p className="text-xs text-primary-500 font-medium mb-1">
                  Model {progress.model_index + 1}/{progress.model_total}: {modelLabel(progress.model)}
                </p>
              )}
              <p className="text-sm text-gray-600 mb-2">
                {STAGE_LABELS[progress.stage] || progress.stage} ({progress.completed}/{progress.total})
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-primary-400 h-2 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <LoadingSpinner size="sm" /> Initializing pipeline…
            </div>
          )}
        </div>
      )}

      {/* Done */}
      {step === 'done' && extractionResults.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-green-800">Extraction complete</p>
          {extractionResults.map((r) => (
            <div key={r.model} className={`text-xs rounded-lg px-3 py-2 ${r.error ? 'bg-red-50 text-red-700' : 'bg-white text-green-700 border border-green-200'}`}>
              {r.error ? `${modelLabel(r.model)}: failed — ${r.error}` : `${modelLabel(r.model)}: ${r.num_rules} rules`}
            </div>
          ))}
          <button
            onClick={() => { setStep('config'); setExtractionResults([]); setProgress(null); }}
            className="text-xs text-green-700 hover:underline"
          >
            Extract another
          </button>
        </div>
      )}
    </div>
  );
}
