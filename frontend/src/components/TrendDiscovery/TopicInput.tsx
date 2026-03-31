import { useState } from 'react';
import { Search } from 'lucide-react';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface Props {
  onDiscover: (topic: string, timeframe: string, geo: string) => void;
  loading: boolean;
}

export function TopicInput({ onDiscover, loading }: Props) {
  const [topic, setTopic] = useState('elderly caregiving');
  const [geo, setGeo] = useState('US');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-2">
        Fetches currently trending topics in your region — select relevant ones to inject into your article.
      </p>
      <div className="flex gap-3">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Filter by topic (e.g. elderly caregiving)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && onDiscover(topic, 'rss', geo)}
        />
        <select
          value={geo}
          onChange={(e) => setGeo(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="US">US</option>
          <option value="CA">Canada</option>
          <option value="GB">UK</option>
          <option value="AU">Australia</option>
        </select>
        <button
          onClick={() => onDiscover(topic, 'rss', geo)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <LoadingSpinner size="sm" /> : <Search size={14} />}
          {loading ? 'Fetching...' : 'Discover Trends'}
        </button>
      </div>
    </div>
  );
}
