import { useEffect, useState } from 'react';
import { Trash2, Download, Plus, X, Eye, ChevronUp, AlertTriangle, Database, AlertCircle } from 'lucide-react';
import { useRuleExtraction } from '../../hooks/useRuleExtraction';
import { rulesApi } from '../../services/api';
// useRuleExtraction imported for ReturnType only — instance lives in RuleTraining
import { toast } from '../shared/Toast';
import { GE_MODELS } from '../../types';
import type { RuleSetDetail } from '../../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';

function CacheRecoveryBanner({ onDismiss }: { onDismiss: () => void }) {
  const raw = (() => {
    try { return JSON.parse(localStorage.getItem('geo_extractor_results') ?? 'null'); } catch { return null; }
  })();
  const topic: string = (() => { try { return JSON.parse(localStorage.getItem('geo_extractor_topic') ?? '""'); } catch { return ''; } })();
  const queries: string[] = (() => { try { return JSON.parse(localStorage.getItem('geo_extractor_queries') ?? '[]'); } catch { return []; } })();
  const models: string[] = (() => { try { return JSON.parse(localStorage.getItem('geo_extractor_models') ?? '[]'); } catch { return []; } })();

  const hasRules = Array.isArray(raw) && raw.some((r: Record<string, unknown>) => Array.isArray(r.rules) && (r.rules as unknown[]).length > 0);

  if (!raw) return null;

  return (
    <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-amber-800 mb-1">Unsaved extraction detected</p>
          {hasRules ? (
            <p className="text-amber-700">Rule content found in cache — these can be saved.</p>
          ) : (
            <>
              <p className="text-amber-700 mb-1">
                The cache only contains metadata <span className="font-mono bg-amber-100 px-1 rounded">(model, rule_set_id, num_rules)</span> — the actual rule text was processed server-side and was never sent to the browser.
              </p>
              <p className="text-amber-700">
                <strong>Your setup IS cached:</strong> topic "{topic}", {queries.length} queries, models: {models.map(m => GE_MODELS.find(g => g.id === m)?.label ?? m).join(', ')}.
                Switch to <strong>Extract Rules</strong> and hit "Extract Rules" — everything is pre-filled.
              </p>
            </>
          )}
          <details className="mt-1">
            <summary className="cursor-pointer text-amber-600 hover:text-amber-800">Show raw cache data</summary>
            <pre className="mt-1 text-amber-900 bg-amber-100 rounded p-2 overflow-x-auto max-h-32 text-xs">{JSON.stringify(raw, null, 2)}</pre>
          </details>
        </div>
        <button onClick={onDismiss} className="text-amber-400 hover:text-amber-700 shrink-0"><X size={13} /></button>
      </div>
    </div>
  );
}

