import { useState } from 'react';
import { Trash2, ChevronDown, ChevronUp, BarChart2, RotateCcw, BookOpen, Database, Cpu, Lightbulb, Search } from 'lucide-react';
import { writingApi } from '../../services/api';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import type { ArticleHistoryItem, ArticleDetail, GeoEvalResponse, MultiGeoEvalResponse, RuleSetRef, QueryBatchResult } from '../../types';

interface Props {
  history: ArticleHistoryItem[];
  onDelete: (id: string) => void;
  onRestore?: (detail: ArticleDetail) => void;
}

/**
 * Group rule sets by name. Within each name group list unique engine_model short names.
 * Returns: [{name, models: string[]}]
 * e.g. [{name:"GEO Rules", models:["Sonnet","GPT-4o"]}, {name:"Custom",models:[]}]
 */
function groupRuleSets(ruleSets: RuleSetRef[]): { name: string; models: string[] }[] {
  const map = new Map<string, Set<string>>();
  for (const rs of ruleSets) {
    if (!map.has(rs.name)) map.set(rs.name, new Set());
    if (rs.engine_model) map.get(rs.name)!.add(modelShortName(rs.engine_model));
  }
  return Array.from(map.entries()).map(([name, models]) => ({ name, models: Array.from(models) }));
}

function ruleSetBadgeProps(ruleSets: RuleSetRef[]): { label: string; tooltip: string } {
  if (ruleSets.length === 0) return { label: '', tooltip: '' };
  const groups = groupRuleSets(ruleSets);
  if (groups.length === 1) {
    const { name, models } = groups[0];
    const label = name;
    const tooltip = models.length > 0 ? `${name} (${models.join(', ')})` : name;
    return { label, tooltip };
  }
  const label = `${ruleSets.length} rule sets`;
  const tooltip = groups
    .map(({ name, models }) => models.length > 0 ? `${name} (${models.join(', ')})` : name)
    .join('\n');
  return { label, tooltip };
}

function modelShortName(model: string): string {
  if (!model) return '—';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('haiku')) return 'Haiku';
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
  return model.split('/').pop() ?? model;
}

function MetaBadge({ icon, label, title }: { icon: React.ReactNode; label: string; title?: string }) {
  const tooltip = title || label;
  return (
    <span className="relative group/badge inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded cursor-default">
      {icon}
      <span className="max-w-[120px] truncate">{label}</span>
      <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-20 hidden group-hover/badge:block bg-gray-800 text-white rounded px-2 py-1 text-xs shadow-lg w-max max-w-[240px] break-words whitespace-normal leading-snug">
        {tooltip}
      </span>
    </span>
  );
}

