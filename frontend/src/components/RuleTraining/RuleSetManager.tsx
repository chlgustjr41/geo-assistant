import { useEffect } from 'react';
import { Trash2, Download } from 'lucide-react';
import { useRuleExtraction } from '../../hooks/useRuleExtraction';
import { rulesApi } from '../../services/api';
import { toast } from '../shared/Toast';

export function RuleSetManager() {
  const { ruleSets, loadRuleSets } = useRuleExtraction();

  useEffect(() => { loadRuleSets(); }, []);

  const handleDelete = async (id: string, name: string, isBuiltin: boolean) => {
    if (isBuiltin) { toast('error', 'Cannot delete built-in rule sets'); return; }
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await rulesApi.delete(id);
      toast('success', 'Rule set deleted');
      loadRuleSets();
    } catch {
      toast('error', 'Failed to delete rule set');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">Rule Sets ({ruleSets.length})</h3>
      </div>
      {ruleSets.length === 0 ? (
        <p className="p-6 text-center text-sm text-gray-400">No rule sets found</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {ruleSets.map((rs) => (
            <div key={rs.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-800">{rs.name}</p>
                <p className="text-xs text-gray-400">
                  {rs.engine_model} &middot; {rs.num_rules} rules
                  {rs.is_builtin && <span className="ml-2 text-blue-500">Built-in</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={rulesApi.exportUrl(rs.id)}
                  download
                  className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                  title="Export"
                >
                  <Download size={14} />
                </a>
                {!rs.is_builtin && (
                  <button
                    onClick={() => handleDelete(rs.id, rs.name, rs.is_builtin)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
