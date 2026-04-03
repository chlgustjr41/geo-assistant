import { useEffect, useState } from 'react';
import { Lightbulb, FlaskConical, Database, List, Search, RefreshCw, ExternalLink } from 'lucide-react';
import type { MultiGeoEvalResponse, GeoEvalResponse, SourceCitation, QueryBatchResult } from '../../types';
import { GE_MODELS } from '../../types';
import { MarkdownView } from '../shared/MarkdownView';
import { LoadingSpinner } from '../shared/LoadingSpinner';

function modelLabel(model: string): string {
  if (!model) return 'Unknown';
  if (model === 'combined') return 'Combined';
  const found = GE_MODELS.find((m) => m.id === model);
  if (found) return found.label;
  if (model.includes('sonnet')) return 'Claude Sonnet';
  if (model.includes('opus')) return 'Claude Opus';
  if (model.includes('haiku')) return 'Claude Haiku';
  if (model.includes('gpt-4o-mini')) return 'GPT-4o Mini';
  if (model.includes('gpt-4.1-mini')) return 'GPT-4.1 Mini';
  if (model === 'o4-mini') return 'o4-mini';
  if (model.includes('gpt-4.5')) return 'GPT-4.5';
  if (model.includes('gpt-4o')) return 'GPT-4o';
  if (model.includes('gpt-4.1')) return 'GPT-4.1';
  if (model.includes('gemini-3-flash-preview')) return 'Gemini 3 Flash Preview';
  if (model.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
  if (model.includes('gemini-2.5-flash-lite')) return 'Gemini 2.5 Flash Lite';
  if (model.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
  return model;
}

// ── Shared primitives ────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{children}</p>;
}

function Divider() {
  return <hr className="border-gray-100" />;
}

// ── Score card ───────────────────────────────────────────────────────────────

function ScoreCard({ label, before, after, pct }: { label: string; before: number; after: number; pct: number }) {
  const positive = pct >= 0;
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-xl font-bold text-gray-900">
        {before.toFixed(1)}&thinsp;&rarr;&thinsp;{after.toFixed(1)}
      </p>
      <p className={`text-sm font-semibold mt-1 ${positive ? 'text-green-600' : 'text-red-500'}`}>
        {positive ? '+' : ''}{pct.toFixed(1)}%
      </p>
    </div>
  );
}

