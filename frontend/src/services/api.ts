import axios from 'axios';
import { auth } from '../config/firebase';
import type {
  AppSettings,
  ScrapedArticle,
  RewriteRequest,
  RewriteResponse,
  MultiGeoEvalResponse,
  RuleSet,
  RuleSetDetail,
  ArticleHistoryItem,
  ArticleDetail,
  CorpusDocument,
  CorpusSet,
  QuerySet,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/',
});

// Attach Firebase ID token to every request (when auth is configured)
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, sign the user out so they see the login page.
// 403 on /api/admin/* is expected for non-admins — don't sign out.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url || '';
    const isAdminRoute = url.includes('/api/admin/');
    if (status === 401 || (status === 403 && !isAdminRoute)) {
      const { signOut } = await import('firebase/auth');
      await signOut(auth).catch(() => {});
    }
    return Promise.reject(error);
  },
);

export const settingsApi = {
  get: () => api.get<AppSettings>('/api/settings').then((r) => r.data),
  updateDefaults: (data: {
    default_model?: string;
    default_rule_set?: string;
  }) => api.put<{ ok: boolean }>('/api/settings/defaults', data).then((r) => r.data),
  resetWorkspace: () =>
    api.post<{ ok: boolean }>('/api/settings/reset-workspace').then((r) => r.data),
  resetRulesCorpus: () =>
    api.post<{ ok: boolean; builtin_rules_kept: number }>('/api/settings/reset-rules-corpus').then((r) => r.data),
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
    num_competing_docs?: number;
    rules_applied?: string[];
    rule_set_ids?: string[];
    batch_mode?: boolean;
    batch_query_count?: number;
  }) => api.post<MultiGeoEvalResponse>('/api/writing/evaluate-geo', req).then((r) => r.data),
  getHistory: () =>
    api.get<ArticleHistoryItem[]>('/api/writing/history').then((r) => r.data),
  deleteHistory: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/writing/history/${id}`).then((r) => r.data),
  save: (data: {
    source_url?: string;
    title?: string;
    original_content: string;
    rewritten_content?: string;
    rule_set_ids?: string[];
    model_used?: string;
  }) => api.post<{ id: string }>('/api/writing/save', data).then((r) => r.data),
  getHistoryItem: (id: string) => api.get<ArticleDetail>(`/api/writing/history/${id}`).then((r) => r.data),
  saveScores: (id: string, geo_scores_json: string) => api.patch<{ ok: boolean }>(`/api/writing/history/${id}/scores`, { geo_scores_json }).then((r) => r.data),
};


export interface DiscoverResult {
  url: string;
  title: string;
  snippet: string;
  hit_count: number;
}

export interface DiscoverResponse {
  urls: DiscoverResult[];
  total_found: number;
  queries_used: string[];
  query_set_name?: string;
  rule_set_name?: string;
}

export const corpusApi = {
  list: () => api.get<CorpusDocument[]>('/api/corpus').then((r) => r.data),
  count: () => api.get<{ count: number }>('/api/corpus/count').then((r) => r.data),
  addText: (data: { title?: string; content: string; source_url?: string; query_set_id?: string; corpus_set_id?: string }) =>
    api.post<{ id: string; title: string; word_count: number }>('/api/corpus/add-text', data).then((r) => r.data),
  addUrl: (url: string, title?: string, query_set_id?: string, corpus_set_id?: string) =>
    api.post<{ id: string; title: string; word_count: number }>('/api/corpus/add-url', { url, title, query_set_id, corpus_set_id }).then((r) => r.data),
  delete: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/corpus/${id}`).then((r) => r.data),
  bulkDelete: (ids: string[]) =>
    api.post<{ ok: boolean; deleted: number }>('/api/corpus/bulk-delete', { ids }).then((r) => r.data),
  discoverFromQuerySet: (data: { query_set_id: string; max_urls?: number }) =>
    api.post<DiscoverResponse>('/api/corpus/discover-from-queryset', data).then((r) => r.data),
  bulkAddUrls: (urls: string[], query_set_id?: string, corpus_set_id?: string) =>
    api.post<{ added: number; failed: Array<{ url: string; error: string }> }>('/api/corpus/bulk-add-urls', { urls, query_set_id, corpus_set_id }).then((r) => r.data),
  auditBinary: () =>
    api.get<{ count: number; documents: Array<{ id: string; title: string; source_url: string | null }> }>('/api/corpus/audit-binary').then((r) => r.data),
  purgeBinary: () =>
    api.post<{ deleted: number }>('/api/corpus/purge-binary').then((r) => r.data),
};

export const corpusSetApi = {
  list: () => api.get<CorpusSet[]>('/api/corpus-sets').then((r) => r.data),
  create: (data: { name: string; query_set_id?: string }) =>
    api.post<CorpusSet>('/api/corpus-sets', data).then((r) => r.data),
  rename: (id: string, name: string) =>
    api.put<{ ok: boolean }>(`/api/corpus-sets/${id}`, { name }).then((r) => r.data),
  delete: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/corpus-sets/${id}`).then((r) => r.data),
  listDocuments: (id: string) =>
    api.get<CorpusDocument[]>(`/api/corpus-sets/${id}/documents`).then((r) => r.data),
};

export const querySetApi = {
  list: () => api.get<QuerySet[]>('/api/query-sets').then((r) => r.data),
  create: (data: { name: string; topic: string; queries: string[] }) =>
    api.post<{ id: string; name: string; num_queries: number }>('/api/query-sets', data).then((r) => r.data),
  get: (id: string) => api.get<QuerySet>(`/api/query-sets/${id}`).then((r) => r.data),
  delete: (id: string) => api.delete<{ ok: boolean }>(`/api/query-sets/${id}`).then((r) => r.data),
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
  generateQueries: (topic: string, num_queries = 20, article_content?: string) =>
    api
      .post<{ queries: string[]; suggested_topic: string }>(
        '/api/rules/generate-queries',
        { topic, num_queries, ...(article_content ? { article_content } : {}) },
      )
      .then((r) => r.data),
  exportTrainingPackage: (data: object) =>
    api
      .post('/api/rules/export-training-package', data, { responseType: 'blob' })
      .then((r) => r.data),
};

export const adminApi = {
  getWhitelist: () =>
    api.get<{ emails: string[]; super_admin: string }>('/api/admin/whitelist').then((r) => r.data),
  addEmail: (email: string) =>
    api.post<{ ok: boolean; emails: string[]; already_exists?: boolean }>('/api/admin/whitelist', { email }).then((r) => r.data),
  removeEmail: (email: string) =>
    api.delete<{ ok: boolean; emails: string[]; error?: string }>('/api/admin/whitelist', { data: { email } }).then((r) => r.data),
};
