import { useState, useEffect, useRef, useCallback } from 'react';
import { writingApi, rulesApi, jobsApi } from '../services/api';
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

const REWRITE_JOB_KEY = 'geo_rewrite_job_id';
const EVAL_JOB_KEY = 'geo_eval_job_id';
const POLL_INTERVAL = 3000;

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
  const [rewriteProgress, setRewriteProgress] = useState<Record<string, unknown> | null>(null);
  const [evalProgress, setEvalProgress] = useState<Record<string, unknown> | null>(null);
  const rewriteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const evalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollRewriteJob = useCallback((jobId: string) => {
    sessionStorage.setItem(REWRITE_JOB_KEY, jobId);
    setRewriting(true);
    if (rewriteTimerRef.current) clearInterval(rewriteTimerRef.current);
    rewriteTimerRef.current = setInterval(async () => {
      try {
        const job = await jobsApi.get(jobId);
        setRewriteProgress(job.progress);
        if (job.status === 'complete') {
          clearInterval(rewriteTimerRef.current!);
          rewriteTimerRef.current = null;
          sessionStorage.removeItem(REWRITE_JOB_KEY);
          setRewriting(false);
          setRewriteProgress(null);
          setRewriteResult(job.result as RewriteResponse);
          return job.result as RewriteResponse;
        } else if (job.status === 'error') {
          clearInterval(rewriteTimerRef.current!);
          rewriteTimerRef.current = null;
          sessionStorage.removeItem(REWRITE_JOB_KEY);
          setRewriting(false);
          setRewriteProgress(null);
          toast('error', job.error || 'Rewrite failed');
        }
      } catch {
        clearInterval(rewriteTimerRef.current!);
        rewriteTimerRef.current = null;
        sessionStorage.removeItem(REWRITE_JOB_KEY);
        setRewriting(false);
        setRewriteProgress(null);
      }
    }, POLL_INTERVAL);
  }, [setRewriteResult]);

  const pollEvalJob = useCallback((jobId: string) => {
    sessionStorage.setItem(EVAL_JOB_KEY, jobId);
    setEvaluating(true);
    if (evalTimerRef.current) clearInterval(evalTimerRef.current);
    evalTimerRef.current = setInterval(async () => {
      try {
        const job = await jobsApi.get(jobId);
        setEvalProgress(job.progress);
        if (job.status === 'complete') {
          clearInterval(evalTimerRef.current!);
          evalTimerRef.current = null;
          sessionStorage.removeItem(EVAL_JOB_KEY);
          setEvaluating(false);
          setEvalProgress(null);
          setGeoResult(job.result as MultiGeoEvalResponse);
        } else if (job.status === 'error') {
          clearInterval(evalTimerRef.current!);
          evalTimerRef.current = null;
          sessionStorage.removeItem(EVAL_JOB_KEY);
          setEvaluating(false);
          setEvalProgress(null);
          toast('error', job.error || 'Evaluation failed');
        }
      } catch {
        clearInterval(evalTimerRef.current!);
        evalTimerRef.current = null;
        sessionStorage.removeItem(EVAL_JOB_KEY);
        setEvaluating(false);
        setEvalProgress(null);
      }
    }, POLL_INTERVAL);
  }, [setGeoResult]);

  // Recover running jobs on mount (browser refresh)
  useEffect(() => {
    const savedRewriteJobId = sessionStorage.getItem(REWRITE_JOB_KEY);
    if (savedRewriteJobId) pollRewriteJob(savedRewriteJobId);
    const savedEvalJobId = sessionStorage.getItem(EVAL_JOB_KEY);
    if (savedEvalJobId) pollEvalJob(savedEvalJobId);
    return () => {
      if (rewriteTimerRef.current) clearInterval(rewriteTimerRef.current);
      if (evalTimerRef.current) clearInterval(evalTimerRef.current);
    };
  }, [pollRewriteJob, pollEvalJob]);

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
      const { job_id } = await writingApi.rewrite({
        content: articleText,
        model,
        rule_set_ids: ruleSetIds,
      });
      // Store context needed after job completes
      sessionStorage.setItem('geo_rewrite_meta', JSON.stringify({
        title: scraped?.title || articleText.split('\n').find((l: string) => l.trim())?.slice(0, 80) || 'Untitled',
        original_content: articleText,
        model,
        ruleSetIds,
      }));
      // Poll for completion; when done, save to history
      sessionStorage.setItem(REWRITE_JOB_KEY, job_id);
      if (rewriteTimerRef.current) clearInterval(rewriteTimerRef.current);
      rewriteTimerRef.current = setInterval(async () => {
        try {
          const job = await jobsApi.get(job_id);
          setRewriteProgress(job.progress);
          if (job.status === 'complete') {
            clearInterval(rewriteTimerRef.current!);
            rewriteTimerRef.current = null;
            sessionStorage.removeItem(REWRITE_JOB_KEY);
            setRewriting(false);
            setRewriteProgress(null);
            const result = job.result as RewriteResponse;
            setRewriteResult(result);
            // Auto-save to history
            try {
              const metaStr = sessionStorage.getItem('geo_rewrite_meta');
              const meta = metaStr ? JSON.parse(metaStr) : {};
              const saved = await writingApi.save({
                title: meta.title || 'Untitled',
                original_content: meta.original_content || articleText,
                rewritten_content: result.rewritten_content,
                model_used: meta.model || model,
                rule_set_ids: meta.ruleSetIds || ruleSetIds,
              });
              setCurrentArticleId(saved.id);
              loadHistory();
            } catch { /* save failed, non-critical */ }
            sessionStorage.removeItem('geo_rewrite_meta');
            toast('success', 'Article optimized and saved to history');
          } else if (job.status === 'error') {
            clearInterval(rewriteTimerRef.current!);
            rewriteTimerRef.current = null;
            sessionStorage.removeItem(REWRITE_JOB_KEY);
            sessionStorage.removeItem('geo_rewrite_meta');
            setRewriting(false);
            setRewriteProgress(null);
            toast('error', job.error || 'Rewrite failed');
          }
        } catch {
          clearInterval(rewriteTimerRef.current!);
          rewriteTimerRef.current = null;
          sessionStorage.removeItem(REWRITE_JOB_KEY);
          sessionStorage.removeItem('geo_rewrite_meta');
          setRewriting(false);
          setRewriteProgress(null);
        }
      }, POLL_INTERVAL);
    } catch {
      toast('error', 'Rewrite failed. Check your API key and try again.');
      setRewriting(false);
    }
  };

  const evaluateGeo = async (testQuery?: string, ruleSetIds?: string[], batchMode?: boolean, batchQueryCount?: number) => {
    if (!rewriteResult) { toast('error', 'Run rewrite first'); return; }
    setEvaluating(true);
    try {
      const { job_id } = await writingApi.evaluateGeo({
        original_content: rewriteResult.original_content,
        rewritten_content: rewriteResult.rewritten_content,
        test_query: testQuery,
        rules_applied: rewriteResult.rules_applied,
        rule_set_ids: ruleSetIds ?? rewriteResult.rule_set_ids,
        batch_mode: batchMode ?? false,
        ...(batchMode && batchQueryCount ? { batch_query_count: batchQueryCount } : {}),
      });
      pollEvalJob(job_id);
    } catch {
      toast('error', 'Evaluation failed. Check your API key and try again.');
      setEvaluating(false);
    }
  };

  // When eval completes, save scores to current article
  const prevGeoResult = useRef(geoResult);
  useEffect(() => {
    if (geoResult && geoResult !== prevGeoResult.current && currentArticleId) {
      writingApi.saveScores(currentArticleId, JSON.stringify(geoResult)).catch(() => {});
      loadHistory();
      toast('success', 'GEO evaluation complete');
    }
    prevGeoResult.current = geoResult;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoResult, currentArticleId]);

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
    setRewriteProgress(null);
    setEvalProgress(null);
    if (rewriteTimerRef.current) { clearInterval(rewriteTimerRef.current); rewriteTimerRef.current = null; }
    if (evalTimerRef.current) { clearInterval(evalTimerRef.current); evalTimerRef.current = null; }
    sessionStorage.removeItem('geo_rewrite_result');
    sessionStorage.removeItem('geo_eval_result');
    sessionStorage.removeItem('geo_current_article_id');
    sessionStorage.removeItem(REWRITE_JOB_KEY);
    sessionStorage.removeItem(EVAL_JOB_KEY);
    sessionStorage.removeItem('geo_rewrite_meta');
  };

  return {
    scraped, articleText, setArticleText,
    rewriteResult, geoResult,
    ruleSets, history,
    scraping, rewriting, evaluating,
    rewriteProgress, evalProgress,
    scrapeUrl, rewrite, evaluateGeo,
    loadRuleSets, loadHistory, deleteFromHistory,
    reset,
    currentArticleId,
  };
}
