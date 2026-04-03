import { useState, useRef, useEffect } from 'react';
import { Play, List, Pencil, X, Plus, RefreshCw, Database, FlaskConical, ExternalLink } from 'lucide-react';
import { rulesApi, corpusApi } from '../../services/api';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toast } from '../shared/Toast';
import { GE_MODELS } from '../../types';
import { useLocalStorage } from '../../hooks/useLocalStorage';
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
  generating_docs: 'Retrieving/generating documents',
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
  { provider: 'OpenAI', models: GE_MODELS.filter((m) => m.provider === 'openai') },
  { provider: 'Google', models: GE_MODELS.filter((m) => m.provider === 'google') },
];

interface RuleExtractorProps {
  onRuleSetSaved?: () => void;
}

export function RuleExtractor({ onRuleSetSaved }: RuleExtractorProps) {
  const [topic, setTopic] = useLocalStorage<string>('geo_extractor_topic', '');
  const [queries, setQueries] = useLocalStorage<string[]>('geo_extractor_queries', []);
  const [ruleSetName, setRuleSetName] = useLocalStorage<string>('geo_extractor_name', '');
  const [selectedModels, setSelectedModels] = useLocalStorage<string[]>('geo_extractor_models', ['claude-sonnet-4-6']);
  const [extractionResults, setExtractionResults] = useLocalStorage<ExtractionResult[]>('geo_extractor_results', []);
  const [useCorpus, setUseCorpus] = useLocalStorage<boolean>('geo_extractor_use_corpus', true);

  const [step, setStepRaw] = useLocalStorage<'input' | 'queries' | 'extracting' | 'done'>('geo_extractor_step', 'input');
  const setStep = (s: 'input' | 'queries' | 'extracting' | 'done') => {
    setStepRaw(s === 'extracting' ? 'queries' : s);
  };
  useEffect(() => {
    if ((step as string) === 'extracting') setStepRaw('queries');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { extracting, setExtracting } = useExtractionContext();
  const [editingQueries, setEditingQueries] = useState(false);
  const [generatingQueries, setGeneratingQueries] = useState(false);
  const [appendingQueries, setAppendingQueries] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [corpusCount, setCorpusCount] = useState<number | null>(null);
  const [loadingCorpusCount, setLoadingCorpusCount] = useState(false);
  const newQueryRef = useRef<HTMLInputElement>(null);

  // Load corpus count whenever we reach the queries step
  useEffect(() => {
    if (step === 'queries' || step === 'done') {
      setLoadingCorpusCount(true);
      corpusApi.count()
        .then((r) => setCorpusCount(r.count))
        .catch(() => setCorpusCount(null))
        .finally(() => setLoadingCorpusCount(false));
    }
  }, [step]);

  const handleGenerateQueries = async () => {
    if (!topic.trim()) { toast('error', 'Enter a topic first'); return; }
    setGeneratingQueries(true);
    try {
      const result = await rulesApi.generateQueries(topic, 20);
      setQueries(result.queries);
      setRuleSetName(`${topic.slice(0, 30)}-v1`);
      setStep('queries');
      toast('success', `Generated ${result.queries.length} queries`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to generate queries';
      toast('error', msg);
    } finally {
      setGeneratingQueries(false);
    }
  };

  const handleAppendQueries = async () => {
    if (!topic.trim()) { toast('error', 'Enter a topic first'); return; }
    setAppendingQueries(true);
    try {
      const result = await rulesApi.generateQueries(topic, 10);
      const newOnes = result.queries.filter((q) => !queries.includes(q));
      setQueries((prev) => [...prev, ...newOnes]);
      toast('success', `Added ${newOnes.length} more queries`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to generate more queries';
      toast('error', msg);
    } finally {
      setAppendingQueries(false);
    }
  };

  const toggleModel = (id: string) => {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleStartExtraction = async () => {
    if (queries.length === 0) { toast('error', 'No queries to extract from'); return; }
    if (!ruleSetName.trim()) { toast('error', 'Enter a name for this rule set'); return; }
    if (selectedModels.length === 0) { toast('error', 'Select at least one model'); return; }

    setExtracting(true);
    setStepRaw('extracting');
    setProgress(null);
    setExtractionResults([]);

    try {
      const response = await fetch('/api/rules/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries,
          engine_models: selectedModels,
          rule_set_name: ruleSetName,
          use_corpus: useCorpus,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
            if (data.stage) {
              setProgress({
                stage: data.stage,
                completed: data.completed,
                total: data.total,
                model: data.model ?? '',
                model_index: data.model_index ?? 0,
                model_total: data.model_total ?? 1,
              });
            } else if (data.status === 'model_complete') {
              setExtractionResults((prev) => [...prev, data.result]);
              if (!data.result.error) {
                toast('success', `Saved: ${modelLabel(data.result.model)} — ${data.result.num_rules} rules`);
                onRuleSetSaved?.();
              } else {
                toast('error', `${modelLabel(data.result.model)}: ${data.result.error}`);
              }
            } else if (data.status === 'complete') {
              setStep('done');
            } else if (data.status === 'error') {
              throw new Error(data.message);
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Extraction failed';
      toast('error', msg);
      setStepRaw('queries');
    } finally {
      setExtracting(false);
    }
  };

  const removeQuery = (i: number) => setQueries((prev) => prev.filter((_, idx) => idx !== i));
  const addQuery = (q: string) => { if (q.trim()) setQueries((prev) => [...prev, q.trim()]); };

  const progressPct = progress
    ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100)
    : 0;

  const corpusSufficient = corpusCount !== null && corpusCount >= 3;

  return (
    <div className="space-y-4">
      {/* Step 1: Topic + Model selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Step 1: Define Topic &amp; Target Models</h3>
        <p className="text-xs text-gray-500">
          Enter a topic to synthesize search queries. Select one or more GE models — each produces its own rule set.
        </p>

        <div className="flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder='e.g. "caregiving tips for families with Alzheimer&apos;s patients"'
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleGenerateQueries()}
          />
          <button
            onClick={handleGenerateQueries}
            disabled={generatingQueries || !topic.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {generatingQueries ? <LoadingSpinner size="sm" /> : <List size={14} />}
            Generate Queries
          </button>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">
            Target GE Models
            {selectedModels.length > 1 && (
              <span className="ml-2 text-purple-600">({selectedModels.length} selected — extracts separately per model)</span>
            )}
          </p>
          <div className="space-y-2">
            {MODEL_GROUPS.map(({ provider, models }) => (
              <div key={provider}>
                <p className="text-xs text-gray-400 mb-1">{provider}</p>
                <div className="flex flex-wrap gap-2">
                  {models.map((m) => {
                    const checked = selectedModels.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                        }`}
                      >
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
      </div>

      {/* Step 2: Review Queries */}
      {(step === 'queries' || step === 'extracting' || step === 'done') && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Step 2: Review Queries ({queries.length})
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={handleAppendQueries}
                disabled={appendingQueries || !topic.trim()}
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {appendingQueries ? <LoadingSpinner size="sm" /> : <RefreshCw size={12} />}
                Generate more
              </button>
              <button
                onClick={() => setEditingQueries(!editingQueries)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <Pencil size={12} /> {editingQueries ? 'Done editing' : 'Edit'}
              </button>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
            {queries.map((q, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-700 py-0.5">
                <span className="text-gray-400 w-5 shrink-0">{i + 1}.</span>
                <span className="flex-1">{q}</span>
                {editingQueries && (
                  <button onClick={() => removeQuery(i)} className="text-red-400 hover:text-red-600">
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {editingQueries && (
            <div className="flex gap-2 mt-2">
              <input
                ref={newQueryRef}
                placeholder="Add a custom query..."
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newQueryRef.current) {
                    addQuery(newQueryRef.current.value);
                    newQueryRef.current.value = '';
                  }
                }}
              />
              <button
                onClick={() => { if (newQueryRef.current) { addQuery(newQueryRef.current.value); newQueryRef.current.value = ''; } }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Corpus Configuration */}
      {(step === 'queries' || step === 'extracting' || step === 'done') && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Step 3: Corpus for Extraction</h3>
          <p className="text-xs text-gray-500">
            Real corpus documents are BM25-retrieved per query and used as the high/low-visibility pair source —
            closer to the AutoGEO paper methodology. Synthetic fallback is used if the corpus is insufficient.
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {loadingCorpusCount ? (
                <LoadingSpinner size="sm" />
              ) : corpusCount !== null ? (
                <>
                  <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                    corpusSufficient ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    <Database size={11} />
                    {corpusCount} corpus doc{corpusCount !== 1 ? 's' : ''} available
                  </span>
                  {!corpusSufficient && (
                    <span className="text-xs text-amber-600">
                      Need 3+ docs for corpus-based extraction
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-gray-400">Could not load corpus count</span>
              )}
            </div>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              title="Go to Corpus tab to add documents"
            >
              <ExternalLink size={11} /> Manage Corpus
            </a>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={useCorpus}
              onChange={(e) => setUseCorpus(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            <div>
              <span className="text-sm text-gray-800 font-medium">
                Use corpus for extraction
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                {useCorpus && corpusSufficient
                  ? `BM25 will retrieve the most relevant docs from your corpus per query.`
                  : useCorpus && !corpusSufficient
                  ? `Corpus has fewer than 3 docs — will use synthetic fallback automatically.`
                  : `Will generate 5 synthetic documents per query using the LLM.`}
              </p>
            </div>
          </label>

          {useCorpus && !corpusSufficient && corpusCount !== null && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              <FlaskConical size={12} className="shrink-0" />
              Fallback active: synthetic documents will be generated (add more docs to the Corpus tab to use real sources).
            </div>
          )}

          {useCorpus && corpusSufficient && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
              <Database size={12} className="shrink-0" />
              Real corpus will be used. Queries, source URLs, and rules will all be recorded in the rule set.
            </div>
          )}
        </div>
      )}

      {/* Step 4: Name + Extract */}
      {(step === 'queries' || step === 'extracting' || step === 'done') && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Step 4: Extract Rules</h3>
          <div className="flex items-center gap-3">
            <input
              value={ruleSetName}
              onChange={(e) => setRuleSetName(e.target.value)}
              placeholder="Rule set name (e.g. Alzheimers-v1)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleStartExtraction}
              disabled={extracting || queries.length === 0 || !ruleSetName.trim() || selectedModels.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
            >
              {extracting ? <LoadingSpinner size="sm" /> : <Play size={14} />}
              Extract Rules
            </button>
          </div>
        </div>
      )}

      {/* Progress */}
      {step === 'extracting' && (
        <div className="bg-white rounded-xl border border-purple-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Extracting Rules...</h3>
          {progress ? (
            <>
              {progress.model_total > 1 && (
                <p className="text-xs text-purple-600 font-medium mb-1">
                  Model {progress.model_index + 1} of {progress.model_total}: {modelLabel(progress.model)}
                </p>
              )}
              <p className="text-sm text-gray-600 mb-2">
                {STAGE_LABELS[progress.stage] || progress.stage} ({progress.completed}/{progress.total})
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <LoadingSpinner size="sm" />
              Initializing pipeline...
            </div>
          )}
        </div>
      )}

      {/* Done */}
      {step === 'done' && extractionResults.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-green-800">Extraction complete</p>
          {extractionResults.map((r) => (
            <div key={r.model} className={`text-xs rounded-lg px-3 py-2 ${r.error ? 'bg-red-50 text-red-700' : 'bg-white text-green-700 border border-green-200'}`}>
              {r.error
                ? `${modelLabel(r.model)}: failed — ${r.error}`
                : `${modelLabel(r.model)}: ${r.num_rules} rules extracted`}
            </div>
          ))}
          <p className="text-xs text-green-600">
            Rule sets are now available in the Rule Set Manager and Writing Assistant.
          </p>
          <button
            onClick={() => { setStepRaw('input'); setTopic(''); setQueries([]); setRuleSetName(''); setExtractionResults([]); setProgress(null); }}
            className="text-xs text-green-700 hover:underline"
          >
            Extract another rule set
          </button>
        </div>
      )}
    </div>
  );
}
