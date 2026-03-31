import { useState } from 'react';

export interface Config {
  baseModel: string;
  teacherModel: string;
  ruleSetId: string;
  lr: string;
  epochs: string;
  batchSize: string;
  groupSize: string;
  clipEpsilon: string;
  klBeta: string;
}

interface Props {
  ruleSets: Array<{ id: string; name: string }>;
  onExport: (config: Config) => void;
  exporting: boolean;
}

export function MiniTrainingConfig({ ruleSets, onExport, exporting }: Props) {
  const [config, setConfig] = useState<Config>({
    baseModel: 'Qwen/Qwen3-1.7B',
    teacherModel: 'gemini-2.5-flash',
    ruleSetId: '',
    lr: '2e-5',
    epochs: '3',
    batchSize: '4',
    groupSize: '4',
    clipEpsilon: '0.2',
    klBeta: '0.04',
  });

  const set = (k: keyof Config, v: string) => setConfig((c) => ({ ...c, [k]: v }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          AutoGEOMini requires 2&times; A100 GPUs. Training: ~4h (SFT) + ~48h (GRPO).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Base Model', key: 'baseModel' as const },
          { label: 'Teacher Model', key: 'teacherModel' as const },
        ].map(({ label, key }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            <input value={config[key]} onChange={(e) => set(key, e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Rule Set</label>
          <select value={config.ruleSetId} onChange={(e) => set('ruleSetId', e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Select a rule set...</option>
            {ruleSets.map((rs) => <option key={rs.id} value={rs.id}>{rs.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Cold Start (SFT)</p>
        <div className="grid grid-cols-3 gap-2">
          {(['lr', 'epochs', 'batchSize'] as const).map((k) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-1 capitalize">{k === 'batchSize' ? 'Batch' : k}</label>
              <input value={config[k]} onChange={(e) => set(k, e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">GRPO</p>
        <div className="grid grid-cols-3 gap-2">
          {(['groupSize', 'clipEpsilon', 'klBeta'] as const).map((k) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-1">{k === 'groupSize' ? 'Group' : k === 'clipEpsilon' ? 'Clip \u03b5' : 'KL \u03b2'}</label>
              <input value={config[k]} onChange={(e) => set(k, e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => onExport(config)} disabled={exporting || !config.ruleSetId}
        className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
        {exporting ? 'Exporting...' : 'Export Training Package'}
      </button>

      <div className="text-xs text-gray-400">
        Exports ZIP: finetune.json, rule_set.json, config_cold_start.yaml, config_grpo.yaml, README_training.md
      </div>
    </div>
  );
}
