export interface RuleSet {
  id: string;
  name: string;
  engine_model: string;
  topic_domain: string;
  num_rules: number;
  is_builtin: boolean;
  created_at: string;
}

export interface RuleSetDetail extends RuleSet {
  rules: { filtered_rules: string[] };
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

export interface ArticleHistoryItem {
  id: string;
  title: string;
  source_url: string | null;
  model_used: string;
  rule_set_id: string;
  has_rewrite: boolean;
  has_scores: boolean;
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
  rule_set_id: string;
  trend_keywords: string[];
}

export interface RewriteResponse {
  original_content: string;
  rewritten_content: string;
  model_used: string;
  rules_applied: string[];
  trend_keywords_injected: string[];
}

export interface GeoScores {
  word: number;
  pos: number;
  overall: number;
}

export interface SourceCitation {
  source_id: number;
  label: string;
  word_score: number;
  cited: boolean;
}

export interface GeoEvalResponse {
  original_scores: GeoScores;
  optimized_scores: GeoScores;
  improvement: { word_pct: number; pos_pct: number; overall_pct: number };
  ge_response_original: string;
  ge_response_optimized: string;
  source_citations: SourceCitation[];
  test_query_used: string;
  evaluation_cost_usd: number;
}

export interface TrendDataPoint {
  date: string;
  [keyword: string]: string | number;
}

export interface TrendQuery {
  query: string;
  value: string | number;
}

export interface TrendResult {
  interest_over_time: TrendDataPoint[];
  rising_queries: TrendQuery[];
  top_queries: TrendQuery[];
}

export interface AppSettings {
  openai_key_set: boolean;
  openai_key_masked: string;
  google_key_set: boolean;
  google_key_masked: string;
  anthropic_key_set: boolean;
  anthropic_key_masked: string;
  target_website: string;
  default_model: string;
  default_rule_set: string;
}

export const GE_MODELS = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'google', tier: 'fast' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', tier: 'standard' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google', tier: 'standard' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'openai', tier: 'fast' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', tier: 'fast' },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai', tier: 'standard' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', tier: 'standard' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'anthropic', tier: 'fast' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic', tier: 'standard' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic', tier: 'standard' },
] as const;

export type GEModelId = (typeof GE_MODELS)[number]['id'];

export type Tab = 'writing' | 'trends' | 'rules' | 'settings';
