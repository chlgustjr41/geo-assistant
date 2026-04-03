import type { RuleSet } from '../../types';
import { GE_MODELS } from '../../types';

interface Props {
  selectedRuleSetIds: string[];
  onRuleSetIdsChange: (ids: string[]) => void;
  ruleSets: RuleSet[];
}

function fullModelName(model: string): string {
  const found = GE_MODELS.find((m) => m.id === model);
  if (found) return found.label;
  return model;
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

  const allSelected = ruleSets.length > 0 && selectedRuleSetIds.length === ruleSets.length;

  const handleToggleAll = () => {
    onRuleSetIdsChange(allSelected ? [] : ruleSets.map((rs) => rs.id));
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
          {ruleSets.length > 0 && (
            <button
              onClick={handleToggleAll}
              className="text-xs text-primary-500 hover:text-primary-700 font-medium"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
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
                  <span className="text-xs text-gray-400 shrink-0">{fullModelName(rs.engine_model)}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
