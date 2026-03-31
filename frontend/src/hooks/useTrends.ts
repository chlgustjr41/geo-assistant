import { useState } from 'react';
import { trendsApi } from '../services/api';
import type { TrendResult } from '../types';
import { toast } from '../components/shared/Toast';

export function useTrends() {
  const [result, setResult] = useState<TrendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);

  const discover = async (topic: string, timeframe: string, geo: string) => {
    setLoading(true);
    try {
      const data = await trendsApi.discover(topic, timeframe, geo);
      setResult(data);
      setSelectedKeywords([]);
    } catch {
      toast('error', 'Failed to fetch trends. Google Trends may be rate limiting.');
    } finally {
      setLoading(false);
    }
  };

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(keyword) ? prev.filter((k) => k !== keyword) : [...prev, keyword]
    );
  };

  return { result, loading, selectedKeywords, discover, toggleKeyword, setSelectedKeywords };
}