function OverallImprovementBadge({ result }: { result: GeoEvalResponse }) {
  if (result.error) return <span className="text-xs text-red-500">Error</span>;
  const pct = result.improvement.overall_pct ?? 0;
  const positive = pct >= 0;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
      {positive ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

// ── Source citation card ─────────────────────────────────────────────────────

function SourceCitationCard({ citation }: { citation: SourceCitation }) {
  const isYours = citation.label === 'Your Article';

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        isYours
          ? citation.cited ? 'border-primary-300 bg-primary-50' : 'border-primary-200 bg-primary-50/40'
          : citation.cited ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded ${isYours ? 'bg-primary-200 text-primary-800' : 'bg-gray-200 text-gray-600'}`}>
            {isYours ? 'Your Article' : `Source ${citation.source_id}`}
          </span>
          {!isYours && <span className="text-xs text-gray-600 truncate font-medium">{citation.label}</span>}
          {!isYours && (
            citation.is_corpus
              ? <span className="flex items-center gap-0.5 text-xs text-primary-500 shrink-0"><Database size={10} />corpus</span>
              : <span className="flex items-center gap-0.5 text-xs text-gray-400 shrink-0"><FlaskConical size={10} />synthetic</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {citation.cited
            ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Cited &middot; {citation.word_score.toFixed(1)}%</span>
            : <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Not cited &middot; {citation.word_score.toFixed(1)}%</span>
          }
          {!isYours && citation.source_url && (
            <a
              href={citation.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-xs text-primary-500 hover:text-primary-700 transition-colors"
              title={citation.source_url}
            >
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>

      {/* Source URL as readable link below header for corpus docs */}
      {!isYours && citation.source_url && (
        <div className="px-3 pb-1.5 -mt-1">
          <a
            href={citation.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-500 hover:text-primary-700 hover:underline truncate block"
          >
            {citation.source_url}
          </a>
        </div>
      )}

      {/* Snippet — always visible for non-article sources */}
      {!isYours && citation.snippet && (
        <div className="px-3 pb-3 border-t border-gray-200/70 pt-2">
          <p className="text-xs text-gray-600 leading-relaxed">
            <span className="font-medium text-gray-400 mr-1">
              {citation.is_corpus ? 'Corpus preview:' : 'Synthetic preview:'}
            </span>
            {citation.snippet}&hellip;
          </p>
        </div>
      )}
    </div>
  );
}

// ── ModelResult ──────────────────────────────────────────────────────────────

function ModelResult({ result }: { result: GeoEvalResponse }) {
  if (result.error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
        Evaluation failed: {result.error}
      </div>
    );
  }

  const citedCount = result.source_citations.filter((c) => c.cited).length;
  const totalCount = result.source_citations.length;
  const hasCorpus = result.source_citations.some((c) => c.is_corpus);

  return (
    <div className="space-y-6">

      {/* 1. Score Cards */}
      <div>
        <SectionLabel>Visibility Scores</SectionLabel>
        <div className="grid grid-cols-4 gap-3">
          <ScoreCard label="Word Visibility" before={result.original_scores.word} after={result.optimized_scores.word} pct={result.improvement.word_pct} />
          <ScoreCard label="Position Visibility" before={result.original_scores.pos} after={result.optimized_scores.pos} pct={result.improvement.pos_pct} />
          <ScoreCard label="Overall Visibility" before={result.original_scores.overall} after={result.optimized_scores.overall} pct={result.improvement.overall_pct} />
          <ScoreCard label="GEU" before={result.original_scores.geu ?? 0} after={result.optimized_scores.geu ?? 0} pct={result.improvement.geu_pct ?? 0} />
        </div>
      </div>

      <Divider />

      {/* 2. Score Commentary */}
      {result.score_commentary && (
        <>
          <div>
            <SectionLabel>Score Reasoning</SectionLabel>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <Lightbulb size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs font-semibold text-amber-800">Why this score?</p>
              </div>
              <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-line">{result.score_commentary}</p>
            </div>
          </div>
          <Divider />
        </>
      )}

      {/* 3. Competing Sources */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <SectionLabel>Competing Sources</SectionLabel>
          <span className="text-xs text-gray-400 mb-3">
            {citedCount} of {totalCount} cited &nbsp;&bull;&nbsp; {hasCorpus ? 'real corpus docs' : 'synthetic competitors'}
          </span>
        </div>
        <div className="space-y-2.5">
          {result.source_citations.map((c) => (
            <SourceCitationCard key={c.source_id} citation={c} />
          ))}
        </div>
      </div>

      <Divider />

      {/* 4. AI Response Comparison */}
      <div>
        <SectionLabel>AI Response Comparison</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-600">Original Version</p>
              <p className="text-xs text-gray-400">AI response before optimization</p>
            </div>
            <MarkdownView content={result.ge_response_original} maxHeight="320px" className="border-0 rounded-none" />
          </div>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-600">Optimized Version</p>
              <p className="text-xs text-gray-400">AI response after optimization</p>
            </div>
            <MarkdownView content={result.ge_response_optimized} maxHeight="320px" className="border-0 rounded-none" />
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Editable Test Query Banner ────────────────────────────────────────────────

function TestQueryEditor({
  query, costUsd, corpusUsed, corpusDocCount, onReEvaluate, evaluating,
}: {
  query: string;
  costUsd: number;
  corpusUsed: boolean;
  corpusDocCount: number;
  onReEvaluate?: (query: string) => void;
  evaluating?: boolean;
}) {
  const [editedQuery, setEditedQuery] = useState(query);

  // Sync when a new evaluation result comes in
  useEffect(() => { setEditedQuery(query); }, [query]);

  const canSubmit = editedQuery.trim().length > 0 && !evaluating;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-gray-400 shrink-0" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Test Query</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${corpusUsed ? 'bg-primary-100 text-primary-700' : 'bg-amber-100 text-amber-700'}`}>
            <Database size={10} />
            {corpusUsed ? `Corpus (${corpusDocCount} docs)` : 'Synthetic competitors'}
          </span>
          <span className="text-xs text-gray-400">~${costUsd.toFixed(3)}</span>
        </div>
      </div>
      {onReEvaluate ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={editedQuery}
            onChange={(e) => setEditedQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onReEvaluate(editedQuery.trim()); }}
            className="flex-1 text-sm border border-gray-200 rounded px-3 py-1.5 bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200"
            placeholder="Enter a custom test query…"
          />
          <button
            onClick={() => onReEvaluate(editedQuery.trim())}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-400 text-white rounded hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {evaluating ? <LoadingSpinner size="sm" /> : <RefreshCw size={12} />}
            Re-evaluate
          </button>
        </div>
      ) : (
        <p className="text-sm font-medium text-gray-800">&ldquo;{query}&rdquo;</p>
      )}
    </div>
  );
}

// ── Model tab bar ─────────────────────────────────────────────────────────────

interface Tab { key: string; label: string; result: GeoEvalResponse; }

