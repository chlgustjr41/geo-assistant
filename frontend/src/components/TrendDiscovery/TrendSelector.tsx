import { SendHorizontal } from 'lucide-react';

interface Props {
  selectedCount: number;
  onSend: () => void;
}

export function TrendSelector({ selectedCount, onSend }: Props) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
      <p className="text-sm text-green-800">
        <span className="font-semibold">{selectedCount}</span> keyword{selectedCount !== 1 ? 's' : ''} selected
      </p>
      <button
        onClick={onSend}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
      >
        <SendHorizontal size={14} /> Send to Writing Assistant
      </button>
    </div>
  );
}
