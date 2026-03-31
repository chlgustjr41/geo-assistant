import { useState, useRef } from 'react';
import { Play, List, Pencil, X, Plus } from 'lucide-react';
import { rulesApi } from '../../services/api';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toast } from '../shared/Toast';

interface ProgressState {
  stage: string;
  completed: number;
  total: number;
}

const STAGE_LABELS: Record<string, string> = {
  generating_docs: 'Generating synthetic documents',
  explainer: 'Explainer: analyzing visibility differences',
  extractor: 'Extractor: distilling rules',
  merger: 'Merger: consolidating rules',
  filter: 'Filter: removing ambiguous rules',
};

export function RuleExtractor() {
  const [topic, setTopic] = useState('');
  const [queries, setQueries] = useState<string[]>([]);
  const [editingQueries, setEditingQueries] = useState(false);
  const [generatingQueries, setGeneratingQueries] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [ruleSetName, setRuleSetName] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-lite');
  const [step, setStep] = useState<'input' | 'queries' | 'extracting' | 'done'>('input');
  const [extractedRuleSetId, setExtractedRuleSetId] = useState<string | null>(null);
  const [extractedNumRules, setExtractedNumRules] = useState(0);
  const newQueryRef = useRef<HTMLInputElement>(null);

  const COST_ESTIMATE = queries.length > 0
    ? `~$${(queries.length * 0.025).toFixed(2)}–$${(queries.length * 0.05).toFixed(2)}`
    : '~$0.30–$0.80';

  const handleGenerateQueries = async () => {
    if (!topic.trim()) { toast('error', 'Enter a topic first'); return; }
    setGeneratingQueries(true);
    try {
      const result = await rulesApi.generateQueries(topic, 20);
      setQueries(result.queries);
      setRuleSetName(`${topic.slice(0, 30)}-${selectedModel.split('-')[0]}-v1`);
      setStep('queries');
      toast('success', `Generated ${result.queries.length} queries`);
    } catch {
      toast('error', 'Failed to generate queries');
    } finally {
      setGeneratingQueries(false);
    }
  };

  const handleStartExtraction = async () => {
    if (queries.length === 0) { toast('error', 'No queries to extract from'); return; }
    if (!ruleSetName.trim()) { toast('error', 'Enter a name for this rule set'); return; }

    setExtracting(true);
    setStep('extracting');
    setProgress(null);

    // Use fetch with ReadableStream for POST-based SSE
    try {
      const response = await fetch('/api/rules/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries,
          engine_model: selectedModel,
          rule_set_name: ruleSetName,
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
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.stage) {
                setProgress({ stage: data.stage, completed: data.completed, total: data.total });
              } else if (data.status === 'complete') {
                setExtractedRuleSetId(data.rule_set_id);
                setExtractedNumRules(data.num_rules);
                setStep('done');
                toast('success', `Extracted ${data.num_rules} rules successfully`);
              } else if (data.status === 'error') {
                throw new Error(data.message);
              }
            } catch (parseErr) {
              // skip malformed SSE line
            }
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Extraction failed';
      toast('error', msg);
      setStep('queries');
    } finally {
      setExtracting(false);
    }
  };

  const removeQuery = (i: number) => setQueries((prev) => prev.filter((_, idx) => idx !== i));
  const addQuery = (q: string) => { if (q.trim()) setQueries((prev) => [...prev, q.trim()]); };

  const progressPct = progress
    ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Step 1: Topic Input */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Step 1: Define Topic</h3>
        <div className="flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. &quot;caregiving tips for families with Alzheimer's patients&quot;"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleGenerateQueries()}
          />
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="gemini-2.5-flash-lite">Gemini Flash Lite (fast)</option>
            <option value="gemini-2.5-flash">Gemini Flash (better)</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
          </select>
          <button
            onClick={handleGenerateQueries}
            disabled={generatingQueries || !topic.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {generatingQueries ? <LoadingSpinner size="sm" /> : <List size={14} />}
            Generate Queries
          </button>
        </div>
      </div>

      {/* Step 2: Review Queries */}
      {(step === 'queries' || step === 'extracting' || step === 'done') && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Step 2: Review Queries ({queries.length})
            </h3>
            <button
              onClick={() => setEditingQueries(!editingQueries)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <Pencil size={12} /> {editingQueries ? 'Done editing' : 'Edit'}
            </button>
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
                onClick={() => {
                  if (newQueryRef.current) {
                    addQuery(newQueryRef.current.value);
                    newQueryRef.current.value = '';
                  }
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                <Plus size={14} />
              </button>
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <input
              value={ruleSetName}
              onChange={(e) => setRuleSetName(e.target.value)}
              placeholder="Rule set name (e.g. Alzheimers-Gemini-v1)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleStartExtraction}
              disabled={extracting || queries.length === 0 || !ruleSetName.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
            >
              {extracting ? <LoadingSpinner size="sm" /> : <Play size={14} />}
              Extract Rules ({COST_ESTIMATE})
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Extraction Progress */}
      {step === 'extracting' && (
        <div className="bg-white rounded-xl border border-purple-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Extracting Rules...</h3>
          {progress && (
            <>
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
          )}
          {!progress && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <LoadingSpinner size="sm" />
              Initializing pipeline...
            </div>
          )}
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && extractedRuleSetId && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-green-800">
            Extraction complete — {extractedNumRules} rules extracted
          </p>
          <p className="text-xs text-green-600 mt-1">
            "{ruleSetName}" is now available in the Rule Set Manager and Writing Assistant.
          </p>
          <button
            onClick={() => { setStep('input'); setTopic(''); setQueries([]); setProgress(null); }}
            className="mt-3 text-xs text-green-700 hover:underline"
          >
            Extract another rule set
          </button>
        </div>
      )}
    </div>
  );
}
