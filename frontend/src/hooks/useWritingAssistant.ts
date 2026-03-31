import { useState } from 'react';
import { writingApi, rulesApi } from '../services/api';
import type {
  ScrapedArticle,
  RewriteResponse,
  GeoEvalResponse,
  RuleSet,
  ArticleHistoryItem,
} from '../types';
import { toast } from '../components/shared/Toast';

export function useWritingAssistant() {
  const [scraped, setScraped] = useState<ScrapedArticle | null>(null);
  const [articleText, setArticleText] = useState('');
  const [rewriteResult, setRewriteResult] = useState<RewriteResponse | null>(null);
  const [geoResult, setGeoResult] = useState<GeoEvalResponse | null>(null);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [history, setHistory] = useState<ArticleHistoryItem[]>([]);
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

  const rewrite = async (model: string, ruleSetId: string, trendKeywords: string[]) => {
    if (!articleText.trim()) { toast('error', 'No article text to rewrite'); return; }
    setRewriting(true);
    try {
      const result = await writingApi.rewrite({
        content: articleText,
        model,
        rule_set_id: ruleSetId,
        trend_keywords: trendKeywords,
      });
      setRewriteResult(result);
      toast('success', 'Article optimized successfully');
    } catch {
      toast('error', 'Rewrite failed. Check your API key and try again.');
    } finally {
      setRewriting(false);
    }
  };

  const evaluateGeo = async (engineModel: string, testQuery?: string) => {
    if (!rewriteResult) { toast('error', 'Run rewrite first'); return; }
    setEvaluating(true);
    try {
      const result = await writingApi.evaluateGeo({
        original_content: rewriteResult.original_content,
        rewritten_content: rewriteResult.rewritten_content,
        test_query: testQuery,
        engine_model: engineModel,
      });
      setGeoResult(result);
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

  const saveToHistory = async (model: string, ruleSetId: string, trendKeywords: string[]) => {
    if (!articleText) return;
    await writingApi.save({
      title: scraped?.title,
      source_url: scraped ? undefined : undefined,
      original_content: articleText,
      rewritten_content: rewriteResult?.rewritten_content,
      model_used: model,
      rule_set_id: ruleSetId,
      trend_keywords: trendKeywords,
    });
    toast('success', 'Saved to history');
    loadHistory();
  };

  return {
    scraped, articleText, setArticleText,
    rewriteResult, geoResult,
    ruleSets, history,
    scraping, rewriting, evaluating,
    scrapeUrl, rewrite, evaluateGeo,
    loadRuleSets, loadHistory, saveToHistory,
  };
}
