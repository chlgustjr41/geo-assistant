import { useState } from 'react';
import { Link, FileText } from 'lucide-react';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface Props {
  onTextChange: (text: string) => void;
  onScrape: (url: string) => void;
  scraping: boolean;
  currentText: string;
}

export function ArticleInput({ onTextChange, onScrape, scraping, currentText }: Props) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'paste' | 'url'>('paste');

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode('paste')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === 'paste' ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <FileText size={14} /> Paste Text
        </button>
        <button
          onClick={() => setMode('url')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === 'url' ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Link size={14} /> Scrape URL
        </button>
      </div>

      {mode === 'url' ? (
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://careyaya.org/blog/..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={() => onScrape(url)}
            disabled={scraping || !url.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scraping ? <LoadingSpinner size="sm" /> : null}
            {scraping ? 'Scraping...' : 'Scrape'}
          </button>
        </div>
      ) : (
        <textarea
          value={currentText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Paste your article text here..."
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none font-mono"
        />
      )}

      {currentText && (
        <p className="mt-2 text-xs text-gray-500">
          {currentText.split(/\s+/).filter(Boolean).length} words
        </p>
      )}
    </div>
  );
}
