import { useEffect, useState } from 'react';
import { Copy, BarChart2, RotateCcw, ChevronDown, ChevronUp, Clock } from 'lucide-react';
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
  const [evalBatchCount, setEvalBatchCount] = useState<number>(5);
  const [historyOpen, setHistoryOpen] = useState(true);
  const { settings } = useSettings();
  const defaultModel = settings?.default_model || 'claude-sonnet-4-6';
  const {
    scraped, articleText, setArticleText,
    rewriteResult, geoResult,
    ruleSets, history,
    scraping, rewriting, evaluating,
    rewriteProgress, evalProgress,
    scrapeUrl, rewrite, evaluateGeo,
    loadRuleSets, loadHistory, deleteFromHistory,
    reset,
    currentArticleId,
  } = useWritingAssistant();

  const [selectedRuleSetIds, setSelectedRuleSetIds] = useLocalStorage<string[]>('geo_selected_rule_sets', []);

  useEffect(() => { loadRuleSets(); loadHistory(); }, []);

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

          {/* GEO Evaluation trigger */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">GEO Evaluation</h3>
            <p className="text-xs text-gray-500">
              Uses your Corpus documents as competition (or synthetic fallback if corpus has fewer than 10 docs).
              Evaluated by a neutral AI engine.
            </p>

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
              <div className="space-y-2">
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Batch mode runs one GE simulation per query and may take longer and cost more.
                </p>
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
              </div>
            )}

            <button
              onClick={() => evaluateGeo(undefined, selectedRuleSetIds, evalBatchMode, evalBatchMode ? evalBatchCount : undefined)}
              disabled={evaluating}
              className="flex items-center gap-2 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50 transition-colors"
            >
              {evaluating ? <LoadingSpinner size="sm" /> : <BarChart2 size={14} />}
              {evaluating
                ? (evalProgress?.total && Number(evalProgress.total) > 1
                    ? `Evaluating... ${evalProgress.completed ?? 0}/${evalProgress.total} queries`
                    : 'Evaluating...')
                : evalBatchMode ? `Run Batch GEO Evaluation (${evalBatchCount})` : 'Run GEO Evaluation'}
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
            onReEvaluate={(query) => evaluateGeo(query, selectedRuleSetIds, evalBatchMode, evalBatchMode ? evalBatchCount : undefined)}
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
