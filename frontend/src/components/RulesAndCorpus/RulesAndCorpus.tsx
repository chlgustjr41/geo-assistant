import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { QuerySetManager } from './QuerySetManager';
import { BuildCorpus } from './BuildCorpus';
import { ExtractRules } from './ExtractRules';
import { RuleSetManager } from '../RuleTraining/RuleSetManager';
import { CorpusLibrary } from '../Corpus/CorpusLibrary';
import { RulesCorpusProvider, useRulesCorpusContext } from '../../contexts/RulesCorpusContext';
import { settingsApi } from '../../services/api';
import { toast } from '../shared/Toast';
import { LoadingSpinner } from '../shared/LoadingSpinner';

type Subtab = 'query-sets' | 'build-corpus' | 'extract-rules' | 'rule-sets' | 'corpus-library';

const SUBTABS: { id: Subtab; label: string }[] = [
  { id: 'query-sets',     label: 'Query Sets' },
  { id: 'build-corpus',   label: 'Build Corpus' },
  { id: 'extract-rules',  label: 'Extract Rules' },
  { id: 'rule-sets',      label: 'Rule Sets' },
  { id: 'corpus-library', label: 'Corpus Library' },
];

// localStorage keys related to Rules & Corpus tab
const RULES_CORPUS_STORAGE_KEYS = [
  'geo_extractor_topic',
  'geo_extractor_queries',
  'geo_extractor_name',
  'geo_extractor_models',
  'geo_extractor_results',
  'geo_extractor_use_corpus',
];

function RulesAndCorpusInner() {
  const [subtab, setSubtab] = useState<Subtab>('query-sets');
  const [purging, setPurging] = useState(false);
  const { ruleSets, reloadRuleSets, reloadQuerySets, reloadCorpusSets } = useRulesCorpusContext();

  const handlePurgeAll = async () => {
    if (!confirm(
      'Delete ALL Rules & Corpus data?\n\n' +
      'This permanently removes all query sets, corpus sets, corpus documents, ' +
      'and extracted rule sets (built-in rule sets are preserved).\n\n' +
      'Article history and settings will not be affected.'
    )) return;
    setPurging(true);
    try {
      await settingsApi.resetRulesCorpus();
      RULES_CORPUS_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
      reloadRuleSets();
      reloadQuerySets();
      reloadCorpusSets();
      toast('success', 'All Rules & Corpus data deleted');
    } catch {
      toast('error', 'Failed to reset');
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Subtab nav */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 pb-0">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubtab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              subtab === t.id
                ? 'bg-white border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={handlePurgeAll}
          disabled={purging}
          className="flex items-center gap-1.5 px-3 py-1.5 mb-1 text-xs font-medium text-gray-400 border border-gray-200 rounded-lg hover:text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-50 transition-colors"
          title="Delete all query sets, corpus, and extracted rule sets. History and settings preserved."
        >
          {purging ? <LoadingSpinner size="sm" /> : <Trash2 size={12} />}
          Reset All Data
        </button>
      </div>

      <div className={subtab !== 'query-sets' ? 'hidden' : ''}>
        <QuerySetManager />
      </div>
      <div className={subtab !== 'build-corpus' ? 'hidden' : ''}>
        <BuildCorpus />
      </div>
      <div className={subtab !== 'extract-rules' ? 'hidden' : ''}>
        <ExtractRules onRuleSetSaved={reloadRuleSets} />
      </div>
      <div className={subtab !== 'rule-sets' ? 'hidden' : ''}>
        <RuleSetManager ruleSets={ruleSets} loadRuleSets={reloadRuleSets} />
      </div>
      <div className={subtab !== 'corpus-library' ? 'hidden' : ''}>
        <CorpusLibrary />
      </div>
    </div>
  );
}

export function RulesAndCorpus() {
  return (
    <RulesCorpusProvider>
      <RulesAndCorpusInner />
    </RulesCorpusProvider>
  );
}
