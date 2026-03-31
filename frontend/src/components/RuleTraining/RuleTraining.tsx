import { useState } from 'react';
import { RuleExtractor } from './RuleExtractor';
import { RuleSetManager } from './RuleSetManager';
import { MiniTrainingConfig } from './MiniTrainingConfig';
import type { Config as TrainingConfig } from './MiniTrainingConfig';
import { useRuleExtraction } from '../../hooks/useRuleExtraction';
import { rulesApi } from '../../services/api';
import { toast } from '../shared/Toast';

export function RuleTraining() {
  const { ruleSets } = useRuleExtraction();
  const [exporting, setExporting] = useState(false);
  const [activeSection, setActiveSection] = useState<'extract' | 'manage' | 'train'>('manage');

  const handleExportTraining = async (config: TrainingConfig) => {
    if (!config.ruleSetId) { toast('error', 'Select a rule set first'); return; }
    setExporting(true);
    try {
      const blob = await rulesApi.exportTrainingPackage({
        rule_set_id: config.ruleSetId,
        base_model: config.baseModel,
        teacher_model: config.teacherModel,
        cold_start_config: { lr: parseFloat(config.lr), epochs: parseInt(config.epochs), batch_size: parseInt(config.batchSize) },
        grpo_config: { group_size: parseInt(config.groupSize), clip_epsilon: parseFloat(config.clipEpsilon), kl_beta: parseFloat(config.klBeta) },
      }) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'autogeo-mini-training.zip'; a.click();
      URL.revokeObjectURL(url);
      toast('success', 'Training package downloaded');
    } catch {
      toast('error', 'Export failed \u2014 Phase 5 not yet implemented');
    } finally {
      setExporting(false);
    }
  };

  const sections = [
    { id: 'extract' as const, label: 'Extract Rules' },
    { id: 'manage' as const, label: 'Rule Set Manager' },
    { id: 'train' as const, label: 'AutoGEOMini Training' },
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

      {activeSection === 'extract' && <RuleExtractor />}
      {activeSection === 'manage' && <RuleSetManager />}
      {activeSection === 'train' && (
        <MiniTrainingConfig ruleSets={ruleSets} onExport={handleExportTraining} exporting={exporting} />
      )}
    </div>
  );
}
