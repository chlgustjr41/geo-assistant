import { useEffect, useState } from 'react';
import { Copy, Save, BarChart2 } from 'lucide-react';
import { ArticleInput } from './ArticleInput';
import { ConfigPanel } from './ConfigPanel';
import { SideBySideView } from './SideBySideView';
import { GEOScorePanel } from './GEOScorePanel';
import { RewriteHistory } from './RewriteHistory';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useWritingAssistant } from '../../hooks/useWritingAssistant';
import { toast } from '../shared/Toast';
import type { GEModelId } from '../../types';

interface Props {
  injectedKeywords: string[];
  onClearKeywords: () => void;
}

export function WritingAssistant({ injectedKeywords, onClearKeywords }: Props) {
  const {
    scraped, articleText, setArticleText,
    rewriteResult, geoResult,
    ruleSets, history,
    scraping, rewriting, evaluating,
    scrapeUrl, rewrite, evaluateGeo,
    loadRuleSets, loadHistory, saveToHistory,
  } = useWritingAssistant();

  const [selectedModel, setSelectedModel] = useState<GEModelId>('claude-sonnet-4-6');
  const [selectedRuleSetId, setSelectedRuleSetId] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);

  useEffect(() => { loadRuleSets(); loadHistory(); }, []);

  useEffect(() => {
    if (injectedKeywords.length > 0) {
      setKeywords((prev) => [...new Set([...prev, ...injectedKeywords])]);
    }
  }, [injectedKeywords]);

  // Auto-select first builtin rule set matching the model
  useEffect(() => {
    if (ruleSets.length > 0 && !selectedRuleSetId) {
      const match = ruleSets.find((rs) => rs.engine_model.includes(selectedModel.split('-')[0]));
      if (match) setSelectedRuleSetId(match.id);
      else setSelectedRuleSetId(ruleSets[0].id);
    }
  }, [ruleSets, selectedModel, selectedRuleSetId]);

  const handleOptimize = () => {
    if (!selectedRuleSetId) { toast('error', 'Select a rule set first'); return; }
    rewrite(selectedModel, selectedRuleSetId, keywords);
  };

  const handleCopyOptimized = () => {
    if (rewriteResult) {
      navigator.clipboard.writeText(rewriteResult.rewritten_content);
      toast('success', 'Copied to clipboard');
    }
  };

  // scraped is used for its title when saving
  void scraped;

  return (
    <div className="space-y-4">
      <ArticleInput
        onTextChange={setArticleText}
        onScrape={scrapeUrl}
        scraping={scraping}
        currentText={articleText}
      />

      <ConfigPanel
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        selectedRuleSetId={selectedRuleSetId}
        onRuleSetChange={setSelectedRuleSetId}
        ruleSets={ruleSets}
        injectedKeywords={keywords}
        onRemoveKeyword={(kw) => setKeywords((prev) => prev.filter((k) => k !== kw))}
        onClearKeywords={() => { setKeywords([]); onClearKeywords(); }}
      />

      <button
        onClick={handleOptimize}
        disabled={rewriting || !articleText.trim()}
        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {rewriting ? <LoadingSpinner size="sm" /> : null}
        {rewriting ? 'Optimizing...' : 'Optimize Article'}
      </button>

      {rewriteResult && (
        <>
          <SideBySideView
            original={rewriteResult.original_content}
            optimized={rewriteResult.rewritten_content}
          />

          <div className="flex gap-3">
            <button
              onClick={handleCopyOptimized}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <Copy size={14} /> Copy Optimized
            </button>
            <button
              onClick={() => saveToHistory(selectedModel, selectedRuleSetId, keywords)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <Save size={14} /> Save to History
            </button>
            <button
              onClick={() => evaluateGeo(selectedModel)}
              disabled={evaluating}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {evaluating ? <LoadingSpinner size="sm" /> : <BarChart2 size={14} />}
              {evaluating ? 'Evaluating (~20s)...' : 'Run GEO Evaluation'}
            </button>
          </div>

          {rewriteResult.rules_applied.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-blue-700 mb-1">
                Rules applied ({rewriteResult.rules_applied.length}):
              </p>
              <ul className="text-xs text-blue-600 space-y-0.5">
                {rewriteResult.rules_applied.slice(0, 3).map((r, i) => (
                  <li key={i} className="truncate">&bull; {r}</li>
                ))}
                {rewriteResult.rules_applied.length > 3 && (
                  <li className="text-blue-400">...and {rewriteResult.rules_applied.length - 3} more</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}

      {geoResult && <GEOScorePanel result={geoResult} />}

      <RewriteHistory history={history} onLoad={loadHistory} />
    </div>
  );
}