function ModelTabBar({ tabs, activeTab, onSelect }: { tabs: Tab[]; activeTab: string; onSelect: (k: string) => void }) {
  if (tabs.length <= 1) return null;
  return (
    <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
            activeTab === t.key ? 'border-b-2 border-primary-600 text-primary-700 -mb-px' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── SingleQueryPanel ──────────────────────────────────────────────────────────

function SingleQueryPanel({ response, onReEvaluate, evaluating }: {
  response: MultiGeoEvalResponse;
  onReEvaluate?: (query: string) => void;
  evaluating?: boolean;
}) {
  const tabs: Tab[] = [
    ...response.results.map((r) => ({ key: r.engine_model, label: modelLabel(r.engine_model), result: r })),
    ...(response.combined ? [{ key: 'combined', label: 'Combined Avg', result: response.combined }] : []),
  ];
  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? '');
  const activeResult = tabs.find((t) => t.key === activeTab)?.result ?? tabs[0]?.result;

  return (
    <div className="space-y-4">
      <TestQueryEditor
        query={response.test_query_used}
        costUsd={response.total_cost_usd}
        corpusUsed={response.corpus_used}
        corpusDocCount={response.corpus_doc_count}
        onReEvaluate={onReEvaluate}
        evaluating={evaluating}
      />
      <ModelTabBar tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />
      {activeResult && <ModelResult result={activeResult} />}
    </div>
  );
}

// ── BatchQueryPanel ───────────────────────────────────────────────────────────

function BatchQueryPanel({ response, onReEvaluate, evaluating }: {
  response: MultiGeoEvalResponse;
  onReEvaluate?: (query: string) => void;
  evaluating?: boolean;
}) {
  const bqrs: QueryBatchResult[] = response.batch_query_results ?? [];
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeTab, setActiveTab] = useState('');

  const selectedBqr = bqrs[selectedIdx];
  const tabs: Tab[] = selectedBqr
    ? [
        ...selectedBqr.results.map((r) => ({ key: r.engine_model, label: modelLabel(r.engine_model), result: r })),
        ...(selectedBqr.combined ? [{ key: 'combined', label: 'Combined Avg', result: selectedBqr.combined }] : []),
      ]
    : [];

  const firstTabKey = tabs[0]?.key ?? '';
  const resolvedTab = tabs.find((t) => t.key === activeTab) ? activeTab : firstTabKey;
  const activeResult = tabs.find((t) => t.key === resolvedTab)?.result;

  return (
    <div className="space-y-4">
      {/* Batch header */}
      <div className="flex items-center justify-between gap-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2.5">
          <List size={14} className="text-gray-400 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Batch Evaluation</p>
            <p className="text-sm font-medium text-gray-800">{bqrs.length} queries evaluated</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${response.corpus_used ? 'bg-primary-100 text-primary-700' : 'bg-amber-100 text-amber-700'}`}>
            <Database size={10} />
            {response.corpus_used ? `Corpus (${response.corpus_doc_count} docs)` : 'Synthetic competitors'}
          </span>
          <span className="text-xs text-gray-400">~${response.total_cost_usd.toFixed(3)}</span>
        </div>
      </div>

      {/* Query list */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Select a Query to Review</p>
        <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
          <div className="max-h-56 overflow-y-auto">
            {bqrs.map((bqr, i) => {
              const rep = bqr.combined ?? bqr.results[0];
              const isSelected = selectedIdx === i;
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedIdx(i); setActiveTab(''); }}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${isSelected ? 'bg-primary-50 border-l-2 border-primary-500' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-400 shrink-0 tabular-nums w-5 text-right">{i + 1}.</span>
                    <span className={`text-xs truncate ${isSelected ? 'text-primary-800 font-medium' : 'text-gray-700'}`}>{bqr.query}</span>
                  </div>
                  {rep && !rep.error && <OverallImprovementBadge result={rep} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected query detail */}
      {selectedBqr && (
        <div className="border border-primary-200 rounded-lg overflow-hidden">
          <div className="bg-primary-50 px-4 py-3 border-b border-primary-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Selected Query {selectedIdx + 1}</p>
            <p className="text-sm font-medium text-primary-900">&ldquo;{selectedBqr.query}&rdquo;</p>
          </div>
          <div className="p-4 space-y-4">
            <ModelTabBar tabs={tabs} activeTab={resolvedTab} onSelect={setActiveTab} />
            {activeResult && <ModelResult result={activeResult} />}
          </div>
        </div>
      )}

      {/* Custom query re-evaluation */}
      {onReEvaluate && (
        <TestQueryEditor
          query={response.test_query_used}
          costUsd={0}
          corpusUsed={response.corpus_used}
          corpusDocCount={response.corpus_doc_count}
          onReEvaluate={onReEvaluate}
          evaluating={evaluating}
        />
      )}
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

interface Props {
  response: MultiGeoEvalResponse;
  onReEvaluate?: (query: string) => void;
  evaluating?: boolean;
}

export function GEOScorePanel({ response, onReEvaluate, evaluating }: Props) {
  if (response.is_batch && response.batch_query_results?.length) {
    return <BatchQueryPanel response={response} onReEvaluate={onReEvaluate} evaluating={evaluating} />;
  }
  return <SingleQueryPanel response={response} onReEvaluate={onReEvaluate} evaluating={evaluating} />;
}