function HistoryItemDetail({ id, item, onRestore }: {
  id: string;
  item: ArticleHistoryItem;
  onRestore?: (d: ArticleDetail) => void;
}) {
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'original' | 'rewritten' | 'scores'>('rewritten');
  const [scoreModelTab, setScoreModelTab] = useState<string>('');
  const [batchQueryIdx, setBatchQueryIdx] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await writingApi.getHistoryItem(id);
      setDetail(d);
    } finally {
      setLoading(false);
    }
  };

  if (!detail && !loading) {
    load();
    return <div className="px-4 py-3 flex justify-center"><LoadingSpinner size="sm" /></div>;
  }
  if (loading) {
    return <div className="px-4 py-3 flex justify-center"><LoadingSpinner size="sm" /></div>;
  }
  if (!detail) return null;

  const geoScores: MultiGeoEvalResponse | null = detail.geo_scores ?? null;
  // Build model tabs: individual engine results + combined avg
  const modelTabs: { key: string; label: string; result: GeoEvalResponse }[] = geoScores
    ? [
        ...geoScores.results.map((r) => ({ key: r.engine_model, label: modelShortName(r.engine_model), result: r })),
        ...(geoScores.combined ? [{ key: 'combined', label: 'Combined Avg', result: geoScores.combined }] : []),
      ]
    : [];
  // Note: resolvedScoreTab/activeScore are computed inside the batch-aware IIFE in the scores tab

  const corpusLabel = detail.corpus_set_names.length > 0
    ? detail.corpus_set_names.join(', ')
    : item.corpus_doc_count != null
      ? `${item.corpus_doc_count} docs`
      : 'No corpus';

  return (
    <div className="border-t border-gray-100 bg-gray-50">
      {/* Metadata row */}
      <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-gray-100">
        {(detail.rule_sets?.length > 0 || detail.rule_set_name) && (() => {
          const refs = detail.rule_sets?.length > 0 ? detail.rule_sets : (detail.rule_set_name ? [{ id: '', name: detail.rule_set_name, engine_model: '' }] : []);
          const { label, tooltip } = ruleSetBadgeProps(refs);
          return <MetaBadge icon={<BookOpen size={10} />} label={label} title={tooltip} />;
        })()}
        <MetaBadge
          icon={<Database size={10} />}
          label={corpusLabel}
          title="Corpus used for evaluation"
        />
        <MetaBadge
          icon={<Cpu size={10} />}
          label={modelShortName(detail.model_used)}
          title={`Rewrite model: ${detail.model_used}`}
        />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-3 pt-2">
        {(['original', 'rewritten', 'scores'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-xs rounded-t font-medium transition-colors ${
              tab === t ? 'bg-white border border-gray-200 border-b-white text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'original' ? 'Original' : t === 'rewritten' ? 'Optimized' : 'GEO Scores'}
            {t === 'scores' && !geoScores && ' (none)'}
          </button>
        ))}
        {onRestore && (
          <button
            onClick={() => onRestore(detail)}
            className="ml-auto flex items-center gap-1 text-xs text-primary-600 hover:underline px-2 pb-1"
          >
            <RotateCcw size={11} /> Restore
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-b mx-3 mb-3 overflow-hidden">
        {tab === 'original' && (
          <pre className="p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans leading-relaxed">
            {detail.original_content || <span className="text-gray-400 italic">No content</span>}
          </pre>
        )}
        {tab === 'rewritten' && (
          <pre className="p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans leading-relaxed">
            {detail.rewritten_content || <span className="text-gray-400 italic">Not optimized</span>}
          </pre>
        )}
        {tab === 'scores' && (
          geoScores && modelTabs.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {/* Test query used */}
              <div className="px-3 pt-3 pb-2 space-y-1.5">
                {geoScores.is_batch && geoScores.batch_query_results && geoScores.batch_query_results.length > 0 ? (
                  <>
                    <p className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                      <Search size={10} className="text-gray-400" />
                      Batch queries ({geoScores.batch_query_results.length})
                    </p>
                    {/* Clickable query list for batch drill-down */}
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => { setBatchQueryIdx(null); setScoreModelTab(''); }}
                        className={`text-xs px-2 py-0.5 rounded transition-colors ${batchQueryIdx === null ? 'bg-primary-200 text-primary-800 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        All (avg)
                      </button>
                      {geoScores.batch_query_results.map((bq: QueryBatchResult, i: number) => {
                        const rep = bq.combined ?? bq.results[0];
                        const pct = rep && !rep.error ? rep.improvement.overall_pct : null;
                        return (
                          <button
                            key={i}
                            onClick={() => { setBatchQueryIdx(i); setScoreModelTab(''); }}
                            className={`text-xs px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${batchQueryIdx === i ? 'bg-primary-200 text-primary-800 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                          >
                            <span className="truncate max-w-[150px]">{bq.query}</span>
                            {pct !== null && (
                              <span className={`text-xs font-semibold shrink-0 ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : geoScores.test_query_used ? (
                  <p className="text-xs text-gray-600 flex items-center gap-1.5">
                    <Search size={10} className="text-gray-400 shrink-0" />
                    <span className="font-medium text-gray-500">Query:</span>
                    <span className="italic">{geoScores.test_query_used}</span>
                  </p>
                ) : null}
              </div>

              {/* Resolve which scores to show: aggregate or per-query */}
              {(() => {
                const bqr: QueryBatchResult | null = batchQueryIdx !== null && geoScores.batch_query_results ? geoScores.batch_query_results[batchQueryIdx] ?? null : null;
                const displayTabs = bqr
                  ? [
                      ...bqr.results.map((r) => ({ key: r.engine_model, label: modelShortName(r.engine_model), result: r })),
                      ...(bqr.combined ? [{ key: 'combined', label: 'Combined Avg', result: bqr.combined }] : []),
                    ]
                  : modelTabs;
                const resolvedTab = displayTabs.find((t) => t.key === scoreModelTab) ? scoreModelTab : (displayTabs[0]?.key ?? '');
                const displayScore = displayTabs.find((t) => t.key === resolvedTab)?.result ?? null;

                return (
                  <>
                    {/* Per-query header */}
                    {bqr && (
                      <div className="px-3 py-2 bg-primary-50 border-b border-primary-100">
                        <p className="text-xs text-primary-700">
                          <span className="font-medium">Query {(batchQueryIdx ?? 0) + 1}:</span>{' '}
                          <span className="italic">&ldquo;{bqr.query}&rdquo;</span>
                        </p>
                      </div>
                    )}

                    {/* Model tab bar */}
                    {displayTabs.length > 1 && (
                      <div className="flex gap-0.5 overflow-x-auto px-2 pt-2">
                        {displayTabs.map((t) => (
                          <button
                            key={t.key}
                            onClick={() => setScoreModelTab(t.key)}
                            className={`px-3 py-1 text-xs font-medium whitespace-nowrap rounded transition-colors shrink-0 ${
                              resolvedTab === t.key
                                ? 'bg-primary-100 text-primary-700 font-semibold'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Score grid */}
                    {displayScore && !displayScore.error && (
                      <div className="p-3 space-y-2">
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: 'Word', before: displayScore.original_scores.word, after: displayScore.optimized_scores.word, pct: displayScore.improvement.word_pct },
                            { label: 'Position', before: displayScore.original_scores.pos, after: displayScore.optimized_scores.pos, pct: displayScore.improvement.pos_pct },
                            { label: 'Overall', before: displayScore.original_scores.overall, after: displayScore.optimized_scores.overall, pct: displayScore.improvement.overall_pct },
                            { label: 'GEU', before: displayScore.original_scores.geu ?? 0, after: displayScore.optimized_scores.geu ?? 0, pct: displayScore.improvement.geu_pct ?? 0 },
                          ].map(({ label, before, after, pct }) => (
                            <div key={label} className="bg-gray-50 rounded p-2 text-center">
                              <p className="text-xs text-gray-500 mb-1">{label}</p>
                              <p className="text-sm font-bold text-gray-800">{before.toFixed(1)} → {after.toFixed(1)}</p>
                              <p className={`text-xs font-semibold ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                              </p>
                            </div>
                          ))}
                        </div>
                        {displayScore.score_commentary && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Lightbulb size={12} className="text-amber-600 shrink-0" />
                              <p className="text-xs font-semibold text-amber-800">Why this score?</p>
                            </div>
                            <p className="text-xs text-amber-900 leading-relaxed whitespace-pre-line">{displayScore.score_commentary}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {displayScore?.error && (
                      <p className="p-3 text-xs text-red-500">{displayScore.error}</p>
                    )}
                    {geoScores.is_batch && batchQueryIdx === null && (
                      <p className="px-3 py-2 text-xs text-gray-400 italic">
                        Batch evaluation — showing combined average across {geoScores.batch_query_results?.length ?? '?'} queries. Click a query above to see individual results.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <p className="p-3 text-xs text-gray-400 italic">No GEO evaluation recorded for this optimization.</p>
          )
        )}
      </div>
    </div>
  );
}

export function RewriteHistory({ history, onDelete, onRestore }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (history.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
        {history.map((a) => (
          <div key={a.id}>
            <div
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 group cursor-pointer"
              onClick={() => setExpandedId((prev) => (prev === a.id ? null : a.id))}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-medium text-gray-800 truncate">{a.title || 'Untitled'}</p>
                {/* Metadata badges */}
                <div className="flex flex-wrap gap-1">
                  {(a.rule_sets?.length > 0 || a.rule_set_name) && (() => {
                    const refs = a.rule_sets?.length > 0 ? a.rule_sets : (a.rule_set_name ? [{ id: '', name: a.rule_set_name, engine_model: '' }] : []);
                    const { label, tooltip } = ruleSetBadgeProps(refs);
                    return <MetaBadge icon={<BookOpen size={10} />} label={label} title={tooltip} />;
                  })()}
                  {a.corpus_set_names.length > 0 ? (
                    <MetaBadge
                      icon={<Database size={10} />}
                      label={a.corpus_set_names.length === 1 ? a.corpus_set_names[0] : `${a.corpus_set_names.length} corpus sets`}
                      title={a.corpus_set_names.join(', ')}
                    />
                  ) : a.corpus_doc_count != null ? (
                    <MetaBadge
                      icon={<Database size={10} />}
                      label={`${a.corpus_doc_count} docs`}
                      title="Corpus document count used during evaluation"
                    />
                  ) : null}
                  {a.model_used && (
                    <MetaBadge icon={<Cpu size={10} />} label={modelShortName(a.model_used)} title={`Rewrite model: ${a.model_used}`} />
                  )}
                </div>
                {/* Status + date */}
                <p className="text-xs text-gray-400">
                  {new Date(a.created_at).toLocaleString(undefined, {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                  {a.has_rewrite && <span className="ml-2 text-primary-500">optimized</span>}
                  {a.has_scores && (
                    <span className="ml-1 text-green-600">
                      <BarChart2 size={10} className="inline mr-0.5" />scored
                    </span>
                  )}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <span className="text-gray-300 group-hover:text-gray-500">
                  {expandedId === a.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(a.id); }}
                  className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-0.5"
                  title="Remove from history"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {expandedId === a.id && (
              <HistoryItemDetail id={a.id} item={a} onRestore={onRestore} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
