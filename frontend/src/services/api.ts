import axios from 'axios';
import type {
  AppSettings,
  ScrapedArticle,
  RewriteRequest,
  RewriteResponse,
  GeoEvalResponse,
  TrendResult,
  RuleSet,
  RuleSetDetail,
  ArticleHistoryItem,
} from '../types';

const api = axios.create({ baseURL: '/' });

export const settingsApi = {
  get: () => api.get<AppSettings>('/api/settings').then((r) => r.data),
  updateApiKey: (provider: string, key: string) =>
    api.post<{ ok: boolean }>('/api/settings/api-keys', { provider, key }).then((r) => r.data),
  testKey: (provider: string) =>
    api.post<{ ok: boolean }>('/api/settings/test-key', { provider }).then((r) => r.data),
  updateDefaults: (data: {
    target_website?: string;
    default_model?: string;
    default_rule_set?: string;
  }) => api.put<{ ok: boolean }>('/api/settings/defaults', data).then((r) => r.data),
};

export const writingApi = {
  scrapeUrl: (url: string) =>
    api.post<ScrapedArticle>('/api/writing/scrape-url', { url }).then((r) => r.data),
  rewrite: (req: RewriteRequest) =>
    api.post<RewriteResponse>('/api/writing/rewrite', req).then((r) => r.data),
  evaluateGeo: (req: {
    original_content: string;
    rewritten_content: string;
    test_query?: string;
    engine_model: string;
    num_competing_docs?: number;
  }) => api.post<GeoEvalResponse>('/api/writing/evaluate-geo', req).then((r) => r.data),
  getHistory: () =>
    api.get<ArticleHistoryItem[]>('/api/writing/history').then((r) => r.data),
  save: (data: {
    source_url?: string;
    title?: string;
    original_content: string;
    rewritten_content?: string;
    rule_set_id?: string;
    model_used?: string;
    trend_keywords?: string[];
  }) => api.post<{ id: string }>('/api/writing/save', data).then((r) => r.data),
};

export const trendsApi = {
  discover: (topic: string, timeframe = 'today 12-m', geo = 'US') =>
    api
      .post<TrendResult>('/api/trends/discover', { topic, timeframe, geo })
      .then((r) => r.data),
};

export const rulesApi = {
  list: () => api.get<RuleSet[]>('/api/rules').then((r) => r.data),
  create: (data: { name: string; engine_model: string; topic_domain?: string; rules?: string[] }) =>
    api.post<{ id: string; name: string }>('/api/rules', data).then((r) => r.data),
  get: (id: string) => api.get<RuleSetDetail>(`/api/rules/${id}`).then((r) => r.data),
  update: (id: string, data: { name?: string; rules?: { filtered_rules: string[] } }) =>
    api.put<{ ok: boolean }>(`/api/rules/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/rules/${id}`).then((r) => r.data),
  exportUrl: (id: string) => `/api/rules/${id}/export`,
  generateQueries: (topic: string, num_queries = 20) =>
    api
      .post<{ queries: string[] }>('/api/rules/generate-queries', { topic, num_queries })
      .then((r) => r.data),
  exportTrainingPackage: (data: object) =>
    api
      .post('/api/rules/export-training-package', data, { responseType: 'blob' })
      .then((r) => r.data),
};
