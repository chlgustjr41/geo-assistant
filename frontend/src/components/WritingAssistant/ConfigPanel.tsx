import { X } from 'lucide-react';
import { GE_MODELS } from '../../types';
import type { RuleSet, GEModelId } from '../../types';

interface Props {
  selectedModel: GEModelId;
  onModelChange: (model: GEModelId) => void;
  selectedRuleSetId: string;
  onRuleSetChange: (id: string) => void;
  ruleSets: RuleSet[];
  injectedKeywords: string[];
  onRemoveKeyword: (kw: string) => void;
  onClearKeywords: () => void;
}

export function ConfigPanel({
  selectedModel, onModelChange,
  selectedRuleSetId, onRuleSetChange,
  ruleSets, injectedKeywords, onRemoveKeyword, onClearKeywords,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Configuration</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">GE Model</label>
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value as GEModelId)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {GE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.tier})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Rule Set</label>
          <select
            value={selectedRuleSetId}
            onChange={(e) => onRuleSetChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a rule set...</option>
            {ruleSets.map((rs) => (
              <option key={rs.id} value={rs.id}>
                {rs.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {injectedKeywords.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Trend Keywords</label>
            <button onClick={onClearKeywords} className="text-xs text-gray-400 hover:text-gray-600">
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {injectedKeywords.map((kw) => (
              <span
                key={kw}
                className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs"
              >
                {kw}
                <button onClick={() => onRemoveKeyword(kw)}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
