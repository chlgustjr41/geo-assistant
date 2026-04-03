import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, Code2 } from 'lucide-react';

// Tailwind class map for react-markdown elements — no Typography plugin needed
const MD: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mt-3 mb-1 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold text-gray-800 mt-2 mb-1 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-700 mt-2 mb-1 first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="text-sm text-gray-700 mb-2 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="text-sm text-gray-700">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-3 border-gray-300 pl-3 my-2 text-gray-600 italic">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800">{children}</code>
  ),
  hr: () => <hr className="border-gray-200 my-3" />,
};

interface Props {
  content: string;
  /** Max height with overflow scroll. Defaults to no cap. */
  maxHeight?: string;
  className?: string;
}

/**
 * Toggleable markdown renderer for large text fields.
 * Defaults to "Formatted" (markdown rendered). Users can switch to "Plain text" to see raw content.
 */
export function MarkdownView({ content, maxHeight, className = '' }: Props) {
  const [mode, setMode] = useState<'formatted' | 'raw'>('formatted');

  return (
    <div className={`rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* Toggle bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <div className="flex gap-1">
          <button
            onClick={() => setMode('formatted')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              mode === 'formatted'
                ? 'bg-white border border-gray-200 text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText size={11} />
            Formatted
          </button>
          <button
            onClick={() => setMode('raw')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              mode === 'raw'
                ? 'bg-white border border-gray-200 text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Code2 size={11} />
            Plain text
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className={`p-3 overflow-y-auto bg-white ${maxHeight ? '' : ''}`}
        style={maxHeight ? { maxHeight } : undefined}
      >
        {mode === 'formatted' ? (
          <ReactMarkdown components={MD}>{content}</ReactMarkdown>
        ) : (
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{content}</pre>
        )}
      </div>
    </div>
  );
}
