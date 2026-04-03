import { useState } from 'react';
import { RuleExtractor } from './RuleExtractor';
import { RuleSetManager } from './RuleSetManager';
import { useRuleExtraction } from '../../hooks/useRuleExtraction';

export function RuleTraining() {
  const { ruleSets, loadRuleSets } = useRuleExtraction();
  const [activeSection, setActiveSection] = useState<'extract' | 'manage'>('manage');

  const sections = [
    { id: 'extract' as const, label: 'Extract Rules' },
    { id: 'manage' as const, label: 'Rule Set Manager' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {sections.map((s) => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === s.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className={activeSection !== 'extract' ? 'hidden' : ''}><RuleExtractor onRuleSetSaved={loadRuleSets} /></div>
      <div className={activeSection !== 'manage' ? 'hidden' : ''}><RuleSetManager ruleSets={ruleSets} loadRuleSets={loadRuleSets} /></div>
    </div>
  );
}
