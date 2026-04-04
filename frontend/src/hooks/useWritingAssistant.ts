import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { writingApi, rulesApi, jobsApi } from '../services/api';
import type {
  ScrapedArticle,
  RewriteResponse,
  MultiGeoEvalResponse,
  ArticleDetail,
} from '../types';
import { toast } from '../components/shared/Toast';
import { useLocalStorage } from './useLocalStorage';
import { useSessionStorage } from './useSessionStorage';
import { useActiveJobs } from '../contexts/ActiveJobsContext';
import { queryKeys } from '../lib/queryClient';

const REWRITE_JOB_KEY = 'geo_rewrite_job_id';
const EVAL_JOB_KEY = 'geo_eval_job_id';
const POLL_INTERVAL = 3000;

export function useWritingAssistant() {
  const queryClient = useQueryClient();
  const [scraped, setScraped] = useState<ScrapedArticle | null>(null);
  // articleText persists across refreshes (localStorage) — losing a long article is annoying
  const [articleText, setArticleText] = useLocalStorage<string>('geo_article_text', '');
  // rewriteResult is session-only: cleared on tab close/refresh so the
  // original_content baseline is never stale from a previous session
  const [rewriteResult, setRewriteResult] = useSessionStorage<RewriteResponse | null>('geo_rewrite_result', null);
  const [geoResult, setGeoResult] = useSessionStorage<MultiGeoEvalResponse | null>('geo_eval_result', null);
  const { data: ruleSets = [] } = useQuery({
    queryKey: queryKeys.ruleSets,
    queryFn: rulesApi.list,
  });
  const { data: history = [] } = useQuery({
    queryKey: queryKeys.articleHistory,
    queryFn: writingApi.getHistory,
  });
  const [currentArticleId, setCurrentArticleId] = useSessionStorage<string | null>('geo_current_article_id', null);
  const [scraping, setScraping] = useState(false);
  // Sync rewriting/evaluating state with global ActiveJobsContext so Layout can show indicators
  const { rewriting, setRewriting, evaluating, setEvaluating } = useActiveJobs();
  const [rewriteProgress, setRewriteProgress] = useState<Record<string, unknown> | null>(null);
  const [evalProgress, setEvalProgress] = useState<Record<string, unknown> | null>(null);
  const [recoveredEvalConfig, setRecoveredEvalConfig] = useState<Record<string, unknown> | null>(null);
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
          // Clean up any persistent active-job flags for rewrite
          jobsApi.listActive().then(({ active_jobs }) => {
            active_jobs.filter((a) => a.job_type === 'rewrite').forEach((a) => jobsApi.deleteActive(a.id).catch(() => {}));
          }).catch(() => {});
        } else if (job.status === 'error') {
          clearInterval(rewriteTimerRef.current!);
          rewriteTimerRef.current = null;
          sessionStorage.removeItem(REWRITE_JOB_KEY);
          setRewriting(false);
          setRewriteProgress(null);
          toast('error', job.error || 'Rewrite failed');
          jobsApi.listActive().then(({ active_jobs }) => {
            active_jobs.filter((a) => a.job_type === 'rewrite').forEach((a) => jobsApi.deleteActive(a.id).catch(() => {}));
          }).catch(() => {});
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
          jobsApi.listActive().then(({ active_jobs }) => {
            active_jobs.filter((a) => a.job_type === 'geo_evaluation').forEach((a) => jobsApi.deleteActive(a.id).catch(() => {}));
          }).catch(() => {});
        } else if (job.status === 'error') {
          clearInterval(evalTimerRef.current!);
          evalTimerRef.current = null;
          sessionStorage.removeItem(EVAL_JOB_KEY);
          setEvaluating(false);
          setEvalProgress(null);
          toast('error', job.error || 'Evaluation failed');
          jobsApi.listActive().then(({ active_jobs }) => {
            active_jobs.filter((a) => a.job_type === 'geo_evaluation').forEach((a) => jobsApi.deleteActive(a.id).catch(() => {}));
          }).catch(() => {});
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

  // Recover running jobs on mount — checks both sessionStorage (same-session refresh)
  // and persistent DB flags (survives sign-out/sign-in)
  useEffect(() => {
    // First try sessionStorage (faster, no API call)
    const savedRewriteJobId = sessionStorage.getItem(REWRITE_JOB_KEY);
    if (savedRewriteJobId) pollRewriteJob(savedRewriteJobId);
    const savedEvalJobId = sessionStorage.getItem(EVAL_JOB_KEY);
    if (savedEvalJobId) pollEvalJob(savedEvalJobId);

    // Also check persistent DB flags (covers sign-out/sign-in recovery)
    if (!savedRewriteJobId || !savedEvalJobId) {
      jobsApi.listActive().then(({ active_jobs }) => {
        for (const aj of active_jobs) {
          const cfg = aj.config as Record<string, unknown> | null;

          if (aj.job_type === 'rewrite' && !savedRewriteJobId) {
            // Restore selected rule sets from config
            if (cfg?.rule_set_ids && Array.isArray(cfg.rule_set_ids)) {
              localStorage.setItem('geo_selected_rule_sets', JSON.stringify(cfg.rule_set_ids));
            }
            if (aj.status === 'running') {
              pollRewriteJob(aj.job_id);
            } else if (aj.status === 'complete' && aj.result) {
              setRewriteResult(aj.result as RewriteResponse);
              toast('success', 'Rewrite completed while you were away');
              jobsApi.deleteActive(aj.id).catch(() => {});
            } else {
              if (aj.status === 'stale') toast('error', 'A previous rewrite was interrupted by a server restart');
              else if (aj.status === 'error') toast('error', aj.error || 'A previous rewrite failed');
              jobsApi.deleteActive(aj.id).catch(() => {});
            }
          }
          if (aj.job_type === 'geo_evaluation' && !savedEvalJobId) {
            // Restore selected rule sets from config
            if (cfg?.rule_set_ids && Array.isArray(cfg.rule_set_ids)) {
              localStorage.setItem('geo_selected_rule_sets', JSON.stringify(cfg.rule_set_ids));
            }
            // Expose recovered eval settings (batch_mode, batch_query_count)
            if (cfg) setRecoveredEvalConfig(cfg);
            if (aj.status === 'running') {
              pollEvalJob(aj.job_id);
            } else if (aj.status === 'complete') {
              // Eval results are large — just notify, user can re-run
              toast('success', 'GEO evaluation completed while you were away');
              jobsApi.deleteActive(aj.id).catch(() => {});
            } else {
              if (aj.status === 'stale') toast('error', 'A previous evaluation was interrupted by a server restart');
              else if (aj.status === 'error') toast('error', aj.error || 'A previous evaluation failed');
              jobsApi.deleteActive(aj.id).catch(() => {});
            }
          }
        }
      }).catch(() => { /* auth not ready or API unavailable */ });
    }

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

  const evaluateGeo = async (opts?: {
    testQuery?: string;
    ruleSetIds?: string[];
    batchMode?: boolean;
    batchQueryCount?: number;
    batchQueries?: string[];
    corpusSetIds?: string[];
  }) => {
    if (!rewriteResult) { toast('error', 'Run rewrite first'); return; }
    const { testQuery, ruleSetIds, batchMode, batchQueryCount, batchQueries, corpusSetIds } = opts ?? {};
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
        ...(batchMode && batchQueries && batchQueries.length > 0 ? { batch_queries: batchQueries } : {}),
        ...(corpusSetIds ? { corpus_set_ids: corpusSetIds } : {}),
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

  const loadRuleSets = () => { queryClient.invalidateQueries({ queryKey: queryKeys.ruleSets }); };
  const loadHistory = () => { queryClient.invalidateQueries({ queryKey: queryKeys.articleHistory }); };

  const deleteFromHistory = async (id: string) => {
    try {
      await writingApi.deleteHistory(id);
      queryClient.invalidateQueries({ queryKey: queryKeys.articleHistory });
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

  /** Restore full state from a saved history item. */
  const restoreFromHistory = (detail: ArticleDetail) => {
    // Stop any in-flight jobs
    if (rewriteTimerRef.current) { clearInterval(rewriteTimerRef.current); rewriteTimerRef.current = null; }
    if (evalTimerRef.current) { clearInterval(evalTimerRef.current); evalTimerRef.current = null; }
    sessionStorage.removeItem(REWRITE_JOB_KEY);
    sessionStorage.removeItem(EVAL_JOB_KEY);
    sessionStorage.removeItem('geo_rewrite_meta');
    setRewriting(false);
    setEvaluating(false);
    setRewriteProgress(null);
    setEvalProgress(null);
    setScraped(null);

    // Restore article text
    setArticleText(detail.original_content);

    // Restore rewrite result if the article was optimized
    if (detail.rewritten_content) {
      const ruleSetIds = detail.rule_sets.map((rs) => rs.id).filter(Boolean);
      setRewriteResult({
        original_content: detail.original_content,
        rewritten_content: detail.rewritten_content,
        model_used: detail.model_used,
        rules_applied: [], // rules not stored in history detail
        trend_keywords_injected: detail.trend_keywords ?? [],
        rule_set_ids: ruleSetIds.length > 0 ? ruleSetIds : (detail.rule_set_id ? [detail.rule_set_id] : []),
      });

      // Restore selected rule set IDs in localStorage so ConfigPanel picks them up
      const idsToRestore = ruleSetIds.length > 0 ? ruleSetIds : (detail.rule_set_id ? [detail.rule_set_id] : []);
      if (idsToRestore.length > 0) {
        localStorage.setItem('geo_selected_rule_sets', JSON.stringify(idsToRestore));
      }
    } else {
      setRewriteResult(null);
    }

    // Restore GEO scores
    setGeoResult(detail.geo_scores ?? null);

    // Track this as the current article
    setCurrentArticleId(detail.id);
  };

  return {
    scraped, articleText, setArticleText,
    rewriteResult, geoResult,
    ruleSets, history,
    scraping, rewriting, evaluating,
    rewriteProgress, evalProgress,
    recoveredEvalConfig,
    scrapeUrl, rewrite, evaluateGeo,
    loadRuleSets, loadHistory, deleteFromHistory,
    reset, restoreFromHistory,
    currentArticleId,
  };
}
