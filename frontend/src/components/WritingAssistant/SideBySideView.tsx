interface Props {
  original: string;
  optimized: string;
}

export function SideBySideView({ original, optimized }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Original</h3>
        </div>
        <div className="p-4 h-96 overflow-y-auto">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
            {original}
          </pre>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
        <div className="px-4 py-2 bg-green-50 border-b border-green-200">
          <h3 className="text-sm font-semibold text-green-700">GEO-Optimized</h3>
        </div>
        <div className="p-4 h-96 overflow-y-auto">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
            {optimized}
          </pre>
        </div>
      </div>
    </div>
  );
}
