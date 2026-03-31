import type { TrendQuery } from '../../types';
import { TrendingUp } from 'lucide-react';

interface Props {
  queries: TrendQuery[];
  selected: string[];
  onToggle: (kw: string) => void;
  title: string;
}

export function KeywordList({ queries, selected, onToggle, title }: Props) {
  if (queries.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <TrendingUp size={14} className="text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
        {queries.map((q) => (
          <label
            key={q.query}
            className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selected.includes(q.query)}
                onChange={() => onToggle(q.query)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{q.query}</span>
            </div>
            <span className="text-xs font-medium text-green-600">
              {typeof q.value === 'number' ? `+${q.value}%` : q.value}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
