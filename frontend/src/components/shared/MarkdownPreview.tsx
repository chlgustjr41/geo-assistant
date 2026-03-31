import ReactMarkdown from 'react-markdown';

interface Props {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className = '' }: Props) {
  return (
    <div className={`prose prose-sm max-w-none text-gray-800 ${className}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
