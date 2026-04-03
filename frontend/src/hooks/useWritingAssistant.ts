import { useState } from 'react';
import { writingApi, rulesApi } from '../services/api';
import type {
  ScrapedArticle,
  RewriteResponse,
  MultiGeoEvalResponse,
  RuleSet,
  ArticleHistoryItem,
} from '../types';
import { toast } from '../components/shared/Toast';
import { useLocalStorage } from './useLocalStorage';
import { useSessionStorage } from './useSessionStorage';

export function useWritingAssistant() {
  const [scraped, setScraped] = useState<ScrapedArticle | null>(null);
  // articleText persists across refreshes (localStorage) — losing a long article is annoying
  const [articleText, setArticleText] = useLocalStorage<string>('geo_article_text', '');
  // rewriteResult is session-only: cleared on tab close/refresh so the
  // original_content baseline is never stale from a previous session
  const [rewriteResult, setRewriteResult] = useSessionStorage<RewriteResponse | null>('geo_rewrite_result', null);
  const [geoResult, setGeoResult] = useSessionStorage<MultiGeoEvalResponse | null>('geo_eval_result', null);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [history, setHistory] = useState<ArticleHistoryItem[]>([]);
  const [currentArticleId, setCurrentArticleId] = useSessionStorage<string | null>('geo_current_article_id', null);
  const [scraping, setScraping] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const scrapeUrl = async (url: string) => {
    setScraping(true);
    try {
      const result = await writingApi.scrapeUrl(url);
      setScraped(result);
      setArticleText(result.content);
      toast('success', `Scraped: ${result.title || url}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to scrape URL';
      toast('error', msg);
    } finally {
      setScraping(false);
    }
  };

  const rewrite = async (ruleSetIds: string[], model: string) => {
    if (!articleText.trim()) { toast('error', 'No article text to rewrite'); return; }
    // Clear previous optimization and evaluation immediately so the UI resets
    setRewriteResult(null);
    setGeoResult(null);
    setRewriting(true);
    try {
      const result = await writingApi.rewrite({
        content: articleText,
        model,
        rule_set_ids: ruleSetIds,
      });
      setRewriteResult(result);
      // Auto-save every optimization to history
      const title =
        scraped?.title ||
        articleText.split('\n').find((l) => l.trim())?.slice(0, 80) ||
        'Untitled';
      const saved = await writingApi.save({
        title,
        original_content: articleText,
        rewritten_content: result.rewritten_content,
        model_used: model,
        rule_set_ids: ruleSetIds,
      });
      setCurrentArticleId(saved.id);
      loadHistory();
      toast('success', 'Article optimized and saved to history');
    } catch {
      toast('error', 'Rewrite failed. Check your API key and try again.');
    } finally {
      setRewriting(false);
    }
  };

  const evaluateGeo = async (testQuery?: string, ruleSetIds?: string[], batchMode?: boolean, batchQueryCount?: number) => {
    if (!rewriteResult) { toast('error', 'Run rewrite first'); return; }
    setEvaluating(true);
    try {
      const result = await writingApi.evaluateGeo({
        original_content: rewriteResult.original_content,
        rewritten_content: rewriteResult.rewritten_content,
        test_query: testQuery,
        rules_applied: rewriteResult.rules_applied,
        rule_set_ids: ruleSetIds ?? rewriteResult.rule_set_ids,
        batch_mode: batchMode ?? false,
        ...(batchMode && batchQueryCount ? { batch_query_count: batchQueryCount } : {}),
      });
      setGeoResult(result);
      // Save scores back to the article record
      if (currentArticleId) {
        await writingApi.saveScores(currentArticleId, JSON.stringify(result)).catch(() => {});
        loadHistory();
      }
      toast('success', 'GEO evaluation complete');
    } catch {
      toast('error', 'Evaluation failed. Check your API key and try again.');
    } finally {
      setEvaluating(false);
    }
  };

  const loadRuleSets = async () => {
    try {
      setRuleSets(await rulesApi.list());
    } catch {
      // silently fail
    }
  };

  const loadHistory = async () => {
    try {
      setHistory(await writingApi.getHistory());
    } catch {
      // silently fail
    }
  };

  const deleteFromHistory = async (id: string) => {
    try {
      await writingApi.deleteHistory(id);
      setHistory((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast('error', 'Failed to delete history item');
    }
  };

  /** Clear all session state and the persisted article text for a clean restart. */
  const reset = () => {
    setArticleText('');
    setRewriteResult(null);
    setGeoResult(null);
    setScraped(null);
    setCurrentArticleId(null);
    sessionStorage.removeItem('geo_rewrite_result');
    sessionStorage.removeItem('geo_eval_result');
    sessionStorage.removeItem('geo_current_article_id');
  };

  return {
    scraped, articleText, setArticleText,
    rewriteResult, geoResult,
    ruleSets, history,
    scraping, rewriting, evaluating,
    scrapeUrl, rewrite, evaluateGeo,
    loadRuleSets, loadHistory, deleteFromHistory,
    reset,
    currentArticleId,
  };
}
