import { useState } from 'react';
import { WritingAssistant } from './WritingAssistant/WritingAssistant';
import { TrendDiscovery } from './TrendDiscovery/TrendDiscovery';
import { RuleTraining } from './RuleTraining/RuleTraining';
import { Settings } from './Settings/Settings';
import { ToastContainer } from './shared/Toast';
import type { Tab } from '../types';

const TABS: { id: Tab; label: string }[] = [
  { id: 'writing', label: 'Writing Assistant' },
  { id: 'trends', label: 'Trends' },
  { id: 'rules', label: 'Rules & Training' },
  { id: 'settings', label: 'Settings' },
];

export function Layout() {
  const [activeTab, setActiveTab] = useState<Tab>('writing');
  const [trendKeywords, setTrendKeywords] = useState<string[]>([]);

  const handleSendKeywords = (keywords: string[]) => {
    setTrendKeywords(keywords);
    setActiveTab('writing');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-8">
            <div className="py-3 shrink-0">
              <h1 className="text-base font-bold text-gray-900">CareYaya GEO Assistant</h1>
              <p className="text-xs text-gray-400">Powered by AutoGEO &middot; ICLR 2026</p>
            </div>
            <nav className="flex">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-5 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'writing' && trendKeywords.length > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs bg-green-500 text-white rounded-full">
                      {trendKeywords.length}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'writing' && (
          <WritingAssistant
            injectedKeywords={trendKeywords}
            onClearKeywords={() => setTrendKeywords([])}
          />
        )}
        {activeTab === 'trends' && <TrendDiscovery onSendKeywords={handleSendKeywords} />}
        {activeTab === 'rules' && <RuleTraining />}
        {activeTab === 'settings' && <Settings />}
      </main>

      <ToastContainer />
    </div>
  );
}
