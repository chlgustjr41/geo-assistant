import type { GeoEvalResponse } from '../../types';

interface ScoreCardProps {
  label: string;
  before: number;
  after: number;
  pct: number;
}

function ScoreCard({ label, before, after, pct }: ScoreCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-bold text-gray-900">
        {before.toFixed(1)} &rarr; {after.toFixed(1)}
      </p>
      <p className="text-lg font-semibold text-green-600 mt-1">+{pct.toFixed(1)}%</p>
    </div>
  );
}

interface Props {
  result: GeoEvalResponse;
}

export function GEOScorePanel({ result }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <ScoreCard
          label="Word Visibility"
          before={result.original_scores.word}
          after={result.optimized_scores.word}
          pct={result.improvement.word_pct}
        />
        <ScoreCard
          label="Position Visibility"
          before={result.original_scores.pos}
          after={result.optimized_scores.pos}
          pct={result.improvement.pos_pct}
        />
        <ScoreCard
          label="Overall Visibility"
          before={result.original_scores.overall}
          after={result.optimized_scores.overall}
          pct={result.improvement.overall_pct}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700">
            Test Query: &ldquo;{result.test_query_used}&rdquo;
          </h4>
          <span className="text-xs text-gray-400">
            Est. cost: ${result.evaluation_cost_usd.toFixed(3)}
          </span>
        </div>
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">GE Response (Optimized Version)</p>
          <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
            {result.ge_response_optimized}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Source Citations</p>
          <div className="space-y-1">
            {result.source_citations.map((c) => (
              <div
                key={c.source_id}
                className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-md ${
                  c.cited ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'
                }`}
              >
                <span>Source {c.source_id}: {c.label}</span>
                <span>{c.cited ? `Score: ${c.word_score.toFixed(1)}` : 'Not cited'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
