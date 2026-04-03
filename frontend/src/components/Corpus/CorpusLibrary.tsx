import { useEffect, useState } from 'react';
import { Trash2, RefreshCw, Database, AlertTriangle, ChevronDown, ChevronUp, Pencil, Check, X, AlertCircle } from 'lucide-react';
import { useCorpus } from '../../hooks/useCorpus';
import { corpusApi, corpusSetApi } from '../../services/api';
import type { CorpusSet } from '../../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toast } from '../shared/Toast';

const CORPUS_MIN = 10;

export function CorpusLibrary() {
  const { docs, loading, loadDocs, deleteDoc } = useCorpus();
  const [corpusSets, setCorpusSets] = useState<CorpusSet[]>([]);
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [binaryDocs, setBinaryDocs] = useState<Array<{ id: string; title: string; source_url: string | null }>>([]);
  const [purging, setPurging] = useState(false);

  const loadAll = () => {
    loadDocs();
    corpusSetApi.list().then(setCorpusSets).catch(() => {});
    corpusApi.auditBinary().then((r) => setBinaryDocs(r.documents)).catch(() => {});
  };

  useEffect(() => { loadAll(); }, []);

  const toggleSet = (id: string) => {
    setExpandedSets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      await corpusSetApi.rename(id, renameValue.trim());
      setCorpusSets((prev) => prev.map((cs) => cs.id === id ? { ...cs, name: renameValue.trim() } : cs));
      toast('success', 'Corpus set renamed');
    } catch {
      toast('error', 'Failed to rename');
    } finally {
      setRenamingId(null);
    }
  };

  const handleDeleteSet = async (id: string, name: string) => {
    if (!confirm(`Delete corpus set "${name}"? All documents in this set will be permanently deleted.`)) return;
    try {
      await corpusSetApi.delete(id);
      setCorpusSets((prev) => prev.filter((cs) => cs.id !== id));
      loadDocs(); // refresh doc corpus_set_id values
      toast('success', 'Corpus set deleted');
    } catch {
      toast('error', 'Failed to delete corpus set');
    }
  };

  const handleDeleteDoc = async (id: string) => {
    await deleteDoc(id);
  };

  const handlePurgeBinary = async () => {
    if (!confirm(`Delete ${binaryDocs.length} document${binaryDocs.length !== 1 ? 's' : ''} with corrupted content?`)) return;
    setPurging(true);
    try {
      const { deleted } = await corpusApi.purgeBinary();
      toast('success', `Removed ${deleted} corrupted document${deleted !== 1 ? 's' : ''}`);
      setBinaryDocs([]);
      loadAll();
    } catch {
      toast('error', 'Failed to purge corrupted documents');
    } finally {
      setPurging(false);
    }
  };

  const unassignedDocs = docs.filter((d) => !d.corpus_set_id);
  const belowMin = docs.length < CORPUS_MIN;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Corpus Library</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Documents grouped by corpus set. Sets can be selected independently or combined during rule extraction and evaluation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${belowMin ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
            <Database size={11} />
            {docs.length} / {CORPUS_MIN}+ docs
          </span>
          <button onClick={loadAll} disabled={loading} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500" title="Refresh">
            {loading ? <LoadingSpinner size="sm" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {belowMin && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">GEO evaluation will use synthetic competitors</span> until you add{' '}
            {CORPUS_MIN - docs.length} more document{CORPUS_MIN - docs.length !== 1 ? 's' : ''}. Use <strong>Build Corpus</strong> to add documents.
          </p>
        </div>
      )}

      {binaryDocs.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-red-800 mb-0.5">
              {binaryDocs.length} document{binaryDocs.length !== 1 ? 's' : ''} with corrupted content detected
            </p>
            <p className="text-xs text-red-700 mb-2">
              These were scraped when a brotli decompression bug was present. Their content is unreadable binary data and should be removed and re-scraped.
            </p>
            <div className="space-y-0.5 mb-2 max-h-24 overflow-y-auto">
              {binaryDocs.map((d) => (
                <p key={d.id} className="text-xs text-red-600 truncate">&bull; {d.title || d.source_url || d.id}</p>
              ))}
            </div>
            <button
              onClick={handlePurgeBinary}
              disabled={purging}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {purging ? <LoadingSpinner size="sm" /> : <Trash2 size={12} />}
              {purging ? 'Removing…' : `Remove ${binaryDocs.length} corrupted doc${binaryDocs.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Named corpus sets */}
      {corpusSets.map((cs) => {
        const setDocs = docs.filter((d) => d.corpus_set_id === cs.id);
        const isExpanded = expandedSets.has(cs.id);
        const isRenaming = renamingId === cs.id;

        return (
          <div key={cs.id} className={`bg-white rounded-xl border overflow-hidden ${cs.is_deprecated ? 'border-amber-200' : 'border-gray-200'}`}>
            <div className={`flex items-center gap-2 px-4 py-3 border-b ${cs.is_deprecated ? 'bg-amber-50 border-amber-100' : 'bg-blue-50 border-blue-100'}`}>
              <Database size={13} className={cs.is_deprecated ? 'text-amber-500 shrink-0' : 'text-blue-600 shrink-0'} />
              {isRenaming ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(cs.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="flex-1 text-sm px-2 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button onClick={() => handleRename(cs.id)} className="text-green-600 hover:text-green-700"><Check size={14} /></button>
                  <button onClick={() => setRenamingId(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
              ) : (
                <span className={`flex-1 text-sm font-semibold truncate ${cs.is_deprecated ? 'text-amber-800' : 'text-blue-800'}`}>{cs.name}</span>
              )}
              {cs.is_deprecated && (
                <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium shrink-0" title="The query set used to build this corpus no longer exists">
                  <AlertCircle size={10} />deprecated
                </span>
              )}
              <span className={`text-xs shrink-0 ${cs.is_deprecated ? 'text-amber-500' : 'text-blue-500'}`}>{setDocs.length} doc{setDocs.length !== 1 ? 's' : ''}</span>
              <button
                onClick={() => { setRenamingId(cs.id); setRenameValue(cs.name); }}
                className="p-1 text-blue-400 hover:text-blue-600 rounded"
                title="Rename"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => handleDeleteSet(cs.id, cs.name)}
                className="p-1 text-gray-300 hover:text-red-500 rounded"
                title="Delete set"
              >
                <Trash2 size={12} />
              </button>
              <button onClick={() => toggleSet(cs.id)} className="p-1 text-blue-400 hover:text-blue-600 rounded">
                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>

            {isExpanded && (
              <div className="divide-y divide-gray-100">
                {setDocs.length === 0 ? (
                  <p className="text-xs text-gray-400 italic px-4 py-3">No documents in this set.</p>
                ) : setDocs.map((doc) => (
                  <div key={doc.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{doc.title}</p>
                      {doc.source_url && (
                        <a href={doc.source_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline truncate block">
                          {doc.source_url}
                        </a>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{doc.snippet}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      <span className="text-xs text-gray-400">{doc.word_count.toLocaleString()} words</span>
                      <button onClick={() => handleDeleteDoc(doc.id)} className="text-gray-300 hover:text-red-500 transition-colors" title="Remove">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Unassigned documents */}
      {unassignedDocs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <span className="flex-1 text-sm font-semibold text-gray-600">Unassigned</span>
            <span className="text-xs text-gray-400">{unassignedDocs.length} doc{unassignedDocs.length !== 1 ? 's' : ''}</span>
            <button onClick={() => toggleSet('__unassigned__')} className="p-1 text-gray-400 hover:text-gray-600 rounded">
              {expandedSets.has('__unassigned__') ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
          {expandedSets.has('__unassigned__') && (
            <div className="divide-y divide-gray-100">
              {unassignedDocs.map((doc) => (
                <div key={doc.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{doc.title}</p>
                    {doc.source_url && (
                      <a href={doc.source_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline truncate block">
                        {doc.source_url}
                      </a>
                    )}
                    {doc.query_set_id && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded mt-0.5">
                        QS tagged
                      </span>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{doc.snippet}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <span className="text-xs text-gray-400">{doc.word_count.toLocaleString()} words</span>
                    <button onClick={() => handleDeleteDoc(doc.id)} className="text-gray-300 hover:text-red-500 transition-colors" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {docs.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400">
          <Database size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No documents in corpus yet.</p>
          <p className="text-xs mt-1">Use <strong>Build Corpus</strong> to discover and add articles.</p>
        </div>
      )}
    </div>
  );
}
