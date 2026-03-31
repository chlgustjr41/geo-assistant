// Phase 5 implementation
import { useState } from 'react';
import { rulesApi } from '../services/api';
import type { RuleSet } from '../types';
import { toast } from '../components/shared/Toast';

export function useRuleExtraction() {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRuleSets = async () => {
    try {
      setRuleSets(await rulesApi.list());
    } catch {
      toast('error', 'Failed to load rule sets');
    }
  };

  return { ruleSets, loading, setLoading, loadRuleSets };
}
