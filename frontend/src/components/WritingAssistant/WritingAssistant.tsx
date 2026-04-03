import { useEffect, useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, BarChart2, RotateCcw, ChevronDown, ChevronUp, Clock, Database, X, Search } from 'lucide-react';
import { ArticleInput } from './ArticleInput';
import { ConfigPanel } from './ConfigPanel';
import { SideBySideView } from './SideBySideView';
import { GEOScorePanel } from './GEOScorePanel';
import { RewriteHistory } from './RewriteHistory';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useWritingAssistant } from '../../hooks/useWritingAssistant';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useSettings } from '../../hooks/useSettings';
import { toast } from '../shared/Toast';
import { GE_MODELS } from '../../types';
import type { CorpusSet, QuerySet, RuleSetDetail } from '../../types';
import { rulesApi, corpusSetApi, querySetApi } from '../../services/api';
import { queryKeys } from '../../lib/queryClient';

function SectionHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-400 text-white text-xs font-bold shrink-0">
        {step}
      </span>
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{title}</h2>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

export function WritingAssistant() {
  const [showAllRules, setShowAllRules] = useState(false);
  const [evalBatchMode, setEvalBatchMode] = useState(false);
  const [evalBatchSelection, setEvalBatchSelection] = useState<'random' | 'manual'>('random');
  const [evalBatchCount, setEvalBatchCount] = useState<number>(5);
  const [manualQueries, setManualQueries] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const { settings } = useSettings();
  const defaultModel = settings?.default_model || 'claude-sonnet-4-6';
  const {
    scraped, articleText, setArticleText,
    rewriteResult, geoResult,
    ruleSets, history,
    scraping, rewriting, evaluating,
    rewriteProgress, evalProgress,
    recoveredEvalConfig,
    scrapeUrl, rewrite, evaluateGeo,
    deleteFromHistory,
    reset,
    currentArticleId,
  } = useWritingAssistant();

  const [selectedRuleSetIds, setSelectedRuleSetIds] = useLocalStorage<string[]>('geo_selected_rule_sets', []);

  // ── Corpus set picker state ────────────────────────────────────────────────
  const { data: allCorpusSets = [] } = useQuery<CorpusSet[]>({
    queryKey: queryKeys.corpusSets,
    queryFn: corpusSetApi.list,
  });
  const { data: allQuerySets = [] } = useQuery<QuerySet[]>({
    queryKey: queryKeys.querySets,
    queryFn: querySetApi.list,
  });

  // Derive default corpus set IDs and query set IDs from selected rule sets
  const [ruleSetDetails, setRuleSetDetails] = useState<Record<string, RuleSetDetail>>({});
  useEffect(() => {
    let cancelled = false;
    const idsToFetch = selectedRuleSetIds.filter((id) => !ruleSetDetails[id]);
    if (idsToFetch.length === 0) return;
    Promise.all(idsToFetch.map((id) => rulesApi.get(id).catch(() => null))).then((results) => {
      if (cancelled) return;
      setRuleSetDetails((prev) => {
        const next = { ...prev };
        results.forEach((r) => { if (r) next[r.id] = r; });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [selectedRuleSetIds]);

  const defaultCorpusSetIds = useMemo(() => {
    const ids: string[] = [];
    for (const rsId of selectedRuleSetIds) {
      const detail = ruleSetDetails[rsId];
      if (detail?.extraction_metadata?.corpus_set_ids) {
        for (const cid of detail.extraction_metadata.corpus_set_ids) {
          if (!ids.includes(cid)) ids.push(cid);
        }
      }
    }
    return ids;
  }, [selectedRuleSetIds, ruleSetDetails]);

  const linkedQuerySetIds = useMemo(() => {
    const ids: string[] = [];
    for (const rsId of selectedRuleSetIds) {
      const detail = ruleSetDetails[rsId];
      if (detail?.extraction_metadata?.query_set_id) {
        const qsId = detail.extraction_metadata.query_set_id;
        if (!ids.includes(qsId)) ids.push(qsId);
      }
    }
    return ids;
  }, [selectedRuleSetIds, ruleSetDetails]);

  // Corpus set IDs for evaluation = defaults + user additions
  const [extraCorpusSetIds, setExtraCorpusSetIds] = useLocalStorage<string[]>('geo_extra_corpus_ids', []);
  const [removedDefaultCorpusIds, setRemovedDefaultCorpusIds] = useLocalStorage<string[]>('geo_removed_default_corpus_ids', []);

  const evalCorpusSetIds = useMemo(() => {
    const base = defaultCorpusSetIds.filter((id) => !removedDefaultCorpusIds.includes(id));
    const extra = extraCorpusSetIds.filter((id) => !base.includes(id));
    return [...base, ...extra];
  }, [defaultCorpusSetIds, extraCorpusSetIds, removedDefaultCorpusIds]);

  const addableCorpusSets = useMemo(
    () => allCorpusSets.filter((cs) => !evalCorpusSetIds.includes(cs.id)),
    [allCorpusSets, evalCorpusSetIds],
  );

  const removeCorpusSet = (id: string) => {
    if (defaultCorpusSetIds.includes(id)) {
      setRemovedDefaultCorpusIds((prev) => [...prev, id]);
    }
    setExtraCorpusSetIds((prev) => prev.filter((x) => x !== id));
  };
  const addCorpusSet = (id: string) => {
    if (removedDefaultCorpusIds.includes(id)) {
      setRemovedDefaultCorpusIds((prev) => prev.filter((x) => x !== id));
    } else {
      setExtraCorpusSetIds((prev) => [...prev, id]);
    }
  };

  // Reset removed defaults when selected rule sets change
  useEffect(() => {
    setRemovedDefaultCorpusIds([]);
  }, [selectedRuleSetIds.join(',')]);

  // Available queries from linked query sets for manual selection
  const availableQueries = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const qsId of linkedQuerySetIds) {
      const qs = allQuerySets.find((q) => q.id === qsId);
      if (qs) {
        for (const q of qs.queries) {
          if (!seen.has(q)) { seen.add(q); result.push(q); }
        }
      }
    }
    return result;
  }, [linkedQuerySetIds, allQuerySets]);

  // Restore eval batch settings from recovered active-job config
  useEffect(() => {
    if (!recoveredEvalConfig) return;
    if (recoveredEvalConfig.batch_mode !== undefined) setEvalBatchMode(!!recoveredEvalConfig.batch_mode);
    if (typeof recoveredEvalConfig.batch_query_count === 'number') setEvalBatchCount(recoveredEvalConfig.batch_query_count);
  }, [recoveredEvalConfig]);

  useEffect(() => {
    if (ruleSets.length === 0) return;
    setSelectedRuleSetIds((prev) => {
      const valid = prev.filter((id) => ruleSets.some((rs) => rs.id === id));
      return valid.length > 0 ? valid : [ruleSets[0].id];
    });
  }, [ruleSets]);

  const handleOptimize = () => {
    if (selectedRuleSetIds.length === 0) { toast('error', 'Select at least one rule set'); return; }
    rewrite(selectedRuleSetIds, defaultModel);
  };

  const handleCopyOptimized = () => {
    if (rewriteResult) {
      navigator.clipboard.writeText(rewriteResult.rewritten_content);
      toast('success', 'Copied to clipboard');
    }
  };

  const handleEvaluate = useCallback((testQuery?: string) => {
    const isManualBatch = evalBatchMode && evalBatchSelection === 'manual';
    evaluateGeo({
      testQuery,
      ruleSetIds: selectedRuleSetIds,
      batchMode: evalBatchMode,
      batchQueryCount: evalBatchMode && evalBatchSelection === 'random' ? evalBatchCount : undefined,
      batchQueries: isManualBatch ? manualQueries : undefined,
      corpusSetIds: evalCorpusSetIds.length > 0 ? evalCorpusSetIds : undefined,
    });
  }, [evaluateGeo, selectedRuleSetIds, evalBatchMode, evalBatchSelection, evalBatchCount, manualQueries, evalCorpusSetIds]);

  void scraped;
  void currentArticleId;

  return (
    <div className="space-y-5">

      {/* ── Step 1: Configure & Optimize ──────────────────────────────── */}
      <SectionHeader step={1} title="Configure & Optimize" />

      <ArticleInput
        onTextChange={setArticleText}
        onScrape={scrapeUrl}
        scraping={scraping}
        currentText={articleText}
      />

      <ConfigPanel
        selectedRuleSetIds={selectedRuleSetIds}
        onRuleSetIdsChange={setSelectedRuleSetIds}
        ruleSets={ruleSets}
      />

      <div className="flex items-center gap-3">
        <button
          onClick={handleOptimize}
          disabled={rewriting || !articleText.trim() || selectedRuleSetIds.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-400 text-white rounded-lg font-medium hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {rewriting ? <LoadingSpinner size="sm" /> : null}
          {rewriting
            ? (rewriteProgress?.stage === 'merging_rules' ? 'Merging rules...'
              : rewriteProgress?.stage === 'rewriting' ? 'Optimizing article...'
              : selectedRuleSetIds.length > 1 ? 'Merging rules & optimizing...' : 'Optimizing...')
            : 'Optimize Article'}
        </button>

        {(articleText || rewriteResult || geoResult) && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-red-600 hover:border-red-300 transition-colors"
            title="Clear article, optimization result, and evaluation — start fresh"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        )}
      </div>

      {rewriteResult && (
        <>
          {/* ── Step 2: Optimization Results ──────────────────────────── */}
          <SectionHeader step={2} title="Optimization Results" />

          <SideBySideView
            original={rewriteResult.original_content}
            optimized={rewriteResult.rewritten_content}
          />

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleCopyOptimized}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Copy size={14} /> Copy Optimized
            </button>
          </div>

          {rewriteResult.rules_applied.length > 0 && (
            <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-primary-700">Optimization Rules Applied</p>
                {rewriteResult.model_used && (
                  <span className="text-xs bg-primary-200 text-primary-800 px-2 py-0.5 rounded-full font-medium">
                    {GE_MODELS.find((m) => m.id === rewriteResult.model_used)?.label ?? rewriteResult.model_used}
                  </span>
                )}
                {rewriteResult.rule_set_ids.map((id) => {
                  const rs = ruleSets.find((r) => r.id === id);
                  return rs ? (
                    <span key={id} className="text-xs bg-primary-200 text-primary-800 px-2 py-0.5 rounded-full font-medium">
                      {rs.name}
                    </span>
                  ) : null;
                })}
              </div>
              <div>
                <button
                  onClick={() => setShowAllRules((v) => !v)}
                  className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800 mb-1.5"
                >
                  {showAllRules ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {rewriteResult.rules_applied.length} rules
                  {showAllRules ? ' (collapse)' : ' (expand to see all)'}
                </button>
                {showAllRules && (
                  <ul className="text-xs text-primary-600 space-y-1">
                    {rewriteResult.rules_applied.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-primary-400 shrink-0">{i + 1}.</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {!showAllRules && (
                  <ul className="text-xs text-primary-500 space-y-0.5">
                    {rewriteResult.rules_applied.slice(0, 3).map((r, i) => (
                      <li key={i} className="truncate">&bull; {r}</li>
                    ))}
                    {rewriteResult.rules_applied.length > 3 && (
                      <li className="text-primary-400 italic">
                        &hellip;and {rewriteResult.rules_applied.length - 3} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ── GEO Evaluation Config ────────────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">GEO Evaluation</h3>
            <p className="text-xs text-gray-500">
              Uses your Corpus documents as competition (or synthetic fallback if corpus has fewer than 10 docs).
              Evaluated by a neutral AI engine.
            </p>

            {/* Corpus Set Picker */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                <Database size={12} /> Corpus Pool for Evaluation
              </label>
              <div className="flex flex-wrap gap-1.5">
                {evalCorpusSetIds.map((csId) => {
                  const cs = allCorpusSets.find((c) => c.id === csId);
                  const isDefault = defaultCorpusSetIds.includes(csId);
                  return (
                    <span
                      key={csId}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                        isDefault ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {cs?.name ?? csId}
                      {isDefault && <span className="text-primary-400 text-[10px]">(default)</span>}
                      <button
                        onClick={() => removeCorpusSet(csId)}
                        className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}
                {evalCorpusSetIds.length === 0 && (
                  <span className="text-xs text-amber-600 italic">No corpus selected — synthetic competitors will be used</span>
                )}
              </div>
              {addableCorpusSets.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) addCorpusSet(e.target.value); }}
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400"
                >
                  <option value="">+ Add corpus set...</option>
                  {addableCorpusSets.map((cs) => (
                    <option key={cs.id} value={cs.id}>{cs.name} ({cs.num_docs} docs)</option>
                  ))}
                </select>
              )}
            </div>

            {/* Batch Mode Toggle */}
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 w-fit">
              <button
                onClick={() => setEvalBatchMode(false)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  !evalBatchMode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Single Query
              </button>
              <button
                onClick={() => setEvalBatchMode(true)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  evalBatchMode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Batch Queries
              </button>
            </div>

            {evalBatchMode && (
              <div className="space-y-3">
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Batch mode runs one GE simulation per query and may take longer and cost more.
                </p>

                {/* Random vs Manual selection */}
                <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 w-fit">
                  <button
                    onClick={() => setEvalBatchSelection('random')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      evalBatchSelection === 'random' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Random Selection
                  </button>
                  <button
                    onClick={() => setEvalBatchSelection('manual')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      evalBatchSelection === 'manual' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Manual Selection
                  </button>
                </div>

                {evalBatchSelection === 'random' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 shrink-0">Randomly select</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={evalBatchCount}
                      onChange={(e) => setEvalBatchCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                      className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <span className="text-xs text-gray-600">queries from the query set</span>
                  </div>
                )}

                {evalBatchSelection === 'manual' && (
                  <div className="space-y-2">
                    {availableQueries.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">
                        No queries found. The selected rule sets must be linked to query sets.
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-600">
                            {manualQueries.length} of {availableQueries.length} queries selected
                          </p>
                          <button
                            onClick={() => setManualQueries(
                              manualQueries.length === availableQueries.length ? [] : [...availableQueries]
                            )}
                            className="text-xs text-primary-500 hover:text-primary-700 font-medium"
                          >
                            {manualQueries.length === availableQueries.length ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                          {availableQueries.map((q) => {
                            const checked = manualQueries.includes(q);
                            return (
                              <label
                                key={q}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-xs transition-colors ${
                                  checked ? 'bg-primary-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setManualQueries((prev) =>
                                      checked ? prev.filter((x) => x !== q) : [...prev, q]
                                    )
                                  }
                                  className="accent-primary-400 shrink-0"
                                />
                                <Search size={10} className="text-gray-400 shrink-0" />
                                <span className="text-gray-700">{q}</span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => handleEvaluate()}
              disabled={evaluating || (evalBatchMode && evalBatchSelection === 'manual' && manualQueries.length === 0)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50 transition-colors"
            >
              {evaluating ? <LoadingSpinner size="sm" /> : <BarChart2 size={14} />}
              {evaluating
                ? (evalProgress?.total && Number(evalProgress.total) > 1
                    ? `Evaluating... ${evalProgress.completed ?? 0}/${evalProgress.total} queries`
                    : 'Evaluating...')
                : evalBatchMode
                  ? evalBatchSelection === 'manual'
                    ? `Run Batch GEO Evaluation (${manualQueries.length})`
                    : `Run Batch GEO Evaluation (${evalBatchCount})`
                  : 'Run GEO Evaluation'}
            </button>
          </div>
        </>
      )}

      {geoResult && (
        <>
          {/* ── Step 3: GEO Evaluation Results ────────────────────────── */}
          <SectionHeader step={3} title="GEO Evaluation Results" />

          <GEOScorePanel
            response={geoResult}
            onReEvaluate={(query) => handleEvaluate(query)}
            evaluating={evaluating}
          />
        </>
      )}

      {/* ── Recent Optimizations (collapsible) ────────────────────────── */}
      {history.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-2">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left group mb-3"
          >
            <Clock size={14} className="text-gray-400 shrink-0" />
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Recent Optimizations</h2>
            <span className="text-xs text-gray-400 font-normal normal-case">{history.length} saved</span>
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
              {historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {historyOpen && (
            <RewriteHistory
              history={history}
              onDelete={deleteFromHistory}
              onRestore={(detail) => {
                setArticleText(detail.original_content);
                reset();
                setArticleText(detail.original_content);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
