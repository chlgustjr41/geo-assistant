import { useState } from 'react';
import { Search } from 'lucide-react';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface Props {
  onDiscover: (topic: string, timeframe: string, geo: string) => void;
  loading: boolean;
}

const TIMEFRAMES = [
  { value: 'today 1-m', label: 'Past month' },
  { value: 'today 3-m', label: 'Past 3 months' },
  { value: 'today 12-m', label: 'Past 12 months' },
  { value: 'today 5-y', label: 'Past 5 years' },
];

export function TopicInput({ onDiscover, loading }: Props) {
  const [topic, setTopic] = useState('elderly caregiving');
  const [timeframe, setTimeframe] = useState('today 12-m');
  const [geo, setGeo] = useState('US');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex gap-3">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Healthcare topic (e.g. elderly caregiving)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && onDiscover(topic, timeframe, geo)}
        />
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {TIMEFRAMES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={geo}
          onChange={(e) => setGeo(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="US">US</option>
          <option value="">Worldwide</option>
          <option value="CA">Canada</option>
          <option value="GB">UK</option>
        </select>
        <button
          onClick={() => onDiscover(topic, timeframe, geo)}
          disabled={loading || !topic.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <LoadingSpinner size="sm" /> : <Search size={14} />}
          {loading ? 'Fetching...' : 'Discover Trends'}
        </button>
      </div>
    </div>
  );
}
