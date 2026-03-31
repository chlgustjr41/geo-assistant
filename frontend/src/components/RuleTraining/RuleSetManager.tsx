import { useEffect, useState } from 'react';
import { Trash2, Download, Plus, X } from 'lucide-react';
import { useRuleExtraction } from '../../hooks/useRuleExtraction';
import { rulesApi } from '../../services/api';
import { toast } from '../shared/Toast';
import { GE_MODELS } from '../../types';

export function RuleSetManager() {
  const { ruleSets, loadRuleSets } = useRuleExtraction();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModel, setNewModel] = useState('gemini-2.5-flash-lite');
  const [saving, setSaving] = useState(false);

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

  const handleCreate = async () => {
    if (!newName.trim()) { toast('error', 'Enter a name'); return; }
    setSaving(true);
    try {
      await rulesApi.create({ name: newName.trim(), engine_model: newModel });
      toast('success', `Rule set "${newName.trim()}" created`);
      setNewName('');
      setCreating(false);
      loadRuleSets();
    } catch {
      toast('error', 'Failed to create rule set');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Rule Sets ({ruleSets.length})</h3>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          {creating ? <X size={12} /> : <Plus size={12} />}
          {creating ? 'Cancel' : 'New Rule Set'}
        </button>
      </div>

      {creating && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex gap-2 items-center">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Rule set name..."
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <select
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {GE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

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