function RuleSetDetailPanel({ ruleSetId }: { ruleSetId: string }) {
  const [detail, setDetail] = useState<RuleSetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rules' | 'queries' | 'responses' | 'sources'>('rules');

  useEffect(() => {
    rulesApi.get(ruleSetId).then(setDetail).catch(() => toast('error', 'Failed to load details')).finally(() => setLoading(false));
  }, [ruleSetId]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <LoadingSpinner size="sm" />
      </div>
    );
  }
  if (!detail) return null;

  const rules = detail.rules.filtered_rules;
  const meta = detail.extraction_metadata;
  const tabs = [
    { id: 'rules' as const, label: `Rules (${rules.length})` },
    ...(meta ? [
      { id: 'queries' as const, label: `Queries (${meta.queries.length})` },
      { id: 'responses' as const, label: `GE Responses (${meta.ge_responses.length})` },
      { id: 'sources' as const, label: `Sources` },
    ] : []),
  ];

  return (
    <div className="border-t border-gray-100 bg-gray-50">
      <div className="flex gap-1 px-4 pt-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-xs rounded-t-lg font-medium transition-colors ${
              activeTab === t.id ? 'bg-white border border-gray-200 border-b-white text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-b-lg mx-4 mb-4 max-h-72 overflow-y-auto">
        {activeTab === 'rules' && (
          <ol className="divide-y divide-gray-100">
            {rules.length === 0 ? (
              <li className="px-4 py-3 text-xs text-gray-400 italic">No rules yet</li>
            ) : rules.map((r, i) => (
              <li key={i} className="px-4 py-2 text-xs text-gray-700 flex gap-2">
                <span className="text-gray-400 shrink-0 w-5">{i + 1}.</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        )}

        {activeTab === 'queries' && meta && (
          <ol className="divide-y divide-gray-100">
            {meta.queries.map((q, i) => (
              <li key={i} className="px-4 py-2 text-xs text-gray-700 flex gap-2">
                <span className="text-gray-400 shrink-0 w-5">{i + 1}.</span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        )}

        {activeTab === 'responses' && meta && (
          <div className="divide-y divide-gray-100">
            {meta.ge_responses.map((r, i) => (
              <div key={i} className="px-4 py-3 space-y-1">
                <p className="text-xs font-medium text-gray-600">Q{i + 1}: {r.query}</p>
                <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">{r.response}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'sources' && meta && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                <Database size={10} />
                Corpus-based extraction ({meta.corpus_doc_count ?? 0} docs)
              </span>
              {meta.corpus_set_ids && meta.corpus_set_ids.length > 0 && (
                <span className="text-xs text-gray-500">
                  {meta.corpus_set_ids.length} corpus set{meta.corpus_set_ids.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {meta.source_urls && meta.source_urls.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">
                  Source URLs ({meta.source_urls.length})
                </p>
                <ul className="space-y-1.5">
                  {meta.source_urls.map((url, i) => (
                    <li key={i} className="text-xs">
                      <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No source URLs recorded.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface RuleSetManagerProps {
  ruleSets: ReturnType<typeof useRuleExtraction>['ruleSets'];
  loadRuleSets: () => void | Promise<void>;
}

export function RuleSetManager({ ruleSets, loadRuleSets }: RuleSetManagerProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModel, setNewModel] = useState('claude-sonnet-4-6');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCacheBanner, setShowCacheBanner] = useState(() => {
    try {
      const r = JSON.parse(localStorage.getItem('geo_extractor_results') ?? 'null');
      return Array.isArray(r) && r.length > 0;
    } catch { return false; }
  });

  useEffect(() => { loadRuleSets(); }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await rulesApi.delete(id);
      toast('success', 'Rule set deleted');
      if (expandedId === id) setExpandedId(null);
      loadRuleSets();
    } catch {
      toast('error', 'Failed to delete rule set');
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) { toast('error', 'Enter a name'); return; }
    setSaving(true);
    try {
      await rulesApi.create({ name: newName.trim(), engine_model: newModel });
      toast('success', `Rule set "${newName.trim()}" created`);
      setNewName('');
      setCreating(false);
      loadRuleSets();
    } catch {
      toast('error', 'Failed to create rule set');
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Rule Sets ({ruleSets.length})</h3>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          {creating ? <X size={12} /> : <Plus size={12} />}
          {creating ? 'Cancel' : 'New Rule Set'}
        </button>
      </div>

      {showCacheBanner && <CacheRecoveryBanner onDismiss={() => setShowCacheBanner(false)} />}

      {creating && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex gap-2 items-center">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Rule set name..."
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <select
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {GE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {ruleSets.length === 0 ? (
        <p className="p-6 text-center text-sm text-gray-400">
          No rule sets yet — use <span className="font-medium">Extract Rules</span> to create your first one.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {ruleSets.map((rs) => (
            <div key={rs.id}>
              <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-gray-800 truncate">{rs.name}</p>
                    {rs.is_deprecated && (
                      <span
                        className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium shrink-0"
                        title="The corpus or query set used to extract these rules no longer exists"
                      >
                        <AlertCircle size={10} />deprecated
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {rs.engine_model} &middot; {rs.num_rules} rules
                  </p>
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => toggleExpand(rs.id)}
                    className="p-1.5 text-gray-400 hover:text-purple-600 rounded"
                    title="View details"
                  >
                    {expandedId === rs.id ? <ChevronUp size={14} /> : <Eye size={14} />}
                  </button>
                  <a
                    href={rulesApi.exportUrl(rs.id)}
                    download
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                    title="Export"
                  >
                    <Download size={14} />
                  </a>
                  <button
                    onClick={() => handleDelete(rs.id, rs.name)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {expandedId === rs.id && <RuleSetDetailPanel ruleSetId={rs.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
