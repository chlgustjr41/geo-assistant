import type { RuleSet } from '../../types';

interface Props {
  selectedRuleSetIds: string[];
  onRuleSetIdsChange: (ids: string[]) => void;
  ruleSets: RuleSet[];
}

export function ConfigPanel({
  selectedRuleSetIds, onRuleSetIdsChange, ruleSets,
}: Props) {
  const toggle = (id: string) => {
    onRuleSetIdsChange(
      selectedRuleSetIds.includes(id)
        ? selectedRuleSetIds.filter((x) => x !== id)
        : [...selectedRuleSetIds, id]
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Configuration</h3>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-gray-600">
            Rule Sets
            {selectedRuleSetIds.length > 1 && (
              <span className="ml-2 text-primary-500">
                ({selectedRuleSetIds.length} selected — will be merged by LLM)
              </span>
            )}
          </label>
          {selectedRuleSetIds.length > 0 && (
            <button
              onClick={() => onRuleSetIdsChange([])}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>

        {ruleSets.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No rule sets available</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {ruleSets.map((rs) => {
              const selected = selectedRuleSetIds.includes(rs.id);
              return (
                <label
                  key={rs.id}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    selected
                      ? 'bg-primary-100 border border-primary-200'
                      : 'bg-gray-50 border border-transparent hover:border-gray-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(rs.id)}
                    className="accent-primary-400"
                  />
                  <span className="flex-1 text-sm text-gray-700 truncate">{rs.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{rs.engine_model.split('-').slice(0, 2).join(' ')}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
