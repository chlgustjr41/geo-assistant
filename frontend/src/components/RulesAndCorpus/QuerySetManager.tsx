import { useRef, useState } from 'react';
import { List, Plus, X, RefreshCw, Trash2, ChevronDown, ChevronUp, Save, Link, FileText } from 'lucide-react';
import { rulesApi, querySetApi, writingApi } from '../../services/api';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toast } from '../shared/Toast';
import { useRulesCorpusContext } from '../../contexts/RulesCorpusContext';

interface Props {
  onQuerySetSaved?: () => void;
}

type InputMode = 'topic' | 'article';

export function QuerySetManager({ onQuerySetSaved }: Props) {
  const { querySets, reloadQuerySets } = useRulesCorpusContext();

  const [inputMode, setInputMode] = useState<InputMode>('topic');

  // Topic mode
  const [topic, setTopic] = useState('');

  // Article mode
  const [articleUrl, setArticleUrl] = useState('');
  const [articleText, setArticleText] = useState('');
  const [scraping, setScraping] = useState(false);

  // Shared
  const [queries, setQueries] = useState<string[]>([]);
  const [draftName, setDraftName] = useState('');
  const [numQueries, setNumQueries] = useState<number>(20);

  const [generating, setGenerating] = useState(false);
  const [appending, setAppending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const newQueryRef = useRef<HTMLInputElement>(null);

  const handleScrapeUrl = async () => {
    if (!articleUrl.trim()) { toast('error', 'Enter a URL first'); return; }
    setScraping(true);
    try {
      const result = await writingApi.scrapeUrl(articleUrl.trim());
      setArticleText(result.content);
      toast('success', `Scraped: ${result.title || articleUrl}`);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast('error', detail || 'Failed to scrape URL — try pasting the article text directly');
    } finally {
      setScraping(false);
    }
  };

  const handleGenerate = async () => {
    if (inputMode === 'topic') {
      if (!topic.trim()) { toast('error', 'Enter a topic first'); return; }
    } else {
      if (!articleText.trim()) { toast('error', 'Paste article text or scrape a URL first'); return; }
    }
    setGenerating(true);
    try {
      const result = await rulesApi.generateQueries(
        inputMode === 'topic' ? topic : '',
        numQueries,
        inputMode === 'article' ? articleText : undefined,
      );
      setQueries(result.queries);
      // Auto-fill name from LLM-suggested label that describes the query set content
      const suggestion = result.suggested_topic || (inputMode === 'topic' ? topic.slice(0, 30) : '');
      if (suggestion) setDraftName(suggestion);
      // In article mode, also populate the topic field from the inferred label
      if (inputMode === 'article' && result.suggested_topic && !topic.trim()) {
        setTopic(result.suggested_topic);
      }
      toast('success', `Generated ${result.queries.length} queries`);
    } catch {
      toast('error', 'Failed to generate queries');
    } finally {
      setGenerating(false);
    }
  };

  const handleAppend = async () => {
    if (inputMode === 'topic' && !topic.trim()) { toast('error', 'Enter a topic first'); return; }
    if (inputMode === 'article' && !articleText.trim()) { toast('error', 'No article text to generate from'); return; }
    setAppending(true);
    try {
      const result = await rulesApi.generateQueries(
        inputMode === 'topic' ? topic : '',
        10,
        inputMode === 'article' ? articleText : undefined,
      );
      const newOnes = result.queries.filter((q) => !queries.includes(q));
      setQueries((prev) => [...prev, ...newOnes]);
      toast('success', `Added ${newOnes.length} more queries`);
    } catch {
      toast('error', 'Failed to generate more queries');
    } finally {
      setAppending(false);
    }
  };

  const handleSave = async () => {
    if (!draftName.trim()) { toast('error', 'Enter a name for this query set'); return; }
    if (queries.length === 0) { toast('error', 'Generate queries first'); return; }
    setSaving(true);
    try {
      const topicLabel = topic.trim() || draftName.trim();
      await querySetApi.create({ name: draftName.trim(), topic: topicLabel, queries });
      toast('success', `Query set "${draftName.trim()}" saved`);
      setTopic('');
      setArticleUrl('');
      setArticleText('');
      setQueries([]);
      setDraftName('');
      reloadQuerySets();
      onQuerySetSaved?.();
    } catch {
      toast('error', 'Failed to save query set');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSet = async (id: string, name: string) => {
    if (!confirm(`Delete query set "${name}"?`)) return;
    try {
      await querySetApi.delete(id);
      reloadQuerySets();
      toast('success', 'Query set deleted');
    } catch {
      toast('error', 'Failed to delete query set');
    }
  };

  const removeQuery = (i: number) => setQueries((prev) => prev.filter((_, idx) => idx !== i));
  const addQuery = (q: string) => { if (q.trim()) setQueries((prev) => [...prev, q.trim()]); };

  const canGenerate = inputMode === 'topic' ? topic.trim().length > 0 : articleText.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Draft builder */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Generate Query Set</h3>
          <p className="text-xs text-gray-500">
            Generate search queries from a topic or a real article. Queries are saved as a named Query Set
            and reused in Build Corpus and Extract Rules.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 w-fit">
          <button
            onClick={() => setInputMode('topic')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              inputMode === 'topic' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <List size={12} /> Topic
          </button>
          <button
            onClick={() => setInputMode('article')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              inputMode === 'article' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText size={12} /> Article
          </button>
        </div>

        {/* Topic mode */}
        {inputMode === 'topic' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                placeholder='e.g. "caregiving tips for families with Alzheimer&apos;s"'
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 shrink-0">Queries:</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={numQueries}
                  onChange={(e) => setNumQueries(Math.max(5, Math.min(50, Number(e.target.value) || 20)))}
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating || !canGenerate}
                className="flex items-center gap-2 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50 transition-colors"
              >
                {generating ? <LoadingSpinner size="sm" /> : <List size={14} />}
                Generate
              </button>
            </div>
          </div>
        )}

        {/* Article mode */}
        {inputMode === 'article' && (
          <div className="space-y-2">
            {/* URL scrape row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={articleUrl}
                  onChange={(e) => setArticleUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScrapeUrl()}
                  placeholder="Paste article URL to scrape..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={handleScrapeUrl}
                disabled={scraping || !articleUrl.trim()}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                {scraping ? <LoadingSpinner size="sm" /> : <Link size={13} />}
                {scraping ? 'Scraping...' : 'Scrape'}
              </button>
            </div>

            {/* Article text area */}
            <textarea
              value={articleText}
              onChange={(e) => setArticleText(e.target.value)}
              placeholder="Or paste the article text directly here..."
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
            {articleText.trim() && (
              <p className="text-xs text-gray-400">{articleText.trim().split(/\s+/).length} words</p>
            )}

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 shrink-0">Queries:</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={numQueries}
                  onChange={(e) => setNumQueries(Math.max(5, Math.min(50, Number(e.target.value) || 20)))}
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating || !canGenerate}
                className="flex items-center gap-2 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50 transition-colors"
              >
                {generating ? <LoadingSpinner size="sm" /> : <List size={14} />}
                {generating ? 'Analyzing article...' : 'Generate Queries from Article'}
              </button>
            </div>
          </div>
        )}

        {/* Query list + save */}
        {queries.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-600">{queries.length} queries</p>
              <button
                onClick={handleAppend}
                disabled={appending || !canGenerate}
                className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline disabled:opacity-50"
              >
                {appending ? <LoadingSpinner size="sm" /> : <RefreshCw size={12} />}
                Add 10 more
              </button>
            </div>

            {/* Query list — always editable, no edit mode */}
            <div className="max-h-56 overflow-y-auto">
              {queries.map((q, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 -mx-2 rounded group hover:bg-gray-50 transition-colors">
                  <span className="text-gray-400 w-5 shrink-0 text-xs text-right">{i + 1}.</span>
                  <span className="flex-1 text-xs text-gray-700">{q}</span>
                  <button
                    onClick={() => removeQuery(i)}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 p-0.5"
                    title="Remove query"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add custom query inline */}
            <div className="flex gap-2">
              <input
                ref={newQueryRef}
                placeholder="Add a custom query..."
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newQueryRef.current?.value.trim()) {
                    addQuery(newQueryRef.current.value);
                    newQueryRef.current.value = '';
                  }
                }}
              />
              <button
                onClick={() => { if (newQueryRef.current?.value.trim()) { addQuery(newQueryRef.current.value); newQueryRef.current.value = ''; } }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Save row */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Query set name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <button
                onClick={handleSave}
                disabled={saving || !draftName.trim() || queries.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                {saving ? <LoadingSpinner size="sm" /> : <Save size={14} />}
                Save Query Set
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Saved query sets */}
      {querySets.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-700">Saved Query Sets ({querySets.length})</p>
          </div>
          <div className="divide-y divide-gray-100">
            {querySets.map((qs) => (
              <div key={qs.id}>
                <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{qs.name}</p>
                    <p className="text-xs text-gray-400">
                      {qs.topic && <span>{qs.topic} &middot; </span>}
                      {qs.num_queries} queries &middot; {new Date(qs.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => setExpandedId((v) => v === qs.id ? null : qs.id)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 rounded"
                      title="View queries"
                    >
                      {expandedId === qs.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                      onClick={() => handleDeleteSet(qs.id, qs.name)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {expandedId === qs.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    <ol className="space-y-0.5 max-h-40 overflow-y-auto">
                      {qs.queries.map((q, i) => (
                        <li key={i} className="flex gap-2 text-xs text-gray-600">
                          <span className="text-gray-400 w-5 shrink-0">{i + 1}.</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {querySets.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-6">
          No query sets yet — generate and save one above.
        </p>
      )}
    </div>
  );
}
