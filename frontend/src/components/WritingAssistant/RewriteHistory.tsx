import type { ArticleHistoryItem } from '../../types';
import { Clock } from 'lucide-react';

interface Props {
  history: ArticleHistoryItem[];
  onLoad?: () => void;
}

export function RewriteHistory({ history, onLoad }: Props) {
  if (history.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <Clock size={24} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">No saved rewrites yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Rewrite History</h3>
        {onLoad && (
          <button onClick={onLoad} className="text-xs text-blue-600 hover:underline">
            Refresh
          </button>
        )}
      </div>
      <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
        {history.map((a) => (
          <div key={a.id} className="px-4 py-2 hover:bg-gray-50">
            <p className="text-sm font-medium text-gray-800 truncate">{a.title || 'Untitled'}</p>
            <p className="text-xs text-gray-400">
              {a.model_used} &middot; {new Date(a.created_at).toLocaleDateString()}
              {a.has_scores && <span className="ml-2 text-green-600">&#10003; Scored</span>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
