export interface RuleSet {
  id: string;
  name: string;
  engine_model: string;
  topic_domain: string;
  num_rules: number;
  is_builtin: boolean;
  is_deprecated: boolean;
  created_at: string;
}

export interface ExtractionMetadata {
  queries: string[];
  query_set_id?: string;
  corpus_set_ids?: string[];
  corpus_doc_count?: number;
  source_urls?: string[];
  ge_responses: Array<{ query: string; response: string }>;
}

export interface RuleSetDetail extends RuleSet {
  rules: { filtered_rules: string[] };
  extraction_metadata: ExtractionMetadata | null;
}

export interface Article {
  id: string;
  source_url: string | null;
  title: string;
  original_content: string;
  rewritten_content: string | null;
  geo_scores_json: string | null;
  rule_set_id: string;
  model_used: string;
  trend_keywords_json: string | null;
  created_at: string;
}

export interface RuleSetRef {
  id: string;
  name: string;
  engine_model: string;
}

export interface ArticleHistoryItem {
  id: string;
  title: string;
  source_url: string | null;
  model_used: string;
  rule_set_id: string;
  rule_set_name: string | null;
  rule_sets: RuleSetRef[];
  corpus_set_names: string[];
  corpus_used: boolean | null;
  corpus_doc_count: number | null;
  has_rewrite: boolean;
  has_scores: boolean;
  created_at: string;
}

export interface ArticleDetail {
  id: string;
  title: string;
  source_url: string | null;
  original_content: string;
  rewritten_content: string | null;
  geo_scores: MultiGeoEvalResponse | null;
  rule_set_id: string;
  rule_set_name: string | null;
  rule_sets: RuleSetRef[];
  corpus_set_names: string[];
  model_used: string;
  trend_keywords: string[];
  created_at: string;
}

export interface ScrapedArticle {
  title: string;
  content: string;
  meta_description: string;
  word_count: number;
}

export interface RewriteRequest {
  content: string;
  model: string;
  rule_set_ids: string[];
}

export interface RewriteResponse {
  original_content: string;
  rewritten_content: string;
  model_used: string;
  rules_applied: string[];
  trend_keywords_injected: string[];
  rule_set_ids: string[];
}

export interface GeoScores {
  word: number;
  pos: number;
  overall: number;
  geu: number;
}

export interface SourceCitation {
  source_id: number;
  label: string;
  word_score: number;
  cited: boolean;
  snippet: string;
  is_corpus: boolean;
  source_url?: string | null;
}

export interface GeoEvalResponse {
  engine_model: string;
  original_scores: GeoScores;
  optimized_scores: GeoScores;
  improvement: { word_pct: number; pos_pct: number; overall_pct: number; geu_pct: number };
  ge_response_original: string;
  ge_response_optimized: string;
  source_citations: SourceCitation[];
  test_query_used: string;
  evaluation_cost_usd: number;
  score_commentary: string;
  error?: string;
}

export interface QueryBatchResult {
  query: string;
  results: GeoEvalResponse[];
  combined?: GeoEvalResponse;
}

export interface MultiGeoEvalResponse {
  results: GeoEvalResponse[];
  combined?: GeoEvalResponse;
  test_query_used: string;
  total_cost_usd: number;
  corpus_used: boolean;
  corpus_doc_count: number;
  is_batch?: boolean;
  batch_query_results?: QueryBatchResult[];
}

export interface CorpusDocument {
  id: string;
  title: string;
  source_url: string | null;
  word_count: number;
  query_set_id: string | null;
  corpus_set_id: string | null;
  created_at: string;
  snippet: string;
}

export interface CorpusSet {
  id: string;
  name: string;
  query_set_id: string | null;
  num_docs: number;
  created_at: string;
  is_deprecated: boolean;
}

export interface QuerySet {
  id: string;
  name: string;
  topic: string;
  num_queries: number;
  queries: string[];
  created_at: string;
}

export interface AppSettings {
  openai_key_set: boolean;
  google_key_set: boolean;
  anthropic_key_set: boolean;
  default_model: string;
  default_rule_set: string;
}

export const GE_MODELS = [
  // Google Gemini
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'google', tier: 'fast' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', tier: 'standard' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google', tier: 'standard' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', provider: 'google', tier: 'fast' },
  // OpenAI
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', tier: 'fast' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'openai', tier: 'fast' },
  { id: 'o4-mini', label: 'o4-mini', provider: 'openai', tier: 'fast' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', tier: 'standard' },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai', tier: 'standard' },
  { id: 'gpt-4.5', label: 'GPT-4.5', provider: 'openai', tier: 'standard' },
  // Anthropic Claude
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'anthropic', tier: 'fast' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic', tier: 'standard' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic', tier: 'standard' },
] as const;

export type GEModelId = (typeof GE_MODELS)[number]['id'];

export type Tab = 'writing' | 'rules' | 'settings';
