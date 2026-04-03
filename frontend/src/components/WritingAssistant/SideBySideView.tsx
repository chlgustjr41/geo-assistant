import { MarkdownView } from '../shared/MarkdownView';

interface Props {
  original: string;
  optimized: string;
}

export function SideBySideView({ original, optimized }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left — original */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Original</h3>
        </div>
        <MarkdownView content={original} maxHeight="384px" className="border-0 rounded-none" />
      </div>

      {/* Right — optimized */}
      <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
        <div className="px-4 py-2 bg-green-50 border-b border-green-200">
          <h3 className="text-sm font-semibold text-green-700">GEO-Optimized</h3>
        </div>
        <MarkdownView content={optimized} maxHeight="384px" className="border-0 rounded-none" />
      </div>
    </div>
  );
}
