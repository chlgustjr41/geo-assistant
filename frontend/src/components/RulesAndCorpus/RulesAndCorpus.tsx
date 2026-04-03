import { useState } from 'react';
import { QuerySetManager } from './QuerySetManager';
import { BuildCorpus } from './BuildCorpus';
import { ExtractRules } from './ExtractRules';
import { RuleSetManager } from '../RuleTraining/RuleSetManager';
import { CorpusLibrary } from '../Corpus/CorpusLibrary';
import { RulesCorpusProvider, useRulesCorpusContext } from '../../contexts/RulesCorpusContext';

type Subtab = 'query-sets' | 'build-corpus' | 'extract-rules' | 'rule-sets' | 'corpus-library';

const SUBTABS: { id: Subtab; label: string }[] = [
  { id: 'query-sets',     label: 'Query Sets' },
  { id: 'build-corpus',   label: 'Build Corpus' },
  { id: 'extract-rules',  label: 'Extract Rules' },
  { id: 'rule-sets',      label: 'Rule Sets' },
  { id: 'corpus-library', label: 'Corpus Library' },
];

function RulesAndCorpusInner() {
  const [subtab, setSubtab] = useState<Subtab>('query-sets');
  const { ruleSets, reloadRuleSets } = useRulesCorpusContext();

  return (
    <div className="space-y-4">
      {/* Subtab nav */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-0">
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
